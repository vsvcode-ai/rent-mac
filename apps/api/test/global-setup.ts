// 测试前启动一个临时的内嵌 Postgres，跑迁移和种子数据；结束后销毁
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 54329;
let pg: EmbeddedPostgres;
let dir: string;

export async function setup() {
  dir = mkdtempSync(join(tmpdir(), 'nyd-pg-'));
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'nyd',
    password: 'nyd',
    port: PORT,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('nyd_test');
  const url = `postgresql://nyd:nyd@localhost:${PORT}/nyd_test`;
  process.env.DATABASE_URL = url;
  const env = { ...process.env, DATABASE_URL: url };
  execSync('pnpm prisma migrate deploy', { stdio: 'pipe', env });
  execSync('pnpm tsx prisma/seed.ts', { stdio: 'pipe', env });
}

export async function teardown() {
  await pg?.stop();
  rmSync(dir, { recursive: true, force: true });
}
