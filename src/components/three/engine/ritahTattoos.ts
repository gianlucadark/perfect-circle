import { makeTorsoPen, type TorsoFrame, type TorsoPen } from "./torsoTattoos";
import type { Ctx } from "./tattoo";

/** fascia del corpo della Custode su cui si calcola l'asse del tronco (frazioni dell'altezza) */
export const CUSTODE_FIT: [number, number] = [0.56, 0.78];
/** quote (spazio oggetto, m) della carta del tronco: dai fianchi, sotto la veste, alla base del collo */
export const CUSTODE_Y: [number, number] = [0.95, 1.85];

/** griglia di lettura (?inkgrid): x = arco dal centro del petto, y = quota assoluta; etichette in cm */
function wrapGrid({ c, C }: TorsoPen, y0: number, y1: number) {
  for (let x = 0; x <= C / 2; x += 0.025) {
    for (const s of x ? [-1, 1] : [1]) {
      const cm = Math.round(x * 1000) / 10;
      c.lineWidth = cm === 0 ? 0.004 : cm % 10 === 0 ? 0.0028 : cm % 5 === 0 ? 0.0014 : 0.0006;
      c.beginPath();
      c.moveTo(s * x, y0);
      c.lineTo(s * x, y1);
      c.stroke();
    }
  }
  for (let y = Math.ceil(y0 * 40) / 40; y <= y1; y += 0.025) {
    const cm = Math.round(y * 1000) / 10;
    c.lineWidth = cm % 10 === 0 ? 0.0028 : cm % 5 === 0 ? 0.0014 : 0.0006;
    c.beginPath();
    c.moveTo(-C / 2, y);
    c.lineTo(C / 2, y);
    c.stroke();
  }
  const m = c.getTransform();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.font = `600 ${Math.round(m.a * 0.013)}px monospace`;
  for (let y = Math.ceil(y0 * 20) / 20; y < y1; y += 0.05) {
    for (let x = -Math.floor(C / 2 / 0.05) * 0.05; x <= C / 2; x += 0.05) {
      c.fillText(`${Math.round(x * 100)}|${Math.round(y * 100)}`, m.e + (x + 0.003) * m.a, m.f + (y + 0.004) * m.d);
    }
  }
  c.restore();
}

export function makeCustodeWrap(frame: TorsoFrame, scale: number, grid = false): HTMLCanvasElement {
  const [y0, y1] = CUSTODE_Y;
  const pen = makeTorsoPen({ ...frame, H: y1 - y0 }, Math.round(3072 * scale));
  // il disegno lavora in quote assolute del modello; i bordi della carta restano puliti
  pen.c.translate(0, -y0);
  if (grid) wrapGrid(pen, y0 + 0.002, y1 - 0.002);
  else {
    pen.c.save();
    pen.c.beginPath();
    pen.c.rect(-pen.C, y0 + 0.01, pen.C * 2, y1 - y0 - 0.02);
    pen.c.clip();
    drawGarden(pen.c);
    pen.c.restore();
  }
  return pen.canvas;
}

const pigment = "#fff";
const marble = "#000";

export const CUSTODE_SLEEVE = /* glsl */ `
float surfaceInk(vec3 p) {
  float medial = p.x + .13 + .43 * (p.y - 1.53) - .27 * (p.z - .05);
  float back = -.018 - .45 * (p.y - 1.49) - p.z;
  float crest = p.y - 1.642 + .69 * (p.x + .2) - .23 * p.z;
  float edge = max(max(medial, back), max(crest, 1.393 - p.y));
  float aa = max(fwidth(edge), .00045);
  float block = 1.0 - smoothstep(-aa, aa, edge);
  float slit = abs(crest + .021) - .0038;
  return block * smoothstep(-max(fwidth(slit), .00045), max(fwidth(slit), .00045), slit);
}`;

function shape(ctx: Ctx, path: string, fill = pigment) {
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(path));
}

function stamp(ctx: Ctx, x: number, y: number, width: number, height: number, angle: number, draw: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(width, height);
  draw();
  ctx.restore();
}

function bloom(ctx: Ctx) {
  shape(ctx, "M-42 -10 Q-52 -23 -43 -34 Q-36 -36 -31 -35 Q-28 -48 -13 -46 L-4 -43 Q8 -51 21 -42 L28 -35 Q46 -36 47 -20 L44 -10 Q55 3 45 17 L36 22 Q35 40 18 42 L8 41 Q-6 53 -20 44 L-26 38 Q-43 37 -45 22 L-43 13 Q-56 1 -42 -10Z");
  for (const petal of [
    "M-43 -28 Q-34 -37 -25 -29 Q-15 -23 -8 -26 Q-22 -16 -32 -13 Q-37 -16 -43 -28Z",
    "M-27 -35 Q-24 -46 -12 -42 Q-3 -36 7 -36 Q0 -31 -10 -31 Q-17 -29 -27 -35Z",
    "M-2 -41 Q10 -47 21 -37 Q25 -32 26 -26 Q16 -28 7 -26 Q11 -34 -2 -41Z",
    "M29 -31 Q47 -32 43 -15 Q39 -1 26 6 Q30 -5 26 -17 Q30 -22 29 -31Z",
    "M46 -3 Q54 13 36 19 Q21 23 12 32 Q15 19 28 12 Q40 7 46 -3Z",
    "M32 23 Q32 39 14 38 Q3 36 -7 41 Q-3 33 9 30 Q23 29 32 23Z",
    "M3 36 Q-6 50 -18 41 Q-28 32 -30 24 Q-19 29 -11 28 Q-3 29 3 36Z",
    "M-37 13 Q-35 25 -25 33 Q-44 33 -41 17 Q-42 10 -47 5 Q-42 6 -37 13Z",
    "M-43 -7 Q-32 -12 -26 -18 Q-25 -4 -17 4 Q-27 4 -34 10 Q-44 6 -43 -7Z",
    "M-22 -22 Q-7 -22 0 -29 Q13 -34 21 -24 Q10 -26 2 -18 Q-9 -21 -19 -13Z",
    "M21 -20 Q30 -6 19 7 Q11 16 0 18 Q1 9 11 4 Q22 -3 21 -20Z",
    "M-31 12 Q-21 2 -11 8 Q-3 15 -6 24 Q-21 26 -31 12Z",
    "M-1 22 Q10 18 17 13 Q8 23 9 28 Q1 31 -4 32Z",
    "M-17 -11 Q-9 -19 0 -15 Q7 -14 11 -17 Q8 -8 -3 -7 Q-11 -6 -13 -1Z",
    "M15 -15 Q20 -1 7 3 Q0 7 -1 12 Q-5 4 1 -1 Q13 -4 15 -15Z",
    "M-10 -2 Q-5 -6 2 -5 Q-5 -2 -6 4Z",
  ]) shape(ctx, petal, marble);
  for (const cut of ["M-40 -29 Q-34 -22 -32 -17 Q-37 -21 -40 -29Z", "M40 -24 Q41 -14 33 -7 Q38 -15 40 -24Z", "M-25 13 Q-17 16 -12 22 Q-20 19 -25 13Z", "M17 34 Q24 31 28 27 Q25 33 17 34Z"]) shape(ctx, cut);
  for (const [baseX, baseY, angle, size] of [[-32,-14,2.12,1], [27,2,1.08,.78], [-6,24,2.33,.85], [10,32,.29,.86], [-10,-31,-2.73,.74]]) {
    stamp(ctx, baseX, baseY, size, size, angle, () => {
      shape(ctx, "M0 0 Q5 2 12 .4 Q6 3.5 0 2Z M1 3.5 Q6 5 10 4.5 Q5 6.7 1 5Z M2 7 L7 8 L2 8.3Z");
    });
  }
}

function leaf(ctx: Ctx, x: number, y: number, length: number, angle: number, flip = 1) {
  stamp(ctx, x, y, length, length * flip, angle, () => {
    shape(ctx, "M0 0 Q.11 .18 .33 .22 L.29 .17 L.57 .22 L.53 .16 L.76 .15 L.72 .1 Q.9 .09 1 0 Q.84 0 .68 -.11 L.69 -.06 L.45 -.17 L.47 -.11 Q.19 -.21 0 0Z");
    shape(ctx, "M.07 .01 Q.39 .11 .87 .025 Q.42 .075 .07 .01Z M.37 .075 L.51 .16 L.42 .075Z M.53 .071 L.64 -.028 L.56 .071Z", marble);
  });
}

function roseAt(ctx: Ctx, x: number, y: number, radius: number, angle: number) {
  stamp(ctx, x, y, radius / 50, radius / -50, angle, () => bloom(ctx));
}

function roseProfile(ctx: Ctx, x: number, y: number, size: number, angle: number) {
  stamp(ctx, x, y, size / 40, size / 40, angle, () => {
    shape(ctx, "M-3 -26 Q-23 -19 -31 3 L-36 17 Q-28 15 -24 12 Q-29 24 -17 28 Q-9 39 2 33 Q17 39 23 28 Q38 30 35 13 L40 18 Q34 -5 15 -18 L9 -26 L4 -19Z");
    shape(ctx, "M-28 13 Q-17 6 -11 -6 Q-5 5 8 9 Q0 17 -13 17 Q-22 19 -25 23Z M-15 23 Q2 16 9 12 Q12 21 2 27 Q-6 33 -15 23Z M6 30 Q19 20 14 9 Q10 2 11 -7 Q17 5 28 9 Q34 20 21 24 Q16 30 6 30Z M-17 4 Q-16 -7 -5 -15 L4 -12 Q-8 -8 -17 4Z", marble);
    shape(ctx, "M-5 -26 Q-16 -22 -24 -8 L-26 1 Q-10 -15 0 -15 Q8 -22 19 -20 L9 -29 L2 -23Z");
  });
}

function hipTrain(ctx: Ctx) {
  stamp(ctx, .007, 1.311, .001, .001, 0, () => {
    shape(ctx, "M-43 -3 C13 7 39 -41 80 -59 C129 -83 178 -57 207 -19 Q228 8 252 17 Q223 14 199 -12 C166 -49 130 -65 89 -51 C43 -37 20 10 -43 -3Z");
    shape(ctx, "M35 -34 Q55 -62 60 -85 Q62 -72 58 -60 Q71 -65 81 -64 Q56 -54 35 -34Z M173 -46 Q195 -41 210 -48 Q205 -39 200 -36 L213 -27 Q190 -36 173 -46Z");
    shape(ctx, "M-3 -8 C37 -23 58 -69 102 -74 Q121 -77 139 -74 Q90 -76 59 -45 Q24 -12 -3 -8Z");
    leaf(ctx, 50, -40, 35, 1.18); leaf(ctx, 68, -51, 40, -1.98);
    leaf(ctx, 107, -58, 40, -1.25); leaf(ctx, 156, -51, 49, 1.01);
    leaf(ctx, 188, -30, 45, -.43); leaf(ctx, 218, -1, 39, 1.54);
    roseProfile(ctx, 136, -47, 43, -.64);
  });
}

function drawGarden(ctx: Ctx) {
  hipTrain(ctx);
  shoulderSprig(ctx);
  stamp(ctx, -.105, 1.28, .001, .001, .14, () => {
    shape(ctx, "M-152 -70 C-190 -39 -163 31 -126 72 Q-110 88 -104 111 Q-116 90 -138 74 C-178 39 -195 -30 -166 -70Z");
    leaf(ctx, -159, -20, 56, 1.17); leaf(ctx, -158, 21, 47, 2.29);
    leaf(ctx, -134, 68, 39, .47);
    roseProfile(ctx, -164, -15, 42, .88);
    shape(ctx, "M-152 -70 Q-108 -64 -72 -29 Q-23 34 43 24 Q109 10 162 41 Q199 62 215 64 Q189 63 159 45 Q109 19 48 31 Q-26 49 -76 -22 Q-106 -55 -152 -70Z");
    shape(ctx, "M85 23 Q110 38 119 61 Q109 43 92 38 L91 46 Q89 35 79 28Z M-75 -26 Q-95 -19 -99 4 Q-98 -12 -111 -14 Q-95 -14 -83 -29Z M149 34 Q158 34 165 29 L162 41Z");
    leaf(ctx, -96, -44, 48, 2.32); leaf(ctx, -96, -44, 52, -2.98, -1);
    leaf(ctx, -60, -10, 59, 1.89); leaf(ctx, -44, -1, 61, -1.89);
    leaf(ctx, 37, 27, 44, -.91, -1); leaf(ctx, 52, 28, 49, .89);
    leaf(ctx, 120, 26, 31, -.79); leaf(ctx, 181, 53, 28, .98);
    roseAt(ctx, -12, 12, 61, -.28);
  });
}

export function ritahSpalla(ctx: Ctx) {
  leaf(ctx, -.019, .008, .053, 2.77);
  leaf(ctx, .023, -.003, .042, -.49);
  roseAt(ctx, 0, 0, .044, .62);
}

function shoulderSprig(ctx: Ctx) {
  stamp(ctx, -.222, 1.683, .0014, .0011, .14, () => {
    shape(ctx, "M-61 -33 Q-26 -26 -8 -5 Q11 17 56 26 Q13 22 -10 1 Q-36 -22 -61 -26Z");
    leaf(ctx, -32, -17, 34, 1.9); leaf(ctx, -14, -4, 27, -.52);
    leaf(ctx, 9, 12, 32, 1.25); leaf(ctx, 25, 18, 24, -.24);
    roseProfile(ctx, -22, -4, 24, .56);
  });
}

export function ritahCollo(ctx: Ctx) {
  stamp(ctx, .013, -.012, .00075, .00075, -.18, () => {
    shape(ctx, "M-45 -2 Q-14 -5 0 8 Q14 19 53 13 Q21 23 -1 13 Q-18 2 -45 -2Z");
    leaf(ctx, 1, 10, 22, 1.83); leaf(ctx, 20, 16, 26, .94);
    shape(ctx, "M-13 3 Q-4 1 0 -11 Q2 -3 1 6 L9 11Z");
  });
  stamp(ctx, -.048, -.014, .001, .001, 0, () => {
    shape(ctx, "M-124 24 C-73 31 -44 -7 -9 -9 C16 -13 35 4 68 3 Q36 -1 17 -11 Q-6 -21 -33 -6 C-69 16 -86 25 -124 24Z");
    shape(ctx, "M-47 2 Q-37 13 -37 26 Q-33 13 -28 -5Z M-16 -10 Q-9 -1 -8 10 Q-4 -2 1 -11Z M16 -9 Q25 -4 27 9 L33 -3Z");
    leaf(ctx, -65, 12, 29, 1.82); leaf(ctx, -48, 1, 24, -2.68);
  });
  stamp(ctx, -.048, .004, .00064, .00064, -.37, () => {
    shape(ctx, "M-13 -48 Q-3 -26 -2 -8 L1 8 L5 8 Q5 -21 -13 -48Z");
    leaf(ctx, -3, -16, 23, 2.72); leaf(ctx, 1, -7, 18, .57);
    shape(ctx, "M-11 11 L-17 26 L-9 22 Q-15 38 -5 42 Q1 49 9 43 Q22 42 19 27 L24 32 Q21 16 8 6 L3 1Z");
    shape(ctx, "M-9 30 Q-10 42 -3 40 Q4 39 9 28 Q-1 32 -5 20Z M-1 15 Q14 25 15 38 Q22 22 8 12Z M0 42 Q6 48 13 40 Q8 41 7 37Z", marble);
  });
}
