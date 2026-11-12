// 没有 Docker 时的本地开发数据库：pnpm --filter @nyd/api dev:db
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '.pgdata');
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'nyd',
  password: 'nyd',
  port: Number(process.env.PG_PORT ?? 5432),
  persistent: true,
});
async function main() {
  if (!existsSync(dir)) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('nyd');
  } catch {
    /* 已存在 */
  }
  console.log('Postgres ready on port', process.env.PG_PORT ?? 5432);
}

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

main();
