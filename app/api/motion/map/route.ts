import { NextResponse } from 'next/server';

import { fetchMap } from '@/lib/motion/osm';

/** GET /api/motion/map?place=… — tracé réel (OpenStreetMap) d'un lieu pour la scène « carte animée ». */
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const place = new URL(request.url).searchParams.get('place')?.trim().slice(0, 60) ?? '';
  if (place.length < 2) return NextResponse.json({ error: 'Lieu manquant.' }, { status: 400 });
  const geo = await fetchMap(place).catch(() => null);
  return NextResponse.json({ geo: geo ?? null });
}
