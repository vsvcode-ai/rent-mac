// 仅本地开发：准备测试账号与基础设置。pnpm --filter @nyd/api dev:demo
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

if (process.env.NODE_ENV === 'production') throw new Error('不能在生产环境运行');
const prisma = new PrismaClient();
const PW = 'Demo-Passw0rd!!';

for (const [email, name, role] of [
  ['admin@nyd.local', '测试管理员', 'admin'],
  ['support@nyd.local', '测试客服', 'support'],
  ['ops@nyd.local', '测试运维', 'ops'],
] as const) {
  const passwordHash = await argon2.hash(PW);
  await prisma.adminUser.upsert({ where: { email }, create: { email, name, role, passwordHash }, update: { passwordHash, role } });
}
await prisma.user.upsert({
  where: { email: 'buyer@nyd.local' },
  create: { email: 'buyer@nyd.local', passwordHash: await argon2.hash(PW), emailVerified: true, wechat: 'demo_buyer' },
  update: { passwordHash: await argon2.hash(PW) },
});
for (const t of ['m1', 'm3', 'm6', 'm12'] as const) {
  await prisma.plan.update({ where: { term: t }, data: { xianyuUrl: `https://m.goofish.com/item?id=DEMO-${t.toUpperCase()}` } });
}
const set = (key: string, value: string) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
await set('support.wechat', 'nanyangdesk01');
await set('support.telegram', '@nanyangdesk');
console.log('测试数据已就绪（密码统一 ' + PW + '）');
await prisma.$disconnect();
