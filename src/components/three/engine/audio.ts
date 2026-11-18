/**
 * Drone generativo (WebAudio, nessun file audio): fondamentali gravi, sega filtrata
 * e fruscio d'inchiostro. La tensione cresce durante l'attraversamento del portale.
 */
export class InkDrone {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private hiss: GainNode | null = null;
  on = false;

  start() {
    if (this.ctx) {
      this.setOn(true);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    filter.Q.value = 3;
    filter.connect(master);
    this.filter = filter;

    const freqs = [41.2, 61.74, 82.41, 123.47];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 3 ? "triangle" : "sawtooth";
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = [0.22, 0.12, 0.08, 0.04][i];
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.031;
      const lg = ctx.createGain();
      lg.gain.value = g.gain.value * 0.5;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(filter);
      o.start();
      lfo.start();
    });

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const hiss = ctx.createGain();
    hiss.gain.value = 0.015;
    noise.connect(bp).connect(hiss).connect(master);
    noise.start();
    this.hiss = hiss;
    this.setOn(true);
  }

  setOn(on: boolean) {
    this.on = on;
    if (!this.ctx || !this.master) return;
    if (on) void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 1.2 : 0.3);
  }

  /** tension 0..1: attraversamento del portale */
  setTension(x: number) {
    if (!this.ctx || !this.filter || !this.hiss) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(260 + x * 1400, t, 0.15);
    this.hiss.gain.setTargetAtTime(0.015 + x * 0.06, t, 0.2);
  }
}
