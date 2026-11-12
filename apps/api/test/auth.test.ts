import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, registerUser, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createApp()));
afterAll(() => ctx.app.close());

describe('认证', () => {
  it('注册 → /api/me → 登出后 401', async () => {
    const { agent, email } = await registerUser(ctx);
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.passwordHash).toBeUndefined();
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/me').expect(401);
  });

  it('密码以 argon2 哈希存储', async () => {
    const { email } = await registerUser(ctx);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.passwordHash.startsWith('$argon2')).toBe(true);
  });

  it('验证码错误被拒绝，错 5 次后作废', async () => {
    const email = `bad${Date.now()}@test.com`;
    await ctx.http().post('/api/auth/send-code').send({ email }).expect(204);
    for (let i = 0; i < 5; i++) {
      await ctx
        .http()
        .post('/api/auth/register')
        .send({ email, code: '000000', password: 'Passw0rd!x' })
        .expect(400);
    }
    const real = /(\d{6})/.exec(ctx.mail.outbox.at(-1)!.subject)![1]!;
    const r = await ctx
      .http()
      .post('/api/auth/register')
      .send({ email, code: real, password: 'Passw0rd!x' })
      .expect(400);
    expect(r.body.message).toContain('过期');
  });

  it('同一邮箱 60 秒内不能重复发验证码', async () => {
    const email = `cool${Date.now()}@test.com`;
    await ctx.http().post('/api/auth/send-code').send({ email }).expect(204);
    await ctx.http().post('/api/auth/send-code').send({ email }).expect(429);
    ctx.clock.advance(61_000);
    await ctx.http().post('/api/auth/send-code').send({ email }).expect(204);
  });

  it('已注册邮箱不能再注册', async () => {
    const { email } = await registerUser(ctx);
    ctx.clock.advance(61_000);
    await ctx.http().post('/api/auth/send-code').send({ email }).expect(409);
  });

  it('登录失败 5 次后限流', async () => {
    const { email } = await registerUser(ctx);
    for (let i = 0; i < 5; i++)
      await ctx.http().post('/api/auth/login').send({ email, password: 'wrong-pass' }).expect(401);
    await ctx.http().post('/api/auth/login').send({ email, password: 'Passw0rd!x' }).expect(429);
    ctx.clock.advance(16 * 60_000);
    await ctx.http().post('/api/auth/login').send({ email, password: 'Passw0rd!x' }).expect(200);
  });

  it('找回密码后旧会话失效、新密码可登录', async () => {
    const { agent, email } = await registerUser(ctx);
    ctx.clock.advance(61_000);
    await agent.post('/api/auth/forgot-password').send({ email }).expect(204);
    const code = /(\d{6})/.exec(ctx.mail.outbox.at(-1)!.subject)![1]!;
    await ctx
      .http()
      .post('/api/auth/reset-password')
      .send({ email, code, password: 'NewPassw0rd!' })
      .expect(204);
    await agent.get('/api/me').expect(401);
    await ctx.http().post('/api/auth/login').send({ email, password: 'NewPassw0rd!' }).expect(200);
  });

  it('找回密码不泄露邮箱是否存在', async () => {
    const before = ctx.mail.outbox.length;
    await ctx
      .http()
      .post('/api/auth/forgot-password')
      .send({ email: `nobody${Date.now()}@test.com` })
      .expect(204);
    expect(ctx.mail.outbox.length).toBe(before);
  });
});
