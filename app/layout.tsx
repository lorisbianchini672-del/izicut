import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AdPixels } from '@/components/AdPixels';
import { AmbientBackground } from '@/components/ambient/AmbientBackground';
import { SiteNav } from '@/components/home/site-nav';
import { LIGHT_SCRIPT, ThemeByRoute } from '@/components/ThemeByRoute';
import { getSiteUrl } from '@/lib/site-url';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'izicut — vos pubs en motion design, créées avec l’IA',
    template: '%s · izicut'
  },
  description:
    "Entreprises et associations : créez vos pubs, posts et vidéos animées en motion design avec vos photos, vidéos et logo. L'IA monte tout, vous modifiez à volonté. Et vos vidéos longues deviennent des clips sous-titrés.",
  applicationName: 'izicut',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: siteUrl,
    siteName: 'izicut',
    title: 'izicut — vos pubs en motion design, sans agence',
    description:
      'Pubs, posts et vidéos animées pour toutes les entreprises et associations de France, avec vos propres images.'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'izicut — vos pubs en motion design, sans agence',
    description: 'Pubs et vidéos animées avec vos images, modifiables à volonté.'
  }
};

export const viewport: Viewport = {
  themeColor: '#f7f6f4',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${geist.variable} ${geistMono.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        {/* Thème clair des pages publiques appliqué avant l'affichage (pas de flash sombre). */}
        <script dangerouslySetInnerHTML={{ __html: LIGHT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeByRoute />
        <AmbientBackground />
        <SiteNav />
        {children}
        <AdPixels />
      </body>
    </html>
  );
}
