import { CaptionStudio } from '@/components/home/caption-studio';
import { Faq } from '@/components/home/faq';
import { FeatureBento } from '@/components/home/feature-bento';
import { FinalCta } from '@/components/home/final-cta';
import { Hero } from '@/components/home/hero';
import { Pipeline } from '@/components/home/pipeline';
import { Pricing } from '@/components/home/pricing';
import { SiteFooter } from '@/components/home/site-footer';

export default function HomePage() {
  return (
    <main className="izi-page">
      <Hero />
      <Pipeline />
      <FeatureBento />
      <CaptionStudio />
      <Pricing />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}
