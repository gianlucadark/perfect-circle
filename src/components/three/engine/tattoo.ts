/**
 * Primitive di disegno dei tatuaggi (canvas 2D → maschera, inchiostro = bianco su nero)
 * e tavole flash. I disegni sui busti e sulle statue sono in statueTattoos.ts, quelli dei torsi
 * in torsoTattoos.ts. Disegni procedurali originali: non sono lavori dello studio.
 * Le primitive non dipendono dall'unità: funzionano in pixel o, con una trasformazione, in metri.
 */

export type Ctx = CanvasRenderingContext2D;
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


export function circle(ctx: Ctx, x: number, y: number, r: number, w: number) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function dot(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** stipple radiale: densità che cresce verso il bordo interno di una corona */
export function stippleRing(ctx: Ctx, rng: Rng, x: number, y: number, r0: number, r1: number, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const t = Math.pow(rng(), 2.2);
    const r = r0 + (r1 - r0) * t;
    dot(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, size * (0.6 + rng() * 0.6));
  }
}

export function mandala(ctx: Ctx, rng: Rng, x: number, y: number, R: number, w: number, petals = 12) {
  [1, 0.9, 0.62, 0.36, 0.13].forEach((k, i) => circle(ctx, x, y, R * k, i === 0 ? w * 1.3 : w));
  ctx.lineWidth = w;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const a1 = a - Math.PI / petals;
    const a2 = a + Math.PI / petals;
    const tip = R * 0.86;
    const base = R * 0.38;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a1) * base, y + Math.sin(a1) * base);
    ctx.quadraticCurveTo(x + Math.cos(a1) * R * 0.7, y + Math.sin(a1) * R * 0.7, x + Math.cos(a) * tip, y + Math.sin(a) * tip);
    ctx.quadraticCurveTo(x + Math.cos(a2) * R * 0.7, y + Math.sin(a2) * R * 0.7, x + Math.cos(a2) * base, y + Math.sin(a2) * base);
    ctx.stroke();
    // nervatura interna
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * base, y + Math.sin(a) * base);
    ctx.lineTo(x + Math.cos(a) * R * 0.7, y + Math.sin(a) * R * 0.7);
    ctx.stroke();
    // piccoli petali interni
    const ib = R * 0.14;
    const it = R * 0.34;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a1) * ib, y + Math.sin(a1) * ib);
    ctx.quadraticCurveTo(x + Math.cos(a) * it * 0.8, y + Math.sin(a) * it * 0.8, x + Math.cos(a2) * ib, y + Math.sin(a2) * ib);
    ctx.stroke();
  }
  for (let i = 0; i < petals * 2; i++) {
    const a = (i / (petals * 2)) * Math.PI * 2;
    dot(ctx, x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.95, w * 1.1);
  }
  stippleRing(ctx, rng, x, y, R * 0.13, R * 0.36, 900, w * 0.45);
  dot(ctx, x, y, w * 2.2);
}

/** ramo botanico fine-line con foglie a mandorla */
export function botanical(ctx: Ctx, rng: Rng, x: number, y: number, len: number, angle: number, w: number, depth = 0) {
  const segs = 26;
  let px = x;
  let py0 = y;
  let a = angle;
  ctx.lineWidth = w * (depth === 0 ? 1.1 : 0.85);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    pts.push([px, py0, a]);
    a += (rng() - 0.5) * 0.18 + Math.sin(i * 0.35) * 0.02;
    px += Math.cos(a) * (len / segs);
    py0 += Math.sin(a) * (len / segs);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  for (let i = 3; i < pts.length - 1; i += 2) {
    const [lx, ly, la] = pts[i];
    const side = i % 4 === 1 ? 1 : -1;
    const sz = (len / segs) * (2.4 - (i / segs) * 1.3) * (0.8 + rng() * 0.4);
    const ang = la + side * (0.7 + rng() * 0.3);
    leaf(ctx, lx, ly, ang, sz, w * 0.8);
    if (depth === 0 && i % 6 === 3 && rng() > 0.35) botanical(ctx, rng, lx, ly, len * 0.32, la - side * 0.9, w, depth + 1);
  }
  const [ex, ey] = pts[pts.length - 1];
  leaf(ctx, ex, ey, pts[pts.length - 1][2], (len / segs) * 2.2, w * 0.8);
}

export function leaf(ctx: Ctx, x: number, y: number, a: number, s: number, w: number) {
  const tx = x + Math.cos(a) * s;
  const ty = y + Math.sin(a) * s;
  const nx = Math.cos(a + Math.PI / 2) * s * 0.32;
  const ny = Math.sin(a + Math.PI / 2) * s * 0.32;
  const mx = (x + tx) / 2;
  const my = (y + ty) / 2;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty);
  ctx.quadraticCurveTo(mx - nx, my - ny, x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(mx + (tx - mx) * 0.7, my + (ty - my) * 0.7);
  ctx.stroke();
}

export function arcText(ctx: Ctx, text: string, x: number, y: number, r: number, centerAngle: number, font: string, spacing = 0) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const widths = [...text].map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((s, v) => s + v, 0);
  let a = centerAngle - total / r / 2;
  [...text].forEach((c, i) => {
    const aw = widths[i] / r;
    a += aw / 2;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(c, 0, 0);
    ctx.restore();
    a += aw / 2;
  });
  ctx.restore();
}

export function enso(ctx: Ctx, rng: Rng, x: number, y: number, R: number, w: number) {
  const start = -0.4 + rng() * 0.3;
  const sweep = Math.PI * 1.82;
  const steps = 220;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a = start + sweep * t;
    const r = R * (1 + 0.025 * Math.sin(t * 9 + rng() * 0.2));
    const thick = w * (0.25 + Math.sin(Math.PI * Math.min(1, t * 1.15)) * 1.0) * (0.85 + rng() * 0.3);
    ctx.globalAlpha = t > 0.88 ? (1 - t) / 0.12 * 0.7 + 0.3 : 1;
    // setole: piccoli tratti paralleli per un bordo a pennello
    for (let k = 0; k < 3; k++) {
      const rr = r + (k - 1) * thick * 0.33 + (rng() - 0.5) * thick * 0.12;
      dot(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr, thick * 0.32);
    }
  }
  ctx.globalAlpha = 1;
}

export function flowerOfLife(ctx: Ctx, x: number, y: number, R: number, w: number) {
  const r = R / 3;
  circle(ctx, x, y, R, w * 1.3);
  circle(ctx, x, y, r, w);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    circle(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, r, w);
  }
  ctx.lineWidth = w;
  for (const off of [-Math.PI / 2, Math.PI / 2]) {
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i / 3) * Math.PI * 2;
      const px = x + Math.cos(a) * R * 0.98;
      const pyy = y + Math.sin(a) * R * 0.98;
      if (i === 0) ctx.moveTo(px, pyy);
      else ctx.lineTo(px, pyy);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * R * 1.06, y + Math.sin(a) * R * 1.06);
    ctx.lineTo(x + Math.cos(a) * R * (i % 3 === 0 ? 1.28 : 1.14), y + Math.sin(a) * R * (i % 3 === 0 ? 1.28 : 1.14));
    ctx.stroke();
  }
}

/** crepe ramificate (kintsugi) */
export function cracks(ctx: Ctx, rng: Rng, x: number, y: number, len: number, a: number, w: number, depth = 0) {
  let px = x;
  let pyy = y;
  ctx.lineWidth = w * (1 - depth * 0.25);
  ctx.beginPath();
  ctx.moveTo(px, pyy);
  const n = 14;
  for (let i = 0; i < n; i++) {
    a += (rng() - 0.5) * 0.9;
    px += Math.cos(a) * (len / n);
    pyy += Math.sin(a) * (len / n);
    ctx.lineTo(px, pyy);
    if (depth < 2 && rng() > 0.82) {
      ctx.stroke();
      cracks(ctx, rng, px, pyy, len * 0.45, a + (rng() > 0.5 ? 0.9 : -0.9), w, depth + 1);
      ctx.lineWidth = w * (1 - depth * 0.25);
      ctx.beginPath();
      ctx.moveTo(px, pyy);
    }
  }
  ctx.stroke();
}


export function dotworkGradient(ctx: Ctx, rng: Rng, x: number, y: number, rw: number, rh: number, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rng(), 1.8);
    const a = rng() * Math.PI * 2;
    dot(ctx, x + Math.cos(a) * rw * t, y + Math.sin(a) * rh * t, size * (1.1 - t * 0.6));
  }
}


/** Tavole "flash" per i pannelli luminosi della galleria. */
export function makeFlashCanvas(seed: number, fontFamily: string): HTMLCanvasElement {
  const w = 1024;
  const h = 1536;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const rng = mulberry32(seed);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lw = 2.6;
  // cornice sottile
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, w - 96, h - 96);
  const kind = seed % 3;
  if (kind === 0) {
    mandala(ctx, rng, w / 2, h * 0.36, 300, lw, 16);
    botanical(ctx, rng, w * 0.2, h * 0.92, 520, -Math.PI / 2 + 0.25, lw);
    botanical(ctx, rng, w * 0.8, h * 0.92, 520, -Math.PI / 2 - 0.25, lw);
  } else if (kind === 1) {
    flowerOfLife(ctx, w / 2, h * 0.4, 260, lw);
    enso(ctx, rng, w / 2, h * 0.4, 380, 16);
    for (let i = 0; i < 9; i++) dot(ctx, w / 2, h * 0.75 + i * 26, 3 + (i % 3 === 1 ? 2 : 0));
  } else {
    enso(ctx, rng, w / 2, h * 0.42, 330, 30);
    for (let i = 0; i < 5; i++) botanical(ctx, rng, w / 2 + (i - 2) * 60, h * 0.88, 380 + i * 30, -Math.PI / 2 + (i - 2) * 0.18, lw);
  }
  ctx.font = `italic 300 40px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.fillText(["I · Origine", "II · Geometria", "III · Gesto"][kind], w / 2, h - 96);
  ctx.font = `400 16px ${fontFamily}`;
  ctx.fillText("PERFECT CIRCLE · TERRACINA", w / 2, h - 64);
  return c;
}
