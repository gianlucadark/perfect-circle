export type RenderPhase = "portal" | "gallery" | "transition";

/** Separate resolution budgets: an invisible scene must never consume a quality adjustment. */
export class AdaptiveQuality {
  portalScale: number;
  galleryScale = 1;
  private portalMax: number;
  private phase: RenderPhase | null = null;
  private elapsed = 0;
  private frames = 0;
  private fastWindows = 0;

  constructor(mobile: boolean) {
    this.portalScale = mobile ? 0.65 : 0.6;
    this.portalMax = mobile ? 1 : 0.72;
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.fastWindows = 0;
    this.phase = null;
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
    if (this.elapsed < 0.9 || this.frames < 8) return false;
    const average = this.elapsed / this.frames;
    this.elapsed = 0;
    this.frames = 0;
    const portal = phase !== "gallery";
    const gallery = phase !== "portal";
    const previousPortal = this.portalScale;
    const previousGallery = this.galleryScale;

    // Preserve the original ~34 fps safety threshold: avoid sacrificing detail
    // in the deliberately heavier transition when it is already running smoothly.
    if (average > 1 / 34) {
      this.fastWindows = 0;
      if (portal && this.portalScale > 0.35) {
        this.portalScale = Math.max(0.35, this.portalScale - 0.08);
      } else if (gallery) {
        this.galleryScale = Math.max(0.6, this.galleryScale - 0.1);
      }
    } else if (average < 1 / 57) {
      // Increase only after two stable windows, to avoid repeated reallocations.
      if (++this.fastWindows < 2) return false;
      this.fastWindows = 0;
      if (gallery && this.galleryScale < 1) {
        this.galleryScale = Math.min(1, this.galleryScale + 0.1);
      } else if (portal) {
        this.portalScale = Math.min(this.portalMax, this.portalScale + 0.05);
      }
    } else {
      this.fastWindows = 0;
    }
    return this.portalScale !== previousPortal || this.galleryScale !== previousGallery;
  }
}
