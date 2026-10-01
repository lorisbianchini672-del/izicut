/**
 * Traduit les erreurs techniques (yt-dlp, ffmpeg, IA…) en message clair pour
 * le client. Le message technique complet reste dans les logs du worker.
 */
const RULES = [
  [/not a bot|sign in to confirm|cookies|HTTP Error 429|too many requests/i,
    "YouTube a temporairement bloqué le téléchargement. Réessayez dans quelques minutes ou importez le fichier vidéo directement."],
  [/private video|vidéo privée|members-only|join this channel/i,
    "Cette vidéo est privée ou réservée aux membres : impossible de la récupérer. Utilisez une vidéo publique ou importez le fichier."],
  [/video unavailable|not available|has been removed|404/i,
    "Cette vidéo est introuvable ou indisponible dans notre région. Vérifiez le lien."],
  [/age.?restricted|confirm your age/i,
    "Cette vidéo est soumise à une restriction d'âge et ne peut pas être récupérée automatiquement. Importez le fichier directement."],
  [/live event|is live|premiere/i,
    "Les directs et premières en cours ne sont pas pris en charge. Réessayez une fois la vidéo publiée."],
  [/unsupported url|no video formats|invalid url/i,
    "Ce lien n'est pas pris en charge. Collez un lien YouTube, Twitch (VOD) ou importez le fichier."],
  [/too long|durée maximale|duration/i,
    "La vidéo dépasse la durée maximale autorisée par votre offre."],
  [/no speech|transcri|whisper|aucune parole/i,
    "Nous n'avons pas pu détecter de parole dans cette vidéo : les clips IA ont besoin d'une voix."],
  [/ENOSPC|no space/i,
    "Nos serveurs sont momentanément saturés. Réessayez dans quelques minutes."],
];

const FALLBACK =
  "Le traitement de la vidéo a échoué. Vos minutes ont été recréditées automatiquement ; vous pouvez réessayer.";

export function friendlyError(message) {
  const text = String(message ?? '');
  for (const [re, friendly] of RULES) if (re.test(text)) return friendly;
  return FALLBACK;
}
