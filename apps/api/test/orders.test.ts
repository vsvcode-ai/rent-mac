import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, registerUser, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

const body = { term: 'm6', quantity: 2, contactWechat: 'wx_test', agreedTerms: true };

describe('套餐', () => {
  it('返回四个租期、价格和剩余台数', async () => {
    const r = await ctx.http().get('/api/plans').expect(200);
    expect(r.body.plans.map((p: { term: string }) => p.term)).toEqual(['m1', 'm3', 'm6', 'm12']);
    expect(r.body.plans[3]).toMatchObject({
      monthlyCents: 49900,
      totalCents: 598800,
      dedicatedSupport: true,
    });
    expect(r.body.available).toBe(200);
  });
});

describe('下单', () => {
  it('未登录不能下单', async () => {
    await ctx.http().post('/api/orders').send(body).expect(401);
  });

  it('创建订单：服务端计价、保存快照、48 小时后过期', async () => {
    const { agent } = await registerUser(ctx);
    // 客户端传来的任何价格字段都会被忽略
    const r = await agent
      .post('/api/orders')
      .send({ ...body, totalCents: 1 })
      .expect(201);
    expect(r.body).toMatchObject({
      term: 'm6',
      quantity: 2,
      unitCents: 59900,
      totalCents: 718800,
      status: 'pending',
    });
    expect(r.body.no).toMatch(/^NY\d{6}\d{4}$/);
    const diff = new Date(r.body.expiresAt).getTime() - new Date(r.body.createdAt).getTime();
    expect(diff).toBeGreaterThan(47.9 * 3600_000);
    expect(diff).toBeLessThan(48.1 * 3600_000);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { no: r.body.no } });
    expect(row.priceSnapshot).toMatchObject({ totalCents: 718800 });
  });

  it('订单号当日递增且不重复', async () => {
    const { agent } = await registerUser(ctx);
    const a = await agent.post('/api/orders').send(body).expect(201);
    const b = await agent.post('/api/orders').send(body).expect(201);
    expect(Number(b.body.no.slice(8))).toBe(Number(a.body.no.slice(8)) + 1);
  });

  it('校验：超过 10 台、没联系方式、没同意条款都被拒绝', async () => {
    const { agent } = await registerUser(ctx);
    await agent
      .post('/api/orders')
      .send({ ...body, quantity: 11 })
      .expect(400);
    await agent
      .post('/api/orders')
      .send({ ...body, contactWechat: undefined })
      .expect(400);
    await agent
      .post('/api/orders')
      .send({ ...body, agreedTerms: false })
      .expect(400);
    await agent
      .post('/api/orders')
      .send({ ...body, term: 'm2' })
      .expect(400);
  });

  it('只能看到自己的订单', async () => {
    const a = await registerUser(ctx);
    const b = await registerUser(ctx);
    const o = await a.agent.post('/api/orders').send(body).expect(201);
    await a.agent.get(`/api/orders/${o.body.no}`).expect(200);
    await b.agent.get(`/api/orders/${o.body.no}`).expect(404);
    const mine = await b.agent.get('/api/me/orders').expect(200);
    expect(mine.body).toHaveLength(0);
  });
});

describe('填写闲鱼单号与取消', () => {
  it('待付款 → 待核对；重复提交被拒绝', async () => {
    const { agent } = await registerUser(ctx);
    const o = await agent.post('/api/orders').send(body).expect(201);
    await agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '123', xianyuBuyerNick: 'a' })
      .expect(400);
    const r = await agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '4103928811027', xianyuBuyerNick: '阿旺' })
      .expect(200);
    expect(r.body.status).toBe('verifying');
    await agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '4103928811028', xianyuBuyerNick: 'a' })
      .expect(409);
    await agent.post(`/api/orders/${o.body.no}/cancel`).expect(409);
  });

  it('同一个闲鱼单号不能用在两个订单上', async () => {
    const { agent } = await registerUser(ctx);
    const a = await agent.post('/api/orders').send(body).expect(201);
    const b = await agent.post('/api/orders').send(body).expect(201);
    const x = { xianyuOrderNo: '5500000000001', xianyuBuyerNick: 'a' };
    await agent.post(`/api/orders/${a.body.no}/xianyu`).send(x).expect(200);
    await agent.post(`/api/orders/${b.body.no}/xianyu`).send(x).expect(409);
  });

  it('待付款可以取消', async () => {
    const { agent } = await registerUser(ctx);
    const o = await agent.post('/api/orders').send(body).expect(201);
    const r = await agent.post(`/api/orders/${o.body.no}/cancel`).expect(200);
    expect(r.body.status).toBe('cancelled');
  });

  it('超过 48 小时：不能再提交，定时任务把订单自动取消', async () => {
    const { agent } = await registerUser(ctx);
    const o = await agent.post('/api/orders').send(body).expect(201);
    ctx.clock.advance(49 * 3600_000);
    await agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '6600000000001', xianyuBuyerNick: 'a' })
      .expect(409);
    const { OrdersService } = await import('../src/orders/orders.service.js');
    const n = await ctx.app.get(OrdersService).expirePending();
    expect(n).toBeGreaterThanOrEqual(1);
    const r = await agent.get(`/api/orders/${o.body.no}`).expect(200);
    expect(r.body.status).toBe('cancelled');
  });

  it('待核对的订单不会被 48 小时任务取消', async () => {
    const { agent } = await registerUser(ctx);
    const o = await agent.post('/api/orders').send(body).expect(201);
    await agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '7700000000001', xianyuBuyerNick: 'a' })
      .expect(200);
    ctx.clock.advance(49 * 3600_000);
    const { OrdersService } = await import('../src/orders/orders.service.js');
    await ctx.app.get(OrdersService).expirePending();
    const r = await agent.get(`/api/orders/${o.body.no}`).expect(200);
    expect(r.body.status).toBe('verifying');
  });
});

describe('库存', () => {
  it('待开通订单占用库存，待付款、待核对不占', async () => {
    const { agent } = await registerUser(ctx);
    const o = await agent
      .post('/api/orders')
      .send({ ...body, quantity: 3 })
      .expect(201);
    const before = (await ctx.http().get('/api/plans')).body.available;
    await ctx.prisma.order.update({ where: { no: o.body.no }, data: { status: 'queued' } });
    const after = (await ctx.http().get('/api/plans')).body.available;
    expect(before - after).toBe(3);
  });
});
