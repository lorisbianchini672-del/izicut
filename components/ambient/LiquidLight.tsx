'use client';

/**
 * Lumière liquide en fond de site : rubans lumineux qui ondulent lentement et
 * un halo qui suit le curseur. Dessiné en très basse définition puis agrandi
 * (flou naturel, quasi gratuit pour le GPU), 30 images/s maximum, en pause
 * quand l'onglet est caché, figé si l'utilisateur préfère moins d'animations.
 */
import { useEffect, useRef } from 'react';

type Ribbon = { a: string; b: string; amp: number; th: number; speed: number; off: number };

const RIBBONS: Ribbon[] = [
  { a: '124,92,240', b: '169,144,255', amp: 0.12, th: 0.16, speed: 0.07, off: 0 },
  { a: '255,190,118', b: '255,140,90', amp: 0.09, th: 0.08, speed: 0.09, off: 0.24 },
  { a: '99,102,241', b: '56,189,248', amp: 0.14, th: 0.1, speed: 0.05, off: -0.22 },
  { a: '230,220,255', b: '255,255,255', amp: 0.07, th: 0.025, speed: 0.11, off: 0.08 }
];

export function LiquidLight() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) < 4;
    const frameMs = 1000 / (lowPower ? 20 : 30);
    let raf = 0;
    let last = 0;
    let running = true;
    const mouse = { x: 0.7, y: 0.3, tx: 0.7, ty: 0.3 };

    const resize = () => {
      // 1 pixel de canvas pour ~7 pixels d'écran : le navigateur lisse l'agrandissement.
      canvas.width = Math.max(64, Math.round(window.innerWidth / 7));
      canvas.height = Math.max(64, Math.round(window.innerHeight / 7));
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const w = canvas.width;
      const h = canvas.height;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const N = 36;
      for (const [ri, r] of RIBBONS.entries()) {
        const ph = t * r.speed * 6 + ri * 1.7;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const wave = Math.sin(u * Math.PI * 2.1 + ph) * r.amp + Math.sin(u * 5.1 - ph * 1.2) * r.amp * 0.35;
          const x = (-0.15 + 1.3 * u + r.off * 0.5) * w;
          const y = (0.95 - 0.9 * u + r.off + wave) * h;
          const th = r.th * Math.min(w, h) * (0.35 + 0.65 * Math.sin(Math.PI * u)) * (0.8 + 0.2 * Math.sin(ph + u * 4));
          pts.push([x, y, th]);
        }
        for (const [k, alpha] of [[1, 0.13], [0.5, 0.2], [0.18, 0.32]] as const) {
          const g = ctx.createLinearGradient(0, h, w, 0);
          g.addColorStop(0, `rgba(${r.a},0)`);
          g.addColorStop(0.4, `rgba(${r.a},${alpha})`);
          g.addColorStop(0.75, `rgba(${r.b},${alpha * 0.9})`);
          g.addColorStop(1, `rgba(${r.b},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          pts.forEach(([x, y, th], i) => (i ? ctx.lineTo(x - th * 0.6 * k, y - th * 0.8 * k) : ctx.moveTo(x - th * 0.6 * k, y - th * 0.8 * k)));
          for (let i = pts.length - 1; i >= 0; i--) { const [x, y, th] = pts[i]; ctx.lineTo(x + th * 0.3 * k, y + th * 0.4 * k); }
          ctx.closePath();
          ctx.fill();
        }
      }
      // Halo qui suit doucement le curseur.
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      const gx = mouse.x * w;
      const gy = mouse.y * h;
      const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.35);
      halo.addColorStop(0, 'rgba(169,144,255,0.16)');
      halo.addColorStop(1, 'rgba(169,144,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    };

    const loop = (time: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (time - last < frameMs) return;
      last = time;
      draw(time);
    };

    const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / window.innerWidth; mouse.ty = e.clientY / window.innerHeight; };
    const onVisibility = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!reduce && !running) { running = true; raf = requestAnimationFrame(loop); }
    };

    resize();
    window.addEventListener('resize', resize);
    if (reduce) {
      draw(12_000);
    } else {
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
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full opacity-80" />;
}
