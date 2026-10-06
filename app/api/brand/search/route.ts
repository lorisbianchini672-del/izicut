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

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q.slice(0, 120))}&per_page=8&etat_administratif=A`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 }
    });
    if (!res.ok) return NextResponse.json({ error: 'Registre des entreprises momentanément indisponible.' }, { status: 502 });
    const data = (await res.json()) as { results?: Raw[] };
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
