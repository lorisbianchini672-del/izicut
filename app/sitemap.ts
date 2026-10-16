import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/site-url';

/** /sitemap.xml : les pages publiques du site. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const pages: [string, number][] = [['/', 1], ['/studio', 0.9], ['/blog', 0.6], ['/guide-9-16', 0.6], ['/docs', 0.5], ['/login', 0.4], ['/cgu', 0.2], ['/confidentialite', 0.2], ['/mentions-legales', 0.2]];
  return pages.map(([p, priority]) => ({ url: `${site}${p}`, lastModified: new Date(), changeFrequency: p === '/' ? 'weekly' : 'monthly', priority }));
}
