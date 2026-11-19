/**
 * La Custode: la Venere con la mela di Thorvaldsen come Ritah, la tatuatrice dello studio, dea dell'inchiostro.
 * Ha le braccia, quindi porta i tatuaggi di chi tatua: una manica intera sul braccio sinistro (rose e
 * peonie su fondo di fumo nero), un mandala sul dorso della mano, un pezzo floreale sul fianco destro, una
 * colonna ornamentale lungo la spina e, alla base della nuca, il segno dello studio: un cerchio perfetto.
 * Nella mano destra non tiene una mela ma una goccia d'inchiostro liquido.
 * Seno, pube e volto restano puliti. Disegni procedurali originali: non sono lavori dello studio.
 *
 * Coordinate: spazio oggetto del modello esportato a misura umana (1,80 m con la base; x verso la sinistra
 * della statua, y in alto, fronte verso +z). Assi di braccia e bacino misurati sulle sezioni della mesh;
 * carte e quote verificate con ?inkgrid=charts e la camera d'ispezione.
 */
import { erase, ink, line, diamond, teardrop, crescent, arcStroke, moon, type ChartSpec, type Spec } from "./statueTattoos";
import { leafShaded, peonyFull, rose, withLine } from "./inkArt";
import { bud, lotusPetal, softDisk, spline, stippleCurve } from "./torsoTattoos";
import { circle, dot, type Ctx, type Rng } from "./tattoo";

type V3 = [number, number, number];
type Design = NonNullable<ChartSpec["draw"]>;

/** messa in scena: scala d'esposizione, rotazione (il braccio tatuato verso chi arriva), punti chiave */
export const CUSTODE = {
  id: "KMS6004",
  height: 1.8,
  scale: 1.45,
  yaw: -0.35,
  /** centro della testa e base della nuca (spazio oggetto) */
  head: [0.107, 1.7, 0.09] as V3,
  nape: [0.055, 1.53, -0.125] as V3,
  /** la "mela": centro e raggio */
  apple: [-0.053, 1.405, 0.188, 0.0445] as const,
};

const [AX, AY, AZ, AR] = CUSTODE.apple;

/** inchiostro liquido: la mela tra le dita */
export const CUSTODE_LIQUID = /* glsl */ `
float liquidMask(vec3 p, vec3 n) {
  float d = length(p - vec3(${AX}, ${AY}, ${AZ}));
  // le dita stanno appena fuori dalla sfera: restano marmo
  return 1.0 - smoothstep(${(AR + 0.002).toFixed(4)}, ${(AR + 0.0065).toFixed(4)}, d);
}`;

/** peso dei contorni: realismo, ma con abbastanza linea da leggersi da lontano */
const REAL = 0.5;
const LW = 0.0019;

/** sulle carte che fanno il giro completo (braccio) un motivo vicino alla cucitura si disegna anche dall'altra parte */
function seam(W: number, u: number, r: number, draw: (du: number) => void) {
  draw(0);
  if (u - r < -W / 2) draw(W);
  if (u + r > W / 2) draw(-W);
}

/**
 * Fondo nero continuo della manica: una trama fitta di sfumature morbide che si sommano fino al nero pieno,
 * con un respiro irregolare (mai un tubo uniforme). `dens(u, v)` (0..1) dice quanto nero vuole ogni punto:
 * dove scende a zero la manica si apre o finisce. I bordi si sciolgono in puntinato.
 */
function blackGround(c: Ctx, rng: Rng, u0: number, u1: number, v0: number, v1: number, dens: (u: number, v: number) => number) {
  const step = 0.016;
  for (let v = v0; v <= v1; v += step) {
    for (let u = u0; u <= u1; u += step) {
      const x = u + (rng() - 0.5) * step;
      const y = v + (rng() - 0.5) * step;
      const d = dens(x, y);
      if (d <= 0.02) continue;
      softDisk(c, x, y, step * 0.5, step * (1.5 + rng() * 0.6), Math.min(1, d) * (0.55 + rng() * 0.25));
    }
  }
  // pepe dell'ago dove il nero si dirada
  const n = Math.round(((u1 - u0) * (v1 - v0)) / 0.0000032);
  for (let i = 0; i < n; i++) {
    const x = u0 + rng() * (u1 - u0);
    const y = v0 + rng() * (v1 - v0);
    const d = dens(x, y);
    if (d <= 0.04 || d >= 0.75 || rng() > d * 1.3) continue;
    dot(c, x, y, 0.00055 * (0.6 + rng() * 0.9));
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ manica: avambraccio
/**
 * Avambraccio sinistro (R 3,7 cm, giro completo): u = 0 verso chi guarda dalla sosta, +u verso il lato
 * esterno, ±0,116 il retro; v = 0 a metà avambraccio, polso a −0,087, gomito a +0,186.
 * Una rosa grande davanti, una piccola sul lato esterno, una peonia sul retro, foglie che scendono
 * verso il polso e un bracciale ornamentale che chiude la manica.
 */
const forearm: Design = (c, rng, _f, _p, { rect }) =>
  withLine(REAL, () => {
    const W = rect.w;
    // nero pieno dal gomito a due dita dal polso, dove si scioglie verso il bracciale
    blackGround(c, rng, -W / 2 - 0.02, W / 2 + 0.02, -0.06, 0.25, (_u, v) => smooth(-0.052, -0.012, v) * 0.97);
    // foglie dietro i fiori
    leafShaded(c, rng, -0.03, 0.035, -2.2, 0.052, 0.017, LW, 1);
    leafShaded(c, rng, 0.042, 0.03, -0.95, 0.05, 0.016, LW, -1);
    leafShaded(c, rng, 0.01, 0.006, -1.62, 0.056, 0.017, LW, 1);
    leafShaded(c, rng, 0.108, 0.085, -1.3, 0.045, 0.014, LW, -1);
    leafShaded(c, rng, 0.05, 0.185, 0.6, 0.042, 0.014, LW, 1);
    seam(W, -0.105, 0.06, (du) => leafShaded(c, rng, -0.105 + du, 0.11, 2.0, 0.048, 0.015, LW, 1));
    seam(W, -0.098, 0.08, (du) => peonyFull(c, rng, -0.098 + du, 0.05, 0.032, LW, { halo: 0, tilt: 0.85, rot: 0.3 }));
    rose(c, rng, -0.055, 0.155, 0.025, LW, { halo: 0, tilt: 0.85, rot: -0.6 });
    rose(c, rng, 0.006, 0.085, 0.036, LW, { halo: 0, tilt: 0.9, rot: -0.2 });
    rose(c, rng, 0.08, 0.15, 0.024, LW, { halo: 0, tilt: 0.85, rot: 0.5 });
    bud(c, rng, 0.062, 0.058, -0.9, 0.025, LW * 0.8);
    bud(c, rng, -0.06, 0.0, -2.0, 0.022, LW * 0.8);
    // bracciale: due fili, perle, rombi e gocce che pendono verso la mano
    const v = -0.062;
    ink(c);
    line(c, -W / 2, v + 0.0065, W / 2, v + 0.0065, LW * 1.1);
    line(c, -W / 2, v - 0.0045, W / 2, v - 0.0045, LW * 0.8);
    for (let u = -W / 2 + 0.003, i = 0; u < W / 2; u += 0.0062, i++) {
      if (i % 4 === 0) diamond(c, u, v + 0.001, 0.0045, 0.0075);
      else dot(c, u, v + 0.001, 0.0016);
      if (i % 4 === 2) {
        line(c, u, v - 0.0045, u, v - 0.009, LW * 0.6);
        teardrop(c, u, v - 0.0085, 0.008, 0.0021);
      }
    }
  });

// ------------------------------------------------------------------ manica: braccio
/**
 * Braccio sinistro (R 4,7 cm, giro completo): gomito a v ≈ −0,075, spalla a v ≈ +0,26.
 * Rosa grande davanti, peonia sul lato esterno, una rosa sul retro del tricipite; il lato interno verso
 * l'ascella resta leggero; in alto la manica sfuma in puntinato sul deltoide.
 */
const upperArm: Design = (c, rng, _f, _p, { rect }) =>
  withLine(REAL, () => {
    const W = rect.w;
    // nero pieno dal gomito al deltoide; il lato interno (u ≈ −0,07…−0,12) si apre verso l'ascella
    blackGround(c, rng, -W / 2 - 0.02, W / 2 + 0.02, -0.13, 0.26, (u, v) => {
      // sul davanti e verso l'ascella la manica si chiude più in basso, sul deltoide esterno sale di più
      const lift = 0.035 * smooth(-0.02, 0.06, u);
      const top = 1 - smooth(0.15 + lift, 0.205 + lift, v + 0.02 * Math.sin(u * 60));
      const armpit = 1 - smooth(0.06, 0.13, v) * (1 - smooth(0.025, 0.05, Math.abs(u + 0.09)));
      return 0.97 * top * armpit;
    });
    leafShaded(c, rng, -0.03, 0.07, -2.6, 0.06, 0.018, LW, 1);
    leafShaded(c, rng, 0.05, 0.175, 0.9, 0.055, 0.017, LW, -1);
    leafShaded(c, rng, -0.032, 0.17, 2.3, 0.05, 0.015, LW, 1);
    leafShaded(c, rng, 0.04, -0.03, -1.9, 0.055, 0.017, LW, -1);
    leafShaded(c, rng, 0.11, 0.085, 1.4, 0.05, 0.015, LW, 1);
    seam(W, -0.115, 0.06, (du) => leafShaded(c, rng, -0.115 + du, 0.05, 2.5, 0.05, 0.015, LW, -1));
    peonyFull(c, rng, 0.088, 0.022, 0.044, LW, { halo: 0, tilt: 0.88, rot: 0.2 });
    seam(W, 0.128, 0.04, (du) => rose(c, rng, 0.128 + du, 0.155, 0.034, LW, { halo: 0, tilt: 0.85, rot: 0.9 }));
    rose(c, rng, 0.01, 0.112, 0.052, LW, { halo: 0, tilt: 0.92, rot: -0.15 });
    rose(c, rng, -0.07, 0.035, 0.028, LW, { halo: 0, tilt: 0.85, rot: 0.4 });
    bud(c, rng, -0.04, 0.115, 2.6, 0.026, LW * 0.8);
    bud(c, rng, 0.06, 0.2, 1.1, 0.024, LW * 0.8);
  });

// ------------------------------------------------------------------ mano
/**
 * Dorso della mano sinistra (u = 0 al centro del dorso, v verso il polso; nocche a v ≈ −0,035):
 * il mandala delle tatuatrici, con file di puntini che scendono sulle dita e una falce di luna al polso.
 */
const hand: Design = (c, rng) => {
  const x = 0;
  const y = -0.004;
  ink(c);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 2;
    lotusPetal(c, x, y, a, 0.0075, 0.0215, 0.17, i % 2 === 0, 0.0012);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 2 + Math.PI / 12;
    lotusPetal(c, x, y, a, 0.0075, 0.015, 0.16, true, 0.001);
  }
  circle(c, x, y, 0.0068, 0.0013);
  dot(c, x, y, 0.0036);
  erase(c);
  dot(c, x, y, 0.0013);
  ink(c);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dot(c, x + Math.cos(a) * 0.0255, y + Math.sin(a) * 0.0255, i % 2 ? 0.0007 : 0.0011);
  }
  // dita: file di puntini che si stringono verso le unghie
  for (const u of [-0.019, -0.0065, 0.0065, 0.019]) {
    for (let k = 0; k < 5; k++) dot(c, u * (1 + k * 0.05), -0.031 - k * 0.0065, 0.0013 - k * 0.00015);
  }
  // polso
  crescent(c, 0, 0.033, 0.0055, Math.PI / 2);
  dot(c, -0.011, 0.033, 0.0009);
  dot(c, 0.011, 0.033, 0.0009);
  stippleCurve(c, rng, spline([[-0.03, 0.02], [0, 0.026], [0.03, 0.02]]), 120, 0.004, 0.0006);
};

// ------------------------------------------------------------------ fianco destro
/**
 * Fianco destro (cilindro attorno al bacino, R 15 cm; u = 0 sul fianco esterno, +u verso il davanti,
 * v = 0 alla quota 0,88): peonia sull'anca, rosa sulla coscia, boccioli e foglie che risalgono verso la
 * cresta iliaca e scendono lungo la coscia. Davanti il disegno si ferma lontano dall'inguine
 * (u ≤ +0,05 sopra v −0,12; il pube è a u ≈ +0,2).
 */
const hip: Design = (c, rng) =>
  withLine(REAL, () => {
    // il pezzo segue la linea dell'anca: dalla cresta iliaca, dietro, scende sul fianco e gira sulla coscia.
    // Il nero sta solo attorno ai fiori e lungo il ramo, poi si scioglie nella pelle: niente bordi dritti.
    const path = spline([[-0.095, 0.115], [-0.06, 0.05], [-0.03, -0.03], [0.012, -0.12], [0.03, -0.19], [0.022, -0.255]]);
    const near = (u: number, v: number) => {
      let d = 1;
      for (let s = 0; s <= path.L; s += 0.008) {
        const p = path.at(s);
        d = Math.min(d, Math.hypot(u - p.x, v - p.y));
      }
      return d;
    };
    const blooms: [number, number, number][] = [[-0.032, 0.0, 0.05], [0.028, -0.165, 0.058], [-0.078, 0.07, 0.026]];
    const edge = (u: number, v: number) => smooth(-0.155, -0.12, u) * (1 - smooth(0.06, 0.09, u)) * smooth(-0.295, -0.26, v) * (1 - smooth(0.13, 0.165, v));
    blackGround(c, rng, -0.16, 0.1, -0.3, 0.17, (u, v) => {
      let d = 0.75 * (1 - smooth(0.012, 0.035, near(u, v)));
      for (const [x, y, r] of blooms) d = Math.max(d, 1 - smooth(r * 0.95, r * 1.45, Math.hypot(u - x, v - y)));
      // davanti, sopra la piega dell'inguine, il nero si ferma presto
      return d * edge(u, v) * (1 - smooth(0.03, 0.055, u) * smooth(-0.14, -0.1, v)) * 0.95;
    });
    leafShaded(c, rng, -0.07, 0.025, 2.2, 0.06, 0.019, LW, 1);
    leafShaded(c, rng, -0.01, 0.065, 0.95, 0.055, 0.017, LW, -1);
    leafShaded(c, rng, -0.065, -0.095, -2.5, 0.06, 0.019, LW, -1);
    leafShaded(c, rng, 0.06, -0.075, 0.1, 0.045, 0.015, LW, 1);
    leafShaded(c, rng, -0.02, -0.23, -2.3, 0.055, 0.017, LW, 1);
    leafShaded(c, rng, 0.06, -0.24, -0.6, 0.048, 0.015, LW, -1);
    bud(c, rng, -0.09, 0.115, 2.0, 0.032, LW * 0.9);
    bud(c, rng, 0.022, -0.268, -1.6, 0.028, LW * 0.9);
    rose(c, rng, -0.032, 0.0, 0.05, LW, { halo: 0, tilt: 0.92, rot: 0.25 });
    peonyFull(c, rng, 0.028, -0.165, 0.058, LW, { halo: 0, tilt: 0.9, rot: -0.3 });
    rose(c, rng, -0.078, 0.07, 0.026, LW, { halo: 0, tilt: 0.85, rot: 0.8 });
  });

// ------------------------------------------------------------------ nuca
/** il segno dello studio: un cerchio perfetto, pieno e senza interruzioni, con un anello sottile e un punto */
const nape: Design = (c) => {
  ink(c);
  circle(c, 0, 0, 0.026, 0.0042);
  circle(c, 0, 0, 0.0195, 0.0011);
  dot(c, 0, 0, 0.0028);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    dot(c, Math.cos(a) * 0.0335, Math.sin(a) * 0.0335, 0.001);
  }
};

// ------------------------------------------------------------------ spina
/**
 * Colonna lungo la spina (carta vista dal retro, v = 0 alla quota 1,33): dal cerchio della nuca scende
 * una catena di perle, un loto tra le scapole, lune che calano, rombi e una goccia finale a metà schiena.
 */
const spine: Design = (c, rng) => {
  ink(c);
  const lw = 0.0014;
  // catena dal cerchio
  for (let v = 0.165, i = 0; v > 0.11; v -= 0.0075, i++) dot(c, 0, v, 0.0011 + (i % 2) * 0.0005);
  // falci affrontate e rombo
  crescent(c, -0.012, 0.098, 0.0062, 0);
  crescent(c, 0.012, 0.098, 0.0062, Math.PI);
  diamond(c, 0, 0.098, 0.006, 0.011);
  // loto tra le scapole
  const ly = 0.05;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    lotusPetal(c, 0, ly, a, 0.008, 0.024, 0.2, i % 2 === 0, lw);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2 + Math.PI / 10;
    lotusPetal(c, 0, ly, a, 0.008, 0.0165, 0.18, true, lw * 0.8);
  }
  circle(c, 0, ly, 0.0072, lw);
  dot(c, 0, ly, 0.0038);
  arcStroke(c, 0, ly, 0.029, lw * 0.8, 0, Math.PI * 2);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    dot(c, Math.cos(a) * 0.0335, ly + Math.sin(a) * 0.0335, i % 2 ? 0.0006 : 0.001);
  }
  // fasi lunari che calano lungo la spina
  const phases: [number, number][] = [[1, 0.0068], [0.75, 0.0062], [0.5, 0.0058], [0.25, 0.0054], [0.08, 0.005]];
  phases.forEach(([k, r], i) => {
    const v = 0.004 - i * 0.025;
    moon(c, 0, v, r, k, 1, lw * 0.9);
    dot(c, 0, v - 0.0125, 0.0008);
  });
  // rombi e goccia
  for (let i = 0; i < 3; i++) diamond(c, 0, -0.13 - i * 0.012, 0.0058 - i * 0.0012, 0.0085 - i * 0.0015);
  line(c, 0, -0.165, 0, -0.172, lw * 0.7);
  teardrop(c, 0, -0.171, 0.016, 0.0042);
  softDisk(c, 0, ly, 0.03, 0.05, 0.12);
  stippleCurve(c, rng, spline([[0, 0.16], [0, 0.0], [0, -0.17]]), 500, 0.009, 0.0006);
};

const SLEEVE_FRONT: V3 = [0.34, 0, 0.94];
const ARM_LOW = { p: [0.263, 1.0, -0.156] as V3, dir: [-0.252, 0.916, -0.311] as V3, front: SLEEVE_FRONT };
const ARM_UP = { p: [0.215, 1.25, -0.178] as V3, dir: [-0.05, 0.95, 0.3] as V3, front: SLEEVE_FRONT };
const lap = (R: number, y0: number, h: number) => ({ x0: -Math.PI * R, y0, w: 2 * Math.PI * R, h });

const CHARTS: ChartSpec[] = [
  // avambraccio sinistro: dal polso (v ≈ −0.09) al gomito (v ≈ +0.19)
  { at: [0, 0], limb: ARM_LOW, R: 0.037, tol: 0.75, facing: 0.1, gamma: 0.55, rect: lap(0.037, -0.095, 0.33), px: 2048, draw: forearm },
  // braccio sinistro: dal gomito alla spalla
  { at: [0, 0], limb: ARM_UP, R: 0.047, tol: 0.75, facing: 0.1, gamma: 0.55, rect: lap(0.047, -0.125, 0.405), px: 2048, draw: upperArm },
  // dorso della mano sinistra
  { at: [0, 0], limb: { p: [0.255, 0.855, -0.115], dir: [0.1, 1, 0], front: [1, 0, 0] }, R: 0.05, tol: 0.35, facing: 0.25, gamma: 0.6, rect: { x0: -0.05, y0: -0.065, w: 0.1, h: 0.11 }, px: 1024, draw: hand },
  // fianco destro e coscia: cilindro attorno al bacino
  { at: [0, 0], limb: { p: [-0.05, 0.88, -0.09], dir: [0, 1, 0.1], front: [-0.8, 0, 0.6] }, R: 0.15, tol: 0.7, facing: 0.15, gamma: 0.55, rect: { x0: -0.16, y0: -0.3, w: 0.26, h: 0.47 }, px: 2048, draw: hip },
  // base della nuca: il cerchio
  { at: [-0.055, 1.53], yaw: Math.PI, nr: 0.03, R: 0.07, tol: 0.5, facing: 0, gamma: 0.7, rect: { x0: -0.05, y0: -0.05, w: 0.1, h: 0.1 }, px: 1024, draw: nape },
  // spina dorsale
  { at: [0, 0], pin: [0.03, 1.33, -0.21], nr: 0.06, R: 0.22, up: [0, 1, 0.22], tol: 0.5, facing: 0.1, gamma: 0.7, rect: { x0: -0.06, y0: -0.2, w: 0.12, h: 0.38 }, px: 2048, draw: spine },
];

/** carte e origine dell'inchiostro della Custode: si propaga dalla goccia che tiene in mano */
export const CUSTODE_TATTOO: Spec = {
  yaw: 0,
  seed: 6004,
  origin: [AX, AY, AZ],
  charts: CHARTS,
};
