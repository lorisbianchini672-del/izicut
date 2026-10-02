'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Bandeau admin : YouTube bloque le moteur → cookies à renouveler. */
export function YoutubeStatusBanner() {
  const [status, setStatus] = useState<{ ok: boolean; at: string | null } | null>(null);

  useEffect(() => {
    fetch('/api/system/youtube-status')
      .then((r) => r.json())
      .then((s) => (s?.admin ? setStatus({ ok: s.ok !== false, at: s.at ?? null }) : null))
      .catch(() => undefined);
  }, []);

  if (!status || status.ok) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
      <div>
        <p className="font-semibold text-red-100">Les liens YouTube ne passent plus (admin)</p>
        <p className="mt-1 text-red-200/90">
          YouTube bloque le moteur depuis le{' '}
          {status.at ? new Date(status.at).toLocaleString('fr-FR') : 'dernier essai'} : les cookies du compte
          jetable ont expiré. Refaites l’export en navigation privée (fichier « cookies-izicut.txt ») puis
          mettez à jour YTDLP_COOKIES_B64 sur Railway.
        </p>
      </div>
    </div>
  );
}
