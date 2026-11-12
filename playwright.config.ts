import { defineConfig } from '@playwright/test';

const API = 'http://localhost:4100';
const WEB = 'http://localhost:3100';

// 端到端：真实浏览器 + 真实后端（内嵌 Postgres）。运行：pnpm test:e2e
// 三个项目按顺序执行并共享同一个库：setup（各角色登录）→ flow（整条业务链路）→ viewports（桌面 / 手机视口与截图）
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: WEB, viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
  outputDir: 'e2e/.results/artifacts',
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/ },
    { name: 'flow', testMatch: /flow\.spec\.ts/, dependencies: ['setup'] },
    { name: 'viewports', testMatch: /viewports\.spec\.ts/, dependencies: ['flow'] },
  ],
  webServer: [
    {
      command:
        'pnpm --filter @nyd/api exec node --import @swc-node/register/esm-register scripts/e2e-server.ts',
      url: `${API}/api/plans`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      // rewrites 在 build 时固化，所以必须带着 API_URL 先 build 再 start
      command: 'pnpm --filter @nyd/web build && pnpm --filter @nyd/web exec next start -p 3100',
      env: { API_URL: API },
      url: WEB,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
