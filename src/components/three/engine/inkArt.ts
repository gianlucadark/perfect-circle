/**
 * Primitive black & grey "realistiche" per i pezzi grandi (Il gigante, la Custode):
 * rose a petali sfumati, peonie, foglie, serpente a scaglie con volume, piume, sfera lucida, fumo.
 * Lavorano in metri sul canvas della carta (y verso l'alto). Bianco = inchiostro pieno, grigi = sfumature.
 * Ogni forma prima "pulisce" la pelle sotto di sé (erase), così si può disegnare sopra un fondo nero
 * e i fiori restano in negativo, come nei riempimenti neri veri.
 */
import { erase, ink } from "./statueTattoos";
import { dot, type Ctx, type Rng } from "./tattoo";
import { canBlur, grey, softDisk, spline, type Curve, type Pt } from "./torsoTattoos";

const TAU = Math.PI * 2;

/**
 * Peso dei contorni di petali e foglie (1 = disegno, ~0.3 = realismo: la forma la danno ombre e luci).
 * Si imposta per un disegno intero con withLine.
 */
let LINE = 1;
export function withLine<T>(k: number, draw: () => T): T {
  const prev = LINE;
  LINE = k;
  try {
    return draw();
  } finally {
    LINE = prev;
  }
}

/** frame locale: (u lungo la direzione a, v a sinistra) */
const frame = (x: number, y: number, a: number) => {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return (u: number, v: number): Pt => [x + ca * u - sa * v, y + sa * u + ca * v];
};

function pathOf(c: Ctx, pts: Pt[], close = true) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
}

/** riempie il percorso corrente con un gradiente radiale di grigi (stop: [t, alpha]) */
function radialFill(c: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, number][]) {
  const g = c.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(r0 + 1e-5, r1));
  for (const [t, a] of stops) g.addColorStop(t, grey(a));
  c.fillStyle = g;
  c.fill();
  ink(c);
}

function linearFill(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, number][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [t, a] of stops) g.addColorStop(t, grey(a));
  c.fillStyle = g;
  c.fill();
  ink(c);
}

/** tratto morbido (sfocato) lungo una polilinea: luce (erase) o ombra (ink) */
function softStroke(c: Ctx, pts: Pt[], width: number, alpha: number, light: boolean) {
  const col = (a: number) => (light ? `rgba(0,0,0,${a.toFixed(3)})` : grey(a));
  c.save();
  const m = c.getTransform();
  const px = width * Math.hypot(m.a, m.b);
  // il filtro ha un costo fisso per chiamata: lo si usa solo per le ombre larghe;
  // i tratti piccoli (bordi dei petali, riflessi) si sfumano con passate sovrapposte
  if (px > 28 && canBlur()) {
    c.filter = `blur(${Math.min(px * 0.35, 48).toFixed(1)}px)`;
    c.strokeStyle = col(alpha);
    c.lineWidth = width * 0.55;
    pathOf(c, pts, false);
    c.stroke();
  } else {
    // tratti sovrapposti sempre più stretti
    const passes = px > 28 ? 8 : 4;
    c.strokeStyle = col(1 - Math.pow(1 - alpha, 1 / passes));
    for (let i = 0; i < passes; i++) {
      c.lineWidth = width * (1 - (i / passes) * 0.9);
      pathOf(c, pts, false);
      c.stroke();
    }
  }
  c.restore();
  ink(c);
}

// ------------------------------------------------------------------ rosa
/**
 * Petalo a coppa (centrato nell'origine): bordo esterno ondulato, base verso il cuore.
 * Nero profondo alla base, luce sul bordo arrotolato, un lato in ombra, due pieghe.
 */
function rosePetal(c: Ctx, rng: Rng, a: number, r: number, h: number, depth: number, lw: number, dark: number) {
  const P = (ang: number, rr: number): Pt => [Math.cos(a + ang) * rr, Math.sin(a + ang) * rr];
  const rim: Pt[] = [];
  const wob = rng() * 6;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = -h + 2 * h * t;
    const rr = r * (0.84 + 0.17 * Math.pow(Math.sin(Math.PI * t), 0.7) + 0.03 * Math.sin(t * 11 + wob));
    rim.push(P(ang, rr));
  }
  const base = P(0, r * (1 - depth));
  const path = () => {
    c.beginPath();
    c.moveTo(...rim[0]);
    rim.slice(1).forEach((p) => c.lineTo(...p));
    c.quadraticCurveTo(...P(h * 0.6, r * (1 - depth * 0.5)), ...base);
    c.quadraticCurveTo(...P(-h * 0.6, r * (1 - depth * 0.5)), ...rim[0]);
    c.closePath();
  };
  path();
  erase(c);
  c.fill();
  ink(c);
  c.save();
  path();
  c.clip();
  path();
  const real = LINE < 0.6;
  radialFill(
    c,
    0,
    0,
    r * (1 - depth),
    r * 1.01,
    real
      ? [
          [0, 1],
          [0.42, 0.9],
          [0.66, 0.42],
          [0.86, 0.1],
          [1, 0.18],
        ]
      : [
          [0, dark],
          [0.42, dark * 0.86],
          [0.78, dark * 0.36],
          [1, 0.05],
        ],
  );
  // il lato lontano dalla luce (in alto a sinistra) resta più scuro
  const side = Math.sin(a - 2.4) > 0 ? 1 : -1;
  c.beginPath();
  c.moveTo(...base);
  rim.slice(side > 0 ? 10 : 0, side > 0 ? 21 : 11).forEach((p) => c.lineTo(...p));
  c.closePath();
  if (!real) {
    c.fillStyle = grey(0.26);
    c.fill();
  }
  ink(c);
  // bordo arrotolato: lama di luce appena dentro il contorno, con l'ombra della piega subito sotto
  if (real) {
    // luce larga sul bordo arrotolato, appena una velatura dove il petalo si piega
    softStroke(c, rim.map(([px, py]) => [px * 0.93, py * 0.93] as Pt), lw * 5, 0.9, true);
    softStroke(c, rim.map(([px, py]) => [px * 0.8, py * 0.8] as Pt), lw * 3, 0.35, false);
  } else {
    softStroke(c, rim.map(([px, py]) => [px * 0.95, py * 0.95] as Pt), lw * 3.6, 0.95, true);
    softStroke(c, rim.map(([px, py]) => [px * 0.86, py * 0.86] as Pt), lw * 2.2, 0.45, false);
  }
  c.restore();
  ink(c);
  c.lineWidth = lw * 0.8 * LINE;
  path();
  c.stroke();
  c.lineWidth = lw * 0.42 * Math.sqrt(LINE);
  for (const k of [-0.45, 0.35]) {
    const kk = k + (rng() - 0.5) * 0.2;
    c.beginPath();
    c.moveTo(...P(kk * h * 0.6, r * (1 - depth * 0.75)));
    c.quadraticCurveTo(...P(kk * h * 0.9, r * 0.74), ...P(kk * h, r * (0.8 + rng() * 0.06)));
    c.stroke();
  }
}

export interface RoseOpts {
  /** alone scuro dietro il fiore (0 = niente: es. dentro un riempimento nero) */
  halo?: number;
  /** schiacciamento verticale: rosa vista di tre quarti */
  tilt?: number;
  /** inclinazione dell'asse di schiacciamento */
  rot?: number;
  dark?: number;
}

/**
 * Rosa black & grey vista dall'alto o di tre quarti: cinque giri di petali che si sovrappongono;
 * sotto ogni giro un'ombra profonda, così tra un petalo e l'altro resta il nero. Cuore a spirale.
 */
export function rose(c: Ctx, rng: Rng, x: number, y: number, R: number, lw: number, o: RoseOpts = {}) {
  const halo = o.halo ?? 0.8;
  if (halo > 0) softDisk(c, x, y - R * 0.08, R * 0.8, R * 1.65, halo);
  c.save();
  c.translate(x, y);
  c.rotate(o.rot ?? 0);
  c.scale(1, o.tilt ?? 1);
  const dark = o.dark ?? 0.97;
  const spin = rng() * TAU;
  const rings = [
    { n: 5, r: 1.0, h: 1.12, d: 0.52 },
    { n: 5, r: 0.82, h: 1.08, d: 0.5 },
    { n: 4, r: 0.64, h: 1.12, d: 0.48 },
    { n: 4, r: 0.48, h: 1.15, d: 0.46 },
    { n: 3, r: 0.34, h: 1.2, d: 0.44 },
  ];
  rings.forEach((ring, k) => {
    // ombra sotto il giro: il nero tra i petali
    softDisk(c, 0, 0, R * ring.r * 0.62, R * ring.r * 0.98, k ? 0.9 : 0.75);
    for (let i = 0; i < ring.n; i++) {
      const a = spin + ((i + k * 0.5) / ring.n) * TAU + k * 0.55 + (rng() - 0.5) * 0.3;
      rosePetal(c, rng, a, R * ring.r * (0.93 + rng() * 0.1), (Math.PI / ring.n) * ring.h, ring.d, lw * (1 - k * 0.08), dark);
    }
  });
  // cuore: petali avvolti a spirale, quasi neri, con un filo di luce
  const rc = R * 0.2;
  dot(c, 0, 0, rc);
  const spiral: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const ang = spin + t * TAU * 1.6;
    const rr = rc * (0.12 + 0.82 * t);
    spiral.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
  }
  if (LINE < 0.6) {
    // realismo: il cuore è un bocciolo chiuso, scuro, con un filo di luce appena accennato
    dot(c, 0, 0, rc * 1.15);
    softStroke(c, spiral.slice(22), lw * 2, 0.28, true);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = lw * 0.35;
    pathOf(c, spiral.slice(24), false);
    c.stroke();
    ink(c);
  } else {
    softStroke(c, spiral, lw * 2.4, 0.7, true);
    erase(c);
    c.lineWidth = lw * 0.5;
    pathOf(c, spiral, false);
    c.stroke();
    ink(c);
  }
  c.restore();
  ink(c);
}

// ------------------------------------------------------------------ foglie
/** foglia di rosa seghettata: metà in ombra, nervature in negativo, punta che si piega */
export function leafShaded(c: Ctx, rng: Rng, x: number, y: number, a: number, len: number, wid: number, lw: number, flip: 1 | -1 = 1) {
  const P = frame(x, y, a);
  const n = 26;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.75) * (1 - t * 0.25);
    const sawK = LINE < 0.6 ? 0.04 : 0.09;
    const saw = i % 2 && t > 0.08 && t < 0.92 ? 1 + sawK * 1.33 : 1 - sawK * 0.67;
    const bend = Math.sin(t * Math.PI) * wid * 0.25 * flip;
    left.push(P(len * t, w * saw + bend));
    right.push(P(len * t, -w * (i % 2 ? 1 - sawK * 0.67 : 1 + sawK * 1.33) * (t > 0.08 && t < 0.92 ? 1 : 0.94) + bend));
  }
  const outline = [...left, ...right.reverse()];
  pathOf(c, outline);
  erase(c);
  c.fill();
  c.save();
  pathOf(c, outline);
  c.clip();
  const mid = (t: number) => P(len * t, Math.sin(t * Math.PI) * wid * 0.25 * flip);
  if (LINE < 0.6) {
    pathOf(c, outline);
    const [l0x, l0y] = P(len * 0.45, wid * 1.2 + wid * 0.25 * flip);
    const [r0x, r0y] = P(len * 0.6, -wid * 1.2 + wid * 0.25 * flip);
    linearFill(c, l0x, l0y, r0x, r0y, [
      [0, 1],
      [0.42, 0.88],
      [0.55, 0.62],
      [1, 0.3],
    ]);
    // scurisce verso il picciolo, schiarisce verso la punta
    pathOf(c, outline);
    const [p0x, p0y] = P(0, 0);
    const [p1x, p1y] = P(len, 0);
    linearFill(c, p0x, p0y, p1x, p1y, [
      [0, 0.45],
      [0.5, 0],
      [1, 0],
    ]);
    const vein: Pt[] = [];
    for (let i = 1; i < n; i++) vein.push(mid(i / n));
    softStroke(c, vein, lw * 2.2, 0.55, true);
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.lineWidth = lw * 0.3;
    for (let k = 1; k <= 5; k++) {
      const t = k / 6.2;
      for (const s of [1, -1]) {
        const [mx, my] = mid(t);
        const [ex, ey] = P(len * (t + 0.12), (wid * 0.75 * s + wid * 0.25 * flip) * Math.sin(Math.PI * Math.min(1, t + 0.12)));
        c.beginPath();
        c.moveTo(mx, my);
        c.quadraticCurveTo((mx + ex) / 2, (my + ey) / 2, ex, ey);
        c.stroke();
      }
    }
    ink(c);
    c.restore();
    ink(c);
    c.lineWidth = lw * LINE;
    pathOf(c, outline);
    c.stroke();
    return;
  }
  // metà in ombra (scura verso la nervatura), metà a mezzatinta
  const shade: Pt[] = [];
  for (let i = 0; i <= n; i++) shade.push(mid(i / n));
  for (let i = n; i >= 0; i--) shade.push(left[i]);
  pathOf(c, shade);
  const [ax, ay] = mid(0.5);
  const [bx, by] = P(len * 0.5, wid * 1.1 + wid * 0.25 * flip);
  const real = LINE < 0.6;
  linearFill(c, ax, ay, bx, by, real ? [[0, 1], [0.55, 0.9], [1, 0.62]] : [
    [0, 0.95],
    [0.55, 0.72],
    [1, 0.35],
  ]);
  // `right` è già invertito (punta → base) dalla costruzione del contorno
  pathOf(c, [...[...Array(n + 1)].map((_, i) => mid(i / n)), ...right]);
  const [cx2, cy2] = P(len * 0.5, -wid * 1.1 + wid * 0.25 * flip);
  linearFill(c, ax, ay, cx2, cy2, real ? [[0, 0.82], [1, 0.4]] : [
    [0, 0.55],
    [1, 0.12],
  ]);
  // nervature
  erase(c);
  c.lineWidth = lw * 0.9;
  pathOf(c, shade.slice(0, n + 1), false);
  c.stroke();
  c.lineWidth = lw * 0.5;
  for (let k = 1; k <= 5; k++) {
    const t = k / 6.2;
    for (const s of [1, -1]) {
      const [mx, my] = mid(t);
      const [ex, ey] = P(len * (t + 0.12), (wid * 0.8 * s + wid * 0.25 * flip) * Math.sin(Math.PI * Math.min(1, t + 0.12)));
      c.beginPath();
      c.moveTo(mx, my);
      c.quadraticCurveTo((mx + ex) / 2 + (rng() - 0.5) * wid * 0.1, (my + ey) / 2, ex, ey);
      c.stroke();
    }
  }
  ink(c);
  c.restore();
  ink(c);
  c.lineWidth = lw * LINE;
  pathOf(c, outline);
  c.stroke();
}

// ------------------------------------------------------------------ peonia piena
/** petalo largo di peonia, ondulato, con ombra al cuore e pieghe fitte */
function peonyPetal(c: Ctx, rng: Rng, x: number, y: number, a: number, len: number, wid: number, lw: number, dark: number) {
  const P = frame(x, y, a);
  const rim: Pt[] = [];
  const m = 22;
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const v = (t - 0.5) * 2;
    const u = len * (0.88 + 0.12 * Math.cos(v * 1.4) + 0.04 * Math.sin(t * 17 + a * 5) * (1 - Math.abs(v)));
    rim.push(P(u, v * wid * (0.95 - 0.2 * Math.abs(v))));
  }
  const path = () => {
    c.beginPath();
    c.moveTo(...P(len * 0.08, -wid * 0.2));
    c.bezierCurveTo(...P(len * 0.4, -wid * 1.05), ...P(len * 0.7, -wid * 0.95), ...rim[0]);
    rim.slice(1).forEach((p) => c.lineTo(...p));
    c.bezierCurveTo(...P(len * 0.7, wid * 0.95), ...P(len * 0.4, wid * 1.05), ...P(len * 0.08, wid * 0.2));
    c.closePath();
  };
  path();
  erase(c);
  c.fill();
  c.save();
  path();
  c.clip();
  path();
  const real = LINE < 0.6;
  radialFill(
    c,
    x,
    y,
    len * 0.25,
    len * 1.02,
    real
      ? [
          [0, 1],
          [0.45, 0.82],
          [0.7, 0.36],
          [0.9, 0.08],
          [1, 0.15],
        ]
      : [
          [0, dark],
          [0.5, dark * 0.55],
          [0.85, 0.12],
          [1, 0.03],
        ],
  );
  softStroke(c, rim.map(([px, py]) => [px + (x - px) * 0.05, py + (y - py) * 0.05] as Pt), lw * (real ? 2.4 : 3), real ? 1 : 0.8, true);
  c.restore();
  ink(c);
  c.lineWidth = lw * LINE;
  path();
  c.stroke();
  c.lineWidth = lw * 0.42 * Math.sqrt(LINE);
  for (let k = 0; k < 4; k++) {
    const v = (k / 3 - 0.5) * 1.3 + (rng() - 0.5) * 0.15;
    c.beginPath();
    c.moveTo(...P(len * 0.45, wid * v * 0.5));
    c.quadraticCurveTo(...P(len * 0.7, wid * v * 0.85), ...P(len * (0.84 + rng() * 0.08), wid * v * 0.9));
    c.stroke();
  }
}

/** peonia piena black & grey, vista di tre quarti */
export function peonyFull(c: Ctx, rng: Rng, x: number, y: number, R: number, lw: number, o: RoseOpts = {}) {
  const halo = o.halo ?? 0.8;
  if (halo > 0) softDisk(c, x, y - R * 0.06, R * 0.95, R * 1.7, halo);
  c.save();
  c.translate(x, y);
  c.rotate(o.rot ?? 0);
  c.scale(1, o.tilt ?? 1);
  const dark = o.dark ?? 0.95;
  const spin = rng() * TAU;
  const rings = [
    { n: 7, r: 1, w: 0.5 },
    { n: 6, r: 0.82, w: 0.5 },
    { n: 6, r: 0.64, w: 0.48 },
    { n: 5, r: 0.46, w: 0.5 },
    { n: 4, r: 0.3, w: 0.55 },
  ];
  rings.forEach((ring, k) => {
    softDisk(c, 0, 0, R * ring.r * 0.55, R * ring.r * 0.95, k ? 0.88 : 0.7);
    for (let i = 0; i < ring.n; i++) {
      const a = spin + ((i + k * 0.5) / ring.n) * TAU + (rng() - 0.5) * 0.35;
      const len = R * ring.r * (0.9 + rng() * 0.15);
      peonyPetal(c, rng, 0, 0, a, len, len * ring.w, lw * (1 - k * 0.07), dark);
    }
  });
  dot(c, 0, 0, R * 0.11);
  erase(c);
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * R * 0.09;
    dot(c, Math.cos(a) * r, Math.sin(a) * r, lw * 0.6);
  }
  ink(c);
  c.restore();
  ink(c);
}

// ------------------------------------------------------------------ serpente
export interface SnakeOpts {
  /** larghezza massima del corpo */
  W: number;
  lw: number;
  /** spostamenti orizzontali in cui ridisegnare (cuciture di una carta a giro completo) */
  shifts?: number[];
  /** la testa guarda a sinistra (+1) o a destra (-1) della direzione di marcia */
  tongue?: boolean;
}

/**
 * Serpente black & grey: corpo cilindrico (bordi scuri, riflesso lungo il dorso), scaglie a squame
 * sovrapposte, macchie romboidali sul dorso, ombra portata sulla pelle, testa con placche e occhio.
 * `ctrl` va dalla coda alla testa.
 */
export function snake(c: Ctx, rng: Rng, ctrl: Pt[], o: SnakeOpts) {
  const cv = spline(ctrl);
  const { W, lw } = o;
  const width = (f: number) => {
    if (f < 0.4) return W * (0.06 + 0.94 * Math.sin((f / 0.4) * (Math.PI / 2)));
    if (f > 0.93) return W * (1 - ((f - 0.93) / 0.07) * 0.22);
    return W;
  };
  const N = Math.max(40, Math.ceil(cv.L / (W * 0.08)));
  const L: Pt[] = [];
  const Rr: Pt[] = [];
  const mid: { x: number; y: number; nx: number; ny: number; tx: number; ty: number; w: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const p = cv.at(f * cv.L);
    const w = width(f) / 2;
    mid.push({ ...p, w });
    L.push([p.x + p.nx * w, p.y + p.ny * w]);
    Rr.push([p.x - p.nx * w, p.y - p.ny * w]);
  }
  const body = [...L, ...[...Rr].reverse()];
  const end = cv.at(cv.L);
  // testa di vipera: larga dietro gli occhi, muso arrotondato, vista dall'alto
  const HL = W * 1.55;
  const hw = W * 0.68;
  const HP = (f: number, g: number): Pt => [end.x + end.tx * f + end.nx * g, end.y + end.ty * f + end.ny * g];
  const prof = (t: number) => {
    // semilarghezza lungo la testa (t = 0 collo, 1 punta del muso)
    const neck = width(1) / 2;
    if (t < 0.38) return neck + (hw - neck) * Math.sin((t / 0.38) * (Math.PI / 2));
    return hw * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.38) / 0.62, 2.4)));
  };
  const headPts: Pt[] = [];
  for (let i = 0; i <= 24; i++) headPts.push(HP(-W * 0.05 + HL * (i / 24), prof(i / 24)));
  for (let i = 24; i >= 0; i--) headPts.push(HP(-W * 0.05 + HL * (i / 24), -prof(i / 24)));
  const headPath = () => pathOf(c, headPts);

  for (const dx of o.shifts ?? [0]) {
    c.save();
    c.translate(dx, 0);
    // ombra portata sulla pelle, un poco sotto il corpo
    softStroke(c, mid.map((m) => [m.x, m.y - W * 0.14] as Pt), W * 1.7, 0.55, false);
    // corpo: fondo scuro; le squame sono "ciottoli" più chiari, le fughe tra loro restano nere
    pathOf(c, body);
    erase(c);
    c.fill();
    ink(c);
    c.save();
    pathOf(c, body);
    c.clip();
    pathOf(c, body);
    c.fillStyle = grey(0.93);
    c.fill();
    ink(c);
    const step = W * 1.05;
    const ds = W * 0.135;
    const n = 6;
    let row = 0;
    const LEVELS = 8;
    const buckets: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D());
    for (let s = ds * 0.5; s < cv.L; s += ds, row++) {
      const p = cv.at(s);
      const f = s / cv.L;
      const w = width(f) / 2;
      const ang = Math.atan2(p.ty, p.tx);
      // fase della macchia romboidale sul dorso
      const ph = Math.abs(((s / step) % 1) * 2 - 1);
      for (let k = -n; k <= n; k++) {
        const t = (k + (row % 2) * 0.5) / n;
        if (Math.abs(t) > 0.97) continue;
        const inBlot = Math.abs(t) < 0.62 * (1 - ph) && f > 0.12 && f < 0.95;
        // luce dall'alto: il lato +normale del cilindro è più chiaro
        const lit = Math.max(0, 1 - Math.pow(Math.abs(t - 0.18), 1.6)) * (inBlot ? 0.22 : 1);
        const cx = p.x + p.nx * w * t;
        const cy = p.y + p.ny * w * t;
        // sul bordo le squame si accorciano: il cilindro gira
        const ry = (w / n) * 0.5 * Math.sqrt(1 - t * t);
        const b = buckets[Math.min(LEVELS - 1, Math.round(lit * (LEVELS - 1)))];
        b.moveTo(cx + Math.cos(ang) * ds * 0.46, cy + Math.sin(ang) * ds * 0.46);
        b.ellipse(cx, cy, ds * 0.46, Math.max(ry, w * 0.012), ang, 0, TAU);
      }
    }
    buckets.forEach((b, i) => {
      c.fillStyle = `rgba(0,0,0,${(0.2 + (0.62 * i) / (LEVELS - 1)).toFixed(3)})`;
      c.fill(b);
    });
    ink(c);
    // bordi in ombra (volume cilindrico) e riflesso lungo il dorso
    softStroke(c, L, W * 0.5, 0.85, false);
    softStroke(c, Rr, W * 0.5, 0.9, false);
    softStroke(c, mid.map((m) => [m.x + m.nx * m.w * 0.25, m.y + m.ny * m.w * 0.25] as Pt), W * 0.22, 0.55, true);
    c.restore();
    ink(c);
    // contorno del corpo
    c.lineWidth = lw * 1.2;
    pathOf(c, L, false);
    c.stroke();
    pathOf(c, Rr, false);
    c.stroke();

    // testa
    headPath();
    erase(c);
    c.fill();
    ink(c);
    c.save();
    headPath();
    c.clip();
    headPath();
    c.fillStyle = grey(0.92);
    c.fill();
    ink(c);
    // squame minute del capo
    const hb: Path2D[] = Array.from({ length: 6 }, () => new Path2D());
    for (let i = 0; i < 22; i++) {
      for (let k = -5; k <= 5; k++) {
        const f = (i + 0.5) / 22;
        const t = (k + (i % 2) * 0.5) / 5.5;
        const g = prof(f) * t;
        if (Math.abs(t) > 0.95) continue;
        const lit = Math.max(0, 1 - Math.pow(Math.abs(t - 0.15), 1.5));
        const [sx, sy] = HP(-W * 0.05 + HL * f, g);
        const a = Math.atan2(end.ty, end.tx);
        const b = hb[Math.min(5, Math.round(lit * 5))];
        b.moveTo(sx + Math.cos(a) * HL * 0.02, sy + Math.sin(a) * HL * 0.02);
        b.ellipse(sx, sy, HL * 0.02, prof(f) * 0.07 * Math.sqrt(1 - t * t) + W * 0.004, a, 0, TAU);
      }
    }
    hb.forEach((b, i) => {
      c.fillStyle = `rgba(0,0,0,${(0.18 + (0.6 * i) / 5).toFixed(3)})`;
      c.fill(b);
    });
    ink(c);
    softStroke(c, headPts.slice(0, 25), W * 0.4, 0.85, false);
    softStroke(c, headPts.slice(25), W * 0.4, 0.9, false);
    softStroke(c, [HP(W * 0.1, hw * 0.12), HP(HL * 0.6, hw * 0.1), HP(HL * 0.92, 0)], W * 0.2, 0.55, true);
    c.restore();
    ink(c);
    c.lineWidth = lw * 1.1;
    headPath();
    c.stroke();
    // occhi sporgenti ai lati, pupilla a fessura e lucentezza
    for (const g of [1, -1]) {
      const [ex, ey] = HP(HL * 0.5, g * hw * 0.74);
      softDisk(c, ex, ey, W * 0.08, W * 0.22, 0.75);
      erase(c);
      dot(c, ex, ey, W * 0.12);
      ink(c);
      c.beginPath();
      c.arc(ex, ey, W * 0.12, 0, TAU);
      radialFill(c, ex, ey, 0, W * 0.12, [
        [0, 0.2],
        [0.65, 0.45],
        [1, 0.95],
      ]);
      c.lineWidth = lw;
      c.beginPath();
      c.arc(ex, ey, W * 0.12, 0, TAU);
      c.stroke();
      c.save();
      c.translate(ex, ey);
      c.rotate(Math.atan2(end.ty, end.tx));
      c.beginPath();
      c.ellipse(0, 0, W * 0.09, W * 0.026, 0, 0, TAU);
      c.fill();
      c.restore();
      ink(c);
      erase(c);
      dot(c, ex + W * 0.035, ey + W * 0.04, W * 0.024);
      ink(c);
      // arcata sopraccigliare in ombra
      c.lineWidth = lw * 1.6;
      c.beginPath();
      c.moveTo(...HP(HL * 0.36, g * hw * 0.62));
      c.quadraticCurveTo(...HP(HL * 0.5, g * hw * 0.5), ...HP(HL * 0.66, g * hw * 0.6));
      c.stroke();
      dot(c, ...HP(HL * 0.9, g * hw * 0.22), W * 0.028);
    }
    if (o.tongue !== false) {
      const [t0x, t0y] = HP(HL * 0.97, 0);
      const [t1x, t1y] = HP(HL + W * 0.6, W * 0.04);
      c.lineWidth = lw * 1.4;
      c.beginPath();
      c.moveTo(t0x, t0y);
      c.quadraticCurveTo(...HP(HL + W * 0.3, -W * 0.06), t1x, t1y);
      c.stroke();
      for (const g of [1, -1]) {
        const [fx, fy] = HP(HL + W * 0.9, W * 0.04 + g * W * 0.16);
        c.lineWidth = lw;
        c.beginPath();
        c.moveTo(t1x, t1y);
        c.quadraticCurveTo(...HP(HL + W * 0.75, W * 0.04 + g * W * 0.04), fx, fy);
        c.stroke();
      }
    }
    c.restore();
    ink(c);
  }
  return cv;
}

// ------------------------------------------------------------------ piume e sfera
/** piuma realistica: punta arrotondata, vessillo scuro alla base che schiarisce, barbe sottili e rachide chiara */
export function feather(c: Ctx, rng: Rng, x: number, y: number, a: number, len: number, wid: number, lw: number, dark = 0.95) {
  const P = frame(x, y, a);
  const n = 24;
  const l: Pt[] = [];
  const r: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = wid * Math.pow(t, 0.3) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 5)));
    l.push(P(len * t, w * 0.7));
    r.push(P(len * t, -w * 1.05));
  }
  const outline = [...l, ...[...r].reverse()];
  pathOf(c, outline);
  erase(c);
  c.fill();
  ink(c);
  c.save();
  pathOf(c, outline);
  c.clip();
  pathOf(c, outline);
  const [x1, y1] = P(len, 0);
  linearFill(c, x, y, x1, y1, [
    [0, dark],
    [0.55, dark * 0.82],
    [1, dark * 0.42],
  ]);
  // vessillo esterno (lato −) più scuro
  pathOf(c, [...r, P(len, 0), P(0, 0)]);
  c.fillStyle = grey(0.3);
  c.fill();
  ink(c);
  // barbe: tante linee sottili e chiare verso la punta
  c.strokeStyle = "rgba(0,0,0,0.38)";
  c.lineWidth = lw * 0.28;
  c.beginPath();
  for (let i = 3; i < 40; i++) {
    const t = i / 42 + (rng() - 0.5) * 0.01;
    for (const s of [1, -1]) {
      const [sx, sy] = P(len * t, 0);
      const [ex, ey] = P(len * Math.min(1, t + 0.1), s * wid * 1.1);
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
    }
  }
  c.stroke();
  // rachide
  erase(c);
  c.lineWidth = lw * 0.7;
  pathOf(c, [P(0, 0), P(len * 0.92, 0)], false);
  c.stroke();
  ink(c);
  c.restore();
  ink(c);
  c.lineWidth = lw * 0.7;
  pathOf(c, outline);
  c.stroke();
}

/**
 * Ala spiegata lungo una linea del corpo (clavicola): copritrici corte vicino all'attaccatura,
 * remiganti lunghe verso la punta. `edge` è il bordo d'attacco dall'interno verso la punta.
 */
export function wing(c: Ctx, rng: Rng, edge: Pt[], len: number, lw: number, side: 1 | -1) {
  const cv: Curve = spline(edge);
  // ombra morbida sotto l'ala
  softStroke(c, edge.map(([px, py]) => [px, py - len * 0.35] as Pt), len * 0.9, 0.55, false);
  const rows = [
    { k: 1.0, n: 9, from: 0.38, to: 1.0, w: 0.17 },
    { k: 0.62, n: 10, from: 0.15, to: 0.94, w: 0.2 },
    { k: 0.34, n: 12, from: 0.0, to: 0.85, w: 0.26 },
    { k: 0.17, n: 16, from: 0.0, to: 0.8, w: 0.4 },
  ];
  for (const row of rows) {
    for (let i = row.n - 1; i >= 0; i--) {
      const f = row.from + ((row.to - row.from) * i) / Math.max(1, row.n - 1);
      const p = cv.at(f * cv.L);
      // le penne puntano in giù e verso l'esterno, ruotando lungo l'ala
      const down = -Math.PI / 2;
      const out = Math.atan2(p.ty, p.tx);
      let d = out - down;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const a = down + d * (0.15 + 0.55 * f) + (rng() - 0.5) * 0.08;
      const l = len * row.k * (0.7 + 0.45 * f) * (0.94 + rng() * 0.1);
      feather(c, rng, p.x, p.y, a, l, l * row.w, lw, 0.95 - (1 - row.k) * 0.2);
    }
  }
  // bordo d'attacco pieno, con scaglie di piume minute
  c.lineWidth = lw * 1.6;
  pathOf(c, edge, false);
  c.stroke();
  void side;
}

/** sfera lucida black & grey (la pietra della fionda): ombra profonda, riflesso, luce di rimbalzo */
export function orb(c: Ctx, x: number, y: number, r: number, lw: number) {
  softDisk(c, x, y - r * 0.15, r * 0.95, r * 1.6, 0.75);
  erase(c);
  dot(c, x, y, r);
  ink(c);
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  radialFill(c, x - r * 0.35, y + r * 0.38, r * 0.05, r * 1.45, [
    [0, 0.1],
    [0.3, 0.45],
    [0.7, 0.92],
    [1, 1],
  ]);
  // luce di rimbalzo sul bordo inferiore
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.clip();
  softStroke(c, Array.from({ length: 13 }, (_, i) => {
    const t = Math.PI * 1.15 + (i / 12) * Math.PI * 0.7;
    return [x + Math.cos(t) * r * 0.9, y + Math.sin(t) * r * 0.9] as Pt;
  }), r * 0.18, 0.5, true);
  c.restore();
  ink(c);
  erase(c);
  c.save();
  c.translate(x - r * 0.38, y + r * 0.42);
  c.rotate(-0.6);
  c.beginPath();
  c.ellipse(0, 0, r * 0.18, r * 0.1, 0, 0, TAU);
  c.fill();
  c.restore();
  ink(c);
  c.lineWidth = lw * 1.2;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
}

/**
 * Fumo black & grey dietro un fiore: più nuvole morbide sfalsate (mai un anello regolare) e un puntinato
 * leggero dove il fumo si dirada, come la sfumatura a pepe dell'ago.
 */
export function smokeCloud(c: Ctx, rng: Rng, x: number, y: number, R: number, alpha: number) {
  // un nucleo morbido centrato e tre nuvole appena sfalsate: il fondo resta liscio, senza macchie
  softDisk(c, x, y, R * 0.45, R, alpha * 0.75);
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU;
    const d = R * (0.12 + rng() * 0.18);
    softDisk(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, R * 0.3, R * (0.85 + rng() * 0.25), alpha * 0.3);
  }
  // pepe dell'ago solo sul bordo del fumo
  const n = Math.round(2.5e5 * R * R);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const t = 0.8 + Math.pow(rng(), 1.6) * 0.45;
    dot(c, x + Math.cos(a) * R * t, y + Math.sin(a) * R * t * 0.85, R * 0.0036 * (0.6 + rng() * 0.8) * (1.4 - t * 0.6));
  }
}

/** puntinato che si dirada attorno a una forma: polvere d'inchiostro per raccordare i pezzi */
export function dust(c: Ctx, rng: Rng, x: number, y: number, rx: number, ry: number, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rng(), 0.7);
    const a = rng() * TAU;
    const k = 1 - t;
    if (rng() > k * 1.2) continue;
    dot(c, x + Math.cos(a) * rx * t, y + Math.sin(a) * ry * t, size * (0.5 + rng() * 0.7) * (0.6 + k * 0.6));
  }
}
