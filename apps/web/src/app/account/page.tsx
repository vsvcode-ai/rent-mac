'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ORDER_STATUS_LABEL } from '@nyd/shared';
import { useAccount } from '@/components/account/AccountShell';
import { OrdersTable } from '@/components/account/OrdersTable';
import { fmtDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { AccountLease } from '@/lib/account-types';
import type { OrderView, PublicSettings } from '@/lib/types';

// 页脚等处的旧式锚点 /account#tickets → 对应子页面
const HASH_ROUTE: Record<string, string> = {
  '#orders': '/account/orders',
  '#devices': '/account/devices',
  '#tickets': '/account/tickets',
  '#settings': '/account/settings',
};

export default function Overview() {
  const { me } = useAccount();
  const router = useRouter();
  const orders = useApi<OrderView[]>('/me/orders');
  const leases = useApi<AccountLease[]>('/me/leases');
  const pub = useApi<PublicSettings>('/settings/public');
  useEffect(() => {
    const to = HASH_ROUTE[location.hash];
    if (to) router.replace(to);
  }, [router]);

  const list = orders.data ?? [];
  const L = leases.data ?? [];
  const pend = list.filter((o) => ['pending', 'failed', 'verifying', 'queued'].includes(o.status));
  const soon = [...L].sort((a, b) => a.endAt.localeCompare(b.endAt))[0];
  const vip = list.some(
    (o) =>
      (o.term === 'm6' || o.term === 'm12') &&
      ['active', 'queued', 'done', 'renewed'].includes(o.status),
  );

  return (
    <>
      <h2>你好，{me.email.split('@')[0]}</h2>
      <div className="stats">
        <div className="stat">
          <small>在租设备</small>
          <b>{L.length}</b>
          <span>台 Mac mini</span>
        </div>
        <div className="stat">
          <small>最近到期</small>
          <b style={{ fontSize: 26, lineHeight: '44px' }}>{soon ? fmtDate(soon.endAt) : '—'}</b>
          <span>{soon ? `${soon.daysLeft} 天后` : '暂无设备'}</span>
        </div>
        <div className="stat">
          <small>待处理订单</small>
          <b>{pend.length}</b>
          <span>{pend.length ? '需要关注' : '全部处理完毕'}</span>
        </div>
      </div>

      {vip ? (
        <div className="vip">
          <div className="av">客</div>
          <div>
            <b>你的 1 对 1 专属客服</b>
            <small>
              半年付、年付用户专享
              {pub.data?.supportWechat ? ` · 微信 ${pub.data.supportWechat}` : ''}
              {pub.data?.supportTelegram ? ` · Telegram ${pub.data.supportTelegram}` : ''} ·
              响应优先
            </small>
          </div>
          <Link className="btn btn-white btn-sm" href="/account/tickets">
            提交工单
          </Link>
        </div>
      ) : (
        <div className="vip" style={{ background: 'var(--bg)', border: '1px dashed var(--line2)' }}>
          <div className="av">★</div>
          <div>
            <b>升级半年付或年付，享 1 对 1 专属客服</b>
            <small>每月最低 ¥499，比月付省 ¥3,600 / 年</small>
          </div>
          <Link className="btn btn-dark btn-sm" href="/#pricing">
            查看套餐
          </Link>
        </div>
      )}

      {pend.length > 0 && (
        <div className="alert warn">
          <span>!</span>
          <div>
            <b>你有 {pend.length} 个订单正在进行中。</b>{' '}
            {pend.map((o, i) => (
              <span key={o.no}>
                {i > 0 && '、'}
                <Link className="link" href={`/order/${o.no}`}>
                  {o.no}（{ORDER_STATUS_LABEL[o.status]}）
                </Link>
              </span>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ margin: '26px 0 14px', fontSize: 18 }}>最近订单</h3>
      {orders.loading ? <p className="muted">加载中…</p> : <OrdersTable list={list.slice(0, 4)} />}
    </>
  );
}
