import * as THREE from "three";

export const CompositeShader = {
  name: "PCComposite",
  uniforms: {
    tPortal: { value: null as THREE.Texture | null },
    tGallery: { value: null as THREE.Texture | null },
    uMix: { value: 0 },
    // xy = 1 / dimensione, zw = dimensione della sorgente; up = 1 se la sorgente è più piccola dell'uscita
    uPortalTexel: { value: new THREE.Vector4(1, 1, 1, 1) },
    uGalleryTexel: { value: new THREE.Vector4(1, 1, 1, 1) },
    uPortalUp: { value: 0 },
    uGalleryUp: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tPortal; uniform sampler2D tGallery; uniform float uMix;
uniform vec4 uPortalTexel; uniform vec4 uGalleryTexel; uniform float uPortalUp; uniform float uGalleryUp;
varying vec2 vUv;

// ogni lettura è ripulita (max/min scartano i NaN su ANGLE/D3D) prima di essere combinata
vec3 clean(sampler2D t, vec2 uv){ return min(max(texture2D(t, uv).rgb, vec3(0.0)), vec3(48.0)); }

// Ingrandimento Catmull-Rom (5 letture bilineari, gli angoli trascurabili sono omessi), limitato
// al minimo e massimo dei 4 texel vicini: più nitido del bilineare, senza aloni attorno alle luci.
vec3 upsample(sampler2D t, vec2 uv, vec4 texel){
  vec2 pos = uv * texel.zw;
  vec2 tc = floor(pos - 0.5) + 0.5;
  vec2 f = pos - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (tc - 1.0) * texel.xy;
  vec2 p3 = (tc + 2.0) * texel.xy;
  vec2 p12 = (tc + w2 / w12) * texel.xy;
  float a = w12.x * w0.y, b = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
  vec3 col = (clean(t, vec2(p12.x, p0.y)) * a + clean(t, vec2(p0.x, p12.y)) * b + clean(t, p12) * c
            + clean(t, vec2(p3.x, p12.y)) * d + clean(t, vec2(p12.x, p3.y)) * e) / (a + b + c + d + e);
  vec2 q = tc * texel.xy;
  vec3 t00 = clean(t, q), t10 = clean(t, q + vec2(texel.x, 0.0));
  vec3 t01 = clean(t, q + vec2(0.0, texel.y)), t11 = clean(t, q + texel.xy);
  return clamp(col, min(min(t00, t10), min(t01, t11)), max(max(t00, t10), max(t01, t11)));
}
vec3 portalAt(vec2 uv){ return uPortalUp > 0.5 ? upsample(tPortal, uv, uPortalTexel) : clean(tPortal, uv); }
vec3 galleryAt(vec2 uv){ return uGalleryUp > 0.5 ? upsample(tGallery, uv, uGalleryTexel) : clean(tGallery, uv); }

void main(){
  vec3 c;
  if (uMix < 0.001) {
    c = portalAt(vUv);
  } else if (uMix > 0.999) {
    c = galleryAt(vUv);
  } else {
    c = mix(portalAt(vUv), galleryAt(vUv), uMix);
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};

/**
 * Filtro passa-alto del bloom (sostituisce quello di UnrealBloomPass, stessi uniform). Il bloom
 * lavora sempre alla risoluzione di riferimento: quattro letture bilineari coprono l'impronta di
 * ogni suo texel anche quando il canvas ha più pixel. Con il rapporto storico 2:1 le letture cadono
 * sui centri dei texel e il risultato coincide con la singola lettura originale.
 */
export const bloomHighPassFragment = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 defaultColor;
uniform float defaultOpacity;
uniform float luminosityThreshold;
uniform float smoothWidth;
uniform vec2 uTap;
varying vec2 vUv;
void main() {
  vec4 texel = 0.25 * (texture2D(tDiffuse, vUv - uTap) + texture2D(tDiffuse, vUv + vec2(uTap.x, -uTap.y))
             + texture2D(tDiffuse, vUv + vec2(-uTap.x, uTap.y)) + texture2D(tDiffuse, vUv + uTap));
  float v = luminance(texel.xyz);
  vec4 outputColor = vec4(defaultColor.rgb, defaultOpacity);
  float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
  gl_FragColor = mix(outputColor, texel, alpha);
}`;

export const FinalShader = {
  name: "PCFinal",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    // griglia della grana: il DPR di riferimento, così la grana ha la stessa misura a qualsiasi DPR
    uGrainRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 2.0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uCA: { value: 0.0015 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform vec2 uGrainRes; uniform float uExposure;
uniform float uFade; uniform float uFlash; uniform float uCA;
varying vec2 vUv;

vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  // leggera distorsione da obiettivo + aberrazione cromatica ai bordi
  vec2 duv = uv + cc * r2 * 0.035;
  float ca = uCA * (0.3 + r2 * 6.0) + uFlash * 0.01;
  vec3 col;
  col.r = texture2D(tDiffuse, duv + cc * ca).r;
  col.g = texture2D(tDiffuse, duv).g;
  col.b = texture2D(tDiffuse, duv - cc * ca).b;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  col = max(col, 0.0) * uExposure;
  col += vec3(1.0, 0.95, 0.88) * uFlash * 0.6;
  col = aces(col);
  // grading: ombre leggermente fredde, luci calde (avorio)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3(0.94, 0.98, 1.06), (1.0 - smoothstep(0.0, 0.35, l)) * 0.5);
  col = mix(col, col * vec3(1.05, 1.0, 0.92), smoothstep(0.45, 1.0, l) * 0.4);
  // vignetta
  col *= mix(1.0, 1.0 - smoothstep(0.2, 0.85, length(cc * vec2(uRes.x / uRes.y, 1.0)) * 0.9), 0.55);
  col = toSRGB(clamp(col, 0.0, 1.0));
  // grana filmica: un valore per pixel della griglia di riferimento, interpolato fra i pixel
  // (com'era l'ingrandimento del browser); al DPR di riferimento coincide con un valore per pixel
  vec2 gq = uv * uGrainRes - 0.5;
  vec2 gi = floor(gq);
  vec2 gf = gq - gi;
  vec2 go = gi + 0.5 + fract(uTime * 7.31) * 300.0;
  float g = mix(mix(hash(go), hash(go + vec2(1.0, 0.0)), gf.x), mix(hash(go + vec2(0.0, 1.0)), hash(go + vec2(1.0)), gf.x), gf.y) - 0.5;
  col += g * 0.045 * (1.0 - l * 0.6);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`,
};
