'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext } from 'react';
import { Bell } from './Bell';
import { api } from '@/lib/api';
import { useApi, useRequireLogin } from '@/lib/hooks';
import type { Me, OrderView } from '@/lib/types';
import { SiteHeader } from '@/components/SiteHeader';
import { SupportFab } from '@/components/SupportFab';

const MeCtx = createContext<{ me: Me; reload: () => Promise<void> } | null>(null);
export function useAccount() {
  const v = useContext(MeCtx);
  if (!v) throw new Error('useAccount 只能在账户后台内使用');
  return v;
}

const NAV = [
  { href: '/account', label: '概览' },
  { href: '/account/orders', label: '我的订单' },
  { href: '/account/devices', label: '我的设备' },
  { href: '/account/renew', label: '续费' },
  { href: '/account/tickets', label: '工单' },
  { href: '/account/settings', label: '账户设置' },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { me, reload } = useRequireLogin();
  const pathname = usePathname();
  const { data: orders } = useApi<OrderView[]>(me ? '/me/orders' : null);
  const todo = orders?.filter((o) => o.status === 'pending' || o.status === 'failed').length ?? 0;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    location.href = '/';
  };

  return (
    <>
      <SiteHeader />
      <main className="wrap acct">
        {me ? (
          <>
            <nav className="side">
              <div className="me">
                <div className="me-id">
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {me.email}
                  </b>
                  <small>普通用户</small>
                </div>
                <Bell />
              </div>
              {NAV.map((n) => {
                const on =
                  n.href === '/account' ? pathname === '/account' : pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} className={on ? 'on' : ''}>
                    {n.label}
                    {n.href === '/account/orders' && todo > 0 && (
                      <span className="cnt">{todo}</span>
                    )}
                  </Link>
                );
              })}
              <a
                href="#"
                style={{ color: 'var(--danger)' }}
                onClick={(e) => {
                  e.preventDefault();
                  void logout();
                }}
              >
                退出登录
              </a>
            </nav>
            <div>
              <MeCtx.Provider value={{ me, reload }}>
                <section className="view on">{children}</section>
              </MeCtx.Provider>
            </div>
          </>
        ) : (
          <p
            className="muted"
            style={{ gridColumn: '1 / -1', padding: '80px 0', textAlign: 'center' }}
          >
            {me === null ? '正在跳转到登录…' : '加载中…'}
          </p>
        )}
      </main>
      <SupportFab />
    </>
  );
}
