import type { MetadataRoute } from 'next';
import { listPosts, SITE_URL } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/help', '/refund', '/terms', '/privacy', '/aup', '/consult', '/blog'];
  return [
    ...pages.map((p) => ({
      url: `${SITE_URL}${p}`,
      changeFrequency: 'weekly' as const,
      priority: p === '' ? 1 : 0.6,
    })),
    ...listPosts().map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.date || undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];
}
