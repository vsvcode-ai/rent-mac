import type { Metadata } from 'next';
import Link from 'next/link';
import { listPosts } from '@/lib/blog';
import s from './blog.module.css';

export const metadata: Metadata = {
  title: '博客 · 南洋桌面',
  description: 'Mac mini 远程租用的使用经验：AI 辅助开发挂机、iOS 构建上架、海外固定 IP 场景。',
  alternates: { canonical: '/blog' },
};

export default function BlogIndex() {
  const posts = listPosts();
  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <div className="kicker">博客</div>
      <h1 className="page-title" style={{ fontSize: 40 }}>
        使用经验与实践
      </h1>
      <p className="muted" style={{ fontSize: 16, margin: '8px 0 0' }}>
        把一台远程 Mac 用好的一些具体做法。
      </p>
      <div className={s.list}>
        {posts.map((p) => (
          <Link key={p.slug} className={s.card} href={`/blog/${p.slug}`}>
            <span className={s.date}>{p.date}</span>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
          </Link>
        ))}
        {posts.length === 0 && <p className="muted">文章整理中，敬请期待。</p>}
      </div>
    </div>
  );
}
