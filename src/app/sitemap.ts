import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://the-eyes.com';
  const baseUrl = siteUrl.replace(/\/$/, '');

  const routes = [
    '',
    '/terms',
    '/login',
    '/signup',
    '/accessibility',
    '/california-notice',
    '/cookie-policy',
    '/disclaimer',
    '/privacy-policy',
    '/security-policy',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: route === '' ? 1.0 : 0.5,
  }));
}
