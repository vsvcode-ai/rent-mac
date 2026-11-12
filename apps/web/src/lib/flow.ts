import { DEFAULT_PLANS, type Term } from '@nyd/shared';

export interface PlanSel {
  plan: Term;
  qty: number;
}
export const SEL_KEY = 'nyd_sel';
const DEFAULT_SEL: PlanSel = { plan: 'm12', qty: 1 };

export function loadSel(): PlanSel {
  try {
    const v = JSON.parse(sessionStorage.getItem(SEL_KEY) ?? 'null') as Partial<PlanSel> | null;
    if (
      v &&
      DEFAULT_PLANS.some((p) => p.term === v.plan) &&
      Number.isInteger(v.qty) &&
      v.qty! >= 1 &&
      v.qty! <= 10
    ) {
      return { plan: v.plan!, qty: v.qty! };
    }
  } catch {
    /* 忽略损坏的缓存 */
  }
  return DEFAULT_SEL;
}
export const saveSel = (s: PlanSel) => sessionStorage.setItem(SEL_KEY, JSON.stringify(s));

/** 登录后回跳：只允许站内相对路径，防开放重定向（拒绝 //evil.com、/\evil.com、带协议的地址） */
export function safeNext(next: string | null | undefined, fallback = '/account'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  if (/[\r\n\\]/.test(next)) return fallback;
  return next;
}
