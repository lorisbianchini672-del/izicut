import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson } from '@/lib/ai/chat';
import { LayerSchema, LayersSchema, type Layer } from '@/lib/overlay/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/overlay/ai — l'IA du Studio d'effets.
 * Reçoit la demande du client (« ajoute des emojis aux moments drôles »),
 * les calques actuels, la durée et la transcription horodatée, et renvoie
 * la liste COMPLÈTE des calques mise à jour + un court message.
 */

const BodySchema = z.object({
  prompt: z.string().trim().min(2).max(1200),
  duration: z.number().min(1).max(3600),
  layers: z.array(z.unknown()).max(60),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).max(4000).optional(),
  beats: z.array(z.number().min(0).max(3600)).max(400).optional()
});

const SYSTEM = `Tu es un monteur vidéo expert (style CapCut / clips TikTok). Tu modifies la vidéo du client avec des CALQUES : certains transforment la VIDÉO ELLE-MÊME (vitesse, coupes, arrêts sur image, effets d'image, zooms, filtres), d'autres s'AJOUTENT par-dessus (textes, emojis, formes, intro, carte de fin, barre, flash).

RÈGLE N°1 : fais EXACTEMENT ce que le client demande, rien de plus. N'ajoute JAMAIS de texte, d'emoji, d'intro, de carte de fin ou de barre de progression s'il ne l'a pas demandé (ou s'il demande un « montage complet »). S'il demande de modifier sa vidéo (ralenti, accéléré, rythme, effet, couper, style clip, danse…), utilise UNIQUEMENT les calques qui transforment la vidéo.
RÈGLE N°2 : les temps sont ceux de la vidéo d'origine (en secondes). Les "temps forts" fournis sont les beats de la musique : cale les effets dessus pour un résultat pro.
Réponds UNIQUEMENT par un JSON : {"message": "phrase courte en français qui résume ce que tu as fait", "layers": [ ...liste COMPLÈTE des calques... ]}

Types de calques (tous ont "id" texte unique, "start" et "end" en secondes, 0 <= start < end <= durée) :
- {"type":"text","text":"max 140 car., mots clés entre *astérisques* pour la couleur d'accent","x":0-1,"y":0-1,"size":20-220 (px sur 1080 de large, 70-110 conseillé),"color":"#RRGGBB","accent":"#RRGGBB","box":"none|box|pill|highlight|outline","boxColor":"#RRGGBB","anim":"pop|fade|slide|bounce|zoom|typewriter|words","uppercase":true|false}
- {"type":"emoji","emoji":"🔥","x":0-1,"y":0-1,"size":40-500 (120-200 conseillé),"anim":"pop|bounce|float|spin|shake"}
- {"type":"zoom","scale":1.05-2.2,"x":0-1,"y":0-1 (point visé),"ease":"smooth|punch|shake"}
- {"type":"shape","shape":"arrow|circle|underline|box","x":0-1,"y":0-1,"w":0.03-1,"h":0.01-1,"color":"#RRGGBB","rotation":-180..180}
- {"type":"progress","color":"#RRGGBB","position":"top|bottom"}
- {"type":"intro","title":"max 90","subtitle":"optionnel","color":"#RRGGBB","backdrop":"dark|blur|color"}  (écran titre au début, 1.5 à 3 s)
- {"type":"endcard","title":"max 80","button":"optionnel max 30","brand":"optionnel","color":"#RRGGBB"}  (carte de fin, 2 à 3 s, finit à la durée totale)
- {"type":"filter","filter":"bw|warm|cool|vibrant|vintage|cinema|dark","intensity":0-1}
- {"type":"flash","color":"#RRGGBB"}  (flash de transition très court, 0.2 à 0.4 s)
Calques qui TRANSFORMENT la vidéo :
- {"type":"speed","rate":0.25-4}  (ralenti < 1, accéléré > 1, sur le passage start→end)
- {"type":"cut"}  (supprime le passage start→end)
- {"type":"freeze","hold":0.2-5}  (arrêt sur image : l'image à "start" reste figée "hold" secondes ; end = start + 0.2)
- {"type":"effect","effect":"glitch|rgb|mirror|pulse|strobe|echo|invert|grain|vhs|spin|split|blur|zoomin|shake","intensity":0-1,"beat":true|false}
   pulse = zoom qui « tape » au rythme ; strobe = flashs blancs ; echo = traînée de mouvement (top pour la danse) ; rgb = décalage de couleurs ; split = écran divisé en 3 ; zoomin = zoom progressif ; beat:true = l'effet frappe sur chaque temps fort.

Règles :
- Garde les calques existants sauf si on te demande de les changer ou de les supprimer. Conserve leurs "id".
- Utilise la transcription horodatée pour placer textes, emojis et zooms au BON moment (sur les mots importants).
- Zone sûre TikTok : texte entre y=0.12 et y=0.78, x entre 0.15 et 0.85 (le bas et la droite sont cachés par l'interface).
- Évite que deux textes se superposent au même endroit en même temps.
- « Clip de danse / synchro musique » = pulse ou shake au rythme (beat:true) sur les passages énergiques, echo sur les mouvements, 1 ou 2 ralentis courts (0.5) sur les meilleurs gestes, glitch ou rgb sur quelques temps forts, éventuellement un filtre — SANS texte.
- « Retire les textes » = supprime tous les calques text/emoji/intro/endcard.
- Un « montage dynamique » = intro courte ou texte d'accroche, 3 à 6 zooms (punch sur les moments forts), quelques emojis, mots clés en texte, barre de progression, éventuellement un flash et une carte de fin.
- Textes courts (2 à 6 mots), percutants, en français. Un texte reste affiché 1.5 à 3 s, un emoji 1 à 2 s.
- Pendant l'intro et la carte de fin, n'affiche AUCUN autre texte ni emoji.
- Centre les textes (x = 0.5) sauf demande contraire ; place les emojis près du texte, sans le recouvrir.`;

function repair(list: unknown[], duration: number): Layer[] {
  const out: Layer[] = [];
  const seen = new Set<string>();
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const l = { ...(raw as Record<string, unknown>) };
    for (const k of Object.keys(l)) if (l[k] === null) delete l[k];
    let id = typeof l.id === 'string' && l.id ? l.id.slice(0, 40) : `ia-${Date.now().toString(36)}-${i}`;
    if (seen.has(id)) id = `${id.slice(0, 30)}-${i}`;
    seen.add(id);
    l.id = id;
    const start = Math.max(0, Math.min(Number(l.start) || 0, duration - 0.1));
    let end = Number(l.end);
    if (!Number.isFinite(end) || end <= start) end = start + 2;
    l.start = start;
    l.end = Math.min(duration, end);
    for (const k of ['x', 'y', 'intensity']) if (k in l) l[k] = Math.min(1, Math.max(0, Number(l[k]) || 0.5));
    if (typeof l.text === 'string') l.text = l.text.slice(0, 140);
    if (typeof l.title === 'string') l.title = l.title.slice(0, 80);
    if (l.type === 'text') {
      l.size = Math.min(220, Math.max(20, Number(l.size) || 90));
      if (!l.box) l.box = 'none';
      if (!l.anim) l.anim = 'pop';
      if (!l.color) l.color = '#ffffff';
    }
    if (l.type === 'emoji') { l.size = Math.min(500, Math.max(40, Number(l.size) || 160)); if (!l.anim) l.anim = 'pop'; }
    if (l.type === 'zoom') { l.scale = Math.min(2.2, Math.max(1.05, Number(l.scale) || 1.3)); if (!l.ease) l.ease = 'smooth'; if (!('x' in l)) l.x = 0.5; if (!('y' in l)) l.y = 0.4; }
    if (l.type === 'speed') l.rate = Math.min(4, Math.max(0.25, Number(l.rate) || 0.5));
    if (l.type === 'freeze') { l.hold = Math.min(5, Math.max(0.2, Number(l.hold) || 1)); l.end = Math.min(duration, Number(l.start) + 0.2); }
    if (l.type === 'effect') { l.intensity = Math.min(1, Math.max(0.05, Number(l.intensity) || 0.7)); if (typeof l.beat !== 'boolean') delete l.beat; }
    if (l.type === 'shape') { l.w = Math.min(1, Math.max(0.03, Number(l.w) || 0.3)); l.h = Math.min(1, Math.max(0.01, Number(l.h) || 0.15)); l.rotation = Number(l.rotation) || 0; }
    const parsed = LayerSchema.safeParse(l);
    if (parsed.success) out.push(parsed.data);
  });
  // Lisibilité : durées minimales, et rien par-dessus l'intro / la carte de fin.
  const intro = out.find((l) => l.type === 'intro');
  const endcard = out.find((l) => l.type === 'endcard');
  const fixed = out.map((l) => {
    const minLen = l.type === 'text' ? 1.4 : l.type === 'emoji' ? 1 : l.type === 'zoom' ? 0.6 : 0;
    let { start, end } = l;
    if ((l.type === 'text' || l.type === 'emoji') && intro && start < intro.end && end > intro.start) {
      const len = end - start;
      start = intro.end + 0.05;
      end = start + len;
    }
    if (end - start < minLen) end = start + minLen;
    if ((l.type === 'text' || l.type === 'emoji') && endcard && end > endcard.start) end = Math.max(start + 0.3, endcard.start - 0.05);
    end = Math.min(duration, end);
    return { ...l, start: Math.min(start, Math.max(0, end - 0.1)), end } as Layer;
  });
  return fixed.filter((l) => l.end - l.start >= 0.1).slice(0, 60);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour utiliser l’IA.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide' }, { status: 400 });
  const { prompt, duration, layers, words, beats } = parsed.data;
  const beatText = (beats ?? []).map((b) => b.toFixed(2)).join(', ').slice(0, 2500);
  const current = LayersSchema.safeParse(layers).success ? layers : [];
  const transcript = (words ?? [])
    .map((w) => `${w.start.toFixed(1)} ${w.word}`)
    .join(' | ')
    .slice(0, 6000);

  try {
    const raw = (await chatJson({
      system: SYSTEM,
      user: `Durée de la vidéo : ${duration.toFixed(1)} s.\nTemps forts de la musique (s) : ${beatText || '(non détectés)'}\nTranscription (secondes mot) : ${transcript || '(pas de parole)'}\nCalques actuels : ${JSON.stringify(current)}\n\nDemande du client : ${prompt}`,
      maxTokens: 4000,
      temperature: 0.5
    })) as { message?: unknown; layers?: unknown };
    const list = Array.isArray(raw?.layers) ? raw.layers : null;
    if (!list) return NextResponse.json({ error: "L'IA n'a pas compris, reformulez votre demande." }, { status: 502 });
    const result = repair(list, duration);
    return NextResponse.json({
      layers: result,
      message: typeof raw.message === 'string' ? raw.message.slice(0, 300) : 'C’est fait.'
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
