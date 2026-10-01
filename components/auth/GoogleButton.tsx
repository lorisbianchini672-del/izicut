'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Bouton « Se connecter avec Google » officiel (Google Identity Services).
 *
 * Pourquoi pas signInWithOAuth ? La redirection OAuth classique passe par
 * l'URL de Supabase : l'écran Google affiche alors « azfz….supabase.co ».
 * Avec GIS, Google affiche le domaine du site (izicut.vercel.app) et le nom
 * de l'appli, puis on échange le jeton d'identité avec Supabase
 * (signInWithIdToken). Aucun domaine personnalisé payant n'est nécessaire.
 *
 * L'ID client Google est public par nature (il figure dans le HTML de toute
 * page qui utilise GIS) : la valeur par défaut ci-dessous n'est pas un secret.
 */
const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '329689575909-0p6fh2qo4arv8ke8k5g3r6t922e6tc8g.apps.googleusercontent.com';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

type GoogleCredentialResponse = { credential?: string };

type GoogleIdApi = {
  initialize: (opts: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

function loadGis(): Promise<GoogleIdApi> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () =>
      window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('gis'))
    );
    script.addEventListener('error', () => reject(new Error('gis')));
  });
}

/** Nonce aléatoire : brut pour Supabase, haché (SHA-256 hex) pour Google. */
async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { raw, hashed };
}

type Props = {
  disabled?: boolean;
  /** Appelé après une connexion réussie. */
  onSuccess: () => void;
  onError: (message: string) => void;
  /** Rendu de secours si le script Google ne charge pas (bloqueur, réseau…). */
  fallback: React.ReactNode;
};

export function GoogleButton({ disabled, onSuccess, onError, fallback }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!slot.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(slot.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !slot.current) return;
    let cancelled = false;

    (async () => {
      try {
        const [gis, nonce] = await Promise.all([loadGis(), makeNonce()]);
        if (cancelled || !slot.current) return;

        gis.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          use_fedcm_for_button: true,
          callback: async (response: GoogleCredentialResponse) => {
            if (!response.credential) return onError('Connexion Google annulée.');
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: nonce.raw
            });
            if (error) onError(error.message);
            else onSuccess();
          }
        });

        slot.current.innerHTML = '';
        gis.renderButton(slot.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          locale: 'fr',
          width: Math.min(400, Math.max(200, width))
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  if (failed) return <>{fallback}</>;

  return (
    <div
      className={disabled ? 'pointer-events-none mt-6 opacity-60' : 'mt-6'}
      aria-busy={!width}
    >
      <div ref={slot} className="flex min-h-[44px] w-full justify-center overflow-hidden rounded-full" />
    </div>
  );
}
