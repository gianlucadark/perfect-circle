import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { portalFragment, portalVertex } from "./portalShader";
import { CompositeShader, FinalShader } from "./post";
import { Gallery, smoothstep, type StatueMeta, type TorsoMeta } from "./gallery";
import { shared } from "./materials";
import { CTA_WINDOW, GALLERY_LEN, HERO_LEN, OUTRO_CAP_WINDOW, OUTRO_LEN, STATIONS, STEP_LEN, TOTAL_LEN } from "./stations";
import { OUTRO_A } from "./gallery";
import { InkDrone } from "./audio";
import { InfiniteScroll } from "./scroll";
import { AdaptiveQuality } from "./quality";

export interface EngineCallbacks {
  onProgress: (p: number) => void;
}

/**
 * Regia: portale (raymarching a risoluzione ridotta) → galleria (Three.js) → composito, bloom e
 * pass finale. Uno scroll virtuale senza fine guida un percorso circolare: dopo la Custode la
 * camera sale verso l'oculo, che in dissolvenza diventa il cerchio iniziale, e il giro ricomincia.
 */
export class Engine {
  readonly drone = new InkDrone();
  readonly scroller = new InfiniteScroll();
  private gl: THREE.WebGLRenderer;
  private gallery: Gallery;
  private portalScene = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private portalMat: THREE.ShaderMaterial;
  private rtPortal: THREE.WebGLRenderTarget;
  private rtGallery: THREE.WebGLRenderTarget;
  private composer: EffectComposer;
  private composite: ShaderPass;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private quality: AdaptiveQuality;
  private portalDrops = Array.from({ length: 5 }, () => new THREE.Vector4());
  private mouse = new THREE.Vector2();
  private mouseTarget = new THREE.Vector2();
  private intro = 0;
  private started = false;
  private loaded = false;
  private disposed = false;
  private time = 0;
  private captions: HTMLElement[] = [];
  private activeCap = "";
  private lastTension = -1;
  private lastHero = "";
  private lastProgress = "";
  private lastIntro = "";
  private lastInkUi = -1;
  private tapStart = { x: 0, y: 0, t: 0 };
  progress = 0;
  exposureMul = 1;

  constructor(gl: THREE.WebGLRenderer) {
    this.gl = gl;
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 700;
    this.quality = new AdaptiveQuality(mobile);

    this.portalMat = new THREE.ShaderMaterial({
      vertexShader: portalVertex,
      fragmentShader: portalFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uEnter: { value: 0 },
        uOpen: { value: 0 },
        uIntro: { value: 0 },
        uHover: { value: 0 },
        uMouse: { value: new THREE.Vector2() },
        uGallery: { value: null },
        uSteps: { value: mobile ? 56 : 72 },
        uDebug: { value: 0 },
        uDist: { value: 0 },
        uVeil: { value: 0 },
        uMouseAmt: { value: 1 },
        uDrops: { value: this.portalDrops },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.portalMat);
    quad.frustumCulled = false;
    this.portalScene.add(quad);

    const rtOpts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false };
    this.rtPortal = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtGallery = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: true, samples: mobile ? 0 : 4 });
    this.portalMat.uniforms.uGallery.value = this.rtGallery.texture;

    this.gallery = new Gallery(gl);

    this.composer = new EffectComposer(gl, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.composite = new ShaderPass(CompositeShader, "tUnused");
    this.composite.uniforms.tPortal.value = this.rtPortal.texture;
    this.composite.uniforms.tGallery.value = this.rtGallery.texture;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.45, 1.0);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.composite);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);
    this.final.uniforms.uFade.value = 1;

    this.gallery.coarse = window.matchMedia("(pointer: coarse)").matches;
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    window.addEventListener("pointerdown", this.onDown, { passive: true });
    window.addEventListener("pointerup", this.onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onLeave);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __pc: Engine }).__pc = this;
  }

  /** diagnostica in sviluppo */
  get debug() {
    return { portalScale: +this.quality.portalScale.toFixed(2), galleryScale: +this.quality.galleryScale.toFixed(2), progress: +this.progress.toFixed(4), intro: +this.intro.toFixed(2) };
  }

  /** porta il percorso a una frazione 0..1 (preview e cattura) */
  seek(p: number) {
    this.scroller.jump(p * TOTAL_LEN);
  }

  private onPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    this.mouseTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    this.gallery.setPointer(this.mouseTarget.x, this.mouseTarget.y);
  };

  private onLeave = () => this.gallery.clearPointer();

  private onDown = (e: PointerEvent) => {
    this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  /** sugli schermi touch un tocco breve e fermo sulla statua fa partire il disegno da lì */
  private onUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || (e.target as HTMLElement)?.closest?.("button, a")) return;
    const s = this.tapStart;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12 || performance.now() - s.t > 450) return;
    this.gallery.tap((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };

  async load(cb: EngineCallbacks, fontFamily: string) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => cb.onProgress(loaded / Math.max(total, 1));
    try {
      await document.fonts.load(`italic 300 30px ${fontFamily}`);
      await document.fonts.load(`600 30px ${fontFamily}`);
    } catch {
      /* font non critico */
    }
    if (this.disposed) return;
    const [torsos, statues] = await Promise.all([
      fetch("/models/torsos/torsos.json").then((r) => r.json()) as Promise<TorsoMeta[]>,
      fetch("/models/statues/statues.json").then((r) => r.json()) as Promise<StatueMeta[]>,
    ]);
    if (this.disposed) return;
    await this.gallery.load(manager, fontFamily, torsos, statues, () => !this.disposed);
    if (this.disposed) return;
    this.gallery.setSize(this.w, this.h);
    // Precompila entrambe le scene mentre il loader è ancora visibile.
    this.gallery.update(0, 0.016, 0, 1, this.mouse);
    await Promise.all([
      this.gl.compileAsync(this.gallery.scene, this.gallery.camera),
      this.gl.compileAsync(this.portalScene, this.ortho),
    ]);
    if (this.disposed) return;
    this.gl.setRenderTarget(this.rtGallery);
    this.gl.render(this.gallery.scene, this.gallery.camera);
    this.updatePortalDrops();
    this.gl.setRenderTarget(this.rtPortal);
    this.gl.render(this.portalScene, this.ortho);
    this.gl.setRenderTarget(null);
    this.composer.render(0);
    this.loaded = true;
    cb.onProgress(1);
  }

  begin(withSound: boolean) {
    this.started = true;
    this.quality.reset();
    this.scroller.enabled = true;
    if (withSound) this.drone.start();
  }

  bindCaptions(els: HTMLElement[]) {
    this.captions = els;
  }

  setSize(w: number, h: number, dpr: number) {
    const dprChanged = this.dpr !== dpr;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.resizeSceneTargets();
    // Adaptive changes only resize scene targets, never bloom or the camera path.
    if (dprChanged) this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.gallery.setSize(w, h);
    this.quality.reset();
  }

  private resizeSceneTargets() {
    const pw = Math.max(2, Math.round(this.w * this.dpr * this.quality.portalScale));
    const ph = Math.max(2, Math.round(this.h * this.dpr * this.quality.portalScale));
    this.rtPortal.setSize(pw, ph);
    this.portalMat.uniforms.uRes.value.set(pw, ph);
    const gs = this.dpr * this.quality.galleryScale;
    this.rtGallery.setSize(Math.max(2, Math.round(this.w * gs)), Math.max(2, Math.round(this.h * gs)));
  }

  /** Le orbite dipendono solo dal tempo: 5 calcoli per frame, non per passo di ogni raggio. */
  private updatePortalDrops() {
    const ringY = THREE.MathUtils.lerp(-2.95, 0, 1 - Math.pow(1 - this.intro, 3));
    const reveal = smoothstep(0.55, 1, this.intro);
    for (let i = 0; i < this.portalDrops.length; i++) {
      const a = i * 1.2566 + this.time * (0.07 + 0.025 * i) + 0.3;
      const r = 1.49 + 0.25 * Math.sin(this.time * 0.45 + i * 2.1);
      this.portalDrops[i].set(
        Math.cos(a) * r,
        Math.sin(a) * r + ringY,
        0.14 * Math.sin(this.time * 0.6 + i * 1.7),
        (0.045 + 0.022 * Math.sin(i * 3.1 + 1)) * reveal,
      );
    }
  }

  frame(rawDt: number) {
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;
    shared.uTime.value = this.time;
    // The warm-up frame is already drawn by load(); the opaque loader hides the scene.
    if (!this.loaded || !this.started) return;
    this.mouse.lerp(this.mouseTarget, Math.min(1, dt * 3));
    if (this.started) this.intro = Math.min(1, this.intro + dt / 4.2);
    const introE = this.intro;
    this.final.uniforms.uFade.value = Math.max(0, 1 - this.intro * 2.2);

    // linea del tempo circolare: portale → galleria → ascesa, poi di nuovo il portale
    const N = STATIONS.length;
    const s = this.scroller.update(dt);
    const sm = ((s % TOTAL_LEN) + TOTAL_LEN) % TOTAL_LEN;
    this.progress = sm / TOTAL_LEN;
    let h = 1;
    let g = 0;
    let o = -1;
    if (sm < HERO_LEN) h = sm / HERO_LEN;
    else if (sm < HERO_LEN + GALLERY_LEN) g = (sm - HERO_LEN) / STEP_LEN;
    else {
      g = N - 1;
      o = (sm - HERO_LEN - GALLERY_LEN) / OUTRO_LEN;
    }
    const outro = o >= 0;

    const open = outro ? 0 : smoothstep(0.06, 0.55, h);
    const enter = outro ? 0 : smoothstep(0.18, 1.0, h);
    const mixG = outro ? 1 - smoothstep(0.5, 0.8, o) : h >= 0.985 ? 1 : 0;
    const veil = outro ? 1 - smoothstep(0.6, 0.97, o) : 0;
    const renderGallery = mixG > 0 || open > 0.001;
    const renderPortal = mixG < 1;
    const phase = renderPortal ? (renderGallery ? "transition" : "portal") : "gallery";
    if (this.started && this.quality.sample(rawDt, phase)) this.resizeSceneTargets();

    const u = this.portalMat.uniforms;
    u.uTime.value = this.time;
    u.uEnter.value = enter;
    u.uOpen.value = open;
    u.uIntro.value = introE;
    u.uHover.value = (outro ? 1 - veil : 1 - h) * smoothstep(0.6, 1.0, introE);
    u.uMouse.value.copy(this.mouse);
    u.uMouseAmt.value = 1 - veil;
    u.uVeil.value = veil;
    if (outro) {
      // il cerchio iniziale ha a schermo la stessa misura dell'oculo che si sta raggiungendo
      const k = Math.max(1, 1.15 / (this.w / this.h));
      u.uDist.value = Math.max(0, 3.05 / (this.gallery.outroRingScreen(o) * k) - 5.3);
    } else u.uDist.value = 0;

    const push = outro ? 0 : 1 - smoothstep(0.25, 1.0, h);
    // si tatua solo a galleria piena: non durante l'attraversamento né nell'ascesa
    this.gallery.interactive = mixG === 1 && (!outro || o < OUTRO_A * 0.5);
    this.gallery.update(this.time, dt, g, push, this.mouse, outro ? o : -1);

    if (renderGallery) {
      this.gl.setRenderTarget(this.rtGallery);
      this.gl.render(this.gallery.scene, this.gallery.camera);
    }
    if (renderPortal) {
      this.updatePortalDrops();
      this.gl.setRenderTarget(this.rtPortal);
      this.gl.render(this.portalScene, this.ortho);
    }
    this.gl.setRenderTarget(null);
    this.composite.uniforms.uMix.value = mixG;

    // lampo e aberrazione al passaggio nel cerchio, velo di luce nella dissolvenza finale
    const cross = outro ? 0 : smoothstep(0.8, 0.97, h) * (1 - smoothstep(0.97, 1.0, h));
    const glint = outro ? Math.exp(-Math.pow((o - 0.66) / 0.07, 2)) * 0.07 : 0;
    this.final.uniforms.uFlash.value = cross * 0.25 + glint;
    this.final.uniforms.uCA.value = 0.0007 + cross * 0.01 + glint * 0.03;
    this.final.uniforms.uExposure.value = THREE.MathUtils.lerp(2.1, 1.55, mixG) * this.exposureMul;
    this.final.uniforms.uTime.value = this.time;
    this.composer.render(dt);

    // DOM: titolo dell'hero (0 = visibile), avanzamento, didascalie
    const heroOut = outro ? 1 - smoothstep(0.8, 1.0, o) : h;
    const root = document.documentElement.style;
    const hero = heroOut.toFixed(4);
    const progress = this.progress.toFixed(4);
    const intro = introE.toFixed(3);
    if (hero !== this.lastHero) root.setProperty("--hero", (this.lastHero = hero));
    if (progress !== this.lastProgress) root.setProperty("--progress", (this.lastProgress = progress));
    if (intro !== this.lastIntro) root.setProperty("--intro", (this.lastIntro = intro));
    let active = "";
    const sf = this.gallery.stationFloat;
    if (outro) {
      if (o > OUTRO_CAP_WINDOW[0] && o < OUTRO_CAP_WINDOW[1]) active = "outro";
      else if (o > CTA_WINDOW[0] && o < CTA_WINDOW[1]) active = "cta";
    } else if (mixG === 1) {
      const r = Math.round(sf);
      if (Math.abs(sf - r) < 0.3) active = String(r);
    }
    if (active !== this.activeCap) {
      this.activeCap = active;
      for (const el of this.captions) el.classList.toggle("is-on", el.dataset.station === active);
    }
    for (const el of this.captions) {
      if (el.dataset.station !== active) continue;
      const mid = (w: [number, number]) => (w[0] + w[1]) / 2;
      const d = active === "outro" ? (o - mid(OUTRO_CAP_WINDOW)) * 3 : active === "cta" ? (o - mid(CTA_WINDOW)) * 1.2 : sf - Number(active);
      el.style.transform = `translate3d(0, ${(d * -46).toFixed(1)}px, 0)`;
    }
    const inkUi = this.gallery.inkUi;
    if (inkUi !== this.lastInkUi) {
      this.lastInkUi = inkUi;
      const cl = document.documentElement.classList;
      cl.toggle("pc-hint", inkUi === 1);
      cl.toggle("pc-inking", inkUi === 2);
    }

    const tension = outro ? smoothstep(0.4, 0.72, o) * (1 - smoothstep(0.8, 1, o)) : smoothstep(0.2, 0.95, h) * (1 - smoothstep(0.98, 1, h));
    const tq = Math.round(tension * 50) / 50;
    if (tq !== this.lastTension) {
      this.lastTension = tq;
      this.drone.setTension(tq);
    }
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    document.documentElement.removeEventListener("pointerleave", this.onLeave);
    document.documentElement.classList.remove("pc-hint", "pc-inking");
    this.scroller.dispose();
    this.composer.dispose();
    this.composite.dispose();
    this.bloom.dispose();
    this.final.dispose();
    this.portalMat.dispose();
    (this.portalScene.children[0] as THREE.Mesh).geometry.dispose();
    this.rtPortal.dispose();
    this.rtGallery.dispose();
  }
}
