'use client';

/**
 * « Ma marque » — le client retrouve son entreprise ou son association dans
 * le registre officiel français, dit en quelques mots ce qui la rend unique,
 * et l'IA en tire une fiche marque (pitch, cible, ton, slogans, idées de pubs,
 * couleurs). Toutes les pubs générées ensuite s'appuient sur cette fiche.
 */
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, Globe, Loader2, Search, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { BrandBrief, BrandProfile, Company, SiteDna } from '@/lib/brand/types';
import { cn } from '@/lib/utils';

export const BRAND_STORAGE_KEY = 'izicut-brand-v1';
export const EMPTY_BRAND: BrandProfile = { company: null, notes: '', brief: null };

export function loadBrand(): BrandProfile {
  try {
    const raw = window.localStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return EMPTY_BRAND;
    const v = JSON.parse(raw) as BrandProfile;
    return { company: v.company ?? null, notes: typeof v.notes === 'string' ? v.notes : '', brief: v.brief ?? null, site: v.site ?? null, link: typeof v.link === 'string' ? v.link : '' };
  } catch {
    return EMPTY_BRAND;
  }
}

export function saveBrand(profile: BrandProfile) {
  try {
    window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* stockage indisponible */
  }
}

const inputCls = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-fg outline-none focus:border-neon/50';

export function BrandPanel({
  profile,
  onChange,
  loggedIn,
  onApplyPalette,
  onCreateAd
}: {
  profile: BrandProfile;
  onChange: (next: BrandProfile) => void;
  loggedIn: boolean | null;
  onApplyPalette: (palette: NonNullable<BrandBrief['palette']>) => void;
  onCreateAd: (idea: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Company[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState(profile.site?.url ?? '');
  const [siteBusy, setSiteBusy] = useState(false);

  const analyzeSite = async () => {
    if (!loggedIn) { setError('Connectez-vous (gratuit) pour analyser votre site.'); return; }
    if (siteUrl.trim().length < 4) return;
    setSiteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand/site?url=${encodeURIComponent(siteUrl.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.site) throw new Error(json.error ?? 'Analyse impossible.');
      const site = json.site as SiteDna;
      onChange({ ...profile, site, link: profile.link || site.url.replace(/^https?:\/\//, '').replace(/\/$/, '') });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse impossible.');
    } finally {
      setSiteBusy(false);
    }
  };

  const siteColors = (site: SiteDna) => {
    const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
    const sat = (h: string) => { const n = parseInt(h.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b); };
    const vivid = [...site.colors].sort((a, b) => sat(b) - sat(a));
    const dark = [...site.colors].sort((a, b) => lum(a) - lum(b))[0];
    return { primary: vivid[0] ?? '#a990ff', accent: vivid[1] ?? vivid[0] ?? '#ffbe76', background: dark && lum(dark) < 60 ? dark : '#0b0920' };
  };
  const timer = useRef<number | null>(null);

  // Recherche dans le registre au fil de la frappe (anti-rebond 350 ms).
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/brand/search?q=${encodeURIComponent(q)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Recherche impossible.');
        setResults(json.results ?? []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Recherche impossible.');
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  const generate = async () => {
    if (!loggedIn) { setError('Connectez-vous (gratuit) pour générer votre fiche marque.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/brand/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: profile.company, notes: profile.notes, site: profile.site ?? null })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.brief) throw new Error(json.error ?? 'L’IA n’a pas pu répondre.');
      onChange({ ...profile, brief: json.brief as BrandBrief });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de l’IA.');
    } finally {
      setBusy(false);
    }
  };

  const c = profile.company;
  const b = profile.brief;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-fg">Votre entreprise ou association</p>
        <p className="mt-0.5 text-xs text-fg-muted">Toutes les structures actives en France sont dans le registre officiel. L’IA s’en sert pour créer des pubs qui vous ressemblent.</p>
      </div>

      {c ? (
        <div className="rounded-xl border border-neon/30 bg-neon/[0.05] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{c.name}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {[c.isAssociation ? 'Association' : null, c.activityLabel ?? c.activityCode, [c.postalCode, c.city].filter(Boolean).join(' '), c.employees].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button type="button" aria-label="Changer" onClick={() => onChange({ ...profile, company: null, brief: null })} className="cursor-pointer rounded-md p-1 text-fg-subtle hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, SIREN ou nom + ville" className={cn(inputCls, 'pl-9')} />
            {searching ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle" /> : null}
          </div>
          {results.length ? (
            <ul className="mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-black/40">
              {results.map((r) => (
                <li key={r.siren}>
                  <button
                    type="button"
                    onClick={() => { onChange({ ...profile, company: r, brief: null }); setQuery(''); setResults([]); }}
                    className="block w-full cursor-pointer border-b border-white/5 px-3 py-2 text-left last:border-0 hover:bg-white/[0.05]"
                  >
                    <span className="block truncate text-sm text-fg">{r.name}</span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {[r.isAssociation ? 'Association' : null, r.activityLabel ?? r.activityCode, [r.postalCode, r.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-[11px] text-fg-subtle">Pas encore immatriculé ? Décrivez simplement votre activité ci-dessous.</p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-fg-muted">En quelques mots : ce qui vous rend unique</p>
        <textarea
          value={profile.notes}
          maxLength={2000}
          rows={4}
          onChange={(e) => onChange({ ...profile, notes: e.target.value })}
          placeholder="Ex. : boulangerie artisanale à Nantes, pain au levain, viennoiseries maison, ouvert le dimanche, clientèle de quartier et familles, promo -20 % sur la 1re commande…"
          className={cn(inputCls, 'resize-none')}
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-fg-muted">Votre site web (facultatif) — l’IA reprend sa charte</p>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void analyzeSite(); }} placeholder="monsite.fr" className={cn(inputCls, 'pl-9')} />
          </div>
          <button type="button" onClick={analyzeSite} disabled={siteBusy} className="cursor-pointer rounded-xl border border-neon/40 px-3 text-xs font-semibold text-neon disabled:opacity-50">
            {siteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyser'}
          </button>
        </div>
        {profile.site ? (
          <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <p className="truncate text-xs font-semibold text-fg">{profile.site.title || profile.site.url}</p>
            {profile.site.description ? <p className="mt-0.5 line-clamp-2 text-[11px] text-fg-muted">{profile.site.description}</p> : null}
            <div className="mt-1.5 flex items-center gap-1.5">
              {profile.site.colors.map((col) => <span key={col} title={col} className="h-5 w-5 rounded-full border border-white/20" style={{ background: col }} />)}
              {profile.site.fonts.length ? <span className="ml-1 truncate text-[10px] text-fg-subtle">{profile.site.fonts.join(', ')}</span> : null}
              {profile.site.colors.length ? (
                <button type="button" onClick={() => profile.site && onApplyPalette(siteColors(profile.site))} className="ml-auto shrink-0 cursor-pointer rounded-lg border border-white/10 px-2 py-0.5 text-[10px] text-fg-muted hover:text-fg">
                  Couleurs du site
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Lien de l’appel à l’action (réservation, boutique, site…)</span>
        <input value={profile.link ?? ''} maxLength={200} onChange={(e) => onChange({ ...profile, link: e.target.value })} placeholder="ex. monsite.fr/reserver" className={inputCls} />
      </label>

      <Button variant="gradient" className="w-full rounded-xl font-bold" disabled={busy || (!c && profile.notes.trim().length < 5)} onClick={generate}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {b ? 'Régénérer ma fiche marque' : 'Générer ma fiche marque'}
      </Button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {b ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-neon"><Check className="h-3.5 w-3.5" /> Fiche marque prête — l’IA s’en sert pour chaque pub</p>
          <EditableText label="Pitch" value={b.pitch} max={400} onChange={(v) => onChange({ ...profile, brief: { ...b, pitch: v } })} />
          <EditableText label="Cible" value={b.audience} max={300} onChange={(v) => onChange({ ...profile, brief: { ...b, audience: v } })} />
          <EditableText label="Ton" value={b.tone} max={120} onChange={(v) => onChange({ ...profile, brief: { ...b, tone: v } })} />
          {b.strengths.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Points forts</p>
              <ul className="space-y-0.5 text-xs text-fg">{b.strengths.map((s) => <li key={s}>• {s}</li>)}</ul>
            </div>
          ) : null}
          {b.palette ? (
            <div className="flex items-center gap-2">
              {[b.palette.background, b.palette.primary, b.palette.accent].map((col) => (
                <span key={col} className="h-6 w-6 rounded-full border border-white/20" style={{ background: col }} />
              ))}
              <button type="button" onClick={() => b.palette && onApplyPalette(b.palette)} className="ml-auto cursor-pointer rounded-lg border border-white/10 px-2 py-1 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">
                Appliquer mes couleurs
              </button>
            </div>
          ) : null}
          {b.adIdeas.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Idées de pubs — cliquez pour la créer</p>
              <div className="space-y-1.5">
                {b.adIdeas.map((idea) => (
                  <button key={idea} type="button" onClick={() => onCreateAd(idea)} className="block w-full cursor-pointer rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-xs text-fg hover:border-neon/40">
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {b.slogans.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Slogans</p>
              <ul className="space-y-0.5 text-xs italic text-fg-muted">{b.slogans.map((s) => <li key={s}>« {s} »</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-[11px] text-fg-subtle">
        <Building2 className="mt-0.5 h-3 w-3 shrink-0" />
        Source : registre officiel des entreprises (data.gouv.fr). Votre fiche reste enregistrée dans ce navigateur.
      </p>
    </div>
  );
}

function EditableText({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</span>
      <textarea value={value} maxLength={max} rows={2} onChange={(e) => onChange(e.target.value)} className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-neon/50" />
    </label>
  );
}
