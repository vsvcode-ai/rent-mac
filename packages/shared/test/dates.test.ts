import { describe, expect, it } from 'vitest';
import { addMonths, extendLease, formatOrderNo, leaseDates } from '../src';

const d = (s: string) => new Date(s);

describe('addMonths', () => {
  it('普通加月', () =>
    expect(addMonths(d('2026-11-12T03:00:00Z'), 6).toISOString()).toBe('2027-05-12T03:00:00.000Z'));
  it('月末取目标月最后一天', () => {
    expect(addMonths(d('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(d('2026-08-31T00:00:00Z'), 3).toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });
  it('闰年 2 月', () => {
    expect(addMonths(d('2027-12-31T00:00:00Z'), 2).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths(d('2028-02-29T00:00:00Z'), 12).toISOString()).toBe('2029-02-28T00:00:00.000Z');
  });
  it('跨年', () =>
    expect(addMonths(d('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z'));
});

describe('leaseDates', () => {
  it('宽限期 = 到期 + 3 天', () => {
    const r = leaseDates(d('2026-11-12T00:00:00Z'), 12);
    expect(r.endAt.toISOString()).toBe('2027-11-12T00:00:00.000Z');
    expect(r.graceEndAt.toISOString()).toBe('2027-11-15T00:00:00.000Z');
  });
  it('续费从原到期时间顺延', () => {
    expect(extendLease(d('2027-01-10T00:00:00Z'), 3).endAt.toISOString()).toBe(
      '2027-04-10T00:00:00.000Z',
    );
  });
});

describe('formatOrderNo', () => {
  it('NY + 年月日 + 4 位流水', () =>
    expect(formatOrderNo(d('2026-11-11T02:00:00Z'), 1)).toBe('NY2611110001'));
  it('按 UTC+8 取日期（UTC 16:00 已是次日）', () => {
    expect(formatOrderNo(d('2026-11-11T16:30:00Z'), 12)).toBe('NY2611120012');
  });
});
