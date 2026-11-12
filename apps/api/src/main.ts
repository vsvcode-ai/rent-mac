import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { OrdersService } from './orders/orders.service.js';
import { LifecycleService } from './lifecycle/lifecycle.service.js';
import { setup } from './setup.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 在 Cloudflare / nginx 后面，才能拿到真实客户端 IP（限流依赖）
  app.set('trust proxy', 1);
  setup(app);
  // 待付款 48 小时自动取消（上 Redis / BullMQ 后迁移为队列任务）
  const orders = app.get(OrdersService);
  setInterval(() => void orders.expirePending().catch(console.error), 60_000);
  // 租约推进 + 到期提醒（每 10 分钟；tick 幂等）
  const lifecycle = app.get(LifecycleService);
  setInterval(() => void lifecycle.tick().catch(console.error), 10 * 60_000);
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
