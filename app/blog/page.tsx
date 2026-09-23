import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Flame } from 'lucide-react';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';
import { BlogGrid } from '@/components/marketing/BlogGrid';

export const metadata: Metadata = {
  title: 'Blog créateurs',
  description:
    'Méthodes, analyses et coulisses du clipping IA : hooks qui convertissent, sous-titres mot-à-mot, cadrage 9:16 et monétisation des créateurs.',
  openGraph: {
    title: 'Blog créateurs · IziCut',
    description: 'Astuces IA, cadrage 9:16 et monétisation pour les créateurs de shorts.'
  }
};

export default function BlogPage() {
  return (
    <InfoPage
      eyebrow="Blog créateurs"
      title="Le blog IziCut"
      description="Tout ce que nous apprenons en analysant des milliers de clips : structures de hooks, réglages de sous-titres, cadrage vertical et modèles économiques des créateurs."
      breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Blog' }]}
      updatedAt="22 septembre 2026"
      ctaLabel="Créer mon premier clip"
    >
      {/* Article à la une */}
      <InfoSection id="a-la-une" title="À la une">
        <Link
          href="/#features"
          className="group block overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/15 via-card/40 to-accent/15 p-7 backdrop-blur-xl transition-colors hover:border-primary/50"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Flame className="h-3 w-3" />
            Analyse
          </span>
          <h3 className="mt-4 text-xl font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
            Le score de viralité décrypté : les 5 signaux que l’IA repère avant vous
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Tension narrative, chiffre marquant, promesse implicite, rupture de rythme et
            universalité du sujet : voici comment GPT-4o-mini note vos extraits de 0 à 100 — et
            comment lire ce score pour choisir les bons moments à publier.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
            Lire l’analyse
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </InfoSection>

      {/* Tous les articles */}
      <InfoSection id="articles" title="Tous les articles">
        <BlogGrid />
      </InfoSection>

      {/* Rubriques */}
      <InfoSection id="rubriques" title="Nos rubriques">
        <ul>
          <li>
            <strong>Viralité :</strong> décryptage des hooks et des structures qui retiennent.
          </li>
          <li>
            <strong>Sous-titres :</strong> typographie, animations mot-à-mot et accessibilité.
          </li>
          <li>
            <strong>Cadrage :</strong> Safe Zones, suivi de visage et split-screen multi-intervenants.
          </li>
          <li>
            <strong>Workflow :</strong> import YouTube / Twitch, qualité d’encodage et automatisation.
          </li>
          <li>
            <strong>Business :</strong> tarification, prospection et statut de monteur IA freelance.
          </li>
        </ul>
        <p>
          Une idée de sujet ou une méthode qui marche pour vous ? Écrivez-nous à{' '}
          <a href="mailto:support@izicut.app">support@izicut.app</a> : les meilleures contributions
          sont publiées ici.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
