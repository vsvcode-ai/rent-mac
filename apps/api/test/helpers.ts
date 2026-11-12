import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { Mailer, LogMailer } from '../src/common/mail.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setup } from '../src/setup.js';

export async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  setup(app);
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    clock: app.get(Clock),
    mail: app.get(Mailer) as LogMailer,
  };
}
export type TestCtx = Awaited<ReturnType<typeof createApp>>;

let n = 0;
/** 注册并登录一个新用户，返回带 cookie 的 agent */
export async function registerUser(ctx: TestCtx, email = `u${Date.now()}_${n++}@test.com`) {
  const agent = request.agent(ctx.app.getHttpServer());
  await agent.post('/api/auth/send-code').send({ email }).expect(204);
  const code = /(\d{6})/.exec(ctx.mail.outbox.at(-1)!.subject)![1]!;
  await agent.post('/api/auth/register').send({ email, code, password: 'Passw0rd!x' }).expect(201);
  return { agent, email };
}
export type { INestApplication };

import * as argon2 from 'argon2';
import type { AdminRole } from '@prisma/client';
import { stepOf, totpAt } from '../src/admin/totp.js';

export const ADMIN_PW = 'Admin-Passw0rd!!';
let an = 0;
export async function createAdmin(ctx: TestCtx, role: AdminRole = 'admin') {
  const email = `admin${Date.now()}_${an++}@nyd.test`;
  const a = await ctx.prisma.adminUser.create({
    data: { email, name: `测试${role}`, role, passwordHash: await argon2.hash(ADMIN_PW) },
  });
  return { ...a, email };
}
export const currentCode = (ctx: TestCtx, secret: string) =>
  totpAt(secret, stepOf(ctx.clock.now()));

/** 创建管理员并走完「登录 → 绑定两步验证」，返回带已验证会话的 agent */
export async function loginAdmin(ctx: TestCtx, role: AdminRole = 'admin') {
  const a = await createAdmin(ctx, role);
  const agent = request.agent(ctx.app.getHttpServer());
  await agent
    .post('/api/admin/auth/login')
    .send({ email: a.email, password: ADMIN_PW })
    .expect(200);
  const setup = await agent.get('/api/admin/auth/totp/setup').expect(200);
  const en = await agent
    .post('/api/admin/auth/totp/enable')
    .send({ code: currentCode(ctx, setup.body.secret) })
    .expect(200);
  ctx.clock.advance(31_000); // 让下一次动态码落在新的步长，避免防重放误伤
  return {
    agent,
    admin: a,
    secret: setup.body.secret as string,
    recoveryCodes: en.body.recoveryCodes as string[],
  };
}
