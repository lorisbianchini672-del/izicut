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
  [/no speech|aucune parole/i,
    "Aucune parole détectée dans cette vidéo (musique seule, animation ou son coupé). IziCut découpe les vidéos où quelqu'un parle : interviews, podcasts, vlogs, formations… Pour une vidéo animée sans voix, utilisez plutôt le Studio Motion."],
  [/aucun clip retourné|aucun moment fort/i,
    "L'IA n'a trouvé aucun passage assez percutant dans cette vidéo. Essayez une vidéo plus longue où l'on parle davantage (au moins 2 à 3 minutes de parole)."],
  [/ENOSPC|no space/i,
    "Nos serveurs sont momentanément saturés. Réessayez dans quelques minutes."],
];

const FALLBACK =
  "Un problème technique a interrompu le traitement. Réessayez dans quelques minutes ; si cela se reproduit, contactez-nous.";

export function friendlyError(message) {
  const text = String(message ?? '');
  for (const [re, friendly] of RULES) if (re.test(text)) return friendly;
  return FALLBACK;
}
