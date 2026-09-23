import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Connexion',
  description:
    'Connectez-vous à IziCut pour importer vos vidéos longues et générer des clips verticaux 9:16 sous-titrés.',
  robots: { index: false, follow: false }
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const { next, error, mode } = await searchParams;
  const nextPath = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  return <AuthForm nextPath={nextPath} initialError={error ?? null} initialMode={mode} />;
}
