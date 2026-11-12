import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, listPosts } from '@/lib/blog';
import { renderMarkdown } from '@/lib/markdown';
import s from '../blog.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return listPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  const { title, description, date } = post.meta;
  return {
    title: `${title} · 南洋桌面`,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { type: 'article', title, description, publishedTime: date, url: `/blog/${slug}` },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const { title, date, description } = post.meta;
  return (
    <div className="wrap page">
      <article className={s.article}>
        <Link className="link" href="/blog" style={{ fontSize: 14 }}>
          ← 全部文章
        </Link>
        <h1>{title}</h1>
        <p className={s.date}>{date}</p>
        {description && <p className={s.lead}>{description}</p>}
        <div className={s.body}>{renderMarkdown(post.body)}</div>
        <div className={s.foot}>
          <p className="muted" style={{ marginBottom: 14 }}>
            想自己试一试？一台独享的 Mac mini，年付每月 ¥499 起。
          </p>
          <Link className="btn btn-primary" href="/#pricing">
            查看套餐 <span className="arr">→</span>
          </Link>
        </div>
      </article>
    </div>
  );
}
