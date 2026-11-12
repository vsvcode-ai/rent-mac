// 创建管理员：pnpm --filter @nyd/api admin:create <email> <name> <support|ops|admin>
// 密码从环境变量 ADMIN_PASSWORD 读取（避免留在 shell 历史里）；首次登录强制绑定两步验证
import { PrismaClient, type AdminRole } from '@prisma/client';
import * as argon2 from 'argon2';

const [email, name, role] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (
  !email ||
  !name ||
  !['support', 'ops', 'admin'].includes(role ?? '') ||
  !password ||
  password.length < 12
) {
  console.error(
    '用法：ADMIN_PASSWORD=<至少 12 位> pnpm admin:create <email> <name> <support|ops|admin>',
  );
  process.exit(1);
}
const prisma = new PrismaClient();
await prisma.adminUser.upsert({
  where: { email: email.toLowerCase() },
  create: {
    email: email.toLowerCase(),
    name,
    role: role as AdminRole,
    passwordHash: await argon2.hash(password),
  },
  update: { name, role: role as AdminRole, passwordHash: await argon2.hash(password) },
});
console.log(`管理员已创建：${email}（${role}），首次登录需绑定两步验证`);
await prisma.$disconnect();
