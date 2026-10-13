'use client';

import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import type { AiPrefs } from '@/lib/motion/prefs';
import { TRANSITIONS, TRANSITION_LABELS } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

/** Réglages de l'IA du Studio : le client choisit le ton, le rythme, la durée, le style, les textes animés… */

const KEY = 'izicut-ai-prefs';
export function loadPrefs(): AiPrefs {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as AiPrefs; } catch { return {}; }
}
function savePrefs(p: AiPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* navigateur sans stockage : réglages gardés le temps de la visite */ }
}

const TONES: [NonNullable<AiPrefs['tone']>, string][] = [['pro', 'Pro'], ['fun', 'Drôle'], ['luxe', 'Luxe'], ['urgent', 'Promo urgente'], ['chaleureux', 'Chaleureux'], ['inspirant', 'Inspirant']];
const PACES: [NonNullable<AiPrefs['pace']>, string][] = [['calme', 'Calme'], ['dynamique', 'Dynamique'], ['rapide', 'Très rapide']];
const DURATIONS = [6, 10, 15, 20, 30];
const LOOKS: [NonNullable<AiPrefs['look']>, string][] = [['sombre', 'Sombre premium'], ['clair', 'Clair épuré'], ['colore', 'Coloré pop'], ['neon', 'Néon']];
const TEXTS: [NonNullable<AiPrefs['textStyles']>[number], string][] = [['highlight', 'Surligné'], ['stack', 'Lignes géantes'], ['echo', 'Écho'], ['type', 'Machine à écrire'], ['wave', 'Vague'], ['karaoke', 'Karaoké'], ['push', 'Poussé'], ['blur', 'Flou → net'], ['mask', 'Masque'], ['slam', 'Impact']];

function Chips<T extends string | number>({ items, value, onPick }: { items: [T, string][]; value: T | undefined; onPick: (v: T | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([v, t]) => (
        <button key={String(v)} type="button" onClick={() => onPick(value === v ? undefined : v)} className={cn('cursor-pointer rounded-full border px-2.5 py-1 text-xs transition', value === v ? 'border-neon bg-neon/10 text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}>{t}</button>
      ))}
    </div>
  );
}

export function AiPrefsPanel({ prefs, onChange }: { prefs: AiPrefs; onChange: (p: AiPrefs) => void }) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<AiPrefs>) => { const next = { ...prefs, ...patch }; (Object.keys(next) as (keyof AiPrefs)[]).forEach((k) => next[k] === undefined && delete next[k]); onChange(next); savePrefs(next); };
  const count = Object.keys(prefs).length;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-fg">
        <span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-neon" /> Personnaliser l’IA</span>
        <span className="text-xs font-normal text-fg-subtle">{count ? `${count} réglage${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}` : 'Par défaut'} {open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-white/10 p-3 text-xs">
          <div><p className="mb-1.5 text-fg-subtle">Ton</p><Chips items={TONES} value={prefs.tone} onPick={(v) => set({ tone: v })} /></div>
          <div><p className="mb-1.5 text-fg-subtle">Rythme</p><Chips items={PACES} value={prefs.pace} onPick={(v) => set({ pace: v })} /></div>
          <div><p className="mb-1.5 text-fg-subtle">Durée</p><Chips items={DURATIONS.map((d) => [d, `${d} s`] as [number, string])} value={prefs.duration} onPick={(v) => set({ duration: v })} /></div>
          <div><p className="mb-1.5 text-fg-subtle">Style visuel</p><Chips items={LOOKS} value={prefs.look} onPick={(v) => set({ look: v })} /></div>
          <div>
            <p className="mb-1.5 text-fg-subtle">Textes animés préférés (plusieurs possibles)</p>
            <div className="flex flex-wrap gap-1.5">
              {TEXTS.map(([v, t]) => {
                const on = prefs.textStyles?.includes(v) ?? false;
                return <button key={v} type="button" onClick={() => { const cur = prefs.textStyles ?? []; const next = on ? cur.filter((x) => x !== v) : [...cur, v]; set({ textStyles: next.length ? next : undefined }); }} className={cn('cursor-pointer rounded-full border px-2.5 py-1 transition', on ? 'border-neon bg-neon/10 text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}>{t}</button>;
              })}
            </div>
          </div>
          <div><p className="mb-1.5 text-fg-subtle">Transition</p><Chips items={TRANSITIONS.map((t) => [t, TRANSITION_LABELS[t]] as [typeof t, string])} value={prefs.transition} onPick={(v) => set({ transition: v })} /></div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-fg-subtle">Couleurs imposées</span>
            {[0, 1].map((i) => (
              <input key={i} id={`pref-color-${i}`} type="color" value={prefs.colors?.[i] ?? (i ? '#ffffff' : '#f28be0')} onChange={(e) => { const c = [...(prefs.colors ?? [])]; c[i] = e.target.value; set({ colors: c.filter(Boolean).slice(0, 2) }); }} className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent" aria-label={i ? 'Deuxième couleur' : 'Couleur principale'} />
            ))}
            {prefs.colors?.length ? <button type="button" onClick={() => set({ colors: undefined })} className="cursor-pointer text-fg-subtle underline">retirer</button> : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="mb-1.5 text-fg-subtle">Emojis</p><Chips items={[['oui', 'Oui'], ['non', 'Non']]} value={prefs.emojis === undefined ? undefined : prefs.emojis ? 'oui' : 'non'} onPick={(v) => set({ emojis: v === undefined ? undefined : v === 'oui' })} /></div>
            <div><p className="mb-1.5 text-fg-subtle">Parler au client</p><Chips items={[['tu', 'Tu'], ['vous', 'Vous']]} value={prefs.address} onPick={(v) => set({ address: v as AiPrefs['address'] })} /></div>
            <div><p className="mb-1.5 text-fg-subtle">Langue</p><Chips items={[['fr', 'FR'], ['en', 'EN'], ['es', 'ES']]} value={prefs.language} onPick={(v) => set({ language: v as AiPrefs['language'] })} /></div>
          </div>
          <label className="block text-fg-subtle">Phrase de fin (appel à l’action)
            <input id="pref-cta" maxLength={60} value={prefs.cta ?? ''} onChange={(e) => set({ cta: e.target.value || undefined })} placeholder="Ex. : Réserve ta séance d’essai" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-fg outline-none focus:border-neon/50" />
          </label>
          <label className="block text-fg-subtle">Tes règles pour l’IA (elle les suit à chaque vidéo)
            <textarea id="pref-rules" rows={2} maxLength={600} value={prefs.rules ?? ''} onChange={(e) => set({ rules: e.target.value || undefined })} placeholder="Ex. : toujours finir sur notre adresse, jamais de rouge, mettre le prix en gros" className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-fg outline-none focus:border-neon/50" />
          </label>
          {count ? <button type="button" onClick={() => { onChange({}); savePrefs({}); }} className="inline-flex cursor-pointer items-center gap-1 text-fg-subtle hover:text-fg"><RotateCcw className="h-3.5 w-3.5" /> Tout remettre par défaut</button> : null}
        </div>
      ) : null}
    </div>
  );
}
