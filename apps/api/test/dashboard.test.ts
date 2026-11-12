import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, loginAdmin, registerUser, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

describe('看板数据', () => {
  it('待办订单行、即将到期设备、利用率分段', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    const o = await user.agent
      .post('/api/orders')
      .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
      .expect(201);
    await user.agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '7123456789012', xianyuBuyerNick: 'n' })
      .expect(200);
    const d1 = (await support.agent.get('/api/admin/dashboard').expect(200)).body;
    // 各测试文件共用一个库，只展示最早的 3 条待核对，所以这里只断言结构和上限
    expect(d1.pendingOrders.length).toBeGreaterThan(0);
    expect(d1.pendingOrders.length).toBeLessThanOrEqual(6);
    expect(d1.pendingOrders[0]).toMatchObject({ status: 'verifying' });
    expect(typeof d1.pendingOrders[0].userEmail).toBe('string');

    await support.agent
      .post(`/api/admin/orders/${o.body.no}/verify`)
      .send({ paidCents: 79900, confirmedAmount: true, confirmedQuantity: true })
      .expect(201);
    const dev = (await ops.agent.get('/api/admin/devices/idle').expect(200)).body[0];
    await ops.agent
      .post(`/api/admin/orders/${o.body.no}/activate`)
      .send({
        devices: [
          {
            deviceId: dev.id,
            uuDeviceCode: '1',
            uuPassword: 'a',
            macUsername: 'u',
            macPassword: 'b',
          },
        ],
      })
      .expect(201);
    // 把租约改到 3 天后到期 → 进入「即将到期」
    const lease = await ctx.prisma.lease.findFirstOrThrow({ where: { deviceId: dev.id } });
    await ctx.prisma.lease.update({
      where: { id: lease.id },
      data: { endAt: new Date(ctx.clock.now().getTime() + 3 * 86_400_000 - 60_000) },
    });
    const d2 = (await ops.agent.get('/api/admin/dashboard').expect(200)).body;
    expect(d2.expiringSoon.find((e: { code: string }) => e.code === dev.code)).toMatchObject({
      daysLeft: 3,
      userEmail: user.email,
    });
    const u = d2.utilization;
    expect(u.inUse).toBeGreaterThanOrEqual(1);
    expect(u.inUse + u.expiring + u.idle + u.recycling + u.maintenance + u.fault).toBe(u.total);
  });
});
