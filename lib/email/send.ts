/**
 * Envoi d'emails via Resend (API HTTP, sans dépendance).
 * Variables : RESEND_API_KEY (obligatoire), EMAIL_FROM (ex. « IziCut <bonjour@mondomaine.fr> »),
 * EMAIL_REPLY_TO (facultatif). Sans clé, l'envoi est simplement ignoré.
 */
import { renderEmail, type EmailContent } from './layout';

export type SendResult = { ok: boolean; id?: string; skipped?: boolean; error?: string };

export async function sendEmail(to: string, subject: string, content: EmailContent, opts: { idempotencyKey?: string } = {}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.warn('[email] RESEND_API_KEY ou EMAIL_FROM manquant : email non envoyé.');
    return { ok: false, skipped: true };
  }
  const { html, text } = renderEmail(content);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey.slice(0, 256) } : {})
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {})
      }),
      signal: AbortSignal.timeout(10_000)
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      console.error(`[email] Resend a refusé l’envoi (${res.status}) : ${json.message ?? ''}`);
      return { ok: false, error: json.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    console.error('[email] envoi impossible :', err);
    return { ok: false, error: err instanceof Error ? err.message : 'erreur réseau' };
  }
}
