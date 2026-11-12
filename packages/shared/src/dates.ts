import { DAY_MS, GRACE_DAYS } from './constants';

/** 加月份；目标月没有该日则取月末（1 月 31 日 + 1 月 = 2 月 28/29 日） */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** 租期：从开通时刻起算 months 个月；宽限期再加 GRACE_DAYS 天 */
export function leaseDates(activatedAt: Date, months: number, graceDays = GRACE_DAYS) {
  const endAt = addMonths(activatedAt, months);
  return {
    startAt: activatedAt,
    endAt,
    graceEndAt: new Date(endAt.getTime() + graceDays * DAY_MS),
  };
}

/** 续费：从当前到期时间往后延长（已过期则从现在起算由调用方决定，这里只做顺延） */
export function extendLease(currentEndAt: Date, months: number, graceDays = GRACE_DAYS) {
  return leaseDates(currentEndAt, months, graceDays);
}

/** 订单号：NY + 年月日（UTC+8）+ 4 位流水，如 NY2611110001 */
export function formatOrderNo(now: Date, seq: number): string {
  const d = new Date(now.getTime() + 8 * 3_600_000);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `NY${yy}${mm}${dd}${String(seq).padStart(4, '0')}`;
}
