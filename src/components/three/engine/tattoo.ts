/**
 * Primitive di disegno dei tatuaggi (canvas 2D → maschera, inchiostro = bianco su nero),
 * tatuaggi cilindrici dei torsi e tavole flash. I disegni sui busti e sulle statue sono in
 * statueTattoos.ts. Disegni procedurali originali: non sono lavori dello studio.
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


export type TorsoVariant = "belvedere" | "psiche" | "doriforo" | "apollo" | "iris" | "valentini";

/**
 * Tatuaggi per i torsi. Mappa cilindrica isotropa: larghezza = circonferenza C (m),
 * altezza = altezza del torso H (m). Coordinate di disegno in (u 0..1, v 0..1 dal basso).
 */
export function makeTorsoTattooCanvas(variant: TorsoVariant, fontFamily: string, H: number, C: number): HTMLCanvasElement {
  const w = 2048;
  const h = Math.round(Math.min(3072, Math.max(1024, (w * H) / C)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const X = (u: number) => u * w;
  const Y = (v: number) => (1 - v) * h;
  const M = (m: number) => (m / C) * w; // metri → pixel
  const lw = 10.5;
  const wrap = (draw: (dx: number) => void) => {
    draw(0);
    draw(w);
    draw(-w);
  };

  if (variant === "belvedere") {
    const rng = mulberry32(5101);
    wrap((dx) => {
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(dx, Y(0.95));
      ctx.lineTo(dx, Y(0.22));
      ctx.stroke();
      for (let i = 0; i < 15; i++) {
        const v = 0.93 - i * 0.048;
        const r = M(0.028 - i * 0.0012);
        ctx.fillStyle = "#000";
        dot(ctx, dx, Y(v), r + 2);
        ctx.fillStyle = "#fff";
        circle(ctx, dx, Y(v), r, lw);
        dot(ctx, dx, Y(v), i % 3 === 0 ? r * 0.55 : lw * 1.2);
      }
    });
    mandala(ctx, rng, X(0.5), Y(0.74), M(0.075), lw, 14);
    ctx.save();
    ctx.translate(X(0.31), Y(0.5));
    ctx.rotate(-Math.PI / 2);
    ctx.font = `italic 300 ${Math.round(M(0.03))}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText("ogni linea comincia da un cerchio", 0, 0);
    ctx.restore();
  }

  if (variant === "psiche") {
    const rng = mulberry32(5202);
    const sx = X(0.5);
    const sy = Y(0.64);
    // pizzo sotto lo sterno: mezzo mandala capovolto + gocce
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, sy, w, h);
    ctx.clip();
    mandala(ctx, rng, sx, sy, M(0.07), lw * 0.9, 14);
    ctx.restore();
    for (let i = -6; i <= 6; i++) {
      const x = sx + i * M(0.012);
      const len = M(0.03) * (1 - Math.abs(i) / 8) + M(0.008);
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, sy + M(0.072));
      ctx.lineTo(x, sy + M(0.072) + len);
      ctx.stroke();
      dot(ctx, x, sy + M(0.075) + len, lw * 1.4);
    }
    for (let k = 0; k < 4; k++) {
      const u0 = 0.36 - k * 0.05;
      botanical(ctx, rng, X(u0), Y(0.18 + k * 0.03), M(0.36), -Math.PI / 2 - 0.5 + k * 0.12, lw * 0.85);
      botanical(ctx, rng, X(1 - u0), Y(0.18 + k * 0.03), M(0.36), -Math.PI / 2 + 0.5 - k * 0.12, lw * 0.85);
    }
    wrap((dx) => enso(ctx, rng, dx + M(0.06), Y(0.78), M(0.05), 9));
  }

  if (variant === "doriforo") {
    const rng = mulberry32(5303);
    // corazza blackwork: due grandi campiture con cerchio in negativo sullo sterno
    ctx.beginPath();
    ctx.moveTo(X(0.5), Y(0.86));
    ctx.lineTo(X(0.5) + M(0.17), Y(0.8));
    ctx.lineTo(X(0.5) + M(0.12), Y(0.6));
    ctx.lineTo(X(0.5), Y(0.53));
    ctx.lineTo(X(0.5) - M(0.12), Y(0.6));
    ctx.lineTo(X(0.5) - M(0.17), Y(0.8));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#000";
    dot(ctx, X(0.5), Y(0.72), M(0.05));
    ctx.fillStyle = "#fff";
    circle(ctx, X(0.5), Y(0.72), M(0.038), lw);
    dot(ctx, X(0.5), Y(0.72), M(0.012));
    ctx.fillRect(-10, Y(0.36), w + 20, M(0.035));
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = "#000";
      dot(ctx, (i / 40) * w + w / 80, Y(0.36) + M(0.0175), M(0.008));
    }
    ctx.fillStyle = "#fff";
    dotworkGradient(ctx, rng, X(0.5), Y(0.45), M(0.1), M(0.06), 2600, 3.8);
    wrap((dx) => {
      ctx.beginPath();
      ctx.moveTo(dx - M(0.06), Y(0.9));
      ctx.lineTo(dx + M(0.06), Y(0.9));
      ctx.lineTo(dx, Y(0.62));
      ctx.closePath();
      ctx.fill();
    });
  }

  if (variant === "apollo") {
    const rng = mulberry32(5404);
    flowerOfLife(ctx, X(0.5), Y(0.7), M(0.07), lw);
    for (const s of [-1, 1]) cracks(ctx, rng, X(0.5 + s * 0.12), Y(0.82), M(0.22), Math.PI / 2 + s * 0.3, lw);
    for (let i = 0; i < 9; i++) dot(ctx, X(0.5), Y(0.56) + i * M(0.014), lw * (i % 4 === 0 ? 2 : 1.1));
  }

  if (variant === "iris") {
    const rng = mulberry32(5505);
    for (let i = 0; i < 9; i++) cracks(ctx, rng, X(rng()), Y(0.95 - rng() * 0.2), M(0.3 + rng() * 0.2), Math.PI / 2 + (rng() - 0.5), lw * 1.1);
    wrap((dx) => flowerOfLife(ctx, dx, Y(0.62), M(0.08), lw));
    circle(ctx, X(0.5), Y(0.45), M(0.035), lw);
  }

  if (variant === "valentini") {
    const rng = mulberry32(5606);
    // bodysuit ornamentale: griglia di cerchi a densità variabile
    const step = M(0.045);
    for (let y = step / 2; y < h; y += step * 0.866) {
      const row = Math.round(y / (step * 0.866));
      for (let x = (row % 2) * step * 0.5; x < w; x += step) {
        const v = 1 - y / h;
        const k = 0.5 + 0.5 * Math.sin(v * 7 + (x / w) * Math.PI * 4);
        if (rng() > 0.15 + k * 0.6) continue;
        circle(ctx, x, y, step * (0.18 + k * 0.22), 4.2);
        if (k > 0.6) dot(ctx, x, y, 4.4);
      }
    }
    ctx.fillStyle = "#000";
    dot(ctx, X(0.5), Y(0.42), M(0.09));
    ctx.fillStyle = "#fff";
    enso(ctx, rng, X(0.5), Y(0.42), M(0.07), 12);
  }
  return c;
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
