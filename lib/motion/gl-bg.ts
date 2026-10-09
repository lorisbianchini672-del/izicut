/**
 * Fonds animés « haut de gamme » des vidéos, calculés par la carte graphique
 * (WebGL) puis posés dans l'image : soie, aurore, dégradé mesh, métal liquide,
 * nébuleuse, plasma, grille rétro, bokeh, lignes, vagues, dégradé granuleux,
 * papier… Chaque fond se règle (couleurs, vitesse, intensité, échelle, angle),
 * et l'IA peut même écrire un fond sur mesure (« custom ») à partir du souhait
 * du client. Sans WebGL, drawBackdrop renvoie false et le moteur 2D prend le relais.
 */

export const BACKDROPS = ['glow', 'silk', 'aurora', 'mesh', 'liquid', 'nebula', 'plasma', 'grid', 'bokeh', 'lines', 'waves', 'grain', 'paper', 'marble', 'fire', 'ocean', 'sky', 'smoke', 'holo', 'tunnel', 'warp', 'hex', 'halftone', 'topo', 'matrix', 'lava', 'rays', 'ink', 'sunset', 'dots', 'stripes', 'custom'] as const;
export type BackdropKind = (typeof BACKDROPS)[number];
export const BACKDROP_LABELS: Record<BackdropKind, string> = {
  glow: 'Halo de couleur',
  silk: 'Soie lumineuse',
  aurora: 'Aurore boréale',
  mesh: 'Dégradé mesh',
  liquid: 'Métal liquide',
  nebula: 'Nébuleuse',
  plasma: 'Plasma',
  grid: 'Grille rétro 80’s',
  bokeh: 'Bokeh',
  lines: 'Lignes fluides',
  waves: 'Vagues douces',
  grain: 'Dégradé granuleux',
  paper: 'Papier (clair)',
  marble: 'Marbre',
  fire: 'Flammes',
  ocean: 'Reflets d’eau',
  sky: 'Ciel et nuages',
  smoke: 'Fumée',
  holo: 'Holographique',
  tunnel: 'Tunnel néon',
  warp: 'Hyper-espace',
  hex: 'Alvéoles',
  halftone: 'Trame pop art',
  topo: 'Courbes de niveau',
  matrix: 'Pluie numérique',
  lava: 'Lampe à lave',
  rays: 'Rayons de lumière',
  ink: 'Encre dans l’eau',
  sunset: 'Coucher de soleil',
  dots: 'Points ondulants',
  stripes: 'Rayures cinétiques',
  custom: 'Sur mesure (IA)'
};

export type Backdrop = {
  kind: BackdropKind;
  colors?: string[];
  speed?: number;
  intensity?: number;
  scale?: number;
  angle?: number;
  /** kind = "custom" : corps GLSL de « vec3 bg(vec2 uv, vec2 p, float t) » écrit par l'IA. */
  glsl?: string;
};

const HEADER = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uSpeed; uniform float uIntensity; uniform float uScale; uniform float uAngle;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8); for (int i = 0; i < 5; i++){ v += a * noise(p); p = r * p * 2.02; a *= 0.5; } return v; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Palette : glisse de la couleur 1 à la couleur 4 de la marque.
vec3 pal(float x){ x = clamp(x, 0.0, 1.0) * 3.0; return x < 1.0 ? mix(uC0, uC1, x) : x < 2.0 ? mix(uC1, uC2, x - 1.0) : mix(uC2, uC3, x - 2.0); }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

/** Corps « vec3 bg(vec2 uv, vec2 p, float t) » de chaque fond (uv 0-1, p centré et corrigé, t temps). */
const BODIES: Record<Exclude<BackdropKind, 'custom'>, string> = {
  glow: `vec3 bg(vec2 uv, vec2 p, float t){
  // Grandes nappes de couleur très floues qui dérivent (fond des pubs d'applis haut de gamme).
  vec2 q = p * 0.8;
  vec2 w = vec2(fbm(q + vec2(t * 0.035, 0.0)), fbm(q + vec2(3.7, -t * 0.03)));
  float f = fbm(q * 0.9 + 1.6 * w + vec2(0.0, t * 0.02));
  float m = smoothstep(0.26, 0.7, f);
  vec3 col = mix(uC0, uC1, smoothstep(0.15, 0.55, f));
  col = mix(col, uC2, m * 0.9 * uIntensity);
  col += uC3 * pow(m, 4.0) * 0.18 * uIntensity;
  return col;
}`,
  silk: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 w = vec2(fbm(p * 0.55 + vec2(0.0, t * 0.04)), fbm(p * 0.55 + vec2(4.1, -t * 0.032)));
  float f = fbm(p * 0.75 + 1.25 * w + vec2(t * 0.012, 0.0));
  float ph = dot(p, vec2(0.55, 0.95)) * 4.2 + f * 6.0 - t * 0.07;
  float fold = 0.5 + 0.5 * sin(ph);
  float ph2 = dot(p, vec2(-0.85, 0.5)) * 3.1 + f * 4.5 + t * 0.05;
  float fold2 = 0.5 + 0.5 * sin(ph2);
  vec3 col = uC0 * 0.18;
  col = mix(col, uC0 * 0.55, 0.55 + 0.45 * f);
  col += mix(uC1, uC2, smoothstep(0.35, 0.75, f)) * pow(fold, 3.2) * 0.5 * uIntensity;
  col += vec3(1.0) * pow(fold, 70.0) * 0.6 * uIntensity;
  col += uC3 * pow(fold2, 9.0) * 0.2 * uIntensity;
  col += vec3(1.0) * pow(fold2, 80.0) * 0.25 * uIntensity;
  return col;
}`,
  aurora: `vec3 bg(vec2 uv, vec2 p, float t){
  vec3 col = mix(uC0 * 0.12, uC0 * 0.03, uv.y);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float y = 0.15 + 0.12 * fi + 0.1 * sin(p.x * (1.2 + 0.3 * fi) + t * (0.12 + 0.04 * fi) + fi * 1.7) + 0.08 * (fbm(vec2(p.x * 1.4 + fi * 3.0, t * 0.05)) - 0.5);
    float d = p.y - y;
    // Rideau : bord net en haut qui s'estompe vers le bas, rayons verticaux qui ondulent.
    float above = exp(-max(d, 0.0) * max(d, 0.0) * 900.0);
    float below = exp(min(d, 0.0) * 5.0);
    float curtain = above * below * smoothstep(-0.6, 0.0, d);
    float streaks = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(p.x * 46.0 + fbm(vec2(p.x * 6.0, t * 0.25 + fi)) * 7.0), 2.0);
    col += pal(0.25 + 0.22 * fi) * curtain * streaks * 0.5 * uIntensity;
  }
  float stars = step(0.9975, hash(floor(uv * uRes / 2.0))) * (0.5 + 0.5 * sin(t * 3.0 + hash(floor(uv * 400.0)) * 20.0));
  return col + vec3(stars) * smoothstep(0.2, 0.9, uv.y) * 0.8;
}`,
  mesh: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p + 0.18 * vec2(fbm(p * 1.3 + t * 0.05), fbm(p * 1.3 - t * 0.05 + 5.0));
  vec2 a = vec2(-0.3 + 0.18 * sin(t * 0.13), 0.32 + 0.12 * cos(t * 0.11));
  vec2 b = vec2(0.3 + 0.15 * cos(t * 0.09), 0.12 + 0.15 * sin(t * 0.15));
  vec2 c = vec2(-0.25 + 0.2 * cos(t * 0.12), -0.18 + 0.15 * sin(t * 0.1));
  vec2 d = vec2(0.28 + 0.15 * sin(t * 0.1), -0.38 + 0.12 * cos(t * 0.14));
  float wa = pow(1.0 / (0.01 + dot(q - a, q - a)), 1.6), wb = pow(1.0 / (0.01 + dot(q - b, q - b)), 1.6), wc = pow(1.0 / (0.01 + dot(q - c, q - c)), 1.6), wd = pow(1.0 / (0.01 + dot(q - d, q - d)), 1.6);
  vec3 col = (uC0 * wa + uC1 * wb + uC2 * wc + uC3 * wd) / (wa + wb + wc + wd);
  return mix(col * 0.55, col, uIntensity * 0.8);
}`,
  liquid: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 w = vec2(fbm(p * 1.1 + t * 0.06), fbm(p * 1.1 - t * 0.05 + 3.0));
  float n = fbm(p * 1.5 + 2.0 * w);
  float v = 0.5 + 0.5 * sin(n * 12.0 + t * 0.4);
  float spec = pow(v, 18.0);
  float rim = pow(0.5 + 0.5 * sin(n * 24.0 - t * 0.3), 30.0);
  vec3 base = mix(uC0 * 0.08, mix(uC1, uC2, n) * 0.55, smoothstep(0.15, 0.95, v));
  return base + vec3(1.0) * spec * 0.75 * uIntensity + uC3 * rim * 0.35 * uIntensity;
}`,
  nebula: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 1.2 + vec2(t * 0.01, t * 0.004);
  float n1 = fbm(q * 1.4 + fbm(q * 2.0 + t * 0.02));
  float n2 = fbm(q * 2.6 - 3.0);
  vec3 col = uC0 * 0.04;
  col += pal(n1) * pow(n1, 1.6) * 1.5 * uIntensity;
  col += uC3 * pow(n2, 3.0) * 0.8 * uIntensity;
  col += pal(0.7) * exp(-4.0 * dot(p - vec2(0.1, 0.15), p - vec2(0.1, 0.15))) * 0.25 * uIntensity;
  float s = hash(floor(uv * uRes / 1.5));
  col += vec3(1.0) * step(0.997, s) * (0.6 + 0.4 * sin(t * 2.0 + s * 50.0));
  col += vec3(1.0) * step(0.9995, hash(floor(uv * uRes / 3.0) + 7.0)) * 0.9;
  return col;
}`,
  plasma: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 k = p * 2.4;
  float v = sin(k.x * 3.0 + t * 0.6) + sin(k.y * 3.4 - t * 0.5) + sin((k.x + k.y) * 2.6 + t * 0.4) + sin(length(k * 3.2) - t * 0.7);
  v = v * 0.125 + 0.5;
  vec3 col = pal(fract(v + 0.08 * fbm(p * 2.0 + t * 0.1)));
  return col * (0.45 + 0.55 * uIntensity);
}`,
  grid: `vec3 bg(vec2 uv, vec2 p, float t){
  float hz = -0.05;
  vec3 col = mix(uC0 * 0.05, uC1 * 0.55, smoothstep(-0.2, 0.6, p.y));
  // Soleil rayé.
  vec2 sp = p - vec2(0.0, 0.18);
  float sun = smoothstep(0.24, 0.235, length(sp));
  float stripes = step(0.0, sin((p.y - t * 0.05) * 60.0) + (p.y - 0.05) * 18.0);
  col = mix(col, mix(uC3, uC2, smoothstep(-0.05, 0.4, p.y)), sun * stripes * step(hz, p.y));
  col += uC2 * 0.25 * exp(-length(sp) * 3.0) * uIntensity;
  if (p.y < hz){
    float z = 0.25 / (hz - p.y + 0.001);
    float x = p.x * z;
    float lx = abs(fract(x * 1.2) - 0.5);
    float lz = abs(fract(z * 0.9 + t * 0.6) - 0.5);
    float line = smoothstep(0.03 * z * 0.2 + 0.015, 0.0, min(lx, lz) / (z * 0.08 + 1.0));
    col = mix(uC0 * 0.08, uC0 * 0.02, smoothstep(hz, hz - 0.5, p.y));
    col += uC2 * line * (0.6 + 0.4 * uIntensity) * smoothstep(-1.0, hz, p.y);
  }
  return col;
}`,
  bokeh: `vec3 bg(vec2 uv, vec2 p, float t){
  vec3 col = mix(uC0 * 0.12, uC0 * 0.03, length(p));
  for (int i = 0; i < 18; i++){
    float fi = float(i);
    vec2 c = vec2(hash(vec2(fi, 1.3)) - 0.5, hash(vec2(fi, 7.1)) - 0.5) * vec2(1.0, 1.1);
    c += 0.06 * vec2(sin(t * 0.2 + fi), cos(t * 0.17 + fi * 1.3));
    float r = 0.04 + 0.11 * hash(vec2(fi, 3.7));
    float d = length(p - c);
    float disc = smoothstep(r, r * 0.82, d) * (0.6 + 0.4 * smoothstep(r * 0.6, r, d));
    col += pal(hash(vec2(fi, 9.9))) * disc * 0.6 * uIntensity * (0.65 + 0.35 * sin(t * 0.5 + fi));
  }
  return col;
}`,
  lines: `vec3 bg(vec2 uv, vec2 p, float t){
  float f = fbm(p * 0.9 + vec2(t * 0.05, -t * 0.03));
  float y = p.y * 26.0 + f * 9.0 + sin(p.x * 2.0 + t * 0.3) * 2.0;
  float l = abs(fract(y) - 0.5);
  float line = smoothstep(0.06, 0.0, l);
  float glow = smoothstep(0.5, 0.0, l) * 0.15;
  vec3 c = pal(0.5 + 0.5 * sin(floor(y) * 0.37 + t * 0.2));
  vec3 col = uC0 * 0.05 + c * (line * 0.7 + glow) * uIntensity * smoothstep(1.2, 0.1, length(p));
  return col;
}`,
  waves: `vec3 bg(vec2 uv, vec2 p, float t){
  vec3 col = mix(uC0 * 0.9, uC1, smoothstep(-0.6, 0.6, p.y));
  for (int i = 0; i < 5; i++){
    // Du fond (haut) vers le premier plan (bas) : chaque vague recouvre la précédente.
    float fi = float(i);
    float h = 0.3 - fi * 0.17 + 0.06 * sin(p.x * (3.0 + fi * 0.8) + t * (0.15 + fi * 0.03) + fi) + 0.025 * sin(p.x * 7.0 - t * 0.2 + fi * 2.0);
    float m = smoothstep(h + 0.004, h - 0.004, p.y);
    vec3 wc = pal(fi / 4.0);
    float shade = 0.75 + 0.25 * smoothstep(h - 0.25, h, p.y);
    col = mix(col, wc * shade, m * (0.55 + 0.45 * uIntensity));
    col += vec3(1.0) * smoothstep(0.012, 0.0, abs(p.y - h)) * 0.12 * uIntensity;
  }
  return col;
}`,
  grain: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * rot(0.3 * sin(t * 0.05));
  float g = smoothstep(-0.9, 0.9, q.x * 0.8 + q.y * 0.6 + 0.25 * sin(t * 0.1));
  vec3 col = pal(g);
  col *= 0.75 + 0.35 * fbm(p * 1.2 + t * 0.03);
  float n = hash(uv * uRes + fract(t * 7.0) * 100.0) - 0.5;
  return col + n * 0.16 * uIntensity;
}`,
  paper: `vec3 bg(vec2 uv, vec2 p, float t){
  vec3 paperCol = mix(vec3(0.97, 0.955, 0.93), uC0 * 0.15 + vec3(0.85), 0.25);
  float fib = fbm(uv * vec2(380.0, 90.0)) * 0.06 + fbm(uv * 14.0) * 0.05;
  vec3 col = paperCol - fib;
  col -= 0.12 * smoothstep(0.35, 1.2, length(p));
  col = mix(col, uC1, 0.06 * smoothstep(0.0, 1.0, fbm(p * 1.3 + t * 0.02)) * uIntensity);
  return col;
}`,
  marble: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 2.2 + vec2(t * 0.01, 0.0);
  float n = fbm(q + fbm(q * 2.0 + t * 0.02) * 1.5);
  float v = abs(sin(q.x * 2.0 + q.y * 1.3 + n * 7.0));
  float vein = pow(1.0 - v, 22.0);
  float vein2 = pow(1.0 - abs(sin(q.x * 3.7 - q.y * 2.1 + n * 11.0)), 40.0);
  vec3 col = mix(uC0, uC1, smoothstep(0.2, 0.8, n));
  col = mix(col, uC2, vein * 0.85 * uIntensity);
  col += uC3 * vein2 * 0.6 * uIntensity;
  return col;
}`,
  fire: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = vec2(p.x * 2.2, p.y * 1.6 - t * 0.55);
  float n = fbm(q * 2.0 + vec2(0.0, -t * 0.3)) * 0.65 + fbm(q * 4.0 - vec2(0.0, t * 0.9)) * 0.35;
  float h = clamp(0.5 - p.y + n * 0.9 - abs(p.x) * 0.7, 0.0, 1.0);
  float flame = pow(h, 1.8);
  vec3 col = pal(clamp(flame * (0.75 + 0.35 * n), 0.0, 1.0)) * smoothstep(0.0, 0.6, flame) * (0.75 + 0.4 * n) * uIntensity;
  float emb = step(0.996, hash(floor(vec2(uv.x * 220.0, uv.y * 400.0 - t * 30.0)))) * smoothstep(0.6, -0.2, p.y);
  return col + uC3 * emb * 0.8;
}`,
  ocean: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 4.0;
  float c = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    vec2 w = q * (1.0 + fi * 0.6) + vec2(t * (0.15 + fi * 0.05), -t * 0.1);
    c += pow(abs(sin(w.x + sin(w.y * 1.3 + t * 0.4) + fbm(w * 0.5) * 2.0) * sin(w.y + sin(w.x * 1.1 - t * 0.3))), 0.25 + fi * 0.1);
  }
  c = pow(c / 3.0, 6.0);
  vec3 col = mix(uC0, uC1, uv.y * 0.8 + 0.2);
  return col + mix(uC2, uC3, c) * c * 1.4 * uIntensity;
}`,
  sky: `vec3 bg(vec2 uv, vec2 p, float t){
  vec3 col = mix(uC1, uC0, smoothstep(-0.5, 0.6, p.y));
  vec2 q = vec2(p.x * 1.4 + t * 0.02, p.y * 2.4);
  float cl = fbm(q * 2.0 + fbm(q * 3.0 + t * 0.01));
  float m = smoothstep(0.45, 0.8, cl) * smoothstep(-0.55, 0.2, p.y);
  vec3 cloud = mix(uC2, uC3, smoothstep(0.5, 0.9, cl));
  col = mix(col, cloud, m * 0.9 * uIntensity);
  col += uC3 * 0.35 * exp(-6.0 * dot(p - vec2(0.15, 0.25), p - vec2(0.15, 0.25)));
  return col;
}`,
  smoke: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 1.6 + vec2(0.0, -t * 0.04);
  vec2 w = vec2(fbm(q + t * 0.03), fbm(q + 4.0 - t * 0.02));
  float n = fbm(q * 1.5 + 2.5 * w);
  vec3 col = uC0 * 0.15;
  col += mix(uC1, uC2, w.x) * pow(n, 2.4) * 1.3 * uIntensity;
  col += uC3 * pow(n, 6.0) * 0.6 * uIntensity;
  return col;
}`,
  holo: `vec3 bg(vec2 uv, vec2 p, float t){
  float n = fbm(p * 1.5 + t * 0.05);
  float a = (p.x + p.y) * 3.0 + n * 4.0 + t * 0.2;
  vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + a * 0.25));
  vec3 col = mix(pal(n), rainbow, 0.45);
  float sheen = pow(0.5 + 0.5 * sin(a * 2.0), 12.0);
  col = mix(col * 0.85, vec3(1.0), sheen * 0.35 * uIntensity);
  return col * (0.7 + 0.3 * uIntensity);
}`,
  tunnel: `vec3 bg(vec2 uv, vec2 p, float t){
  float r = length(p) + 0.001;
  float a = atan(p.y, p.x);
  float z = 0.25 / r + t * 0.5;
  float ring = pow(0.5 + 0.5 * cos(z * 6.2831), 18.0);
  float spoke = pow(0.5 + 0.5 * cos(a * 8.0 + z * 0.8), 30.0);
  float fade = smoothstep(0.0, 0.18, r) * exp(-r * 1.5);
  vec3 col = uC0 * 0.06 + pal(fract(z * 0.1)) * (ring + spoke * 0.5) * fade * 1.3 * uIntensity;
  return col + uC3 * 0.35 * exp(-r * 25.0);
}`,
  warp: `vec3 bg(vec2 uv, vec2 p, float t){
  vec3 col = uC0 * 0.05;
  float a = atan(p.y, p.x) / 6.2831 + 0.5;
  float r = length(p);
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float n = 60.0 + fi * 45.0;
    float id = floor(a * n);
    float h = hash(vec2(id, fi + 1.0));
    float z = fract(h * 7.0 + t * (0.18 + 0.25 * h));
    float head = z * 1.1;
    float len = 0.04 + 0.25 * z * z;
    float along = smoothstep(head - len, head, r) * step(r, head);
    float across = smoothstep(0.5, 0.0, abs(fract(a * n) - 0.5) * 2.0 - 0.15 + 0.0) ;
    col += pal(h) * along * across * z * 1.6 * uIntensity;
  }
  return col + uC3 * 0.3 * exp(-r * 12.0);
}`,
  hex: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 9.0;
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(q, r) - h, b = mod(q - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = q - g;
  float edge = max(dot(abs(g), vec2(0.5, 0.866)), abs(g.x));
  float line = smoothstep(0.44, 0.49, edge);
  float pulse = 0.5 + 0.5 * sin(length(id) * 0.6 - t * 1.2 + hash(floor(id)) * 6.0);
  vec3 col = uC0 * 0.12 + pal(pulse) * pow(pulse, 3.0) * 0.35 * uIntensity;
  return col + uC2 * line * (0.25 + 0.5 * pulse) * uIntensity;
}`,
  halftone: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = rot(0.5) * p * 34.0;
  vec2 cell = fract(q) - 0.5;
  float v = 0.5 + 0.5 * sin(length(p) * 6.0 - t * 0.8 + fbm(p * 2.0) * 3.0);
  float dot1 = smoothstep(v * 0.5 + 0.02, v * 0.5 - 0.02, length(cell));
  return mix(uC0, mix(uC1, uC2, v), dot1 * (0.6 + 0.4 * uIntensity));
}`,
  topo: `vec3 bg(vec2 uv, vec2 p, float t){
  float h = fbm(p * 1.8 + vec2(t * 0.015, 0.0)) * 12.0;
  float l = abs(fract(h) - 0.5);
  float line = smoothstep(0.05, 0.0, l - 0.01);
  float major = smoothstep(0.06, 0.0, abs(fract(h / 5.0) - 0.5) - 0.005);
  vec3 col = uC0;
  col = mix(col, uC1, line * 0.6 * uIntensity);
  return mix(col, uC2, major * 0.8 * uIntensity);
}`,
  matrix: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 grid = vec2(48.0, 80.0);
  vec2 cell = floor(uv * grid);
  float speed = 0.4 + hash(vec2(cell.x, 1.0)) * 0.8;
  float y = fract(cell.y / grid.y + t * speed * 0.25 + hash(vec2(cell.x, 7.0)));
  float trail = pow(y, 6.0);
  float glyph = step(0.45, hash(cell + floor(t * 8.0 * speed)));
  vec2 f = fract(uv * grid);
  float shape = step(0.15, f.x) * step(f.x, 0.85) * step(0.1, f.y) * step(f.y, 0.9);
  vec3 col = uC0 * 0.05 + mix(uC1, uC3, step(0.97, y)) * trail * glyph * shape * 1.3 * uIntensity;
  return col;
}`,
  lava: `vec3 bg(vec2 uv, vec2 p, float t){
  float f = 0.0;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    vec2 c = vec2(0.35 * sin(t * (0.11 + fi * 0.03) + fi * 2.1), 0.42 * sin(t * (0.07 + fi * 0.025) + fi * 1.3));
    float r = 0.08 + 0.05 * hash(vec2(fi, 2.0));
    f += r * r / dot(p - c, p - c);
  }
  float m = smoothstep(0.9, 1.1, f);
  vec3 col = mix(uC0, uC1, uv.y);
  vec3 blob = mix(uC2, uC3, smoothstep(1.0, 3.0, f));
  return mix(col, blob, m * (0.7 + 0.3 * uIntensity)) + uC3 * smoothstep(0.6, 1.0, f) * (1.0 - m) * 0.25;
}`,
  rays: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 src = vec2(-0.25, 0.62);
  vec2 d = p - src;
  float a = atan(d.x, -d.y);
  float r = length(d);
  float beams = pow(0.5 + 0.5 * sin(a * 18.0 + fbm(vec2(a * 3.0, t * 0.1)) * 6.0), 4.0) * 0.6 + pow(0.5 + 0.5 * sin(a * 7.0 - t * 0.15), 6.0) * 0.5;
  vec3 col = mix(uC0, uC0 * 0.3, uv.y * 0.5);
  col += pal(0.6 + 0.3 * sin(a * 2.0)) * beams * exp(-r * 1.2) * 1.2 * uIntensity;
  float dust = step(0.995, hash(floor(uv * uRes / 2.0) + floor(t * 2.0))) * beams;
  return col + uC3 * exp(-r * 6.0) * 0.6 + vec3(dust);
}`,
  ink: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 1.3;
  vec2 w = vec2(fbm(q + vec2(t * 0.03, 0.0)), fbm(q + vec2(5.2, t * 0.025)));
  vec2 w2 = vec2(fbm(q + 3.0 * w + 1.7), fbm(q + 3.0 * w + 9.2));
  float n = fbm(q + 3.5 * w2);
  vec3 col = uC0;
  col = mix(col, uC1, smoothstep(0.35, 0.65, n) * uIntensity);
  col = mix(col, uC2, smoothstep(0.55, 0.85, w2.x) * 0.8 * uIntensity);
  col += uC3 * pow(smoothstep(0.6, 0.95, n), 3.0) * 0.5;
  return col;
}`,
  sunset: `vec3 bg(vec2 uv, vec2 p, float t){
  float y = p.y + 0.03 * sin(p.x * 3.0 + t * 0.2);
  vec3 col = mix(uC3, uC2, smoothstep(-0.2, 0.15, y));
  col = mix(col, uC1, smoothstep(0.05, 0.35, y));
  col = mix(col, uC0, smoothstep(0.3, 0.55, y));
  vec2 sp = p - vec2(0.0, -0.08);
  col += uC3 * 0.8 * smoothstep(0.16, 0.12, length(sp)) * uIntensity + uC3 * 0.35 * exp(-length(sp) * 4.0);
  float sea = step(y, -0.15);
  float sh = 0.5 + 0.5 * sin(p.y * 160.0 + fbm(vec2(p.x * 8.0, t * 0.5)) * 6.0);
  return mix(col, mix(uC0 * 0.6, uC3, smoothstep(0.25, 0.0, abs(p.x)) * sh * 0.8), sea * 0.8);
}`,
  dots: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = p * 22.0;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float wave = 0.5 + 0.5 * sin(length(id) * 0.35 - t * 1.4 + fbm(id * 0.1) * 3.0);
  float r = 0.12 + 0.28 * wave;
  float d = smoothstep(r, r - 0.06, length(f));
  return uC0 * 0.1 + pal(wave) * d * (0.5 + 0.6 * uIntensity);
}`,
  stripes: `vec3 bg(vec2 uv, vec2 p, float t){
  vec2 q = rot(0.6) * p;
  float w = q.x * 14.0 + sin(q.y * 3.0 + t * 0.6) * 1.2 + t * 0.5;
  float s = smoothstep(0.45, 0.55, fract(w));
  float id = floor(w);
  vec3 c = pal(fract(id * 0.137));
  return mix(uC0 * 0.15, c, s * (0.6 + 0.4 * uIntensity));
}`

};

const VERT = 'attribute vec2 q; void main(){ gl_Position = vec4(q, 0.0, 1.0); }';
const MAIN = `
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * ar, uv.y - 0.5);
  p = rot(uAngle) * p / uScale;
  float t = uTime * uSpeed;
  vec3 col = bg(uv, p, t);
  float vig = smoothstep(1.35, 0.25, length((uv - 0.5) * vec2(ar * 0.9, 1.1)));
  col *= 0.72 + 0.28 * vig;
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.012;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

type Prog = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type GL = { canvas: HTMLCanvasElement | OffscreenCanvas; gl: WebGLRenderingContext; progs: Map<string, Prog | null> };
let shared: GL | null | undefined;

function setup(): GL | null {
  if (shared !== undefined) return shared;
  try {
    const canvas: HTMLCanvasElement | OffscreenCanvas | null = typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2) : null;
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false }) as WebGLRenderingContext | null;
    if (!canvas || !gl) { shared = null; return null; }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    shared = { canvas, gl, progs: new Map() };
    if ('addEventListener' in canvas) canvas.addEventListener('webglcontextlost', () => { shared = undefined; });
  } catch {
    shared = null;
  }
  return shared ?? null;
}

/** Les fonds écrits par l'IA restent dans un cadre sûr : pas de directives, longueur bornée. */
export function sanitizeGlsl(src: string): string | null {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
  if (!s || s.length > 4000 || /#|\buniform\b|\bgl_FragColor\b|\bvoid\s+main\b|\bwhile\b/.test(s)) return null;
  return /vec3\s+bg\s*\(\s*vec2\s+\w+\s*,\s*vec2\s+\w+\s*,\s*float\s+\w+\s*\)/.test(s) ? s : `vec3 bg(vec2 uv, vec2 p, float t){\n${s}\n}`;
}

function program(g: GL, kind: BackdropKind, glsl?: string): Prog | null {
  const body = kind === 'custom' ? (glsl ? sanitizeGlsl(glsl) : null) : BODIES[kind];
  if (!body) return null;
  const key = kind === 'custom' ? `custom:${body}` : kind;
  if (g.progs.has(key)) return g.progs.get(key) ?? null;
  const { gl } = g;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, HEADER + body + MAIN);
  let out: Prog | null = null;
  if (vs && fs) {
    const prog = gl.createProgram();
    if (prog) {
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const u: Prog['u'] = {};
        for (const n of ['uRes', 'uTime', 'uC0', 'uC1', 'uC2', 'uC3', 'uSpeed', 'uIntensity', 'uScale', 'uAngle']) u[n] = gl.getUniformLocation(prog, n);
        out = { prog, u };
      }
    }
  }
  g.progs.set(key, out);
  if (g.progs.size > 24) g.progs.delete(g.progs.keys().next().value as string);
  return out;
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt((/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000').slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Dessine le fond dans le contexte 2D (repère W × H). `pixels` = définition du
 * rendu GPU (la vraie taille de sortie, réduite pour l'aperçu). Renvoie false
 * si WebGL est indisponible ou si un fond « custom » ne compile pas.
 */
export function drawBackdrop(ctx: CanvasRenderingContext2D, b: Backdrop, t: number, W: number, H: number, pixels: { w: number; h: number }, fallbackColors: string[]): boolean {
  const g = setup();
  if (!g) return false;
  const p = program(g, b.kind, b.glsl) ?? (b.kind === 'custom' ? program(g, 'silk') : null);
  if (!p) return false;
  const { gl, canvas } = g;
  const w = Math.max(16, Math.round(pixels.w));
  const h = Math.max(16, Math.round(pixels.h));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(p.prog);
  const loc = gl.getAttribLocation(p.prog, 'q');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const cols = [...(b.colors ?? []), ...fallbackColors].filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  while (cols.length < 4) cols.push(cols[cols.length - 1] ?? '#7c5cff');
  gl.uniform2f(p.u.uRes, w, h);
  gl.uniform1f(p.u.uTime, t);
  (['uC0', 'uC1', 'uC2', 'uC3'] as const).forEach((n, i) => gl.uniform3fv(p.u[n], rgb(cols[i])));
  gl.uniform1f(p.u.uSpeed, b.speed ?? 1);
  gl.uniform1f(p.u.uIntensity, b.intensity ?? 1);
  gl.uniform1f(p.u.uScale, Math.max(0.15, b.scale ?? 1));
  gl.uniform1f(p.u.uAngle, ((b.angle ?? 0) * Math.PI) / 180);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, W, H);
  ctx.restore();
  return true;
}
