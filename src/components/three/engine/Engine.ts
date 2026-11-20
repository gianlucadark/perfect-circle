import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { portalFragment, portalVertex } from "./portalShader";
import { bloomHighPassFragment, CompositeShader, FinalShader } from "./post";
import { Gallery, smoothstep, type ModelCatalog } from "./gallery";
import { shared } from "./materials";
import { CTA_WINDOW, GALLERY_LEN, HERO_LEN, OUTRO_CAP_WINDOW, OUTRO_LEN, STATIONS, STEP_LEN, TOTAL_LEN } from "./stations";
import { OUTRO_A } from "./gallery";
import { InkDrone } from "./audio";
import { InfiniteScroll } from "./scroll";
import { AdaptiveQuality, BASE_DPR, baseDpr, planQuality, portalRange, type FrameCosts, type QualityPlan } from "./quality";

/** posizione dell'hero (0..1) misurata come attraversamento del cerchio: la fase più pesante */
const CROSS_H = 0.37;

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
  /** DPR di riferimento (quello storico del canvas): bloom, grana e particelle restano tarati qui */
  private base = 1;
  private mobile: boolean;
  /** il canvas è sopra il DPR di base perché la calibrazione lo ha consentito */
  private raised = false;
  private quality: AdaptiveQuality;
  /** la regia chiede a R3F un altro DPR del canvas (calibrazione o ritorno di sicurezza) */
  onDpr?: (dpr: number | [number, number]) => void;
  calibration: { costs: FrameCosts; cpu: FrameCosts; plan: QualityPlan } | null = null;
  private portalDrops = Array.from({ length: 5 }, () => new THREE.Vector4());
  private mouse = new THREE.Vector2();
  private mouseTarget = new THREE.Vector2();
  private intro = 0;
  private started = false;
  private loaded = false;
  private lifetime = new AbortController();
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
    this.mobile = mobile;
    this.base = baseDpr(window.devicePixelRatio);
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
    // Il bloom sfoca in texel: resta alla risoluzione di riferimento, così alone e raggio non
    // cambiano quando il canvas ha più pixel; il passa-alto copre l'impronta di ogni suo texel.
    const highPass = this.bloom.materialHighPassFilter;
    highPass.uniforms.uTap = { value: new THREE.Vector2() };
    highPass.fragmentShader = bloomHighPassFragment;
    const setBloomSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (width: number, height: number) => {
      const k = Math.min(1, this.base / this.dpr);
      setBloomSize(Math.max(2, Math.round(width * k)), Math.max(2, Math.round(height * k)));
      const bright = this.bloom.renderTargetBright;
      highPass.uniforms.uTap.value.set(0.25 / bright.width, 0.25 / bright.height);
    };
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
    return {
      portalScale: +this.quality.portalScale.toFixed(2),
      galleryScale: +this.quality.galleryScale.toFixed(2),
      dpr: this.dpr,
      progress: +this.progress.toFixed(4),
      intro: +this.intro.toFixed(2),
    };
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

  private compileScene(scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget) {
    // Three sceglie la variante dello shader in base allo spazio colore del target attivo.
    const previous = this.gl.getRenderTarget();
    this.gl.setRenderTarget(target);
    try {
      return this.gl.compileAsync(scene, camera);
    } finally {
      this.gl.setRenderTarget(previous);
    }
  }

  async load(cb: EngineCallbacks, fontFamily: string, models: ModelCatalog) {
    const { signal } = this.lifetime;
    // In Strict Mode il primo mount viene annullato prima di avviare decoder e compilazione.
    await Promise.resolve();
    if (signal.aborted) return;
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => cb.onProgress(loaded / Math.max(total, 1));
    await Promise.all([
      this.gallery.load(manager, fontFamily, models, signal),
      this.compileScene(this.portalScene, this.ortho, this.rtPortal),
    ]);
    if (signal.aborted) return;
    this.gallery.setSize(this.w, this.h);
    // Precompila entrambe le scene mentre il loader è ancora visibile.
    this.gallery.update(0, 0.016, 0, 1, this.mouse);
    await this.compileScene(this.gallery.scene, this.gallery.camera, this.rtGallery);
    if (signal.aborted) return;
    this.applyPlan(this.calibrate());
    this.warm();
    this.loaded = true;
    cb.onProgress(1);
  }

  /** Disegna una volta entrambe le scene e i pass finali: shader e target sono pronti prima dell'ingresso. */
  private warm() {
    this.gl.setRenderTarget(this.rtGallery);
    this.gl.render(this.gallery.scene, this.gallery.camera);
    this.updatePortalDrops();
    this.gl.setRenderTarget(this.rtPortal);
    this.gl.render(this.portalScene, this.ortho);
    this.gl.setRenderTarget(null);
    this.composer.render(0);
  }

  /**
   * Misura il dispositivo mentre il loader è ancora visibile: tempo reale di un fotogramma completo
   * (render + lettura sincrona di un pixel) per hero, attraversamento e galleria, a canvas di base.
   * Così un telefono veloce parte nitido invece di salire per gradi, e uno lento non viene forzato.
   */
  private calibrate(): QualityPlan {
    const range = portalRange(this.mobile);
    const fallback: QualityPlan = { dpr: this.base, portal: this.base * range.start };
    if (document.visibilityState === "hidden") return fallback;
    if (process.env.NODE_ENV !== "production") {
      // solo sviluppo: ?pcdpr=2 forza il DPR alzato per confrontare l'aspetto
      const forced = Number(new URLSearchParams(window.location.search).get("pcdpr"));
      if (forced > 0) return { dpr: Math.min(forced, window.devicePixelRatio), portal: this.base * range.max };
    }
    const gl = this.gl;
    const ctx = gl.getContext();
    const pixel = new Uint8Array(4);
    const sync = () => {
      gl.setRenderTarget(null);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
    };
    const u = this.portalMat.uniforms;
    const intro = this.intro;
    this.quality.portalScale = range.max;
    this.resizeSceneTargets();
    this.intro = 1;
    this.updatePortalDrops();
    // un quarto dei pixel senza riallocare: si disegna in un viewport di metà lato
    const quarter = (rt: THREE.WebGLRenderTarget, on: boolean) =>
      rt.viewport.set(0, 0, on ? Math.round(rt.width / 2) : rt.width, on ? Math.round(rt.height / 2) : rt.height);
    const portalAt = (h: number, small = false) => {
      quarter(this.rtPortal, small);
      u.uRes.value.set(this.rtPortal.viewport.z, this.rtPortal.viewport.w);
      u.uTime.value = this.time;
      u.uIntro.value = 1;
      u.uEnter.value = smoothstep(0.18, 1.0, h);
      u.uOpen.value = smoothstep(0.06, 0.55, h);
      u.uHover.value = 1 - h;
      u.uMouse.value.set(0, 0);
      u.uMouseAmt.value = 1;
      u.uVeil.value = 0;
      u.uDist.value = 0;
      gl.setRenderTarget(this.rtPortal);
      gl.render(this.portalScene, this.ortho);
      quarter(this.rtPortal, false);
      u.uRes.value.set(this.rtPortal.width, this.rtPortal.height);
    };
    const galleryAt = (push: number, small = false) => {
      this.gallery.update(this.time, 0, 0, push, this.mouse);
      quarter(this.rtGallery, small);
      gl.setRenderTarget(this.rtGallery);
      gl.render(this.gallery.scene, this.gallery.camera);
      quarter(this.rtGallery, false);
    };
    const post = (mix: number) => {
      this.composite.uniforms.uMix.value = mix;
      this.composer.render(0);
    };
    const draws: Record<keyof FrameCosts, () => void> = {
      post: () => post(0),
      hero: () => {
        portalAt(0);
        post(0);
      },
      heroQuarter: () => {
        portalAt(0, true);
        post(0);
      },
      gallery: () => {
        galleryAt(0);
        post(1);
      },
      galleryQuarter: () => {
        galleryAt(0, true);
        post(1);
      },
      cross: () => {
        galleryAt(1 - smoothstep(0.25, 1.0, CROSS_H));
        portalAt(CROSS_H);
        post(0);
      },
    };
    const keys = Object.keys(draws) as (keyof FrameCosts)[];
    const total = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<keyof FrameCosts, number[]>;
    const cpu = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<keyof FrameCosts, number[]>;
    const restore = () => {
      this.intro = intro;
      this.updatePortalDrops();
      this.composite.uniforms.uMix.value = 0;
      this.gallery.update(this.time, 0, 0, 1, this.mouse);
    };
    // giro di riscaldamento (caricamento texture, primo uso dei programmi: costi una tantum);
    // poi un hero misurato: un dispositivo chiaramente lento resta sulle impostazioni storiche
    for (const key of keys) draws[key]();
    sync();
    const t0 = performance.now();
    draws.hero();
    sync();
    if (performance.now() - t0 > 50) {
      restore();
      return fallback;
    }
    // ~200 ms di lavoro continuo (al più tre fotogrammi in coda) perché la GPU esca dal risparmio
    // energetico del loader, poi tre giri misurati
    for (let i = 0, t = performance.now(); i < 40 && performance.now() - t < 200; i++) {
      draws.cross();
      if (i % 3 === 2) sync();
    }
    for (let round = 0; round < 3; round++) {
      for (const key of keys) {
        sync();
        const t = performance.now();
        draws[key]();
        cpu[key].push(performance.now() - t);
        sync();
        total[key].push(performance.now() - t);
      }
    }
    restore();
    // le interferenze (altri processi, frequenze) possono solo rallentare: vale la misura migliore
    const best = (s: Record<keyof FrameCosts, number[]>) => Object.fromEntries(keys.map((k) => [k, +Math.min(...s[k]).toFixed(2)])) as unknown as FrameCosts;
    const costs = best(total);
    const cpuCosts = best(cpu);
    const plan = planQuality({
      costs,
      cpu: cpuCosts,
      dpr: this.dpr,
      outputPx: gl.domElement.width * gl.domElement.height,
      portalPx: this.rtPortal.width * this.rtPortal.height,
      galleryPx: this.rtGallery.width * this.rtGallery.height,
      base: this.base,
      device: window.devicePixelRatio || 1,
      mobile: this.mobile,
    });
    this.calibration = { costs, cpu: cpuCosts, plan };
    return plan;
  }

  /** Imposta DPR del canvas e scale iniziali; i minimi assoluti restano quelli storici. */
  applyPlan(plan: QualityPlan) {
    const d = plan.dpr;
    const range = portalRange(this.mobile);
    this.raised = d > this.base + 1e-3;
    this.quality.configure({
      portal: plan.portal / d,
      portalMax: (this.base * range.max) / d,
      portalMin: (this.base * range.min) / d,
      gallery: 1,
      galleryMin: 0.6,
      // a DPR alzato non si adatta nulla: al primo calo di fluidità si torna al DPR di base
      strict: this.raised,
    });
    if (Math.abs(d - this.dpr) > 1e-3) this.onDpr?.(this.raised ? d : BASE_DPR);
    else this.resizeSceneTargets();
  }

  /** Rete di sicurezza: se a DPR alzato non resta nulla da ridurre, il canvas torna al DPR di base. */
  private dropDpr() {
    const k = this.dpr / this.base;
    const range = portalRange(this.mobile);
    this.raised = false;
    this.quality.configure({
      portal: this.quality.portalScale * k,
      portalMax: range.max,
      portalMin: range.min,
      gallery: this.quality.galleryScale * k,
      galleryMin: 0.6,
    });
    this.onDpr?.(BASE_DPR);
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
    this.base = baseDpr(window.devicePixelRatio);
    this.resizeSceneTargets();
    // Adaptive changes only resize scene targets, never bloom or the camera path.
    if (dprChanged) this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w * dpr, h * dpr);
    const grain = Math.min(this.base, dpr);
    this.final.uniforms.uGrainRes.value.set(w * grain, h * grain);
    this.gallery.setSize(w, h);
    this.quality.reset();
    // ancora dietro il loader: i nuovi target si allocano adesso, non nel primo fotogramma visibile
    if (this.loaded && !this.started) this.warm();
  }

  private resizeSceneTargets() {
    const pw = Math.max(2, Math.round(this.w * this.dpr * this.quality.portalScale));
    const ph = Math.max(2, Math.round(this.h * this.dpr * this.quality.portalScale));
    this.rtPortal.setSize(pw, ph);
    this.portalMat.uniforms.uRes.value.set(pw, ph);
    const gs = this.dpr * this.quality.galleryScale;
    const gw = Math.max(2, Math.round(this.w * gs));
    const gh = Math.max(2, Math.round(this.h * gs));
    this.rtGallery.setSize(gw, gh);
    // le sorgenti più piccole dell'uscita si ingrandiscono in bicubico nel composito
    const ow = Math.floor(this.w * this.dpr);
    const oh = Math.floor(this.h * this.dpr);
    const cu = this.composite.uniforms;
    cu.uPortalTexel.value.set(1 / pw, 1 / ph, pw, ph);
    cu.uPortalUp.value = pw < ow - 0.5 || ph < oh - 0.5 ? 1 : 0;
    cu.uGalleryTexel.value.set(1 / gw, 1 / gh, gw, gh);
    cu.uGalleryUp.value = gw < ow - 0.5 || gh < oh - 0.5 ? 1 : 0;
    // particelle in pixel: stessa misura a schermo a qualsiasi risoluzione della galleria
    this.gallery.setPixelScale(gh / (this.h * Math.min(this.base, this.dpr)));
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
    if (this.quality.starved) {
      this.quality.starved = false;
      if (this.raised) this.dropDpr();
    }

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
      // l'ultima sosta coincide con l'inizio dell'outro: la sua didascalia resta finché la camera riparte
      if (o < OUTRO_CAP_WINDOW[0] - 0.035) active = String(N - 1);
      else if (o > OUTRO_CAP_WINDOW[0] && o < OUTRO_CAP_WINDOW[1]) active = "outro";
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
    this.lifetime.abort();
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
