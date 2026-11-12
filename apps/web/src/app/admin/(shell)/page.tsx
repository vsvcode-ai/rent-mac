'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAdmin } from '@/components/admin/context';
import { ErrorBox, Loading } from '@/components/admin/kit';
import { roleCanOpen } from '@/components/admin/nav-roles';
import { yuan } from '@/lib/format';
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

const SEGS = [
  ['leased', '在租', '#f2f1ec'],
  ['idle', '空闲', '#d7ff3a'],
  ['recycling', '回收中', '#8e8c85'],
  ['maintenance', '维护中', '#ffb547'],
  ['fault', '故障', '#ff5a4e'],
] as const;

function Utilization({ u }: { u: Dashboard['utilization'] }) {
  const total = Math.max(1, u.total);
  const rate = Math.round((u.leased / total) * 100);
  let acc = 0;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-.02em' }}>{rate}%</b>
        <span className="muted" style={{ fontSize: 12.5 }}>
          在租 {u.leased} / {u.total} 台
        </span>
      </div>
      <svg viewBox="0 0 300 14" width="100%" role="img" aria-label={`机房利用率 ${rate}%`}>
        {SEGS.map(([k, , col]) => {
          const w = (u[k] / total) * 300;
          const x = acc;
          acc += w;
          return w > 0 ? (
            <rect key={k} x={x} y={0} width={Math.max(0, w - 2)} height={14} rx={3} fill={col} />
          ) : null;
        })}
      </svg>
      <div className="lg">
        {SEGS.map(([k, name, col]) => (
          <span key={k}>
            <i style={{ background: col }} />
            {name}
            <b>{u[k]}</b>
          </span>
        ))}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { admin } = useAdmin();
  const { data: d, error, loading } = useApi<Dashboard>('/admin/dashboard');
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox error={error} />;
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
            {d.todos.filter((t) => roleCanOpen(admin.role, t.href)).length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                没有待办事项
              </div>
            )}
            {d.todos
              .filter((t) => roleCanOpen(admin.role, t.href))
              .map((t, i) => (
              <Link key={i} href={t.href} className="todo-i">
                <b>{t.text}</b>
                <span className="sp" />
                <span className="muted">→</span>
              </Link>
            ))}
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
        </div>
      </div>
    </>
  );
}
