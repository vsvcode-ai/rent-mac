'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { leaseState } from './status';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useCopy, useToast } from '@/components/Toast';
import type { AccountLease } from '@/lib/account-types';
import type { Credential } from '@/lib/types';

const HIDE_AFTER_MS = 30_000;
const MASK = '••••••••••';

export function DeviceCard({ lease: l }: { lease: AccountLease }) {
  const copy = useCopy();
  const toast = useToast();
  // 明文只在「显示」期间保留在内存，隐藏或 30 秒后立即丢弃
  const [cred, setCred] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hide = () => {
    clearTimeout(timer.current);
    setCred(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = async () => {
    setBusy(true);
    try {
      // 必须显式点击才请求（POST），后端会记录一次查看
      setCred(await api<Credential>(`/me/leases/${l.id}/credential`, { method: 'POST' }));
      clearTimeout(timer.current);
      timer.current = setTimeout(hide, HIDE_AFTER_MS);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const st = leaseState(l.status, l.daysLeft);
  const total = new Date(l.endAt).getTime() - new Date(l.startAt).getTime();
  const left = new Date(l.endAt).getTime() - Date.now();
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const days = l.daysLeft;
  const urgent = l.status !== 'active' || days <= 7;

  const row = (label: string, value: string | undefined) => (
    <div className="cred-row">
      <span>{label}</span>
      <code>{value ?? MASK}</code>
      <button
        disabled={value === undefined}
        onClick={() => value !== undefined && copy(value, `已复制${label}`)}
      >
        复制
      </button>
    </div>
  );

  return (
    <div className="dev">
      <div className="dev-top">
        <div className="dev-ic">
          <i></i>
        </div>
        <div>
          <h3>{l.deviceCode}</h3>
          <small>Mac mini M4 · 16GB · 256GB · 马来西亚机房</small>
        </div>
        <div className="acts">
          <span className={`pill ${st.c}`} style={{ alignSelf: 'center' }}>
            {st.t}
          </span>
          {l.canRenew !== false && (
            <Link className="btn btn-primary btn-sm" href={`/account/renew?lease=${l.id}`}>
              续费
            </Link>
          )}
          <Link className="btn btn-line btn-sm" href={`/account/tickets?new=1&lease=${l.id}`}>
            报修
          </Link>
        </div>
      </div>
      <div className="dev-meta">
        <div>
          <small>固定 IP</small>
          <b className="mono">{l.publicIp}</b>
        </div>
        <div>
          <small>订单</small>
          <b className="mono" style={{ fontSize: 13 }}>
            {l.orderNo}
          </b>
        </div>
        <div>
          <small>起租</small>
          <b>{fmtDate(l.startAt)}</b>
        </div>
        <div>
          <small>到期</small>
          <b>{fmtDate(l.endAt)}</b>
        </div>
      </div>
      <div className="life">
        <div>
          <span>租期剩余</span>
          <span>
            <b style={{ color: urgent ? 'var(--danger)' : 'var(--ink)' }}>
              {days > 0 ? `${days} 天` : '已到期'}
            </b>
          </span>
        </div>
        <div className="bar">
          <i className={urgent ? 'low' : ''} style={{ width: `${pct}%` }}></i>
        </div>
      </div>
      {urgent && (
        <div className="alert warn">
          <span>!</span>
          <div>
            <b>{days > 0 ? '租期即将到期' : '已进入 3 天宽限期'}</b>
            。请尽快续费，宽限期结束后机器将被回收并抹盘重装，数据无法找回。
          </div>
        </div>
      )}
      <div className="cred">
        <div className="cred-head">
          <b>UU 远程连接信息</b>
          {cred ? (
            <button className="btn btn-ghost btn-sm" onClick={hide}>
              隐藏
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={show} disabled={busy}>
              {busy ? '读取中…' : '显示'}
            </button>
          )}
        </div>
        {row('UU 设备代码', cred?.uuDeviceCode)}
        {row('UU 连接密码', cred?.uuPassword)}
        {row('macOS 用户名', cred?.macUsername)}
        {row('macOS 登录密码', cred?.macPassword)}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          查看凭证会被记录，显示 30
          秒后自动隐藏。请勿转发给他人；如怀疑泄露，提交「重置密码」工单。不会连接？
          <Link className="link" href="/help">
            查看 UU 远程连接教程
          </Link>
        </p>
      </div>
    </div>
  );
}
