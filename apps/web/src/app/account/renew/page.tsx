'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addMonths, calcPrice, TERMS, type PlanDef, type Term } from '@nyd/shared';
import { api } from '@/lib/api';
import { fmtDate, yuan } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { AccountLease } from '@/lib/account-types';
import type { OrderView, PlansResponse } from '@/lib/types';

const NAME: Record<Term, string> = { m1: '月付', m3: '季付', m6: '半年付', m12: '年付' };

function RenewForm() {
  const router = useRouter();
  const qs = useSearchParams();
  const leases = useApi<AccountLease[]>('/me/leases');
  const plans = useApi<PlansResponse>('/plans');
  const [leaseId, setLeaseId] = useState(qs.get('lease') ?? '');
  const [term, setTerm] = useState<Term>('m12');
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () => (leases.data ?? []).filter((l) => l.canRenew !== false),
    [leases.data],
  );
  useEffect(() => {
    if (!leaseId && list[0]) setLeaseId(list[0].id);
  }, [leaseId, list]);
  const lease = list.find((l) => l.id === leaseId);

  const defs: PlanDef[] = useMemo(
    () =>
      (plans.data?.plans ?? []).map((p) => ({
        term: p.term,
        name: NAME[p.term],
        months: p.months,
        monthlyCents: p.monthlyCents,
        dedicatedSupport: p.dedicatedSupport,
      })),
    [plans.data],
  );
  const price = defs.length ? calcPrice(term, 1, defs) : null;
  // 未过期：从原到期日顺延；已过期：从现在起算（与后端契约一致）
  const base = lease ? new Date(Math.max(new Date(lease.endAt).getTime(), Date.now())) : null;
  const newEnd = base && price ? addMonths(base, price.months) : null;

  const submit = async () => {
    if (!lease) return;
    if (!agreed) return setErr('请先勾选同意相关条款');
    setBusy(true);
    setErr('');
    try {
      const o = await api<OrderView>('/orders', {
        body: { kind: 'renew', renewLeaseId: lease.id, term, quantity: 1, agreedTerms: true },
      });
      router.push(`/order/${o.no}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  if (leases.loading || plans.loading) return <p className="muted">加载中…</p>;
  if (!list.length) {
    return (
      <div className="tbl-wrap">
        <div className="empty">
          <b>没有可续费的设备</b>开通设备后，可以在这里为它续费。
          <br />
          <Link
            className="btn btn-primary btn-sm"
            style={{ marginTop: 16 }}
            href="/account/devices"
          >
            查看我的设备
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h3>选择设备与租期</h3>
      <div className="field">
        <label>续费设备</label>
        <select className="input" value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
          {list.map((l) => (
            <option key={l.id} value={l.id}>
              {l.deviceCode} · 到期 {fmtDate(l.endAt)}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'grid', gap: 10, margin: '16px 0' }}>
        {TERMS.map((t) => {
          const p = defs.find((d) => d.term === t);
          if (!p) return null;
          const on = t === term;
          return (
            <label
              key={t}
              className="term"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                cursor: 'pointer',
                boxShadow: 'none',
                border: `2px solid ${on ? 'var(--brand)' : 'var(--line)'}`,
              }}
            >
              <input
                type="radio"
                name="term"
                checked={on}
                onChange={() => setTerm(t)}
                style={{ accentColor: 'var(--brand)' }}
              />
              <b>{NAME[t]}</b>
              <span className="muted" style={{ fontSize: 13 }}>
                {yuan(p.monthlyCents)} / 月
              </span>
              <b style={{ marginLeft: 'auto' }}>{yuan(p.monthlyCents * p.months)}</b>
            </label>
          );
        })}
      </div>
      {price && newEnd && (
        <>
          <div className="line-item">
            <span>续费后到期时间</span>
            <b>{fmtDate(newEnd)}</b>
          </div>
          {price.savedCents > 0 && (
            <div className="line-item">
              <span>比月付节省</span>
              <b>{yuan(price.savedCents)}</b>
            </div>
          )}
          <div className="total">
            <span>应付</span>
            <strong style={{ fontSize: 34 }}>{yuan(price.totalCents)}</strong>
          </div>
        </>
      )}
      <label className="check" style={{ margin: '14px 0' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          我已阅读并同意
          <Link className="link" href="/terms">
            服务条款
          </Link>
          、
          <Link className="link" href="/aup">
            可接受使用政策
          </Link>
          和
          <Link className="link" href="/refund">
            退款政策
          </Link>
        </span>
      </label>
      {err && (
        <div className="alert danger" style={{ marginBottom: 12 }}>
          <span>!</span>
          <div>{err}</div>
        </div>
      )}
      <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={busy}>
        {busy ? '提交中…' : '生成续费订单'}
      </button>
      <p className="fine">续费同样到闲鱼付款，客服确认后自动延长到期时间</p>
    </div>
  );
}

export default function RenewPage() {
  return (
    <>
      <h2>续费</h2>
      <Suspense fallback={<p className="muted">加载中…</p>}>
        <RenewForm />
      </Suspense>
    </>
  );
}
