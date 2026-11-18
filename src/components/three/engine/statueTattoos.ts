/**
 * Tatuaggi delle statue in proiezione planare (canvas 2D → maschera, inchiostro = bianco).
 *
 * Il canvas copre un rettangolo nello spazio oggetto del modello (metri, y in alto), visto lungo
 * la direzione di proiezione (yaw attorno a Y, 0 = fronte +Z). Si disegna direttamente in metri:
 * le coordinate dei punti anatomici sono state lette da viste ortografiche con griglia.
 * Disegni procedurali originali: non sono lavori dello studio.
 */
import {
  arcText,
  circle,
  dot,
  dotworkGradient,
  enso,
  flowerOfLife,
  leaf,
  mandala,
  mulberry32,
  stippleRing,
  type Ctx,
  type Rng,
} from "./tattoo";

export interface Rect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export interface StatueTattoo {
  canvas: HTMLCanvasElement;
  rect: Rect;
  yaw: number;
  /** origine della propagazione dell'inchiostro, in uv del rettangolo */
  origin: [number, number];
}

type Pt = [number, number];
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ primitive metriche
const ink = (c: Ctx) => {
  c.fillStyle = "#fff";
  c.strokeStyle = "#fff";
};
const erase = (c: Ctx) => {
  c.fillStyle = "#000";
  c.strokeStyle = "#000";
};

function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, w: number) {
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function poly(c: Ctx, pts: Pt[]) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

function diamond(c: Ctx, x: number, y: number, w: number, h: number) {
  poly(c, [
    [x - w / 2, y],
    [x, y + h / 2],
    [x + w / 2, y],
    [x, y - h / 2],
  ]);
}

/** goccia piena: punta in (x, y), bulbo lungo la direzione `ang` */
function teardrop(c: Ctx, x: number, y: number, len: number, r: number, ang = -Math.PI / 2) {
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

function crescent(c: Ctx, x: number, y: number, r: number, ang: number) {
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
function swag(c: Ctx, x1: number, y1: number, x2: number, y2: number, sag: number, o: SwagOpts) {
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
function chain(c: Ctx, x: number, y: number, len: number, step: number, bead: number, dropLen: number, dropR: number) {
  for (let d = 0; d <= len; d += step) dot(c, x, y - d, bead * (1 - (d / len) * 0.25));
  teardrop(c, x, y - len - step * 0.6, dropLen, dropR);
}

function beadsArc(c: Ctx, cx: number, cy: number, r: number, n: number, size: number, a0 = Math.PI, a1 = TAU) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    dot(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, size);
  }
}

function arcStroke(c: Ctx, cx: number, cy: number, r: number, w: number, a0 = Math.PI, a1 = TAU) {
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

function lace(c: Ctx, x0: number, x1: number, y: number, r: number, lw: number) {
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

/** serpente blackwork lungo una spline: corpo pieno, scaglie in negativo, testa con lingua biforcuta */
function serpent(c: Ctx, ctrl: Pt[], wMax: number, lw: number) {
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  const pts: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let j = 0; j < 30; j++) {
      const t = j / 30;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const width = (s: number) => {
    const t = s / total;
    return wMax * (t < 0.55 ? 0.06 + 0.94 * Math.sin((t / 0.55) * (Math.PI / 2)) : 1 - (t - 0.55) * 0.5);
  };
  const tangent = (i: number): Pt => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const side = (i: number, k: number): Pt => {
    const [tx, ty] = tangent(i);
    const w = (width(L[i]) / 2) * k;
    return [pts[i][0] - ty * w, pts[i][1] + tx * w];
  };
  const at = (s: number) => {
    let i = 0;
    while (i < L.length - 1 && L[i] < s) i++;
    return i;
  };
  // corpo
  ink(c);
  const left = pts.map((_, i) => side(i, 1));
  const right = pts.map((_, i) => side(i, -1)).reverse();
  poly(c, [...left, ...right]);
  // scaglie: reticolo a rombi in negativo
  erase(c);
  const step = wMax * 0.3;
  for (let s = step * 0.5; s < total - step; s += step) {
    const i0 = at(s);
    const i1 = at(s + step);
    const a = side(i0, 0.86);
    const b = side(i1, -0.86);
    const a2 = side(i0, -0.86);
    const b2 = side(i1, 0.86);
    line(c, a[0], a[1], b[0], b[1], lw * 0.45);
    line(c, a2[0], a2[1], b2[0], b2[1], lw * 0.45);
  }
  // dorso: rombi pieni lungo la spina
  for (let s = step; s < total - step * 1.5; s += step * 2) {
    const i = at(s);
    const [tx, ty] = tangent(i);
    const w = width(s) * 0.24;
    const [x, y] = pts[i];
    poly(c, [
      [x + tx * w * 1.4, y + ty * w * 1.4],
      [x - ty * w * 0.6, y + tx * w * 0.6],
      [x - tx * w * 1.4, y - ty * w * 1.4],
      [x + ty * w * 0.6, y - tx * w * 0.6],
    ]);
  }
  ink(c);
  // testa
  const end = pts[pts.length - 1];
  const [dx, dy] = tangent(pts.length - 1);
  const nx = -dy;
  const ny = dx;
  const we = width(total) / 2;
  const H = (f: number, g: number): Pt => [end[0] + dx * f + nx * g, end[1] + dy * f + ny * g];
  const hw = wMax * 0.62;
  c.beginPath();
  const head: Pt[] = [H(-0.01, we), H(wMax * 0.5, hw), H(wMax * 1.05, hw * 0.55), H(wMax * 1.3, 0), H(wMax * 1.05, -hw * 0.55), H(wMax * 0.5, -hw), H(-0.01, -we)];
  poly(c, head);
  erase(c);
  for (const s of [1, -1]) {
    const [ex, ey] = H(wMax * 0.62, s * hw * 0.55);
    dot(c, ex, ey, wMax * 0.11);
    const [cx1, cy1] = H(wMax * 0.25, s * hw * 0.3);
    const [cx2, cy2] = H(wMax * 0.9, s * hw * 0.15);
    line(c, cx1, cy1, cx2, cy2, lw * 0.5);
  }
  ink(c);
  for (const s of [1, -1]) {
    const [ex, ey] = H(wMax * 0.62, s * hw * 0.55);
    dot(c, ex + dx * wMax * 0.02, ey + dy * wMax * 0.02, wMax * 0.035);
  }
  // lingua
  const [tx0, ty0] = H(wMax * 1.3, 0);
  const [tx1, ty1] = H(wMax * 1.9, 0);
  line(c, tx0, ty0, tx1, ty1, lw * 0.7);
  for (const s of [1, -1]) {
    const [fx, fy] = H(wMax * 2.2, s * wMax * 0.22);
    line(c, tx1, ty1, fx, fy, lw * 0.6);
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

const uvOf = (r: Rect, x: number, y: number): [number, number] => [(x - r.x0) / r.w, (y - r.y0) / r.h];

// ------------------------------------------------------------------ disegni
type Design = (c: Ctx, rng: Rng, font: string, pen: ReturnType<typeof makePen>) => Pt;

/** Costanza (Bernini): gioielli d'inchiostro, medaglione sullo sterno, collana, volto ornato */
const costanza: Design = (c, rng) => {
  const lw = 0.0017;
  line(c, -0.05, 0.375, 0.066, 0.377, lw);
  line(c, -0.05, 0.367, 0.066, 0.369, lw);
  for (let x = -0.044; x <= 0.062; x += 0.0072) dot(c, x, 0.371 + (x + 0.05) * 0.017, 0.00125);
  line(c, 0.008, 0.367, 0.008, 0.36, lw * 0.8);
  circle(c, 0.008, 0.354, 0.0058, lw * 1.2);
  dot(c, 0.008, 0.354, 0.0024);
  teardrop(c, 0.008, 0.3475, 0.011, 0.0034);

  const cx = -0.007;
  const cy = 0.292;
  mandala(c, rng, cx, cy, 0.03, lw * 0.9, 12);
  circle(c, cx, cy, 0.0345, lw * 2.4);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    dot(c, cx + Math.cos(a) * 0.04, cy + Math.sin(a) * 0.04, i % 2 ? 0.0011 : 0.0018);
  }
  for (const s of [-1, 1]) {
    swag(c, cx + s * 0.04, cy + 0.012, s * 0.098, 0.322, 0.012, { lw, bead: 0.0013, step: 0.0066, dropEvery: 3, drop: 0.0095 });
    swag(c, cx + s * 0.037, cy - 0.014, s * 0.074, 0.303, 0.02, { lw: lw * 0.8, bead: 0.001, step: 0.006, dropEvery: 2, drop: 0.0075 });
  }
  chain(c, cx, cy - 0.044, 0.07, 0.0056, 0.0014, 0.017, 0.005);
  chain(c, cx - 0.014, cy - 0.04, 0.042, 0.0056, 0.0011, 0.012, 0.0037);
  chain(c, cx + 0.014, cy - 0.04, 0.042, 0.0056, 0.0011, 0.012, 0.0037);

  for (const [ex, dir] of [
    [-0.022, -1],
    [0.035, 1],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      dot(c, ex + dir * (-0.006 + t * 0.022), 0.4772 - Math.sin(t * Math.PI) * 0.0032 + t * 0.003, 0.0008 + t * 0.0009);
    }
  }
  circle(c, 0.008, 0.538, 0.0058, lw);
  dot(c, 0.008, 0.538, 0.0019);
  dot(c, 0.013, 0.4178, 0.0014);
  dot(c, 0.013, 0.4118, 0.0011);
  dot(c, 0.013, 0.4068, 0.0008);
  crescent(c, 0.071, 0.506, 0.0088, Math.PI * 0.15);
  dot(c, 0.079, 0.493, 0.0013);
  dot(c, 0.076, 0.487, 0.0009);
  return [cx, cy];
};

/** Antinoo: corazza blackwork, anello pieno con scritta in negativo, raggi e fiore della vita */
const antinoo: Design = (c, rng, font, pen) => {
  const lw = 0.0024;
  const cx = 0;
  const cy = 0.31;
  clip(c, -0.27, 0.212, 0.54, 0.222, () => {
    stippleRing(c, rng, cx, cy, 0.104, 0.215, 7000, 0.0011);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const r0 = 0.118;
      const r1 = i % 2 === 0 ? 0.192 : 0.152;
      const hw = (Math.PI / 48) * 0.62;
      poly(c, [
        [cx + Math.cos(a - hw) * r0, cy + Math.sin(a - hw) * r0],
        [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
        [cx + Math.cos(a + hw) * r0, cy + Math.sin(a + hw) * r0],
      ]);
    }
  });
  circle(c, cx, cy, 0.101, 0.019);
  // scritta in negativo dentro l'anello
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = "#000";
  const [px, py] = pen.toPx(cx, cy);
  arcText(c, "OGNI LINEA COMINCIA DA UN CERCHIO  ·  PERFECT CIRCLE  ·", px, py, 0.101 * pen.k, -Math.PI / 2, `600 ${Math.round(0.0118 * pen.k)}px ${font}`, 0.0042 * pen.k);
  c.restore();
  ink(c);
  flowerOfLife(c, cx, cy, 0.066, lw * 0.85);
  dot(c, cx, cy, 0.006);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = s * (0.05 + t * 0.18);
      const y = 0.432 + t * 0.036;
      const size = 0.0095 - t * 0.0045;
      diamond(c, x, y, size * 0.62, size);
      if (i < 8) dot(c, x + s * 0.0113, y + 0.0023, 0.0012);
    }
  }
  c.fillRect(-0.28, 0.218, 0.56, 0.017);
  erase(c);
  for (let x = -0.27; x <= 0.27; x += 0.017) dot(c, x, 0.2265, 0.0045);
  ink(c);
  line(c, 0, 0.413, 0, 0.427, lw);
  circle(c, 0.035, 0.603, 0.0075, lw * 0.8);
  dot(c, 0.035, 0.603, 0.0029);
  return [cx, cy];
};

/** Nefertiti: collare usekh, anelli sul collo, occhi alati, disco solare sulla corona (oro su pietra nera) */
const nefertiti: Design = (c, rng) => {
  const lw = 0.0014;
  const ccx = -0.02;
  const ccy = 0.245;
  clip(c, -0.125, 0.095, 0.21, 0.111, () => {
    arcStroke(c, ccx, ccy, 0.044, lw * 1.5);
    beadsArc(c, ccx, ccy, 0.0505, 30, 0.0016);
    arcStroke(c, ccx, ccy, 0.057, lw);
    for (let i = 0; i <= 26; i++) {
      const a = Math.PI + (Math.PI * i) / 26;
      teardrop(c, ccx + Math.cos(a) * 0.061, ccy + Math.sin(a) * 0.061, 0.0145, 0.0036, a);
    }
    arcStroke(c, ccx, ccy, 0.079, lw * 1.3);
    beadsArc(c, ccx, ccy, 0.0845, 44, 0.0013);
    arcStroke(c, ccx, ccy, 0.0895, lw);
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (Math.PI * i) / 20;
      leaf(c, ccx + Math.cos(a) * 0.094, ccy + Math.sin(a) * 0.094, a, 0.024, lw);
      dot(c, ccx + Math.cos(a) * 0.112, ccy + Math.sin(a) * 0.112, 0.0018);
    }
    arcStroke(c, ccx, ccy, 0.122, lw * 2.4);
    beadsArc(c, ccx, ccy, 0.1285, 60, 0.0016);
  });
  [0.212, 0.222, 0.232, 0.242].forEach((y, i) => {
    const hw = 0.041 - (y - 0.212) * 0.12;
    line(c, -0.005 - hw, y, -0.005 + hw, y, lw * (i === 0 ? 1.8 : 1.1));
  });
  for (let x = -0.04; x <= 0.03; x += 0.0062) dot(c, x, 0.227, 0.0011);
  const wing = (x: number, y: number, s: number) => {
    c.beginPath();
    c.moveTo(x, y + 0.0016);
    c.quadraticCurveTo(x + s * 0.013, y + 0.0032, x + s * 0.027, y + 0.016);
    c.quadraticCurveTo(x + s * 0.014, y - 0.0008, x, y - 0.0019);
    c.closePath();
    c.fill();
  };
  wing(-0.059, 0.383, -1);
  wing(0.034, 0.383, 1);
  teardrop(c, -0.05, 0.3715, 0.012, 0.0028);
  teardrop(c, 0.025, 0.3715, 0.012, 0.0028);
  circle(c, -0.009, 0.408, 0.0056, lw);
  dot(c, -0.009, 0.408, 0.0019);
  line(c, -0.008, 0.296, -0.008, 0.2855, lw * 1.2);
  dot(c, -0.008, 0.2805, 0.0019);
  for (let x = -0.084; x <= 0.068; x += 0.0127) {
    circle(c, x, 0.437, 0.0042, lw * 0.9);
    dot(c, x, 0.437, 0.0014);
  }
  line(c, -0.09, 0.4465, 0.075, 0.4465, lw);
  line(c, -0.09, 0.4275, 0.075, 0.4275, lw);
  enso(c, rng, -0.01, 0.535, 0.03, 0.0026);
  circle(c, -0.01, 0.535, 0.019, lw);
  dot(c, -0.01, 0.535, 0.004);
  c.lineWidth = lw;
  c.beginPath();
  for (let i = 0; i <= 26; i++) {
    const x = -0.108 + i * 0.008;
    const y = 0.578 + (i % 2 ? 0.0055 : -0.0055);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.stroke();
  return [ccx, 0.19];
};

/** Testa del David: serpente sul collo, cerchio sulla fronte, lacrime sotto l'occhio */
const david: Design = (c) => {
  const lw = 0.0045;
  serpent(
    c,
    [
      [0.3, 0.075],
      [0.14, 0.11],
      [-0.08, 0.15],
      [-0.2, 0.235],
      [-0.12, 0.33],
      [0.07, 0.37],
      [0.19, 0.44],
      [0.2, 0.51],
      [0.155, 0.555],
    ],
    0.058,
    lw,
  );
  circle(c, 0.045, 0.985, 0.032, 0.0095);
  dot(c, 0.045, 0.985, 0.009);
  teardrop(c, -0.08, 0.84, 0.024, 0.0075);
  teardrop(c, -0.083, 0.808, 0.019, 0.006);
  teardrop(c, -0.086, 0.781, 0.015, 0.0045);
  return [0.0, 0.3];
};

/** Venere, la Custode: bodysuit ornamentale, corona sull'attaccatura dei capelli. La veste d'inchiostro è nello shader. */
const venere: Design = (c, rng) => {
  const lw = 0.0026;
  for (let i = 0; i < 9; i++) {
    const x = -0.034 + i * 0.0125;
    const y = 1.912 + Math.sin((i / 8) * Math.PI) * 0.004;
    const tall = i % 2 === 0;
    poly(c, [
      [x - 0.0048, y],
      [x, y + (tall ? 0.018 : 0.011)],
      [x + 0.0048, y],
    ]);
    if (tall) dot(c, x, y + 0.0225, 0.0022);
  }
  line(c, -0.04, 1.91, 0.075, 1.91, lw * 0.8);
  teardrop(c, 0.057, 1.856, 0.011, 0.003);
  dot(c, 0.026, 1.806, 0.0018);
  dot(c, 0.026, 1.799, 0.0014);

  line(c, -0.075, 1.752, 0.052, 1.758, lw);
  line(c, -0.075, 1.744, 0.052, 1.75, lw);
  for (let x = -0.07; x <= 0.05; x += 0.0085) dot(c, x, 1.748 + (x + 0.075) * 0.047, 0.0014);
  chain(c, -0.01, 1.741, 0.026, 0.0065, 0.0017, 0.014, 0.0042);

  swag(c, -0.012, 1.698, -0.205, 1.665, 0.028, { lw, bead: 0.0019, step: 0.0095, dropEvery: 2, drop: 0.013 });
  swag(c, -0.004, 1.698, 0.19, 1.726, 0.028, { lw, bead: 0.0019, step: 0.0095, dropEvery: 2, drop: 0.013 });

  mandala(c, rng, 0.022, 1.615, 0.05, lw, 14);
  circle(c, 0.022, 1.615, 0.056, lw * 2.6);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    dot(c, 0.022 + Math.cos(a) * 0.0625, 1.615 + Math.sin(a) * 0.0625, i % 2 ? 0.0014 : 0.0024);
  }
  chain(c, 0.024, 1.551, 0.02, 0.0065, 0.0018, 0.0001, 0.0001);
  flowerOfLife(c, 0.03, 1.495, 0.026, lw * 0.85);
  circle(c, 0.03, 1.495, 0.032, lw * 2.2);
  swag(c, 0.0, 1.47, -0.14, 1.445, -0.012, { lw, bead: 0.0016, step: 0.009, dropEvery: 2, drop: 0.012 });
  swag(c, 0.06, 1.47, 0.205, 1.472, -0.012, { lw, bead: 0.0016, step: 0.009, dropEvery: 2, drop: 0.012 });
  for (let d = 0; d < 0.16; d += 0.0095) {
    const t = d / 0.16;
    dot(c, 0.032 + t * 0.022, 1.458 - d, 0.0021 - t * 0.0006);
    if (Math.round(d / 0.0095) % 4 === 2) diamond(c, 0.032 + t * 0.022, 1.458 - d, 0.007, 0.011);
  }
  circle(c, 0.056, 1.262, 0.02, lw * 1.5);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    dot(c, 0.056 + Math.cos(a) * 0.027, 1.262 + Math.sin(a) * 0.027, 0.0017);
  }

  mandala(c, rng, -0.19, 1.6, 0.045, lw * 0.9, 12);
  circle(c, -0.19, 1.6, 0.05, lw * 2.2);
  mandala(c, rng, 0.185, 1.69, 0.034, lw * 0.9, 10);
  circle(c, 0.185, 1.69, 0.039, lw * 2.2);

  line(c, -0.25, 1.468, -0.125, 1.478, lw);
  line(c, -0.25, 1.52, -0.125, 1.53, lw);
  c.fillRect(-0.25, 1.48, 0.125, 0.011);
  for (let x = -0.245; x < -0.13; x += 0.0125) {
    poly(c, [
      [x, 1.493],
      [x + 0.00625, 1.512],
      [x + 0.0125, 1.493],
    ]);
  }

  for (const [x0, y0, x1, y1] of [
    [-0.135, 1.42, -0.11, 1.2],
    [0.205, 1.44, 0.19, 1.22],
  ]) {
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (i % 4 === 0) diamond(c, x, y, 0.008, 0.013);
      else dot(c, x, y, 0.0016);
    }
  }
  dotworkGradient(c, rng, -0.1, 1.33, 0.05, 0.1, 2200, 0.0013);
  dotworkGradient(c, rng, 0.175, 1.34, 0.045, 0.1, 2000, 0.0013);
  lace(c, -0.22, 0.26, 1.155, 0.013, lw);
  return [0.022, 1.615];
};

/** Teste del coro: un segno forte e leggibile da lontano per ciascuna */
const hera: Design = (c) => {
  circle(c, 0.004, 0.476, 0.0085, 0.0024);
  dot(c, 0.004, 0.476, 0.003);
  crescent(c, 0.0, 0.252, 0.05, Math.PI / 2);
  dot(c, 0.0, 0.272, 0.0045);
  dot(c, -0.022, 0.282, 0.0028);
  dot(c, 0.022, 0.282, 0.0028);
  return [0.0, 0.3];
};
const korinna: Design = (c) => {
  for (const [ex, dir] of [
    [-0.06, -1],
    [0.0, 1],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      dot(c, ex + dir * (-0.01 + t * 0.03), 0.342 - Math.sin(t * Math.PI) * 0.004 + t * 0.004, 0.0013 + t * 0.0012);
    }
  }
  line(c, -0.02, 0.236, -0.02, 0.218, 0.0034);
  dot(c, -0.02, 0.212, 0.0028);
  c.fillRect(-0.11, 0.142, 0.19, 0.015);
  erase(c);
  for (let x = -0.105; x < 0.08; x += 0.014) dot(c, x, 0.1495, 0.0038);
  ink(c);
  diamond(c, -0.03, 0.412, 0.009, 0.016);
  return [-0.02, 0.3];
};
const bella: Design = (c, rng) => {
  enso(c, rng, 0.0, 0.365, 0.016, 0.0026);
  line(c, -0.05, 0.178, 0.05, 0.178, 0.0026);
  line(c, -0.05, 0.168, 0.05, 0.168, 0.0018);
  diamond(c, 0.0, 0.156, 0.01, 0.018);
  dot(c, 0.06, 0.272, 0.0024);
  dot(c, 0.066, 0.262, 0.0019);
  dot(c, 0.07, 0.253, 0.0014);
  return [0.0, 0.28];
};
const amazzone: Design = (c) => {
  c.lineWidth = 0.0032;
  c.beginPath();
  const tx = -0.012;
  const ty = 0.262;
  const R = 0.05;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + Math.PI + (i / 3) * TAU;
    const x = tx + Math.cos(a) * R;
    const y = ty + Math.sin(a) * R;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
  c.stroke();
  circle(c, tx, ty, 0.019, 0.0026);
  dot(c, tx, ty, 0.0055);
  for (const s of [-1, 1]) swag(c, tx + s * 0.03, 0.325, tx + s * 0.13, 0.31, 0.004, { lw: 0.0018, bead: 0.0016, step: 0.009 });
  dot(c, -0.012, 0.517, 0.0022);
  dot(c, -0.012, 0.508, 0.0018);
  dot(c, -0.012, 0.5, 0.0014);
  return [tx, ty];
};

interface Spec {
  rect: Rect;
  yaw: number;
  px: number;
  seed: number;
  draw: Design;
}

export const STATUE_TATTOOS: Record<string, Spec> = {
  KAS1819: { rect: { x0: -0.18, y0: 0.13, w: 0.36, h: 0.5 }, yaw: 0, px: 2048, seed: 1819, draw: costanza },
  KAS1513: { rect: { x0: -0.3, y0: 0.2, w: 0.6, h: 0.45 }, yaw: 0, px: 2048, seed: 1513, draw: antinoo },
  DEP439: { rect: { x0: -0.13, y0: 0.09, w: 0.26, h: 0.51 }, yaw: 0, px: 2048, seed: 439, draw: nefertiti },
  KAS2232: { rect: { x0: -0.45, y0: 0.0, w: 0.95, h: 1.37 }, yaw: 0.7, px: 2560, seed: 2232, draw: david },
  KAS434: { rect: { x0: -0.32, y0: 1.0, w: 0.64, h: 1.04 }, yaw: 0, px: 3072, seed: 434, draw: venere },
  KAS622: { rect: { x0: -0.16, y0: 0.1, w: 0.32, h: 0.52 }, yaw: 0, px: 1024, seed: 622, draw: hera },
  KAS639: { rect: { x0: -0.16, y0: 0.1, w: 0.32, h: 0.42 }, yaw: 0, px: 1024, seed: 639, draw: korinna },
  KAS394: { rect: { x0: -0.13, y0: 0.1, w: 0.26, h: 0.36 }, yaw: 0, px: 1024, seed: 394, draw: bella },
  KAS615: { rect: { x0: -0.17, y0: 0.1, w: 0.34, h: 0.51 }, yaw: 0, px: 1024, seed: 615, draw: amazzone },
};

export function makeStatueTattoo(id: string, fontFamily: string, scale = 1): StatueTattoo {
  const s = STATUE_TATTOOS[id];
  const pen = makePen(s.rect, Math.round(s.px * scale));
  const o = s.draw(pen.c, mulberry32(s.seed), fontFamily, pen);
  return { canvas: pen.canvas, rect: s.rect, yaw: s.yaw, origin: uvOf(s.rect, o[0], o[1]) };
}
