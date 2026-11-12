'use client';
import { useState } from 'react';
import { calcRefund, DEFAULT_PLANS, REFUND_BASE_MONTHLY_CENTS, type Term } from '@nyd/shared';
import { yuan } from '@/lib/format';

const PAID_PLANS = DEFAULT_PLANS.filter((p) => p.months > 1);

/** 退款金额计算器：适用于「开通 48 小时后主动退租」，已用月数按整月计 */
export function RefundCalc() {
  const [term, setTerm] = useState<Term>('m12');
  const [qty, setQty] = useState(1);
  const [usedRaw, setUsed] = useState(3);
  const p = PAID_PLANS.find((x) => x.term === term)!;
  const used = Math.min(usedRaw, p.months);
  const paid = p.monthlyCents * p.months * qty;
  // 以 30 天为一个月，按「已用整月数」调用共享的退款规则，保证与后台计算一致
  const r = calcRefund({
    term,
    paidCents: paid,
    quantity: qty,
    activated: true,
    daysUsed: used * 30,
  });
  const cost = Math.min(paid, REFUND_BASE_MONTHLY_CENTS * used * qty);

  return (
    <div className="calc">
      <h3 className="serif" style={{ fontSize: 22 }}>
        退款金额计算器
      </h3>
      <p className="muted" style={{ fontSize: 14, margin: '6px 0 20px' }}>
        适用于「开通 48 小时后主动退租」的情况。
      </p>
      <div className="row2">
        <div className="field">
          <label htmlFor="c-plan">你购买的租期</label>
          <select
            id="c-plan"
            className="input"
            value={term}
            onChange={(e) => setTerm(e.target.value as Term)}
          >
            {PAID_PLANS.map((x) => (
              <option key={x.term} value={x.term}>
                {x.name}（{yuan(x.monthlyCents * x.months)} / 台）
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-qty">台数</label>
          <select
            id="c-qty"
            className="input"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-used">
          已使用 <b>{used} 个月</b>
          <small>（不足一个月按一个月计）</small>
        </label>
        <input
          id="c-used"
          type="range"
          className="range"
          min={1}
          max={p.months}
          value={used}
          onChange={(e) => setUsed(Number(e.target.value))}
        />
      </div>
      <div className="calc-out">
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            已付 <b>{yuan(paid)}</b> − 已用{' '}
            <b>{`¥${REFUND_BASE_MONTHLY_CENTS / 100} × ${used} × ${qty} = ${yuan(cost)}`}</b>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {r.refundCents === 0
              ? '已使用整个租期，无可退金额'
              : `示例：${p.name}用了 ${used} 个月`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 13 }}>
            预计退款
          </div>
          <b>{yuan(r.refundCents)}</b>
        </div>
      </div>
    </div>
  );
}
