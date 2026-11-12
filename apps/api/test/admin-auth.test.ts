import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Encode, totpAt } from '../src/admin/totp.js';
import { CryptoService } from '../src/crypto/crypto.service.js';
import {
  ADMIN_PW,
  createAdmin,
  createApp,
  currentCode,
  loginAdmin,
  registerUser,
  type TestCtx,
} from './helpers.js';
import request from 'supertest';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

describe('TOTP 算法', () => {
  it('符合 RFC 6238 测试向量（SHA1，T=59 → 287082）', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });
});

describe('凭证加密', () => {
  const c = new CryptoService();
  it('加解密往返，且每次密文不同', () => {
    const a = c.encrypt('Hq4-vN8zXe2P');
    expect(c.decrypt(a)).toBe('Hq4-vN8zXe2P');
    expect(c.encrypt('Hq4-vN8zXe2P')).not.toBe(a);
    expect(a).not.toContain('Hq4');
  });
  it('密文被篡改会解密失败', () => {
    const a = c.encrypt('secret');
    const parts = a.split('.');
    parts[3] = Buffer.from('tampered!!').toString('base64url');
    expect(() => c.decrypt(parts.join('.'))).toThrow();
  });
});

describe('管理员登录与两步验证', () => {
  it('密码正确但没绑定 → 要求绑定；绑定前不能访问后台接口', async () => {
    const a = await createAdmin(ctx);
    const agent = request.agent(ctx.app.getHttpServer());
    const r = await agent
      .post('/api/admin/auth/login')
      .send({ email: a.email, password: ADMIN_PW })
      .expect(200);
    expect(r.body.stage).toBe('totp_setup');
    await agent.get('/api/admin/me').expect(401);
  });

  it('绑定成功：得到 10 个恢复码（库里只存哈希），并进入已验证状态', async () => {
    const { agent, admin, recoveryCodes } = await loginAdmin(ctx);
    expect(recoveryCodes).toHaveLength(10);
    const me = await agent.get('/api/admin/me').expect(200);
    expect(me.body).toMatchObject({ email: admin.email, totpEnabled: true });
    expect(me.body.passwordHash).toBeUndefined();
    const row = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(JSON.stringify(row.recoveryCodeHashes)).not.toContain(recoveryCodes[0]);
    expect(row.totpSecretEnc).not.toBeNull();
    expect(row.totpSecretEnc!.startsWith('v1.')).toBe(true);
  });

  it('已绑定的管理员再次登录必须输入动态码；错误码被拒绝', async () => {
    const { admin, secret } = await loginAdmin(ctx);
    const agent = request.agent(ctx.app.getHttpServer());
    const r = await agent
      .post('/api/admin/auth/login')
      .send({ email: admin.email, password: ADMIN_PW })
      .expect(200);
    expect(r.body.stage).toBe('totp_required');
    await agent.get('/api/admin/me').expect(401);
    await agent.post('/api/admin/auth/totp/verify').send({ code: '000000' }).expect(401);
    await agent
      .post('/api/admin/auth/totp/verify')
      .send({ code: currentCode(ctx, secret) })
      .expect(200);
    await agent.get('/api/admin/me').expect(200);
  });

  it('同一个动态码不能重复使用（防重放）', async () => {
    const { admin, secret } = await loginAdmin(ctx);
    const code = currentCode(ctx, secret);
    const a1 = request.agent(ctx.app.getHttpServer());
    await a1.post('/api/admin/auth/login').send({ email: admin.email, password: ADMIN_PW });
    await a1.post('/api/admin/auth/totp/verify').send({ code }).expect(200);
    const a2 = request.agent(ctx.app.getHttpServer());
    await a2.post('/api/admin/auth/login').send({ email: admin.email, password: ADMIN_PW });
    await a2.post('/api/admin/auth/totp/verify').send({ code }).expect(401);
  });

  it('恢复码只能用一次', async () => {
    const { admin, recoveryCodes } = await loginAdmin(ctx);
    const a1 = request.agent(ctx.app.getHttpServer());
    await a1.post('/api/admin/auth/login').send({ email: admin.email, password: ADMIN_PW });
    await a1
      .post('/api/admin/auth/totp/verify')
      .send({ recoveryCode: recoveryCodes[0] })
      .expect(200);
    const a2 = request.agent(ctx.app.getHttpServer());
    await a2.post('/api/admin/auth/login').send({ email: admin.email, password: ADMIN_PW });
    await a2
      .post('/api/admin/auth/totp/verify')
      .send({ recoveryCode: recoveryCodes[0] })
      .expect(401);
    const log = await ctx.prisma.auditLog.findFirst({
      where: { adminId: admin.id, action: 'admin.recovery_code.used' },
    });
    expect(log).not.toBeNull();
  });

  it('动态码连续错 5 次：会话被销毁，需要重新登录', async () => {
    const { admin, secret } = await loginAdmin(ctx);
    const agent = request.agent(ctx.app.getHttpServer());
    await agent.post('/api/admin/auth/login').send({ email: admin.email, password: ADMIN_PW });
    for (let i = 0; i < 5; i++)
      await agent.post('/api/admin/auth/totp/verify').send({ code: '111111' }).expect(401);
    await agent
      .post('/api/admin/auth/totp/verify')
      .send({ code: currentCode(ctx, secret) })
      .expect(429);
    await agent
      .post('/api/admin/auth/totp/verify')
      .send({ code: currentCode(ctx, secret) })
      .expect(401);
  });

  it('密码错误 5 次后限流', async () => {
    const a = await createAdmin(ctx);
    for (let i = 0; i < 5; i++)
      await ctx
        .http()
        .post('/api/admin/auth/login')
        .send({ email: a.email, password: 'wrong-wrong-1' })
        .expect(401);
    await ctx
      .http()
      .post('/api/admin/auth/login')
      .send({ email: a.email, password: ADMIN_PW })
      .expect(429);
  });

  it('普通用户的会话不能访问后台', async () => {
    const { agent } = await registerUser(ctx);
    await agent.get('/api/admin/me').expect(401);
  });

  it('管理员重置他人的两步验证：对方被踢下线、需重新绑定，并记审计日志', async () => {
    const boss = await loginAdmin(ctx, 'admin');
    const staff = await loginAdmin(ctx, 'support');
    await boss.agent.post(`/api/admin/admins/${staff.admin.id}/reset-totp`).expect(204);
    await staff.agent.get('/api/admin/me').expect(401);
    const re = request.agent(ctx.app.getHttpServer());
    const r = await re
      .post('/api/admin/auth/login')
      .send({ email: staff.admin.email, password: ADMIN_PW })
      .expect(200);
    expect(r.body.stage).toBe('totp_setup');
    const log = await ctx.prisma.auditLog.findFirst({
      where: { adminId: boss.admin.id, action: 'admin.totp.reset' },
    });
    expect(log?.target).toBe(`admin:${staff.admin.id}`);
  });

  it('非管理员角色不能重置别人的两步验证', async () => {
    const ops = await loginAdmin(ctx, 'ops');
    const other = await createAdmin(ctx, 'support');
    await ops.agent.post(`/api/admin/admins/${other.id}/reset-totp`).expect(403);
  });
});
