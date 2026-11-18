/**
 * Scroll virtuale senza fine: rotella, touch con inerzia e tastiera spostano un valore illimitato
 * (in schermate). La regia ne prende il modulo sulla lunghezza del percorso, così dopo l'ultima
 * sala si ritrova il cerchio iniziale senza salti, in entrambe le direzioni.
 */
export class InfiniteScroll {
  target = 0;
  current = 0;
  enabled = false;
  private touching = false;
  private lastY = 0;
  private lastT = 0;
  private vel = 0; // schermate al secondo
  private reduced: boolean;

  constructor() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("touchstart", this.onTouchStart, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: false });
    window.addEventListener("touchend", this.onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", this.onTouchEnd, { passive: true });
    window.addEventListener("keydown", this.onKey);
  }

  private get vh() {
    return Math.max(320, window.innerHeight);
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 18;
    else if (e.deltaMode === 2) d *= this.vh;
    d = Math.max(-260, Math.min(260, d));
    this.target += (d / this.vh) * 0.9;
  };

  private onTouchStart = (e: TouchEvent) => {
    if (!this.enabled || e.touches.length !== 1) return;
    this.touching = true;
    this.lastY = e.touches[0].clientY;
    this.lastT = performance.now();
    this.vel = 0;
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.enabled || !this.touching) return;
    if ((e.target as HTMLElement)?.closest?.("button, a")) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const now = performance.now();
    const d = ((this.lastY - y) / this.vh) * 1.7;
    const dt = Math.max(1, now - this.lastT) / 1000;
    this.vel = this.vel * 0.6 + (d / dt) * 0.4;
    this.target += d;
    this.lastY = y;
    this.lastT = now;
  };

  private onTouchEnd = () => {
    if (!this.touching) return;
    this.touching = false;
    // inerzia: prosegue nella direzione del gesto, poi lo smorzamento lo ferma
    if (performance.now() - this.lastT < 90) this.target += Math.max(-1.6, Math.min(1.6, this.vel * 0.32));
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const k = e.key;
    const step = k === "ArrowDown" || k === "ArrowRight" ? 0.18 : k === "ArrowUp" || k === "ArrowLeft" ? -0.18 : k === "PageDown" || (k === " " && !e.shiftKey) ? 0.9 : k === "PageUp" || (k === " " && e.shiftKey) ? -0.9 : 0;
    if (!step) return;
    e.preventDefault();
    this.target += step;
  };

  /** porta subito lo scroll a un valore (preview e cattura) */
  jump(v: number) {
    this.target = v;
    this.current = v;
  }

  update(dt: number) {
    const rate = this.reduced ? 14 : this.touching ? 12 : 4.6;
    this.current += (this.target - this.current) * (1 - Math.exp(-dt * rate));
    if (Math.abs(this.target - this.current) < 1e-5) this.current = this.target;
    return this.current;
  }

  dispose() {
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("touchcancel", this.onTouchEnd);
    window.removeEventListener("keydown", this.onKey);
  }
}
