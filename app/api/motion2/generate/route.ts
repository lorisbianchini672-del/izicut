import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, aiTrace, chatJson, describeImages } from '@/lib/ai/chat';
import { detectBrandName } from '@/lib/brand/detect';
import { BrandBriefSchema, CompanySchema, SiteSchema } from '@/lib/brand/types';
import { resolvePlanTier } from '@/lib/entitlements';
import { FREE_MOTION_CREATIONS, isAdminEmail } from '@/lib/motion/plan';
import { AiPrefsSchema, prefsPrompt } from '@/lib/motion/prefs';
import { proEditPrompt, proSystemPrompt, richness } from '@/lib/motion2/prompt';
import { resolveSearchAssets, verifyComp } from '@/lib/motion2/server';
import { expandBlocks, sequenceBlocks } from '@/lib/motion2/templates';
import { COMP_SIZE, CompSchema, checkComp, hasContent, type Comp } from '@/lib/motion2/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/motion2/generate — moteur pro : le directeur artistique IA écrit
 * (ou retouche) une vraie composition animée HTML / CSS / GSAP. Chaque
 * composition est jouée dans un vrai navigateur avant d'être renvoyée : si
 * elle plante, l'IA la corrige elle-même.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const BodySchema = z.object({
  prompt: z.string().trim().min(2).max(1500),
  format: z.enum(['9:16', '16:9', '1:1']).optional(),
  comp: CompSchema.optional(),
  photos: z.array(z.object({ index: z.number().int().min(0).max(20), name: z.string().max(80) })).max(12).optional(),
  photoSheets: z.array(z.string().max(1_500_000)).max(2).optional(),
  photoNotes: z.string().max(6000).optional(),
  hasLogo: z.boolean().optional(),
  prefs: AiPrefsSchema.optional(),
  brand: z.object({ company: CompanySchema.nullable(), notes: z.string().max(2000), brief: BrandBriefSchema.nullable(), site: SiteSchema.nullable().optional(), link: z.string().max(200).optional() }).optional()
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous (gratuit) pour créer avec l’IA.' }, { status: 401 });
  const limited = rateLimit(request, 'motion2-gen', 8, 60000, user.id);
  if (limited) return limited;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
  const { prompt, comp: current, photos, brand, prefs } = parsed.data;
  const format = current?.format ?? parsed.data.format ?? '9:16';
  const origin = new URL(request.url).origin;

  const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', user.id).maybeSingle();
  const tier = isAdminEmail(user.email) ? 'agency' : resolvePlanTier(profile?.plan, profile?.subscription_status);
  const free = tier === 'free';
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const used = Number(meta.motion_creations) || 0;
  if (!current && free && used >= FREE_MOTION_CREATIONS) {
    return NextResponse.json({ error: `Vous avez utilisé vos ${FREE_MOTION_CREATIONS} pubs gratuites. Passez en Pro pour créer en illimité (vous pouvez toujours retoucher vos pubs).`, code: 'quota', quota: { tier, used, limit: FREE_MOTION_CREATIONS } }, { status: 402 });
  }

  // Ce que l'IA sait du client.
  let photoNotes = parsed.data.photoNotes ?? '';
  if (photos?.length && parsed.data.photoSheets?.length && !photoNotes) {
    photoNotes = (await describeImages(parsed.data.photoSheets, 'Planches de photos numérotées (numéro en haut à gauche). Pour CHAQUE photo, une ligne : "n : ce qu\'on voit (produit, lieu, personne, logo, textes lisibles), ambiance, couleurs dominantes". En français, concis.', 1200).catch(() => '')).slice(0, 6000);
  }
  const named = detectBrandName(prompt);
  const facts = [
    named ? `Marque citée par le client : « ${named} » (la pub doit porter sur elle).` : '',
    brand?.company ? `Entreprise (registre officiel) : ${brand.company.name}${brand.company.activityLabel ? `, ${brand.company.activityLabel}` : ''}${brand.company.city ? `, ${brand.company.city}` : ''}.` : '',
    brand?.site ? `Site web ${brand.site.url} — titre : ${brand.site.title}. ${brand.site.description}. Couleurs du site : ${brand.site.colors.join(', ') || 'inconnues'}. Polices : ${brand.site.fonts.join(', ') || 'inconnues'}. Extrait : ${(brand.site.text ?? '').slice(0, 2500)}` : '',
    brand?.brief ? `Fiche marque : ${brand.brief.pitch} Atouts : ${brand.brief.strengths.join(' ; ')}. Ton : ${brand.brief.tone}.` : '',
    brand?.notes ? `Le client précise : ${brand.notes}` : '',
    brand?.link ? `Lien à afficher à la fin : ${brand.link}` : '',
    photos?.length ? `Photos du client (${photos.length}) : utilise-les avec {{photo:0}} … {{photo:${photos.length - 1}}}.${photoNotes ? `\nCe que montre chaque photo :\n${photoNotes}` : ''}` : 'Le client n’a pas de photo : utilise des {{search:…}} (photos libres de droits) bien choisies.',
    parsed.data.hasLogo ? 'Le client a fourni son logo : utilise {{logo}} (au moins dans la scène finale).' : ''
  ].filter(Boolean).join('\n');

  const system = current ? proEditPrompt() : proSystemPrompt(format);
  const baseUser = current
    ? `Composition actuelle :\n${JSON.stringify({ ...current, assets: undefined })}\n\n${facts}\n${prefsPrompt(prefs)}\nDemande du client : ${prompt}`
    : `${prefsPrompt(prefs)}Demande du client : ${prompt}\n\n${facts}\n\nCrée la pub.`;

  const t0 = Date.now();
  let feedback = '';
  let lastErr = '';
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0 && Date.now() - t0 > 170_000) break;
      let raw: Record<string, unknown>;
      try {
        raw = (await chatJson({ system, user: feedback ? `${baseUser}\n\n${feedback}` : baseUser, maxTokens: 16000, temperature: current ? 0.5 : 0.9, think: attempt === 0 ? 2000 : 0, timeoutMs: 150_000, deadline: t0 + 280_000 })) as Record<string, unknown>;
      } catch (err) {
        if (err instanceof AiNotConfiguredError) throw err;
        lastErr = (err as Error).message?.slice(0, 200) ?? 'erreur IA';
        continue;
      }
      const message = typeof raw?.message === 'string' ? raw.message.slice(0, 1200) : '';
      const plan = Array.isArray(raw?.plan) ? (raw.plan as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 240)).slice(0, 12) : undefined;
      if (current && (raw?.comp === null || raw?.comp === undefined)) return NextResponse.json({ comp: current, message: message || 'D’accord.', answer: true });
      const res = CompSchema.safeParse({ ...(raw?.comp as object), format, v: 1 });
      if (!res.success) { feedback = `ATTENTION : ta réponse précédente n'était pas valide (${res.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}). Renvoie le JSON complet et valide.`; continue; }
      // Repères d'images normalisés (« {{search: mots}} » → « {{search:mots}} »).
      const norm = (t: string) => t.replace(/\{\{\s*(search|photo)\s*:\s*/g, '{{$1:').replace(/\{\{\s*logo\s*\}\}/g, '{{logo}}');
      let comp: Comp = { ...res.data, html: norm(res.data.html), css: norm(res.data.css) };
      if (!hasContent(comp)) { feedback = 'ATTENTION : la pub est vide (ni scènes sur mesure, ni modèles). Renvoie le JSON complet.'; continue; }
      // Couleurs : celles du client si elles existent.
      if (!comp.palette) {
        const site = (brand?.site?.colors ?? []).filter((x) => /^#[0-9a-f]{6}$/i.test(x));
        comp = { ...comp, palette: { primary: prefs?.colors?.[0] ?? site[0] ?? '#ff4d6d', secondary: prefs?.colors?.[1] ?? site[1] ?? '#7c5cff', bg: '#0b0b10', text: '#ffffff' } };
      }
      // Durée réelle = fin de la dernière scène (modèles compris).
      if (comp.blocks?.length) comp = { ...comp, blocks: sequenceBlocks(comp.blocks, comp.sound?.bpm ?? 120) };
      const { w: CW, h: CH } = COMP_SIZE[comp.format];
      const ex = expandBlocks(comp.blocks, { W: CW, H: CH, vertical: comp.format === '9:16', palette: comp.palette!, bpm: comp.sound?.bpm ?? 120 });
      if (ex.errors.length && attempt < 2) { feedback = `ATTENTION : certains modèles sont invalides (${ex.errors.join(' ; ')}). Corrige leurs variables et renvoie le JSON complet.`; continue; }
      comp = { ...comp, duration: Math.min(60, Math.max(comp.duration, ex.end)) };
      const bad = checkComp(comp);
      if (bad) { feedback = `ATTENTION : ${bad}. Corrige et renvoie le JSON complet.`; continue; }
      const thin = !current && attempt < 2 ? richness(comp) : null;
      if (thin) { feedback = `ATTENTION : ta pub est trop simple (${thin}). Refais-la beaucoup plus riche et spectaculaire, avec au moins 7 techniques différentes de la bibliothèque, des transitions liées et une caméra vivante. Renvoie le JSON complet.`; continue; }
      comp = { ...comp, assets: { ...(current?.assets ?? {}), ...(await resolveSearchAssets(comp)) } };
      const errors = await verifyComp(comp, origin);
      if (errors?.length && attempt < 2) { feedback = `ATTENTION : en jouant ta composition, le navigateur a rencontré ces erreurs JavaScript : ${errors.join(' | ')}. Corrige le code (garde la même idée) et renvoie le JSON complet.`; continue; }
      let quota = { tier, used, limit: free ? FREE_MOTION_CREATIONS : null as number | null };
      if (!current) {
        try {
          await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { ...meta, motion_creations: used + 1 } });
          quota = { ...quota, used: used + 1 };
        } catch { /* compteur indisponible : on ne bloque pas */ }
      }
      return NextResponse.json({ comp, message, plan, quota, engine: aiTrace.provider, attempts: attempt + 1 });
    }
    return NextResponse.json({ error: 'La création n’a pas abouti, réessayez dans un instant.', code: 'retry', reason: (feedback || lastErr).slice(0, 400), trace: aiTrace.failures }, { status: 502 });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error('[motion2] génération :', err);
    return NextResponse.json({ error: 'Notre IA est très demandée en ce moment, réessayez dans un instant.', code: 'busy' }, { status: 503 });
  }
}
