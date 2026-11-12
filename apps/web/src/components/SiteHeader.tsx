'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Brand } from './Brand';
import { useMe } from '@/lib/hooks';

export function SiteHeader({ active }: { active?: 'help' }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(scrollY > 8);
    h();
    addEventListener('scroll', h, { passive: true });
    return () => removeEventListener('scroll', h);
  }, []);
  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <div className="wrap nav">
        <Brand />
        <nav className={`nav-links${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          <Link href="/#why">产品</Link>
          <Link href="/#scenes">使用场景</Link>
          <Link href="/#pricing">价格</Link>
          <Link href="/help" className={active === 'help' ? 'on' : ''}>
            帮助中心
          </Link>
        </nav>
        <div className="nav-right">
          {me ? (
            <Link className="btn btn-ghost btn-sm" href="/account">
              我的账户
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" href="/auth">
                登录
              </Link>
              <Link className="btn btn-primary btn-sm" href="/#pricing">
                立即租用 <span className="arr">→</span>
              </Link>
            </>
          )}
          <button
            className={`menu-btn${open ? ' x' : ''}`}
            aria-label="菜单"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
