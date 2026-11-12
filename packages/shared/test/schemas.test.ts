import { describe, expect, it } from 'vitest';
import { createOrderSchema, submitXianyuSchema } from '../src';

const base = { term: 'm6', quantity: 2, agreedTerms: true as const };
describe('createOrderSchema', () => {
  it('微信或 Telegram 至少一个', () => {
    expect(createOrderSchema.safeParse(base).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, contactWechat: 'abc' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...base, contactTelegram: '@abc' }).success).toBe(true);
  });
  it('超过 10 台被拒绝', () => {
    expect(createOrderSchema.safeParse({ ...base, quantity: 11, contactWechat: 'a' }).success).toBe(
      false,
    );
  });
  it('必须同意条款', () => {
    expect(
      createOrderSchema.safeParse({ ...base, agreedTerms: false, contactWechat: 'a' }).success,
    ).toBe(false);
  });
  it('续费单必须带租约', () => {
    expect(
      createOrderSchema.safeParse({ ...base, kind: 'renew', contactWechat: 'a' }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        ...base,
        kind: 'renew',
        renewLeaseId: 'l1',
        contactWechat: 'a',
      }).success,
    ).toBe(true);
  });
});
describe('续费单联系方式', () => {
  it('续费单可以不填联系方式', () => {
    expect(
      createOrderSchema.safeParse({ ...base, kind: 'renew', renewLeaseId: 'l1' }).success,
    ).toBe(true);
  });
});
describe('submitXianyuSchema', () => {
  it('闲鱼单号 10 位以上数字', () => {
    expect(
      submitXianyuSchema.safeParse({ xianyuOrderNo: '123', xianyuBuyerNick: 'a' }).success,
    ).toBe(false);
    expect(
      submitXianyuSchema.safeParse({ xianyuOrderNo: '4103928811027', xianyuBuyerNick: 'a' })
        .success,
    ).toBe(true);
  });
});
