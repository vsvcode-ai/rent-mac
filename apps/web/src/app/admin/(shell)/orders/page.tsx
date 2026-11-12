'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from '@nyd/shared';
import { useAdmin } from '@/components/admin/context';
import {
  ErrorBox,
  OrderPill,
  Pager,
  contactText,
  remainText,
  useDebounced,
} from '@/components/admin/kit';
import { OrderDetailModal, VerifyModal, termName } from '@/components/admin/order-modals';
import { fmtDate, ago, yuan } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { AdminOrder, Paged } from '@/lib/admin-types';

const PAGE = 20;

export default function OrdersPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const { can, reloadCounts } = useAdmin();
  const status = (sp.get('status') as OrderStatus | null) ?? '';
  const urlKeyword = sp.get('keyword') ?? '';
  const [kw, setKw] = useState(urlKeyword);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const [verify, setVerify] = useState<AdminOrder | null>(null);
  const [exportDate, setExportDate] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => setKw(urlKeyword), [urlKeyword]);
  const keyword = useDebounced(kw);
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (status) qs.set('status', status);
  if (keyword) qs.set('keyword', keyword);
  const { data, error, reload } = useApi<Paged<AdminOrder>>(`/admin/orders?${qs}`);

  const setFilter = (s: string) => {
    setPage(1);
    router.replace(s ? `/admin/orders?status=${s}` : '/admin/orders');
  };
  const changed = () => {
    void reload();
    reloadCounts();
  };

  return (
    <>
      <div className="bar-h">
        <span className={`chip ${!status ? 'on' : ''}`} onClick={() => setFilter('')}>
          全部
        </span>
        {ORDER_STATUSES.map((s) => (
          <span key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
            {ORDER_STATUS_LABEL[s]}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <input
          className="input"
          style={{ height: 30, width: 220, fontSize: 12.5 }}
          placeholder="订单号 / 邮箱 / 闲鱼单号"
          value={kw}
          onChange={(e) => {
            setKw(e.target.value);
            setPage(1);
          }}
        />
        {can('support') && (
          <>
            <input
              className="input"
              type="date"
              style={{ height: 30, width: 140, fontSize: 12.5 }}
              value={exportDate}
              onChange={(e) => setExportDate(e.target.value)}
            />
            <a
              className="btn btn-line btn-sm"
              href={`/api/admin/export/orders.csv?date=${exportDate}`}
            >
              导出对账 CSV
            </a>
          </>
        )}
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户</th>
                <th>类型</th>
                <th>套餐</th>
                <th>应收</th>
                <th>闲鱼订单号</th>
                <th>状态</th>
                <th>创建时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => {
                const rowCls =
                  o.deadlineLevel === 'overdue'
                    ? 'row-danger'
                    : o.deadlineLevel === 'warn' || o.verifyOverdue
                      ? 'row-warn'
                      : '';
                return (
                  <tr key={o.no} className={rowCls}>
                    <td className="mono">{o.no}</td>
                    <td>
                      {o.userEmail}
                      <small>{contactText(o)}</small>
                    </td>
                    <td>{o.kind === 'renew' ? '续费' : '新租'}</td>
                    <td>
                      {termName(o.term)} × {o.quantity}
                      <small>{o.months} 个月</small>
                    </td>
                    <td>
                      <b>{yuan(o.totalCents)}</b>
                    </td>
                    <td className="mono">
                      {o.xianyuOrderNo || '—'}
                      <small>{o.xianyuBuyerNick || ''}</small>
                    </td>
                    <td>
                      <OrderPill status={o.status} />
                      {o.status === 'verifying' && o.verifyOverdue && (
                        <small style={{ color: 'var(--st-warn)' }}>超 24 小时未核对</small>
                      )}
                      {o.status === 'queued' && o.remainingMs != null && (
                        <small
                          style={{
                            color:
                              o.deadlineLevel === 'overdue'
                                ? 'var(--st-danger)'
                                : o.deadlineLevel === 'warn'
                                  ? 'var(--st-warn)'
                                  : undefined,
                          }}
                        >
                          {remainText(o.remainingMs)}
                        </small>
                      )}
                    </td>
                    <td>
                      {fmtDate(o.createdAt)}
                      <small>{ago(o.createdAt)}</small>
                    </td>
                    <td>
                      {o.status === 'verifying' && can('support') ? (
                        <button className="btn btn-primary xs" onClick={() => setVerify(o)}>
                          核对收款
                        </button>
                      ) : (
                        <button className="btn btn-ghost xs" onClick={() => setDetail(o.no)}>
                          详情
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    没有符合条件的订单
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={9} className="empty">
                    加载中…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
        </div>
      )}
      <VerifyModal order={verify} onClose={() => setVerify(null)} onDone={changed} />
      <OrderDetailModal no={detail} onClose={() => setDetail(null)} onChanged={changed} />
    </>
  );
}
