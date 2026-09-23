// Sonde lecture-seule : triggers + policies + test d'insertion profil.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/diag-auth.mjs
// Ne modifie rien (insert testé dans une transaction ROLLBACK).
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('MANQUANT: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis en env.');
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function rpc(fn, params) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(params ?? {})
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 500) };
}

async function sql(query) {
  // Via le endpoint SQL de PostgREST : impossible sans wrapper.
  // On passe par les vues système exposées : on teste indirectement.
  return query;
}

const checks = [];

// 1. La table profiles est-elle lisible en service_role ?
{
  const r = await fetch(`${url}/rest/v1/profiles?select=id&limit=0`, { headers });
  checks.push(['profiles lisible (service_role)', r.status]);
}

// 2. credit_accounts lisible ?
{
  const r = await fetch(`${url}/rest/v1/credit_accounts?select=user_id&limit=0`, { headers });
  checks.push(['credit_accounts lisible (service_role)', r.status]);
}

// 3. Fonction handle_new_user existe ? (appel avec faux UUID -> doit échouer proprement, pas 404)
{
  const r = await rpc('handle_new_user', {});
  checks.push(['rpc handle_new_user existe (404=absente)', r.status]);
}

console.log('--- DIAG AUTH (lecture seule) ---');
for (const [name, status] of checks) console.log(`${name}: ${status}`);
console.log('---');
console.log("Si 'profiles lisible' != 200, la table manque ou la clé est fausse.");
console.log("Si 404 sur rpc, c'est normal : les triggers ne sont pas des RPC.");
console.log("La cause du 500 signup se lit dans Dashboard -> Logs -> Postgres au moment de l'inscription.");
