export const TERMS = ['m1', 'm3', 'm6', 'm12'] as const;
export type Term = (typeof TERMS)[number];

export interface PlanDef {
  term: Term;
  name: string;
  months: number;
  /** 每月单价，单位：分 */
  monthlyCents: number;
  /** 半年付、年付含 1 对 1 专属客服 */
  dedicatedSupport: boolean;
}

export const DEFAULT_PLANS: readonly PlanDef[] = [
  { term: 'm1', name: '月付', months: 1, monthlyCents: 79900, dedicatedSupport: false },
  { term: 'm3', name: '季付', months: 3, monthlyCents: 69900, dedicatedSupport: false },
  { term: 'm6', name: '半年付', months: 6, monthlyCents: 59900, dedicatedSupport: true },
  { term: 'm12', name: '年付', months: 12, monthlyCents: 49900, dedicatedSupport: true },
];

/** 退租按月付价重新计算（单位：分） */
export const REFUND_BASE_MONTHLY_CENTS = 79900;

export const MAX_QTY_PER_ORDER = 10;
/** 待付款订单保留时长（小时） */
export const PENDING_EXPIRE_HOURS = 48;
/** 付款确认后的开通时限（天） */
export const ACTIVATION_DEADLINE_DAYS = 7;
/** 开通剩余不足该天数时预警 */
export const ACTIVATION_WARN_DAYS = 2;
export const GRACE_DAYS = 3;
/** 填了闲鱼单号超过该小时数没核对则提醒 */
export const VERIFY_REMIND_HOURS = 24;
/** 开通后该小时数内无法正常使用可全额退款 */
export const FULL_REFUND_WINDOW_HOURS = 48;
export const EXPIRY_REMIND_DAYS = [7, 3, 1] as const;

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
