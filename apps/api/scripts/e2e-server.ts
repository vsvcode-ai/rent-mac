// 端到端测试用的一体化服务：临时内嵌 Postgres → 迁移 → 种子 → 预置账号 → 启动 API
// 运行：node --import @swc-node/register/esm-register scripts/e2e-server.ts
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import EmbeddedPostgres from 'embedded-postgres';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoService } from '../src/crypto/crypto.service.js';

const E2E = {
  pgPort: 54330,
  apiPort: 4100,
  buyer: { email: 'buyer@e2e.test', password: 'Buyer-Passw0rd!' },
  adminPassword: 'Admin-Passw0rd!!',
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  recoveryCode: 'abcde-12345',
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'nyd-e2e-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'nyd',
    password: 'nyd',
    port: E2E.pgPort,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('nyd_e2e');
  const url = `postgresql://nyd:nyd@localhost:${E2E.pgPort}/nyd_e2e`;
  process.env.DATABASE_URL = url;
  process.env.PORT = String(E2E.apiPort);
  process.env.UPLOAD_DIR = join(dir, 'uploads');
  execSync('pnpm prisma migrate deploy', { stdio: 'pipe', env: process.env });
  execSync('pnpm tsx prisma/seed.ts', { stdio: 'pipe', env: process.env });

  const prisma = new PrismaClient();
  const crypto = new CryptoService();
  await prisma.user.create({
    data: {
      email: E2E.buyer.email,
      passwordHash: await argon2.hash(E2E.buyer.password),
      emailVerified: true,
    },
  });
  const totp = (role: 'support' | 'ops' | 'admin', email: string, name: string, codes: string[]) =>
    argon2.hash(E2E.adminPassword).then((passwordHash) =>
      prisma.adminUser.create({
        data: {
          email,
          name,
          role,
          passwordHash,
          totpSecretEnc: crypto.encrypt(E2E.totpSecret),
          totpEnabledAt: new Date(),
          recoveryCodeHashes: codes.map(sha),
        },
      }),
    );
  for (const role of ['support', 'ops', 'admin'] as const) {
    await totp(role, `${role}@e2e.test`, `E2E ${role}`, [E2E.recoveryCode]);
  }
  // 专用于「重置两步验证」用例
  await totp('support', 'victim@e2e.test', 'E2E victim', []);
  await prisma.setting.upsert({
    where: { key: 'support.wechat' },
    create: { key: 'support.wechat', value: 'nyd_e2e_wx' },
    update: { value: 'nyd_e2e_wx' },
  });
  for (const t of ['m1', 'm3', 'm6', 'm12'] as const) {
    await prisma.plan.update({
      where: { term: t },
      data: { xianyuUrl: `https://m.goofish.com/item?id=E2E-${t}` },
    });
  }
  await prisma.$disconnect();

  const stop = async () => {
    await pg.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await import('../src/main.js');
}
void main();
