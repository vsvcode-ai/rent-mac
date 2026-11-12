'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AdminModal, ErrorBox, Loading, Pill, useRun } from '@/components/admin/kit';
import { fmtTime, yuan } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { RefundRow } from '@/lib/admin-types';

function CompleteModal({
  r,
  onClose,
  onDone,
}: {
  r: RefundRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, busy } = useRun();
  const [no, setNo] = useState('');
  return (
    <AdminModal open={!!r} onClose={onClose}>
      <h3>完成退款</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {r?.orderNo} · {r && yuan(r.amountCents)}。请先在闲鱼完成退款，再填写闲鱼退款单号。
      </p>
      <div className="field" style={{ marginTop: 14 }}>
        <label>闲鱼退款单号</label>
        <input className="input mono" value={no} onChange={(e) => setNo(e.target.value.trim())} />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || no.length < 4}
        onClick={async () => {
          if (
            (await run(
              () => api(`/admin/refunds/${r!.id}/complete`, { body: { xianyuRefundNo: no } }),
              '退款已完成',
            )) !== undefined
          ) {
            setNo('');
            onDone();
            onClose();
          }
        }}
      >
        确认完成
      </button>
    </AdminModal>
  );
}

export default function RefundsPage() {
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useApi<RefundRow[]>(
    `/admin/refunds${status ? `?status=${status}` : ''}`,
  );
  const [sel, setSel] = useState<RefundRow | null>(null);
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="bar-h">
        {[
          ['', '全部'],
          ['refunding', '退款中'],
          ['refunded', '已退款'],
        ].map(([k, t]) => (
          <span
            key={k}
            className={`chip ${status === k ? 'on' : ''}`}
            onClick={() => setStatus(k!)}
          >
            {t}
          </span>
        ))}
      </div>
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户</th>
                <th>退款金额</th>
                <th>原因</th>
                <th>状态</th>
                <th>闲鱼退款单号</th>
                <th>登记时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.orderNo}</td>
                  <td>{r.userEmail}</td>
                  <td>
                    <b>{yuan(r.amountCents)}</b>
                  </td>
                  <td style={{ maxWidth: 260 }}>{r.reason}</td>
                  <td>
                    {r.status === 'refunded' ? (
                      <Pill tone="mute">已退款</Pill>
                    ) : (
                      <Pill tone="warn">退款中</Pill>
                    )}
                  </td>
                  <td className="mono">{r.xianyuRefundNo || '—'}</td>
                  <td>{fmtTime(r.createdAt)}</td>
                  <td>
                    {r.status === 'refunding' && (
                      <button className="btn btn-primary xs" onClick={() => setSel(r)}>
                        完成退款
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    没有退款单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <CompleteModal r={sel} onClose={() => setSel(null)} onDone={() => void reload()} />
    </>
  );
}
