import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, loginAdmin, registerUser, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('机器台账', () => {
  it('列表：状态汇总、筛选、搜索；所有角色可看', async () => {
    const { agent } = await loginAdmin(ctx, 'support');
    const r = await agent.get('/api/admin/devices?pageSize=5').expect(200);
    expect(r.body.items).toHaveLength(5);
    expect(r.body.summary.idle).toBeGreaterThan(0);
    const s = await agent.get('/api/admin/devices?keyword=NYD-MY-0007').expect(200);
    expect(s.body.items.map((d: { code: string }) => d.code)).toEqual(['NYD-MY-0007']);
    const f = await agent.get('/api/admin/devices?status=fault').expect(200);
    expect(f.body.items.every((d: { status: string }) => d.status === 'fault')).toBe(true);
  });

  it('状态修改：空闲 → 维护 → 空闲；非法流转和客服操作被拒绝，并留审计', async () => {
    const ops = await loginAdmin(ctx, 'ops');
    const support = await loginAdmin(ctx, 'support');
    const d = await ctx.prisma.device.findFirstOrThrow({
      where: { status: 'idle' },
      orderBy: { code: 'desc' },
    });
    await support.agent
      .patch(`/api/admin/devices/${d.id}/status`)
      .send({ status: 'maintenance' })
      .expect(403);
    await ops.agent
      .patch(`/api/admin/devices/${d.id}/status`)
      .send({ status: 'maintenance', note: '换电源' })
      .expect(200);
    await ops.agent
      .patch(`/api/admin/devices/${d.id}/status`)
      .send({ status: 'in_use' })
      .expect(400); // 不能手动设为使用中
    await ops.agent.patch(`/api/admin/devices/${d.id}/status`).send({ status: 'idle' }).expect(200);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'device.status', target: `device:${d.code}` },
      }),
    ).toBe(2);
  });

  it('维护中的机器不计入可租库存', async () => {
    const ops = await loginAdmin(ctx, 'ops');
    const before = (await ctx.http().get('/api/plans')).body.available;
    const d = await ctx.prisma.device.findFirstOrThrow({
      where: { status: 'idle' },
      orderBy: { code: 'desc' },
    });
    await ops.agent
      .patch(`/api/admin/devices/${d.id}/status`)
      .send({ status: 'fault' })
      .expect(200);
    expect((await ctx.http().get('/api/plans')).body.available).toBe(before - 1);
    await ops.agent.patch(`/api/admin/devices/${d.id}/status`).send({ status: 'idle' }).expect(200);
  });

  it('批量导入：逐行校验，有错一台都不写；dryRun 只校验', async () => {
    const ops = await loginAdmin(ctx, 'ops');
    const count = () => ctx.prisma.device.count();
    const n0 = await count();
    const rows = [
      { serial: 'IMP-001', rackLocation: 'R99-01', publicIp: '10.99.0.1' },
      { serial: 'IMP-001', rackLocation: 'R99-02', publicIp: '10.99.0.2' }, // 序列号文件内重复
      { serial: 'IMP-003', rackLocation: 'R99-03', publicIp: '999.1.1.1' }, // IP 非法
      { serial: 'SEED000001', rackLocation: 'R99-04', publicIp: '10.99.0.4' }, // 与库内重复
    ];
    const bad = await ops.agent.post('/api/admin/devices/import').send({ rows }).expect(201);
    expect(bad.body.imported).toBe(0);
    expect(bad.body.errors.map((e: { row: number }) => e.row)).toEqual([2, 3, 4]);
    expect(await count()).toBe(n0);

    const good = [
      { serial: 'IMP-A', rackLocation: 'R99-01', publicIp: '10.99.1.1' },
      { serial: 'IMP-B', rackLocation: 'R99-02', publicIp: '10.99.1.2', note: '新到货' },
    ];
    const dry = await ops.agent
      .post('/api/admin/devices/import')
      .send({ rows: good, dryRun: true })
      .expect(201);
    expect(dry.body).toMatchObject({ imported: 0, valid: 2, errors: [] });
    expect(await count()).toBe(n0);
    const ok = await ops.agent.post('/api/admin/devices/import').send({ rows: good }).expect(201);
    expect(ok.body.imported).toBe(2);
    // 编号自动续接（库里已有 0001–0200）
    const added = await ctx.prisma.device.findMany({
      where: { serial: { in: ['IMP-A', 'IMP-B'] } },
      orderBy: { serial: 'asc' },
    });
    expect(added.map((d) => d.code)).toEqual(['NYD-MY-0201', 'NYD-MY-0202']);
    expect(added.every((d) => d.status === 'idle')).toBe(true);
  });
});

describe('设置', () => {
  it('只有管理员能改；改价写改价记录，并提示同步闲鱼', async () => {
    const boss = await loginAdmin(ctx, 'admin');
    const ops = await loginAdmin(ctx, 'ops');
    await ops.agent
      .put('/api/admin/settings')
      .send({ plans: [{ term: 'm1', monthlyCents: 89900 }] })
      .expect(403);
    const r = await boss.agent
      .put('/api/admin/settings')
      .send({
        plans: [{ term: 'm1', monthlyCents: 89900, xianyuUrl: 'https://m.goofish.com/item?id=1' }],
      })
      .expect(200);
    expect(r.body.needXianyuSync).toEqual([{ term: 'm1', oldCents: 79900, newCents: 89900 }]);
    expect(await ctx.prisma.priceChangeLog.count({ where: { term: 'm1', newCents: 89900 } })).toBe(
      1,
    );
    const plans = (await ctx.http().get('/api/plans').expect(200)).body.plans;
    expect(plans[0]).toMatchObject({
      monthlyCents: 89900,
      xianyuUrl: 'https://m.goofish.com/item?id=1',
    });
    // 新订单按新价；旧订单保留价格快照
    const u = await registerUser(ctx);
    const o = await u.agent
      .post('/api/orders')
      .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
      .expect(201);
    expect(o.body.totalCents).toBe(89900);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'settings.update', adminId: boss.admin.id },
      }),
    ).toBe(1);
    await boss.agent
      .put('/api/admin/settings')
      .send({ plans: [{ term: 'm1', monthlyCents: 79900 }] })
      .expect(200);
  });

  it('客服联系方式对前台公开；非法链接被拒绝', async () => {
    const boss = await loginAdmin(ctx, 'admin');
    await boss.agent
      .put('/api/admin/settings')
      .send({ support: { wechat: 'nanyangdesk01', telegram: '@nanyangdesk' } })
      .expect(200);
    const pub = await ctx.http().get('/api/settings/public').expect(200);
    expect(pub.body).toMatchObject({
      supportWechat: 'nanyangdesk01',
      supportTelegram: '@nanyangdesk',
    });
    await boss.agent
      .put('/api/admin/settings')
      .send({ plans: [{ term: 'm3', monthlyCents: 69900, xianyuUrl: 'javascript:alert(1)' }] })
      .expect(400);
  });

  it('开通时限、宽限天数改了之后对新操作生效', async () => {
    const boss = await loginAdmin(ctx, 'admin');
    await boss.agent.put('/api/admin/settings').send({ activationDeadlineDays: 5 }).expect(200);
    const u = await registerUser(ctx);
    const o = await u.agent
      .post('/api/orders')
      .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
      .expect(201);
    await u.agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '9900000000001', xianyuBuyerNick: 'n' })
      .expect(200);
    const support = await loginAdmin(ctx, 'support');
    await support.agent
      .post(`/api/admin/orders/${o.body.no}/verify`)
      .send({ paidCents: 79900, confirmedAmount: true, confirmedQuantity: true })
      .expect(201);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { no: o.body.no } });
    expect(row.deadlineAt!.getTime() - row.paidAt!.getTime()).toBe(5 * 86_400_000);
    await boss.agent.put('/api/admin/settings').send({ activationDeadlineDays: 7 }).expect(200);
  });

  it('上传二维码：只收真正的图片，非图片即使改扩展名也拒绝；访问时带 nosniff', async () => {
    const boss = await loginAdmin(ctx, 'admin');
    const ok = await boss.agent
      .post('/api/admin/uploads')
      .attach('file', PNG, 'qr.png')
      .expect(201);
    expect(ok.body.url).toMatch(/^\/uploads\/[0-9a-f]{24}\.png$/);
    const got = await ctx.http().get(ok.body.url).expect(200);
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    await boss.agent
      .post('/api/admin/uploads')
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'evil.png')
      .expect(400);
    await boss.agent.post('/api/admin/uploads').expect(400);
    const ops = await loginAdmin(ctx, 'ops');
    await ops.agent.post('/api/admin/uploads').attach('file', PNG, 'qr.png').expect(403);
  });
});

describe('手动修改到期时间（续费上线前的保底）', () => {
  it('管理员可改，宽限期同步重算，必须填原因并留日志', async () => {
    const user = await registerUser(ctx);
    const support = await loginAdmin(ctx, 'support'),
      ops = await loginAdmin(ctx, 'ops'),
      boss = await loginAdmin(ctx, 'admin');
    const o = await user.agent
      .post('/api/orders')
      .send({ term: 'm1', quantity: 1, contactWechat: 'a', agreedTerms: true })
      .expect(201);
    await user.agent
      .post(`/api/orders/${o.body.no}/xianyu`)
      .send({ xianyuOrderNo: '9900000000777', xianyuBuyerNick: 'n' })
      .expect(200);
    await support.agent
      .post(`/api/admin/orders/${o.body.no}/verify`)
      .send({ paidCents: 79900, confirmedAmount: true, confirmedQuantity: true })
      .expect(201);
    const d = await ctx.prisma.device.findFirstOrThrow({ where: { status: 'idle' } });
    await ops.agent
      .post(`/api/admin/orders/${o.body.no}/activate`)
      .send({
        devices: [
          {
            deviceId: d.id,
            uuDeviceCode: '1',
            uuPassword: 'a',
            macUsername: 'u',
            macPassword: 'b',
          },
        ],
      })
      .expect(201);
    const lease = await ctx.prisma.lease.findFirstOrThrow({ where: { deviceId: d.id } });
    const to = new Date(lease.endAt.getTime() + 30 * 86_400_000);
    await ops.agent
      .patch(`/api/admin/leases/${lease.id}/end-at`)
      .send({ endAt: to, reason: '续费一个月' })
      .expect(403);
    await boss.agent.patch(`/api/admin/leases/${lease.id}/end-at`).send({ endAt: to }).expect(400);
    await boss.agent
      .patch(`/api/admin/leases/${lease.id}/end-at`)
      .send({ endAt: to, reason: '续费一个月' })
      .expect(200);
    const after = await ctx.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    expect(after.endAt.getTime()).toBe(to.getTime());
    expect(after.graceEndAt.getTime() - after.endAt.getTime()).toBe(3 * 86_400_000);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'lease.set_end_at', target: `lease:${lease.id}` },
      }),
    ).toBe(1);
  });
});
