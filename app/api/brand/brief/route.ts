import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson } from '@/lib/ai/chat';
import { BrandBriefSchema, CompanySchema } from '@/lib/brand/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/brand/brief — L'IA, en directrice de communication, rédige la
 * « fiche marque » : pitch, cible, ton, points forts, slogans, idées de pubs
 * et palette, à partir du registre officiel + ce que le client en dit.
 */

export const maxDuration = 60;

const BodySchema = z.object({ company: CompanySchema.nullable(), notes: z.string().max(2000) });

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour utiliser l’IA.' }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.company && parsed.data.notes.trim().length < 5)) {
    return NextResponse.json({ error: 'Choisissez votre entreprise ou décrivez votre activité.' }, { status: 400 });
  }
  const { company, notes } = parsed.data;
  try {
    const raw = await chatJson({
      system: `Tu es directrice de communication pour les TPE, PME, commerçants, artisans, indépendants et associations en France. À partir des informations officielles (registre SIRENE) et de ce que le client dit, tu rédiges une fiche marque concrète, crédible et locale. Tu n'inventes pas de faits vérifiables (prix, récompenses, chiffres) : si tu n'en es pas sûre, formule de façon générale. Réponds UNIQUEMENT en JSON :
{"pitch":"1 à 2 phrases","audience":"la cible","tone":"le ton conseillé","strengths":["3 à 5 points forts probables"],"slogans":["3 slogans courts"],"adIdeas":["3 idées de pubs vidéo pour les réseaux, UNE phrase de 120 caractères max chacune"],"palette":{"primary":"#RRGGBB","accent":"#RRGGBB","background":"#RRGGBB"}}`,
      user: `Registre officiel : ${company ? JSON.stringify(company) : '(non renseigné)'}\nCe que le client dit de son activité : ${notes || '(rien)'}`,
      maxTokens: 1200,
      temperature: 0.6
    });
    // L'IA déborde parfois (texte trop long, une idée de trop) : on rabote
    // plutôt que d'échouer.
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : Array.isArray(v) ? v.join(', ').slice(0, n) : '');
    const list = (v: unknown, count: number, n: number) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).map((x) => str(x, n)).filter(Boolean).slice(0, count);
    const pal = o.palette && typeof o.palette === 'object' ? (o.palette as Record<string, unknown>) : null;
    const brief = BrandBriefSchema.safeParse({
      pitch: str(o.pitch, 400),
      audience: str(o.audience, 300),
      tone: str(o.tone, 120),
      strengths: list(o.strengths, 6, 120),
      slogans: list(o.slogans, 5, 90),
      adIdeas: list(o.adIdeas, 5, 220),
      palette: pal ? { primary: str(pal.primary, 7), accent: str(pal.accent, 7), background: str(pal.background, 7) } : undefined
    });
    if (!brief.success || !brief.data.pitch) return NextResponse.json({ error: "L'IA n'a pas réussi, réessayez." }, { status: 502 });
    const hex = (v: string, d: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
    const p = brief.data.palette;
    return NextResponse.json({
      brief: { ...brief.data, palette: p ? { primary: hex(p.primary, '#c8ff3d'), accent: hex(p.accent, '#3de0ff'), background: hex(p.background, '#07080d') } : undefined }
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
