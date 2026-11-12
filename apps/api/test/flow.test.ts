import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, loginAdmin, registerUser, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

let seq = 0;
const xy = () => String(8_800_000_000_000 + ++seq);

/** 用户下单并提交闲鱼单号，返回订单号 */
async function placeOrder(
  user: Awaited<ReturnType<typeof registerUser>>,
  term = 'm6',
  quantity = 2,
) {
  const o = await user.agent
    .post('/api/orders')
    .send({ term, quantity, contactWechat: 'wx', agreedTerms: true })
    .expect(201);
  await user.agent
    .post(`/api/orders/${o.body.no}/xianyu`)
    .send({ xianyuOrderNo: xy(), xianyuBuyerNick: 'nick' })
    .expect(200);
  return o.body as { no: string; totalCents: number };
}
const verifyBody = (paidCents: number) => ({
  paidCents,
  confirmedAmount: true,
  confirmedQuantity: true,
});
const cred = (deviceId: string, n: number) => ({
  deviceId,
  uuDeviceCode: `58392017${n}`,
  uuPassword: `uu-pass-${n}`,
  macUsername: 'nydesk',
  macPassword: `mac-pass-${n}`,
});
const idleDevices = (n: number) =>
  ctx.prisma.device.findMany({ where: { status: 'idle' }, take: n, orderBy: { code: 'asc' } });

describe('核对收款', () => {
  it('客服可以确认收款；金额不一致被拒绝；两项核对清单必须勾选', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support');
    const o = await placeOrder(user);
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send({ paidCents: o.totalCents, confirmedAmount: true })
      .expect(400);
    const bad = await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents - 100))
      .expect(409);
    expect(bad.body.message).toContain('不一致');
    const ok = await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(201);
    expect(ok.body.order.status).toBe('queued');
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { no: o.no } });
    // 开通时限 = 确认收款时间 + 7 天
    expect(row.deadlineAt!.getTime() - row.paidAt!.getTime()).toBe(7 * 86_400_000);
    expect(row.verifiedById).toBe(support.admin.id);
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(409);
    // 用户收到站内信 + 邮件，并留审计日志
    const n = await user.agent.get('/api/me/notifications').expect(200);
    expect(n.body.items[0].template).toBe('payment_confirmed');
    expect(ctx.mail.outbox.at(-1)?.to).toBe(user.email);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'order.verify', target: `order:${o.no}` },
      }),
    ).toBe(1);
  });

  it('核对失败：用户收到原因，可以重新提交闲鱼单号', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support');
    const o = await placeOrder(user);
    await support.agent
      .post(`/api/admin/orders/${o.no}/fail`)
      .send({ reason: '闲鱼订单金额不符' })
      .expect(201);
    const view = await user.agent.get(`/api/orders/${o.no}`).expect(200);
    expect(view.body).toMatchObject({ status: 'failed', failedReason: '闲鱼订单金额不符' });
    const r = await user.agent
      .post(`/api/orders/${o.no}/xianyu`)
      .send({ xianyuOrderNo: xy(), xianyuBuyerNick: 'nick' })
      .expect(200);
    expect(r.body.status).toBe('verifying');
  });

  it('后台列表标出核对超过 24 小时的订单', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support');
    const o = await placeOrder(user);
    const before = await support.agent.get(`/api/admin/orders?keyword=${o.no}`).expect(200);
    expect(before.body.items[0].verifyOverdue).toBe(false);
    ctx.clock.advance(25 * 3600_000);
    const after = await (
      await loginAdmin(ctx, 'support')
    ).agent
      .get(`/api/admin/orders?keyword=${o.no}`)
      .expect(200);
    expect(after.body.items[0].verifyOverdue).toBe(true);
  });

  it('运维不能确认收款；客服不能开通、不能看凭证、不能退款', async () => {
    const user = await registerUser(ctx);
    const ops = await loginAdmin(ctx, 'ops');
    const support = await loginAdmin(ctx, 'support');
    const o = await placeOrder(user);
    await ops.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(403);
    await support.agent.get('/api/admin/provision/queue').expect(403);
    await support.agent
      .post(`/api/admin/orders/${o.no}/activate`)
      .send({ devices: [cred('x', 1)] })
      .expect(403);
    await support.agent.post('/api/admin/leases/x/credential').expect(403);
    await support.agent
      .post(`/api/admin/orders/${o.no}/refund`)
      .send({ reason: '测试退款' })
      .expect(403);
    await ops.agent.get('/api/admin/orders').expect(200); // 所有角色都能查看订单
  });
});

describe('开通与连接信息', () => {
  it('完整链路：确认收款 → 开通 → 用户看到设备并查看凭证（留日志）', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    const o = await placeOrder(user, 'm6', 2);
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(201);

    const queue = await ops.agent.get('/api/admin/provision/queue').expect(200);
    expect(queue.body.some((x: { no: string }) => x.no === o.no)).toBe(true);

    const devs = await idleDevices(2);
    // 台数不符
    await ops.agent
      .post(`/api/admin/orders/${o.no}/activate`)
      .send({ devices: [cred(devs[0]!.id, 1)] })
      .expect(400);
    const act = await ops.agent
      .post(`/api/admin/orders/${o.no}/activate`)
      .send({ devices: devs.map((d, i) => cred(d.id, i)) })
      .expect(201);
    expect(act.body.status).toBe('active');
    expect(act.body.devices).toHaveLength(2);

    // 机器状态、租约从开通当天起算 6 个月
    const d0 = await ctx.prisma.device.findUniqueOrThrow({ where: { id: devs[0]!.id } });
    expect(d0.status).toBe('in_use');
    const lease = await ctx.prisma.lease.findUniqueOrThrow({ where: { id: d0.currentLeaseId! } });
    const start = lease.startAt,
      end = lease.endAt;
    expect(
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        end.getUTCMonth() -
        start.getUTCMonth(),
    ).toBe(6);
    expect(lease.graceEndAt.getTime() - end.getTime()).toBe(3 * 86_400_000);

    // 凭证加密存储，用户可解密查看
    const stored = await ctx.prisma.credential.findUniqueOrThrow({ where: { leaseId: lease.id } });
    expect(stored.uuPasswordEnc).not.toContain('uu-pass');
    const mine = await user.agent.get('/api/me/leases').expect(200);
    expect(mine.body).toHaveLength(2);
    expect(mine.body[0].publicIp).toBeDefined();
    expect(JSON.stringify(mine.body)).not.toContain('pass');
    const c = await user.agent.post(`/api/me/leases/${lease.id}/credential`).expect(200);
    expect(c.body.uuPassword).toMatch(/^uu-pass-/);
    expect(c.body.macPassword).toMatch(/^mac-pass-/);
    expect(
      await ctx.prisma.credentialView.count({
        where: { leaseId: lease.id, userId: user.email ? undefined : undefined },
      }),
    ).toBe(1);

    // 运维查看也留日志（查看记录 + 审计）
    await ops.agent.post(`/api/admin/leases/${lease.id}/credential`).expect(200);
    expect(
      await ctx.prisma.credentialView.count({
        where: { leaseId: lease.id, adminId: ops.admin.id },
      }),
    ).toBe(1);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'credential.view', adminId: ops.admin.id },
      }),
    ).toBe(1);

    // 开通通知
    const n = await user.agent.get('/api/me/notifications').expect(200);
    expect(n.body.items.map((i: { template: string }) => i.template)).toContain('activated');
  });

  it('别人的租约看不到、取不到凭证', async () => {
    const a = await registerUser(ctx);
    const b = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    const o = await placeOrder(a, 'm1', 1);
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(201);
    const [d] = await idleDevices(1);
    await ops.agent
      .post(`/api/admin/orders/${o.no}/activate`)
      .send({ devices: [cred(d!.id, 9)] })
      .expect(201);
    const leaseId = (await ctx.prisma.lease.findFirstOrThrow({ where: { deviceId: d!.id } })).id;
    await b.agent.post(`/api/me/leases/${leaseId}/credential`).expect(404);
    expect((await b.agent.get('/api/me/leases').expect(200)).body).toHaveLength(0);
  });

  it('已被占用的机器不能再分配，失败时整单回滚', async () => {
    const u1 = await registerUser(ctx),
      u2 = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support'),
      ops = await loginAdmin(ctx, 'ops');
    const o1 = await placeOrder(u1, 'm1', 1),
      o2 = await placeOrder(u2, 'm1', 2);
    for (const o of [o1, o2])
      await support.agent
        .post(`/api/admin/orders/${o.no}/verify`)
        .send(verifyBody(o.totalCents))
        .expect(201);
    const [a, b] = await idleDevices(2);
    await ops.agent
      .post(`/api/admin/orders/${o1.no}/activate`)
      .send({ devices: [cred(a!.id, 1)] })
      .expect(201);
    const fresh = (await idleDevices(1))[0]!;
    await ops.agent
      .post(`/api/admin/orders/${o2.no}/activate`)
      .send({ devices: [cred(fresh.id, 2), cred(a!.id, 3)] })
      .expect(409);
    // 回滚：fresh 仍然空闲，o2 仍是待开通，没有残留租约
    expect((await ctx.prisma.device.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
      'idle',
    );
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { no: o2.no } })).status).toBe(
      'queued',
    );
    expect(await ctx.prisma.lease.count({ where: { deviceId: fresh.id } })).toBe(0);
    expect(b).toBeDefined();
  });

  it('待开通队列：剩余不足 2 天标黄，超期标红', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support'),
      ops = await loginAdmin(ctx, 'ops');
    const o = await placeOrder(user, 'm1', 1);
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(201);
    const level = async (agent = ops.agent) =>
      (await agent.get('/api/admin/provision/queue').expect(200)).body.find(
        (x: { no: string }) => x.no === o.no,
      ).deadlineLevel;
    expect(await level()).toBe('ok');
    // 后台会话 12 小时过期，快进几天后要重新登录
    ctx.clock.advance(5.5 * 86_400_000);
    expect(await level((await loginAdmin(ctx, 'ops')).agent)).toBe('warn');
    ctx.clock.advance(2 * 86_400_000);
    expect(await level((await loginAdmin(ctx, 'ops')).agent)).toBe('overdue');
  });
});

describe('退款登记', () => {
  it('管理员对使用中订单退款：租约结束、机器进入回收中', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support'),
      ops = await loginAdmin(ctx, 'ops'),
      boss = await loginAdmin(ctx, 'admin');
    const o = await placeOrder(user, 'm1', 1);
    await support.agent
      .post(`/api/admin/orders/${o.no}/verify`)
      .send(verifyBody(o.totalCents))
      .expect(201);
    const [d] = await idleDevices(1);
    await ops.agent
      .post(`/api/admin/orders/${o.no}/activate`)
      .send({ devices: [cred(d!.id, 7)] })
      .expect(201);
    await boss.agent
      .post(`/api/admin/orders/${o.no}/refund`)
      .send({ reason: '用户申请退款' })
      .expect(201);
    expect((await ctx.prisma.device.findUniqueOrThrow({ where: { id: d!.id } })).status).toBe(
      'recycling',
    );
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { no: o.no } })).status).toBe(
      'refunded',
    );
    expect((await user.agent.get('/api/me/leases').expect(200)).body).toHaveLength(0);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'order.refund', target: `order:${o.no}` },
      }),
    ).toBe(1);
  });
});
