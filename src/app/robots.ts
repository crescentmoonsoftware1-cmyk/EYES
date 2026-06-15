import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://the-eyes.com';

  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/terms',
        '/login',
        '/signup',
        '/accessibility',
        '/california-notice',
        '/cookie-policy',
        '/disclaimer',
        '/privacy-policy',
        '/security-policy',
      ],
      disallow: [
        '/admin/',
        '/chat/',
        '/connect/',
        '/settings/',
        '/integrations/',
        '/api/',
      ],
    },
    sitemap: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`,
  };
}
