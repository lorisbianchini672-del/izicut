/**
 * Mise en page des emails IziCut (charte « nuit violette »), compatible avec
 * les messageries : tableaux, styles en ligne, pas d'image externe obligatoire.
 */
export type EmailContent = {
  /** Texte d'aperçu affiché dans la boîte de réception. */
  preview: string;
  title: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footnote?: string;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#070618;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070618;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#c2b2ff,#8a6cff);color:#0c0a22;font-weight:800;font-size:13px;text-align:center;vertical-align:middle;">IZ</td>
    <td style="padding-left:10px;color:#f2f0ff;font-weight:700;font-size:17px;">IziCut</td>
  </tr></table>
</td></tr>
<tr><td style="border-radius:24px;padding:1px;background:linear-gradient(135deg,#8f74ff,#6d4df2 40%,#c79cff 70%,#ffd28a);">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:23px;background:#0c0a22;">
  <tr><td style="padding:32px 28px;">
    <h1 style="margin:0 0 16px;color:#f2f0ff;font-size:24px;line-height:1.25;font-weight:700;">${esc(c.title)}</h1>
    ${c.paragraphs.map((p) => `<p style="margin:0 0 14px;color:#c9c6e6;font-size:15px;line-height:1.6;">${esc(p)}</p>`).join('\n    ')}
    ${c.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td style="border-radius:999px;background:linear-gradient(135deg,#c2b2ff,#a990ff 45%,#8a6cff);">
      <a href="${esc(c.cta.href)}" style="display:inline-block;padding:13px 26px;color:#0c0a22;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">${esc(c.cta.label)}</a>
    </td></tr></table>` : ''}
  </td></tr></table>
</td></tr>
<tr><td style="padding:20px 8px 0;color:#75729b;font-size:12px;line-height:1.6;text-align:center;">
  ${c.footnote ? `${esc(c.footnote)}<br>` : ''}IziCut — vos pubs en motion design, créées avec l’IA.<br>Vous recevez cet email car vous avez un compte IziCut.
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.title, '', ...c.paragraphs, ...(c.cta ? ['', `${c.cta.label} : ${c.cta.href}`] : []), ...(c.footnote ? ['', c.footnote] : []), '', '— IziCut'].join('\n');
  return { html, text };
}
