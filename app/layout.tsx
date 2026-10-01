import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SiteNav } from '@/components/home/site-nav';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'IziCut — transformez vos vidéos longues en clips viraux',
    template: '%s · IziCut'
  },
  description:
    "Déposez une vidéo longue : l'IA repère les meilleurs moments et génère des clips 9:16 sous-titrés, prêts pour TikTok, Reels et Shorts.",
  applicationName: 'IziCut',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: siteUrl,
    siteName: 'IziCut',
    title: 'IziCut — vos vidéos longues en clips viraux',
    description:
      'Transcription mot-à-mot, détection des moments forts par IA, rendu 9:16 sous-titré.'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IziCut — vos vidéos longues en clips viraux',
    description: 'De la vidéo longue au clip viral, sans montage.'
  }
};

export const viewport: Viewport = {
  themeColor: '#05060a',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
