import { HeroSection } from '@/components/landing/HeroSection';
import { StatsSection } from '@/components/landing/StatsSection';
import { BentoGrid } from '@/components/landing/BentoGrid';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQAccordion } from '@/components/landing/FAQAccordion';
import { Footer } from '@/components/landing/Footer';

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <BentoGrid />
      <PricingSection />
      <FAQAccordion />
      <Footer />
    </>
  );
}
