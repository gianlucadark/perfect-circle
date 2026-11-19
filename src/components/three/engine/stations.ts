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
    id: "notte",
    pos: [-0.75, 1.75, -2.1],
    look: [-2.38, 1.12, -5.46],
    mpos: [-0.85, 1.95, -1.25],
    mlook: [-3.25, 1.2, -5.0],
    lift: 0.1,
    index: "I",
    title: "La Notte",
    body: "Dorme con la luna nel diadema. Sulla coscia le è salito il cielo: una falce con la stella e le fasi in fila lungo la linea del femore.",
    meta: "Fine line · lunare",
    align: "right",
  },
  {
    id: "apollo",
    pos: [0.15, 1.5, -6.55],
    look: [1.98, 1.42, -9.68],
    mpos: [0.25, 1.55, -6.2],
    mlook: [2.45, 1.4, -9.5],
    lift: 0.06,
    index: "II",
    title: "Apollo",
    body: "Il dio del sole porta il suo sole sul petto: nero, con la frase dello studio scritta nell'anello. Sul braccio, raggi pieni come un'armatura.",
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
    body: "Un sole sullo sterno, fasce che seguono pettorali e costole fino a un rosario di cerchi lungo la spina. Il torso più studiato della storia, riletto in inchiostro.",
    meta: "Blackwork · dotwork",
    align: "right",
  },
  {
    id: "psiche",
    pos: [1.2, 1.5, -25.65],
    look: [2.4, 1.3, -26.8],
    lift: 0.08,
    index: "V.2",
    title: "Psiche",
    body: "Peonie che scendono dalla spalla lungo il fianco, pizzo sotto il seno. Il black & grey nella sua forma più morbida.",
    meta: "Black & grey · botanico",
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
    body: "Un serpente nasce dietro la nuca, scende lungo il collo e si chiude attorno a una rosa. Sul petto, la pietra della fionda apre le ali.",
    meta: "Black & grey · serpente e rosa",
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
    // dal basso, un poco a destra: la dea sovrasta chi arriva, la didascalia sta accanto e non sulle gambe
    pos: [0.45, 1.5, -62.0],
    look: [0.82, 2.12, -66],
    mpos: [0, 1.75, -61.7],
    mlook: [0, 2.15, -66],
    lift: 0.04,
    index: "VIII",
    title: "La Custode",
    body: "La dea dell'inchiostro ha la pelle di chi tatua: una manica di rose e peonie, un mandala sul dorso della mano. Nella destra non tiene una mela, ma una goccia d'inchiostro.",
    meta: "Black & grey · manica · realismo",
    align: "right",
  },
  {
    // giro attorno alla dea dal lato della manica, fino al dorso
    id: "segno",
    pos: [2.72, 2.45, -67.62],
    look: [-0.12, 2.3, -66.69],
    mpos: [3.05, 2.45, -67.8],
    mlook: [0.12, 2.3, -66.25],
    via: [{ pos: [3.38, 2.05, -64.6], look: [0.1, 2.1, -66] }],
    index: "IX",
    title: "Il segno",
    body: "Lungo la spina, una colonna di perle e di lune. Sulla nuca porta il segno dello studio: un cerchio perfetto, senza inizio né fine.",
    meta: "Ornamentale · dotwork",
    align: "right",
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
export const OUTRO_CAP_WINDOW: [number, number] = [0.1, 0.36];
export const CTA_WINDOW: [number, number] = [0.4, 0.8];

/** lunghezze in schermate di scroll */
export const HERO_LEN = 2.0;
export const STEP_LEN = 1.0;
export const OUTRO_LEN = 2.8;
export const GALLERY_LEN = (STATIONS.length - 1) * STEP_LEN;
export const TOTAL_LEN = HERO_LEN + GALLERY_LEN + OUTRO_LEN;

/** centro della rotonda della Custode */
export const ROTUNDA: [number, number, number] = [0, 0, -66];
