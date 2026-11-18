import * as THREE from "three";

export const CompositeShader = {
  name: "PCComposite",
  uniforms: {
    tPortal: { value: null as THREE.Texture | null },
    tGallery: { value: null as THREE.Texture | null },
    uMix: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tPortal; uniform sampler2D tGallery; uniform float uMix;
varying vec2 vUv;
void main(){
  // ogni sorgente è ripulita (max/min scartano i NaN su ANGLE/D3D) prima della dissolvenza
  vec3 c;
  if (uMix < 0.001) {
    c = min(max(texture2D(tPortal, vUv).rgb, vec3(0.0)), vec3(48.0));
  } else if (uMix > 0.999) {
    c = min(max(texture2D(tGallery, vUv).rgb, vec3(0.0)), vec3(48.0));
  } else {
    vec3 a = min(max(texture2D(tPortal, vUv).rgb, vec3(0.0)), vec3(48.0));
    vec3 b = min(max(texture2D(tGallery, vUv).rgb, vec3(0.0)), vec3(48.0));
    c = mix(a, b, uMix);
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};

export const FinalShader = {
  name: "PCFinal",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 2.0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uCA: { value: 0.0015 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uExposure;
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
  // grana filmica
  float g = hash(uv * uRes + fract(uTime * 7.31) * 300.0) - 0.5;
  col += g * 0.045 * (1.0 - l * 0.6);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`,
};
