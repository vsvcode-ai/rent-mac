import {
  DEFAULT_PLANS,
  MAX_QTY_PER_ORDER,
  REFUND_BASE_MONTHLY_CENTS,
  type PlanDef,
  type Term,
} from './constants';

export function getPlan(term: Term, plans: readonly PlanDef[] = DEFAULT_PLANS): PlanDef {
  const p = plans.find((x) => x.term === term);
  if (!p) throw new Error(`未知租期: ${term}`);
  return p;
}

export interface PriceBreakdown {
  term: Term;
  months: number;
  quantity: number;
  unitMonthlyCents: number;
  /** 总价 = 每月单价 × 月数 × 台数 */
  totalCents: number;
  /** 相比月付节省的金额 */
  savedCents: number;
  dedicatedSupport: boolean;
}

export function calcPrice(
  term: Term,
  quantity: number,
  plans: readonly PlanDef[] = DEFAULT_PLANS,
): PriceBreakdown {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_ORDER) {
    throw new Error(`台数必须是 1–${MAX_QTY_PER_ORDER} 的整数`);
  }
  const p = getPlan(term, plans);
  const monthBase = getPlan('m1', plans).monthlyCents;
  return {
    term,
    months: p.months,
    quantity,
    unitMonthlyCents: p.monthlyCents,
    totalCents: p.monthlyCents * p.months * quantity,
    savedCents: (monthBase - p.monthlyCents) * p.months * quantity,
    dedicatedSupport: p.dedicatedSupport,
  };
}

export const formatYuan = (cents: number): string =>
  '¥' + (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

// ---------- 退款 ----------

export interface RefundInput {
  term: Term;
  /** 实付总额（分） */
  paidCents: number;
  quantity: number;
  /** 是否已开通 */
  activated: boolean;
  /** 开通后已过的小时数 */
  hoursSinceActivation?: number;
  /** 开通后 48 小时内因机器/网络问题无法修复 */
  unfixableWithinWindow?: boolean;
  /** 实际已使用天数（以开通日算起） */
  daysUsed?: number;
  /** 违反可接受使用政策被停机 */
  aupViolation?: boolean;
}

export interface RefundResult {
  refundCents: number;
  reason: string;
}

/** 按退款政策（需求文档第 8 节）计算可退金额。已使用月数向上取整。 */
export function calcRefund(i: RefundInput): RefundResult {
  if (i.aupViolation) return { refundCents: 0, reason: '违反可接受使用政策被停机，不退款' };
  if (!i.activated) return { refundCents: i.paidCents, reason: '开通前，全额退款' };
  if (i.unfixableWithinWindow && (i.hoursSinceActivation ?? Infinity) <= 48) {
    return { refundCents: i.paidCents, reason: '开通 48 小时内无法修复，全额退款' };
  }
  const months = getPlan(i.term).months;
  if (months === 1) return { refundCents: 0, reason: '月付订单开通后不退' };
  const usedMonths = Math.max(1, Math.ceil((i.daysUsed ?? 0) / 30));
  const usedCents = usedMonths * REFUND_BASE_MONTHLY_CENTS * i.quantity;
  const refundCents = Math.max(0, i.paidCents - usedCents);
  return {
    refundCents,
    reason: `已用 ${usedMonths} 个月，按月付价 ${formatYuan(REFUND_BASE_MONTHLY_CENTS)}/月/台重新计算`,
  };
}
