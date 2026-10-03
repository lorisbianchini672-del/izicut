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
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).max(4000).optional()
});

const SYSTEM = `Tu es un monteur vidéo expert en motion design pour TikTok / Reels (style CapCut). Tu modifies une vidéo 9:16 en ajoutant des CALQUES par-dessus.
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

Règles :
- Garde les calques existants sauf si on te demande de les changer ou de les supprimer. Conserve leurs "id".
- Utilise la transcription horodatée pour placer textes, emojis et zooms au BON moment (sur les mots importants).
- Zone sûre TikTok : texte entre y=0.12 et y=0.78, x entre 0.15 et 0.85 (le bas et la droite sont cachés par l'interface).
- Évite que deux textes se superposent au même endroit en même temps.
- Un « montage dynamique » = intro courte ou texte d'accroche, 3 à 6 zooms (punch sur les moments forts), quelques emojis, mots clés en texte, barre de progression, éventuellement un flash et une carte de fin.
- Textes courts (2 à 6 mots), percutants, en français.`;

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
    if (l.type === 'shape') { l.w = Math.min(1, Math.max(0.03, Number(l.w) || 0.3)); l.h = Math.min(1, Math.max(0.01, Number(l.h) || 0.15)); l.rotation = Number(l.rotation) || 0; }
    const parsed = LayerSchema.safeParse(l);
    if (parsed.success) out.push(parsed.data);
  });
  return out.slice(0, 60);
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
  const { prompt, duration, layers, words } = parsed.data;
  const current = LayersSchema.safeParse(layers).success ? layers : [];
  const transcript = (words ?? [])
    .map((w) => `${w.start.toFixed(1)} ${w.word}`)
    .join(' | ')
    .slice(0, 6000);

  try {
    const raw = (await chatJson({
      system: SYSTEM,
      user: `Durée de la vidéo : ${duration.toFixed(1)} s.\nTranscription (secondes mot) : ${transcript || '(pas de parole)'}\nCalques actuels : ${JSON.stringify(current)}\n\nDemande du client : ${prompt}`,
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
