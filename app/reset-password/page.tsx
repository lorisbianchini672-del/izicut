'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Lock } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { EASE } from '@/components/home/motion';

/**
 * /reset-password — choix d'un nouveau mot de passe.
 * On y arrive depuis l'email « Mot de passe oublié » : /auth/confirm a déjà
 * ouvert une session de récupération, il ne reste qu'à enregistrer le mot
 * de passe.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<'checking' | 'ok' | 'no-session'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setReady(data.user ? 'ok' : 'no-session'));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.');
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setPending(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (updateError) return setError(updateError.message);
    setDone(true);
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 1500);
  }

  return (
    <main className="izi-page izi-noise relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-28">
      <div aria-hidden className="izi-grid pointer-events-none absolute inset-0 opacity-70" />
      <motion.div
        initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: EASE }}
        className="relative w-full max-w-[420px]"
      >
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">
          Nouveau <span className="izi-neon-text">mot de passe.</span>
        </h1>

        {ready === 'no-session' ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-rec/30 bg-rec/10 p-4 text-sm text-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rec" />
            <p>
              Ce lien a expiré ou a déjà servi.{' '}
              <Link href="/login" className="text-neon underline-offset-4 hover:underline">Redemandez un email</Link> depuis la page de connexion.
            </p>
          </div>
        ) : done ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-neon/30 bg-neon/10 p-4 text-sm text-fg" role="status">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neon" />
            Mot de passe enregistré. Redirection vers votre studio…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {[
              ['new-password', 'Nouveau mot de passe', password, setPassword],
              ['confirm-password', 'Confirmez le mot de passe', confirm, setConfirm],
            ].map(([id, label, value, set]) => (
              <div key={id as string} className="space-y-2">
                <label htmlFor={id as string} className="text-xs font-medium text-fg-muted">{label as string}</label>
                <div className="relative rounded-xl border border-line-strong bg-ink-900/70 transition-colors focus-within:border-neon/60">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                  <input
                    id={id as string}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={value as string}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                    className="w-full bg-transparent py-3 pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
                    placeholder="6 caractères minimum"
                  />
                </div>
              </div>
            ))}
            <button
              type="submit"
              disabled={pending || ready !== 'ok'}
              className="izi-focus group inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3.5 text-sm font-semibold text-ink-950 shadow-[0_0_36px_-8px_rgb(169_144_255/0.8)] disabled:cursor-wait disabled:opacity-60"
            >
              {pending || ready === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer et continuer
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-rec">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            ) : null}
          </form>
        )}
      </motion.div>
    </main>
  );
}
