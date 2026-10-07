'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/landing/Logo';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { useKaraoke } from '@/components/home/caption-preview';
import { EASE, Magnetic, SplitWords } from '@/components/home/motion';
import { PhoneFrame } from '@/components/home/phone-frame';
import { cn } from '@/lib/utils';

type Mode = 'password' | 'signup' | 'magic';

/** Messages renvoyés par nos propres redirections (query `?error=`). */
const REDIRECT_ERRORS: Record<string, string> = {
  supabase_non_configure:
    "Supabase n'est pas encore configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.",
  lien_invalide: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.'
};

/** Traduit les messages bruts de Supabase Auth en français lisible. */
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('load failed') || m.includes('failed to fetch') || m.includes('network'))
    return "Le serveur Supabase est injoignable (projet en pause ou URL invalide). Réactivez le projet dans le Dashboard Supabase, puis réessayez.";
  if (m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.';
  if (m.includes('email not confirmed'))
    return 'Adresse non confirmée : ouvrez le lien reçu par email avant de vous connecter.';
  if (m.includes('user already registered'))
    return 'Un compte existe déjà avec cet email. Connectez-vous.';
  if (m.includes('password should be at least'))
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('unable to validate email')) return 'Cette adresse email semble invalide.';
  if (m.includes('database error saving new user') || m.includes('unexpected_failure'))
    return "La création du compte a échoué côté base de données. Exécutez supabase/fix-signup-trigger.sql dans Supabase (SQL Editor), puis réessayez.";
  if (m.includes('signups not allowed'))
    return 'Les inscriptions sont fermées sur ce projet Supabase.';
  return message;
}

export interface AuthFormProps {
  /** Chemin interne vers lequel rediriger après connexion. */
  nextPath?: string;
  /** Erreur transmise par l'URL (`?error=`). */
  initialError?: string | null;
  /** Mode initial (`?mode=signup` force l'onglet création de compte). */
  initialMode?: string | null;
}

export function AuthForm({ nextPath = '/dashboard', initialError = null, initialMode = null }: AuthFormProps) {
  const router = useRouter();

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const [mode, setMode] = useState<Mode>(initialMode === 'signup' ? 'signup' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? (REDIRECT_ERRORS[initialError] ?? initialError) : null
  );
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setNotice(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    reset();
  };

  async function handleForgotPassword() {
    reset();
    if (!email.trim()) {
      setError('Entrez d\'abord votre adresse email ci-dessus, puis cliquez sur « Mot de passe oublié ».');
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent('/reset-password')}`
      });
      if (resetError) {
        setError(translateError(resetError.message));
        return;
      }
      setNotice(`Email envoyé à ${email.trim()} : cliquez sur le lien pour choisir un nouveau mot de passe.`);
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    reset();
    setPending(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}` }
    });
    if (oauthError) {
      setError(translateError(oauthError.message));
      setPending(false);
    }
    // En cas de succès, le navigateur part vers Google : rien d'autre à faire.
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!supabaseConfigured) {
      setError(REDIRECT_ERRORS.supabase_non_configure);
      return;
    }

    reset();
    setPending(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`;

      if (mode === 'password') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(translateError(signInError.message));
          return;
        }
        router.push(nextPath);
        router.refresh();
        return;
      }

      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo }
        });
        if (signUpError) {
          setError(translateError(signUpError.message));
          return;
        }
        // Email déjà inscrit : par sécurité Supabase répond « OK » avec un
        // utilisateur fictif sans identité. On l'explique au lieu d'attendre
        // un email de confirmation qui n'arrivera jamais.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setError('Un compte existe déjà avec cet email. Connectez-vous, ou utilisez « Lien magique » si vous avez oublié votre mot de passe.');
          setMode('password');
          return;
        }
        if (!data.session) {
          setNotice(
            `Compte créé. Ouvrez l'email de confirmation puis cliquez sur le lien pour activer votre accès, ensuite connectez-vous avec votre mot de passe.`
          );
          setMode('password');
          return;
        }
        router.push(nextPath);
        router.refresh();
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (otpError) {
        setError(translateError(otpError.message));
        return;
      }
      setNotice(`Lien de connexion envoyé à ${email}. Il expire dans 60 minutes.`);
    } catch (unexpected) {
      setError(
        unexpected instanceof Error
          ? translateError(unexpected.message)
          : 'Une erreur inattendue est survenue.'
      );
    } finally {
      setPending(false);
    }
  }

  const modes: { key: Mode; label: string }[] = [
    { key: 'password', label: 'Connexion' },
    { key: 'signup', label: 'Créer un compte' },
    { key: 'magic', label: 'Lien magique' }
  ];

  const submitLabel =
    mode === 'password'
      ? 'Se connecter'
      : mode === 'signup'
        ? 'Créer mon compte'
        : 'Recevoir le lien de connexion';

  return (
    <main className="izi-page izi-noise relative grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      <div aria-hidden className="izi-grid pointer-events-none absolute inset-0 opacity-70" />

      {/* Colonne vitrine : aperçu produit vivant */}
      <AuthShowcase />

      {/* Colonne formulaire */}
      <section className="relative flex items-center justify-center px-4 pb-16 pt-28 sm:px-8 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: EASE }}
          className="w-full max-w-[420px]"
        >
          <div className="mb-10 lg:hidden">
            <Logo href="/" size="md" />
          </div>

          <h1 className="izi-title-gradient text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            <SplitWords
              key={mode}
              text={mode === 'signup' ? 'Créez votre studio.' : mode === 'magic' ? 'Connexion sans mot de passe.' : 'Bon retour.'}
              accentFrom={mode === 'signup' ? 1 : mode === 'magic' ? 2 : 1}
              delay={0.05}
            />
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {mode === 'signup'
              ? '30 minutes de vidéo offertes, sans carte bancaire.'
              : mode === 'magic'
                ? 'Recevez un lien de connexion par email.'
                : 'Retrouvez vos projets et vos clips.'}
          </p>

          {/* Sélecteur de mode */}
          <div role="tablist" aria-label="Mode de connexion" className="mt-8 grid grid-cols-3 rounded-xl border border-line bg-white/[0.02] p-1">
            {modes.map((m) => {
              const on = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => switchMode(m.key)}
                  className={cn(
                    'izi-focus relative cursor-pointer rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                    on ? 'text-ink-950' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="auth-mode"
                      className="absolute inset-0 -z-0 rounded-lg bg-neon shadow-[0_0_24px_-6px_rgb(169_144_255/0.8)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{m.label}</span>
                </button>
              );
            })}
          </div>

          {!supabaseConfigured && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-rec/30 bg-rec/10 p-4 text-xs text-fg">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rec" />
              <p>Configuration Supabase manquante : le formulaire est désactivé.</p>
            </div>
          )}

          {mode !== 'magic' && (
            <>
              <GoogleButton
                disabled={pending || !supabaseConfigured}
                onSuccess={() => {
                  router.push(nextPath);
                  router.refresh();
                }}
                onError={(message) => setError(translateError(message))}
                fallback={
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={pending || !supabaseConfigured}
                  className="izi-focus mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong bg-white/[0.03] px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
                >
                  <GoogleIcon />
                  Continuer avec Google
                </button>
                }
              />
              <div className="mt-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-subtle" aria-hidden>
                <span className="h-px flex-1 bg-line" /> ou par email <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate={false}>
            <Field id="email" label="Adresse email" icon={Mail}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="w-full bg-transparent py-3 pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
            </Field>

            <AnimatePresence initial={false}>
              {mode !== 'magic' && (
                <motion.div
                  key="password"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="overflow-hidden"
                >
                  <Field id="password" label="Mot de passe" icon={Lock}>
                    <input
                      id="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? '6 caractères minimum' : '••••••••'}
                      className="w-full bg-transparent py-3 pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
                    />
                  </Field>
                  {mode === 'password' && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="izi-focus mt-2 cursor-pointer rounded text-xs text-fg-muted underline-offset-4 transition-colors hover:text-neon hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <Magnetic strength={0.15} className="block w-full">
              <button
                type="submit"
                disabled={pending || !supabaseConfigured}
                className="izi-focus group inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 text-sm font-semibold text-ink-950 shadow-[0_0_36px_-8px_rgb(169_144_255/0.8)] transition-all hover:shadow-[0_0_48px_-6px_rgb(169_144_255/0.95)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {pending ? 'Un instant…' : submitLabel}
                {!pending ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
              </button>
            </Magnetic>
          </form>

          <AnimatePresence initial={false}>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-rec/30 bg-rec/10 p-3.5 text-sm text-fg"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rec" />
                <span>{error}</span>
              </motion.div>
            )}
            {notice && (
              <motion.div
                key="notice"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-neon/30 bg-neon/10 p-3.5 text-sm text-fg"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-neon" />
                <span>{notice}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-8 text-xs leading-relaxed text-fg-subtle">
            En continuant, vous acceptez les{' '}
            <Link href="/cgu" className="izi-focus rounded text-fg-muted underline-offset-4 hover:text-fg hover:underline">CGU</Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="izi-focus rounded text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </motion.div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Champ de formulaire : icône, bordure qui s'éclaire au focus. */
function Field({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium text-fg-muted">
        {label}
      </label>
      <div className="relative rounded-xl border border-line-strong bg-ink-900/70 transition-colors focus-within:border-neon/60 focus-within:shadow-[0_0_0_4px_rgb(169_144_255/0.08)]">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        {children}
      </div>
    </div>
  );
}

/** Colonne de gauche : logo, aperçu 9:16 animé, promesse. Masquée sur mobile. */
function AuthShowcase() {
  const { words, active } = useKaraoke();
  return (
    <aside className="relative hidden flex-col justify-between border-r border-line bg-ink-900/40 p-12 pt-28 lg:flex">
      <p className="font-code text-xs uppercase tracking-[0.2em] text-fg-subtle"><span className="mr-2 text-neon">▍</span>Studio IziCut</p>

      <div className="relative mx-auto flex w-full max-w-md items-center justify-center py-10">
        <div aria-hidden className="absolute h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgb(169_144_255/0.14),transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 40, rotate: -4, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, rotate: -3, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
          className="relative w-[230px]"
        >
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
            <PhoneFrame template="hormozi" words={words} active={active} hook="Le secret des 3 premières secondes" />
          </motion.div>
        </motion.div>
        <motion.span
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
          className="absolute right-2 top-16 rounded-full border border-line-strong bg-ink-900/90 px-3 py-1.5 font-code text-xs text-fg shadow-xl backdrop-blur"
        >
          <span className="text-neon">91</span> / 100 score viral
        </motion.span>
      </div>

      <div>
        <p className="max-w-sm text-balance text-2xl font-semibold tracking-tight text-fg">
          Une vidéo longue. <span className="izi-neon-text">Des clips qui retiennent.</span>
        </p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-fg-muted">
          Transcription mot à mot, moments forts notés par l&apos;IA, rendu 9:16 sous-titré.
        </p>
      </div>
    </aside>
  );
}

export default AuthForm;
