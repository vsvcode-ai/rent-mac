'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  DEVICE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  type DeviceStatus,
  type OrderStatus,
} from '@nyd/shared';
import { ApiError } from '@/lib/api';
import { useToast } from '@/components/Toast';

/** 接口错误 → 给人看的文字；403 给出明确的权限提示 */
export function errText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return '当前角色没有权限执行该操作';
    if (e.status === 401) return '登录已过期，请重新登录';
    return e.message;
  }
  return e instanceof Error ? e.message : '操作失败';
}

export function AdminModal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <div
      className={`modal-bg${open ? ' on' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
          <button className="x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
          {children}
        </div>
      )}
    </div>
  );
}

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

const ORDER_TONE: Record<OrderStatus, string> = {
  pending: 'warn',
  verifying: 'info',
  failed: 'danger',
  queued: 'brand',
  active: 'ok',
  done: 'mute',
  cancelled: 'mute',
  refunding: 'warn',
  refunded: 'mute',
  renewed: 'ok',
};
export const OrderPill = ({ status }: { status: OrderStatus }) => (
  <Pill tone={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Pill>
);

export const DEVICE_TONE: Record<DeviceStatus, string> = {
  idle: 'info',
  assigned: 'brand',
  in_use: 'ok',
  expiring: 'warn',
  grace: 'warn',
  recycling: 'brand',
  maintenance: 'danger',
  fault: 'danger',
  retired: 'mute',
};
export const DevicePill = ({ status }: { status: DeviceStatus }) => (
  <Pill tone={DEVICE_TONE[status]}>{DEVICE_STATUS_LABEL[status]}</Pill>
);

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (p) => pages <= 9 || p === 1 || p === pages || Math.abs(p - page) <= 2,
  );
  return (
    <div className="pager">
      <span>共 {total} 条</span>
      {nums.map((p, i) => (
        <span key={p} style={{ display: 'contents' }}>
          {i > 0 && nums[i - 1]! < p - 1 && <span>…</span>}
          <button className={p === page ? 'on' : ''} onClick={() => onPage(p)}>
            {p}
          </button>
        </span>
      ))}
    </div>
  );
}

/** 执行一个异步操作：成功弹提示，失败弹错误，期间 busy=true */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (okMsg) toast(okMsg);
        return r;
      } catch (e) {
        toast(errText(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

export function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export const contactText = (o: { contactWechat: string | null; contactTelegram: string | null }) =>
  [o.contactWechat && `微信 ${o.contactWechat}`, o.contactTelegram && `TG ${o.contactTelegram}`]
    .filter(Boolean)
    .join(' · ');

export function Loading() {
  return <div className="empty">加载中…</div>;
}
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="box empty">
      <b>加载失败</b>
      {errText(error)}
    </div>
  );
}

export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{' '}
      {children}
    </label>
  );
}

export const centsToYuanStr = (c: number) => String(c / 100);
export const yuanStrToCents = (s: string) => Math.round(Number(s) * 100);

/** 剩余时间文案：remainingMs 为负表示已超期 */
export function remainText(ms: number): string {
  const d = Math.floor(Math.abs(ms) / 86_400_000);
  const h = Math.floor((Math.abs(ms) % 86_400_000) / 3_600_000);
  return ms < 0 ? `已超期 ${d} 天 ${h} 时` : `剩 ${d} 天 ${h} 时`;
}

export const ROLE_LABEL = { support: '客服', ops: '运维', admin: '管理员' } as const;
