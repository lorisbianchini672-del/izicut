/**
 * Garde-fou réseau (anti-SSRF) : n'autorise que des adresses publiques en
 * http(s), sans identifiants ni port exotique. Couvre l'IPv4, l'IPv6 et les
 * IPv4 cachées dans de l'IPv6 (::ffff:…, 64:ff9b::…, 2002:…).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function privateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)        // CGNAT
    || (a === 169 && b === 254)                  // lien local / métadonnées cloud
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))     // bancs de test
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

/** Développe une adresse IPv6 en 8 groupes de 16 bits (null si invalide). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  let tail: number[] = [];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const q = v4[1].split('.').map(Number);
    tail = [(q[0] << 8) | q[1], (q[2] << 8) | q[3]];
    s = s.slice(0, -v4[1].length).replace(/:$/, '') || '';
    if (s.endsWith(':')) s += '0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (x: string) => (x ? x.split(':').map((h) => parseInt(h, 16)) : []);
  const head = parse(halves[0]);
  const back = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - tail.length - head.length - back.length;
  const g = halves.length === 2 ? [...head, ...Array(Math.max(0, fill)).fill(0), ...back, ...tail] : [...head, ...tail];
  return g.length === 8 && g.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? g : null;
}

export function privateIp(ip: string): boolean {
  if (!ip.includes(':')) return privateV4(ip);
  const g = v6Groups(ip);
  if (!g) return true;
  const v4of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.every((n) => n === 0)) return true;                                   // ::
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true;         // ::1
  if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0)) return privateV4(v4of(g[6], g[7])); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(v4of(g[6], g[7]));  // NAT64
  if (g[0] === 0x2002) return privateV4(v4of(g[1], g[2]));                     // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                 // ULA fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true;                                 // lien local
  if ((g[0] & 0xff00) === 0xff00) return true;                                 // multicast
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true;                          // documentation
  return false;
}

export async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(local|internal|localhost|lan|home|corp)$/.test(host) || !/[.:]/.test(host)) return null;
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length || ips.some(privateIp)) return null;
  return u;
}
