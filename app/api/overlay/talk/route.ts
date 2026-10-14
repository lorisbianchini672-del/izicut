import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson } from '@/lib/ai/chat';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/overlay/talk — l'IA lit ce que dit la personne et choisit le
 * montage : accroche, mots à illustrer par une photo, liste numérotée, temps
 * forts. Réponse COURTE (fiable avec les IA gratuites) ; le moteur fabrique
 * ensuite les animations.
 */
export const maxDuration = 120;

const Body = z.object({
  duration: z.number().min(1).max(3600),
  lines: z.array(z.object({ t: z.number(), text: z.string().max(400) })).max(400),
  wish: z.string().max(600).optional()
});

const SYSTEM = `Tu es le monteur vidéo d'izicut, spécialiste des vidéos TikTok / Reels face caméra montées façon After Effects (style des meilleurs créateurs : grosse accroche brillante, sous-titres mot à mot, photos qui surgissent sur les mots clés, liste numérotée animée, zooms punch).
Tu reçois ce que dit la personne, phrase par phrase avec le temps (secondes). Choisis le montage. Réponds UNIQUEMENT par un JSON compact :
{"hook":"accroche de 3 à 7 mots, percutante, qui reprend l'idée du début (ex. « TON RESTO PERD DES COMMANDES »)","broll":[{"t":secondes,"query":"2 à 4 mots-clés EN ANGLAIS pour une photo libre de droits qui illustre ce qui est dit à cet instant","label":"1 à 3 mots en français (facultatif)"}],"list":{"items":["point 1 en 2 à 5 mots","point 2",…],"marks":[secondes où la personne annonce chaque point]} ou null,"emphasis":[secondes des moments forts pour un zoom],"accent":"#RRGGBB couleur vive adaptée au sujet"}
Règles : 3 à 7 photos réparties dans la vidéo (jamais deux à moins de 3 s d'écart), sur des objets / lieux / actions concrets (plats, téléphone, argent, clients…) ; "list" UNIQUEMENT si la personne énumère vraiment des points (numéro 1, 2, 3… ou premièrement, deuxièmement…) — "marks" = le moment où elle annonce chaque point ; 4 à 8 temps forts. N'invente rien que la personne ne dit pas. Si le client exprime un souhait, respecte-le.`;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour utiliser l’IA.' }, { status: 401 });
  const limited = rateLimit(request, 'overlay-talk', 20, 60000, user.id);
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide' }, { status: 400 });
  const { duration, lines, wish } = parsed.data;
  const text = lines.map((l) => `${l.t.toFixed(1)} ${l.text}`).join('\n').slice(0, 7000);
  try {
    const raw = (await chatJson({
      system: SYSTEM,
      user: `Durée : ${duration.toFixed(1)} s.${wish ? `\nSouhait du client : ${wish}` : ''}\nCe que dit la personne :\n${text}`,
      maxTokens: 1800,
      temperature: 0.6,
      timeoutMs: 45_000,
      confidential: true
    })) as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(duration, Math.max(0, x)) : null);
    const broll = Array.isArray(raw.broll) ? raw.broll.flatMap((b) => {
      const o = b as Record<string, unknown>;
      const t = num(o.t);
      return t !== null && typeof o.query === 'string' ? [{ t, query: o.query.slice(0, 55), label: typeof o.label === 'string' ? o.label.slice(0, 28) : undefined }] : [];
    }).sort((a, b) => a.t - b.t).filter((b, i, arr) => i === 0 || b.t - arr[i - 1].t >= 2.5) : [];
    const l = raw.list as Record<string, unknown> | null;
    const items = l && Array.isArray(l.items) ? l.items.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 6) : [];
    const marks = l && Array.isArray(l.marks) ? l.marks.map(num).filter((x): x is number => x !== null).sort((a, b) => a - b).slice(0, items.length) : [];
    const list = items.length >= 2 && marks.length >= 2 ? { items: items.slice(0, marks.length), marks } : null;
    const emphasis = Array.isArray(raw.emphasis) ? raw.emphasis.map(num).filter((x): x is number => x !== null).slice(0, 10) : [];
    const hook = typeof raw.hook === 'string' ? raw.hook.slice(0, 70) : '';
    const accent = typeof raw.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accent) ? raw.accent : undefined;
    return NextResponse.json({ plan: { hook, broll, list, emphasis, accent } });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: 'IA indisponible' }, { status: 503 });
  }
}
