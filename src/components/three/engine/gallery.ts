import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  InkFloorShader,
  makeBeamMaterial,
  makeFlashMaterial,
  makeInkRingMaterial,
  makeInkStoneMaterial,
  makeMembraneMaterial,
  maskTexture,
  shared,
  type InkStoneOptions,
} from "./materials";
import { makeFlashCanvas, makeTorsoTattooCanvas, type TorsoVariant } from "./tattoo";
import { makeStatueTattoo } from "./statueTattoos";
import { ROTUNDA, STATIONS } from "./stations";

interface LightRig {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  angle: number;
  weight: number;
}

interface Exhibit {
  root: THREE.Object3D;
  pivot: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  revealStation: number;
  rig: LightRig;
  beam: THREE.Mesh;
  follow: boolean;
  spin: number;
  baseYaw: number;
}

export interface TorsoMeta {
  id: string;
  file: string;
  height: number;
  circumference: number;
  frontYaw: number;
}

export interface StatueMeta {
  id: string;
  file: string;
  height: number;
}

const TORSO_LAYOUT: { id: string; variant: TorsoVariant; x: number; z: number; station: number; dark?: boolean; pour?: number; ink?: number; metal?: number; spin?: number }[] = [
  { id: "KAS1048", variant: "valentini", x: -2.4, z: -19.6, station: 5 },
  { id: "KAS2113", variant: "iris", x: 2.4, z: -21.6, station: 5, dark: true, ink: 0xa59c8b, metal: 1 },
  { id: "KAS402", variant: "belvedere", x: -2.4, z: -24.2, station: 6 },
  { id: "KAS100", variant: "psiche", x: 2.4, z: -26.8, station: 7 },
  { id: "KAS1242", variant: "doriforo", x: -2.4, z: -29.4, station: 7 },
  { id: "KAS425", variant: "apollo", x: 2.4, z: -32.0, station: 8, pour: 1, spin: 0 },
];

const GOLD = new THREE.Color(0.62, 0.47, 0.26);

/** busti sui plinti: posizione, scala d'esposizione, stazione che li rivela */
const BUSTS: { id: string; x: number; z: number; yaw: number; scale: number; plinth: number; plinthW?: number; station: number; follow: boolean; mat?: InkStoneOptions }[] = [
  { id: "KAS1819", x: -1.9, z: -5.0, yaw: 0.75, scale: 1.75, plinth: 0.95, station: 1, follow: true },
  { id: "KAS1513", x: 1.9, z: -9.0, yaw: -0.75, scale: 1.2, plinth: 0.85, station: 2, follow: true },
  { id: "DEP439", x: 0, z: -15.4, yaw: 0, scale: 1.9, plinth: 0.95, station: 4, follow: false, mat: { dark: 1, inkColor: GOLD, inkMetal: 1, inkRough: 0.22, glow: 0xffb35c } },
  { id: "KAS2232", x: 0, z: -34.6, yaw: -0.65, scale: 1.25, plinth: 0.3, plinthW: 1.02, station: 8, follow: false },
];

/** teste del coro: scala e quota del centro della testa (spazio oggetto) */
const CHOIR: Record<string, { scale: number; head: number }> = {
  KAS622: { scale: 1.05, head: 0.45 },
  KAS639: { scale: 1.2, head: 0.36 },
  KAS394: { scale: 1.35, head: 0.33 },
  KAS615: { scale: 1.0, head: 0.47 },
};

const VENUS_SCALE = 1.3;
const VENUS_BASE = 0.5;
/** anello dell'oculo nella rotonda: raggio della linea media e del tubo (stesso rapporto del portale) */
export const OCULUS_R = 3.0;
const OCULUS_TUBE = 0.55;
/** quota della camera al termine dell'ascesa */
const RISE_END = 7.5;
const RISE_START = 3.95;
/** frazioni dell'outro */
export const OUTRO_A = 0.36; // fine della salita lungo la Custode
export const OUTRO_B = 0.9; // fine dell'ascesa verso l'oculo

export class Gallery {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 80);
  private renderer: THREE.WebGLRenderer;
  private exhibits: Exhibit[] = [];
  private choirMats: THREE.MeshStandardMaterial[] = [];
  private pool: THREE.SpotLight[] = [];
  private flashMats: THREE.ShaderMaterial[] = [];
  private floor?: Reflector;
  private posCurve: THREE.CatmullRomCurve3;
  private lookCurve: THREE.CatmullRomCurve3;
  private posCurveM: THREE.CatmullRomCurve3;
  private lookCurveM: THREE.CatmullRomCurve3;
  private tmpP = new THREE.Vector3();
  private stationT: number[] = [];
  private rain?: THREE.InstancedMesh;
  private rainState: Float32Array = new Float32Array(0);
  private drops?: THREE.InstancedMesh;
  private dropState: Float32Array = new Float32Array(0);
  private dust?: THREE.Points;
  private gates: THREE.Mesh[] = [];
  private oculus?: THREE.Mesh;
  private membrane?: THREE.Mesh;
  private crown?: THREE.Group;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpEuler = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private look = new THREE.Vector3();
  private w = 1;
  private h = 1;
  private portrait = 0;
  /** apertura verticale di base e quota dell'oculo (dipendono dal formato dello schermo) */
  fov0 = 42;
  oculusY = 21;
  stationFloat = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.scene.background = new THREE.Color(0.0045, 0.0048, 0.0055);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0.0045, 0.0048, 0.0055), 0.036);
    const pts: THREE.Vector3[] = [];
    const looks: THREE.Vector3[] = [];
    const ptsM: THREE.Vector3[] = [];
    const looksM: THREE.Vector3[] = [];
    const idx: number[] = [];
    STATIONS.forEach((s) => {
      idx.push(pts.length);
      pts.push(new THREE.Vector3(...s.pos));
      looks.push(new THREE.Vector3(...s.look));
      ptsM.push(new THREE.Vector3(...(s.mpos ?? s.pos)));
      looksM.push(new THREE.Vector3(...(s.mlook ?? s.look)));
      s.via?.forEach((v) => {
        for (const [a, b] of [
          [pts, ptsM],
          [looks, looksM],
        ] as const) {
          const p = new THREE.Vector3(...(a === pts ? v.pos : v.look));
          a.push(p);
          b.push(p.clone());
        }
      });
    });
    this.stationT = idx.map((i) => i / (pts.length - 1));
    this.posCurve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    this.lookCurve = new THREE.CatmullRomCurve3(looks, false, "centripetal");
    this.posCurveM = new THREE.CatmullRomCurve3(ptsM, false, "centripetal");
    this.lookCurveM = new THREE.CatmullRomCurve3(looksM, false, "centripetal");
  }

  // ------------------------------------------------------------------ build
  async load(manager: THREE.LoadingManager, fontFamily: string, torsoMeta: TorsoMeta[], statueMeta: StatueMeta[]) {
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(draco);
    const geoOf = async (url: string) => {
      const g = await loader.loadAsync(url);
      const mesh = findMesh(g.scene);
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      return geo;
    };
    const [statueGeos, torsoGeos] = await Promise.all([
      Promise.all(statueMeta.map((m) => geoOf(`/models/statues/${m.file}`))),
      Promise.all(torsoMeta.map((m) => geoOf(`/models/torsos/${m.file}`))),
    ]);
    draco.dispose();
    const geo = (id: string) => statueGeos[statueMeta.findIndex((m) => m.id === id)];

    this.buildEnvironment();
    this.buildArchitecture();
    this.buildLightsPool();

    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    const texScale = mobile ? 0.75 : 1;
    const statueMat = (id: string, extra: InkStoneOptions = {}) => {
      const t = makeStatueTattoo(id, fontFamily, texScale);
      return makeInkStoneMaterial({
        tattoo: maskTexture(t.canvas, this.renderer),
        rect: t.rect,
        projYaw: t.yaw,
        origin: t.origin,
        envIntensity: 0.55,
        ...extra,
      });
    };

    for (const b of BUSTS) {
      this.addBust(geo(b.id), statueMat(b.id, b.mat), b);
    }

    torsoMeta.forEach((meta, i) => {
      const layout = TORSO_LAYOUT.find((l) => l.id === meta.id);
      if (!layout) return;
      const c = makeTorsoTattooCanvas(layout.variant, fontFamily, meta.height, meta.circumference);
      const mat = makeInkStoneMaterial({
        tattoo: maskTexture(c, this.renderer, true),
        dark: layout.dark ? 1 : 0,
        inkColor: layout.ink ?? 0x020305,
        inkMetal: layout.metal ?? 0,
        inkRough: layout.metal ? 0.26 : 0.36,
        pour: layout.pour ?? 0,
        topY: meta.height,
        yRange: [0, meta.height],
        envIntensity: 0.5,
      });
      this.addTorso(torsoGeos[i], mat, meta, new THREE.Vector3(layout.x, 0, layout.z), layout.x < 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35, layout.station, layout.spin ?? 0.07);
    });

    const choirIds = Object.keys(CHOIR);
    this.choirMats = choirIds.map((id) => statueMat(id));
    this.choirMats.forEach((m) => ((m.userData.uniforms as Record<string, { value: number }>).uReveal.value = 1));
    this.buildChoir(choirIds.map(geo), choirIds);
    this.buildRotunda(geo("KAS434"), statueMat("KAS434", { dressY: 1.1, envIntensity: 0.65 }));
    this.buildFlashPanels(fontFamily);
    this.buildParticles();
  }

  private buildEnvironment() {
    // stanza nera con softbox e strisce: dà ai materiali lucidi riflessi lunghi e tesi
    const env = new THREE.Scene();
    env.background = new THREE.Color(0.002, 0.002, 0.0025);
    const emit = (w: number, h: number, c: THREE.Color, p: THREE.Vector3, look: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.copy(p);
      m.lookAt(look);
      env.add(m);
    };
    const warm = new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(5);
    const cool = new THREE.Color(0.75, 0.82, 1.0).multiplyScalar(2.5);
    emit(6, 2.2, warm, new THREE.Vector3(0, 8, 2), new THREE.Vector3(0, 0, 0));
    emit(0.35, 9, warm.clone().multiplyScalar(0.7), new THREE.Vector3(7, 3, 0), new THREE.Vector3(0, 3, 0));
    emit(0.35, 9, cool, new THREE.Vector3(-7, 3, -2), new THREE.Vector3(0, 3, 0));
    emit(10, 0.25, cool, new THREE.Vector3(0, 6, -8), new THREE.Vector3(0, 1, 0));
    emit(5, 1.6, warm.clone().multiplyScalar(0.5), new THREE.Vector3(0, -6, 3), new THREE.Vector3(0, 0, 0));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(env, 0.02);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0x6a6560, 0x050505, 0.14);
    this.scene.add(hemi);
    const rim = new THREE.DirectionalLight(0xbfd0ff, 0.35);
    rim.position.set(0, 10, -30);
    rim.target.position.set(0, 0, -20);
    this.scene.add(rim, rim.target);
  }

  private buildArchitecture() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.62, metalness: 0, envMapIntensity: 0.4 });
    const dpr = Math.min(this.renderer.getPixelRatio(), 1);
    const floor = new Reflector(new THREE.PlaneGeometry(40, 160), {
      textureWidth: Math.round(window.innerWidth * dpr * 0.5),
      textureHeight: Math.round(window.innerHeight * dpr * 0.5),
      clipBias: 0.003,
      color: 0xffffff,
      shader: InkFloorShader,
    });
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -50);
    this.scene.add(floor);
    this.floor = floor;

    // monoliti laterali con fessure di luce
    const slabGeo = new THREE.BoxGeometry(0.7, 8, 2.7);
    const zs: number[] = [];
    for (let z = 3; z > -57; z -= 3.3) zs.push(z);
    const slabs = new THREE.InstancedMesh(slabGeo, stone, zs.length * 2);
    let k = 0;
    const slitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.84).multiplyScalar(1.5), fog: false });
    const slitGeo = new THREE.PlaneGeometry(0.045, 6.4);
    zs.forEach((z, i) => {
      for (const s of [-1, 1]) {
        this.tmpM.makeTranslation(s * 6.1, 4, z);
        slabs.setMatrixAt(k++, this.tmpM);
        if ((i + (s > 0 ? 1 : 0)) % 2 === 0 && z < 0) {
          const slit = new THREE.Mesh(slitGeo, slitMat);
          slit.position.set(s * 6.05, 3.4, z - 1.65);
          slit.rotation.y = (-s * Math.PI) / 2;
          this.scene.add(slit);
        }
      }
    });
    this.scene.add(slabs);

    const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(0.6) });
    for (const x of [-1.6, 1.6]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 60), lineMat);
      l.position.set(x, 7.2, -27);
      this.scene.add(l);
    }

    // anelli-soglia d'inchiostro
    for (const z of [-16, -36.6]) {
      const R = 2.75;
      const r = 0.3;
      const gate = new THREE.Mesh(new THREE.TorusGeometry(R, r, 48, 320), makeInkRingMaterial(R, r, 0.11));
      gate.position.set(0, R + r - 0.35, z);
      this.scene.add(gate);
      this.gates.push(gate);
    }
  }

  private buildLightsPool() {
    for (let i = 0; i < 5; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 9, 0.4, 0.75, 1.6);
      this.scene.add(l, l.target);
      this.pool.push(l);
    }
  }

  private makeRig(top: THREE.Vector3, h: number, angle = 0.36, intensity = 34, color = new THREE.Color().setHSL(0.09, 0.35, 0.82)): LightRig {
    return {
      pos: new THREE.Vector3(top.x * 0.55, 6.2, top.z + 1.6),
      target: new THREE.Vector3(top.x, top.y - h * 0.4, top.z),
      color,
      intensity,
      angle,
      weight: 0,
    };
  }

  private makeBeam(rig: LightRig) {
    const len = rig.pos.distanceTo(rig.target) + 0.4;
    const radius = Math.tan(rig.angle) * len * 0.85;
    const geo = new THREE.CylinderGeometry(0.04, radius, len, 48, 1, true);
    geo.translate(0, -len / 2, 0);
    const beam = new THREE.Mesh(geo, makeBeamMaterial(0xffe9cf, 0.11));
    beam.position.copy(rig.pos);
    const dir = rig.target.clone().sub(rig.pos).normalize();
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    beam.renderOrder = 10;
    this.scene.add(beam);
    return beam;
  }

  private plinth(w: number, h: number, pos: THREE.Vector3) {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, w, 3, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 }),
    );
    m.position.set(pos.x, h / 2, pos.z);
    this.scene.add(m);
    const glow = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.004, 0.001, w + 0.004)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.92, 0.82).multiplyScalar(0.8) }),
    );
    glow.position.set(pos.x, h + 0.003, pos.z);
    this.scene.add(glow);
    return m;
  }

  private addBust(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, b: (typeof BUSTS)[number]) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const w = b.plinthW ?? Math.max(0.42, Math.min(0.7, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * b.scale * 0.55));
    const pos = new THREE.Vector3(b.x, 0, b.z);
    this.plinth(w, b.plinth, pos);
    const root = new THREE.Group();
    root.position.set(b.x, b.plinth, b.z);
    const pivot = new THREE.Group();
    pivot.rotation.y = b.yaw;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(b.scale);
    mesh.castShadow = true;
    pivot.add(mesh);
    root.add(pivot);
    this.scene.add(root);
    const H = bb.max.y * b.scale;
    const top = new THREE.Vector3(b.x, b.plinth + H * 0.8, b.z);
    const rig = this.makeRig(top, H * 0.7, H > 1.3 ? 0.42 : 0.36, H > 1.3 ? 46 : 34);
    this.exhibits.push({ root, pivot, mats: [mat], revealStation: b.station, rig, beam: this.makeBeam(rig), follow: b.follow, spin: 0, baseYaw: b.yaw });
  }

  private addTorso(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, meta: TorsoMeta, pos: THREE.Vector3, yaw: number, station: number, spin: number) {
    const ph = 0.82;
    this.plinth(0.7, ph, pos);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.04, 64),
      new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.25, metalness: 0.6, envMapIntensity: 0.8 }),
    );
    disc.position.set(pos.x, ph + 0.02, pos.z);
    this.scene.add(disc);
    const root = new THREE.Group();
    root.position.set(pos.x, ph + 0.04, pos.z);
    const pivot = new THREE.Group();
    pivot.rotation.y = yaw;
    const inner = new THREE.Mesh(geo, mat);
    inner.rotation.y = meta.frontYaw;
    pivot.add(inner);
    root.add(pivot);
    this.scene.add(root);
    const top = new THREE.Vector3(pos.x, ph + meta.height, pos.z);
    const rig = this.makeRig(top, meta.height, 0.38, 30);
    this.exhibits.push({ root, pivot, mats: [mat], revealStation: station, rig, beam: this.makeBeam(rig), follow: spin > 0, spin: 0, baseYaw: yaw });
  }

  private buildChoir(geos: THREE.BufferGeometry[], ids: string[]) {
    const colH = 1.35;
    const zs = [-39.2, -42.2, -45.2, -48.2, -51.2, -54.2];
    const colGeo = new RoundedBoxGeometry(0.42, colH, 0.42, 2, 0.01);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.34, envMapIntensity: 0.6 });
    const cols = new THREE.InstancedMesh(colGeo, colMat, zs.length * 2);
    const perModel: THREE.Matrix4[][] = ids.map(() => []);
    const haloGeo = new THREE.TorusGeometry(0.34, 0.0045, 6, 160);
    const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.92, 0.78).multiplyScalar(3.2) });
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, zs.length * 2);
    let k = 0;
    zs.forEach((z, i) => {
      for (const s of [-1, 1]) {
        const x = s * 3.0;
        this.tmpM.makeTranslation(x, colH / 2, z);
        cols.setMatrixAt(k, this.tmpM);
        const yaw = (-s * Math.PI) / 2 + s * 0.25;
        const mi = (i * 2 + (s > 0 ? 1 : 0)) % ids.length;
        const spec = CHOIR[ids[mi]];
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
        perModel[mi].push(new THREE.Matrix4().compose(new THREE.Vector3(x, colH, z), q, new THREE.Vector3().setScalar(spec.scale)));
        const back = new THREE.Vector3(0, 0, -0.17).applyQuaternion(q);
        this.tmpM.compose(new THREE.Vector3(x + back.x, colH + spec.head * spec.scale + 0.04, z + back.z), q, this.tmpS.setScalar(1));
        halos.setMatrixAt(k, this.tmpM);
        k++;
      }
    });
    this.scene.add(cols, halos);
    perModel.forEach((list, i) => {
      const im = new THREE.InstancedMesh(geos[i], this.choirMats[i], list.length);
      list.forEach((m, j) => im.setMatrixAt(j, m));
      im.computeBoundingSphere();
      this.scene.add(im);
    });
    const l = new THREE.SpotLight(0xdfe6ff, 44, 30, 0.5, 0.9, 1.4);
    l.position.set(0, 7.5, -38);
    l.target.position.set(0, 1.5, -48);
    this.scene.add(l, l.target);
  }

  private buildRotunda(venusGeo: THREE.BufferGeometry, venusMat: THREE.MeshStandardMaterial) {
    const c = new THREE.Vector3(...ROTUNDA);
    // pozzo cilindrico: pareti alte, fessure di luce che salgono fino all'oculo
    const stone = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.58, envMapIntensity: 0.4 });
    const n = 16;
    const H = 36;
    const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, H, 0.6), stone, n);
    const slitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.92, 0.82).multiplyScalar(0.9), fog: false });
    const slitGeo = new THREE.PlaneGeometry(0.06, H - 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.sin(a) > 0.99) {
        this.tmpM.makeScale(0, 0, 0);
        ring.setMatrixAt(i, this.tmpM);
        continue; // varco d'ingresso
      }
      this.tmpQ.setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0));
      this.tmpM.compose(new THREE.Vector3(c.x + Math.cos(a) * 8.5, H / 2, c.z + Math.sin(a) * 8.5), this.tmpQ, this.tmpS.setScalar(1));
      ring.setMatrixAt(i, this.tmpM);
      if (i % 2 === 1) continue;
      const a2 = a + Math.PI / n;
      const slit = new THREE.Mesh(slitGeo, slitMat);
      slit.position.set(c.x + Math.cos(a2) * 8.6, H / 2 + 0.5, c.z + Math.sin(a2) * 8.6);
      slit.lookAt(c.x, H / 2 + 0.5, c.z);
      this.scene.add(slit);
    }
    this.scene.add(ring);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, VENUS_BASE, 96),
      new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.22, envMapIntensity: 0.8 }),
    );
    base.position.set(c.x, VENUS_BASE / 2, c.z);
    base.receiveShadow = true;
    this.scene.add(base);

    // la Custode
    const venus = new THREE.Mesh(venusGeo, venusMat);
    venus.scale.setScalar(VENUS_SCALE);
    venus.position.set(c.x, VENUS_BASE, c.z);
    venus.castShadow = true;
    venus.receiveShadow = true;
    this.scene.add(venus);
    this.exhibits.push({
      root: venus,
      pivot: venus,
      mats: [venusMat],
      revealStation: STATIONS.length - 1,
      rig: { pos: new THREE.Vector3(), target: new THREE.Vector3(), color: new THREE.Color(), intensity: 0, angle: 0.3, weight: 0 },
      beam: new THREE.Mesh(),
      follow: false,
      spin: 0,
      baseYaw: 0,
    });

    // corona: anello di luce sopra la testa con tre gocce in orbita
    const crown = new THREE.Group();
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.0055, 8, 200),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.74).multiplyScalar(2.2) }),
    );
    halo.rotation.x = Math.PI / 2;
    crown.add(halo);
    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.04, clearcoat: 1, envMapIntensity: 2.4 });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 3), dropMat);
      d.userData.phase = (i / 3) * Math.PI * 2;
      crown.add(d);
    }
    crown.position.set(c.x, VENUS_BASE + 2.04 * VENUS_SCALE + 0.16, c.z - 0.04);
    crown.rotation.set(0.62, 0, -0.1);
    this.scene.add(crown);
    this.crown = crown;

    const key = new THREE.SpotLight(0xffe4c4, 64, 18, 0.36, 0.6, 1.4);
    key.position.set(c.x + 1.5, 9.5, c.z + 4.2);
    key.target.position.set(c.x, 2.0, c.z);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);
    this.makeBeam({ pos: key.position.clone(), target: key.target.position.clone(), color: key.color, intensity: 0, angle: 0.36, weight: 0 });
    // luce lunare dall'oculo
    const moon = new THREE.SpotLight(0xc9d6ff, 38, 26, 0.2, 0.7, 1.2);
    moon.position.set(c.x, 16, c.z);
    moon.target.position.set(c.x, 2.4, c.z);
    this.scene.add(moon, moon.target);

    // oculo: anello d'inchiostro orizzontale con membrana, da cui piove l'inchiostro
    const ringMat = makeInkRingMaterial(OCULUS_R, OCULUS_TUBE, 0.16);
    ringMat.fog = false;
    const oculus = new THREE.Mesh(new THREE.TorusGeometry(OCULUS_R, OCULUS_TUBE, 48, 320), ringMat);
    oculus.rotation.x = Math.PI / 2;
    oculus.position.set(c.x, this.oculusY, c.z);
    this.scene.add(oculus);
    this.oculus = oculus;
    const membrane = new THREE.Mesh(new THREE.CircleGeometry(OCULUS_R - OCULUS_TUBE * 0.4, 96), makeMembraneMaterial());
    membrane.rotation.x = Math.PI / 2;
    membrane.position.set(c.x, this.oculusY, c.z);
    this.scene.add(membrane);
    this.membrane = membrane;

    const count = 340;
    const rainGeo = new THREE.CapsuleGeometry(0.009, 0.42, 4, 8);
    const rainMat = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.05, clearcoat: 1, envMapIntensity: 2.6 });
    this.rain = new THREE.InstancedMesh(rainGeo, rainMat, count);
    this.rain.frustumCulled = false;
    this.rainState = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = OCULUS_R + (Math.random() - 0.5) * 0.7;
      this.rainState.set([c.x + Math.cos(a) * rr, Math.random() * this.oculusY, c.z + Math.sin(a) * rr, 5 + Math.random() * 4], i * 4);
    }
    this.scene.add(this.rain);
  }

  private buildFlashPanels(fontFamily: string) {
    for (let i = 0; i < 3; i++) {
      const c = makeFlashCanvas(i, fontFamily);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const mat = makeFlashMaterial(tex);
      this.flashMats.push(mat);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), mat);
      const z = -10.6 - i * 1.5;
      p.position.set(-3.7, 1.75, z);
      p.rotation.y = Math.PI / 2 - 0.12;
      this.scene.add(p);
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 1.75, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.3, metalness: 0.8 }),
      );
      frame.position.set(-3.74, 1.75, z);
      frame.rotation.y = -0.12;
      this.scene.add(frame);
    }
  }

  private buildParticles() {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 11;
      pos[i * 3 + 1] = Math.random() * 7.5;
      pos[i * 3 + 2] = 6 - Math.random() * 78;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: shared.uTime, uScale: { value: window.innerHeight } },
      vertexShader: /* glsl */ `
attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
void main(){
  vec3 p = position;
  p.y = mod(p.y + uTime * (0.03 + seed * 0.05), 7.5);
  p.x += sin(uTime * 0.2 + seed * 40.0) * 0.25;
  p.z += cos(uTime * 0.15 + seed * 30.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.6 + seed * 1.6) * uScale * 0.0022 / max(-mv.z, 0.2) * 4.0;
  vA = (0.25 + 0.75 * fract(seed * 13.7)) * (1.0 - smoothstep(3.0, 26.0, -mv.z)) * smoothstep(0.2, 1.2, -mv.z);
}`,
      fragmentShader: /* glsl */ `
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA;
  gl_FragColor = vec4(vec3(1.0, 0.94, 0.86) * a * 0.55, 1.0);
}`,
    });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    const dn = 110;
    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.04, clearcoat: 1, envMapIntensity: 2.4, iridescence: 0.3 });
    this.drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), dropMat, dn);
    this.drops.frustumCulled = false;
    this.dropState = new Float32Array(dn * 5);
    for (let i = 0; i < dn; i++) {
      const inRot = i < 60;
      const a = Math.random() * Math.PI * 2;
      const r = inRot ? 2.2 + Math.random() * 4.5 : Math.random() * 2.4;
      this.dropState.set(
        [
          inRot ? Math.cos(a) * r : (Math.random() - 0.5) * 4,
          1.2 + Math.random() * (inRot ? 9 : 4.5),
          inRot ? ROTUNDA[2] + Math.sin(a) * r : -18 - Math.random() * 36,
          0.015 + Math.pow(Math.random(), 3) * 0.09,
          Math.random() * 100,
        ],
        i * 5,
      );
    }
    this.scene.add(this.drops);
  }

  // ------------------------------------------------------------------ runtime
  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const aspect = w / h;
    this.portrait = THREE.MathUtils.clamp((0.95 - aspect) / 0.35, 0, 1);
    this.fov0 = aspect < 0.9 ? 62 : 42;
    this.camera.aspect = aspect;
    this.camera.fov = this.fov0;
    this.camera.updateProjectionMatrix();
    // l'oculo sta alla quota in cui, a fine ascesa, ha la stessa misura a schermo del cerchio iniziale
    this.oculusY = RISE_END + OCULUS_R / (heroRingScreen(aspect) * Math.tan(THREE.MathUtils.degToRad(this.fov0) / 2));
    this.oculus?.position.setY(this.oculusY);
    this.outroPath = undefined; // il percorso dell'outro dipende dal formato
    this.membrane?.position.setY(this.oculusY);
    if (this.floor) this.floor.getRenderTarget().setSize(Math.round(w * 0.5), Math.round(h * 0.5));
    if (this.dust) (this.dust.material as THREE.ShaderMaterial).uniforms.uScale.value = h;
  }

  /** raggio a schermo (frazione di mezza altezza) dell'oculo durante l'ascesa */
  outroRingScreen(o: number) {
    const y = this.riseY(o);
    return OCULUS_R / ((this.oculusY - y) * Math.tan(THREE.MathUtils.degToRad(this.fov0) / 2));
  }

  private riseY(o: number) {
    const t = THREE.MathUtils.clamp((o - OUTRO_A) / (OUTRO_B - OUTRO_A), 0, 1);
    return RISE_START + (RISE_END - RISE_START) * (1 - Math.pow(1 - t, 3));
  }

  /**
   * s: stazione (float), push: arretramento durante l'attraversamento del portale,
   * outro: 0..1 nell'ascesa finale (oppure -1).
   */
  update(time: number, dt: number, s: number, push: number, mouse: THREE.Vector2, outro = -1) {
    const N = STATIONS.length;
    const sc = THREE.MathUtils.clamp(s, 0, N - 1);
    const i = Math.min(Math.floor(sc), N - 2);
    const f = sc - i;
    const fe = smootherstep(THREE.MathUtils.clamp((f - 0.1) / 0.8, 0, 1));
    this.stationFloat = outro >= 0 ? N - 1 : i + fe;
    const cam = this.camera;
    let lift = 0;

    if (outro < 0) {
      const t = THREE.MathUtils.lerp(this.stationT[i], this.stationT[i + 1], fe);
      this.posCurve.getPoint(t, cam.position);
      this.lookCurve.getPoint(t, this.look);
      if (this.portrait > 0) {
        cam.position.lerp(this.posCurveM.getPoint(t, this.tmpP), this.portrait);
        this.look.lerp(this.lookCurveM.getPoint(t, this.tmpP), this.portrait);
      }
      lift = THREE.MathUtils.lerp(STATIONS[i].lift ?? 0, STATIONS[i + 1].lift ?? 0, fe) * this.portrait;
      // su schermi verticali la camera arretra un poco sui soggetti
      const pull = (lift / 0.1) * 0.45;
      this.tmpV.copy(this.look).sub(cam.position).normalize();
      cam.position.addScaledVector(this.tmpV, -pull);
      cam.position.z += push * 3.2;
      cam.position.y += Math.sin(time * 0.5) * 0.015;
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      cam.rotateY(-mouse.x * 0.06);
      cam.rotateX(mouse.y * 0.035);
    } else {
      lift = this.outroCamera(outro, time, mouse);
    }

    if (lift > 0.001) cam.setViewOffset(this.w, this.h, 0, lift * this.h, this.w, this.h);
    else if (cam.view) cam.clearViewOffset();
    cam.updateProjectionMatrix();

    const camPos = cam.position;
    this.exhibits.forEach((e) => {
      const rv = smoothstep(e.revealStation - 0.62, e.revealStation - 0.02, this.stationFloat);
      e.mats.forEach((m) => ((m.userData.uniforms as Record<string, { value: number }>).uReveal.value = rv));
      if (e.follow) {
        const target = Math.atan2(camPos.x - e.root.position.x, camPos.z - e.root.position.z);
        let d = target - e.baseYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const want = e.baseYaw + THREE.MathUtils.clamp(d, -0.45, 0.45);
        e.pivot.rotation.y += (want - e.pivot.rotation.y) * Math.min(1, dt * 0.8);
      } else if (e.spin) {
        e.pivot.rotation.y += e.spin * dt;
      }
      if (e.rig.intensity > 0) {
        const dist = camPos.distanceTo(e.root.position);
        e.rig.weight = smoothstep(16, 4, dist);
        ((e.beam.material as THREE.ShaderMaterial).uniforms.uStrength.value as number) = 0.02 + 0.06 * e.rig.weight;
      }
    });
    const sorted = this.exhibits.filter((e) => e.rig.intensity > 0).sort((a, b) => b.rig.weight - a.rig.weight);
    this.pool.forEach((l, k) => {
      const e = sorted[k];
      if (!e || e.rig.weight <= 0.001) {
        l.intensity = 0;
        return;
      }
      l.position.copy(e.rig.pos);
      l.target.position.copy(e.rig.target);
      l.target.updateMatrixWorld();
      l.color.copy(e.rig.color);
      l.angle = e.rig.angle;
      l.intensity = e.rig.intensity * e.rig.weight;
    });

    this.flashMats.forEach((m, k) => {
      m.uniforms.uReveal.value = smoothstep(2.0 + k * 0.15, 3.0 + k * 0.1, this.stationFloat);
    });
    this.gates.forEach((g, k) => (g.rotation.z = Math.sin(time * 0.1 + k) * 0.03));
    if (this.oculus) this.oculus.rotation.z = time * 0.05;
    if (this.crown) {
      this.crown.rotation.y = time * 0.25;
      this.crown.children.forEach((d) => {
        if (d.userData.phase === undefined) return;
        const a = time * 0.6 + d.userData.phase;
        d.position.set(Math.cos(a) * 0.27, Math.sin(time * 1.3 + d.userData.phase) * 0.03, Math.sin(a) * 0.27);
      });
    }

    if (this.rain) {
      const st = this.rainState;
      const top = this.oculusY - 0.4;
      for (let k = 0; k < this.rain.count; k++) {
        let y = st[k * 4 + 1] - st[k * 4 + 3] * dt;
        if (y < 0.0) y = top;
        st[k * 4 + 1] = y;
        this.tmpM.compose(this.tmpV.set(st[k * 4], y, st[k * 4 + 2]), this.tmpQ.identity(), this.tmpS.set(1, 1 + st[k * 4 + 3] * 0.25, 1));
        this.rain.setMatrixAt(k, this.tmpM);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
    if (this.drops) {
      const st = this.dropState;
      for (let k = 0; k < this.drops.count; k++) {
        const ph = st[k * 5 + 4];
        const x = st[k * 5] + Math.sin(time * 0.13 + ph) * 0.35;
        const y = st[k * 5 + 1] + Math.sin(time * 0.31 + ph * 2.0) * 0.25;
        const z = st[k * 5 + 2] + Math.cos(time * 0.11 + ph) * 0.35;
        const r = st[k * 5 + 3];
        this.tmpQ.setFromEuler(this.tmpEuler.set(time * 0.2 + ph, time * 0.13, 0));
        this.tmpM.compose(this.tmpV.set(x, y, z), this.tmpQ, this.tmpS.set(r, r * (1.0 + 0.25 * Math.sin(time + ph)), r));
        this.drops.setMatrixAt(k, this.tmpM);
      }
      this.drops.instanceMatrix.needsUpdate = true;
    }
  }

  // camere chiave dell'outro: Custode → volto → sguardo verso l'oculo
  private qA = new THREE.Quaternion();
  private qB = new THREE.Quaternion();
  private qC = new THREE.Quaternion();
  private outroPath?: THREE.CatmullRomCurve3;
  private outroLook0 = new THREE.Vector3();

  private outroCamera(o: number, time: number, mouse: THREE.Vector2): number {
    const cam = this.camera;
    const c = ROTUNDA;
    if (!this.outroPath) {
      const last = STATIONS[STATIONS.length - 1];
      const p0 = new THREE.Vector3(...last.pos).lerp(new THREE.Vector3(...(last.mpos ?? last.pos)), this.portrait);
      const p1 = new THREE.Vector3(c[0], 2.88, c[2] + 2.0);
      const p2 = new THREE.Vector3(c[0], RISE_START, c[2]);
      this.outroPath = new THREE.CatmullRomCurve3([p0, p1, p2], false, "centripetal");
      const m = new THREE.Matrix4();
      const up = new THREE.Vector3(0, 1, 0);
      this.outroLook0.set(...last.look).lerp(new THREE.Vector3(...(last.mlook ?? last.look)), this.portrait);
      this.qA.setFromRotationMatrix(m.lookAt(p0, new THREE.Vector3(...last.look).lerp(new THREE.Vector3(...(last.mlook ?? last.look)), this.portrait), up));
      this.qB.setFromRotationMatrix(m.lookAt(p1, new THREE.Vector3(c[0], 2.88, c[2]), up));
      this.qC.copy(this.qB).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    }
    if (o < OUTRO_A) {
      const t = o / OUTRO_A;
      const te = smootherstep(t);
      this.outroPath.getPoint(te, cam.position);
      // continuità con l'ultima sosta: arretramento verticale, respiro e parallasse svaniscono
      const fade = 1 - smootherstep(Math.min(1, t * 2.2));
      const last = STATIONS[STATIONS.length - 1];
      const lift = (last.lift ?? 0) * this.portrait * fade;
      this.tmpV.copy(this.outroLook0).sub(this.outroPath.points[0]).normalize();
      cam.position.addScaledVector(this.tmpV, -(lift / 0.1) * 0.45);
      cam.position.y += Math.sin(time * 0.5) * 0.015 * fade;
      if (t < 0.5) cam.quaternion.slerpQuaternions(this.qA, this.qB, smootherstep(t * 2));
      else cam.quaternion.slerpQuaternions(this.qB, this.qC, smootherstep((t - 0.5) * 2));
      cam.rotateY(-mouse.x * 0.06 * fade);
      cam.rotateX(mouse.y * 0.035 * fade);
      return lift;
    } else {
      cam.position.set(c[0], this.riseY(o), c[2]);
      const t = THREE.MathUtils.clamp((o - OUTRO_A) / (OUTRO_B - OUTRO_A), 0, 1);
      cam.quaternion.copy(this.qC);
      cam.rotateZ(t * 0.5 + Math.sin(time * 0.2) * 0.01);
      return 0;
    }
  }
}

/** raggio a schermo del cerchio iniziale (frazione di mezza altezza), dalla camera del portale nell'hero */
export function heroRingScreen(aspect: number) {
  return (1.0 * 3.05) / (5.3 * Math.max(1, 1.15 / aspect));
}

function findMesh(root: THREE.Object3D): THREE.Mesh {
  root.updateMatrixWorld(true);
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  if (!found) throw new Error("mesh non trovata");
  return found;
}

export function smoothstep(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
