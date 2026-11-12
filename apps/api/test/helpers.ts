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
