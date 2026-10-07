/**
 * Emails envoyés par le worker via Resend (même charte que le site).
 * Variables : RESEND_API_KEY, EMAIL_FROM, SITE_URL (ou NEXT_PUBLIC_SITE_URL).
 * Sans clé, rien n'est envoyé.
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout({ preview, title, paragraphs, cta }) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#070618;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070618;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;color:#f2f0ff;font-weight:700;font-size:17px;"><span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:10px;background:#a990ff;color:#0c0a22;font-size:13px;text-align:center;margin-right:10px;">IZ</span>IziCut</td></tr>
<tr><td style="border-radius:24px;padding:1px;background:linear-gradient(135deg,#8f74ff,#6d4df2 40%,#c79cff 70%,#ffd28a);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:23px;background:#0c0a22;"><tr><td style="padding:32px 28px;">
<h1 style="margin:0 0 16px;color:#f2f0ff;font-size:24px;line-height:1.25;">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;color:#c9c6e6;font-size:15px;line-height:1.6;">${esc(p)}</p>`).join('')}
${cta ? `<a href="${esc(cta.href)}" style="display:inline-block;margin-top:10px;padding:13px 26px;border-radius:999px;background:#a990ff;color:#0c0a22;font-weight:700;font-size:15px;text-decoration:none;">${esc(cta.label)}</a>` : ''}
</td></tr></table></td></tr>
<tr><td style="padding:20px 8px 0;color:#75729b;font-size:12px;text-align:center;">IziCut — vos pubs en motion design, créées avec l’IA.<br>Vous recevez cet email car vous avez un compte IziCut.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, '', ...paragraphs, ...(cta ? ['', `${cta.label} : ${cta.href}`] : []), '', '— IziCut'].join('\n');
  return { html, text };
}

async function sendEmail(to, subject, content, idempotencyKey) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !to) return false;
  const { html, text } = layout(content);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [to], subject, html, text, ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}) }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) console.warn(`[email] Resend ${res.status} : ${await res.text().catch(() => '')}`);
    return res.ok;
  } catch (err) {
    console.warn(`[email] envoi impossible : ${err?.message ?? err}`);
    return false;
  }
}

const siteUrl = () => (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://izicut.vercel.app').replace(/\/$/, '');

/**
 * Quand tous les clips d'un projet sont rendus, on prévient le client (une
 * seule fois grâce à la clé d'idempotence Resend).
 */
export async function notifyProjectReady(supabase, project) {
  try {
    if (!process.env.RESEND_API_KEY) return;
    const { data: clips } = await supabase.from('clips').select('status').eq('project_id', project.id);
    if (!clips?.length || clips.some((c) => c.status !== 'ready' && c.status !== 'failed')) return;
    const ready = clips.filter((c) => c.status === 'ready').length;
    if (!ready) return;
    const { data } = await supabase.auth.admin.getUserById(project.user_id);
    const email = data?.user?.email;
    if (!email) return;
    const title = project.title ? `« ${String(project.title).slice(0, 80)} »` : 'votre vidéo';
    await sendEmail(
      email,
      `Vos ${ready} clip${ready > 1 ? 's sont prêts' : ' est prêt'} 🎬`,
      {
        preview: 'Vos clips 9:16 sous-titrés sont prêts à télécharger.',
        title: `${ready} clip${ready > 1 ? 's' : ''} prêt${ready > 1 ? 's' : ''} pour ${title}`,
        paragraphs: [
          'Vos clips verticaux sous-titrés sont prêts : téléchargez-les, retouchez-les dans l’éditeur ou ajoutez des effets avec le Montage IA.',
          'Astuce : générez le texte de publication (légende + hashtags) depuis la page du projet.'
        ],
        cta: { label: 'Voir mes clips', href: `${siteUrl()}/project/${project.id}` }
      },
      `project-ready-${project.id}`
    );
  } catch (err) {
    console.warn(`[email] notification projet : ${err?.message ?? err}`);
  }
}
