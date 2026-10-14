'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';

const KEY = 'izicut-cookies';

/**
 * Pixels publicitaires TikTok et Meta : chargés seulement si leurs identifiants
 * sont configurés ET si le visiteur a accepté les cookies (règles CNIL).
 */
export function AdPixels() {
  const tt = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.replace(/[^A-Za-z0-9]/g, '');
  const meta = process.env.NEXT_PUBLIC_META_PIXEL_ID?.replace(/\D/g, '');
  const [choice, setChoice] = useState<'yes' | 'no' | null | 'unknown'>('unknown');
  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(KEY); } catch { /* stockage bloqué */ }
    setChoice(v === 'yes' || v === 'no' ? v : null);
  }, []);
  if (!tt && !meta) return null;
  const decide = (v: 'yes' | 'no') => { try { localStorage.setItem(KEY, v); } catch { /* stockage bloqué */ } setChoice(v); };
  if (choice !== 'yes') {
    if (choice !== null) return null;
    return (
      <div role="dialog" aria-label="Cookies" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#111113]/95 p-4 text-sm text-white shadow-2xl backdrop-blur sm:bottom-5">
        <p className="text-white/80">On utilise des cookies de mesure publicitaire (TikTok, Meta) pour savoir quelles pubs vous ont fait découvrir izicut. Vous pouvez refuser.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => decide('no')} className="cursor-pointer rounded-full border border-white/15 px-4 py-2 text-white/80 hover:text-white">Refuser</button>
          <button type="button" onClick={() => decide('yes')} className="cursor-pointer rounded-full bg-white px-4 py-2 font-semibold text-black">Accepter</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {tt ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">{`!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tt}');ttq.page();}(window, document, 'ttq');`}</Script>
      ) : null}
      {meta ? (
        <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');`}</Script>
      ) : null}
    </>
  );
}
