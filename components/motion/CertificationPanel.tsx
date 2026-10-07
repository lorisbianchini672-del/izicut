'use client';

/**
 * « Certifiée IziCut » : contrôle qualité en direct de la pub, correction en
 * un clic, puis texte de publication (légende, hashtags, 1er commentaire).
 * Le client repart avec une publication complète et prête à poster.
 */
import { useMemo, useState } from 'react';
import { BadgeCheck, Check, Copy, Download, Loader2, Sparkles, Wand2, X } from 'lucide-react';

import { autoFix, checkQuality, CERTIFIED_SCORE } from '@/lib/motion/quality';
import type { MotionProject } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

type Caption = { caption: string; hashtags: string[]; first_comment: string; tip: string };
const PLATFORMS = [
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube']
] as const;

export function CertificationPanel({
  project,
  onFix,
  hasLogo,
  link,
  notes,
  concept,
  loggedIn,
  onExport,
  exporting
}: {
  project: MotionProject;
  onFix: (p: MotionProject) => void;
  hasLogo: boolean;
  link?: string;
  notes?: string;
  concept?: string;
  loggedIn: boolean | null;
  onExport: () => void;
  exporting: number | null;
}) {
  const report = useMemo(() => checkQuality(project, { hasLogo }), [project, hasLogo]);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number][0]>('instagram');
  const [caption, setCaption] = useState<Caption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const failing = report.checks.filter((c) => !c.ok);
  const fixable = failing.some((c) => c.fixable);

  const R = 34;
  const C = 2 * Math.PI * R;
  const color = report.certified ? '#a990ff' : report.score >= 65 ? '#ffbe76' : '#ff5c93';

  const generate = async () => {
    if (!loggedIn) { setError('Connectez-vous (gratuit) pour générer le texte.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/motion/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, platform, link: link || undefined, notes: notes || undefined, concept: concept || undefined })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.caption) throw new Error(json.error ?? 'L’IA n’a pas pu répondre.');
      setCaption(json as Caption);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de l’IA.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1500); } catch { /* presse-papiers refusé */ }
  };

  return (
    <div className="izi-card mt-4 w-full max-w-2xl rounded-3xl p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
            <circle cx="40" cy="40" r={R} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="7" />
            <circle cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - report.score / 100)} style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.4s' }} />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-display text-xl font-bold text-fg">{report.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          {report.certified ? (
            <p className="flex items-center gap-1.5 font-display text-lg font-semibold text-fg">
              <BadgeCheck className="h-5 w-5 text-neon" /> Certifiée IziCut
            </p>
          ) : (
            <p className="font-display text-lg font-semibold text-fg">Contrôle qualité</p>
          )}
          <p className="text-xs text-fg-muted">
            {report.certified
              ? 'Votre pub respecte les règles d’une agence : prête à publier.'
              : `${failing.length} point${failing.length > 1 ? 's' : ''} à améliorer pour obtenir la certification (${CERTIFIED_SCORE}/100).`}
          </p>
          {fixable ? (
            <button type="button" onClick={() => onFix(autoFix(project, { link }))} className="izi-cta mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold">
              <Wand2 className="h-3.5 w-3.5" /> Corriger automatiquement
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {report.checks.map((c) => (
          <li key={c.id} className={cn('flex items-start gap-2 rounded-xl px-2.5 py-1.5 text-xs', c.ok ? 'text-fg-muted' : 'bg-rec/[0.06] text-fg')} title={c.ok ? undefined : c.tip}>
            {c.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rec" />}
            <span>
              {c.label}
              {!c.ok ? <span className="block text-[11px] text-fg-subtle">{c.tip}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-sm font-semibold text-fg">Texte de publication</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PLATFORMS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPlatform(id)} className={cn('cursor-pointer rounded-full border px-2.5 py-1 text-xs transition', platform === id ? 'border-neon bg-neon/15 text-neon' : 'border-line text-fg-muted hover:text-fg')}>
              {label}
            </button>
          ))}
          <button type="button" onClick={generate} disabled={busy} className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-neon/40 px-3 py-1 text-xs font-semibold text-neon disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {caption ? 'Régénérer' : 'Générer le texte'}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        {caption ? (
          <div className="mt-3 space-y-2 text-sm">
            <Block label="Légende" text={caption.caption} copied={copied === 'c'} onCopy={() => copy('c', `${caption.caption}\n\n${caption.hashtags.map((h) => `#${h}`).join(' ')}`)} />
            <Block label="Hashtags" text={caption.hashtags.map((h) => `#${h}`).join(' ')} copied={copied === 'h'} onCopy={() => copy('h', caption.hashtags.map((h) => `#${h}`).join(' '))} />
            {caption.first_comment ? <Block label="1er commentaire à épingler" text={caption.first_comment} copied={copied === 'f'} onCopy={() => copy('f', caption.first_comment)} /> : null}
            {caption.tip ? <p className="rounded-xl bg-neon/[0.06] px-3 py-2 text-xs text-fg-muted"><span className="font-semibold text-neon">Conseil : </span>{caption.tip}</p> : null}
          </div>
        ) : null}
      </div>

      <button type="button" onClick={onExport} disabled={exporting !== null} className="izi-cta mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold disabled:opacity-60">
        <Download className="h-4 w-4" /> {exporting !== null ? `Export… ${exporting} %` : report.certified ? 'Télécharger ma pub certifiée' : 'Télécharger la vidéo'}
      </button>
    </div>
  );
}

function Block({ label, text, copied, onCopy }: { label: string; text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</span>
        <button type="button" onClick={onCopy} className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-fg-muted hover:text-fg">
          {copied ? <Check className="h-3 w-3 text-neon" /> : <Copy className="h-3 w-3" />} {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="whitespace-pre-line text-fg">{text}</p>
    </div>
  );
}
