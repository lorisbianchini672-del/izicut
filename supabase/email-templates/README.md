# Emails IziCut avec Resend

## 1. Variables d'environnement

| Variable | Où | Exemple |
|---|---|---|
| `RESEND_API_KEY` | Vercel **et** Railway (worker) | clé `re_…` créée dans Resend (accès « Sending », limitée au domaine) |
| `EMAIL_FROM` | Vercel **et** Railway | `IziCut <bonjour@votre-domaine.fr>` |
| `EMAIL_REPLY_TO` | Vercel et Railway (facultatif) | `contact@votre-domaine.fr` |
| `SITE_URL` | Railway | `https://izicut.vercel.app` (ou votre domaine) |

Sans `RESEND_API_KEY`, aucun email n'est envoyé (le site fonctionne normalement).

## 2. Emails envoyés par le site et le worker

- **Bienvenue** : après la confirmation du compte (une seule fois par compte).
- **3 pubs gratuites utilisées** : quand un compte Free crée sa 3e pub.
- **Clips prêts** : quand tous les clips d'un projet sont rendus (worker).

## 3. Emails de connexion Supabase via Resend (SMTP)

Supabase → Authentication → Emails → **SMTP Settings** → Enable custom SMTP :

- Sender email : `bonjour@votre-domaine.fr` · Sender name : `IziCut`
- Host : `smtp.resend.com` · Port : `465`
- Username : `resend` · Password : votre clé Resend

Puis Authentication → Rate Limits : montez « emails envoyés par heure » (ex. 100).

## 4. Modèles d'emails en français

Authentication → Emails → Templates, collez :

- Confirm signup → `confirm-signup.html` (sujet : « Confirmez votre adresse IziCut »)
- Reset password → `reset-password.html` (sujet : « Votre nouveau mot de passe IziCut »)
- Magic link → `magic-link.html` (sujet : « Votre lien de connexion IziCut »)
- Change email address → `change-email.html` (sujet : « Confirmez votre nouvelle adresse »)

Vérifiez que **Site URL** (Authentication → URL Configuration) pointe vers l'adresse publique du site.
