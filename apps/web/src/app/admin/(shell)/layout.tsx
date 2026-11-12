'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BrandMark } from '@/components/Brand';
import { AdminCtx } from '@/components/admin/context';
import { ROLE_LABEL } from '@/components/admin/kit';
import { api } from '@/lib/api';
import type { AdminMe, AdminRole, Dashboard } from '@/lib/admin-types';

const I = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
);
interface NavItem {
  href: string;
  title: string;
  icon: React.ReactNode;
  roles?: AdminRole[];
  badge?: 'verify' | 'queue' | 'recycle';
}
const GROUPS: { h: string; items: NavItem[] }[] = [
  {
    h: '工作台',
    items: [
      {
        href: '/admin',
        title: '看板',
        icon: I(
          <>
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </>,
        ),
      },
      {
        href: '/admin/orders',
        title: '订单',
        badge: 'verify',
        icon: I(
          <>
            <path d="M6 3h12l2 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" />
            <path d="M4 7h16M9 12h6" />
          </>,
        ),
      },
      {
        href: '/admin/provision',
        title: '开通队列',
        roles: ['ops'],
        badge: 'queue',
        icon: I(
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </>,
        ),
      },
    ],
  },
  {
    h: '资产',
    items: [
      {
        href: '/admin/devices',
        title: '机器台账',
        icon: I(
          <>
            <rect x="3" y="9" width="18" height="8" rx="2.5" />
            <path d="M7 20h10" />
          </>,
        ),
      },
      {
        href: '/admin/recycle',
        title: '回收队列',
        roles: ['ops'],
        badge: 'recycle',
        icon: I(
          <>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </>,
        ),
      },
    ],
  },
  {
    h: '服务',
    items: [
      {
        href: '/admin/tickets',
        title: '工单',
        roles: ['support', 'ops'],
        icon: I(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />),
      },
      {
        href: '/admin/consults',
        title: '咨询线索',
        roles: ['support'],
        icon: I(<path d="M4 5h16v11H8l-4 4z" />),
      },
      {
        href: '/admin/users',
        title: '用户',
        icon: I(
          <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </>,
        ),
      },
      {
        href: '/admin/refunds',
        title: '退款',
        roles: ['admin'],
        icon: I(
          <>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </>,
        ),
      },
    ],
  },
  {
    h: '系统',
    items: [
      {
        href: '/admin/settings',
        title: '设置与权限',
        icon: I(
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
          </>,
        ),
      },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [counts, setCounts] = useState<Dashboard | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<AdminMe>('/admin/me').then(setAdmin, () => router.replace('/admin/login'));
  }, [router]);

  const reloadCounts = useCallback(() => {
    api<Dashboard>('/admin/dashboard').then(setCounts, () => undefined);
  }, []);
  useEffect(() => {
    if (admin) reloadCounts();
  }, [admin, reloadCounts]);

  const ctx = useMemo(
    () =>
      admin && {
        admin,
        can: (...roles: AdminRole[]) => admin.role === 'admin' || roles.includes(admin.role),
        reloadCounts,
      },
    [admin, reloadCounts],
  );
  if (!admin || !ctx)
    return (
      <div className="empty" style={{ paddingTop: 120 }}>
        加载中…
      </div>
    );

  const visible = (it: NavItem) => !it.roles || ctx.can(...it.roles);
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  const title = GROUPS.flatMap((g) => g.items).find((i) => active(i.href))?.title ?? '管理后台';
  const badge = (b?: NavItem['badge']) => {
    if (!counts || !b) return null;
    const n =
      b === 'verify'
        ? counts.pendingVerify
        : b === 'queue'
          ? counts.queued
          : counts.utilization.recycling;
    if (!n) return null;
    return <span className={`cnt${b === 'queue' ? '' : ' y'}`}>{n}</span>;
  };
  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
  };

  return (
    <AdminCtx.Provider value={ctx}>
      <div className="shell">
        <aside className="aside">
          <Link className="brand" href="/admin">
            <BrandMark />
            <span>南洋桌面</span>
            <small>ADMIN</small>
          </Link>
          {GROUPS.map((g) => {
            const items = g.items.filter(visible);
            return (
              items.length > 0 && (
                <div key={g.h} style={{ display: 'contents' }}>
                  <h6>{g.h}</h6>
                  {items.map((it) => (
                    <Link key={it.href} href={it.href} className={active(it.href) ? 'on' : ''}>
                      {it.icon}
                      {it.title}
                      {badge(it.badge)}
                    </Link>
                  ))}
                </div>
              )
            );
          })}
          <div className="who">
            <i>{admin.name.slice(0, 1)}</i>
            <div>
              <b>{admin.name}</b>
              <small>{ROLE_LABEL[admin.role]}</small>
            </div>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <h1>{title}</h1>
            <div className="sp" />
            <input
              className="search"
              placeholder="搜索订单号 / 邮箱 / 闲鱼单号，回车"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && q.trim())
                  router.push(`/admin/orders?keyword=${encodeURIComponent(q.trim())}`);
              }}
            />
            <span className="role">{ROLE_LABEL[admin.role]}</span>
            <Link className="btn btn-ghost btn-sm" href="/">
              ← 前台
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              退出
            </button>
          </div>
          <section className="vw on">
            <Suspense fallback={<div className="empty">加载中…</div>}>{children}</Suspense>
          </section>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}
