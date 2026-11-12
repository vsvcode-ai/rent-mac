import { describe, expect, it } from 'vitest';
import { calcPrice, calcRefund, TERMS } from '../src';

describe('calcPrice', () => {
  const expected = {
    m1: [79900, 0],
    m3: [209700, 30000],
    m6: [359400, 120000],
    m12: [598800, 360000],
  };
  for (const t of TERMS) {
    it(`${t} 单台总价与节省`, () => {
      const p = calcPrice(t, 1);
      expect([p.totalCents, p.savedCents]).toEqual(expected[t]);
    });
    it(`${t} 1–10 台线性放大`, () => {
      for (let q = 1; q <= 10; q++) {
        expect(calcPrice(t, q).totalCents).toBe(expected[t][0] * q);
      }
    });
  }
  it('半年付、年付含专属客服', () => {
    expect(calcPrice('m6', 1).dedicatedSupport).toBe(true);
    expect(calcPrice('m3', 1).dedicatedSupport).toBe(false);
  });
  it('台数越界抛错', () => {
    expect(() => calcPrice('m1', 0)).toThrow();
    expect(() => calcPrice('m1', 11)).toThrow();
    expect(() => calcPrice('m1', 1.5)).toThrow();
  });
});

describe('calcRefund', () => {
  it('需求文档示例：年付用 4 个月退 ¥2,792', () => {
    const r = calcRefund({
      term: 'm12',
      paidCents: 598800,
      quantity: 1,
      activated: true,
      daysUsed: 120,
    });
    expect(r.refundCents).toBe(279200);
  });
  it('开通前全额退', () => {
    expect(
      calcRefund({ term: 'm6', paidCents: 359400, quantity: 1, activated: false }).refundCents,
    ).toBe(359400);
  });
  it('48 小时内无法修复全额退', () => {
    const r = calcRefund({
      term: 'm12',
      paidCents: 598800,
      quantity: 1,
      activated: true,
      hoursSinceActivation: 30,
      unfixableWithinWindow: true,
      daysUsed: 2,
    });
    expect(r.refundCents).toBe(598800);
  });
  it('月付开通后不退', () => {
    expect(
      calcRefund({ term: 'm1', paidCents: 79900, quantity: 1, activated: true, daysUsed: 3 })
        .refundCents,
    ).toBe(0);
  });
  it('不足一个月按一个月算', () => {
    const r = calcRefund({
      term: 'm12',
      paidCents: 598800,
      quantity: 1,
      activated: true,
      daysUsed: 5,
    });
    expect(r.refundCents).toBe(598800 - 79900);
  });
  it('多台按台数计算已用部分', () => {
    const r = calcRefund({
      term: 'm6',
      paidCents: 718800,
      quantity: 2,
      activated: true,
      daysUsed: 60,
    });
    expect(r.refundCents).toBe(718800 - 2 * 2 * 79900);
  });
  it('已用金额超过实付时不为负', () => {
    const r = calcRefund({
      term: 'm3',
      paidCents: 209700,
      quantity: 1,
      activated: true,
      daysUsed: 90,
    });
    expect(r.refundCents).toBe(0);
  });
  it('违反使用政策不退', () => {
    expect(
      calcRefund({
        term: 'm12',
        paidCents: 598800,
        quantity: 1,
        activated: true,
        aupViolation: true,
      }).refundCents,
    ).toBe(0);
  });
});
