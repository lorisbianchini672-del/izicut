import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/site-url';

/** /robots.txt : les moteurs indexent la vitrine, jamais les espaces privés ni les API. */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/project/', '/montage/', '/upload', '/auth/', '/reset-password'] }],
    sitemap: `${site}/sitemap.xml`,
    host: site
  };
}
