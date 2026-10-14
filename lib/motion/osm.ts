/**
 * Vraie carte d'un lieu pour les pubs (« la carte de Lyon ») : géocodage
 * Nominatim + grands axes et cours d'eau via Overpass (données
 * OpenStreetMap, © les contributeurs OpenStreetMap, licence ODbL).
 * Le résultat est un jeu de tracés SVG (repère 0–1000) que le moteur
 * anime comme dans After Effects (routes qui se dessinent, épingle…).
 */

export type MapGeo = { name: string; roads: string[]; major: string[]; water: string[] };

const UA = 'izicut/1.0 (+https://izicut.vercel.app)';
const cache = new Map<string, { at: number; geo: MapGeo | null }>();

type Pt = [number, number];

function toPaths(lines: Pt[][], maxLen = 2900, maxPaths = 10): string[] {
  const out: string[] = [];
  let cur = '';
  for (const line of lines) {
    const seg: Pt[] = [];
    for (const p of line) {
      const last = seg[seg.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 7) seg.push(p);
    }
    if (seg.length < 2) continue;
    const d = `M${seg.map((p) => `${Math.round(p[0])} ${Math.round(p[1])}`).join('L')}`;
    if (d.length > maxLen) continue;
    if (cur.length + d.length > maxLen) { out.push(cur); cur = ''; if (out.length >= maxPaths) break; }
    cur += d;
  }
  if (cur && out.length < maxPaths) out.push(cur);
  return out;
}

export async function fetchMap(place: string): Promise<MapGeo | null> {
  const key = place.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.geo;
  let geo: MapGeo | null = null;
  try {
    const g = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(7000) });
    const arr = (await g.json()) as { lat: string; lon: string; display_name: string }[];
    if (arr[0]) {
      const lat = Number(arr[0].lat), lon = Number(arr[0].lon);
      const r = 0.028; // ≈ 3 km autour du centre
      const k = Math.cos((lat * Math.PI) / 180);
      const s = lat - r, n = lat + r, w = lon - r / k, e = lon + r / k;
      const q = `[out:json][timeout:20];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${s},${w},${n},${e});way["waterway"~"^(river|canal)$"](${s},${w},${n},${e}););out geom;`;
      const o = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(q)}`, signal: AbortSignal.timeout(20000) });
      const data = (await o.json()) as { elements?: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] };
      const proj = (p: { lat: number; lon: number }): Pt => [((p.lon - w) / (e - w)) * 1000, ((n - p.lat) / (n - s)) * 1000];
      const roads: Pt[][] = [], major: Pt[][] = [], water: Pt[][] = [];
      for (const el of data.elements ?? []) {
        const pts = (el.geometry ?? []).map(proj).filter((p) => p[0] > -50 && p[0] < 1050 && p[1] > -50 && p[1] < 1050);
        if (pts.length < 2) continue;
        if (el.tags?.waterway) water.push(pts);
        else if (/motorway|trunk|primary/.test(el.tags?.highway ?? '')) major.push(pts);
        else roads.push(pts);
      }
      const name = arr[0].display_name.split(',')[0] || place;
      if (roads.length + major.length > 5) geo = { name, roads: toPaths(roads, 2900, 14), major: toPaths(major, 2900, 6), water: toPaths(water, 2900, 3) };
    }
  } catch {
    geo = null;
  }
  cache.set(key, { at: Date.now(), geo });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return geo;
}

/** Plan stylisé de secours (jamais d'écran vide si la carte réelle est indisponible). */
export function fallbackMap(name: string): MapGeo {
  let seed = [...name].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lines: Pt[][] = [];
  for (let i = 0; i < 26; i++) {
    const vertical = i % 2 === 0;
    const base = rnd() * 1000;
    const pts: Pt[] = [];
    for (let t = 0; t <= 1000; t += 125) pts.push(vertical ? [base + (rnd() - 0.5) * 60, t] : [t, base + (rnd() - 0.5) * 60]);
    lines.push(pts);
  }
  const river: Pt[] = [];
  for (let t = 0; t <= 1000; t += 50) river.push([t, 520 + Math.sin(t / 160) * 120]);
  return { name, roads: toPaths(lines.slice(6), 2900, 10), major: toPaths(lines.slice(0, 6), 2900, 3), water: toPaths([river], 2900, 1) };
}
