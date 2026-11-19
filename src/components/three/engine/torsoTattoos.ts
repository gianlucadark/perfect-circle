/**
 * Tatuaggi dei torsi: un'unica carta cilindrica che avvolge tutto il tronco.
 *
 * L'asse del cilindro non è fisso: segue il centro del tronco quota per quota (computeTorsoFrame),
 * così anche un torso seduto, inclinato o ruotato (Belvedere, Psiche) resta centrato e il disegno
 * scorre sulla pelle invece di scivolare su cosce e bacino. Il canvas è disegnato in metri:
 * x = lunghezza d'arco dal centro del petto (circonferenza di riferimento C), y = quota dalla base.
 * I punti anatomici (sterno, capezzoli, ombelico, cresta iliaca, scapole) sono stati letti
 * dalla griglia di debug (?inkgrid in sviluppo). Disegni procedurali originali: non sono lavori dello studio.
 */
import * as THREE from "three";
import { AXIS_LEVELS } from "./materials";
import { chain, crescent, diamond, erase, ink, line, poly, teardrop } from "./statueTattoos";
import { circle, cracks, dot, enso, flowerOfLife, mandala, mulberry32, stippleRing, type Ctx, type Rng } from "./tattoo";

export type TorsoVariant = "belvedere" | "psiche" | "doriforo" | "apollo" | "iris" | "valentini";

/** fascia del tronco (frazioni dell'altezza) su cui si calcola l'asse: fuori, cosce, plinto, collo */
export const TORSO_FIT: Record<TorsoVariant, [number, number]> = {
  belvedere: [0.45, 0.95],
  psiche: [0.3, 0.78],
  doriforo: [0.5, 0.92],
  apollo: [0.45, 0.9],
  iris: [0.4, 0.9],
  valentini: [0.45, 0.9],
};

export interface TorsoFrame {
  H: number;
  /** AXIS_LEVELS × (cx, cz, R) */
  axis: Float32Array;
  /** raggio di riferimento del tronco e circonferenza corrispondente (larghezza del canvas, m) */
  Rref: number;
  C: number;
}

/**
 * Centro e raggio del tronco a ogni livello: baricentro della sezione, levigato in altezza.
 * Fuori da `fit` (frazioni dell'altezza: cosce, collo spezzato) l'asse resta quello dell'ultimo livello valido.
 */
export function computeTorsoFrame(geo: THREE.BufferGeometry, H: number, fit: [number, number]): TorsoFrame {
  const P = geo.attributes.position.array as ArrayLike<number>;
  const n = P.length / 3;
  const L = AXIS_LEVELS;
  const sx = new Float64Array(L);
  const sz = new Float64Array(L);
  const cnt = new Float64Array(L);
  const lev = (y: number) => Math.min(L - 1, Math.max(0, Math.floor((y / H) * L)));
  for (let i = 0; i < n; i++) {
    const k = lev(P[i * 3 + 1]);
    sx[k] += P[i * 3];
    sz[k] += P[i * 3 + 2];
    cnt[k]++;
  }
  const lo = Math.max(0, Math.floor(fit[0] * L));
  const hi = Math.min(L - 1, Math.ceil(fit[1] * L) - 1);
  const raw: [number, number][] = [];
  for (let k = 0; k < L; k++) {
    const kk = Math.min(hi, Math.max(lo, k));
    raw.push(cnt[kk] ? [sx[kk] / cnt[kk], sz[kk] / cnt[kk]] : [0, 0]);
  }
  // levigatura gaussiana: l'asse curva dolcemente, il disegno non ondeggia
  const cen = raw.map((_, k) => {
    let wx = 0;
    let wz = 0;
    let ws = 0;
    for (let j = 0; j < L; j++) {
      const w = Math.exp(-((j - k) ** 2) / (2 * 1.6 * 1.6));
      wx += raw[j][0] * w;
      wz += raw[j][1] * w;
      ws += w;
    }
    return [wx / ws, wz / ws];
  });
  const rad: number[][] = Array.from({ length: L }, () => []);
  for (let i = 0; i < n; i++) {
    const k = lev(P[i * 3 + 1]);
    rad[k].push(Math.hypot(P[i * 3] - cen[k][0], P[i * 3 + 2] - cen[k][1]));
  }
  const R = rad.map((a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0.15));
  const axis = new Float32Array(L * 3);
  for (let k = 0; k < L; k++) axis.set([cen[k][0], cen[k][1], R[k]], k * 3);
  const trunk = R.slice(lo, hi + 1);
  const Rref = trunk.reduce((s, v) => s + v, 0) / trunk.length;
  return { H, axis, Rref, C: Math.PI * 2 * Rref };
}

// ------------------------------------------------------------------ penna in metri
export interface TorsoPen {
  c: Ctx;
  canvas: HTMLCanvasElement;
  /** pixel per metro */
  k: number;
  C: number;
  H: number;
  /** disegna tre volte, spostato di ±C: i motivi che attraversano la cucitura sul retro restano continui */
  wrap: (draw: () => void) => void;
}

function makeTorsoPen(frame: TorsoFrame, px: number): TorsoPen {
  const { C, H } = frame;
  const W = px;
  const k = W / C;
  const Hpx = Math.round(Math.min(px * 1.5, Math.max(512, H * k)));
  const kh = Hpx / H;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Hpx;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.fillStyle = "#000";
  c.fillRect(0, 0, W, Hpx);
  c.setTransform(k, 0, 0, -kh, W / 2, Hpx);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.fillStyle = "#fff";
  c.strokeStyle = "#fff";
  const wrap = (draw: () => void) => {
    for (const dx of [0, -C, C]) {
      c.save();
      c.translate(dx, 0);
      draw();
      c.restore();
    }
  };
  return { c, canvas, k, C, H, wrap };
}

/** griglia di lettura: linee ogni 5 cm, etichette ogni 10 cm (x = arco dal centro del petto, y = quota) */
function debugGrid(p: TorsoPen) {
  const { c, C, H } = p;
  for (let x = 0; x <= C / 2; x += 0.05) {
    for (const s of x ? [-1, 1] : [1]) {
      const major = Math.round(x * 100) % 10 === 0;
      c.lineWidth = major ? 0.003 : 0.0012;
      c.beginPath();
      c.moveTo(s * x, 0);
      c.lineTo(s * x, H);
      c.stroke();
    }
  }
  for (let y = 0; y <= H; y += 0.05) {
    const major = Math.round(y * 100) % 10 === 0;
    c.lineWidth = major ? 0.003 : 0.0012;
    c.beginPath();
    c.moveTo(-C / 2, y);
    c.lineTo(C / 2, y);
    c.stroke();
  }
  const m = c.getTransform();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.font = `600 ${Math.round(m.a * 0.016)}px monospace`;
  c.textAlign = "center";
  for (let y = 0.1; y < H; y += 0.1) {
    for (let x = -Math.floor(C / 2 / 0.1) * 0.1; x <= C / 2; x += 0.1) {
      c.fillText(`${Math.round(x * 100)}|${Math.round(y * 100)}`, m.e + (x + 0.025) * m.a, m.f + (y + 0.015) * m.d);
    }
  }
  c.restore();
}

// ------------------------------------------------------------------ curve che seguono il corpo
type Pt = [number, number];
const TAU = Math.PI * 2;

interface CurvePt {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** normale a sinistra del verso di percorrenza */
  nx: number;
  ny: number;
}
interface Curve {
  L: number;
  at: (s: number) => CurvePt;
}

/** spline di Catmull-Rom sui punti di controllo, parametrizzata per lunghezza d'arco */
function spline(ctrl: Pt[]): Curve {
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  const pts: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let j = 0; j < 24; j++) {
      const t = j / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = S[S.length - 1];
  const at = (s: number): CurvePt => {
    s = Math.max(0, Math.min(L, s));
    let lo = 0;
    let hi = S.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (S[m] <= s) lo = m;
      else hi = m;
    }
    const t = (s - S[lo]) / (S[hi] - S[lo] || 1);
    let tx = pts[hi][0] - pts[lo][0];
    let ty = pts[hi][1] - pts[lo][1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return { x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, y: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t, tx, ty, nx: -ty, ny: tx };
  };
  return { L, at };
}

type Fn = (f: number) => number;
const val = (v: number | Fn, f: number) => (typeof v === "number" ? v : v(f));

/** tratto pieno lungo la curva, largo w(f) (f = 0..1), spostato di `off` lungo la normale */
function ribbon(c: Ctx, cv: Curve, w: number | Fn, off: number | Fn = 0) {
  const n = Math.max(16, Math.ceil(cv.L / 0.0015));
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const p = cv.at(f * cv.L);
    const h = val(w, f) / 2;
    const o = val(off, f);
    left.push([p.x + p.nx * (o + h), p.y + p.ny * (o + h)]);
    right.push([p.x + p.nx * (o - h), p.y + p.ny * (o - h)]);
  }
  poly(c, [...left, ...right.reverse()]);
}

function strokeCurve(c: Ctx, cv: Curve, lw: number, off: number | Fn = 0) {
  const n = Math.max(16, Math.ceil(cv.L / 0.0015));
  c.lineWidth = lw;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const p = cv.at(f * cv.L);
    const o = val(off, f);
    if (i) c.lineTo(p.x + p.nx * o, p.y + p.ny * o);
    else c.moveTo(p.x + p.nx * o, p.y + p.ny * o);
  }
  c.stroke();
}

/** un motivo ogni `step` metri lungo la curva */
function along(cv: Curve, step: number, fn: (p: CurvePt, f: number, i: number) => void, f0 = 0, f1 = 1) {
  let i = 0;
  for (let s = f0 * cv.L + step / 2; s <= f1 * cv.L; s += step, i++) fn(cv.at(s), s / cv.L, i);
}

const offset = (p: CurvePt, d: number): Pt => [p.x + p.nx * d, p.y + p.ny * d];
const dirOf = (p: CurvePt, side: number) => Math.atan2(p.ny * side, p.nx * side);

/** ombreggiatura a puntini che sfuma allontanandosi dalla curva (da un lato o da entrambi) */
function stippleCurve(c: Ctx, rng: Rng, cv: Curve, n: number, spread: number, size: number, side = 0, off = 0) {
  for (let i = 0; i < n; i++) {
    const p = cv.at(rng() * cv.L);
    const t = Math.pow(rng(), 1.7);
    const d = t * spread * (side || (rng() < 0.5 ? -1 : 1));
    const [x, y] = offset(p, off * (side || 1) + d);
    dot(c, x, y, size * (1.05 - t * 0.55) * (0.7 + rng() * 0.6));
  }
}

const grey = (a: number) => `rgba(255,255,255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;

let blurOK: boolean | null = null;
/** il filtro blur del canvas 2D non c'è ovunque (Safari datati): lo si prova su un pixel */
function canBlur() {
  if (blurOK === null) {
    const t = document.createElement("canvas");
    t.width = t.height = 9;
    const x = t.getContext("2d", { willReadFrequently: true })!;
    x.filter = "blur(2px)";
    x.fillStyle = "#fff";
    x.fillRect(4, 4, 1, 1);
    blurOK = x.getImageData(1, 4, 1, 1).data[3] > 0;
  }
  return blurOK;
}

/** sfumatura black & grey lungo una curva: il centro raggiunge `alpha`, i bordi svaniscono */
function softCurve(c: Ctx, cv: Curve, width: number, alpha: number, off: number | Fn = 0) {
  c.save();
  if (canBlur()) {
    c.filter = `blur(${(width * 0.24 * c.getTransform().a).toFixed(1)}px)`;
    c.strokeStyle = grey(alpha);
    strokeCurve(c, cv, width * 0.5, off);
  } else {
    // senza filtro: tratti sovrapposti sempre più stretti
    const passes = 16;
    c.strokeStyle = grey(1 - Math.pow(1 - alpha, 1 / passes));
    for (let i = 0; i < passes; i++) strokeCurve(c, cv, width * (1 - (i / passes) * 0.94), off);
  }
  c.restore();
}

/** alone morbido: pieno fino a r0, sfuma a zero in r1 */
function softDisk(c: Ctx, x: number, y: number, r0: number, r1: number, alpha: number) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  g.addColorStop(0, grey(alpha));
  g.addColorStop(0.5, grey(alpha * 0.35));
  g.addColorStop(1, grey(0));
  c.save();
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r1, 0, TAU);
  c.fill();
  c.restore();
}

// ------------------------------------------------------------------ motivi
/** petalo appuntito di loto tra i raggi r0 e r1 */
function lotusPetal(c: Ctx, x: number, y: number, a: number, r0: number, r1: number, hw: number, fill: boolean, lw: number) {
  const at = (ang: number, r: number): Pt => [x + Math.cos(ang) * r, y + Math.sin(ang) * r];
  const rm = r0 + (r1 - r0) * 0.42;
  c.beginPath();
  c.moveTo(...at(a - hw, r0));
  c.quadraticCurveTo(...at(a - hw * 1.45, rm), ...at(a, r1));
  c.quadraticCurveTo(...at(a + hw * 1.45, rm), ...at(a + hw, r0));
  c.arc(x, y, r0, a + hw, a - hw, true);
  c.closePath();
  if (fill) c.fill();
  else {
    c.lineWidth = lw;
    c.stroke();
  }
}

/** sole ornamentale blackwork: alone di puntini, corona di petali pieni, anello nero con perle in negativo, loto e fiore della vita */
function sunMandala(c: Ctx, rng: Rng, x: number, y: number, R: number, lw: number, petals = 16) {
  softDisk(c, x, y, R * 1.05, R * 1.8, 0.72);
  // dentro il sole la pelle resta chiara: solo un velo leggero verso il centro
  erase(c);
  dot(c, x, y, R * 0.7);
  ink(c);
  softDisk(c, x, y, 0, R * 0.7, 0.32);
  stippleRing(c, rng, x, y, R * 1.12, R * 1.85, Math.round(3.2e5 * R * R), lw * 0.55);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + Math.PI / petals;
    lotusPetal(c, x, y, a, R * 0.8, R * 1.14, (Math.PI / petals) * 0.86, true, lw);
    erase(c);
    line(c, x + Math.cos(a) * R * 0.86, y + Math.sin(a) * R * 0.86, x + Math.cos(a) * R * 1.0, y + Math.sin(a) * R * 1.0, lw * 0.8);
    ink(c);
    const b = a + Math.PI / petals;
    dot(c, x + Math.cos(b) * R * 1.08, y + Math.sin(b) * R * 1.08, lw * 1.3);
    dot(c, x + Math.cos(b) * R * 1.2, y + Math.sin(b) * R * 1.2, lw * 0.9);
  }
  circle(c, x, y, R * 0.74, R * 0.1);
  erase(c);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU;
    dot(c, x + Math.cos(a) * R * 0.74, y + Math.sin(a) * R * 0.74, R * 0.02);
  }
  ink(c);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    lotusPetal(c, x, y, a, R * 0.42, R * 0.66, (Math.PI / 12) * 0.82, false, lw);
    lotusPetal(c, x, y, a, R * 0.46, R * 0.57, (Math.PI / 12) * 0.3, true, lw);
  }
  circle(c, x, y, R * 0.4, lw * 1.6);
  flowerOfLife(c, x, y, R * 0.29, lw * 0.75);
  dot(c, x, y, R * 0.045);
}

/** fascia ornamentale che segue una linea del corpo: banda piena con perle in negativo, filo di perline, gocce pendenti */
function ornamentBand(c: Ctx, cv: Curve, o: { w: number; lw: number; side: 1 | -1; drops?: number; taper?: number; teeth?: boolean }) {
  const w = (f: number) => o.w * (1 - (o.taper ?? 0.5) * f);
  ribbon(c, cv, w);
  erase(c);
  along(cv, o.w * 1.3, (p, f) => dot(c, p.x, p.y, w(f) * 0.24));
  ink(c);
  strokeCurve(c, cv, o.lw * 0.8, (f) => -o.side * w(f) * 1.1);
  along(cv, o.w * 0.95, (p, f) => dot(c, ...offset(p, o.side * w(f) * 1.0), w(f) * 0.15));
  if (o.teeth) {
    // dentelli pieni dal lato opposto alle gocce
    along(cv, o.w * 0.9, (p, f) => {
      const h = w(f) * 0.9;
      const [bx, by] = offset(p, -o.side * w(f) * 1.35);
      poly(c, [
        [bx - p.tx * h * 0.42, by - p.ty * h * 0.42],
        [bx + p.tx * h * 0.42, by + p.ty * h * 0.42],
        offset({ ...p, x: bx, y: by }, -o.side * h),
      ]);
    });
  }
  if (o.drops) {
    along(cv, o.w * 1.9, (p, f, i) => {
      const len = (o.drops! * w(f)) / o.w * (i % 2 ? 0.55 : 1);
      const [x, y] = offset(p, o.side * w(f) * 1.35);
      line(c, ...offset(p, o.side * w(f) * 0.5), x, y, o.lw * 0.7);
      teardrop(c, x, y, len, len * 0.27, dirOf(p, o.side));
    });
  }
}

/** petalo di peonia: bordo frastagliato, ombra black & grey che sale dal cuore, pieghe sottili */
function peonyPetal(c: Ctx, rng: Rng, x: number, y: number, a: number, len: number, wid: number, lw: number) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (u: number, v: number): Pt => [x + ca * u - sa * v, y + sa * u + ca * v];
  const base = len * 0.1;
  const tips = [0, 1, 2].map(() => 1.07 + (rng() - 0.5) * 0.08);
  const path = () => {
    c.beginPath();
    c.moveTo(...P(base, -wid * 0.16));
    c.bezierCurveTo(...P(len * 0.42, -wid * 0.78), ...P(len * 0.86, -wid * 0.66), ...P(len * 0.96, -wid * 0.36));
    for (let k = 0; k < 3; k++) {
      const v0 = -0.36 + (0.72 * k) / 3;
      const v1 = -0.36 + (0.72 * (k + 1)) / 3;
      c.quadraticCurveTo(...P(len * tips[k], wid * (v0 + v1) * 0.5), ...P(len * (k === 2 ? 0.96 : 0.92), wid * v1));
    }
    c.bezierCurveTo(...P(len * 0.86, wid * 0.66), ...P(len * 0.42, wid * 0.78), ...P(base, wid * 0.16));
    c.closePath();
  };
  path();
  erase(c);
  c.fill();
  // ombra: scura al cuore del fiore, si apre verso il bordo lasciando la luce sul petalo
  c.save();
  path();
  c.clip();
  // la parte visibile del petalo va da ~0.7 a 1 della lunghezza: lì scuro alla base, chiaro sul bordo
  const g = c.createRadialGradient(x, y, len * 0.5, x, y, len * 1.02);
  g.addColorStop(0, grey(0.95));
  g.addColorStop(0.45, grey(0.62));
  g.addColorStop(1, grey(0.04));
  c.fillStyle = g;
  c.fillRect(x - len * 1.2, y - len * 1.2, len * 2.4, len * 2.4);
  // luce: una striscia chiara lungo il petalo
  erase(c);
  c.globalAlpha = 0.55;
  c.lineWidth = wid * 0.16;
  c.beginPath();
  c.moveTo(...P(len * 0.35, wid * 0.08));
  c.quadraticCurveTo(...P(len * 0.6, wid * 0.22), ...P(len * 0.85, wid * 0.12));
  c.stroke();
  c.restore();
  ink(c);
  path();
  c.lineWidth = lw;
  c.stroke();
  // pieghe
  c.lineWidth = lw * 0.5;
  for (const v of [-0.3, 0.02, 0.3]) {
    c.beginPath();
    c.moveTo(...P(len * 0.55, wid * v * 0.75));
    c.quadraticCurveTo(...P(len * 0.75, wid * v * 1.0), ...P(len * (0.86 + rng() * 0.06), wid * v * 1.05));
    c.stroke();
  }
}

/** peonia aperta vista dall'alto: quattro giri di petali, cuore di stami */
function peony(c: Ctx, rng: Rng, x: number, y: number, R: number, rot: number, lw: number) {
  softDisk(c, x, y, R * 0.95, R * 1.6, 0.78);
  stippleRing(c, rng, x, y, R * 1.0, R * 1.65, Math.round(2.2e5 * R * R), lw * 0.5);
  const layers = [
    { n: 7, r: 1, w: 0.66, off: 0 },
    { n: 6, r: 0.8, w: 0.64, off: 0.5 },
    { n: 5, r: 0.6, w: 0.66, off: 0.2 },
    { n: 4, r: 0.4, w: 0.74, off: 0.7 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = rot + ((i + L.off) / L.n) * TAU + (rng() - 0.5) * 0.3;
      peonyPetal(c, rng, x, y, a, R * L.r * (0.9 + rng() * 0.18), R * L.r * L.w, lw);
    }
  }
  dot(c, x, y, R * 0.12);
  erase(c);
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * R * 0.1;
    dot(c, x + Math.cos(a) * r, y + Math.sin(a) * r, lw * 0.6);
  }
  ink(c);
}

/** foglia a mandorla: una metà piena con nervature in negativo, l'altra a contorno */
function leafSolid(c: Ctx, x: number, y: number, a: number, len: number, wid: number, lw: number, flip: 1 | -1) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (u: number, v: number): Pt => [x + ca * u - sa * v, y + sa * u + ca * v];
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(...P(len * 0.42, wid * flip), ...P(len, 0));
  c.closePath();
  c.fill();
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(...P(len * 0.42, -wid * flip), ...P(len, 0));
  c.stroke();
  line(c, x, y, ...P(len * 0.9, 0), lw * 0.6);
  erase(c);
  for (let k = 1; k <= 3; k++) {
    const u = (len * k) / 4.4;
    line(c, ...P(u, 0), ...P(u + len * 0.14, wid * flip * 0.36), lw * 0.5);
  }
  ink(c);
  for (let k = 1; k <= 3; k++) {
    const u = (len * k) / 4.4;
    line(c, ...P(u, 0), ...P(u + len * 0.14, -wid * flip * 0.34), lw * 0.4);
  }
}

/** bocciolo chiuso con sepali */
function bud(c: Ctx, rng: Rng, x: number, y: number, a: number, len: number, lw: number) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (u: number, v: number): Pt => [x + ca * u - sa * v, y + sa * u + ca * v];
  const w = len * 0.42;
  const path = () => {
    c.beginPath();
    c.moveTo(...P(len * 0.15, 0));
    c.bezierCurveTo(...P(len * 0.2, -w), ...P(len * 0.8, -w * 0.9), ...P(len, 0));
    c.bezierCurveTo(...P(len * 0.8, w * 0.9), ...P(len * 0.2, w), ...P(len * 0.15, 0));
  };
  path();
  erase(c);
  c.fill();
  c.save();
  path();
  c.clip();
  const [gx, gy] = P(len * 0.15, 0);
  const g = c.createRadialGradient(gx, gy, 0, gx, gy, len * (0.7 + rng() * 0.1));
  g.addColorStop(0, grey(0.95));
  g.addColorStop(1, grey(0));
  c.fillStyle = g;
  c.fillRect(gx - len * 1.2, gy - len * 1.2, len * 2.4, len * 2.4);
  c.restore();
  ink(c);
  path();
  c.lineWidth = lw;
  c.stroke();
  c.lineWidth = lw * 0.6;
  c.beginPath();
  c.moveTo(...P(len * 0.3, -w * 0.5));
  c.quadraticCurveTo(...P(len * 0.65, w * 0.1), ...P(len * 0.98, w * 0.05));
  c.stroke();
  for (const s of [-1, 1]) leafSolid(c, ...P(len * 0.12, 0), a + s * 0.55, len * 0.55, len * 0.16, lw, s > 0 ? 1 : -1);
}

/** rosario lungo la spina dorsale: filo, cerchi che si stringono scendendo, goccia finale */
function rosary(c: Ctx, x: number, y0: number, y1: number, r0: number, lw: number) {
  line(c, x, y0, x, y1, lw * 1.2);
  const n = Math.floor((y0 - y1) / (r0 * 2.7));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const y = y0 - i * r0 * 2.7 - r0;
    const r = r0 * (1 - t * 0.45);
    erase(c);
    dot(c, x, y, r + lw * 1.5);
    ink(c);
    circle(c, x, y, r, lw * 1.4);
    dot(c, x, y, i % 3 === 0 ? r * 0.55 : lw * 1.5);
  }
  teardrop(c, x, y1 - lw, r0 * 2.2, r0 * 0.45);
}

// ------------------------------------------------------------------ disegni
type Design = (p: TorsoPen, rng: Rng) => void;

/**
 * Belvedere · blackwork ornamentale: sole sullo sterno, fasce lungo il bordo dei pettorali e le clavicole,
 * mandala sul moncherino del braccio sinistro, costole segnate da fasce che salgono verso la schiena
 * e un rosario di cerchi lungo la spina dorsale. Tutto sopra la linea del ventre.
 */
const belvedere: Design = ({ c, C, wrap }, rng) => {
  const lw = 0.0022;
  const back = C / 2;
  // costole del fianco sinistro: dal davanti salgono verso la schiena, come il dentato
  // la prima prosegue sotto la scapola e risale fino alla spina
  const ribs = [0, 1, 2, 3].map((k) =>
    spline([
      [-0.19, 0.8 - k * 0.05],
      [-0.29, 0.808 - k * 0.048],
      [-0.4, 0.832 - k * 0.045],
      [-0.52, 0.868 - k * 0.042],
      [-(back - 0.1), 0.9 - k * 0.04],
      ...(k === 0
        ? ([
            [-(back - 0.055), 0.95],
            [-(back - 0.03), 1.0],
            [-(back - 0.022), 1.04],
          ] as Pt[])
        : []),
    ]),
  );
  // scapola: un arco che parte dalla spina e abbraccia la spalla
  const scap = spline([
    [-(back - 0.06), 1.075],
    [-(back - 0.13), 1.04],
    [-(back - 0.19), 0.98],
    [-(back - 0.21), 0.92],
  ]);
  const pecs = ([-1, 1] as const).map((s) =>
    spline([
      [s * 0.085, 0.9],
      [s * 0.135, 0.86],
      [s * 0.2, 0.854],
      [s * 0.27, 0.886],
    ]),
  );
  // prima le ombre (black & grey), poi la puntinatura, sopra le linee
  ribs.forEach((rib, k) => softCurve(c, rib, 0.052 - k * 0.006, 0.66 - k * 0.07, 0.024));
  softCurve(c, scap, 0.05, 0.55, -0.022);
  pecs.forEach((pec, i) => softCurve(c, pec, 0.064, 0.7, (i ? -1 : 1) * 0.028));
  softDisk(c, -0.25, 0.83, 0.01, 0.075, 0.45);
  ribs.forEach((rib, k) => stippleCurve(c, rng, rib, 900 - k * 150, 0.036, 0.00115, 1, 0.014));
  pecs.forEach((pec, i) => stippleCurve(c, rng, pec, 900, 0.045, 0.00115, i ? -1 : 1, 0.02));
  ribs.forEach((rib, k) => ornamentBand(c, rib, { w: 0.0125 * (1 - k * 0.13), lw, side: 1, drops: k < 3 ? 0.024 : 0, taper: 0.55, teeth: k === 0 }));
  ornamentBand(c, scap, { w: 0.0115, lw, side: -1, drops: 0.022, taper: 0.3, teeth: true });
  pecs.forEach((pec, i) => ornamentBand(c, pec, { w: 0.0145, lw, side: i ? -1 : 1, drops: 0.032, taper: 0.4, teeth: true }));
  for (const s of [-1, 1] as const) {
    const clav = spline([
      [s * 0.085, 1.0],
      [s * 0.15, 1.034],
      [s * 0.225, 1.048],
    ]);
    ornamentBand(c, clav, { w: 0.009, lw, side: s > 0 ? 1 : -1, drops: 0.016, taper: 0.5 });
  }
  // catena dello sterno: rombi e perle fin sopra l'ombelico
  for (let y = 0.858, i = 0; y > 0.715; y -= 0.0145, i++) {
    const t = (0.858 - y) / 0.15;
    if (i % 3 === 0) diamond(c, 0, y, 0.011 * (1 - t * 0.4), 0.018 * (1 - t * 0.4));
    else dot(c, 0, y, 0.0036 * (1 - t * 0.4));
  }
  teardrop(c, 0, 0.703, 0.026, 0.0072);
  sunMandala(c, rng, 0, 0.955, 0.085, lw);
  // spalla sinistra (moncherino del braccio)
  sunMandala(c, rng, -0.31, 0.905, 0.06, lw, 12);
  // schiena: rosario lungo la spina (sul bordo del canvas: wrap lo porta su entrambi i lati della cucitura)
  wrap(() => rosary(c, back, 1.1, 0.64, 0.016, lw));
};

/**
 * Psiche · botanico pieno: due peonie e un ramo che parte dalla clavicola sinistra, avvolge il moncherino
 * e scende lungo il fianco fino all'anca; pizzo sotto il seno con medaglione sullo sterno e lampadario di gocce;
 * un rametto sulla clavicola destra. Nulla sotto il ventre, niente sui capezzoli.
 */
const psiche: Design = ({ c }, rng) => {
  const lw = 0.0016;
  const cy = 0.444;
  const wings = ([-1, 1] as const).map((s) =>
    spline([
      [s * 0.034, cy + 0.004],
      [s * 0.068, cy - 0.003],
      [s * 0.106, cy + 0.01],
      [s * 0.14, cy + 0.036],
      [s * 0.158, cy + 0.066],
    ]),
  );
  const stem = spline([
    [-0.035, 0.69],
    [-0.1, 0.676],
    [-0.162, 0.648],
    [-0.205, 0.59],
    [-0.203, 0.52],
    [-0.172, 0.45],
    [-0.128, 0.37],
    [-0.112, 0.29],
    [-0.098, 0.218],
  ]);
  // rametto che dalla peonia del fianco gira verso la schiena
  const twig = spline([
    [-0.15, 0.33],
    [-0.195, 0.305],
    [-0.235, 0.27],
    [-0.255, 0.225],
  ]);
  const sprig = spline([
    [0.035, 0.69],
    [0.085, 0.682],
    [0.128, 0.668],
    [0.155, 0.646],
  ]);
  // ombre morbide sotto tutto
  wings.forEach((wing, i) => softCurve(c, wing, 0.032, 0.5, (i ? -1 : 1) * 0.013));
  softCurve(c, stem, 0.075, 0.6);
  softCurve(c, twig, 0.038, 0.45);
  // ---- pizzo sotto il seno
  wings.forEach((wing, i) => ornamentBand(c, wing, { w: 0.0062, lw, side: i ? -1 : 1, drops: 0.016, taper: 0.55, teeth: true }));
  for (let k = -3; k <= 3; k++) {
    const x = k * 0.0128;
    const top = cy - 0.036 + Math.abs(k) * 0.0042;
    chain(c, x, top, 0.046 - Math.abs(k) * 0.0105, 0.0055, 0.00155, 0.012, 0.0034);
  }
  // catenella tra i seni
  for (let y = cy + 0.042, i = 0; y < 0.598; y += 0.0085, i++) {
    if (i % 3 === 1) diamond(c, 0, y, 0.005, 0.0085);
    else dot(c, 0, y, 0.00155);
  }
  crescent(c, 0, 0.607, 0.0068, Math.PI / 2);
  // medaglione
  erase(c);
  dot(c, 0, cy, 0.038);
  ink(c);
  mandala(c, rng, 0, cy, 0.026, lw, 12);
  circle(c, 0, cy, 0.031, lw * 2.6);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    dot(c, Math.cos(a) * 0.0355, cy + Math.sin(a) * 0.0355, i % 2 ? 0.0009 : 0.0014);
  }

  // ---- ramo principale sul lato sinistro
  ribbon(c, stem, (f) => 0.0018 + 0.0028 * Math.sin(Math.PI * (0.15 + f * 0.85)));
  ribbon(c, twig, (f) => 0.0028 * (1 - f * 0.6));
  along(stem, 0.026, (p, f, i) => {
    const side = i % 2 ? 1 : -1;
    const a = Math.atan2(p.ty, p.tx) + side * (0.7 + rng() * 0.35);
    leafSolid(c, p.x, p.y, a, 0.028 + rng() * 0.014 + Math.sin(f * Math.PI) * 0.01, 0.012, lw, side > 0 ? 1 : -1);
  }, 0.04, 0.95);
  along(twig, 0.022, (p, _f, i) => {
    const side = i % 2 ? 1 : -1;
    leafSolid(c, p.x, p.y, Math.atan2(p.ty, p.tx) + side * 0.8, 0.022 + rng() * 0.008, 0.0095, lw, side > 0 ? 1 : -1);
  }, 0.1, 1);
  bud(c, rng, -0.255, 0.225, -2.0, 0.03, lw);
  bud(c, rng, -0.098, 0.218, -1.7, 0.04, lw);
  bud(c, rng, -0.035, 0.69, 0.2, 0.028, lw);
  peony(c, rng, -0.118, 0.352, 0.062, 1.1, lw);
  peony(c, rng, -0.198, 0.575, 0.056, 0.3, lw);

  // ---- rametto sulla clavicola destra
  softCurve(c, sprig, 0.032, 0.42);
  ribbon(c, sprig, (f) => 0.0026 * (1 - f * 0.6));
  along(sprig, 0.02, (p, _f, i) => {
    const side = i % 2 ? 1 : -1;
    leafSolid(c, p.x, p.y, Math.atan2(p.ty, p.tx) + side * 0.8, 0.02 + rng() * 0.008, 0.0088, lw, side > 0 ? 1 : -1);
  }, 0, 0.88);
  bud(c, rng, 0.155, 0.646, -0.7, 0.026, lw);
};

/** Doriforo · corazza blackwork sul petto, fascia sulla schiena, punte lungo la spina */
const doriforo: Design = ({ c, C, H, wrap }) => {
  const lw = 0.0055;
  const v = (f: number) => f * H;
  // la corazza copre petto e addome alto: la punta si ferma sopra l'ombelico
  poly(c, [
    [0, v(0.86)],
    [0.17, v(0.8)],
    [0.12, 1.02],
    [0, 0.955],
    [-0.12, 1.02],
    [-0.17, v(0.8)],
  ]);
  erase(c);
  dot(c, 0, 1.1, 0.05);
  ink(c);
  circle(c, 0, 1.1, 0.038, lw);
  dot(c, 0, 1.1, 0.012);
  // fascia sotto le scapole
  const belt = v(0.8);
  wrap(() => c.fillRect(-C / 2 - 0.2, belt - 0.0175, 0.4, 0.035));
  erase(c);
  wrap(() => {
    for (let x = -C / 2 - 0.2; x < -C / 2 + 0.2; x += 0.04) dot(c, x + 0.02, belt, 0.008);
  });
  ink(c);
  wrap(() =>
    poly(c, [
      [-C / 2 - 0.06, v(0.9)],
      [-C / 2 + 0.06, v(0.9)],
      [-C / 2, v(0.62)],
    ]),
  );
};

/** Apollo · fiore della vita sullo sterno, crepe kintsugi dalle spalle, perle fin sopra l'ombelico */
const apollo: Design = ({ c, C, H }, rng) => {
  const lw = 0.0055;
  const v = (f: number) => f * H;
  // il torso è ruotato: lo sterno cade un po' a sinistra del centro della carta
  c.translate(-0.09, 0);
  flowerOfLife(c, 0, v(0.7), 0.07, lw);
  for (const s of [-1, 1]) cracks(c, rng, s * 0.12 * C, v(0.82), 0.22, -Math.PI / 2 - s * 0.3, lw);
  for (let i = 0; i < 9; i++) dot(c, 0, v(0.7) - 0.11 - i * 0.014, lw * (i % 4 === 0 ? 2 : 1.1));
};

/** Iris · crepe che scendono dalle spalle, fiore della vita sulla schiena, un cerchio sul ventre */
const iris: Design = ({ c, C, H, wrap }, rng) => {
  const lw = 0.006;
  const v = (f: number) => f * H;
  for (let i = 0; i < 9; i++) cracks(c, rng, (rng() - 0.5) * C, v(0.95 - rng() * 0.2), 0.3 + rng() * 0.2, -Math.PI / 2 + (rng() - 0.5), lw * 1.1);
  wrap(() => flowerOfLife(c, -C / 2, v(0.62), 0.08, lw));
  circle(c, 0, v(0.45), 0.035, lw);
};

/** Valentini · bodysuit ornamentale di cerchi a densità variabile, ensō sullo sterno */
const valentini: Design = ({ c, C, H }, rng) => {
  const step = 0.045;
  const belt = BELT.valentini;
  for (let y = H; y > belt; y -= step * 0.866) {
    const row = Math.round(y / (step * 0.866));
    // la trama si dirada verso la vita invece di finire con un bordo netto
    const fade = Math.min(1, (y - belt) / 0.14);
    for (let x = -C / 2 + (row % 2) * step * 0.5; x < C / 2; x += step) {
      const k = 0.5 + 0.5 * Math.sin((y / H) * 7 + (x / C + 0.5) * Math.PI * 4);
      if (rng() > (0.15 + k * 0.6) * fade) continue;
      circle(c, x, y, step * (0.18 + k * 0.22), 0.0031);
      if (k > 0.6) dot(c, x, y, 0.0033);
    }
  }
  erase(c);
  dot(c, 0, 1.0, 0.08);
  ink(c);
  enso(c, rng, 0, 1.0, 0.062, 0.009);
};

/** sotto questa quota (m) niente inchiostro: bacino, pube, cosce */
const BELT: Record<TorsoVariant, number> = {
  belvedere: 0.6,
  psiche: 0.19,
  doriforo: 0.9,
  apollo: 0.8,
  iris: 0.55,
  valentini: 0.8,
};

const DESIGNS: Record<TorsoVariant, { draw: Design; seed: number; px: number }> = {
  belvedere: { draw: belvedere, seed: 5101, px: 3072 },
  psiche: { draw: psiche, seed: 5202, px: 2560 },
  doriforo: { draw: doriforo, seed: 5303, px: 2048 },
  apollo: { draw: apollo, seed: 5404, px: 2048 },
  iris: { draw: iris, seed: 5505, px: 2048 },
  valentini: { draw: valentini, seed: 5606, px: 2048 },
};

export function makeTorsoTattooCanvas(variant: TorsoVariant, frame: TorsoFrame, scale: number, grid = false): HTMLCanvasElement {
  const d = DESIGNS[variant];
  const pen = makeTorsoPen(frame, Math.round(d.px * scale));
  if (grid) {
    debugGrid(pen);
    return pen.canvas;
  }
  const { c, C, H } = pen;
  c.save();
  c.beginPath();
  c.rect(-C * 2, BELT[variant], C * 4, H);
  c.clip();
  d.draw(pen, mulberry32(d.seed));
  c.restore();
  return pen.canvas;
}
