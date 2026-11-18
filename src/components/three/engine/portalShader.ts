/**
 * Portale d'inchiostro in raymarching (GLSL, WebGL2).
 *
 * Scena in spazio portale: anello verticale centrato in (0, ringY, 0) sul piano XY,
 * lago d'inchiostro al piano y = FLOOR_Y, parete d'atrio a z = WALL_Z.
 * L'anello, le gocce e il lago sono un unico campo di distanza (smooth union): l'inchiostro
 * resta continuo. Il vuoto interno è una membrana liquida opaca: nell'hero non si vede oltre.
 * Con uOpen la membrana si apre e mostra la galleria (texture uGallery, spazio schermo).
 */

export const portalVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const portalFragment = /* glsl */ `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnter;   // 0 = hero, 1 = camera dentro il cerchio
uniform float uOpen;    // apertura della membrana 0..1
uniform float uIntro;   // emersione dell'anello dal lago 0..1
uniform float uHover;   // interazione del puntatore 0..1
uniform vec2 uMouse;    // -1..1
uniform sampler2D uGallery;
uniform float uSteps;   // passi primari (qualità adattiva)
uniform float uDebug;
uniform float uDist;     // arretramento della camera (ritorno dal finale)
uniform float uVeil;     // oscura lago, parete e ambiente lasciando anello e membrana
uniform float uMouseAmt; // peso della parallasse del puntatore
uniform vec4 uDrops[5]; // posizione e raggio, calcolati una volta per frame

varying vec2 vUv;

#define PI 3.14159265
const float RR = 1.0;        // raggio maggiore
const float R0 = 0.19;       // raggio del tubo
const float FLOOR_Y = -1.16; // superficie del lago
const float WALL_Z = -5.2;   // parete dell'atrio

float ringY;
vec3 gMouseP;

// ---------------------------------------------------------------- noise
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
                 mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                 mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float vnoise2(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float gaussA(float th, float c, float w) {
  float d = atan(sin(th - c), cos(th - c));
  return exp(-d * d / (w * w));
}

// ---------------------------------------------------------------- SDF
// Spessore extra lungo l'anello: accumuli e assottigliamenti (dal brief Blender).
// Il centro della sezione si sposta verso l'esterno della stessa quantità:
// il bordo interno resta un cerchio perfetto, la massa esterna è organica.
float extraT(float th) {
  return 0.10 * gaussA(th, 0.56, 0.42) + 0.065 * gaussA(th, 3.58, 0.50)
       + 0.030 * gaussA(th, -1.57, 0.28) - 0.045 * gaussA(th, 2.06, 0.38)
       - 0.020 * gaussA(th, 5.85, 0.30)
       + 0.018 * sin(3.0 * th + uTime * 0.31) + 0.010 * sin(5.0 * th - uTime * 0.47);
}

float sdRing(vec3 p) {
  p.y -= ringY;
  float th = atan(p.y, p.x);
  float e = extraT(th);
  float L = length(p.xy);
  float rad = R0 + e;
  vec2 q = vec2(L - RR - e, p.z * 1.08);
  float d = length(q) - rad;
  if (d > 0.22) return d; // lontano: niente rumore
  float side = smoothstep(-rad * 0.9, rad * 0.4, q.x);
  vec3 pr = p;
  pr.xy = rot(uTime * 0.12) * pr.xy; // il rumore scorre lungo il cerchio
  float n = vnoise(pr * 3.4 + vec3(0.0, 0.0, uTime * 0.15));
  n += 0.18 * sin(pr.x * 11.0 + uTime * 0.7) * sin(pr.y * 9.0 - uTime * 0.5) * sin(pr.z * 13.0);
  d += (n - 0.5) * 0.08 * mix(0.12, 1.0, side);
  d += sin(36.0 * th - uTime * 1.1 + q.y * 9.0) * 0.0035 * side; // striature di flusso
  // il puntatore attira la materia
  vec3 dm = p + vec3(0.0, ringY, 0.0) - gMouseP;
  d -= 0.07 * uHover * exp(-dot(dm, dm) * 7.0);
  return d;
}

float sdDrops(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < 5; i++) {
    d = smin(d, length(p - uDrops[i].xyz) - uDrops[i].w, 0.08);
  }
  return d;
}

float sdLake(vec3 p) {
  float rd = length(p.xz);
  float w = sin(rd * 9.0 - uTime * 1.6) * 0.006 * exp(-rd * 0.45)
          + (vnoise(vec3(p.xz * 1.3, uTime * 0.12)) - 0.5) * 0.022;
  return p.y - FLOOR_Y - w;
}

float map(vec3 p) {
  return smin(sdRing(p), sdDrops(p), 0.22);
}

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

// marcia solo dentro il volume dell'anello, fino a tStop (lago o parete)
float traceRing(vec3 ro, vec3 rd, float tStop, int maxSteps) {
  float ext = RR + R0 + 0.72;
  vec2 tb = boxHit(ro, rd, vec3(-ext, ringY - ext, -0.62), vec3(ext, ringY + ext, 0.62));
  if (tb.x > tb.y || tb.y < 0.0) return -1.0;
  float t = max(tb.x, 0.0) + 0.001;
  float tEnd = min(tb.y, tStop);
  for (int i = 0; i < 120; i++) {
    if (i >= maxSteps || t > tEnd) break;
    float d = map(ro + rd * t);
    if (abs(d) < 0.0006 * t + 0.0005) return t;
    t += d * 0.85;
  }
  return -1.0;
}

// lago: piano analitico con increspature in normale
vec3 lakeNormal(vec2 xz) {
  float rd = length(xz);
  float e = 0.03;
  float h0 = vnoise2(xz * 1.6 + uTime * 0.08) * 0.5 + vnoise2(xz * 4.3 - uTime * 0.12) * 0.25;
  float hx = vnoise2((xz + vec2(e, 0.0)) * 1.6 + uTime * 0.08) * 0.5 + vnoise2((xz + vec2(e, 0.0)) * 4.3 - uTime * 0.12) * 0.25;
  float hz = vnoise2((xz + vec2(0.0, e)) * 1.6 + uTime * 0.08) * 0.5 + vnoise2((xz + vec2(0.0, e)) * 4.3 - uTime * 0.12) * 0.25;
  vec2 g = vec2(hx - h0, hz - h0) / e * 0.06;
  // onde concentriche attorno al punto in cui l'anello entra nel lago
  float w = cos(rd * 10.0 - uTime * 1.6) * 0.05 * exp(-rd * 0.5);
  g += (xz / max(rd, 1e-3)) * w;
  return normalize(vec3(-g.x, 1.0, -g.y));
}

vec3 calcNormal(vec3 p, float t) {
  float e = 0.0012 * max(1.0, t * 0.6);
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e)
                 + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}


// ---------------------------------------------------------------- luce
float softBox(vec2 p, vec2 b, float s) {
  vec2 d = abs(p) - b;
  return 1.0 - smoothstep(0.0, s, max(d.x, d.y));
}

// ambiente procedurale: softbox frontale, strisce laterali, striscia di controluce
vec3 env(vec3 rd) {
  vec3 col = vec3(0.0035, 0.0038, 0.0045) + vec3(0.010, 0.0095, 0.009) * smoothstep(-0.3, 0.7, rd.y);
  if (rd.y > 0.02) {
    vec2 h = rd.xz / rd.y * 5.0;
    col += vec3(1.0, 0.92, 0.80) * softBox(h - vec2(0.0, 2.6), vec2(1.7, 1.1), 0.35) * 6.0;
    col += vec3(0.75, 0.82, 1.0) * softBox(h - vec2(0.0, -3.4), vec2(3.4, 0.10), 0.10) * 3.0;
  }
  if (abs(rd.x) > 0.02) {
    vec2 h = vec2(rd.y, rd.z) / abs(rd.x) * 5.0;
    float s = softBox(h - vec2(0.9, 1.4), vec2(2.6, 0.08), 0.06);
    col += vec3(1.0, 0.95, 0.88) * s * (rd.x > 0.0 ? 3.2 : 1.7);
  }
  return col;
}

vec3 wallColor(vec3 p) {
  vec2 c = vec2(0.0, ringY * 0.6 + 0.15);
  float halo = exp(-dot(p.xy - c, p.xy - c) * 0.16);
  float panel = 0.85 + 0.15 * smoothstep(0.46, 0.5, abs(fract(p.x * 0.32) - 0.5));
  float grain = 0.9 + 0.1 * vnoise(vec3(p.xy * 6.0, 0.0));
  vec3 col = vec3(0.0105, 0.0112, 0.0125) * panel * grain;
  col += vec3(0.30, 0.27, 0.23) * halo * 0.16 * (0.4 + 0.6 * uIntro);
  // fessura verticale di luce a destra (dal blockout Blender)
  col += vec3(1.0, 0.94, 0.86) * 1.6 * (1.0 - smoothstep(0.0, 0.035, abs(p.x - 3.4))) * smoothstep(FLOOR_Y, FLOOR_Y + 0.6, p.y);
  return col;
}

vec3 background(vec3 ro, vec3 rd) {
  if (rd.z < -0.001) {
    float t = (WALL_Z - ro.z) / rd.z;
    vec3 p = ro + rd * t;
    if (p.y > FLOOR_Y - 0.05) return wallColor(p);
  }
  return env(rd);
}

vec3 thinFilm(float ndv, float n) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + 1.7 * ndv + n));
}

vec3 shadeInkSimple(vec3 p, vec3 n, vec3 rd) {
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  float F = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
  return vec3(0.004) + env(reflect(rd, n)) * F;
}

// ---------------------------------------------------------------- membrana
float membraneH(vec2 q) {
  float r = length(q);
  float tw = uTime * 0.22 + 1.1 / (r + 0.22);
  vec2 w = rot(tw) * q;
  float h = fbm2(w * 1.7 + vec2(uTime * 0.04, -uTime * 0.03));
  vec2 dm = q - gMouseP.xy + vec2(0.0, ringY);
  float md = length(dm);
  h += 0.05 * sin(30.0 * md - uTime * 5.0) * exp(-md * 3.2) * uHover;
  return h;
}

vec3 sampleGallery(vec2 uv, vec2 dir, float ca) {
  vec3 c;
  c.r = texture2D(uGallery, uv + dir * ca).r;
  c.g = texture2D(uGallery, uv).g;
  c.b = texture2D(uGallery, uv - dir * ca).b;
  return c;
}

vec3 shadeMembrane(vec3 pm, vec3 rd, vec2 suv) {
  vec2 q = pm.xy - vec2(0.0, ringY);
  float r = length(q);
  float rin = RR - R0;
  float ang = atan(q.y, q.x);

  // apertura con bordo liquido irregolare
  float A = uOpen * 1.25 * rin;
  float edgeN = vnoise(vec3(cos(ang) * 2.4, sin(ang) * 2.4, uTime * 0.45));
  float Ae = A * (1.0 + 0.32 * (edgeN - 0.5)) - 0.02;
  vec2 dir = q / max(r, 1e-4);

  if (uOpen > 0.001 && r < Ae) {
    float lens = smoothstep(Ae * 0.45, Ae, r);
    vec2 guv = suv - dir * lens * 0.05 * (1.0 - uEnter * 0.7);
    vec3 g = sampleGallery(guv, dir, 0.0012 + lens * 0.005);
    float lip = smoothstep(Ae - 0.06, Ae, r);
    return mix(g, vec3(0.0), lip * 0.85);
  }

  float e = 0.012;
  float h = membraneH(q);
  float hx = membraneH(q + vec2(e, 0.0));
  float hy = membraneH(q + vec2(0.0, e));
  float amp = 0.16;
  // vicino all'apertura la membrana si gonfia come un labbro
  float lipZone = (uOpen > 0.001) ? exp(-max(r - Ae, 0.0) * 18.0) : 0.0;
  vec3 n = normalize(vec3(-(hx - h) / e * amp + dir.x * lipZone * 1.6,
                          -(hy - h) / e * amp + dir.y * lipZone * 1.6, 1.0));
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 col = vec3(0.0025, 0.0026, 0.0034) * smoothstep(0.0, 0.85, r);
  col += env(reflect(rd, n)) * F * 0.32;
  col += vec3(0.010, 0.011, 0.016) * pow(1.0 - ndv, 2.0);

  // filamenti di luce risucchiati verso il centro
  vec2 w = rot(uTime * 0.35 + 2.2 / (r + 0.3)) * q;
  float fil = fbm2(vec2(atan(w.y, w.x) * 3.0, r * 9.0 - uTime * 0.6));
  col += vec3(0.85, 0.80, 0.72) * pow(smoothstep(0.55, 0.75, fil), 3.0) * 0.02 * smoothstep(0.05, 0.6, r);

  // luce che filtra dal bordo, come un'eclissi
  col += vec3(1.0, 0.86, 0.68) * exp(-max(rin - r, 0.0) * 70.0) * 0.06 * uIntro;
  col += vec3(1.0, 0.9, 0.8) * lipZone * 0.08;
  return col;
}

// ---------------------------------------------------------------- main
void main() {
  vec2 frag = vUv * uRes;
  vec2 uvc = (frag * 2.0 - uRes) / uRes.y;
  float aspect = uRes.x / uRes.y;
  uvc *= max(1.0, 1.15 / aspect); // in verticale il cerchio resta intero

  ringY = mix(-2.95, 0.0, 1.0 - pow(1.0 - uIntro, 3.0));

  float e = uEnter;
  float ez = e * e * (3.0 - 2.0 * e);
  float mAmt = (1.0 - e) * uMouseAmt;
  vec3 ro = vec3(uMouse.x * 0.30 * mAmt, 0.06 + uMouse.y * 0.12 * mAmt, mix(5.3, 0.22, pow(ez, 1.25)) + uDist);
  vec3 ta = vec3(uMouse.x * 0.06 * mAmt, mix(0.0, ringY * 0.0 + 0.02, e), 0.0 - 4.0 * ez);
  vec3 cw = normalize(ta - ro);
  vec3 cu = normalize(cross(cw, vec3(0.0, 1.0, 0.0)));
  vec3 cv = cross(cu, cw);
  float fl = mix(3.05, 1.45, ez); // dolly-zoom durante l'attraversamento
  vec3 rd = normalize(uvc.x * cu + uvc.y * cv + fl * cw);

  // puntatore proiettato sul piano del portale
  vec2 mc = uMouse * vec2(max(aspect, 0.87), 1.0);
  vec3 mrd = normalize(mc.x * cu + mc.y * cv + fl * cw);
  gMouseP = ro + mrd * (-ro.z / mrd.z);
  if (uDebug == 4.0) gMouseP = vec3(9.0);

  float tWall = rd.z < 0.0 ? (WALL_Z - ro.z) / rd.z : 40.0;
  float tmax = min(tWall, 40.0);
  int steps = int(uSteps);
  float tLake = rd.y < -0.0001 ? (FLOOR_Y - ro.y) / rd.y : 1e5;
  float t = uDebug == 2.0 ? -1.0 : traceRing(ro, rd, min(tmax, tLake), steps);
  if (uDebug == 3.0) tLake = 1e5;

  // membrana sul piano z = 0
  float tm = rd.z < 0.0 ? -ro.z / rd.z : -1.0;
  vec3 pm = ro + rd * tm;
  float rm = length(pm.xy - vec2(0.0, ringY));
  bool memHit = tm > 0.0 && rm < (RR - R0 + 0.06) && pm.y > FLOOR_Y + 0.01 && (t < 0.0 || tm < t) && tm < tLake && uDebug != 1.0;

  vec3 col;
  float dist;
  if (memHit) {
    col = shadeMembrane(pm, rd, vUv);
    dist = tm;
  } else if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p, t);
    float ndv = clamp(dot(n, -rd), 0.0, 1.0);
    float F = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
    vec3 r = reflect(rd, n);
    // riflesso secondario: l'anello si specchia nel lago e il lago nell'anello
    vec3 refl;
    float t2 = traceRing(p + n * 0.01, r, 9.0, 36);
    if (t2 > 0.0) {
      vec3 p2 = p + n * 0.01 + r * t2;
      vec3 n2 = calcNormal(p2, t2 + t);
      refl = shadeInkSimple(p2, n2, r);
    } else {
      // la membrana si riflette nel lago come un disco nero
      float tm2 = r.z < 0.0 ? -(p.z) / r.z : -1.0;
      vec3 q2 = p + r * tm2;
      bool m2 = tm2 > 0.0 && length(q2.xy - vec2(0.0, ringY)) < RR - R0;
      refl = m2 ? vec3(0.002) : background(p, r);
    }
    float nn = vnoise(p * 4.0 + uTime * 0.1);
    vec3 film = mix(vec3(1.0), thinFilm(ndv, nn), 0.16);
    vec3 L = normalize(vec3(0.2, 0.9, 0.55));
    col = vec3(0.0045, 0.0047, 0.0055) * (0.25 + 0.75 * max(dot(n, L), 0.0));
    col += refl * F * film;
    dist = t;
  } else if (tLake < tmax) {
    // lago d'inchiostro: riflette anello, membrana e parete
    vec3 p = ro + rd * tLake;
    vec3 n = lakeNormal(p.xz);
    float ndv = clamp(dot(n, -rd), 0.0, 1.0);
    float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    vec3 r = reflect(rd, n);
    vec3 refl;
    float t2 = traceRing(p + vec3(0.0, 0.002, 0.0), r, 12.0, 40);
    if (t2 > 0.0) {
      vec3 p2 = p + r * t2;
      refl = shadeInkSimple(p2, calcNormal(p2, t2 + tLake), r);
    } else {
      float tm2 = r.z < 0.0 ? -p.z / r.z : -1.0;
      vec3 q2 = p + r * tm2;
      bool m2 = tm2 > 0.0 && length(q2.xy - vec2(0.0, ringY)) < RR - R0;
      refl = m2 ? vec3(0.0015) + vec3(1.0, 0.86, 0.68) * 0.03 * uIntro : background(p, r);
    }
    col = (vec3(0.0025, 0.0026, 0.003) + refl * mix(0.25, 1.0, F)) * (1.0 - uVeil);
    // velo di luce dove l'anello tocca il lago
    float contact = exp(-pow(length(p.xz) - 0.0, 2.0) * 2.5) * smoothstep(-2.0, 0.0, ringY);
    col += vec3(0.9, 0.8, 0.66) * contact * 0.004;
    dist = tLake;
  } else {
    col = background(ro, rd) * (1.0 - uVeil);
    dist = tmax;
  }

  // foschia + fascio di luce dall'alto sul cerchio
  float fog = 1.0 - exp(-max(dist - 2.0, 0.0) * 0.035);
  col = mix(col, vec3(0.006, 0.0064, 0.0072) * (1.0 - uVeil), fog);
  vec3 bo = vec3(0.0, 0.0, 0.9);
  vec3 bd = normalize(vec3(0.0, 1.0, 0.18));
  vec3 w0 = ro - bo;
  float b = dot(rd, bd);
  float dd = dot(rd, w0);
  float ee = dot(bd, w0);
  float den = max(1.0 - b * b, 1e-3);
  float sc = (b * ee - dd) / den;
  float tc = (ee - b * dd) / den;
  vec3 cp = ro + rd * max(sc, 0.0);
  float beamD = length(w0 + rd * max(sc, 0.0) - bd * tc);
  float beam = exp(-beamD * beamD * 2.2) * smoothstep(-1.2, 2.5, cp.y) * step(0.0, sc) * step(sc, dist);
  col += vec3(1.0, 0.93, 0.82) * beam * 0.022 * uIntro * (1.0 - e) * (1.0 - uVeil);

  // pulviscolo
  vec2 gp = frag / uRes.y * 26.0 + vec2(uTime * 0.12, uTime * 0.05);
  vec2 gi = floor(gp);
  float hsh = hash12(gi);
  vec2 off = vec2(hash12(gi + 7.1), hash12(gi + 3.3)) - 0.5;
  float spark = (1.0 - smoothstep(0.0, 0.08, length(fract(gp) - 0.5 - off * 0.6))) * step(0.93, hsh);
  col += vec3(0.9, 0.85, 0.78) * spark * 0.05 * (0.5 + 0.5 * sin(uTime * 1.5 + hsh * 40.0)) * (1.0 - e) * (1.0 - uVeil);

  col = max(col, 0.0);
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
