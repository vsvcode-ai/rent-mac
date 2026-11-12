'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TicketPill } from '@/components/account/status';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { ago, fmtTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { TICKET_CATEGORIES, type AccountLease, type TicketView } from '@/lib/account-types';

function NewTicket({
  open,
  onClose,
  leases,
  presetLease,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  leases: AccountLease[];
  presetLease: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState<string>(TICKET_CATEGORIES[0]);
  const [leaseId, setLeaseId] = useState(presetLease);
  const [content, setContent] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setLeaseId(presetLease), [presetLease]);

  const submit = async () => {
    const text = content.trim();
    if (text.length < 5) return setErr('请至少描述 5 个字');
    setBusy(true);
    setErr('');
    try {
      await api('/tickets', { body: { category, content: text, leaseId: leaseId || undefined } });
      toast('工单已提交');
      setContent('');
      onClose();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3>提交工单</h3>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        我们通常在 2 小时内响应（10:00–23:00）
      </p>
      <div className="field">
        <label>问题类型</label>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>相关设备</label>
        <select className="input" value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
          <option value="">（不关联设备）</option>
          {leases.map((l) => (
            <option key={l.id} value={l.id}>
              {l.deviceCode}
            </option>
          ))}
        </select>
      </div>
      <div className={`field${err ? ' bad' : ''}`}>
        <label>问题描述</label>
        <textarea
          className="input"
          value={content}
          maxLength={2000}
          onChange={(e) => setContent(e.target.value)}
          placeholder="请描述你遇到的问题，越具体越好"
        />
        {err && (
          <div className="errmsg" style={{ display: 'block' }}>
            {err}
          </div>
        )}
      </div>
      <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={busy}>
        {busy ? '提交中…' : '提交工单'}
      </button>
    </Modal>
  );
}

function Detail({ t, onChanged }: { t: TicketView; onChanged: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`/me/tickets/${t.no}/reply`, { body: { content: text.trim() } });
      setText('');
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, marginBottom: 12 }}>{t.content}</p>
      {t.notes.map((n, i) => (
        <div key={i} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <small className="muted">
            {n.fromStaff ? '客服' : '我'} · {fmtTime(n.createdAt)}
          </small>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 4 }}>{n.content}</p>
        </div>
      ))}
      {t.status !== 'closed' && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <input
            className="input"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder="补充说明或回复客服"
          />
          <button className="btn btn-line btn-sm" onClick={send} disabled={busy || !text.trim()}>
            发送
          </button>
        </div>
      )}
    </div>
  );
}

function Tickets() {
  const qs = useSearchParams();
  const tickets = useApi<TicketView[]>('/me/tickets');
  const leases = useApi<AccountLease[]>('/me/leases');
  const [open, setOpen] = useState(false);
  const [openNo, setOpenNo] = useState<string | null>(null);
  const preset = qs.get('lease') ?? '';

  // 从「我的设备 → 报修」跳转过来时自动打开提交弹窗
  useEffect(() => {
    if (qs.get('new')) setOpen(true);
  }, [qs]);

  const list = tickets.data ?? [];
  return (
    <>
      <h2>
        工单
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          提交工单
        </button>
      </h2>
      {tickets.loading ? (
        <p className="muted">加载中…</p>
      ) : tickets.error ? (
        <div className="alert danger">
          <span>!</span>
          <div>{tickets.error.message}</div>
        </div>
      ) : list.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>编号</th>
                <th>类型</th>
                <th>内容</th>
                <th>状态</th>
                <th>提交时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.no}>
                  <td className="mono">{t.no}</td>
                  <td>
                    {t.category}
                    {t.deviceCode && (
                      <div className="muted mono" style={{ fontSize: 12 }}>
                        {t.deviceCode}
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    {t.content.length > 50 ? t.content.slice(0, 50) + '…' : t.content}
                  </td>
                  <td>
                    <TicketPill status={t.status} />
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {ago(t.createdAt)}
                  </td>
                  <td>
                    <button
                      className="link"
                      onClick={() => setOpenNo(openNo === t.no ? null : t.no)}
                    >
                      {openNo === t.no
                        ? '收起'
                        : `详情${t.notes.length ? `（${t.notes.length}）` : ''}`}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tbl-wrap">
          <div className="empty">
            <b>没有工单</b>遇到无法连接、卡顿等问题，随时提交。
          </div>
        </div>
      )}
      {list
        .filter((t) => t.no === openNo)
        .map((t) => (
          <Detail key={t.no} t={t} onChanged={tickets.reload} />
        ))}
      <NewTicket
        open={open}
        onClose={() => setOpen(false)}
        leases={leases.data ?? []}
        presetLease={preset}
        onDone={tickets.reload}
      />
    </>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<p className="muted">加载中…</p>}>
      <Tickets />
    </Suspense>
  );
}
