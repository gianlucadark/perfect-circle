/**
 * Tatuaggi delle statue come stencil appoggiati sulla pelle (canvas 2D → maschera, inchiostro = bianco).
 *
 * Ogni opera ha da una a sei carte locali (InkChart in materials.ts): un punto della superficie
 * (sterno, gola, corona), la normale media attorno e il raggio del cilindro che segue la sezione del
 * corpo, stimati dalla mesh al caricamento. Il canvas è disegnato in metri nelle coordinate della
 * carta (u = lunghezza d'arco attorno al corpo, v = quota; origine nel punto d'appoggio), così il
 * disegno avvolge collo, petto e spalle invece di proiettarsi piatto. Sulle statue intere le carte degli
 * arti (`limb`) hanno l'asse lungo l'osso, misurato sulle sezioni della mesh, e quelle su schiena e fianchi
 * si appoggiano a un punto 3D (`pin`). I punti d'appoggio sono stati letti da viste ortografiche con griglia
 * metrica e da sezioni dei modelli. Disegni procedurali originali: non sono lavori dello studio.
 */
import * as THREE from "three";
import {
  arcText,
  circle,
  dot,
  enso,
  flowerOfLife,
  leaf,
  mulberry32,
  stippleRing,
  type Ctx,
  type Rng,
} from "./tattoo";
import { davidChest, davidNeck } from "./davidTattoo";
import { CUSTODE_TATTOO } from "./ritahTattoos";

export interface Rect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

type Pt = [number, number];
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ primitive metriche
export const ink = (c: Ctx) => {
  c.fillStyle = "#fff";
  c.strokeStyle = "#fff";
};
export const erase = (c: Ctx) => {
  c.fillStyle = "#000";
  c.strokeStyle = "#000";
};

export function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, w: number) {
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

export function poly(c: Ctx, pts: Pt[]) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

export function diamond(c: Ctx, x: number, y: number, w: number, h: number) {
  poly(c, [
    [x - w / 2, y],
    [x, y + h / 2],
    [x + w / 2, y],
    [x, y - h / 2],
  ]);
}

/** goccia piena: punta in (x, y), bulbo lungo la direzione `ang` */
export function teardrop(c: Ctx, x: number, y: number, len: number, r: number, ang = -Math.PI / 2) {
  const d = Math.max(len - r, r * 1.05);
  const cx = x + Math.cos(ang) * d;
  const cy = y + Math.sin(ang) * d;
  const b = Math.acos(r / d);
  const back = ang + Math.PI;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(cx + Math.cos(back + b) * r, cy + Math.sin(back + b) * r);
  c.arc(cx, cy, r, back + b, back - b + TAU);
  c.closePath();
  c.fill();
}

export function crescent(c: Ctx, x: number, y: number, r: number, ang: number) {
  dot(c, x, y, r);
  erase(c);
  dot(c, x + Math.cos(ang) * r * 0.45, y + Math.sin(ang) * r * 0.45, r * 0.86);
  ink(c);
}

interface SwagOpts {
  lw: number;
  bead: number;
  step: number;
  dropEvery?: number;
  drop?: number;
}

/** ghirlanda di perle con gocce pendenti, da (x1,y1) a (x2,y2), flessa di `sag` verso il basso */
export function swag(c: Ctx, x1: number, y1: number, x2: number, y2: number, sag: number, o: SwagOpts) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - sag * 2;
  c.lineWidth = o.lw;
  c.beginPath();
  c.moveTo(x1, y1);
  c.quadraticCurveTo(mx, my, x2, y2);
  c.stroke();
  const q = (t: number): Pt => [
    (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2,
    (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2,
  ];
  let acc = 0;
  let k = 0;
  let prev = q(0);
  for (let i = 1; i <= 240; i++) {
    const p = q(i / 240);
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    if (acc >= o.step) {
      acc = 0;
      k++;
      dot(c, p[0], p[1], o.bead);
      if (o.dropEvery && o.drop && k % o.dropEvery === 0) {
        line(c, p[0], p[1], p[0], p[1] - o.drop * 0.35, o.lw * 0.8);
        teardrop(c, p[0], p[1] - o.drop * 0.3, o.drop, o.drop * 0.3);
      }
    }
  }
}

/** catenella verticale verso il basso con goccia finale */
export function chain(c: Ctx, x: number, y: number, len: number, step: number, bead: number, dropLen: number, dropR: number) {
  for (let d = 0; d <= len; d += step) dot(c, x, y - d, bead * (1 - (d / len) * 0.25));
  teardrop(c, x, y - len - step * 0.6, dropLen, dropR);
}

export function beadsArc(c: Ctx, cx: number, cy: number, r: number, n: number, size: number, a0 = Math.PI, a1 = TAU) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    dot(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, size);
  }
}

export function arcStroke(c: Ctx, cx: number, cy: number, r: number, w: number, a0 = Math.PI, a1 = TAU) {
  c.lineWidth = w;
  c.beginPath();
  c.arc(cx, cy, r, a0, a1);
  c.stroke();
}

function clip(c: Ctx, x: number, y: number, w: number, h: number, draw: () => void) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  draw();
  c.restore();
}

export function lace(c: Ctx, x0: number, x1: number, y: number, r: number, lw: number) {
  const top = y + r * 1.4;
  line(c, x0, top, x1, top, lw);
  line(c, x0, top + r * 0.55, x1, top + r * 0.55, lw * 0.7);
  for (let x = x0 + r; x <= x1 - r; x += r * 2) {
    arcStroke(c, x, top, r, lw);
    arcStroke(c, x, top, r * 0.55, lw * 0.8);
    dot(c, x, top - r * 1.45, r * 0.22);
    dot(c, x + r, top + r * 0.28, r * 0.15);
  }
}

// ------------------------------------------------------------------ penna in metri
function makePen(rect: Rect, maxPx: number) {
  const k = maxPx / Math.max(rect.w, rect.h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.w * k);
  canvas.height = Math.round(rect.h * k);
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.fillStyle = "#000";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.setTransform(k, 0, 0, -k, -rect.x0 * k, (rect.y0 + rect.h) * k);
  c.lineCap = "round";
  c.lineJoin = "round";
  ink(c);
  const toPx = (x: number, y: number): Pt => [(x - rect.x0) * k, (rect.y0 + rect.h - y) * k];
  return { canvas, c, k, toPx };
}

// ------------------------------------------------------------------ motivi ricorrenti
/** giro completo attorno al collo: rettangolo della carta largo una circonferenza */
const lap = (v0: number, h: number) => (R: number): Rect => ({ x0: -Math.PI * R, y0: v0, w: TAU * R, h });

/** fase lunare: k = 0 nuova (solo contorno), 0.5 mezza, 1 piena; `side` = lato illuminato */
export function moon(c: Ctx, x: number, y: number, r: number, k: number, side: 1 | -1, lw: number) {
  circle(c, x, y, r, lw);
  if (k >= 0.99) return dot(c, x, y, r);
  if (k <= 0.01) return;
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.clip();
  if (Math.abs(k - 0.5) < 0.01) {
    c.fillRect(side > 0 ? x : x - r, y - r, r, r * 2);
  } else if (k > 0.5) {
    dot(c, x, y, r);
    erase(c);
    const e = r * (2 * k - 1);
    c.beginPath();
    c.ellipse(x - side * r * 0.5, y, Math.max(r * 0.5 - e * 0.5, 0.0001), r, 0, 0, TAU);
    c.fill();
    ink(c);
  } else {
    // falce: semidisco illuminato meno un'ellisse
    c.fillRect(side > 0 ? x : x - r, y - r, r, r * 2);
    erase(c);
    c.beginPath();
    c.ellipse(x, y, r * (1 - 2 * k), r, 0, 0, TAU);
    c.fill();
    ink(c);
  }
  c.restore();
  circle(c, x, y, r, lw);
}

/** filo di perline lungo una quota costante, per tutto il giro */
function beadRow(c: Ctx, u0: number, u1: number, v: number, step: number, r: number) {
  for (let u = u0 + step / 2; u < u1; u += step) dot(c, u, v, r);
}

// ------------------------------------------------------------------ disegni
interface Chart {
  R: number;
  rect: Rect;
}
type Design = (c: Ctx, rng: Rng, font: string, pen: ReturnType<typeof makePen>, chart: Chart) => void;

/**
 * La Notte · coscia sinistra sollevata (carta lungo il femore: v verso il ginocchio, +u verso il bordo alto
 * della coscia). Una grande falce di luna con la stella, come quella del suo diadema, le fasi lunari in fila
 * lungo il femore e un cielo di puntini. Fine line e dotwork; il disegno resta lontano dall'inguine.
 */
const notteCoscia: Design = (c, rng) => {
  const lw = 0.002;
  ink(c);
  // fasi lunari lungo il femore, dal fianco al ginocchio: nuova → piena → nuova
  const ks = [0.08, 0.3, 0.5, 1, 0.5, 0.3, 0.08];
  const u0 = -0.074;
  const dv = 0.042;
  ks.forEach((k, i) => {
    const v = -0.13 + i * dv;
    moon(c, u0, v, 0.0145, k, i < 3 ? 1 : -1, lw * 0.9);
    if (i < ks.length - 1) for (let j = 1; j < 4; j++) dot(c, u0, v + 0.0145 + (j / 4) * (dv - 0.029), 0.0009);
  });
  // la falce grande con la stella nel suo vuoto
  const cx = 0.016;
  const cy = 0.03;
  const R = 0.068;
  c.save();
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.clip();
  for (let i = 0; i < 9000; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * R;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    // dentro la falce: puntinato che si addensa verso il bordo esterno
    const inner = Math.hypot(x - (cx + R * 0.42), y - (cy + R * 0.12));
    if (inner < R * 0.84) continue;
    if (rng() > 0.35 + (r / R) * 0.65) continue;
    dot(c, x, y, 0.00062);
  }
  c.restore();
  ink(c);
  c.lineWidth = lw * 1.3;
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.stroke();
  erase(c);
  c.beginPath();
  c.arc(cx + R * 0.42, cy + R * 0.12, R * 0.84 - lw * 0.6, 0, TAU);
  c.fill();
  ink(c);
  c.lineWidth = lw;
  // ripassa solo l'arco interno della falce
  c.beginPath();
  c.arc(cx + R * 0.42, cy + R * 0.12, R * 0.84, Math.PI * 0.62, Math.PI * 1.55);
  c.stroke();
  // stella a otto punte
  const sx = cx + R * 0.5;
  const sy = cy + R * 0.12;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const L = i % 2 ? 0.011 : 0.022;
    poly(c, [
      [sx + Math.cos(a + 0.5) * 0.0028, sy + Math.sin(a + 0.5) * 0.0028],
      [sx + Math.cos(a) * L, sy + Math.sin(a) * L],
      [sx + Math.cos(a - 0.5) * 0.0028, sy + Math.sin(a - 0.5) * 0.0028],
    ]);
  }
  dot(c, sx, sy, 0.0032);
  // cielo: stelline e puntini sparsi attorno, più fitti vicino alla luna
  for (let i = 0; i < 46; i++) {
    const a = rng() * TAU;
    const r = R * (1.15 + Math.pow(rng(), 1.4) * 1.1);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 1.3;
    if (Math.abs(x - u0) < 0.022) continue;
    if (i % 7 === 0) {
      line(c, x - 0.004, y, x + 0.004, y, lw * 0.6);
      line(c, x, y - 0.004, x, y + 0.004, lw * 0.6);
    } else dot(c, x, y, 0.0006 + rng() * 0.0008);
  }
};

/**
 * Apollo · sole nero sul plesso solare: anello pieno con la frase in negativo, fiore della vita, raggi e
 * polvere d'inchiostro. Sta sotto la bandoliera che gli attraversa il petto e sopra l'ombelico.
 */
const apolloSole: Design = (c, rng, font, pen) => {
  const lw = 0.0022;
  const k = 0.84;
  const lift = 0;
  c.save();
  c.translate(0, lift);
  c.scale(k, k);
  // polvere d'inchiostro che si dirada verso l'esterno: nessun bordo netto
  stippleRing(c, rng, 0, 0, 0.083, 0.128, 5200, 0.00095);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU + Math.PI / 40;
    const r0 = 0.087;
    const long = i % 2 === 0;
    const r1 = long ? 0.125 : 0.106;
    const hw = (Math.PI / 40) * (long ? 0.55 : 0.4);
    poly(c, [
      [Math.cos(a - hw) * r0, Math.sin(a - hw) * r0],
      [Math.cos(a) * r1, Math.sin(a) * r1],
      [Math.cos(a + hw) * r0, Math.sin(a + hw) * r0],
    ]);
    if (!long) dot(c, Math.cos(a) * 0.114, Math.sin(a) * 0.114, 0.0014);
  }
  circle(c, 0, 0, 0.077, 0.016);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = "#000";
  const [px, py] = pen.toPx(0, lift);
  arcText(c, "OGNI LINEA COMINCIA DA UN CERCHIO  ·  PERFECT CIRCLE  ·", px, py, 0.077 * k * pen.k, -Math.PI / 2, `600 ${Math.round(0.0094 * k * pen.k)}px ${font}`, 0.0029 * k * pen.k);
  c.restore();
  ink(c);
  circle(c, 0, 0, 0.057, lw * 0.6);
  flowerOfLife(c, 0, 0, 0.048, lw * 0.8);
  dot(c, 0, 0, 0.0048);
  c.restore();
};

/**
 * Apollo · braccio destro, giro completo (u = 0 verso chi guarda, v lungo l'omero): bracciale blackwork,
 * due fasce piene con una corona di triangoli in negativo, come i raggi del sole sul petto.
 */
const apolloBracciale: Design = (c, _rng, _f, _p, { rect }) => {
  const W = rect.w;
  const L = -W / 2;
  ink(c);
  c.fillRect(L, -0.022, W, 0.016);
  c.fillRect(L, 0.034, W, 0.016);
  const n = Math.round(W / 0.016);
  for (let i = 0; i < n; i++) {
    const u = L + ((i + 0.5) / n) * W;
    poly(c, [[u - 0.0065, -0.004], [u, 0.03], [u + 0.0065, -0.004]]);
    dot(c, u + W / n / 2, 0.006, 0.0016);
  }
  for (let i = 0; i < n * 2; i++) {
    const u = L + ((i + 0.5) / (n * 2)) * W;
    dot(c, u, 0.058, 0.0012);
    dot(c, u, -0.03, 0.0012);
  }
};

/**
 * Apollo · avambraccio destro, giro completo (v = 0 a metà avambraccio, gomito in alto): una fascia nera
 * al polso da cui salgono raggi pieni che si assottigliano, poi un puntinato che sfuma verso il gomito.
 */
const apolloRaggi: Design = (c, rng, _f, _p, { rect }) => {
  const W = rect.w;
  const L = -W / 2;
  ink(c);
  c.fillRect(L, -0.1, W, 0.03);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const u = L + ((i + 0.5) / n) * W;
    const long = i % 2 === 0;
    poly(c, [[u - W / n / 2 + 0.001, -0.071], [u, long ? 0.035 : -0.005], [u + W / n / 2 - 0.001, -0.071]]);
    if (!long) dot(c, u, 0.008, 0.0016);
  }
  for (let i = 0; i < 2400; i++) {
    const u = L + rng() * W;
    const t = Math.pow(rng(), 1.6);
    dot(c, u, 0.035 + t * 0.06, 0.0009 * (1.2 - t * 0.7));
  }
};

/** Nefertiti · usekh: collare a file concentriche di perle, gocce e foglie, centrato sulla gola */
const nefertitiCollare: Design = (c) => {
  const lw = 0.0014;
  const cx = 0;
  const cy = 0.042;
  const arcs = (r: number, w: number) => arcStroke(c, cx, cy, r, w);
  arcs(0.046, lw * 1.6);
  beadsArc(c, cx, cy, 0.052, 30, 0.0016);
  arcs(0.058, lw);
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI + (Math.PI * i) / 26;
    teardrop(c, cx + Math.cos(a) * 0.062, cy + Math.sin(a) * 0.062, 0.0145, 0.0036, a);
  }
  arcs(0.08, lw * 1.3);
  beadsArc(c, cx, cy, 0.0855, 44, 0.0013);
  arcs(0.0905, lw);
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI + (Math.PI * i) / 22;
    leaf(c, cx + Math.cos(a) * 0.095, cy + Math.sin(a) * 0.095, a, 0.024, lw);
    dot(c, cx + Math.cos(a) * 0.113, cy + Math.sin(a) * 0.113, 0.0018);
  }
  arcs(0.123, lw * 2.4);
  beadsArc(c, cx, cy, 0.1295, 64, 0.0016);
};

/** Nefertiti · anelli d'oro attorno al collo */
const nefertitiCollo: Design = (c, _rng, _f, _p, { R }) => {
  const lw = 0.0014;
  const L = Math.PI * R;
  [-0.016, -0.006, 0.004, 0.014].forEach((v, i) => line(c, -L, v, L, v, lw * (i === 0 ? 1.8 : 1.1)));
  beadRow(c, -L, L, -0.001, 0.0062, 0.0011);
};

/** Nefertiti · fregio della corona: cerchi tra due fili, zig-zag in alto, disco solare sulla fronte */
const nefertitiCorona: Design = (c, rng, _f, _p, { R }) => {
  const lw = 0.0014;
  const L = Math.PI * R;
  line(c, -L, 0.0095, L, 0.0095, lw);
  line(c, -L, -0.0095, L, -0.0095, lw);
  for (let u = -L + 0.0064; u < L; u += 0.0128) {
    circle(c, u, 0, 0.0042, lw * 0.9);
    dot(c, u, 0, 0.0014);
  }
  c.lineWidth = lw;
  c.beginPath();
  const n = Math.round((2 * L) / 0.008);
  for (let i = 0; i <= n; i++) {
    const u = -L + (i * 2 * L) / n;
    const v = 0.128 + (i % 2 ? 0.0055 : -0.0055);
    if (i) c.lineTo(u, v);
    else c.moveTo(u, v);
  }
  c.stroke();
  enso(c, rng, 0, 0.088, 0.028, 0.0026);
  circle(c, 0, 0.088, 0.018, lw);
  dot(c, 0, 0.088, 0.004);
};

/** Teste del coro: un solo segno ciascuna, al collo o sotto la gola */
const heraPetto: Design = (c) => {
  circle(c, 0, 0, 0.012, 0.0022);
  dot(c, 0, 0, 0.0035);
};
const korinnaCollo: Design = (c, _r, _f, _p, { R }) => beadRow(c, -Math.PI * R, Math.PI * R, 0, 0.0085, 0.0021);
const bellaCollo: Design = (c, _r, _f, _p, { R }) => {
  line(c, -Math.PI * R, 0.0035, Math.PI * R, 0.0035, 0.0018);
  line(c, -Math.PI * R, -0.0035, Math.PI * R, -0.0035, 0.0018);
};
const amazzoneCollo: Design = (c, _r, _f, _p, { R }) => {
  line(c, -Math.PI * R, 0, Math.PI * R, 0, 0.0026);
  c.lineWidth = 0.0022;
  c.beginPath();
  c.moveTo(-0.0055, -0.0025);
  c.lineTo(0.0055, -0.0025);
  c.lineTo(0, -0.0125);
  c.closePath();
  c.stroke();
};

// ------------------------------------------------------------------ carte sul corpo
type V3 = [number, number, number];

export interface ChartSpec {
  /** punto frontale (vista lungo `yaw`): ascissa e quota in spazio oggetto, lette da viste ortografiche */
  at: Pt;
  /**
   * Arto (braccio, avambraccio, coscia): cilindro di raggio R attorno a un asse qualsiasi, misurato sulle
   * sezioni della mesh. `p` punto dell'asse, `dir` direzione (verso la radice dell'arto), `front` direzione
   * che diventa u = 0 sulla carta. Con `limb` il punto `at` non serve.
   */
  limb?: { p: V3; dir: V3; front: V3 };
  /** direzione di vista in cui si cerca il punto `at` (default quella dell'opera; π = dal retro) */
  yaw?: number;
  /** punto d'appoggio in 3D (spazio oggetto): il vertice più vicino, con la sua normale (schiena, fianchi) */
  pin?: V3;
  /** asse "alto" della carta quando non è verticale (schiena, fianco che seguono il corpo) */
  up?: V3;
  /** normale orizzontale (colli: il cilindro della carta resta verticale) */
  level?: boolean;
  /** raggio entro cui si media la normale della superficie */
  nr?: number;
  /** raggio del cilindro (altrimenti stimato dalla sezione della superficie) */
  R?: number;
  tol?: number;
  facing?: number;
  /** esponente sui grigi (black & grey: < 1) */
  gamma?: number;
  rect: Rect | ((R: number) => Rect);
  px: number;
  draw: Design;
}

export interface Spec {
  yaw: number;
  seed: number;
  charts: ChartSpec[];
  /** punto (spazio oggetto) da cui l'inchiostro si propaga quando l'opera si disegna da sola */
  origin?: V3;
}

/** collo: giro completo, avvolge anche il retro */
const neck = (at: Pt, v0: number, h: number, px: number, draw: Design): ChartSpec => ({ at, level: true, nr: 0.02, tol: 0.45, facing: -0.7, rect: lap(v0, h), px, draw });

export const STATUE_TATTOOS: Record<string, Spec> = {
  // La Notte (Michelangelo): la carta segue il femore della coscia sollevata, ancorata sulla sua faccia esterna
  "KAS112-2": {
    yaw: 0,
    seed: 1122,
    charts: [{ at: [0, 0], pin: [-0.32, 0.98, 0.34], up: [-0.62, 0.78, -0.1], nr: 0.05, R: 0.12, tol: 0.55, facing: 0.05, gamma: 0.8, rect: { x0: -0.13, y0: -0.16, w: 0.25, h: 0.3 }, px: 2560, draw: notteCoscia }],
  },
  // Apollo del Belvedere: il dio del sole porta il sole nero sul plesso solare, il braccio destro armato di blackwork
  KAS353: {
    yaw: 0,
    seed: 353,
    charts: [
      { at: [0, 0], pin: [-0.355, 1.625, 0.16], nr: 0.07, tol: 0.6, facing: -0.05, rect: { x0: -0.115, y0: -0.115, w: 0.23, h: 0.23 }, px: 2560, draw: apolloSole },
      { at: [0, 0], limb: { p: [-0.562, 1.575, -0.209], dir: [0.236, 0.97, 0.07], front: [-0.2, 0, 1] }, R: 0.06, tol: 0.6, facing: 0.1, rect: { x0: -Math.PI * 0.06, y0: -0.05, w: Math.PI * 0.12, h: 0.13 }, px: 1536, draw: apolloBracciale },
      { at: [0, 0], limb: { p: [-0.611, 1.37, -0.14], dir: [0.15, 0.77, -0.62], front: [-0.5, 0, 0.6] }, R: 0.05, tol: 0.7, facing: 0.1, rect: { x0: -Math.PI * 0.05, y0: -0.11, w: Math.PI * 0.1, h: 0.2 }, px: 1536, draw: apolloRaggi },
    ],
  },
  DEP439: {
    yaw: 0,
    seed: 439,
    charts: [
      { at: [-0.013, 0.205], nr: 0.05, tol: 0.75, facing: -0.3, rect: { x0: -0.2, y0: -0.105, w: 0.4, h: 0.15 }, px: 2048, draw: nefertitiCollare },
      neck([-0.013, 0.25], -0.022, 0.044, 1024, nefertitiCollo),
      { ...neck([-0.005, 0.44], -0.02, 0.16, 2048, nefertitiCorona), tol: 0.6 },
    ],
  },
  // Il gigante: collo a giro completo (rosa e serpente) e petto (pietra alata), black & grey
  KAS2232: {
    yaw: 0.7,
    seed: 2232,
    charts: [
      { ...neck([0.07, 0.45], -0.2, 0.33, 3072, davidNeck), nr: 0.04, tol: 0.7, gamma: 0.62 },
      { at: [0.07, 0.28], nr: 0.08, tol: 0.6, facing: -0.1, gamma: 0.62, rect: { x0: -0.36, y0: -0.3, w: 0.72, h: 0.34 }, px: 2560, draw: davidChest },
    ],
  },
  // la Custode (Ritah): manica, mano, fianco, nuca e spina, vedi ritahTattoos.ts
  KMS6004: CUSTODE_TATTOO,
  KAS622: { yaw: 0, seed: 622, charts: [{ at: [0.0, 0.235], nr: 0.04, tol: 0.6, facing: 0, rect: { x0: -0.02, y0: -0.02, w: 0.04, h: 0.04 }, px: 512, draw: heraPetto }] },
  KAS639: { yaw: 0, seed: 639, charts: [neck([0.006, 0.11], -0.01, 0.02, 1024, korinnaCollo)] },
  KAS394: { yaw: 0, seed: 394, charts: [neck([0.007, 0.151], -0.01, 0.02, 1024, bellaCollo)] },
  KAS615: { yaw: 0, seed: 615, charts: [{ ...neck([0.02, 0.338], -0.017, 0.025, 1024, amazzoneCollo), tol: 0.4 }] },
};

/**
 * Ancora la carta alla superficie reale: il punto più avanzato del modello sulla verticale di `at`,
 * la normale media attorno a esso e il raggio del cilindro che meglio segue la sezione orizzontale.
 */
function anchorChart(geo: THREE.BufferGeometry, s: ChartSpec, yaw: number) {
  if (s.limb) {
    const B = new THREE.Vector3(...s.limb.dir).normalize();
    const N = new THREE.Vector3(...s.limb.front);
    N.addScaledVector(B, -N.dot(B)).normalize();
    const R = s.R ?? 0.045;
    const C = new THREE.Vector3(...s.limb.p).addScaledVector(N, R);
    const T = new THREE.Vector3().crossVectors(B, N).normalize();
    return { C, N, T, R };
  }
  const P = geo.attributes.position.array as ArrayLike<number>;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const Nn = geo.attributes.normal.array as ArrayLike<number>;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const F = new THREE.Vector3(sn, 0, cs);
  const count = P.length / 3;
  let best = -1;
  if (s.pin) {
    let bd = Infinity;
    const [px, py, pz] = s.pin;
    for (let i = 0; i < count; i++) {
      const d = (P[i * 3] - px) ** 2 + (P[i * 3 + 1] - py) ** 2 + (P[i * 3 + 2] - pz) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const nn = geo.attributes.normal.array as ArrayLike<number>;
    F.set(nn[best * 3], 0, nn[best * 3 + 2]).normalize();
  }
  for (const r of s.pin ? [] : [0.004, 0.008, 0.016, 0.032]) {
    let bf = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      const da = x * cs - z * sn - s.at[0];
      const dy = y - s.at[1];
      if (da * da + dy * dy > r * r) continue;
      const f = x * sn + z * cs;
      if (f > bf) {
        bf = f;
        best = i;
      }
    }
    if (best >= 0) break;
  }
  const C = best >= 0 ? new THREE.Vector3(P[best * 3], P[best * 3 + 1], P[best * 3 + 2]) : new THREE.Vector3(s.at[0] * cs, s.at[1], -s.at[0] * sn);
  const N = new THREE.Vector3();
  const nr = s.nr ?? 0.04;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (v.distanceToSquared(C) > nr * nr) continue;
    n.set(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]);
    if (n.dot(F) > -0.2) N.add(n);
  }
  if (N.lengthSq() < 1e-8) N.copy(F);
  N.normalize();
  if (s.level) N.setY(0).normalize();
  if (N.dot(F) < 0.3) N.lerp(F, 0.5).normalize();
  const up = new THREE.Vector3(...(s.up ?? [0, 1, 0])).normalize();
  const B = up.addScaledVector(N, -up.dot(N)).normalize();
  const T = new THREE.Vector3().crossVectors(B, N).normalize();
  B.crossVectors(N, T);
  let R = s.R ?? 0;
  if (!R) {
    // cerchio tangente in C che passa per i punti della sezione: R = (x² + z²) / (−2z)
    const maxX = typeof s.rect === "function" ? 0.25 : Math.max(-s.rect.x0, s.rect.x0 + s.rect.w);
    const est: number[] = [];
    for (let i = 0; i < count; i++) {
      v.set(P[i * 3] - C.x, P[i * 3 + 1] - C.y, P[i * 3 + 2] - C.z);
      if (Math.abs(v.dot(B)) > 0.004) continue;
      const x = v.dot(T);
      const z = v.dot(N);
      if (z > -0.003 || Math.abs(x) > maxX || z < -maxX * 1.6) continue;
      est.push((x * x + z * z) / (-2 * z));
    }
    est.sort((a, b) => a - b);
    R = est.length ? est[Math.floor(est.length / 2)] : 0.15;
    R = Math.min(0.6, Math.max(0.03, R));
  }
  return { C, N, T, R };
}

export interface StatueTattooChart {
  canvas: HTMLCanvasElement;
  C: THREE.Vector3;
  N: THREE.Vector3;
  T: THREE.Vector3;
  R: number;
  rect: Rect;
  tol: number;
  facing: number;
  gamma: number;
}

/** griglia di lettura della carta (solo sviluppo, ?inkgrid): linee ogni 1 cm, più spesse ogni 5, etichette u|v in cm */
function chartGrid(c: Ctx, pen: ReturnType<typeof makePen>, rect: Rect) {
  const x0 = Math.ceil(rect.x0 * 100) / 100;
  const y0 = Math.ceil(rect.y0 * 100) / 100;
  for (let x = x0; x <= rect.x0 + rect.w; x += 0.01) {
    const cm = Math.round(x * 100);
    line(c, x, rect.y0, x, rect.y0 + rect.h, cm === 0 ? 0.0016 : cm % 5 === 0 ? 0.0009 : 0.00035);
  }
  for (let y = y0; y <= rect.y0 + rect.h; y += 0.01) {
    const cm = Math.round(y * 100);
    line(c, rect.x0, y, rect.x0 + rect.w, y, cm === 0 ? 0.0016 : cm % 5 === 0 ? 0.0009 : 0.00035);
  }
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.font = `600 ${Math.max(9, Math.round(0.0042 * pen.k))}px monospace`;
  c.textAlign = "left";
  for (let y = Math.ceil(rect.y0 * 20) / 20; y < rect.y0 + rect.h; y += 0.05) {
    for (let x = Math.ceil(rect.x0 * 20) / 20; x < rect.x0 + rect.w; x += 0.05) {
      const [px, py] = pen.toPx(x + 0.001, y + 0.0015);
      c.fillText(`${Math.round(x * 100)}|${Math.round(y * 100)}`, px, py);
    }
  }
  c.restore();
}

export function makeStatueTattoo(id: string, fontFamily: string, scale: number, geo: THREE.BufferGeometry, grid = false): StatueTattooChart[] {
  const s = STATUE_TATTOOS[id];
  const rng = mulberry32(s.seed);
  return s.charts.map((spec) => {
    const a = anchorChart(geo, spec, spec.yaw ?? s.yaw);
    const rect = typeof spec.rect === "function" ? spec.rect(a.R) : spec.rect;
    const pen = makePen(rect, Math.round(spec.px * scale));
    if (grid) chartGrid(pen.c, pen, rect);
    else spec.draw(pen.c, rng, fontFamily, pen, { R: a.R, rect });
    return { canvas: pen.canvas, ...a, rect, tol: spec.tol ?? 0.6, facing: spec.facing ?? 0, gamma: grid ? 1 : (spec.gamma ?? 1) };
  });
}
