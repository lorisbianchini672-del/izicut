'use client';

/** Dernier filet : remplace toute la page si même la mise en page plante. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 650, margin: '0 0 12px' }}>izicut a rencontré un problème.</h1>
          <p style={{ color: '#a1a1aa', margin: '0 0 24px' }}>Rechargez la page : vos créations enregistrées sont conservées.</p>
          <button type="button" onClick={() => reset()} style={{ cursor: 'pointer', border: 0, borderRadius: 999, padding: '12px 22px', fontWeight: 600, background: '#fff', color: '#0a0a0a' }}>Recharger</button>
        </div>
      </body>
    </html>
  );
}
