'use client';

import { AudioWaveform, Crop, Gauge, MousePointerClick, Type, ZoomIn } from 'lucide-react';

import { CaptionLine, useKaraoke } from './caption-preview';
import { SectionHeading } from './section-heading';
import { useSpotlight } from './use-spotlight';
import { Stagger, StaggerItem, Tilt } from './motion';

export function FeatureBento() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Fonctionnalités"
          title={<>Le montage d'un pro. <span className="text-fg-muted">Sans la timeline.</span></>}
          description="Tout ce qui fait qu'un short retient le spectateur, appliqué automatiquement à chaque clip — et modifiable à la main quand vous le voulez."
        />

        <Stagger className="mt-16 grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="md:col-span-2 lg:row-span-2" icon={Gauge} title="Les moments forts, notés sur 100"
            text="L'IA lit la transcription horodatée et retient les extraits autonomes : accroche dès la première phrase, une idée complète, une chute nette. Les bornes sont recalées sur de vraies phrases.">
            <MomentsVisual />
          </Card>
          <Card icon={Type} title="Sous-titres mot à mot" text="Chaque mot s'allume à l'instant exact où il est prononcé. 6 styles, couleurs libres.">
            <CaptionsVisual />
          </Card>
          <Card icon={AudioWaveform} title="Silences coupés" text="Les blancs et hésitations disparaissent : le rythme reste soutenu.">
            <SilenceVisual />
          </Card>
          <Card icon={Crop} title="Cadrage 9:16" text="Plein cadre, ou vidéo entière sur fond flou.">
            <CropVisual />
          </Card>
          <Card icon={ZoomIn} title="Accroche & zooms" text="Titre d'accroche animé et zooms dynamiques sur les temps forts.">
            <HookVisual />
          </Card>
          <Card icon={MousePointerClick} title="Studio d'édition" text="Ajustez l'entrée, la sortie et le texte ; zones de sécurité TikTok visibles.">
            <EditorVisual />
          </Card>
        </Stagger>
      </div>
    </section>
  );
}

type CardProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
};

function Card({ icon: Icon, title, text, className = '', children }: CardProps) {
  const onMove = useSpotlight<HTMLElement>();
  return (
    <StaggerItem className={className}>
    <Tilt className="h-full rounded-3xl" max={4}>
    <article onPointerMove={onMove} className="izi-card group flex h-full flex-col overflow-hidden rounded-3xl p-6">
      <div className="relative flex min-h-[120px] flex-1 items-center justify-center">{children}</div>
      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
          <Icon className="h-4 w-4 text-neon" aria-hidden />
          {title}
        </h3>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">{text}</p>
      </div>
    </article>
    </Tilt>
    </StaggerItem>
  );
}

/* ---------- Visuels (décoratifs, aria-hidden) ---------- */

function MomentsVisual() {
  const rows = [
    { t: '"Personne ne te dit ça sur TikTok…"', s: 91 },
    { t: '"Voilà l\'erreur qui tue ta rétention"', s: 84 },
    { t: '"Ma routine de montage en 10 minutes"', s: 78 },
    { t: '"Bon, on se retrouve la semaine pro…"', s: 22, cut: true },
  ];
  return (
    <div aria-hidden className="w-full max-w-xl space-y-2.5">
      {rows.map((r) => (
        <div key={r.t} className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition-all duration-300 ${r.cut ? 'border-line opacity-40 line-through decoration-fg-subtle' : 'border-line bg-white/[0.02] group-hover:border-line-strong'}`}>
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.t}</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:w-36">
            <span className="block h-full rounded-full bg-neon transition-all duration-700 group-hover:brightness-110" style={{ width: `${r.s}%`, opacity: r.cut ? 0.4 : 1 }} />
          </span>
          <span className="w-7 text-right font-code text-sm font-semibold text-fg">{r.s}</span>
        </div>
      ))}
    </div>
  );
}

function CaptionsVisual() {
  const { words, active } = useKaraoke(undefined, 420);
  return (
    <div aria-hidden className="w-full rounded-2xl border border-line bg-ink-950/60 px-4 py-6 text-lg">
      <CaptionLine template="karaoke_box" words={words} active={active} />
    </div>
  );
}

function SilenceVisual() {
  const bars = Array.from({ length: 40 }, (_, i) => {
    const silent = (i > 11 && i < 17) || (i > 27 && i < 31);
    return { h: silent ? 6 : 25 + Math.round(Math.abs(Math.sin(i * 1.3)) * 70), silent };
  });
  return (
    <div aria-hidden className="flex h-20 w-full items-center gap-[3px]">
      {bars.map((b, i) => (
        <span key={i}
          className={`flex-1 rounded-full transition-all duration-500 ${b.silent ? 'bg-rec/50 group-hover:max-w-0 group-hover:opacity-0' : 'bg-cyan/70'}`}
          style={{ height: `${b.h}%`, maxWidth: b.silent ? '12px' : undefined }} />
      ))}
    </div>
  );
}

function CropVisual() {
  return (
    <div aria-hidden className="flex items-end gap-4">
      <div className="relative h-28 w-16 overflow-hidden rounded-lg border border-neon/50 bg-ink-800">
        <span className="absolute left-1/2 top-7 h-6 w-6 -translate-x-1/2 rounded-full bg-white/20" />
        <span className="absolute bottom-0 left-1/2 h-12 w-12 -translate-x-1/2 rounded-t-full bg-white/15" />
      </div>
      <div className="relative h-28 w-16 overflow-hidden rounded-lg border border-line-strong bg-ink-800">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgb(61_224_255/0.25),transparent_70%)] blur-sm" />
        <span className="absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 border-y border-white/20 bg-ink-900" />
      </div>
    </div>
  );
}

function HookVisual() {
  return (
    <div aria-hidden className="relative h-28 w-full overflow-hidden rounded-2xl border border-line bg-ink-950/60">
      <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-xs font-extrabold text-ink-950 transition-transform duration-500 group-hover:scale-110">
        3 erreurs qui tuent ta vidéo
      </span>
      <span className="absolute bottom-0 left-1/2 h-16 w-16 -translate-x-1/2 rounded-t-full bg-white/15 transition-transform duration-700 group-hover:scale-125" />
    </div>
  );
}

function EditorVisual() {
  return (
    <div aria-hidden className="w-full">
      <div className="relative h-12 rounded-lg border border-line bg-ink-950/70">
        <span className="absolute inset-y-0 left-[22%] right-[30%] rounded-md border-2 border-neon bg-neon/10 transition-all duration-500 group-hover:left-[16%] group-hover:right-[24%]">
          <span className="absolute -left-1 top-1/2 h-6 w-2 -translate-y-1/2 rounded bg-neon" />
          <span className="absolute -right-1 top-1/2 h-6 w-2 -translate-y-1/2 rounded bg-neon" />
        </span>
      </div>
      <div className="mt-2 flex justify-between font-code text-[10px] text-fg-subtle">
        <span>IN 12:04.3</span><span>OUT 12:41.8</span>
      </div>
    </div>
  );
}
