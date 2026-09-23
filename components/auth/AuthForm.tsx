'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/landing/Logo';
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-orb bg-orb-purple -top-24 -left-24 h-[420px] w-[420px] opacity-30 animate-aurora" />
        <div className="bg-orb bg-orb-blue -bottom-24 -right-24 h-[380px] w-[380px] opacity-25 animate-aurora" />
        <div className="absolute inset-0 bg-grid opacity-[0.12]" />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo href="/" size="lg" subtitle="AI Video Studio" />
        </div>

        <div className="card-spotlight rounded-3xl border border-border/60 bg-card/50 p-8 backdrop-blur-2xl">
          <h1 className="text-2xl font-black tracking-tight">
            <span className="text-foreground">Accédez au </span>
            <span className="animate-gradient-x bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-rose-400 bg-[length:200%_auto] bg-clip-text text-transparent">
              studio
            </span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Importez une vidéo longue : l&apos;IA repère les meilleurs moments et génère vos clips
            9:16 sous-titrés.
          </p>

          <div className="mt-6 flex gap-1 rounded-xl border border-border/50 bg-muted/30 p-1">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => switchMode(m.key)}
                className={cn(
                  'relative flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
                  mode === m.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mode === m.key && (
                  <motion.span
                    layoutId="auth-mode"
                    className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-primary to-accent"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                {m.label}
              </button>
            ))}
          </div>

          {!supabaseConfigured && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">Supabase non configuré</p>
                <p>
                  Le formulaire reste inactif jusqu&apos;à ce que <code>.env.local</code> contienne{' '}
                  <code>NEXT_PUBLIC_SUPABASE_URL</code> et{' '}
                  <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground/80">
                Adresse email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="pl-10"
                />
              </div>
            </div>

            {mode !== 'magic' && (
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-foreground/80">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? '6 caractères minimum' : '••••••••'}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="gradient"
              disabled={pending || !supabaseConfigured}
              className="w-full rounded-xl py-3 font-semibold"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Traitement…' : submitLabel}
            </Button>
          </form>

          <AnimatePresence initial={false}>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
                <span>{error}</span>
              </motion.div>
            )}

            {notice && (
              <motion.div
                key="notice"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                <span>{notice}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            En continuant, vous acceptez les{' '}
            <Link href="/cgu" className="text-primary hover:underline">
              CGU
            </Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="text-primary hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>

        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pas encore prêt à créer un compte ?{' '}
          <Link href="/editor/clip-demo" className="font-semibold text-primary hover:underline">
            Essayer le studio de démo
          </Link>
        </p>
      </div>
    </main>
  );
}

export default AuthForm;
