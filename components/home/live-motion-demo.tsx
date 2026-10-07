'use client';

/**
 * Démo vivante de la page d'accueil : une vraie pub en motion design, rendue
 * par le moteur du Studio, que le visiteur personnalise en direct (secteur,
 * nom, couleurs, style). Il peut ensuite la reprendre dans le Studio.
 */
import { Montserrat } from 'next/font/google';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';

import { drawFrame } from '@/lib/motion/render';
import { SoundPlayer, renderSoundtrack } from '@/lib/motion/sound';
import { FORMAT_SIZE, THEME_PRESETS, totalDuration, type MotionProject } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

const font = Montserrat({ subsets: ['latin'], weight: ['800', '900'], display: 'swap' });
const STUDIO_KEY = 'izicut-motion-project-v1';

type Sector = {
  id: string;
  label: string;
  name: string;
  motif: NonNullable<MotionProject['theme']['motif']>;
  transition: NonNullable<MotionProject['transition']>;
  sound: NonNullable<MotionProject['sound']>;
  scenes: (n: string) => MotionProject['scenes'];
};

const SECTORS: Sector[] = [
  {
    id: 'boulangerie',
    label: 'Boulangerie',
    name: 'Maison Dupain',
    motif: 'grain',
    transition: 'slide',
    sound: { music: 'acoustic', bpm: 100 },
    scenes: (n) => [
      { type: 'title', duration: 2.6, title: 'Le vrai pain, *chaque matin*', subtitle: n, magic: [{ kind: 'emoji', text: '', emoji: '🥖', at: 0.3 }] },
      { type: 'bullets', duration: 3.6, title: 'Fait *maison*', items: ['Levain naturel', 'Viennoiseries du jour', 'Sandwichs le midi'], magic: [{ kind: 'badge', text: 'Fait maison', at: 0.6 }] },
      { type: 'stat', duration: 2.6, value: 6, suffix: 'h', label: 'le four est chaud dès' },
      { type: 'cta', duration: 2.8, title: 'On vous attend *ce matin*', button: n, magic: [{ kind: 'sticker', text: 'Lien en bio', emoji: '👇', at: 0.6 }] }
    ]
  },
  {
    id: 'association',
    label: 'Association',
    name: 'Les Amis du Quartier',
    motif: 'confetti',
    transition: 'flash',
    sound: { music: 'pop', bpm: 118 },
    scenes: (n) => [
      { type: 'title', duration: 2.6, title: 'Ensemble, on va *plus loin*', subtitle: n, magic: [{ kind: 'emoji', text: '', emoji: '🤝', at: 0.3 }] },
      { type: 'stat', duration: 2.8, value: 250, suffix: '+', label: 'bénévoles engagés' },
      { type: 'bullets', duration: 3.6, title: 'Rejoignez-*nous*', items: ['Événements chaque mois', 'Aide aux familles', 'Ouvert à tous'] },
      { type: 'cta', duration: 2.8, title: 'Devenez *bénévole*', button: 'Adhérer', magic: [{ kind: 'sticker', text: 'Lien en bio', emoji: '👇', at: 0.6 }] }
    ]
  },
  {
    id: 'coiffure',
    label: 'Salon de coiffure',
    name: 'Studio Lumière',
    motif: 'sparkles',
    transition: 'wipe',
    sound: { music: 'chill', bpm: 88 },
    scenes: (n) => [
      { type: 'title', duration: 2.6, title: 'Votre style, *sublimé*', subtitle: n, magic: [{ kind: 'emoji', text: '', emoji: '💇‍♀️', at: 0.3 }] },
      { type: 'quote', duration: 3.4, text: 'Je ressors à chaque fois avec *le sourire*.', author: 'Exemple d’avis client' },
      { type: 'stat', duration: 2.6, value: -20, suffix: '%', label: 'sur votre 1re visite' },
      { type: 'cta', duration: 2.8, title: 'Réservez *en ligne*', button: n, magic: [{ kind: 'notification', text: 'Rendez-vous confirmé', sub: n, emoji: '✂️', at: 0.4 }] }
    ]
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    name: 'La Table d’Ici',
    motif: 'waves',
    transition: 'zoom',
    sound: { music: 'hiphop', bpm: 92 },
    scenes: (n) => [
      { type: 'title', duration: 2.6, title: 'Une cuisine *de saison*', subtitle: n, magic: [{ kind: 'emoji', text: '', emoji: '🍝', at: 0.3 }] },
      { type: 'bullets', duration: 3.6, title: 'Au menu', items: ['Produits locaux', 'Plat du jour à 14 €', 'Terrasse ensoleillée'] },
      { type: 'quote', duration: 3.2, text: 'Le meilleur *déjeuner* du quartier.', author: 'Exemple d’avis client' },
      { type: 'cta', duration: 2.8, title: 'Réservez *votre table*', button: n, magic: [{ kind: 'notification', text: 'Table réservée', sub: n, emoji: '🍽️', at: 0.4 }] }
    ]
  }
];

const STYLES: { id: MotionProject['theme']['style']; label: string }[] = [
  { id: 'neon', label: 'Néon' },
  { id: 'clean', label: 'Épuré' },
  { id: 'bold', label: 'Marqueur' }
];

export function LiveMotionDemo() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sector, setSector] = useState(SECTORS[0]);
  const [name, setName] = useState('');
  const [themeIndex, setThemeIndex] = useState(0);
  const [style, setStyle] = useState<MotionProject['theme']['style']>('neon');
  const [progress, setProgress] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;
  const playerRef = useRef<SoundPlayer | null>(null);
  if (!playerRef.current && typeof window !== 'undefined') playerRef.current = new SoundPlayer();

  const brandName = name.trim() || sector.name;
  const project: MotionProject = useMemo(
    () => ({
      format: '9:16',
      brand: brandName.slice(0, 40),
      theme: { ...THEME_PRESETS[themeIndex].theme, style, motif: sector.motif },
      transition: sector.transition,
      sound: sector.sound,
      scenes: sector.scenes(brandName.slice(0, 30))
    }),
    [brandName, sector, themeIndex, style]
  );
  const projectRef = useRef(project);
  projectRef.current = project;
  const timeRef = useRef(0);

  // Chaque changement relance l'animation depuis le début : on voit l'effet.
  useEffect(() => { timeRef.current = 0; }, [sector, themeIndex, style]);
  useEffect(() => {
    let alive = true;
    renderSoundtrack(project).then((buf) => { if (alive) playerRef.current?.setBuffer(buf); });
    return () => { alive = false; };
  }, [project]);
  useEffect(() => () => playerRef.current?.stop(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    if (wrapRef.current) io.observe(wrapRef.current);
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible) playerRef.current?.stop();
      if (visible) {
        const total = totalDuration(projectRef.current);
        if (!reduce) timeRef.current = (timeRef.current + dt) % total;
        else timeRef.current = 1.6;
        drawFrame(ctx, projectRef.current, timeRef.current, {}, { fontFamily: font.style.fontFamily });
        playerRef.current?.sync(timeRef.current, !reduce, soundOnRef.current);
        if (now - lastUi > 120) { lastUi = now; setProgress(timeRef.current / total); }
      }
      raf = requestAnimationFrame(loop);
    };
    document.fonts.load(`900 40px ${font.style.fontFamily}`).catch(() => undefined).finally(() => { raf = requestAnimationFrame(loop); });
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const openInStudio = () => {
    try { window.localStorage.setItem(STUDIO_KEY, JSON.stringify(project)); } catch { /* stockage indisponible */ }
    router.push('/studio');
  };

  const { width, height } = FORMAT_SIZE['9:16'];

  return (
    <div ref={wrapRef} className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-5 sm:flex-row sm:items-stretch">
      {/* Téléphone */}
      <div className="relative w-[230px] shrink-0 sm:w-[250px]">
        <div className="izi-glow-frame p-[3px]"><div className="rounded-[2.1rem] bg-[#05040f] p-2">
          <div className="relative overflow-hidden rounded-[1.7rem]" style={{ aspectRatio: `${width} / ${height}` }}>
            <canvas ref={canvasRef} width={width} height={height} className="block h-full w-full" aria-label={`Pub animée pour ${brandName}`} />
            <button
              type="button"
              onClick={() => { void playerRef.current?.unlock(); setSoundOn((v) => !v); }}
              className="absolute bottom-3 right-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
              aria-label={soundOn ? 'Couper le son' : 'Écouter la musique et les effets'}
              title={soundOn ? 'Couper le son' : 'Écouter la musique et les effets'}
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <div className="absolute inset-x-3 top-2.5 h-[3px] overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Personnalisation en direct */}
      <div className="izi-card flex w-full flex-col gap-4 rounded-3xl p-4 backdrop-blur-xl">
        <p className="font-code text-[11px] uppercase tracking-[0.18em] text-fg-subtle">Essayez : tout se modifie</p>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg-muted">Votre activité</p>
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSector(s); setName(''); }} className={cn('cursor-pointer rounded-full border px-2.5 py-1 text-xs transition', sector.id === s.id ? 'border-neon bg-neon/15 text-neon' : 'border-line text-fg-muted hover:text-fg')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Votre nom</span>
          <input
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder={sector.name}
            className="w-full rounded-xl border border-line bg-black/40 px-3 py-2 text-sm text-fg outline-none transition focus:border-neon/60"
          />
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg-muted">Couleurs</p>
          <div className="flex gap-2">
            {THEME_PRESETS.map((p, i) => (
              <button
                key={p.name}
                type="button"
                title={p.name}
                aria-label={`Couleurs ${p.name}`}
                onClick={() => setThemeIndex(i)}
                className={cn('grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 transition', themeIndex === i ? 'scale-110 border-white' : 'border-transparent opacity-80 hover:opacity-100')}
                style={{ background: p.theme.background }}
              >
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.theme.primary }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg-muted">Style d’animation</p>
          <div className="grid grid-cols-3 gap-1.5">
            {STYLES.map((s) => (
              <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={cn('cursor-pointer rounded-lg border py-1.5 text-xs transition', style === s.id ? 'border-neon bg-neon/15 text-neon' : 'border-line text-fg-muted hover:text-fg')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={openInStudio} className="izi-cta mt-auto flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition hover:brightness-110">
          Continuer dans le Studio <ArrowRight className="h-4 w-4" />
        </button>
        <p className="-mt-2 text-center text-[11px] text-fg-subtle">Ajoutez vos photos, vidéos et logo · l’IA fait le reste</p>
      </div>
    </div>
  );
}
