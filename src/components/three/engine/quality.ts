export type RenderPhase = "portal" | "gallery" | "transition";
type Scene = "portal" | "gallery";

/** DPR di partenza del canvas, [minimo, massimo] come in R3F: bloom, grana e particelle sono tarati su questo. */
export const BASE_DPR: [number, number] = [1, 1.25];
export const baseDpr = (device: number) => Math.min(Math.max(BASE_DPR[0], device || 1), BASE_DPR[1]);

/** Risoluzioni del portale come frazione del DPR di base: partenza, massimo e minimo storici. */
export const portalRange = (mobile: boolean) => ({ start: mobile ? 0.65 : 0.6, max: mobile ? 1 : 0.72, min: 0.35 });

export interface QualityRange {
  /** valori relativi al DPR attuale del canvas */
  portal: number;
  portalMax: number;
  portalMin: number;
  gallery: number;
  galleryMin: number;
  /** canvas sopra il DPR di base: niente adattamenti, si segnala appena la fluidità cala */
  strict?: boolean;
}

/** Separate resolution budgets: an invisible scene must never consume a quality adjustment. */
export class AdaptiveQuality {
  portalScale: number;
  galleryScale = 1;
  /** nothing left to reduce, or (strict) fluidity lost: the caller should lower the canvas DPR */
  starved = false;
  private portalMax: number;
  private portalMin: number;
  private galleryMin = 0.6;
  private strict = false;
  private roughWindows = 0;
  /** frames slower than ~45 fps in the current window (single spikes do not make a window rough) */
  private longFrames = 0;
  private phase: RenderPhase | null = null;
  private elapsed = 0;
  private frames = 0;
  private fastWindows = 0;
  /** last increase, kept under observation for two windows */
  private trial: { scene: Scene; from: number; windows: number } | null = null;
  /** levels that already cost fluidity, per phase and scene: never retried */
  private ceilings = new Map<string, number>();

  constructor(mobile: boolean) {
    const r = portalRange(mobile);
    this.portalScale = r.start;
    this.portalMax = r.max;
    this.portalMin = r.min;
  }

  /** Scales calibrated on the device (fractions of the current canvas DPR). */
  configure(r: QualityRange) {
    this.portalMax = r.portalMax;
    this.portalMin = Math.min(r.portalMin, r.portalMax);
    this.galleryMin = Math.min(r.galleryMin, 1);
    this.portalScale = Math.min(this.portalMax, Math.max(this.portalMin, r.portal));
    this.galleryScale = Math.min(1, Math.max(this.galleryMin, r.gallery));
    this.strict = r.strict ?? false;
    this.roughWindows = 0;
    this.ceilings.clear();
    this.starved = false;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.longFrames = 0;
    this.fastWindows = 0;
    this.phase = null;
    this.trial = null;
  }

  sample(dt: number, phase: RenderPhase): boolean {
    // Long tab resumes and invalid samples are not sustained rendering load.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) {
      this.reset();
      return false;
    }
    if (phase !== this.phase) {
      this.reset();
      this.phase = phase;
      return false;
    }
    this.elapsed += dt;
    this.frames++;
    if (dt > 1 / 45) this.longFrames++;
    if (this.elapsed < 0.9 || this.frames < 8) return false;
    const average = this.elapsed / this.frames;
    const long = this.longFrames / this.frames;
    this.elapsed = 0;
    this.frames = 0;
    this.longFrames = 0;
    const portal = phase !== "gallery";
    const gallery = phase !== "portal";
    const previousPortal = this.portalScale;
    const previousGallery = this.galleryScale;

    if (this.strict) {
      // The higher canvas DPR is a bonus kept only while everything is smooth: a window where most
      // frames are late, or two consecutive windows with one late frame in five, hand control back
      // to the base DPR. Counting late frames (not the average) ignores an isolated hitch.
      if (long > 0.2) {
        if (long > 0.5 || ++this.roughWindows >= 2) this.starved = true;
      } else this.roughWindows = 0;
      return false;
    }

    const trial = this.trial;
    if (trial) {
      // An increase must keep the frame rate smooth: otherwise it is undone and the level is
      // remembered, so the scene does not keep bouncing against the vsync limit.
      if (average > 1 / 52) {
        this.trial = null;
        this.fastWindows = 0;
        this.ceilings.set(`${phase}:${trial.scene}`, trial.from);
        if (trial.scene === "portal") this.portalScale = trial.from;
        else this.galleryScale = trial.from;
        return true;
      }
      if (++trial.windows >= 2) this.trial = null;
    }

    // Preserve the original ~34 fps safety threshold: avoid sacrificing detail
    // in the deliberately heavier transition when it is already running smoothly.
    if (average > 1 / 34) {
      this.fastWindows = 0;
      if (portal && this.portalScale > this.portalMin) {
        this.portalScale = Math.max(this.portalMin, this.portalScale - 0.08);
      } else if (gallery && this.galleryScale > this.galleryMin) {
        this.galleryScale = Math.max(this.galleryMin, this.galleryScale - 0.1);
      } else {
        this.starved = true;
      }
    } else if (average < 1 / 57) {
      // Increase only after two stable windows, to avoid repeated reallocations.
      if (++this.fastWindows < 2) return false;
      this.fastWindows = 0;
      const galleryCeil = Math.min(1, this.ceilings.get(`${phase}:gallery`) ?? 1);
      const portalCeil = Math.min(this.portalMax, this.ceilings.get(`${phase}:portal`) ?? Infinity);
      if (gallery && this.galleryScale < galleryCeil - 1e-6) {
        this.trial = { scene: "gallery", from: this.galleryScale, windows: 0 };
        this.galleryScale = Math.min(galleryCeil, this.galleryScale + 0.1);
      } else if (portal && this.portalScale < portalCeil - 1e-6) {
        this.trial = { scene: "portal", from: this.portalScale, windows: 0 };
        this.portalScale = Math.min(portalCeil, this.portalScale + 0.05);
      }
    } else {
      this.fastWindows = 0;
    }
    return this.portalScale !== previousPortal || this.galleryScale !== previousGallery;
  }
}

/**
 * Tempi (ms) di un fotogramma completo, misurati sul dispositivo a canvas di base. Ogni scena è
 * misurata due volte, a piena risoluzione e su un quarto dei pixel, per separare i costi fissi
 * (CPU, ombre, riflessi del pavimento) da quelli che crescono con la risoluzione.
 */
export interface FrameCosts {
  /** solo composito, bloom e pass finale */
  post: number;
  /** portale nell'hero + post, a piena risoluzione e su un quarto dei pixel */
  hero: number;
  heroQuarter: number;
  /** galleria + post, a piena risoluzione e su un quarto dei pixel */
  gallery: number;
  galleryQuarter: number;
  /** attraversamento del cerchio: galleria + portale + post */
  cross: number;
}

export interface CalibrationInput {
  /** tempo totale di ogni misura, fino alla fine del lavoro della GPU */
  costs: FrameCosts;
  /** parte di ogni misura spesa sul thread principale: non cresce con la risoluzione e, durante
   *  l'esecuzione normale, si sovrappone al lavoro della GPU del fotogramma precedente */
  cpu?: Partial<FrameCosts>;
  /** DPR del canvas durante la misura e pixel effettivi di canvas, portale e galleria */
  dpr: number;
  outputPx: number;
  portalPx: number;
  galleryPx: number;
  /** DPR di base e devicePixelRatio dello schermo */
  base: number;
  device: number;
  mobile: boolean;
}

/** DPR del canvas e risoluzione assoluta (in DPR) da cui parte il portale. */
export interface QualityPlan {
  dpr: number;
  portal: number;
}

const FRAME_MS = 1000 / 60;
/**
 * Margini sul fotogramma a 60 Hz per il lavoro della GPU. Le misure includono anche l'attesa della
 * lettura sincrona, quindi sono già prudenti; a DPR alzato una rete di sicurezza torna indietro.
 */
const BUDGET = { hero: 0.75 * FRAME_MS, gallery: 0.8 * FRAME_MS, cross: 0.9 * FRAME_MS };
const DPR_TIERS = [2, 1.75, 1.5];

/**
 * Sceglie la risoluzione dalle misure.
 * - Su telefono, il canvas sale oltre il DPR di base solo se galleria, hero (portale al massimo
 *   storico) e attraversamento restano dentro il budget con i pixel in più.
 * - Il portale parte dal livello più alto che sta nel budget dell'hero, mai sotto la partenza
 *   storica e mai sopra il massimo storico.
 */
export function planQuality({ costs, cpu = {}, dpr, outputPx, portalPx, galleryPx, base, device, mobile }: CalibrationInput): QualityPlan {
  const range = portalRange(mobile);
  const portalMax = base * range.max;
  const portalStart = base * range.start;
  const fallback = { dpr: base, portal: portalStart };
  const values = [...Object.values(costs), ...Object.values(cpu), outputPx, portalPx, galleryPx, dpr];
  if (!values.every((v) => Number.isFinite(v) && v >= 0) || Math.max(costs.hero, costs.cross, costs.gallery) > 250 || costs.hero <= 0) return fallback;

  const gpu = (k: keyof FrameCosts) => Math.max(0, costs[k] - (cpu[k] ?? 0));
  const area = outputPx / (dpr * dpr); // pixel CSS
  const px = (d: number) => area * d * d;
  const kPost = gpu("post") / outputPx;
  // Costo di un pixel in più: pendenza fra le due misure, ma almeno metà del portale e un terzo
  // della galleria. A bassa risoluzione i frammenti si nascondono dietro i vertici e la pendenza
  // misurata sottostima quella reale.
  const slope = (full: keyof FrameCosts, quarter: keyof FrameCosts, n: number, share: number) =>
    Math.max((share * Math.max(0, gpu(full) - gpu("post"))) / n, (costs[full] - costs[quarter]) / (0.75 * n));
  const kPortal = slope("hero", "heroQuarter", portalPx, 0.5);
  const kGallery = slope("gallery", "galleryQuarter", galleryPx, 1 / 3);

  if (mobile) {
    for (const tier of DPR_TIERS) {
      const d = Math.min(tier, device);
      if (d <= base + 1e-3) continue;
      const added = px(d) - outputPx;
      // il portale è misurato al suo massimo storico e non cambia: crescono galleria e pass finali
      const fits =
        gpu("gallery") + (kGallery + kPost) * added <= BUDGET.gallery &&
        gpu("hero") + kPost * added <= BUDGET.hero &&
        gpu("cross") + (kGallery + kPost) * added <= BUDGET.cross;
      if (fits) return { dpr: d, portal: portalMax };
    }
  }
  // a DPR di base il portale parte dal livello più alto che sta nel budget dell'hero
  const over = gpu("hero") - BUDGET.hero;
  if (over <= 0) return { dpr: base, portal: portalMax };
  const portal = kPortal > 0 ? Math.sqrt(Math.max(0, portalPx - over / kPortal) / area) : portalStart;
  return { dpr: base, portal: Math.min(portalMax, Math.max(portalStart, portal)) };
}
