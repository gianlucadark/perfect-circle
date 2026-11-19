/**
 * Percorso della galleria: ogni stazione è una sosta della camera (posizione, sguardo) con didascalia.
 * Lo scroll interpola tra le stazioni con una pausa su ciascuna. I punti `via` deviano la camera
 * attorno alle opere al centro della navata senza essere soste.
 *
 * Linea del tempo (in "schermate" di scroll), ripetuta all'infinito:
 *   portale (HERO_LEN) → galleria ((N-1) · STEP_LEN) → ascesa e ritorno al cerchio iniziale (OUTRO_LEN)
 */
export interface Station {
  id: string;
  pos: [number, number, number];
  look: [number, number, number];
  /** spostamento verticale dell'inquadratura su schermi verticali (frazione d'altezza, + = soggetto più in alto) */
  lift?: number;
  /** sguardo e posizione alternativi per schermi verticali */
  mlook?: [number, number, number];
  mpos?: [number, number, number];
  via?: { pos: [number, number, number]; look: [number, number, number] }[];
  index?: string;
  title?: string;
  body?: string;
  meta?: string;
  align?: "left" | "right" | "center";
}

export const STATIONS: Station[] = [
  {
    id: "dentro",
    pos: [0, 1.75, 4.2],
    look: [0, 1.6, -30],
    index: "00",
    title: "Sei dentro.",
    body: "Oltre il cerchio la luce cambia lingua. Qui l'inchiostro non resta sulla pelle: la attraversa.",
    align: "center",
  },
  {
    id: "costanza",
    pos: [-0.62, 1.74, -3.75],
    look: [-1.9, 1.62, -5.0],
    lift: 0.12,
    index: "I",
    title: "Costanza",
    body: "Le fasi della luna lungo le clavicole, un cerchio sullo sterno, un filo sottile al collo. Il gioiello diventa pelle.",
    meta: "Fine line · ornamentale",
    align: "right",
  },
  {
    id: "antinoo",
    pos: [0.62, 1.62, -7.65],
    look: [1.9, 1.38, -9.0],
    lift: 0.1,
    index: "II",
    title: "Antinoo",
    body: "Un sole nero sul petto, la frase scritta nell'anello. Il blackwork come un'armatura.",
    meta: "Blackwork · geometria sacra",
    align: "left",
  },
  {
    id: "flash",
    pos: [-0.9, 1.7, -11.9],
    look: [-3.6, 1.7, -12.1],
    index: "III",
    title: "Flash",
    body: "Tavole che si disegnano da sole mentre passi. Ogni disegno aspetta la sua pelle.",
    meta: "Tavole luminose",
    align: "right",
  },
  {
    id: "nefertiti",
    pos: [0.75, 1.72, -12.75],
    look: [0.42, 1.58, -15.4],
    mlook: [0.02, 1.62, -15.4],
    lift: 0.1,
    via: [{ pos: [1.35, 1.75, -16.2], look: [0.5, 1.6, -21] }],
    index: "IV",
    title: "Nefertiti",
    body: "Il suo nome significa «la bella è arrivata». Pietra nera, inchiostro d'oro, un collare che brilla.",
    meta: "Ornamentale · oro su nero",
    align: "right",
  },
  {
    id: "corpi",
    pos: [0, 1.85, -18.6],
    look: [0, 1.55, -30],
    index: "V",
    title: "La sala dei corpi",
    body: "Torsi senza volto né braccia. Resta solo la pelle di pietra, e quello che ci scriviamo sopra.",
    align: "left",
  },
  {
    id: "belvedere",
    pos: [-0.95, 1.75, -22.85],
    look: [-2.4, 1.45, -24.2],
    lift: 0.08,
    index: "V.1",
    title: "Belvedere",
    body: "La spina dorsale come un rosario di cerchi. Il torso più studiato della storia, riletto in inchiostro.",
    meta: "Linework · dotwork",
    align: "right",
  },
  {
    id: "psiche",
    pos: [1.2, 1.5, -25.65],
    look: [2.4, 1.3, -26.8],
    lift: 0.08,
    index: "V.2",
    title: "Psiche",
    body: "Rami sottili che avvolgono i fianchi, pizzo sotto lo sterno. Il fine line nella sua forma più intima.",
    meta: "Fine line · botanico",
    align: "left",
  },
  {
    id: "gigante",
    pos: [0.15, 1.6, -31.35],
    look: [0, 1.32, -34.6],
    lift: 0.06,
    via: [{ pos: [-1.55, 1.72, -35.2], look: [-0.5, 1.6, -40] }],
    index: "VI",
    title: "Il gigante",
    body: "Un serpente gli gira attorno al collo, sale dietro la nuca e posa la testa sotto la mascella.",
    meta: "Blackwork · serpente",
    align: "right",
  },
  {
    id: "coro",
    pos: [0, 1.75, -38.4],
    look: [0, 1.6, -56],
    mpos: [-0.9, 1.72, -40.2],
    mlook: [-3.0, 1.85, -45.2],
    index: "VII",
    title: "Il coro",
    body: "Dodici volti, dodici aureole perfette. Ogni volto porta un solo segno, e lo porta per sempre.",
    align: "center",
  },
  {
    id: "custode",
    pos: [0, 1.8, -61.1],
    look: [0, 2.25, -66],
    mpos: [0, 1.85, -62.0],
    lift: 0.04,
    index: "VIII",
    title: "La Custode",
    body: "Regina del regno d'inchiostro. Tatuata dal collo ai fianchi, vestita d'inchiostro che sale.",
    meta: "Bodysuit · ornamentale",
    align: "center",
  },
];

export const OUTRO_CAPTION = {
  title: "Il cerchio si chiude.",
  body: "E ricomincia. Ogni linea comincia da un cerchio.",
};

/** ultimo momento del giro, dentro l'oculo: l'invito a prenotare */
export const CTA_CAPTION = {
  title: "Ogni corpo è un’opera.",
  body: "La prossima potrebbe essere la tua.",
  action: "Prenota una consulenza",
  // TODO: sostituire con il canale di prenotazione reale dello studio (WhatsApp, modulo, Instagram, email)
  href: "#prenota",
};

/** finestre dell'outro (frazione 0..1) in cui compaiono le due didascalie finali */
export const OUTRO_CAP_WINDOW: [number, number] = [0.04, 0.34];
export const CTA_WINDOW: [number, number] = [0.4, 0.8];

/** lunghezze in schermate di scroll */
export const HERO_LEN = 2.0;
export const STEP_LEN = 1.0;
export const OUTRO_LEN = 2.8;
export const GALLERY_LEN = (STATIONS.length - 1) * STEP_LEN;
export const TOTAL_LEN = HERO_LEN + GALLERY_LEN + OUTRO_LEN;

/** centro della rotonda della Custode */
export const ROTUNDA: [number, number, number] = [0, 0, -66];
