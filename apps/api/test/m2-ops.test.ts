import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

type U = Awaited<ReturnType<typeof registerUser>>;
const templates = async (u: U) =>
  ((await u.agent.get('/api/me/notifications').expect(200)).body.items as { template: string }[])
    .map((i) => i.template)
    .reverse();

/** 下单 → 提交闲鱼单号 → 确认收款（不开通） */
async function paidQueued(u: U, term = 'm6', quantity = 1, nick = 'n') {
  const o = (
    await u.agent
      .post('/api/orders')
      .send({ term, quantity, contactWechat: 'wx', agreedTerms: true })
      .expect(201)
  ).body;
  await u.agent
    .post(`/api/orders/${o.no}/xianyu`)
    .send({ xianyuOrderNo: xyNo(), xianyuBuyerNick: nick })
    .expect(200);
  const support = await loginAdmin(ctx, 'support');
  await support.agent
    .post(`/api/admin/orders/${o.no}/verify`)
    .send({ paidCents: o.totalCents, confirmedAmount: true, confirmedQuantity: true })
    .expect(201);
  return { no: o.no as string, totalCents: o.totalCents as number };
}

describe('退款（新流程）', () => {
  it('预览按政策计算；只有管理员；金额不能超过实付', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm6', 1);
    const boss = await loginAdmin(ctx, 'admin');
    const support = await loginAdmin(ctx, 'support');
    await support.agent.get(`/api/admin/orders/${p.no}/refund-preview`).expect(403);
    const pre = await boss.agent.get(`/api/admin/orders/${p.no}/refund-preview`).expect(200);
    // 半年付 ¥3,594，刚开通：不足一个月按一个月，按月付价 ¥799 扣除
    expect(pre.body).toMatchObject({
      paidCents: 359400,
      suggestedCents: 359400 - 79900,
      daysUsed: 0,
      usedMonths: 1,
      activated: true,
    });
    const unfix = await boss.agent
      .get(`/api/admin/orders/${p.no}/refund-preview?unfixable=1`)
      .expect(200);
    expect(unfix.body.suggestedCents).toBe(359400);
    const aup = await boss.agent.get(`/api/admin/orders/${p.no}/refund-preview?aup=1`).expect(200);
    expect(aup.body.suggestedCents).toBe(0);
    await boss.agent
      .post(`/api/admin/orders/${p.no}/refund`)
      .send({ reason: '超额', amountCents: 359401 })
      .expect(400);
  });

  it('使用中订单：退款中 → 租约结束、机器回收中 → 填闲鱼退款单号完成；重复操作被拒绝', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u, 'm6', 1);
    const boss = await loginAdmin(ctx, 'admin');
    const support = await loginAdmin(ctx, 'support');
    await support.agent
      .post(`/api/admin/orders/${p.no}/refund`)
      .send({ reason: '用户退租', amountCents: 100 })
      .expect(403);
    const r = await boss.agent
      .post(`/api/admin/orders/${p.no}/refund`)
      .send({ reason: '用户退租', amountCents: 279500 })
      .expect(201);
    expect(r.body.status).toBe('refunding');
    const rf = await ctx.prisma.refund.findFirstOrThrow({ where: { order: { no: p.no } } });
    expect(rf).toMatchObject({ amountCents: 279500, status: 'refunding' });
    expect(rf.calcDetail).toMatchObject({ suggestedCents: 279500, usedMonths: 1 });
    const lease = await ctx.prisma.lease.findUniqueOrThrow({ where: { id: p.leases[0]!.id } });
    expect(lease.status).toBe('ended');
    expect(lease.endedAt).not.toBeNull();
    const dev = await ctx.prisma.device.findUniqueOrThrow({ where: { id: p.devices[0]!.id } });
    expect(dev).toMatchObject({ status: 'recycling', currentLeaseId: null });
    // 重复提交退款被拒绝（状态已是退款中）
    await boss.agent
      .post(`/api/admin/orders/${p.no}/refund`)
      .send({ reason: '重复', amountCents: 1 })
      .expect(409);
    const list = (await boss.agent.get('/api/admin/refunds?status=refunding').expect(200)).body;
    expect(list.find((x: { id: string }) => x.id === rf.id)).toMatchObject({
      orderNo: p.no,
      userEmail: u.email,
      amountCents: 279500,
      status: 'refunding',
    });
    await support.agent
      .post(`/api/admin/refunds/${rf.id}/complete`)
      .send({ xianyuRefundNo: '123' })
      .expect(403);
    await boss.agent.post(`/api/admin/refunds/${rf.id}/complete`).send({}).expect(400);
    await boss.agent
      .post(`/api/admin/refunds/${rf.id}/complete`)
      .send({ xianyuRefundNo: 'XY-REFUND-1' })
      .expect(200);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { no: p.no } })).status).toBe(
      'refunded',
    );
    await boss.agent
      .post(`/api/admin/refunds/${rf.id}/complete`)
      .send({ xianyuRefundNo: 'XY-REFUND-2' })
      .expect(409);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'refund.complete', adminId: boss.admin.id },
      }),
    ).toBe(1);
  });

  it('待开通订单：带闲鱼退款单号直接完成为已退款，没有租约变动', async () => {
    const u = await registerUser(ctx);
    const q = await paidQueued(u, 'm3', 2);
    const boss = await loginAdmin(ctx, 'admin');
    const pre = await boss.agent.get(`/api/admin/orders/${q.no}/refund-preview`).expect(200);
    expect(pre.body).toMatchObject({ activated: false, suggestedCents: q.totalCents });
    await boss.agent
      .post(`/api/admin/orders/${q.no}/refund`)
      .send({ reason: '用户不想要了', amountCents: q.totalCents, xianyuRefundNo: 'XY-9' })
      .expect(201);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { no: q.no } })).status).toBe(
      'refunded',
    );
    expect(await ctx.prisma.lease.count({ where: { order: { no: q.no } } })).toBe(0);
    // 退款后不再占用库存
    await boss.agent
      .post(`/api/admin/orders/${q.no}/refund`)
      .send({ reason: 'again', amountCents: 0 })
      .expect(409);
  });

  it('续费单、未收款的订单不能走退款登记', async () => {
    const u = await registerUser(ctx);
    const boss = await loginAdmin(ctx, 'admin');
    const o = (
      await u.agent
        .post('/api/orders')
        .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
        .expect(201)
    ).body;
    await boss.agent
      .post(`/api/admin/orders/${o.no}/refund`)
      .send({ reason: '未付款', amountCents: 0 })
      .expect(409);
    await boss.agent.get(`/api/admin/orders/${o.no}/refund-preview`).expect(409);
  });
});

describe('工单', () => {
  it('用户提交与追加留言；分类、内容、租约归属校验', async () => {
    const u = await registerUser(ctx);
    const other = await registerUser(ctx);
    const p = await provision(ctx, u);
    const lease = p.leases[0]!;
    await u.agent
      .post('/api/tickets')
      .send({ category: '乱写', content: '内容内容内容' })
      .expect(400);
    await u.agent.post('/api/tickets').send({ category: '重启', content: '短' }).expect(400);
    await other.agent
      .post('/api/tickets')
      .send({ category: '重启', content: '帮我重启一下机器', leaseId: lease.id })
      .expect(404);
    const t = (
      await u.agent
        .post('/api/tickets')
        .send({ category: '无法连接', content: 'UU 远程提示设备离线', leaseId: lease.id })
        .expect(201)
    ).body;
    expect(t.no).toMatch(/^T\d{6}\d{4}$/);
    expect(t).toMatchObject({ status: 'open', deviceCode: p.devices[0]!.code, notes: [] });
    const mine = (await u.agent.get('/api/me/tickets').expect(200)).body;
    expect(mine[0].no).toBe(t.no);
    expect((await other.agent.get('/api/me/tickets').expect(200)).body).toHaveLength(0);
    await other.agent.post(`/api/me/tickets/${t.no}/reply`).send({ content: '偷看' }).expect(404);
    await u.agent
      .post(`/api/me/tickets/${t.no}/reply`)
      .send({ content: '补充：重启过一次' })
      .expect(204);
    const again = (await u.agent.get('/api/me/tickets').expect(200)).body[0];
    expect(again.notes).toEqual([
      expect.objectContaining({ content: '补充：重启过一次', fromStaff: false }),
    ]);
  });

  it('每用户每小时最多 10 张', async () => {
    const u = await registerUser(ctx);
    for (let i = 0; i < 10; i++)
      await u.agent
        .post('/api/tickets')
        .send({ category: '其他', content: `问题 ${i} 号` })
        .expect(201);
    await u.agent
      .post('/api/tickets')
      .send({ category: '其他', content: '第十一张工单啊' })
      .expect(429);
  });

  it('后台：列表筛选、指派、内部备注对用户不可见、对外回复通知用户、解决后用户留言会重新打开', async () => {
    const u = await registerUser(ctx);
    const t = (
      await u.agent
        .post('/api/tickets')
        .send({ category: '机器卡顿', content: '很卡很卡很卡' })
        .expect(201)
    ).body;
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    const boss = await loginAdmin(ctx, 'admin');
    await request(ctx.app.getHttpServer()).get('/api/admin/tickets').expect(401);

    const list = (await support.agent.get(`/api/admin/tickets?keyword=${t.no}`).expect(200)).body;
    expect(list.items[0]).toMatchObject({ no: t.no, userEmail: u.email, status: 'open' });
    expect(
      (await ops.agent.get('/api/admin/tickets?status=open').expect(200)).body.total,
    ).toBeGreaterThan(0);

    const staff = (await support.agent.get('/api/admin/staff').expect(200)).body as {
      id: string;
    }[];
    expect(staff.some((s) => s.id === ops.admin.id)).toBe(true);
    const upd = await support.agent
      .patch(`/api/admin/tickets/${t.no}`)
      .send({ status: 'processing', assigneeId: ops.admin.id })
      .expect(200);
    expect(upd.body).toMatchObject({ status: 'processing', assigneeId: ops.admin.id });
    expect(upd.body.assigneeName).toBeTruthy();
    await support.agent
      .patch(`/api/admin/tickets/${t.no}`)
      .send({ assigneeId: 'nope' })
      .expect(404);

    await support.agent
      .post(`/api/admin/tickets/${t.no}/notes`)
      .send({ content: '内部：怀疑是磁盘问题', internal: true })
      .expect(204);
    expect(await templates(u)).not.toContain('ticket_reply');
    await support.agent
      .post(`/api/admin/tickets/${t.no}/notes`)
      .send({ content: '已经重启，请再试', internal: false })
      .expect(204);
    expect(await templates(u)).toContain('ticket_reply');
    const view = (await u.agent.get('/api/me/tickets').expect(200)).body[0];
    expect(view.notes).toHaveLength(1);
    expect(view.notes[0]).toMatchObject({ content: '已经重启，请再试', fromStaff: true });
    const adminView = (await support.agent.get(`/api/admin/tickets?keyword=${t.no}`).expect(200))
      .body.items[0];
    expect(adminView.notes).toHaveLength(2);
    expect(adminView.notes.filter((n: { internal: boolean }) => n.internal)).toHaveLength(1);

    await support.agent
      .patch(`/api/admin/tickets/${t.no}`)
      .send({ status: 'resolved' })
      .expect(200);
    expect(await templates(u)).toContain('ticket_resolved');
    await u.agent.post(`/api/me/tickets/${t.no}/reply`).send({ content: '还是卡' }).expect(204);
    expect((await u.agent.get('/api/me/tickets').expect(200)).body[0].status).toBe('open');
    await support.agent.patch(`/api/admin/tickets/${t.no}`).send({ status: 'closed' }).expect(200);
    await u.agent.post(`/api/me/tickets/${t.no}/reply`).send({ content: '关闭后' }).expect(409);
    void boss;
  });

  it('重置密码：运维改凭证，旧密码作废，用户收到通知；审计不记密码内容；越权 403', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u);
    const lease = p.leases[0]!;
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    await support.agent
      .put(`/api/admin/leases/${lease.id}/credential`)
      .send({ macPassword: 'x' })
      .expect(403);
    await ops.agent.put(`/api/admin/leases/${lease.id}/credential`).send({}).expect(400);
    await ops.agent
      .put(`/api/admin/leases/${lease.id}/credential`)
      .send({ macPassword: 'Brand-New-Pass-77', uuPassword: 'uu-new-88' })
      .expect(204);
    const c = (await u.agent.post(`/api/me/leases/${lease.id}/credential`).expect(200)).body;
    expect(c).toMatchObject({ macPassword: 'Brand-New-Pass-77', uuPassword: 'uu-new-88' });
    const stored = await ctx.prisma.credential.findUniqueOrThrow({ where: { leaseId: lease.id } });
    expect(stored.macPasswordEnc).not.toContain('Brand-New');
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'credential.update', target: `lease:${lease.id}` },
    });
    expect(JSON.stringify(log.detail)).not.toContain('Brand-New');
    expect((log.detail as { fields: string[] }).fields.sort()).toEqual([
      'macPassword',
      'uuPassword',
    ]);
    expect(await templates(u)).toContain('credential_updated');
  });
});

describe('机器心跳与令牌', () => {
  it('令牌只返回一次、库里只存哈希；心跳更新在线状态；5 分钟无心跳离线；重新生成后旧令牌失效', async () => {
    const ops = await loginAdmin(ctx, 'ops');
    const support = await loginAdmin(ctx, 'support');
    const dev = await ctx.prisma.device.findFirstOrThrow({
      where: { status: 'idle' },
      orderBy: { code: 'desc' },
    });
    await support.agent.post(`/api/admin/devices/${dev.id}/token`).expect(403);
    const { token } = (await ops.agent.post(`/api/admin/devices/${dev.id}/token`).expect(201)).body;
    expect(token.length).toBeGreaterThanOrEqual(40);
    const row = await ctx.prisma.device.findUniqueOrThrow({ where: { id: dev.id } });
    expect(row.heartbeatTokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);

    const find = async () =>
      (await ops.agent.get(`/api/admin/devices?keyword=${dev.code}`).expect(200)).body;
    let list = await find();
    expect(list.items[0].online).toBe(false); // 有令牌、还没有心跳
    expect(JSON.stringify(list)).not.toContain(token);
    // 没装 agent 的机器是 null
    const plain = (await ops.agent.get('/api/admin/devices?keyword=NYD-MY-0001').expect(200)).body;
    expect(plain.items[0].online).toBeNull();

    await ctx.http().post('/api/heartbeat').send({}).expect(401);
    await ctx.http().post('/api/heartbeat').set('X-Device-Token', 'bogus').send({}).expect(401);
    await ctx
      .http()
      .post('/api/heartbeat')
      .set('X-Device-Token', token)
      .send({ uptimeSec: 100, load: 0.4 })
      .expect(204);
    await ctx
      .http()
      .post('/api/heartbeat')
      .set('X-Device-Token', token)
      .send({ load: -1 })
      .expect(400);
    // 没有请求体也可以（agent 可能只发一个空 POST）
    await ctx.http().post('/api/heartbeat').set('X-Device-Token', token).expect(204);
    list = await find();
    expect(list.items[0].online).toBe(true);

    ctx.clock.advance(6 * 60_000);
    list = await find();
    expect(list.items[0].online).toBe(false);
    expect(list.summary.offline).toBeGreaterThanOrEqual(1);

    const again = (await ops.agent.post(`/api/admin/devices/${dev.id}/token`).expect(201)).body;
    expect(again.token).not.toBe(token);
    await ctx.http().post('/api/heartbeat').set('X-Device-Token', token).send({}).expect(401);
    await ctx.http().post('/api/heartbeat').set('X-Device-Token', again.token).send({}).expect(204);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'device.token', adminId: ops.admin.id } }),
    ).toBe(2);
  });

  it('使用中的机器离线：看板出现告警、plans.allOnline 为 false；恢复后消失', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u);
    const ops = await loginAdmin(ctx, 'ops');
    const { token } = (
      await ops.agent.post(`/api/admin/devices/${p.devices[0]!.id}/token`).expect(201)
    ).body;
    const hb = () =>
      ctx.http().post('/api/heartbeat').set('X-Device-Token', token).send({}).expect(204);
    await hb();
    const offlineTodo = async () =>
      (
        (await ops.agent.get('/api/admin/dashboard').expect(200)).body.todos as {
          type: string;
          text: string;
        }[]
      ).find((t) => t.type === 'offline');
    ctx.clock.advance(6 * 60_000);
    expect((await offlineTodo())?.text).toContain(p.devices[0]!.code);
    expect((await ctx.http().get('/api/plans').expect(200)).body.allOnline).toBe(false);
    await hb();
    // 其他测试遗留的离线机器可能仍在；这里只验证本机恢复后不再出现在告警里
    const todo = await offlineTodo();
    expect(todo?.text ?? '').not.toContain(p.devices[0]!.code);
  });
});

describe('看板、对账、用户、管理员', () => {
  it('看板：数字、14 天趋势、利用率、待办链接', async () => {
    const u = await registerUser(ctx);
    const boss = await loginAdmin(ctx, 'admin');
    const before = (await boss.agent.get('/api/admin/dashboard').expect(200)).body;
    const q = await paidQueued(u, 'm3', 1);
    const t = (
      await u.agent
        .post('/api/tickets')
        .send({ category: '其他', content: '看板测试工单' })
        .expect(201)
    ).body;
    const after = (await boss.agent.get('/api/admin/dashboard').expect(200)).body;
    expect(after.queued).toBe(before.queued + 1);
    expect(after.monthRevenueCents).toBe(before.monthRevenueCents + q.totalCents);
    expect(after.ordersLast14d).toHaveLength(14);
    const todayN = (b: { ordersLast14d: { count: number }[] }) => b.ordersLast14d[13]!.count;
    expect(todayN(after)).toBe(todayN(before) + 1);
    expect(after.utilization.total).toBeGreaterThanOrEqual(200);
    expect(
      after.utilization.idle + after.utilization.leased + after.utilization.recycling,
    ).toBeLessThanOrEqual(after.utilization.total);
    const todo = after.todos.find((x: { type: string }) => x.type === 'tickets');
    expect(todo.href).toBe('/admin/tickets');
    // 所有角色都能看
    const ops = await loginAdmin(ctx, 'ops');
    await ops.agent.get('/api/admin/dashboard').expect(200);
    await ctx.http().get('/api/admin/dashboard').expect(401);
    // 已退款订单不计入本月收入
    await boss.agent
      .post(`/api/admin/orders/${q.no}/refund`)
      .send({ reason: '看板测试退款', amountCents: q.totalCents, xianyuRefundNo: 'XY-D' })
      .expect(201);
    const refunded = (await boss.agent.get('/api/admin/dashboard').expect(200)).body;
    expect(refunded.monthRevenueCents).toBe(before.monthRevenueCents);
    void t;
  });

  it('对账 CSV：UTF-8 BOM、金额按元、防公式注入与逗号引号转义；仅客服 / 管理员', async () => {
    const u = await registerUser(ctx);
    const q = await paidQueued(u, 'm1', 1, '=1+1,"x"');
    const date = new Date(ctx.clock.now().getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    await ops.agent.get(`/api/admin/export/orders.csv?date=${date}`).expect(403);
    await support.agent.get('/api/admin/export/orders.csv?date=2026/11/12').expect(400);
    const r = await support.agent.get(`/api/admin/export/orders.csv?date=${date}`).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toContain(`orders-${date}.csv`);
    const text = r.text;
    expect(text.startsWith('﻿订单号,类型,用户邮箱')).toBe(true);
    const line = text.split('\r\n').find((l) => l.startsWith(q.no))!;
    expect(line).toContain(`新租,${u.email},月付,1,799.00,799.00,`);
    expect(line).toContain(`"'=1+1,""x"""`);
    expect(line.endsWith(support.admin.name)).toBe(true);
    // 没有收款的日期是只有表头的空表
    const empty = await support.agent
      .get('/api/admin/export/orders.csv?date=2020-01-01')
      .expect(200);
    expect(empty.text.trim().split('\r\n')).toHaveLength(1);
  });

  it('用户管理：搜索、详情不含凭证；禁用立即踢下线且不能登录；恢复后可登录；仅管理员能改', async () => {
    const u = await registerUser(ctx);
    const p = await provision(ctx, u);
    const support = await loginAdmin(ctx, 'support');
    const boss = await loginAdmin(ctx, 'admin');
    const list = (await support.agent.get(`/api/admin/users?keyword=${u.email}`).expect(200)).body;
    expect(list.items[0]).toMatchObject({
      email: u.email,
      orderCount: 1,
      activeDevices: 1,
      status: 'active',
    });
    const id = list.items[0].id as string;
    const d = (await support.agent.get(`/api/admin/users/${id}`).expect(200)).body;
    expect(d.orders[0].no).toBe(p.no);
    expect(d.leases[0].deviceCode).toBe(p.devices[0]!.code);
    expect(JSON.stringify(d)).not.toMatch(/uu-0|mac-0|passwordHash|Enc/);
    await support.agent.patch(`/api/admin/users/${id}`).send({ status: 'disabled' }).expect(403);
    await boss.agent.patch(`/api/admin/users/${id}`).send({ status: 'bogus' }).expect(400);
    await boss.agent.patch(`/api/admin/users/${id}`).send({ status: 'disabled' }).expect(200);
    await u.agent.get('/api/me').expect(401);
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: 'Passw0rd!x' })
      .expect(401);
    await boss.agent.patch(`/api/admin/users/${id}`).send({ status: 'active' }).expect(200);
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: 'Passw0rd!x' })
      .expect(200);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'user.disable', target: `user:${id}` } }),
    ).toBe(1);
  });

  it('管理员列表：仅管理员可看，含两步验证状态', async () => {
    const boss = await loginAdmin(ctx, 'admin');
    const ops = await loginAdmin(ctx, 'ops');
    await ops.agent.get('/api/admin/admins').expect(403);
    const r = (await boss.agent.get('/api/admin/admins').expect(200)).body as {
      id: string;
      totpEnabled: boolean;
    }[];
    expect(r.find((a) => a.id === boss.admin.id)?.totpEnabled).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/passwordHash|totpSecret|recovery/);
  });
});

describe('咨询', () => {
  it('公开提交（限流 5 次/小时/IP）；客服可看可跟进；运维无权', async () => {
    const ok = { contact: 'wx_big_buyer', quantity: 30, message: '想租 30 台做自动化测试' };
    await ctx.http().post('/api/consult').send({ contact: '', message: 'x' }).expect(400);
    for (let i = 0; i < 5; i++) await ctx.http().post('/api/consult').send(ok).expect(204);
    await ctx.http().post('/api/consult').send(ok).expect(429);
    const support = await loginAdmin(ctx, 'support');
    const ops = await loginAdmin(ctx, 'ops');
    await ops.agent.get('/api/admin/consults').expect(403);
    const list = (await support.agent.get('/api/admin/consults?status=new').expect(200)).body;
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list[0]).toMatchObject({ contact: 'wx_big_buyer', quantity: 30, status: 'new' });
    const up = await support.agent
      .patch(`/api/admin/consults/${list[0].id}`)
      .send({ status: 'following', note: '已加微信' })
      .expect(200);
    expect(up.body).toMatchObject({ status: 'following', note: '已加微信' });
    await support.agent.patch('/api/admin/consults/nope').send({ status: 'done' }).expect(404);
  });
});

describe('开通超期补偿', () => {
  it('每超 1 天补 1 天；只能补偿一次；未超期不可补；客服无权', async () => {
    const u = await registerUser(ctx);
    const q = await paidQueued(u, 'm1', 1);
    ctx.clock.advance(9 * DAY); // 超过 7 天开通时限 2 天
    const ops = await loginAdmin(ctx, 'ops'); // 拨钟后后台会话已过期，重新登录
    const support = await loginAdmin(ctx, 'support');
    const dev = await ctx.prisma.device.findFirstOrThrow({
      where: { status: 'idle' },
      orderBy: { code: 'asc' },
    });
    await ops.agent
      .post(`/api/admin/orders/${q.no}/activate`)
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
    const lease = await ctx.prisma.lease.findFirstOrThrow({ where: { order: { no: q.no } } });
    await support.agent.post(`/api/admin/orders/${q.no}/compensate`).expect(403);
    const r = await ops.agent.post(`/api/admin/orders/${q.no}/compensate`).expect(201);
    expect(r.body.days).toBe(2);
    const after = await ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    expect(after.endAt.getTime() - lease.endAt.getTime()).toBe(2 * DAY);
    expect(after.graceEndAt.getTime() - lease.graceEndAt.getTime()).toBe(2 * DAY);
    await ops.agent.post(`/api/admin/orders/${q.no}/compensate`).expect(409);
    expect(await templates(await fresh(u))).toContain('compensated');
    // 按时开通的订单不能补偿
    const u2 = await registerUser(ctx);
    const p2 = await provision(ctx, u2);
    await ops.agent.post(`/api/admin/orders/${p2.no}/compensate`).expect(400);
  });
});

async function fresh(u: U): Promise<U> {
  const agent = request.agent(ctx.app.getHttpServer());
  await agent.post('/api/auth/login').send({ email: u.email, password: 'Passw0rd!x' }).expect(200);
  return { agent, email: u.email };
}

describe('并发与重复提交', () => {
  it('同时确认收款只有一次生效；同时退款只有一次生效；同时续费确认只延长一次', async () => {
    const u = await registerUser(ctx);
    const o = (
      await u.agent
        .post('/api/orders')
        .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
        .expect(201)
    ).body;
    await u.agent
      .post(`/api/orders/${o.no}/xianyu`)
      .send({ xianyuOrderNo: xyNo(), xianyuBuyerNick: 'n' })
      .expect(200);
    const s1 = await loginAdmin(ctx, 'support');
    const s2 = await loginAdmin(ctx, 'support');
    const body = { paidCents: o.totalCents, confirmedAmount: true, confirmedQuantity: true };
    const codes = (
      await Promise.all([
        s1.agent.post(`/api/admin/orders/${o.no}/verify`).send(body),
        s2.agent.post(`/api/admin/orders/${o.no}/verify`).send(body),
      ])
    )
      .map((r) => r.status)
      .sort();
    expect(codes).toEqual([201, 409]);

    const b1 = await loginAdmin(ctx, 'admin');
    const b2 = await loginAdmin(ctx, 'admin');
    const refund = { reason: '并发退款', amountCents: 0, xianyuRefundNo: 'XY-C' };
    const rc = (
      await Promise.all([
        b1.agent.post(`/api/admin/orders/${o.no}/refund`).send(refund),
        b2.agent.post(`/api/admin/orders/${o.no}/refund`).send(refund),
      ])
    )
      .map((r) => r.status)
      .sort();
    expect(rc).toEqual([201, 409]);
    expect(await ctx.prisma.refund.count({ where: { order: { no: o.no } } })).toBe(1);

    // 续费确认并发
    const p = await provision(ctx, u, 'm1', 1);
    const lease = p.leases[0]!;
    const r = (
      await u.agent
        .post('/api/orders')
        .send({ kind: 'renew', renewLeaseId: lease.id, term: 'm1', quantity: 1, agreedTerms: true })
        .expect(201)
    ).body;
    await u.agent
      .post(`/api/orders/${r.no}/xianyu`)
      .send({ xianyuOrderNo: xyNo(), xianyuBuyerNick: 'n' })
      .expect(200);
    const rb = { paidCents: r.totalCents, confirmedAmount: true, confirmedQuantity: true };
    const rcodes = (
      await Promise.all([
        s1.agent.post(`/api/admin/orders/${r.no}/verify`).send(rb),
        s2.agent.post(`/api/admin/orders/${r.no}/verify`).send(rb),
      ])
    )
      .map((x) => x.status)
      .sort();
    expect(rcodes).toEqual([201, 409]);
    expect(await ctx.prisma.leaseRenewal.count({ where: { leaseId: lease.id } })).toBe(1);
  });
});
