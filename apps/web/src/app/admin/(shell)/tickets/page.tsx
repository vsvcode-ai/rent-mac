'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AdminModal,
  ErrorBox,
  Check,
  Pager,
  Pill,
  useDebounced,
  useRun,
} from '@/components/admin/kit';
import { ago, fmtTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { AdminTicket, Paged, Staff } from '@/lib/admin-types';

const STATUS: Record<AdminTicket['status'], [string, string]> = {
  open: ['待处理', 'warn'],
  processing: ['处理中', 'info'],
  resolved: ['已解决', 'ok'],
  closed: ['已关闭', 'mute'],
};
const PAGE = 20;

function TicketModal({
  ticket,
  staff,
  onClose,
  onChanged,
}: {
  ticket: AdminTicket | null;
  staff: Staff[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { run, busy } = useRun();
  const [content, setContent] = useState('');
  const [internal, setInternal] = useState(false);
  useEffect(() => {
    setContent('');
    setInternal(false);
  }, [ticket?.no]);
  if (!ticket)
    return (
      <AdminModal open={false} onClose={onClose}>
        {null}
      </AdminModal>
    );
  const patch = (body: object, msg: string) =>
    run(() => api(`/admin/tickets/${ticket.no}`, { method: 'PATCH', body }), msg).then(
      (r) => r !== undefined && onChanged(),
    );
  return (
    <AdminModal open onClose={onClose} wide>
      <h3>{ticket.no}</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {ticket.userEmail} · {ticket.category}
        {ticket.deviceCode && ` · ${ticket.deviceCode}`} · {fmtTime(ticket.createdAt)}
      </p>
      <div className="dblock" style={{ margin: '14px 0', whiteSpace: 'pre-wrap' }}>
        {ticket.content}
      </div>
      <div className="dgrid" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>状态</label>
          <select
            className="input"
            value={ticket.status}
            disabled={busy}
            onChange={(e) => void patch({ status: e.target.value }, '状态已更新')}
          >
            {(Object.keys(STATUS) as AdminTicket['status'][]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s][0]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>指派给</label>
          <select
            className="input"
            value={ticket.assigneeId ?? ''}
            disabled={busy}
            onChange={(e) => void patch({ assigneeId: e.target.value || undefined }, '已指派')}
          >
            <option value="">未指派</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <h4 style={{ fontSize: 13, margin: '8px 0' }}>处理记录</h4>
      <div className="todo" style={{ marginBottom: 14 }}>
        {ticket.notes.length === 0 && <div className="todo-i muted">暂无记录</div>}
        {ticket.notes.map((n) => (
          <div key={n.id} className="todo-i" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                {n.adminName} · {fmtTime(n.createdAt)}{' '}
                {n.internal ? (
                  <Pill tone="mute">内部备注</Pill>
                ) : (
                  <Pill tone="info">对用户可见</Pill>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="field">
        <label>添加记录</label>
        <textarea
          className="input"
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="chk" style={{ marginBottom: 12 }}>
        <Check checked={internal} onChange={setInternal}>
          仅内部可见（不通知用户）
        </Check>
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || !content.trim()}
        onClick={async () => {
          const r = await run(
            () =>
              api(`/admin/tickets/${ticket.no}/notes`, {
                body: { content: content.trim(), internal },
              }),
            internal ? '内部备注已保存' : '已回复，用户会收到站内通知',
          );
          if (r !== undefined) {
            setContent('');
            onChanged();
          }
        }}
      >
        提交
      </button>
    </AdminModal>
  );
}

export default function TicketsPage() {
  const [status, setStatus] = useState('');
  const [kw, setKw] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const keyword = useDebounced(kw);
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (status) qs.set('status', status);
  if (keyword) qs.set('keyword', keyword);
  const { data, error, reload } = useApi<Paged<AdminTicket>>(`/admin/tickets?${qs}`);
  const { data: staff } = useApi<Staff[]>('/admin/staff');
  const current = data?.items.find((t) => t.no === sel) ?? null;
  return (
    <>
      <div className="bar-h">
        <span
          className={`chip ${!status ? 'on' : ''}`}
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
        >
          全部
        </span>
        {(Object.keys(STATUS) as AdminTicket['status'][]).map((s) => (
          <span
            key={s}
            className={`chip ${status === s ? 'on' : ''}`}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {STATUS[s][0]}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <input
          className="input"
          style={{ height: 30, width: 220, fontSize: 12.5 }}
          placeholder="工单号 / 邮箱 / 内容"
          value={kw}
          onChange={(e) => {
            setKw(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>编号</th>
                <th>用户</th>
                <th>类型</th>
                <th>内容</th>
                <th>状态</th>
                <th>处理人</th>
                <th>提交</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((t) => (
                <tr key={t.no}>
                  <td className="mono">{t.no}</td>
                  <td>{t.userEmail}</td>
                  <td>
                    {t.category}
                    {t.deviceCode && <small>{t.deviceCode}</small>}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {t.content.length > 60 ? t.content.slice(0, 60) + '…' : t.content}
                  </td>
                  <td>
                    <Pill tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Pill>
                  </td>
                  <td>{t.assigneeName || '—'}</td>
                  <td>{ago(t.createdAt)}</td>
                  <td>
                    <button className="btn btn-ghost xs" onClick={() => setSel(t.no)}>
                      处理
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    没有工单
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={8} className="empty">
                    加载中…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
        </div>
      )}
      <TicketModal
        ticket={current}
        staff={staff ?? []}
        onClose={() => setSel(null)}
        onChanged={() => void reload()}
      />
    </>
  );
}
