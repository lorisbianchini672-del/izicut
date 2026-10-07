import { NextResponse } from 'next/server';

import { nafLabel } from '@/lib/brand/naf';
import type { Company } from '@/lib/brand/types';

/**
 * GET /api/brand/search?q=… — Recherche d'une entreprise ou association
 * française dans le registre officiel (API publique « Recherche
 * d'entreprises » de l'État, données SIRENE / RNE, gratuite et sans clé).
 */

const EFFECTIFS: Record<string, string> = {
  NN: 'non renseigné', '00': '0 salarié', '01': '1 à 2 salariés', '02': '3 à 5 salariés', '03': '6 à 9 salariés',
  '11': '10 à 19 salariés', '12': '20 à 49 salariés', '21': '50 à 99 salariés', '22': '100 à 199 salariés',
  '31': '200 à 249 salariés', '32': '250 à 499 salariés', '41': '500 à 999 salariés', '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés', '52': '5 000 à 9 999 salariés', '53': '10 000 salariés et plus'
};

type Raw = {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  activite_principale?: string;
  libelle_activite_principale?: string;
  date_creation?: string;
  tranche_effectif_salarie?: string;
  categorie_entreprise?: string;
  complements?: { est_association?: boolean };
  siege?: { adresse?: string; libelle_commune?: string; code_postal?: string; libelle_activite_principale?: string };
};

/** Mots d'activité → début du code NAF correspondant (pour classer les résultats). */
const ACTIVITY_HINTS: [RegExp, string[]][] = [
  [/compta|expert[- ]?compta/, ['69.20']],
  [/avocat|juridique|notaire/, ['69.10']],
  [/boulang|patiss/, ['10.71', '47.24']],
  [/coiff/, ['96.02']],
  [/beaut|esth[eé]ti|ongle/, ['96.02', '96.04']],
  [/restau|brasserie|pizz|traiteur/, ['56.1', '56.21']],
  [/bar|caf[eé]/, ['56.30']],
  [/sport|fitness|muscu|salle de gym/, ['93.1']],
  [/immobili|agence immo/, ['68.3']],
  [/garage|auto|carross/, ['45.']],
  [/plomb|chauffag|[eé]lectric|ma[cç]on|b[aâ]timent|menuis|peint/, ['43.', '41.']],
  [/fleur/, ['47.76']],
  [/pharma/, ['47.73']],
  [/m[eé]decin|kin[eé]|dentist|infirmi|ost[eé]o/, ['86.']],
  [/association|asso\b/, ['94.']],
  [/informatique|logiciel|web|digital|agence (web|digitale)/, ['62.', '63.']],
  [/communication|publicit|marketing/, ['73.']],
  [/h[oô]tel|g[iî]te/, ['55.']],
  [/v[eê]tement|boutique|pr[eê]t[- ][aà][- ]porter/, ['47.71']],
  [/formation|[eé]cole|cours/, ['85.']]
];
const GENERIC = /^(cabinet|expert|experts|expertise|comptable|comptables|societe|société|sarl|sas|sasu|eurl|sa|entreprise|ets|etablissements|établissements|groupe|agence|la|le|les|de|du|des|d|l|et|chez|association|asso|salon|boulangerie|restaurant|garage|boutique|magasin)$/i;

const norm = (v?: string) => (v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Variantes d'orthographe fréquentes (ph/f, y/i, lettres doublées, s final…). */
function variants(word: string): string[] {
  const w = norm(word);
  const out = new Set<string>([
    w.replace(/ph/g, 'f'),
    w.replace(/f/g, 'ph'),
    w.replace(/y/g, 'i'),
    w.replace(/i/g, 'y'),
    w.replace(/k/g, 'c'),
    w.replace(/c(?=[aou])/g, 'k'),
    w.replace(/(.)\1/g, '$1'),
    w.replace(/s$/, ''),
    w.endsWith('s') ? w : `${w}s`,
    w.replace(/e$/, ''),
    w.replace(/ie$/, 'is').replace(/is$/, 'ie')
  ]);
  out.delete(w);
  return [...out].filter((v) => v.length >= 3).slice(0, 8);
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const search = async (text: string, per = 10): Promise<Raw[] | null> => {
      const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(text.slice(0, 120))}&per_page=${per}&etat_administratif=A`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
        next: { revalidate: 3600 }
      });
      if (!res.ok) return null;
      return ((await res.json()) as { results?: Raw[] }).results ?? [];
    };

    const lower = norm(q);
    const hints = ACTIVITY_HINTS.filter(([re]) => re.test(lower)).flatMap(([, codes]) => codes);
    const matchesHint = (r: Raw) => hints.some((h) => (r.activite_principale ?? '').startsWith(h));
    const words = q.split(/\s+/).filter(Boolean);
    const nameWords = words.filter((w) => !GENERIC.test(norm(w)));
    const nameQuery = nameWords.join(' ') || q;

    const first = await search(q);
    if (first === null) return NextResponse.json({ error: 'Registre des entreprises momentanément indisponible.' }, { status: 502 });
    let pool: Raw[] = [...first];
    const seen = new Set(pool.map((r) => r.siren));
    const add = (list: Raw[] | null) => { for (const r of list ?? []) if (r.siren && !seen.has(r.siren)) { seen.add(r.siren); pool.push(r); } };

    const good = () => (hints.length ? pool.some(matchesHint) : pool.length > 0);
    // 1) Nom seul, sans les mots génériques (« cabinet », « expert comptable »…).
    if (!good() && nameQuery !== q) add(await search(nameQuery, 20));
    // 2) Orthographes voisines (Orphis → Orfis, Kafé → Café…).
    if (!good() && nameWords.length) {
      const main = nameWords.reduce((a, b) => (b.length > a.length ? b : a), nameWords[0]);
      for (const v of variants(main)) {
        add(await search(nameQuery.replace(main, v), 10));
        if (good()) break;
      }
    }
    // 3) « nom + ville » : on met en tête les structures de cette ville.
    const lastWord = norm(words[words.length - 1]);
    const inCity = (r: Raw) => words.length >= 2 && (norm(r.siege?.libelle_commune).includes(lastWord) || (r.siege?.code_postal ?? '').startsWith(lastWord));
    if (!pool.length && words.length >= 2) add(await search(words.slice(0, -1).join(' '), 25));

    const score = (r: Raw) => (matchesHint(r) ? 2 : 0) + (inCity(r) ? 1 : 0);
    pool = pool.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i).map((x) => x.r).slice(0, 8);
    const data = { results: pool };
    const u = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
    const results: Company[] = (data.results ?? []).map((r) => ({
      siren: String(r.siren ?? '').slice(0, 12),
      name: String(r.nom_complet ?? r.nom_raison_sociale ?? '').slice(0, 160),
      activityCode: u(r.activite_principale, 10),
      activityLabel: u(r.libelle_activite_principale ?? r.siege?.libelle_activite_principale ?? nafLabel(r.activite_principale), 160),
      city: u(r.siege?.libelle_commune, 80),
      postalCode: u(r.siege?.code_postal, 10),
      address: u(r.siege?.adresse, 200),
      createdAt: u(r.date_creation, 12),
      employees: r.tranche_effectif_salarie ? (EFFECTIFS[r.tranche_effectif_salarie] ?? r.tranche_effectif_salarie).slice(0, 40) : undefined,
      isAssociation: Boolean(r.complements?.est_association),
      category: u(r.categorie_entreprise, 20)
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Recherche impossible pour le moment.' }, { status: 502 });
  }
}
