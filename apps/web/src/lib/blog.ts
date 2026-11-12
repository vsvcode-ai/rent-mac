import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, type PostMeta } from './markdown';

// next build / next dev 都以 apps/web 为工作目录
const DIR = join(process.cwd(), 'content', 'blog');
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nanyangdesk.com';

export function listPosts(): PostMeta[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const { meta } = parseFrontmatter(readFileSync(join(DIR, f), 'utf8'));
      return {
        slug,
        title: meta.title ?? slug,
        date: meta.date ?? '',
        description: meta.description ?? '',
      };
    })
    .filter((p) => SLUG_RE.test(p.slug))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): { meta: PostMeta; body: string } | null {
  // slug 只允许小写字母、数字和连字符，杜绝路径穿越
  if (!SLUG_RE.test(slug)) return null;
  try {
    const raw = readFileSync(join(DIR, `${slug}.md`), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    return {
      meta: {
        slug,
        title: meta.title ?? slug,
        date: meta.date ?? '',
        description: meta.description ?? '',
      },
      body,
    };
  } catch {
    return null;
  }
}
