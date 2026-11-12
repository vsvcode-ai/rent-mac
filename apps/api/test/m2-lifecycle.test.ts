import { addMonths } from '@nyd/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LifecycleService } from '../src/lifecycle/lifecycle.service.js';
import {
  DAY,
  createApp,
  loginAdmin,
  provision,
  registerUser,
  xyNo,
  type TestCtx,
} from './helpers.js';

let ctx: TestCtx;
let tick: () => ReturnType<LifecycleService['tick']>;
beforeAll(async () => {
  ctx = await createApp();
  const svc = ctx.app.get(LifecycleService);
  tick = () => svc.tick();
});
afterAll(() => ctx.app.close());

/** 把时钟拨到「租约距到期还剩 leftMs」（只往前拨） */
const setLeft = (lease: { endAt: Date }, leftMs: number) =>
  ctx.clock.advance(lease.endAt.getTime() - ctx.clock.now().getTime() - leftMs);

type U = Awaited<ReturnType<typeof registerUser>>;
/** 拨钟超过 30 天后用户会话会过期，这里重新登录拿一个新会话 */
const fresh = async (u: U): Promise<U> => {
  const agent = request.agent(ctx.app.getHttpServer());
  await agent.post('/api/auth/login').send({ email: u.email, password: 'Passw0rd!x' }).expect(200);
  return { agent, email: u.email };
};
const templates = async (u: U) =>
  (
    (await (await fresh(u)).agent.get('/api/me/notifications').expect(200)).body.items as {
      template: string;
    }[]
  )
    .map((i) => i.template)
    .reverse();

describe('账户资料', () => {
  it('修改微信 / Telegram，空字符串清空', async () => {
    const u = await registerUser(ctx);
    const r = await u.agent.patch('/api/me').send({ wechat: 'wx_a', telegram: '@tg' }).expect(200);
    expect(r.body).toMatchObject({ wechat: 'wx_a', telegram: '@tg' });
    const r2 = await u.agent.patch('/api/me').send({ telegram: '' }).expect(200);
    expect(r2.body).toMatchObject({ wechat: 'wx_a', telegram: null });
  });

  it('改密：原密码错误被拒；成功后当前会话保留、其他会话失效、新密码可登录', async () => {
    const u = await registerUser(ctx);
    const other = request.agent(ctx.app.getHttpServer());
    await other
      .post('/api/auth/login')
      .send({ email: u.email, password: 'Passw0rd!x' })
      .expect(200);
    await u.agent
      .post('/api/me/password')
      .send({ oldPassword: 'nope-nope', newPassword: 'NewPassw0rd!1' })
      .expect(401);
    await u.agent
      .post('/api/me/password')
      .send({ oldPassword: 'Passw0rd!x', newPassword: 'short' })
      .expect(400);
    await u.agent
      .post('/api/me/password')
      .send({ oldPassword: 'Passw0rd!x', newPassword: 'NewPassw0rd!1' })
      .expect(204);
    await u.agent.get('/api/me').expect(200);
    await other.get('/api/me').expect(401);
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: 'NewPassw0rd!1' })
      .expect(200);
  });
});

describe('续费', () => {
  it('创建续费单：数量固定 1、联系方式默认取账户资料、带设备编号；/me/leases 有 canRenew', async () => {
    const u = await registerUser(ctx);
    await u.agent.patch('/api/me').send({ wechat: 'my_wx' }).expect(200);
    const p = await provision(ctx, u, 'm1', 1);
    const leases = (await u.agent.get('/api/me/leases').expect(200)).body;
    expect(leases[0]).toMatchObject({ canRenew: true, status: 'active' });
    const r = await u.agent
      .post('/api/orders')
      .send({
        kind: 'renew',
        renewLeaseId: p.leases[0]!.id,
        term: 'm3',
        quantity: 5,
        agreedTerms: true,
      })
      .expect(201);
    expect(r.body).toMatchObject({
      kind: 'renew',
      quantity: 1,
      totalCents: 209700,
      contactWechat: 'my_wx',
      renewLeaseId: p.leases[0]!.id,
      deviceCode: p.devices[0]!.code,
      status: 'pending',
    });
    // 同一台机器已有未完成的续费单：不重复创建
    await u.agent
      .post('/api/orders')
      .send({
        kind: 'renew',
        renewLeaseId: p.leases[0]!.id,
        term: 'm1',
        quantity: 1,
        agreedTerms: true,
      })
      .expect(409);
  });

  it('不能续别人的租约', async () => {
    const a = await registerUser(ctx);
    const b = await registerUser(ctx);
    const p = await provision(ctx, a);
    await b.agent
      .post('/api/orders')
      .send({
        kind: 'renew',
        renewLeaseId: p.leases[0]!.id,
        term: 'm1',
        quantity: 1,
        agreedTerms: true,
      })
      .expect(404);
  });

  it('未过期：从原到期时间顺延；不占库存、不进开通队列；通知用户', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    const lease = p.leases[0]!;
    const o = (
      await u.agent
        .post('/api/orders')
        .send({ kind: 'renew', renewLeaseId: lease.id, term: 'm3', quantity: 1, agreedTerms: true })
        .expect(201)
    ).body;
    await u.agent
      .post(`/api/orders/${o.no}/xianyu`)
      .send({ xianyuOrderNo: xyNo(), xianyuBuyerNick: 'n' })
      .expect(200);
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    const stockBefore = (await ctx.http().get('/api/plans').expect(200)).body.available;
    // 金额不一致仍然被拒绝
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send({ paidCents: 1, confirmedAmount: true, confirmedQuantity: true })
      .expect(409);
    const v = await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send({ paidCents: o.totalCents, confirmedAmount: true, confirmedQuantity: true })
      .expect(201);
    expect(v.body.order.status).toBe('renewed');
    const after = await ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    expect(after.endAt.toISOString()).toBe(addMonths(lease.endAt, 3).toISOString());
    expect(after.graceEndAt.getTime() - after.endAt.getTime()).toBe(3 * DAY);
    expect(await ctx.prisma.leaseRenewal.count({ where: { leaseId: lease.id } })).toBe(1);
    expect((await ctx.http().get('/api/plans').expect(200)).body.available).toBe(stockBefore);
    const queue = (await ops.agent.get('/api/admin/provision/queue').expect(200)).body;
    expect(queue.some((x: { no: string }) => x.no === o.no)).toBe(false);
    expect(await templates(u)).toContain('renewed');
    // 重复确认被拒绝，租约不会被重复延长
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send({ paidCents: o.totalCents, confirmedAmount: true, confirmedQuantity: true })
      .expect(409);
    expect(
      (await ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } })).endAt.toISOString(),
    ).toBe(after.endAt.toISOString());
  });

  it('已过期（宽限期内）：从现在起算，租约和机器回到使用中，并重新计提醒', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    const lease = p.leases[0]!;
    setLeft(lease, -DAY); // 过期 1 天，宽限期内
    await tick();
    expect((await ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe(
      'grace',
    );
    const uu = await fresh(u);
    const o = (
      await uu.agent
        .post('/api/orders')
        .send({ kind: 'renew', renewLeaseId: lease.id, term: 'm1', quantity: 1, agreedTerms: true })
        .expect(201)
    ).body;
    await uu.agent
      .post(`/api/orders/${o.no}/xianyu`)
      .send({ xianyuOrderNo: xyNo(), xianyuBuyerNick: 'n' })
      .expect(200);
    const support = await loginAdmin(ctx, 'support'); // 拨钟后后台会话已过期，重新登录
    const now = ctx.clock.now();
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send({ paidCents: o.totalCents, confirmedAmount: true, confirmedQuantity: true })
      .expect(201);
    const after = await ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    expect(after.status).toBe('active');
    // 从「现在」起算 1 个月，而不是从已过去的到期日
    expect(Math.abs(after.endAt.getTime() - addMonths(now, 1).getTime())).toBeLessThan(120_000);
    expect(
      (await ctx.prisma.device.findUniqueOrThrow({ where: { id: p.devices[0]!.id } })).status,
    ).toBe('in_use');
  });

  it('租约已结束（机器被回收）的续费单确认收款被拒绝', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    const lease = p.leases[0]!;
    const o = (
      await u.agent
        .post('/api/orders')
        .send({ kind: 'renew', renewLeaseId: lease.id, term: 'm1', quantity: 1, agreedTerms: true })
        .expect(201)
    ).body;
    await u.agent
      .post(`/api/orders/${o.no}/xianyu`)
      .send({ xianyuOrderNo: xyNo(), xianyuBuyerNick: 'n' })
      .expect(200);
    setLeft(lease, -5 * DAY); // 超过宽限期
    await tick();
    const uu = await fresh(u);
    const support = await loginAdmin(ctx, 'support');
    const r = await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send({ paidCents: o.totalCents, confirmedAmount: true, confirmedQuantity: true })
      .expect(409);
    expect(r.body.message).toContain('已结束');
    // 已结束的租约不能再创建新续费单
    const o2 = await uu.agent
      .post('/api/orders')
      .send({ kind: 'renew', renewLeaseId: lease.id, term: 'm1', quantity: 1, agreedTerms: true })
      .expect(404);
    expect(o2.body.message).toBeDefined();
  });
});

describe('租约与机器状态推进 + 提醒', () => {
  it('依次 expiring → grace → ended；提醒各节点只发一次；机器进入回收中；订单完成', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    const lease = p.leases[0]!;
    const dev = () => ctx.prisma.device.findUniqueOrThrow({ where: { id: p.devices[0]!.id } });
    const ls = () => ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });

    await tick();
    expect((await ls()).status).toBe('active');
    expect(await templates(u)).not.toContain('expiry_7');

    setLeft(lease, 6 * DAY);
    await tick();
    expect((await ls()).status).toBe('expiring');
    expect((await dev()).status).toBe('expiring');
    await tick();
    await tick(); // 重复执行不重复发送
    expect((await templates(u)).filter((t) => t === 'expiry_7')).toHaveLength(1);

    setLeft(lease, 2.5 * DAY);
    await tick();
    setLeft(lease, 0.8 * DAY);
    await tick();
    await tick();
    expect((await templates(u)).filter((t) => t.startsWith('expiry_'))).toEqual([
      'expiry_7',
      'expiry_3',
      'expiry_1',
    ]);

    setLeft(lease, -0.2 * DAY);
    await tick();
    expect((await ls()).status).toBe('grace');
    expect((await dev()).status).toBe('grace');
    expect(await templates(u)).toContain('grace_start');
    expect((await (await fresh(u)).agent.get('/api/me/leases').expect(200)).body[0]).toMatchObject({
      status: 'grace',
      canRenew: true,
    });

    setLeft(lease, -2.5 * DAY); // 宽限期 3 天，剩不到 1 天
    await tick();
    await tick();
    expect((await templates(u)).filter((t) => t === 'recycle_soon')).toHaveLength(1);
    expect((await templates(u)).filter((t) => t === 'grace_start')).toHaveLength(1);

    setLeft(lease, -3.5 * DAY);
    await tick();
    const ended = await ls();
    expect(ended.status).toBe('ended');
    expect(ended.endedAt).not.toBeNull();
    const d = await dev();
    expect(d.status).toBe('recycling');
    expect(d.currentLeaseId).toBeNull();
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { no: p.no } })).status).toBe('done');
    // 结束后用户看不到、也取不到凭证
    const uu = await fresh(u);
    expect((await uu.agent.get('/api/me/leases').expect(200)).body).toHaveLength(0);
    await uu.agent.post(`/api/me/leases/${lease.id}/credential`).expect(404);
    // 再执行不会有任何变化
    const t = await tick();
    expect(t.advanced).toBe(0);
  });

  it('首次发现时已进入较小节点：只发最小的一条提醒', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    setLeft(p.leases[0]!, 0.5 * DAY);
    await tick();
    await tick();
    expect((await templates(u)).filter((t) => t.startsWith('expiry_'))).toEqual(['expiry_1']);
  });

  it('并发 tick 不会重复推进或重复通知', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    setLeft(p.leases[0]!, 2 * DAY);
    await Promise.all([tick(), tick(), tick()]);
    expect((await templates(u)).filter((t) => t.startsWith('expiry_'))).toHaveLength(1);
    expect(
      (await ctx.prisma.lease.findUniqueOrThrow({ where: { id: p.leases[0]!.id } })).status,
    ).toBe('expiring');
  });

  it('tick 同时负责 48 小时未付款自动取消', async () => {
    const u = await registerUser(ctx);
    const o = await u.agent
      .post('/api/orders')
      .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
      .expect(201);
    ctx.clock.advance(49 * 3600_000);
    await tick();
    expect(
      (await (await fresh(u)).agent.get(`/api/orders/${o.body.no}`).expect(200)).body.status,
    ).toBe('cancelled');
  });
});

describe('回收', () => {
  it('回收队列 → 三项必须全勾 → 机器回空闲、凭证作废；越权 403、重复完成 409', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm1', 1);
    const lease = p.leases[0]!;
    const deviceId = p.devices[0]!.id;
    expect(await ctx.prisma.credential.count({ where: { leaseId: lease.id } })).toBe(1);
    setLeft(lease, -4 * DAY);
    await tick();
    const ops = await loginAdmin(ctx, 'ops');
    const support = await loginAdmin(ctx, 'support');

    const list = (await ops.agent.get('/api/admin/recycle').expect(200)).body;
    const item = list.find((x: { deviceId: string }) => x.deviceId === deviceId);
    expect(item).toMatchObject({ code: p.devices[0]!.code, lessee: u.email });
    expect(item.endedAt).toBeTruthy();
    await support.agent.get('/api/admin/recycle').expect(403);

    // 三项必须全 true
    for (const body of [
      {},
      { wiped: true, uuReset: true },
      { wiped: true, uuReset: true, passwordChanged: false },
      { wiped: false, uuReset: true, passwordChanged: true },
    ]) {
      await ops.agent.post(`/api/admin/recycle/${deviceId}/complete`).send(body).expect(400);
    }
    expect((await ctx.prisma.device.findUniqueOrThrow({ where: { id: deviceId } })).status).toBe(
      'recycling',
    );
    // 在设备台账里直接改成空闲会绕过检查清单，被拒绝
    await ops.agent
      .patch(`/api/admin/devices/${deviceId}/status`)
      .send({ status: 'idle' })
      .expect(409);

    const all = { wiped: true, uuReset: true, passwordChanged: true };
    await support.agent.post(`/api/admin/recycle/${deviceId}/complete`).send(all).expect(403);
    await ops.agent.post(`/api/admin/recycle/${deviceId}/complete`).send(all).expect(200);
    expect((await ctx.prisma.device.findUniqueOrThrow({ where: { id: deviceId } })).status).toBe(
      'idle',
    );
    // 旧凭证作废
    expect(await ctx.prisma.credential.count({ where: { leaseId: lease.id } })).toBe(0);
    expect(await ctx.prisma.recycleRecord.count({ where: { deviceId } })).toBe(1);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'device.recycle', adminId: ops.admin.id },
      }),
    ).toBe(1);
    await ops.agent.post(`/api/admin/recycle/${deviceId}/complete`).send(all).expect(409);
    const list2 = (await ops.agent.get('/api/admin/recycle').expect(200)).body;
    expect(list2.some((x: { deviceId: string }) => x.deviceId === deviceId)).toBe(false);
  });
});
