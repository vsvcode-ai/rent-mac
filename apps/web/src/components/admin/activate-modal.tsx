'use client';
import { useEffect, useMemo, useState } from 'react';
import { addMonths } from '@nyd/shared';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import type { AdminOrder, IdleDevice } from '@/lib/admin-types';
import { AdminModal, Check, errText, useRun } from './kit';
import { termName } from './order-modals';

interface Slot {
  deviceId: string;
  uuDeviceCode: string;
  uuPassword: string;
  macUsername: string;
  macPassword: string;
}
const emptySlot = (deviceId = ''): Slot => ({
  deviceId,
  uuDeviceCode: '',
  uuPassword: '',
  macUsername: 'nydesk',
  macPassword: '',
});

/** 批量粘贴解析：每行「设备编号, UU设备代码, UU密码, macOS用户名, macOS密码」，制表符或逗号分隔 */
export function parsePaste(text: string, idle: IdleDevice[]): { slots: Slot[]; errors: string[] } {
  const byCode = new Map(idle.map((d) => [d.code.toLowerCase(), d]));
  const slots: Slot[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .forEach((line, idx) => {
      if (!line) return;
      const n = idx + 1;
      const f = (line.includes('\t') ? line.split('\t') : line.split(',')).map((x) => x.trim());
      if (f.length !== 5) return errors.push(`第 ${n} 行：需要 5 列，实际 ${f.length} 列`);
      const [code, uu, up, mu, mp] = f as [string, string, string, string, string];
      const d = byCode.get(code.toLowerCase());
      if (!d) return errors.push(`第 ${n} 行：${code} 不是空闲机器（不存在或已被占用）`);
      if (seen.has(d.id)) return errors.push(`第 ${n} 行：${code} 重复`);
      if (!uu || !up || !mu || !mp) return errors.push(`第 ${n} 行：有空字段`);
      seen.add(d.id);
      slots.push({
        deviceId: d.id,
        uuDeviceCode: uu,
        uuPassword: up,
        macUsername: mu,
        macPassword: mp,
      });
    });
  return { slots, errors };
}

export function ActivateModal({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, busy } = useRun();
  const [idle, setIdle] = useState<IdleDevice[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [paste, setPaste] = useState('');
  const [pasteErrs, setPasteErrs] = useState<string[]>([]);
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);

  useEffect(() => {
    if (!order) return;
    setC1(false);
    setC2(false);
    setPaste('');
    setPasteErrs([]);
    setLoadErr('');
    api<IdleDevice[]>('/admin/devices/idle').then(
      (list) => {
        setIdle(list);
        setSlots(Array.from({ length: order.quantity }, (_, i) => emptySlot(list[i]?.id)));
      },
      (e) => setLoadErr(errText(e)),
    );
  }, [order]);

  const chosen = useMemo(() => new Set(slots.map((s) => s.deviceId).filter(Boolean)), [slots]);
  if (!order)
    return (
      <AdminModal open={false} onClose={onClose}>
        {null}
      </AdminModal>
    );

  const set = (i: number, patch: Partial<Slot>) =>
    setSlots((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const applyPaste = () => {
    const r = parsePaste(paste, idle);
    const errs = [...r.errors];
    if (r.slots.length > order.quantity)
      errs.push(`订单只有 ${order.quantity} 台，粘贴了 ${r.slots.length} 台`);
    setPasteErrs(errs);
    if (r.slots.length && !errs.length) {
      setSlots(Array.from({ length: order.quantity }, (_, i) => r.slots[i] ?? emptySlot()));
      if (r.slots.length < order.quantity)
        setPasteErrs([
          `只粘贴了 ${r.slots.length} 台，其余 ${order.quantity - r.slots.length} 台请手动选择`,
        ]);
    }
  };
  const complete = slots.every(
    (s) => s.deviceId && s.uuDeviceCode && s.uuPassword && s.macUsername && s.macPassword,
  );
  const submit = async () => {
    const r = await run(
      () => api(`/admin/orders/${order.no}/activate`, { body: { devices: slots } }),
      '已开通，用户将收到邮件和站内通知',
    );
    if (r !== undefined) {
      onDone();
      onClose();
    }
  };
  const end = addMonths(new Date(), order.months);

  return (
    <AdminModal open onClose={onClose} wide>
      <h3>分配机器并开通</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {order.userEmail} · {termName(order.term)} × {order.quantity} 台 · 订单 {order.no}
      </p>
      <div className="note-tip" style={{ marginTop: 14 }}>
        租期 <b>{order.months} 个月</b>，从点击「完成开通」当天开始计算，预计到期{' '}
        <b>{fmtDate(end)}</b>
      </div>
      {loadErr && <p style={{ color: 'var(--st-danger)' }}>{loadErr}</p>}
      {!loadErr && idle.length < order.quantity && idle.length > 0 && (
        <div className="note-tip">空闲机器只有 {idle.length} 台，不够分配，请先回收或补货。</div>
      )}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink2)' }}>
          批量粘贴表格（每行：设备编号, UU设备代码, UU密码, macOS用户名, macOS密码）
        </summary>
        <textarea
          className="input mono"
          rows={4}
          style={{ marginTop: 8, fontSize: 12 }}
          placeholder={'NYD-MY-0001\t583920174\tk7Rt9xQm\tnydesk\tHq4-vN8zXe2P'}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-line xs" onClick={applyPaste} disabled={!paste.trim()}>
            解析并填入
          </button>
        </div>
        {pasteErrs.map((e) => (
          <div key={e} style={{ color: 'var(--st-danger)', fontSize: 12.5, marginTop: 4 }}>
            {e}
          </div>
        ))}
      </details>
      <div
        style={{ display: 'grid', gap: 12, maxHeight: '44vh', overflow: 'auto', paddingRight: 4 }}
      >
        {slots.map((s, i) => (
          <div className="dblock" key={i}>
            <h5>
              <span>第 {i + 1} 台</span>
              <select
                className="input mono"
                style={{ height: 28, width: 'auto', fontSize: 12 }}
                value={s.deviceId}
                onChange={(e) => set(i, { deviceId: e.target.value })}
              >
                <option value="">选择空闲机器…</option>
                {idle
                  .filter((d) => d.id === s.deviceId || !chosen.has(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.rackLocation} · {d.publicIp}
                    </option>
                  ))}
              </select>
            </h5>
            <div className="dgrid">
              <div className="field">
                <label>UU 设备代码</label>
                <input
                  className="input mono"
                  value={s.uuDeviceCode}
                  onChange={(e) => set(i, { uuDeviceCode: e.target.value.trim() })}
                />
              </div>
              <div className="field">
                <label>UU 连接密码</label>
                <input
                  className="input mono"
                  value={s.uuPassword}
                  onChange={(e) => set(i, { uuPassword: e.target.value })}
                />
              </div>
              <div className="field">
                <label>macOS 用户名</label>
                <input
                  className="input mono"
                  value={s.macUsername}
                  onChange={(e) => set(i, { macUsername: e.target.value.trim() })}
                />
              </div>
              <div className="field">
                <label>macOS 登录密码</label>
                <input
                  className="input mono"
                  value={s.macPassword}
                  onChange={(e) => set(i, { macPassword: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
        {!loadErr && idle.length === 0 && (
          <div className="empty">没有空闲机器了，请先回收或补货</div>
        )}
      </div>
      <div className="chk" style={{ margin: '16px 0' }}>
        <Check checked={c1} onChange={setC1}>
          已重置并更换密码
        </Check>
        <Check checked={c2} onChange={setC2}>
          已在机器上登录 UU 远程并测试可连
        </Check>
      </div>
      <button
        className="btn btn-primary btn-lg btn-block"
        disabled={busy || !complete || !c1 || !c2}
        onClick={submit}
      >
        完成开通并通知用户
      </button>
    </AdminModal>
  );
}
