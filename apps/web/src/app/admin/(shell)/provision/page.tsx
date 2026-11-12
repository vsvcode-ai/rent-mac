'use client';
import { useState } from 'react';
import { ActivateModal } from '@/components/admin/activate-modal';
import { useAdmin } from '@/components/admin/context';
import { ErrorBox, Loading, Pill, contactText, remainText } from '@/components/admin/kit';
import { termName } from '@/components/admin/order-modals';
import { fmtDate, ago } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { AdminOrder } from '@/lib/admin-types';

const DAY = 86_400_000;

export default function ProvisionPage() {
  const { reloadCounts } = useAdmin();
  const { data, error, loading, reload } = useApi<AdminOrder[]>('/admin/provision/queue');
  const [cur, setCur] = useState<AdminOrder | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <>
      <div className="note-tip">
        按截止时间排序（确认收款后 7 天）。剩余 &lt; 2
        天标黄，超期标红。建议提前把空闲机器预装好系统和 UU 远程。
      </div>
      {data.map((o) => {
        const left = o.remainingMs ?? 0;
        const lvl =
          o.deadlineLevel === 'overdue' ? 'danger' : o.deadlineLevel === 'warn' ? 'warn' : '';
        const pct = Math.max(0, Math.min(100, (1 - left / (7 * DAY)) * 100));
        return (
          <div key={o.no} className={`q-card ${lvl}`}>
            <div
              className="ring"
              style={{
                ['--p' as string]: pct,
                ['--c' as string]:
                  lvl === 'danger' ? '#ff5a4e' : lvl === 'warn' ? '#ffb547' : '#f2f1ec',
              }}
            >
              <b>
                {left < 0 ? '超' : Math.floor(left / DAY)}
                <small>{left < 0 ? '期' : '天'}</small>
              </b>
            </div>
            <div>
              <h4>
                {o.userEmail}
                {lvl && <Pill tone={lvl}>{left < 0 ? '已超期' : '即将超期'}</Pill>}
              </h4>
              <p>
                <span className="mono">{o.no}</span> · {termName(o.term)} × {o.quantity} 台 ·{' '}
                {o.paidAt && `确认收款 ${ago(o.paidAt)} · `}截止{' '}
                {o.deadlineAt && fmtDate(o.deadlineAt)}（{remainText(left)}）
              </p>
              <p>联系：{contactText(o) || '—'}</p>
            </div>
            <div>
              <button className="btn btn-dark" onClick={() => setCur(o)}>
                分配开通
              </button>
            </div>
          </div>
        );
      })}
      {data.length === 0 && (
        <div className="box empty">
          <b>开通队列为空</b>所有已收款订单都已开通。
        </div>
      )}
      <ActivateModal
        order={cur}
        onClose={() => setCur(null)}
        onDone={() => {
          void reload();
          reloadCounts();
        }}
      />
    </>
  );
}
