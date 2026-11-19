import * as THREE from "three";

export const shared = {
  uTime: { value: 0 },
};

const NOISE_GLSL = /* glsl */ `
float pcHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float pcNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pcHash(i), pcHash(i + vec2(1, 0)), f.x), mix(pcHash(i + vec2(0, 1)), pcHash(i + vec2(1, 1)), f.x), f.y);
}
`;

export interface InkStoneOptions {
  surfaceInk?: string;
  tattoo?: THREE.Texture | null;
  inkColor?: THREE.ColorRepresentation;
  inkMetal?: number;
  inkRough?: number;
  dark?: number; // 0 marmo avorio, 1 marmo nero
  pour?: number; // inchiostro colato dalla sommità (0 = nessuno)
  topY?: number; // sommità in spazio oggetto per la colata
  yRange?: [number, number]; // proiezione cilindrica: fascia in altezza
  /** asse della proiezione cilindrica che segue il tronco: AXIS_LEVELS livelli (cx, cz, R) su [0, axisH] */
  axis?: Float32Array;
  axisH?: number;
  /** esponente sui grigi della maschera avvolta (più basso = grigi più scuri, per opere molto illuminate) */
  wrapGamma?: number;
  envIntensity?: number;
  /** tatuaggi "a stencil" che avvolgono il corpo (busti, statue): fino a tre carte, vedi InkChart */
  charts?: InkChart[];
  origin?: [number, number]; // origine della propagazione (uv, solo torsi)
  dressY?: number; // veste d'inchiostro liquido sotto questa quota (spazio oggetto)
  glow?: THREE.ColorRepresentation; // colore dell'"ago" che traccia l'inchiostro
  span?: number; // misura di riferimento (spazio oggetto) per la propagazione da un punto della superficie
}

/**
 * Carta locale della pelle, come uno stencil appoggiato sul corpo: centro C sulla superficie,
 * normale N, tangente T (destra di chi guarda), B = N × T (alto). Il corpo attorno a C è
 * approssimato da un cilindro di raggio R con asse lungo B: la coordinata orizzontale è la lunghezza
 * d'arco attorno a quel cilindro, quella verticale la quota lungo B. Così il disegno si srotola sulla
 * pelle e avvolge collo, petto e spalle invece di stirarsi ai lati come in una proiezione piana.
 */
export const AXIS_LEVELS = 16;

export interface InkChart {
  tex: THREE.Texture;
  C: THREE.Vector3;
  N: THREE.Vector3;
  T: THREE.Vector3;
  R: number;
  /** rettangolo del disegno in coordinate della carta (metri): u0, v0, larghezza, altezza */
  rect: { x0: number; y0: number; w: number; h: number };
  /** scarto ammesso dal cilindro, in frazioni di R (oltre: altre parti del corpo, niente inchiostro) */
  tol: number;
  /** soglia di orientamento della superficie rispetto al cilindro (-1 = avvolge tutto) */
  facing: number;
  /** esponente sui grigi della maschera (< 1: le sfumature black & grey si leggono sul marmo chiaro) */
  gamma?: number;
}

/**
 * Marmo procedurale (scansioni senza texture) con tatuaggio, su MeshStandardMaterial.
 * - uTattoo: maschera R8 (bianco = inchiostro) in proiezione cilindrica attorno all'asse del tronco (torsi, Custode);
 *   per busti e statue fino a tre carte locali (uTat0..2) che avvolgono il corpo (InkChart). Le due cose si sommano.
 * - uReveal: l'inchiostro si propaga dall'origine con bordo organico; il fronte brilla come un ago caldo.
 *   Con uInkPt.w = 1 l'origine è un punto della superficie (spazio oggetto): quello toccato dal cursore.
 * - uNeedle: punta luminosa che segue il cursore sul marmo (xyz spazio oggetto, w intensità).
 * - uPour / uDressY: inchiostro liquido lucido che cola dall'alto o veste la statua dal basso.
 * - Marmo: venature primarie e secondarie, pori e grana, rugosità variabile; l'inchiostro è inciso
 *   (bump in spazio schermo), così le linee del tatuaggio hanno un bordo che prende la luce.
 */
export function makeInkStoneMaterial(o: InkStoneOptions) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: o.envIntensity ?? 0.6 });
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const charts = (o.charts ?? []).slice(0, 3);
  const vec3s = (f: (c: InkChart) => THREE.Vector3) => [0, 1, 2].map((i) => (charts[i] ? f(charts[i]).clone() : new THREE.Vector3(0, 0, 1)));
  const uniforms = {
    uTattoo: { value: o.tattoo ?? blank },
    uTat0: { value: charts[0]?.tex ?? blank },
    uTat1: { value: charts[1]?.tex ?? blank },
    uTat2: { value: charts[2]?.tex ?? blank },
    uCharts: { value: charts.length },
    uCC: { value: vec3s((c) => c.C) },
    uCN: { value: vec3s((c) => c.N) },
    uCT: { value: vec3s((c) => c.T) },
    uCRect: { value: [0, 1, 2].map((i) => (charts[i] ? new THREE.Vector4(charts[i].rect.x0, charts[i].rect.y0, charts[i].rect.w, charts[i].rect.h) : new THREE.Vector4(0, 0, 1, 1))) },
    uCPar: { value: [0, 1, 2].map((i) => (charts[i] ? new THREE.Vector4(charts[i].R, charts[i].tol, charts[i].facing, charts[i].gamma ?? 1) : new THREE.Vector4(1, 1, 0, 0))) },
    uReveal: { value: 0 },
    uInkColor: { value: new THREE.Color(o.inkColor ?? 0x020305) },
    uInkMetal: { value: o.inkMetal ?? 0 },
    uInkRough: { value: o.inkRough ?? 0.36 },
    uDark: { value: o.dark ?? 0 },
    uPour: { value: o.pour ?? 0 },
    uTopY: { value: o.topY ?? 1 },
    uYRange: { value: new THREE.Vector2(...(o.yRange ?? [0, 1])) },
    uAxis: { value: Array.from({ length: AXIS_LEVELS }, (_, i) => (o.axis ? new THREE.Vector3(o.axis[i * 3], o.axis[i * 3 + 1], o.axis[i * 3 + 2]) : new THREE.Vector3(0, 0, 1))) },
    uAxisH: { value: o.axisH ?? 1 },
    uAxisOn: { value: o.axis ? 1 : 0 },
    uHasTattoo: { value: o.tattoo || charts.length ? 1 : 0 },
    uWrap: { value: o.tattoo ? 1 : 0 },
    uWrapGamma: { value: o.wrapGamma ?? 0.62 },
    uOrigin: { value: new THREE.Vector2(...(o.origin ?? [0.5, 0.2])) },
    uDressY: { value: o.dressY ?? -1 },
    uGlowCol: { value: new THREE.Color(o.glow ?? 0xff8a3d) },
    uInkPt: { value: new THREE.Vector4(0, 0, 0, 0) },
    uNeedle: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSpan: { value: o.span ?? 1 },
    uTime: shared.uTime,
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvObjN = objectNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
uniform sampler2D uTattoo, uTat0, uTat1, uTat2;
uniform float uReveal, uInkMetal, uInkRough, uDark, uPour, uTopY, uHasTattoo, uTime, uWrap, uWrapGamma, uDressY, uSpan;
uniform int uCharts;
uniform vec3 uCC[3], uCN[3], uCT[3];
uniform vec4 uCRect[3], uCPar[3];
uniform vec3 uInkColor, uGlowCol;
uniform vec2 uYRange, uOrigin;
uniform vec4 uInkPt, uNeedle;
uniform vec3 uAxis[${AXIS_LEVELS}];
uniform float uAxisH, uAxisOn;
${o.surfaceInk ?? ""}
// carta locale srotolata su un cilindro di raggio R attorno al centro (vedi InkChart)
void pcChart(sampler2D tex, int i, vec3 p, vec3 n, inout float ink, inout float bleed) {
  vec3 T = uCT[i], N = uCN[i];
  vec3 B = cross(N, T);
  vec3 q = p - uCC[i];
  float x = dot(q, T), y = dot(q, B), z = dot(q, N);
  float R = uCPar[i].x;
  float ax = R + z;
  float rr = length(vec2(x, ax));
  vec2 tuv = (vec2(R * atan(x, ax), y) - uCRect[i].xy) / uCRect[i].zw;
  vec2 gx = dFdx(tuv), gy = dFdy(tuv);
  // cucitura sul retro (l'angolo salta di un giro)
  float lap = 6.2831853 * R / uCRect[i].z;
  if (abs(gx.x) > lap * 0.5) gx.x -= sign(gx.x) * lap;
  if (abs(gy.x) > lap * 0.5) gy.x -= sign(gy.x) * lap;
  vec3 radial = (x * T + ax * N) / max(rr, 1e-5);
  float w = smoothstep(uCPar[i].z, uCPar[i].z + 0.3, dot(n, radial));
  w *= 1.0 - smoothstep(uCPar[i].y * 0.6, uCPar[i].y, abs(rr - R) / R);
  vec2 inside = step(vec2(0.0), tuv) * step(tuv, vec2(1.0));
  w *= inside.x * inside.y;
  if (w <= 0.0) return;
  ink = max(ink, pow(textureGrad(tex, tuv, gx, gy).r, uCPar[i].w) * w);
  bleed = max(bleed, textureGrad(tex, tuv, gx * 9.0, gy * 9.0).r * w);
}
float pcInk;
float pcLiquid;
float pcGlow;
float pcRough;
float pcHeight;
${NOISE_GLSL}
// bump su superfici senza UV (Mikkelsen), derivate della quota in spazio schermo
vec3 pcPerturb(vec3 pos, vec3 n, vec2 dH, float fd) {
  vec3 sx = normalize(dFdx(pos));
  vec3 sy = normalize(dFdy(pos));
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * fd;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - grad);
}
`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  float wproj = 1.0;
  float dist = 0.0;
  float ink = 0.0;
  float bleed = 0.0;
  // avvolgimento del tronco (torsi, e il corpo della Custode) e carte locali possono convivere
  if (uWrap > 0.5) {
    // l'asse del cilindro segue il centro del tronco quota per quota (torsi seduti, inclinati, ruotati)
    vec2 d = vObj.xz;
    float wface = 1.0;
    if (uAxisOn > 0.5) {
      float fy = clamp(vObj.y / uAxisH * ${AXIS_LEVELS}.0 - 0.5, 0.0, ${AXIS_LEVELS - 1}.0);
      int i0 = int(floor(fy));
      vec3 a = mix(uAxis[i0], uAxis[min(i0 + 1, ${AXIS_LEVELS - 1})], fract(fy));
      d -= a.xy;
      // niente inchiostro sulle superfici rivolte in alto, in basso o verso l'asse (moncherini, pieghe interne)
      wface = smoothstep(0.08, 0.32, dot(normalize(vObjN), vec3(d.x, 0.0, d.y) / max(length(d), 1e-5)));
    }
    vec2 tuv = vec2(atan(d.x, d.y) / 6.2831853 + 0.5, (vObj.y - uYRange.x) / (uYRange.y - uYRange.x));
    vec2 gx = dFdx(tuv), gy = dFdy(tuv);
    if (abs(gx.x) > 0.5) gx.x -= sign(gx.x);
    if (abs(gy.x) > 0.5) gy.x -= sign(gy.x);
    dist = length(vec2((tuv.x - 0.5) * 1.6, tuv.y - uOrigin.y));
    // le sfumature black & grey del disegno devono leggersi sul marmo chiaro: i grigi salgono, il nero resta nero
    ink = pow(textureGrad(uTattoo, tuv, gx, gy).r, uWrapGamma) * wface;
    bleed = textureGrad(uTattoo, tuv, gx * 9.0, gy * 9.0).r * wface;
  }
  if (uCharts > 0) {
    vec3 nObj = normalize(vObjN);
    if (uCharts > 0) pcChart(uTat0, 0, vObj, nObj, ink, bleed);
    if (uCharts > 1) pcChart(uTat1, 1, vObj, nObj, ink, bleed);
    if (uCharts > 2) pcChart(uTat2, 2, vObj, nObj, ink, bleed);
    dist = length(vObj - uCC[0]) / uSpan;
  }
  // propagazione dal punto toccato: distanza misurata sulla superficie stessa (spazio oggetto)
  ${o.surfaceInk ? "ink = max(ink, surfaceInk(vObj));" : ""}
  if (uInkPt.w > 0.5) dist = length(vObj - uInkPt.xyz) / uSpan;
  float n = pcNoise(vObj.xy * 38.0 + vObj.z * 21.0) * 0.5 + pcNoise(vObj.zy * 95.0) * 0.25;
  float rv = uReveal * 1.6 - (dist * 0.9 + n * 0.32);
  float mask = smoothstep(0.0, 0.05, rv) * uHasTattoo * wproj;
  pcInk = clamp(ink * 0.96 + bleed * 0.1, 0.0, 1.0) * mask;
  // fronte che avanza: l'ago scalda la linea appena tracciata
  pcGlow = ink * smoothstep(0.0, 0.02, rv) * (1.0 - smoothstep(0.02, 0.2, rv)) * uHasTattoo * wproj;
  // la punta dell'ago segue il cursore sul marmo
  float nd = length(vObj - uNeedle.xyz) / uSpan;
  pcGlow = max(pcGlow, uNeedle.w * (exp(-nd * nd * 40000.0) * 0.35 + exp(-nd * nd * 4000.0) * 0.02));
  // marmo procedurale
  // dettaglio fine attenuato quando la superficie è lontana (niente sfarfallio)
  float aa = 1.0 - smoothstep(0.0015, 0.006, length(fwidth(vObj)));
  vec3 q = vObj * 2.2;
  float w1 = pcNoise(q.xy * 1.7 + q.z) + 0.5 * pcNoise(q.zy * 3.9 - q.x) + 0.25 * pcNoise(q.xz * 8.1);
  float vein = pow(1.0 - abs(sin((q.x * 0.8 + q.y * 1.6 + q.z * 0.5) * 3.0 + w1 * 5.0)), 9.0);
  // venature secondarie: capillari sottili e spezzati, a un'altra inclinazione
  float w2 = pcNoise(q.zx * 5.3 + q.y * 1.9) + 0.5 * pcNoise(q.xy * 11.0 - q.z * 3.0);
  float vein2 = pow(1.0 - abs(sin((q.y * 2.1 - q.x * 1.3 + q.z * 0.9) * 6.0 + w2 * 6.5 + w1 * 2.0)), 28.0);
  vein2 *= smoothstep(0.35, 0.75, pcNoise(q.xy * 2.6 + 7.0));
  float cloud = pcNoise(q.xy * 0.9 + 3.0) * 0.5 + pcNoise(q.zy * 2.3) * 0.5;
  // micro-imperfezioni: grana cristallina e piccoli pori (calcolate solo da vicino)
  float grain = 0.5;
  float pits = 0.0;
  if (aa > 0.0) {
    grain = pcNoise(vObj.xy * 410.0 + vObj.z * 290.0) * 0.6 + pcNoise(vObj.zy * 170.0 - vObj.x * 120.0) * 0.4;
    pits = smoothstep(0.93, 0.995, pcNoise(vObj.zy * 230.0 + vObj.x * 160.0)) * aa;
  }
  vec3 ivory = vec3(0.585, 0.56, 0.52) * (0.88 + 0.16 * cloud) * (1.0 + (grain - 0.5) * 0.07 * aa);
  // in profondità il marmo è leggermente più caldo e traslucido
  ivory = mix(ivory, vec3(0.6, 0.53, 0.45), (1.0 - cloud) * 0.18);
  diffuseColor.rgb = mix(ivory, vec3(0.27, 0.27, 0.285), vein * 0.55);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.4, 0.42), vein2 * 0.4);
  diffuseColor.rgb *= 1.0 - pits * 0.07;
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 darkStone = mix(vec3(0.008, 0.008, 0.009), vec3(0.075, 0.07, 0.066), pow(lum, 2.6) * 1.6) + vec3(0.05, 0.045, 0.04) * vein + vec3(0.035, 0.033, 0.03) * vein2;
  diffuseColor.rgb = mix(diffuseColor.rgb, darkStone, uDark);
  // lucidatura non uniforme: le venature e le zone lisce riflettono di più, i pori di meno
  pcRough = mix(mix(0.5, 0.3, cloud), mix(0.38, 0.22, cloud), uDark) - vein * 0.08 + pits * 0.25 + (grain - 0.5) * 0.06 * aa;
  // l'inchiostro è inciso: la linea scende sotto la superficie, il bordo prende la luce
  pcHeight = -pcInk * 0.55 - pits * 0.12 + (grain - 0.5) * 0.03 * aa;
  diffuseColor.rgb = mix(diffuseColor.rgb, uInkColor, pcInk);
  // colata dalla sommità
  float ang = atan(vObj.x, vObj.z) / 6.2831853 + 0.5;
  float depth = uTopY - vObj.y;
  float drip = pow(pcNoise(vec2(ang * 46.0, 1.7)), 5.0) * 0.30 + pow(pcNoise(vec2(ang * 17.0, 4.1)), 3.0) * 0.12;
  float grow = 0.5 + 0.5 * sin(uTime * 0.25 + ang * 9.0);
  float cover = uPour * (0.09 + drip * (0.65 + 0.35 * grow));
  pcLiquid = (1.0 - smoothstep(-0.002, 0.004, depth - cover)) * step(0.001, uPour);
  // veste d'inchiostro che risale con viticci
  if (uDressY > -0.5) {
    float tend = pow(pcNoise(vec2(vObj.x * 26.0 + vObj.z * 13.0, 3.1)), 4.0) * 0.3
               + pow(pcNoise(vec2(vObj.x * 9.0 - vObj.z * 7.0, 7.7)), 3.0) * 0.12;
    float edge = uDressY + tend * (0.8 + 0.2 * sin(uTime * 0.5 + vObj.x * 11.0)) + 0.012 * sin(vObj.x * 23.0 + vObj.z * 17.0 + uTime * 0.7);
    pcLiquid = max(pcLiquid, 1.0 - smoothstep(edge - 0.003, edge + 0.003, vObj.y));
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.003, 0.0032, 0.004), pcLiquid);
  pcGlow *= 1.0 - pcLiquid;
  pcHeight *= 1.0 - pcLiquid;
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(clamp(pcRough, 0.14, 0.75), uInkRough, pcInk);
roughnessFactor = mix(roughnessFactor, 0.06, pcLiquid);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
normal = pcPerturb(-vViewPosition, normal, vec2(dFdx(pcHeight), dFdy(pcHeight)), faceDirection);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        /* glsl */ `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, uInkMetal, pcInk);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance += uGlowCol * pcGlow * 11.0;`,
      );
  };
  m.customProgramCacheKey = () => "inkstone6" + (o.surfaceInk ?? "");
  return m;
}

/** Maschera di un canvas (canale rosso) come texture R8: un quarto della memoria di una RGBA. */
export function maskTexture(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer, repeat = false) {
  const w = c.width;
  const h = c.height;
  const src = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = (h - 1 - y) * w;
    const srow = y * w * 4;
    for (let x = 0; x < w; x++) data[row + x] = src[srow + x * 4];
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.internalFormat = "R8";
  t.unpackAlignment = 1;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

/**
 * Anello d'inchiostro liquido (TorusGeometry): spostamento lungo la normale con rumore
 * che scorre attorno al cerchio, normali ricalcolate per differenze finite sul parametrico.
 */
export function makeInkRingMaterial(R: number, r: number, amp = 0.12) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x020203,
    roughness: 0.09,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
    iridescence: 0.25,
    iridescenceIOR: 1.3,
  });
  const uniforms = { uR: { value: R }, ur: { value: r }, uAmp: { value: amp }, uTime: shared.uTime, uSeed: { value: Math.random() * 10 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform float uR, ur, uAmp, uTime, uSeed;
float rh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float rn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(rh(i),rh(i+vec3(1,0,0)),f.x),mix(rh(i+vec3(0,1,0)),rh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(rh(i+vec3(0,0,1)),rh(i+vec3(1,0,1)),f.x),mix(rh(i+vec3(0,1,1)),rh(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 ringP(float a, float b) {
  float thick = ur * (1.0 + 0.35 * sin(a * 2.0 + uSeed) + 0.2 * sin(a * 5.0 - uTime * 0.3 + uSeed));
  vec3 n0 = vec3(cos(b) * cos(a), cos(b) * sin(a), sin(b));
  vec3 base = vec3(uR * cos(a), uR * sin(a), 0.0);
  vec3 ra = vec3(cos(a + uTime * 0.05), sin(a + uTime * 0.05), 0.0);
  float d = (rn(vec3(ra.xy * 2.2, b * 0.0) + n0 * 1.6 + vec3(0.0, 0.0, uTime * 0.18 + uSeed)) - 0.5) * uAmp * 2.0;
  d += sin(a * 40.0 - uTime * 1.2 + b * 2.0) * uAmp * 0.04;
  return base + n0 * (thick + d);
}
`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
float pa = uv.x * 6.2831853;
float pb = uv.y * 6.2831853;
vec3 P0 = ringP(pa, pb);
vec3 Pa = ringP(pa + 0.004, pb);
vec3 Pb = ringP(pa, pb + 0.02);
vec3 objectNormal = normalize(cross(Pa - P0, Pb - P0));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = P0;");
  };
  m.customProgramCacheKey = () => "inkring";
  return m;
}

/** Pavimento: specchio d'inchiostro con increspature, compatibile con Reflector. */
export const InkFloorShader = {
  name: "InkFloorShader",
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uTime: shared.uTime,
  },
  vertexShader: /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUvR;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUvR = textureMatrix * vec4(position, 1.0);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`,
  fragmentShader: /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform float uTime;
varying vec4 vUvR;
varying vec3 vWorld;
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vWorld.xz;
  float n1 = pcNoise(p * 1.3 + vec2(uTime * 0.05, -uTime * 0.04));
  float n2 = pcNoise(p * 3.7 - vec2(uTime * 0.09, uTime * 0.06));
  vec2 dist = vec2(n1 - 0.5, n2 - 0.5) * 0.035;
  // sottili cerchi concentrici che si allargano attorno ai plinti
  vec4 uvr = vUvR;
  uvr.xy += dist * uvr.w;
  vec3 refl = texture2DProj(tDiffuse, uvr).rgb;
  vec3 camDir = normalize(cameraPosition - vWorld);
  float F = 0.06 + 0.94 * pow(1.0 - clamp(camDir.y, 0.0, 1.0), 4.0);
  vec3 base = vec3(0.0035, 0.0036, 0.004) * (0.8 + 0.4 * n2);
  float mask = 0.55 + 0.45 * smoothstep(0.35, 0.7, pcNoise(p * 0.35));
  vec3 col = base + refl * mix(0.35, 0.95, F) * mask;
  gl_FragColor = vec4(col, 1.0);
}`,
};

/** Cono volumetrico additivo per i fasci delle luci spot. */
export function makeBeamMaterial(color: THREE.ColorRepresentation, strength = 0.18) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  vH = uv.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor; uniform float uStrength; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vW;
${NOISE_GLSL}
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(clamp(f, 0.0, 1.0), 2.2);
  float along = pow(clamp(vH, 0.0, 1.0), 1.4); // su D3D pow di un negativo dà NaN
  float dust = 0.75 + 0.25 * pcNoise(vW.xz * 3.0 + vec2(0.0, vW.y * 2.0 - uTime * 0.2));
  gl_FragColor = vec4(uColor * edge * along * dust * uStrength, 1.0);
}`,
  });
}

/** Pannello flash: linee avorio che si disegnano (reveal) e respirano. */
export function makeFlashMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uReveal: { value: 0 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
uniform sampler2D uTex; uniform float uReveal; uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
void main(){
  float l = texture2D(uTex, vUv).r;
  float glow = texture2D(uTex, vUv, 3.5).r;
  float n = pcNoise(vUv * vec2(8.0, 12.0));
  float rv = smoothstep(0.0, 0.08, uReveal * 1.3 - (1.0 - vUv.y) * 0.8 - n * 0.3);
  vec3 ivory = vec3(0.93, 0.88, 0.80);
  vec3 col = vec3(0.006) + ivory * (l * 1.25 + glow * 0.12) * rv;
  col *= 0.92 + 0.08 * sin(uTime * 0.8 + vUv.y * 3.0);
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}

/** Membrana d'inchiostro dentro l'anello dell'oculo: vortice scuro, filamenti, bordo d'eclissi (come il portale). */
export function makeMembraneMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: shared.uTime },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
uniform float uTime; varying vec2 vUv;
${NOISE_GLSL}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * pcNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  float r = length(q);
  float tw = uTime * 0.3 + 2.2 / (r + 0.3);
  vec2 w = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * q;
  float fil = fbm(vec2(atan(w.y, w.x) * 3.0, r * 9.0 - uTime * 0.6));
  vec3 col = vec3(0.0025, 0.0026, 0.0034) * smoothstep(0.0, 0.9, r);
  col += vec3(0.85, 0.8, 0.72) * pow(smoothstep(0.55, 0.75, fil), 3.0) * 0.03 * smoothstep(0.05, 0.6, r);
  col += vec3(1.0, 0.86, 0.68) * exp(-max(1.0 - r, 0.0) * 26.0) * 0.12;
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}
