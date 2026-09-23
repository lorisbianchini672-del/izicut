#!/usr/bin/env node
/*
 * apply-schema.cjs — IziCut • déploiement idempotent du schéma Supabase.
 *
 * Usage (NE JAMAIS mettre de clef dans le répertoire) :
 *   SUPABASE_SERVICE_ROLE_KEY=<eyJ... ou sb_secret_...> \
 *     node izicut/scripts/apply-schema.cjs            # applique + verifie
 *     node izicut/scripts/apply-schema.cjs --probe     # lecture seule
 *
 * Si NEXT_PUBLIC_SUPABASE_URL est absent, la ref est deduite du JWT.
 * SECURITE : aucune clef dans le fichier (process.env seulement) ;
 * l'ecriture est refusee si des tables non-izicut existent (protege
 * la base legacy) ; tout ecriture est dans une transaction (ROLLBACK
 * en cas d'erreur). La clef n'est JAMAIS affichee.
 */
const fs = require('fs');
const pg = require('pg');
const { Client } = pg;

let KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
const PROBE = process.argv.includes('--probe');
const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

if (!KEY) {
  console.error('[apply-schema] Usage: SUPABASE_SERVICE_ROLE_KEY=<key> [NEXT_PUBLIC_SUPABASE_URL=<url>] node izicut/scripts/apply-schema.cjs [--probe]');
  process.exit(2);
}

let ref;
if (URL_ENV) {
  ref = new URL(URL_ENV).hostname.replace('.supabase.co', '');
} else if (KEY.startsWith('eyJ')) {
  try { ref = JSON.parse(b64urlDecode(KEY.split('.')[1])).ref; }
  catch (e) { console.error('[apply-schema] Impossible de decoder la ref depuis la clef JWT. Fournissez NEXT_PUBLIC_SUPABASE_URL.'); process.exit(2); }
} else {
  console.error('[apply-schema] Clef sb_secret non-JWT : fournissez NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}

const schemaPath = '/Users/lorisbianchini/IziFacture/izicut/supabase/schema.sql';
const sql = fs.readFileSync(schemaPath, 'utf8');

const client = new Client({
  host: 'db.' + ref + '.supabase.co',
  port: 6543,
  user: 'postgres.' + ref,
  password: KEY,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const OWN = new Set([
  'profiles', 'projects', 'clips', 'transcripts', 'render_jobs',
  'credit_accounts', 'credit_ledger', 'stripe_events', 'credit_balances',
]);
function splitStatements(src) {
  const out = []; let buf = ''; let i = 0; const n = src.length;
  const flush = () => { if (buf.trim()) { out.push(buf.trim()); buf = ''; } };
  while (i < n) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '$' && src[i + 1] === '$') {
      buf += '$$'; i += 2;
      while (i < n) {
        if (src[i] === '$' && src[i + 1] === '$') { buf += '$$'; i += 2; break; }
        buf += src[i++];
      }
      continue;
    }
    if (c === "'") {
      buf += c; i++;
      while (i < n) {
        if (src[i] === '\\') { buf += src[i]; if (i + 1 < n) { buf += src[i + 1]; i += 2; } continue; }
        if (src[i] === "'") { buf += src[i++]; break; }
        buf += src[i++];
      }
      continue;
    }
    if (c === ';') { buf += c; flush(); i++; continue; }
    buf += c; i++;
  }
  flush();
  return out;
}

(async () => {
  try {
    await client.connect();
    console.log('[apply-schema] CONNECT OK -> db.' + ref + '.supabase.co:6543  (user postgres.' + ref + ')');

    const existing = await client.query("select tablename from pg_tables where schemaname='public' order by 1");
    const tables = existing.rows.map(r => r.tablename);
    const others = tables.filter(t => !OWN.has(t));
    const izicutThere = tables.filter(t => OWN.has(t));

    console.log('[apply-schema] tables publiques existantes (' + tables.length + ') : ' + (tables.length ? tables.join(', ') : '(vide)'));

    if (others.length) {
      console.log('[apply-schema] ATTENTION : tables non-izicut presentes -> ' + others.join(', ') + '.');
      console.log('[apply-schema] Cette base n-est pas une base izicut vierge (probable base legacy). ABANDON garanti : aucune ecriture effectuee.');
      process.exitCode = 1;
      await client.end(); return;
    }

    if (PROBE) {
      console.log('[apply-schema] --probe : OK. base vierge ou deja appliquee (idempotente). ' + (izicutThere.length ? 'tables deja presentes : ' + izicutThere.join(',') + ' -> rejouable.' : 'cible vierge -> applicabel.'));
      await client.end(); return;
    }

    // ---- APPLY ----
    const stmts = splitStatements(sql);
    console.log('[apply-schema] ' + stmts.length + ' instructions a executer en transaction.');
    await client.query('BEGIN');
    let applied = 0, err = null;
    for (const s of stmts) {
      try { await client.query(s); applied++; }
      catch (e) { err = 'stmt #' + (applied + 1) + ' : ' + (e.message || '').split('\n')[0]; break; }
    }
    if (err) {
      await client.query('ROLLBACK');
      console.log('[apply-schema] ERREUR -> ROLLBACK (rien n est ecrit) : ' + err);
      process.exitCode = 1;
    } else {
      await client.query('COMMIT');
      console.log('[apply-schema] COMMIT : ' + applied + ' instructions appliquees.');
      const t = await client.query("select count(*)::int as c from pg_tables where schemaname='public' and tablename in ('profiles','projects','clips','transcripts','render_jobs','credit_accounts','credit_ledger','stripe_events')");
      const f = await client.query("select count(*)::int as c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
      const b = await client.query('select id, public from storage.buckets order by 1');
      console.log('[apply-schema] VERIF -> tables izicut=' + t.rows[0].c + '/8, fonctions=' + f.rows[0].c + '/10, buckets=' + b.rowCount + '  (raw-videos=false, clips=false attendus)');
      for (const x of b.rows) console.log('          bucket ' + x.id + ' public=' + x.public);
    }
  } catch (e) {
    console.log('[apply-schema] CONNECT/ERREUR : ' + (e.message || '').split('\n')[0]);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch (_) {}
  }
})();
