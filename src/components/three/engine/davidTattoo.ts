/**
 * Il gigante · collo e petto del David in black & grey.
 * Collo (carta a giro completo, u = arco dalla gola, positivo a destra di chi guarda, v = quota):
 * una rosa piena sulla gola; un serpente nasce sul trapezio destro, passa dietro la nuca, scende lungo
 * lo sternocleidomastoideo sinistro fino alla fossetta del giugulo, gira sotto la rosa e posa la testa
 * sotto la mascella. Petto: la pietra della fionda, lucida, con due ali che seguono le clavicole.
 * Funzioni dichiarate (non costanti): statueTattoos.ts le usa al caricamento del modulo.
 */
import { dust, leafShaded, orb, rose, snake, wing } from "./inkArt";
import { dot, type Ctx, type Rng } from "./tattoo";
import { softDisk, type Pt } from "./torsoTattoos";

export function davidNeck(c: Ctx, rng: Rng, _font: string, _pen: unknown, { R }: { R: number }) {
  const lw = 0.0022;
  const back = Math.PI * R;
  const lap = 2 * back;
  // velatura di fondo: il pezzo si legge come un'unica macchia scura che si dirada
  // fumo scuro dentro l'ansa del serpente: la rosa esce dal nero
  softDisk(c, 0, -0.06, 0.07, 0.16, 0.55);
  softDisk(c, 0.02, -0.07, 0.03, 0.11, 0.35);
  dust(c, rng, 0, -0.06, 0.18, 0.12, 9000, 0.00065);
  // foglie della rosa, dietro a tutto
  leafShaded(c, rng, -0.055, -0.09, Math.PI + 0.7, 0.07, 0.023, lw, 1);
  leafShaded(c, rng, 0.06, -0.095, -0.65, 0.066, 0.022, lw, -1);
  leafShaded(c, rng, 0.062, -0.02, 0.4, 0.052, 0.018, lw, 1);
  leafShaded(c, rng, -0.065, -0.025, Math.PI - 0.3, 0.05, 0.017, lw, -1);
  rose(c, rng, 0, -0.056, 0.063, lw, { halo: 0.8, tilt: 0.92 });
  // il serpente, dalla coda (trapezio destro, dietro) alla testa (sulla gola, sotto la mascella),
  // in coordinate continue: oltre la cucitura sul retro (u = ±back) si prosegue sul lato sinistro, u − giro.
  // Dietro il collo resta alto (v ≥ 0): più in basso la pelle scende sul trapezio e la carta non la segue.
  const side: Pt[] = [
    [-0.4, 0.05],
    [-0.3, 0.04],
    [-0.21, 0.005],
    [-0.15, -0.045],
    [-0.095, -0.105],
    [-0.03, -0.142],
    [0.05, -0.138],
    [0.108, -0.098],
    [0.128, -0.036],
    [0.112, 0.008],
    [0.072, 0.028],
  ];
  const ctrl: Pt[] = [
    [back - 0.24, -0.04],
    [back - 0.13, 0.0],
    [back - 0.02, 0.032],
    [back + 0.1, 0.05],
    ...side.map(([u, v]) => [u + lap, v] as Pt),
  ];
  // disegnato due volte: la parte posteriore resta dov'è, quella sul davanti torna nel giro con −giro
  snake(c, rng, ctrl, { W: 0.046, lw, shifts: [0, -lap] });
}

export function davidChest(c: Ctx, rng: Rng) {
  const lw = 0.0024;
  const y = -0.088;
  softDisk(c, 0, y - 0.02, 0.05, 0.15, 0.38);
  // ali che seguono le clavicole: bordo d'attacco dal centro verso la spalla
  for (const s of [-1, 1] as const) {
    const edge: Pt[] = [
      [s * 0.034, y + 0.012],
      [s * 0.1, y + 0.036],
      [s * 0.17, y + 0.05],
      [s * 0.24, y + 0.046],
      [s * 0.295, y + 0.026],
    ];
    wing(c, rng, edge, 0.15, lw, s);
  }
  orb(c, 0, y, 0.043, lw);
  // goccia di puntini lungo lo sterno
  for (let k = 0; k < 7; k++) dot(c, 0, y - 0.065 - k * 0.013, 0.003 - k * 0.0003);
}
