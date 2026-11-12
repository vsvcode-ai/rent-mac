import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/blog';

export default function robots(): MetadataRoute.Robots {
  return {
    // 账户、订单、后台页面不让搜索引擎收录
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/admin', '/order', '/auth', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
