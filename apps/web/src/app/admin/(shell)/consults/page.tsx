'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ErrorBox, Loading, useRun } from '@/components/admin/kit';
import { ago } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { ConsultRow } from '@/lib/admin-types';

const ST: Record<ConsultRow['status'], [string, string]> = {
  new: ['新线索', 'warn'],
  following: ['跟进中', 'info'],
  done: ['已完成', 'mute'],
};

function Row({ c, onSaved }: { c: ConsultRow; onSaved: () => void }) {
  const { run, busy } = useRun();
  const [note, setNote] = useState(c.note ?? '');
  const save = (patch: object, msg: string) =>
    run(() => api(`/admin/consults/${c.id}`, { method: 'PATCH', body: patch }), msg).then(
      (r) => r !== undefined && onSaved(),
    );
  return (
    <tr>
      <td>
        {c.contact}
        <small>{ago(c.createdAt)}</small>
      </td>
      <td>{c.quantity ?? '—'}</td>
      <td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{c.message}</td>
      <td>
        <select
          className="input"
          style={{ height: 28, fontSize: 12.5 }}
          value={c.status}
          disabled={busy}
          onChange={(e) => void save({ status: e.target.value }, '状态已更新')}
        >
          {(Object.keys(ST) as ConsultRow['status'][]).map((s) => (
            <option key={s} value={s}>
              {ST[s][0]}
            </option>
          ))}
        </select>
      </td>
      <td style={{ minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            style={{ height: 28, fontSize: 12.5 }}
            value={note}
            placeholder="跟进备注"
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn btn-line xs"
            disabled={busy || note === (c.note ?? '')}
            onClick={() => void save({ note }, '备注已保存')}
          >
            保存
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ConsultsPage() {
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useApi<ConsultRow[]>(
    `/admin/consults${status ? `?status=${status}` : ''}`,
  );
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="note-tip">
        来自前台「咨询」页：多台租用、其他配置等需要单独报价的需求。报价后请在闲鱼建「定制报价专拍」商品。
      </div>
      <div className="bar-h">
        <span className={`chip ${!status ? 'on' : ''}`} onClick={() => setStatus('')}>
          全部
        </span>
        {(Object.keys(ST) as ConsultRow['status'][]).map((s) => (
          <span key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
            {ST[s][0]}
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
                <th>联系方式</th>
                <th>台数</th>
                <th>需求</th>
                <th>状态</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <Row key={c.id + c.status + (c.note ?? '')} c={c} onSaved={() => void reload()} />
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    暂无咨询
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
