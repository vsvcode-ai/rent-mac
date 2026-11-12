// 仅本地开发：打印某管理员当前的两步验证动态码，免去手机验证器。
// pnpm --filter @nyd/api dev:totp admin@nyd.local
import { PrismaClient } from '@prisma/client';
import { CryptoService } from '../src/crypto/crypto.service.js';
import { stepOf, totpAt } from '../src/admin/totp.js';

if (process.env.NODE_ENV === 'production') throw new Error('不能在生产环境运行');
const prisma = new PrismaClient();
const a = await prisma.adminUser.findUnique({ where: { email: process.argv[2] ?? '' } });
if (!a?.totpSecretEnc) console.log('该管理员尚未生成两步验证密钥（先在登录页走「绑定」流程，看到二维码后再运行）');
else console.log(totpAt(new CryptoService().decrypt(a.totpSecretEnc), stepOf(new Date())));
await prisma.$disconnect();
