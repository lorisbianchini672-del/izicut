'use client';

/**
 * Fond « premium » du site : soie de lumière (shader WebGL). Des voiles
 * violets / indigo, rehaussés d'un filet ambré, se plient lentement comme un
 * tissu ; un halo suit le curseur ; grain fin et vignette pour la profondeur.
 *
 * Fluide partout : rendu à demi-définition (le shader est doux, l'agrandissement
 * est invisible), 30 images/s maximum, en pause onglet caché, image fixe si
 * l'utilisateur préfère moins d'animations, repli Canvas 2D sans WebGL.
 */
import { useEffect, useRef, useState } from 'react';

import { LiquidLight } from './LiquidLight';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
// Bruit de valeur 2D lissé + fBm : base des plis de la soie.
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8); for (int i = 0; i < 4; i++){ v += a * noise(p); p = r * p * 2.02; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * ar, uv.y - 0.5);
  float t = uTime * 0.04;
  // Grandes ondulations lentes (basse fréquence = rendu soyeux, pas « fumée »).
  vec2 w = vec2(fbm(p * 0.55 + vec2(0.0, t)), fbm(p * 0.55 + vec2(4.1, -t * 0.8)));
  float f = fbm(p * 0.75 + 1.25 * w + vec2(t * 0.3, 0.0));
  // Plis du tissu : une onde diagonale déformée par le champ f.
  float phase = dot(p, vec2(0.55, 0.95)) * 4.2 + f * 6.0 - uTime * 0.07;
  float fold = 0.5 + 0.5 * sin(phase);
  float body = pow(fold, 3.2);                 // volume large et doux
  float spec = pow(fold, 70.0);                // reflet fin et net sur l'arête du pli
  float spec2 = pow(0.5 + 0.5 * sin(phase * 0.5 + 1.3 + f * 2.0), 60.0);
  // Les voiles occupent le haut / la droite : le contenu (gauche, bas) reste lisible.
  float zone = smoothstep(-0.45, 0.55, p.y * 0.95 + (p.x / ar) * 0.55);
  zone = 0.1 + 0.9 * zone;
  vec3 base = vec3(0.016, 0.012, 0.045);
  vec3 deep = vec3(0.09, 0.06, 0.28);
  vec3 violet = vec3(0.47, 0.33, 0.98);
  vec3 orchid = vec3(0.82, 0.45, 1.0);
  vec3 pearl = vec3(0.93, 0.90, 1.0);
  vec3 amber = vec3(1.0, 0.70, 0.40);
  // Teinte qui glisse du violet à l'orchidée selon le pli : reflets irisés.
  vec3 tint = mix(violet, orchid, smoothstep(0.35, 0.75, f));
  vec3 col = base;
  col = mix(col, deep, (0.55 + 0.45 * f) * zone);
  col += tint * body * 0.36 * zone;
  col += pearl * spec * 0.7 * zone;
  col += amber * spec2 * 0.45 * zone * smoothstep(0.3, 0.8, w.x);
  // Second voile, plus fin et croisé : profondeur, reflets orchidée / ambre.
  float phase2 = dot(p, vec2(-0.85, 0.5)) * 3.1 + f * 4.5 + uTime * 0.05;
  float fold2 = 0.5 + 0.5 * sin(phase2);
  col += mix(orchid, amber, smoothstep(0.2, 0.9, w.y)) * pow(fold2, 9.0) * 0.16 * zone;
  col += pearl * pow(fold2, 80.0) * 0.22 * zone;
  // Lueur profonde en bas à gauche : le bas de page n'est jamais un aplat.
  col += deep * 0.9 * exp(-3.0 * dot(p - vec2(-0.6 * ar, -0.55), p - vec2(-0.6 * ar, -0.55)));
  // Halo du curseur, très discret.
  vec2 m = vec2((uMouse.x - 0.5) * ar, uMouse.y - 0.5);
  col += violet * 0.07 * exp(-5.0 * dot(p - m, p - m));
  // Vignette profonde + léger grain anti-banding.
  float vig = smoothstep(1.3, 0.2, length(p * vec2(0.8, 1.05)));
  col *= 0.5 + 0.5 * vig;
  col = col / (1.0 + col * 0.35);              // tonemapping doux : pas de blanc cramé
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}`;

export function Aurora() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) { setFallback(true); return; }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) { setFallback(true); return; }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFallback(true); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) < 4 || window.innerWidth < 700;
    const frameMs = 1000 / (lowPower ? 24 : 30);
    const mouse = { x: 0.72, y: 0.7, tx: 0.72, ty: 0.7 };
    const start = performance.now() - 40_000 * Math.random();
    let raf = 0;
    let last = 0;
    let running = true;

    const resize = () => {
      // Demi-définition (et jamais au-delà de 1 px par pixel CSS) : le rendu reste net et léger.
      const k = lowPower ? 0.35 : 0.5;
      canvas.width = Math.max(2, Math.round(window.innerWidth * k));
      canvas.height = Math.max(2, Math.round(window.innerHeight * k));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (now: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (now - last < frameMs) return;
      last = now;
      draw(now);
    };
    const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / window.innerWidth; mouse.ty = 1 - e.clientY / window.innerHeight; };
    const onVisibility = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!reduce && !running) { running = true; raf = requestAnimationFrame(loop); }
    };
    const onLost = (e: Event) => { e.preventDefault(); running = false; cancelAnimationFrame(raf); setFallback(true); };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', onLost);
    if (reduce) draw(start + 30_000);
    else {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  if (fallback) return <LiquidLight />;
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
