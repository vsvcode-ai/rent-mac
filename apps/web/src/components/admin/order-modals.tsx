'use client';
import { useEffect, useState } from 'react';
import type { Term } from '@nyd/shared';
import { api } from '@/lib/api';
import { fmtDate, fmtTime, yuan } from '@/lib/format';
import { useToast } from '@/components/Toast';
import type { AdminOrder, AdminOrderDetail, RefundPreview } from '@/lib/admin-types';
import { useAdmin } from './context';
import {
  AdminModal,
  Check,
  OrderPill,
  centsToYuanStr,
  contactText,
  errText,
  useRun,
  yuanStrToCents,
} from './kit';

const TERM_NAME: Record<Term, string> = { m1: '月付', m3: '季付', m6: '半年付', m12: '年付' };
export const termName = (t: Term) => TERM_NAME[t];

/** 核对收款：实收金额与订单不一致时红色提示并禁止确认 */
export function VerifyModal({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, busy } = useRun();
  const toast = useToast();
  const [amt, setAmt] = useState('');
  const [xy, setXy] = useState('');
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  useEffect(() => {
    if (order) {
      setAmt(centsToYuanStr(order.totalCents));
      setXy(order.xianyuOrderNo ?? '');
      setC1(false);
      setC2(false);
    }
  }, [order]);
  if (!order)
    return (
      <AdminModal open={false} onClose={onClose}>
        {null}
      </AdminModal>
    );
  const paid = yuanStrToCents(amt);
  const ok = paid === order.totalCents;
  const submit = async () => {
    const r = await run(
      () =>
        api<{ stockWarning: string | null }>(`/admin/orders/${order.no}/verify`, {
          body: {
            paidCents: paid,
            xianyuOrderNo: xy && xy !== order.xianyuOrderNo ? xy : undefined,
            confirmedAmount: true,
            confirmedQuantity: true,
          },
        }),
      '已确认收款，进入开通队列',
    );
    if (r) {
      if (r.stockWarning) setTimeout(() => toast(r.stockWarning!), 2400);
      onDone();
      onClose();
    }
  };
  return (
    <AdminModal open onClose={onClose} wide>
      <h3>核对收款</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        请到闲鱼后台找到该订单，核对金额、数量、留言中的网站订单号。
      </p>
      <dl className="kv" style={{ margin: '18px 0' }}>
        <dt>网站订单号</dt>
        <dd className="mono">{order.no}</dd>
        <dt>用户</dt>
        <dd>{order.userEmail}</dd>
        <dt>闲鱼订单号</dt>
        <dd>
          <input
            className="input mono"
            style={{ height: 32 }}
            value={xy}
            onChange={(e) => setXy(e.target.value.trim())}
          />
          <small className="muted">用户填写：{order.xianyuBuyerNick || '—'}；填错可在此修正</small>
        </dd>
        <dt>类型</dt>
        <dd>{order.kind === 'renew' ? '续费' : '新租'}</dd>
      </dl>
      <div className="cmpx">
        <div>
          <small>订单应收</small>
          <b>{yuan(order.totalCents)}</b>
          <div className="muted">
            {yuan(order.unitCents * order.months)} × {order.quantity} 台（{termName(order.term)}）
          </div>
        </div>
        <div>
          <small>闲鱼实收（可修改）</small>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <b>¥</b>
            <input
              className="input"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              style={{ height: 36, fontSize: 18, fontWeight: 700 }}
              inputMode="decimal"
            />
          </div>
        </div>
      </div>
      <div className={`match ${ok ? 'ok' : 'bad'}`}>
        {ok
          ? '✓ 金额一致'
          : `✗ 实收与订单金额不符（差 ${yuan(Math.abs(paid - order.totalCents))}），请核实后再确认`}
      </div>
      <div className="chk" style={{ margin: '16px 0' }}>
        <Check checked={c1} onChange={setC1}>
          已核对金额与闲鱼一致
        </Check>
        <Check checked={c2} onChange={setC2}>
          已核对闲鱼拍下数量 = {order.quantity} 台，且留言含网站订单号
        </Check>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <FailButton
          order={order}
          onDone={() => {
            onDone();
            onClose();
          }}
        />
        <button
          className="btn btn-primary btn-block"
          disabled={busy || !ok || !c1 || !c2}
          onClick={submit}
        >
          确认收款
        </button>
      </div>
      <p className="fine">确认后别忘了在闲鱼点「发货」，备注「7 天内开通」。</p>
    </AdminModal>
  );
}

function FailButton({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-line btn-block" onClick={() => setOpen(true)}>
        标记核对失败
      </button>
      <ReasonModal
        open={open}
        onClose={() => setOpen(false)}
        title="标记核对失败"
        hint="原因会通过邮件和站内信发给用户，用户可修改闲鱼订单号后重新提交。"
        placeholder="例如：闲鱼订单金额与订单不符"
        action={(reason) => api(`/admin/orders/${order.no}/fail`, { body: { reason } })}
        okMsg="已标记核对失败，已通知用户"
        onDone={onDone}
      />
    </>
  );
}

/** 通用「填写原因」弹窗 */
export function ReasonModal({
  open,
  onClose,
  title,
  hint,
  placeholder,
  action,
  okMsg,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  placeholder?: string;
  action: (reason: string) => Promise<unknown>;
  okMsg: string;
  onDone: () => void;
}) {
  const { run, busy } = useRun();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <AdminModal open={open} onClose={onClose}>
      <h3>{title}</h3>
      {hint && (
        <p className="muted" style={{ fontSize: 13.5 }}>
          {hint}
        </p>
      )}
      <div className="field" style={{ marginTop: 14 }}>
        <label>原因</label>
        <textarea
          className="input"
          rows={3}
          value={reason}
          placeholder={placeholder}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || reason.trim().length < 2}
        onClick={async () => {
          if ((await run(() => action(reason.trim()), okMsg)) !== undefined) {
            onDone();
            onClose();
          }
        }}
      >
        确定
      </button>
    </AdminModal>
  );
}

/** 退款（M2 流程）：先取建议金额，可修改，填原因和闲鱼退款单号 */
function RefundModal({
  order,
  open,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, busy } = useRun();
  const [unfixable, setUnfixable] = useState(false);
  const [aup, setAup] = useState(false);
  const [prev, setPrev] = useState<RefundPreview | null>(null);
  const [prevErr, setPrevErr] = useState('');
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('');
  const [no, setNo] = useState('');
  useEffect(() => {
    if (!open) return;
    setPrevErr('');
    api<RefundPreview>(
      `/admin/orders/${order.no}/refund-preview?unfixable=${unfixable ? 1 : 0}&aup=${aup ? 1 : 0}`,
    ).then(
      (p) => {
        setPrev(p);
        setAmt(centsToYuanStr(p.suggestedCents));
      },
      (e) => {
        setPrev(null);
        setPrevErr(errText(e));
        setAmt(centsToYuanStr(order.paidCents ?? order.totalCents));
      },
    );
  }, [open, order, unfixable, aup]);
  const paid = order.paidCents ?? order.totalCents;
  const cents = yuanStrToCents(amt);
  const valid = Number.isFinite(cents) && cents >= 0 && cents <= paid && reason.trim().length >= 2;
  return (
    <AdminModal open={open} onClose={onClose} wide>
      <h3>退款登记</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {order.no} · 已付 {yuan(paid)}。完成后请到闲鱼走退款流程，并填写闲鱼退款单号。
      </p>
      <div className="chk" style={{ margin: '14px 0' }}>
        <Check checked={unfixable} onChange={setUnfixable}>
          开通 48 小时内无法修复
        </Check>
        <Check checked={aup} onChange={setAup}>
          违反可接受使用政策
        </Check>
      </div>
      {prev ? (
        <div className="note-tip">
          政策建议退款 <b>{yuan(prev.suggestedCents)}</b>：{prev.reason}
          {prev.activated && `（已用 ${prev.daysUsed} 天，按 ${prev.usedMonths} 个月计）`}
        </div>
      ) : (
        prevErr && (
          <div className="note-tip">无法获取建议金额（{prevErr}），请按退款政策手动填写。</div>
        )
      )}
      <div className="field">
        <label>实际退款金额（¥，不超过已付）</label>
        <input
          className="input"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div className="field">
        <label>原因</label>
        <textarea
          className="input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="field">
        <label>闲鱼退款单号（已退款完成的话填写，留空则先标记「退款中」）</label>
        <input className="input mono" value={no} onChange={(e) => setNo(e.target.value.trim())} />
      </div>
      {order.status === 'active' && (
        <div className="note-tip">该订单使用中：确认后租约结束，机器进入「回收中」。</div>
      )}
      <button
        className="btn btn-primary btn-block"
        disabled={busy || !valid}
        onClick={async () => {
          if (
            await run(
              () =>
                api(`/admin/orders/${order.no}/refund`, {
                  body: {
                    reason: reason.trim(),
                    amountCents: cents,
                    xianyuRefundNo: no || undefined,
                  },
                }),
              no ? '已退款' : '已登记，退款中',
            )
          ) {
            onDone();
            onClose();
          }
        }}
      >
        确认退款登记
      </button>
    </AdminModal>
  );
}

/** 订单详情（抽屉用大弹窗呈现）+ 各种操作入口 */
export function OrderDetailModal({
  no,
  onClose,
  onChanged,
}: {
  no: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAdmin();
  const { run, busy } = useRun();
  const [o, setO] = useState<AdminOrderDetail | null>(null);
  const [err, setErr] = useState('');
  const [sub, setSub] = useState<'verify' | 'cancel' | 'refund' | null>(null);
  const load = () => {
    if (!no) return;
    api<AdminOrderDetail>(`/admin/orders/${no}`).then(setO, (e) => setErr(errText(e)));
  };
  useEffect(() => {
    setO(null);
    setErr('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no]);
  const changed = () => {
    onChanged();
    load();
  };
  return (
    <AdminModal open={!!no} onClose={onClose} wide>
      <h3>订单详情</h3>
      {err && <p style={{ color: 'var(--st-danger)' }}>{err}</p>}
      {!o && !err && <p className="muted">加载中…</p>}
      {o && (
        <>
          <dl className="kv" style={{ margin: '16px 0' }}>
            <dt>订单号</dt>
            <dd className="mono">
              {o.no} <OrderPill status={o.status} />
            </dd>
            <dt>用户</dt>
            <dd>{o.userEmail}</dd>
            <dt>联系方式</dt>
            <dd>{contactText(o) || '—'}</dd>
            <dt>套餐</dt>
            <dd>
              {o.kind === 'renew' ? '续费 · ' : ''}
              {termName(o.term)} × {o.quantity} 台（{o.months} 个月）
            </dd>
            <dt>金额</dt>
            <dd>
              应收 {yuan(o.totalCents)}
              {o.paidCents != null && ` · 实收 ${yuan(o.paidCents)}`}
            </dd>
            <dt>闲鱼</dt>
            <dd className="mono">
              {o.xianyuOrderNo || '—'}（{o.xianyuBuyerNick || '—'}）
            </dd>
            <dt>创建</dt>
            <dd>{fmtTime(o.createdAt)}</dd>
            {o.paidAt && (
              <>
                <dt>确认收款</dt>
                <dd>
                  {fmtTime(o.paidAt)}，开通截止 {o.deadlineAt && fmtDate(o.deadlineAt)}
                </dd>
              </>
            )}
            {o.failedReason && (
              <>
                <dt>核对失败原因</dt>
                <dd>{o.failedReason}</dd>
              </>
            )}
            {o.cancelledReason && (
              <>
                <dt>取消原因</dt>
                <dd>{o.cancelledReason}</dd>
              </>
            )}
          </dl>
          {o.devices.length > 0 && (
            <div className="tw" style={{ marginBottom: 14 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>设备</th>
                    <th>固定 IP</th>
                    <th>租期</th>
                  </tr>
                </thead>
                <tbody>
                  {o.devices.map((d) => (
                    <tr key={d.leaseId}>
                      <td className="mono">{d.code}</td>
                      <td className="mono">{d.publicIp}</td>
                      <td>
                        {fmtDate(d.startAt)} → {fmtDate(d.endAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {o.status === 'verifying' && can('support') && (
              <button className="btn btn-primary btn-sm" onClick={() => setSub('verify')}>
                核对收款
              </button>
            )}
            {['pending', 'verifying', 'failed'].includes(o.status) && can('support') && (
              <button className="btn btn-line btn-sm" onClick={() => setSub('cancel')}>
                取消订单
              </button>
            )}
            {['queued', 'active'].includes(o.status) && can('admin') && (
              <button className="btn btn-line btn-sm" onClick={() => setSub('refund')}>
                退款登记
              </button>
            )}
            {o.status === 'active' && can('ops', 'admin') && (
              <button
                className="btn btn-line btn-sm"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm('按「超期天数」延长该订单所有租约的到期时间（开通超过 7 天的补偿）？')
                  ) {
                    void run(
                      () => api(`/admin/orders/${o.no}/compensate`, { method: 'POST', body: {} }),
                      '已补偿时长',
                    ).then(changed);
                  }
                }}
              >
                补偿时长
              </button>
            )}
          </div>
          <VerifyModal
            order={sub === 'verify' ? o : null}
            onClose={() => setSub(null)}
            onDone={changed}
          />
          <ReasonModal
            open={sub === 'cancel'}
            onClose={() => setSub(null)}
            title="取消订单"
            action={(reason) => api(`/admin/orders/${o.no}/cancel`, { body: { reason } })}
            okMsg="订单已取消"
            onDone={changed}
          />
          <RefundModal
            order={o}
            open={sub === 'refund'}
            onClose={() => setSub(null)}
            onDone={changed}
          />
        </>
      )}
    </AdminModal>
  );
}
