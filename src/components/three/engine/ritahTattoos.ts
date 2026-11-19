/**
 * La Custode come Ritah: il corpo di una tatuatrice, rose e peonie in black & grey realistico.
 * Spalle, collo, pancia e fianchi; il seno resta pulito. Il tronco è avvolto da un'unica carta cilindrica
 * che ne segue l'asse (come i torsi); collo e braccio hanno carte locali (statueTattoos.ts).
 * Disegni procedurali originali: non sono lavori dello studio.
 *
 * Coordinate del tronco: x = arco dal centro del petto (m, positivo a destra di chi guarda),
 * y = quota assoluta del modello.
 */
import { along, bud, makeTorsoPen, softCurve, spline, type Pt, type TorsoFrame, type TorsoPen } from "./torsoTattoos";
import { leafShaded, peonyFull, rose, smokeCloud, withLine } from "./inkArt";
import { mulberry32, type Ctx, type Rng } from "./tattoo";


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
    drawRitah(pen, mulberry32(434));
    pen.c.restore();
  }
  return pen.canvas;
}

/**
 * Mappa del corpo (carta del tronco, misurata con ?inkgrid e con la mappa di profondità della mesh):
 * - seno: x −0.15…+0.27, y 1.44…1.61; piega sottoseno a ~1.46 → zona proibita, il disegno resta sotto 1.41
 *   e sopra 1.62;
 * - ombelico (+0.02, 1.27); linea alba da (−0.01, 1.43) all'ombelico: il busto è inclinato e torto
 *   (contrapposto), quindi il pezzo della pancia è centrato sulla linea alba e ruotato con lei;
 * - piega della vita sul fianco destro della statua (sinistra di chi guarda) a (−0.25, 1.32), anca sotto;
 * - deltoide destro (sinistra di chi guarda) attorno a (−0.26, 1.68), sopra il moncherino del braccio;
 *   moncherino della spalla sinistra (destra di chi guarda) attorno a (0.32, 1.68);
 * - la veste sale fino a ~1.12–1.18; la cima delle spalle guarda in alto e l'avvolgimento non la tatua.
 */
const LINE_REAL = 0.32;
const LW = 0.0018;

/** ombra di fondo black & grey: fumo morbido lungo una linea, dà profondità e lega i fiori in un pezzo solo */
function smoke(c: Ctx, pts: Pt[], width: number, alpha: number) {
  softCurve(c, spline(pts), width, alpha);
}

/** spalla destra della statua (sinistra di chi guarda): rosa piena sul deltoide, foglie verso schiena e collo */
function shoulderRight(c: Ctx, rng: Rng) {
  const lw = LW;
  smoke(c, [[-0.33, 1.64], [-0.27, 1.675], [-0.2, 1.72]], 0.11, 0.6);
  smokeCloud(c, rng, -0.264, 1.676, 0.075, 0.95);
  leafShaded(c, rng, -0.316, 1.642, -2.75, 0.056, 0.019, lw, 1);
  leafShaded(c, rng, -0.305, 1.716, 2.35, 0.05, 0.017, lw, -1);
  leafShaded(c, rng, -0.226, 1.632, -0.55, 0.044, 0.015, lw, 1);
  leafShaded(c, rng, -0.19, 1.736, 0.25, 0.04, 0.014, lw, -1);
  rose(c, rng, -0.212, 1.722, 0.027, lw, { halo: 0, tilt: 0.86, rot: 0.3 });
  rose(c, rng, -0.264, 1.676, 0.058, lw, { halo: 0, tilt: 0.88, rot: 0.15 });
}

/** spalla sinistra della statua (destra di chi guarda): peonia sul moncherino, una rosa piccola verso il collo */
function shoulderLeft(c: Ctx, rng: Rng) {
  const lw = LW;
  smoke(c, [[0.23, 1.73], [0.3, 1.69], [0.37, 1.65]], 0.11, 0.6);
  smokeCloud(c, rng, 0.32, 1.684, 0.078, 0.95);
  leafShaded(c, rng, 0.36, 1.642, -1.15, 0.052, 0.018, lw, -1);
  leafShaded(c, rng, 0.37, 1.726, 0.85, 0.046, 0.016, lw, -1);
  leafShaded(c, rng, 0.236, 1.74, 2.75, 0.042, 0.014, lw, 1);
  rose(c, rng, 0.256, 1.728, 0.026, lw, { halo: 0, tilt: 0.86, rot: -0.3 });
  peonyFull(c, rng, 0.32, 1.684, 0.06, lw, { halo: 0, tilt: 0.86, rot: 0.25 });
}

/**
 * Pancia e fianchi, un pezzo solo: dal fianco destro della statua (sinistra di chi guarda) la linea scende
 * sull'anca seguendo la piega della vita, passa sopra l'ombelico lungo l'arco della pancia e risale sul
 * fianco opposto. Rose grandi sull'anca e sulla linea alba, peonia sul fianco, foglie e boccioli tra loro,
 * il tutto su un fumo scuro che sfuma. L'ombelico resta pulito, il seno pure (tutto sotto y 1.42).
 */
function waist(c: Ctx, rng: Rng) {
  const lw = LW;
  const spine: Pt[] = [
    [-0.29, 1.395],
    [-0.258, 1.322],
    [-0.205, 1.25],
    [-0.11, 1.292],
    [0.004, 1.338],
    [0.115, 1.326],
    [0.226, 1.298],
    [0.272, 1.35],
    [0.284, 1.405],
  ];
  // fumo: un velo continuo lungo la linea e nuvole più dense dietro i fiori, da cui i petali escono
  smoke(c, spine, 0.12, 0.55);
  for (const [x, y, r] of [[-0.205, 1.25, 0.064], [0.004, 1.338, 0.05], [0.232, 1.305, 0.052], [-0.108, 1.29, 0.03], [0.118, 1.326, 0.032], [-0.268, 1.34, 0.03]]) smokeCloud(c, rng, x, y, r * 1.45, 0.9);
  const cv = spline(spine);
  // foglie lungo la linea, alternate, orientate con lei
  along(cv, 0.036, (p, f, i) => {
    // niente foglie sotto i fiori grandi
    if (Math.abs(p.x + 0.205) < 0.06 && Math.abs(p.y - 1.25) < 0.06) return;
    if (Math.abs(p.x - 0.004) < 0.05 && Math.abs(p.y - 1.338) < 0.05) return;
    if (Math.abs(p.x - 0.232) < 0.05 && Math.abs(p.y - 1.305) < 0.05) return;
    const side = i % 2 ? 1 : -1;
    const a = Math.atan2(p.ty, p.tx) + side * (0.85 + rng() * 0.3);
    const len = 0.04 + Math.sin(f * Math.PI) * 0.012 + rng() * 0.008;
    leafShaded(c, rng, p.x, p.y, a, len, len * 0.34, lw, side > 0 ? 1 : -1);
  }, 0.02, 0.98);
  // foglie grandi attorno ai fiori principali
  leafShaded(c, rng, -0.17, 1.215, -0.55, 0.06, 0.02, lw, 1);
  leafShaded(c, rng, -0.255, 1.205, -2.4, 0.05, 0.017, lw, -1);
  leafShaded(c, rng, 0.045, 1.37, 0.35, 0.056, 0.019, lw, 1);
  leafShaded(c, rng, -0.04, 1.372, Math.PI - 0.35, 0.056, 0.019, lw, -1);
  leafShaded(c, rng, 0.27, 1.26, -1.75, 0.05, 0.017, lw, 1);
  // boccioli
  bud(c, rng, 0.285, 1.395, 1.45, 0.03, lw);
  bud(c, rng, -0.292, 1.385, 1.85, 0.03, lw);
  // fiori, dal più piccolo al più grande (i grandi stanno sopra)
  rose(c, rng, -0.108, 1.29, 0.03, lw, { halo: 0, tilt: 0.86, rot: 0.25 });
  rose(c, rng, 0.118, 1.326, 0.032, lw, { halo: 0, tilt: 0.86, rot: -0.2 });
  rose(c, rng, -0.268, 1.34, 0.03, lw, { halo: 0, tilt: 0.84, rot: 0.6 });
  peonyFull(c, rng, 0.232, 1.305, 0.052, lw, { halo: 0, tilt: 0.84, rot: 0.3 });
  rose(c, rng, 0.004, 1.338, 0.05, lw, { halo: 0, tilt: 0.86, rot: 0.12 });
  rose(c, rng, -0.205, 1.25, 0.064, lw, { halo: 0, tilt: 0.86, rot: -0.35 });
}

function drawRitah({ c }: TorsoPen, rng: Rng) {
  withLine(LINE_REAL, () => {
    waist(c, rng);
    shoulderRight(c, rng);
    shoulderLeft(c, rng);
  });
}

/** collo (carta a giro completo, u = arco dalla gola, positivo a destra di chi guarda): rosa sul lato scoperto */
export function ritahCollo(c: Ctx, rng: Rng) {
  const lw = 0.0016;
  withLine(LINE_REAL, () => {
    smokeCloud(c, rng, -0.086, 0.004, 0.034, 0.9);
    leafShaded(c, rng, -0.108, -0.006, Math.PI + 0.25, 0.034, 0.012, lw, 1);
    leafShaded(c, rng, -0.062, 0.016, 0.5, 0.03, 0.011, lw, -1);
    leafShaded(c, rng, -0.072, -0.012, -0.7, 0.026, 0.009, lw, 1);
    rose(c, rng, -0.086, 0.006, 0.024, lw, { halo: 0.5, tilt: 0.9, rot: 0.2 });
  });
}

/**
 * Braccio destro (carta attorno al moncherino, u = arco, positivo verso il seno, v = quota da y 1.528):
 * una rosa sul davanti del braccio, foglie che girano verso il retro e salgono a incontrare la rosa del
 * deltoide. Nulla oltre u = 0: lì il cilindro del braccio tocca il seno.
 */
export function ritahSleeve(c: Ctx, rng: Rng) {
  const lw = 0.0017;
  withLine(LINE_REAL, () => {
    c.save();
    c.beginPath();
    c.rect(-1, -0.2, 0.985, 0.5);
    c.clip();
    smokeCloud(c, rng, -0.07, 0.004, 0.045, 0.9);
    leafShaded(c, rng, -0.095, 0.022, 2.4, 0.04, 0.014, lw, -1);
    leafShaded(c, rng, -0.1, -0.03, -2.6, 0.038, 0.013, lw, 1);
    leafShaded(c, rng, -0.06, 0.04, 1.45, 0.04, 0.013, lw, 1);
    bud(c, rng, -0.125, -0.055, -2.1, 0.022, lw);
    rose(c, rng, -0.067, -0.006, 0.033, lw, { halo: 0, tilt: 0.9, rot: -0.2 });
    c.restore();
  });
}
