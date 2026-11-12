'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAdmin } from '@/components/admin/context';
import { ErrorBox, Loading } from '@/components/admin/kit';
import { roleCanOpen } from '@/components/admin/nav-roles';
import { ago, yuan } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Dashboard } from '@/lib/admin-types';

/** 近 14 天新订单：单系列柱图，墨白单色；只常驻标注最大值和最新值，其余悬停显示 */
function OrdersChart({ data }: { data: Dashboard['ordersLast14d'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560,
    H = 170,
    top = 22,
    base = 140,
    n = data.length || 1;
  const max = Math.max(1, ...data.map((d) => d.count));
  const bw = W / n;
  const maxIdx = data.findIndex((d) => d.count === max);
  const label = (i: number) => hover === i || (hover === null && (i === n - 1 || i === maxIdx));
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`近 14 天新订单，合计 ${data.reduce((a, d) => a + d.count, 0)} 单`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--hl)" />
        {data.map((d, i) => {
          const h = Math.max(3, (d.count / max) * (base - top));
          const x = i * bw + bw * 0.2;
          const w = bw * 0.6;
          const latest = i === n - 1;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              {/* 比柱子更大的命中区域 */}
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <path
                d={`M${x} ${base}V${base - h + 4}Q${x} ${base - h} ${x + 4} ${base - h}H${x + w - 4}Q${x + w} ${base - h} ${x + w} ${base - h + 4}V${base}Z`}
                fill={latest ? 'var(--ink)' : 'var(--s4)'}
                stroke={latest ? 'none' : 'var(--hl2)'}
                opacity={hover !== null && hover !== i ? 0.55 : 1}
              />
              {label(i) && (
                <text
                  x={x + w / 2}
                  y={base - h - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--ink-m)"
                  fontFamily="var(--mono)"
                >
                  {d.count}
                </text>
              )}
              {(i % 2 === (n - 1) % 2 || n <= 7) && (
                <text
                  x={x + w / 2}
                  y={base + 16}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill="var(--ink3)"
                  fontFamily="var(--mono)"
                >
                  {d.date.slice(5).replace('-', '/')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** 机房利用率：环形图（与原型一致）。空闲段用深色填充，图例里的空闲点用信号色。 */
function Utilization({ u }: { u: Dashboard['utilization'] }) {
  const total = Math.max(1, u.total);
  const seg: [string, string, number, string?][] = [
    ['使用中', '#f2f1ec', u.inUse],
    ['即将到期', '#ffb547', u.expiring],
    ['回收中', '#46463f', u.recycling],
    ['维护中', '#ff5a4e', u.maintenance + u.fault],
    ['空闲', '#262623', u.idle, '#d7ff3a'],
  ];
  let acc = 0;
  const grad = seg
    .map(([, col, n]) => {
      const a = (acc / total) * 100;
      acc += n;
      return `${col} ${a}% ${(acc / total) * 100}%`;
    })
    .join(',');
  const rate = Math.round((u.leased / total) * 100);
  return (
    <>
      <div
        className="donut"
        style={{ background: `conic-gradient(${grad})` }}
        role="img"
        aria-label={`机房利用率 ${rate}%`}
      >
        <span>
          <b>{rate}%</b>在租
        </span>
      </div>
      <div className="lg">
        {seg.map(([name, col, n, dot]) => (
          <span key={name}>
            <i style={{ background: dot ?? col }} />
            {name}
            <b>{n}</b>
          </span>
        ))}
      </div>
    </>
  );
}

const remainText = (ms: number) => {
  const D = 86_400_000;
  const H = 3_600_000;
  if (ms < 0) return `已超期 ${Math.floor(-ms / D)} 天`;
  return `剩 ${Math.floor(ms / D)} 天 ${Math.floor((ms % D) / H)} 时`;
};

export default function DashboardPage() {
  const { admin } = useAdmin();
  const { data: d, error, loading } = useApi<Dashboard>('/admin/dashboard');
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox error={error} />;
  // 待核对 / 待开通已经按订单逐行列在上面，这里只保留需要额外提醒的事项
  const visibleTodos = d.todos.filter(
    (t) => t.type !== 'verify' && roleCanOpen(admin.role, t.href),
  );
  const kpi = (href: string, cls: string, label: string, val: React.ReactNode, sub: string) => (
    <Link className={`kpi ${cls}`} href={roleCanOpen(admin.role, href) ? href : '/admin'}>
      <small>{label}</small>
      <b>{val}</b>
      <span>{sub}</span>
    </Link>
  );
  return (
    <>
      <div className="kpis">
        {kpi(
          '/admin/orders?status=verifying',
          d.pendingVerify ? 'warn-k' : '',
          '待核对',
          d.pendingVerify,
          d.verifyOverdue ? `${d.verifyOverdue} 单超 24 小时` : '需核对闲鱼收款',
        )}
        {kpi(
          '/admin/provision',
          d.queuedOverdue ? 'alert-k' : '',
          '待开通',
          d.queued,
          d.queuedOverdue
            ? `⚠ ${d.queuedOverdue} 单已超期`
            : d.queuedWarn
              ? `${d.queuedWarn} 单即将超期`
              : '均在时限内',
        )}
        {kpi('/admin/devices', '', '在租台数', d.leased, `总计 ${d.utilization.total} 台`)}
        {kpi('/admin/devices?status=idle', '', '空闲台数', d.idle, '可立即分配')}
        {kpi('/admin/devices', '', '7 天内到期', d.expiring7, '需提醒续费')}
        {kpi(
          '/admin/orders',
          '',
          '本月收入',
          <span style={{ fontSize: 24, lineHeight: '39px' }}>{yuan(d.monthRevenueCents)}</span>,
          '已确认收款，扣除退款',
        )}
      </div>
      <div className="g2">
        <div className="box">
          <h3>
            待办<Link href="/admin/orders">全部订单 →</Link>
          </h3>
          <div className="todo">
            {d.pendingOrders.map((o) => {
              const verify = o.status === 'verifying';
              const href = verify ? `/admin/orders?status=verifying` : '/admin/provision';
              const level =
                o.remainingMs == null
                  ? 'brand'
                  : o.remainingMs < 0
                    ? 'danger'
                    : o.remainingMs < 2 * 86_400_000
                      ? 'warn'
                      : 'brand';
              return (
                <div className="todo-i" key={o.no}>
                  <span className={`pill ${verify ? 'info' : level}`}>
                    {verify ? '待核对' : '待开通'}
                  </span>
                  <b>{o.userEmail}</b>
                  <span className="mono">
                    {o.no}
                    {!verify && ` · ${o.quantity} 台`}
                  </span>
                  <span className="sp" />
                  <span className="muted">
                    {verify
                      ? o.submittedAt
                        ? `${ago(o.submittedAt)}提交`
                        : ''
                      : remainText(o.remainingMs ?? 0)}
                  </span>
                  {roleCanOpen(admin.role, href) && (
                    <Link className={`btn ${verify ? 'btn-primary' : 'btn-dark'} xs`} href={href}>
                      {verify ? '核对' : '开通'}
                    </Link>
                  )}
                </div>
              );
            })}
            {visibleTodos.map((t, i) => (
              <Link key={i} href={t.href} className="todo-i">
                <b>{t.text}</b>
                <span className="sp" />
                <span className="muted">→</span>
              </Link>
            ))}
            {d.pendingOrders.length === 0 && visibleTodos.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                没有待办事项
              </div>
            )}
          </div>
          <h3 style={{ marginTop: 26 }}>近 14 天新订单</h3>
          <OrdersChart data={d.ordersLast14d} />
        </div>
        <div className="box">
          <h3>
            机房利用率
            <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
              马来西亚
            </span>
          </h3>
          <Utilization u={d.utilization} />
          <h3 style={{ marginTop: 26 }}>
            即将到期<Link href="/admin/devices">台账 →</Link>
          </h3>
          <div className="todo">
            {d.expiringSoon.length === 0 && (
              <div className="empty" style={{ padding: 18 }}>
                7 天内没有到期的设备
              </div>
            )}
            {d.expiringSoon.map((e) => (
              <div className="todo-i" key={e.leaseId}>
                <b className="mono" style={{ fontSize: 12.5 }}>
                  {e.code}
                </b>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {e.userEmail}
                </span>
                <span className="sp" />
                <span className="pill warn">{e.daysLeft} 天</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
