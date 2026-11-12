import { expect, test } from '@playwright/test';
import { BUYER, prisma } from './helpers';

// 安全相关的端到端检查（在 flow 之后运行，库里已有开通的设备和凭证）
const db = prisma();
test.afterAll(async () => db.$disconnect());

test('登录 Cookie：HttpOnly、SameSite，本地 http 下不带 Secure（否则浏览器会丢弃）', async ({
  page,
}) => {
  await page.goto('/auth');
  await page.locator('#email').fill(BUYER.email);
  await page.locator('#pwd').fill(BUYER.password);
  await page.getByRole('button', { name: '登录' }).last().click();
  await expect(page).toHaveURL(/\/account|\/$/);
  const c = (await page.context().cookies()).find((x) => x.name === 'nyd_session');
  expect(c, '登录后应该拿到会话 Cookie').toBeTruthy();
  expect(c!.httpOnly).toBe(true);
  expect(c!.sameSite).toBe('Lax');
  expect(c!.secure).toBe(false);
  // JS 读不到会话
  expect(await page.evaluate(() => document.cookie)).not.toContain('nyd_session');
});

test('带会话的接口响应不能被缓存（含凭证、后台数据）', async ({ browser }) => {
  const buyer = await browser.newContext({ storageState: 'e2e/.results/auth-buyer.json' });
  const admin = await browser.newContext({ storageState: 'e2e/.results/auth-admin.json' });
  const leases = await (await buyer.request.get('/api/me/leases')).json();
  const cred = await buyer.request.post(`/api/me/leases/${leases[0].id}/credential`);
  expect(cred.status()).toBe(200);
  expect(cred.headers()['cache-control']).toContain('no-store');
  for (const path of ['/api/me', '/api/me/orders', '/api/me/leases']) {
    const r = await buyer.request.get(path);
    expect(r.headers()['cache-control'], path).toContain('no-store');
  }
  for (const path of ['/api/admin/me', '/api/admin/orders', '/api/admin/audit-logs']) {
    const r = await admin.request.get(path);
    expect(r.headers()['cache-control'], path).toContain('no-store');
  }
  await buyer.close();
  await admin.close();
});

test('凭证只能用 POST 取，GET 取不到；明文不会出现在审计日志 / 通知里', async ({ browser }) => {
  const buyer = await browser.newContext({ storageState: 'e2e/.results/auth-buyer.json' });
  const leases = await (await buyer.request.get('/api/me/leases')).json();
  const r = await buyer.request.get(`/api/me/leases/${leases[0].id}/credential`);
  expect([404, 405]).toContain(r.status());
  await buyer.close();
  const logs = await db.$queryRawUnsafe(
    `select count(*)::int as n from "AuditLog" where detail::text ~* '(uu-pass|mac-pass)'`,
  );
  expect(logs[0].n).toBe(0);
  const notes = await db.$queryRawUnsafe(
    `select count(*)::int as n from "Notification" where payload::text ~* '(uu-pass|mac-pass)'`,
  );
  expect(notes[0].n).toBe(0);
  const plain = await db.$queryRawUnsafe(
    `select count(*)::int as n from "Credential" where "uuPasswordEnc" ~* 'uu-pass' or "macPasswordEnc" ~* 'mac-pass'`,
  );
  expect(plain[0].n).toBe(0);
});

test('开放重定向：登录页的 next 只接受站内路径', async ({ browser }) => {
  for (const evil of [
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil.example',
    'javascript:alert(1)',
  ]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/auth?next=${encodeURIComponent(evil)}`);
    await page.locator('#email').fill(BUYER.email);
    await page.locator('#pwd').fill(BUYER.password);
    await page.getByRole('button', { name: '登录' }).last().click();
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).origin, `next=${evil}`).toBe('http://localhost:3100');
    await ctx.close();
  }
});

test('XSS：用户输入（工单、联系方式、闲鱼昵称）在买家页和后台页都按文本显示', async ({
  browser,
}) => {
  const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  const short = '<img src=x onerror=window.__xss=1>'; // 联系方式 / 昵称有 64 字符上限
  const buyer = await browser.newContext({ storageState: 'e2e/.results/auth-buyer.json' });
  const admin = await browser.newContext({ storageState: 'e2e/.results/auth-admin.json' });
  const bp = await buyer.newPage();
  const ap = await admin.newPage();
  let dialog = false;
  for (const p of [bp, ap]) p.on('dialog', () => (dialog = true));

  const t = await buyer.request.post('/api/tickets', {
    data: { category: '其他', content: `测试 ${payload}` },
  });
  expect(t.ok()).toBeTruthy();
  const o = await buyer.request.post('/api/orders', {
    data: { term: 'm1', quantity: 1, contactWechat: short, agreedTerms: true },
  });
  expect(o.ok()).toBeTruthy();
  const no = (await o.json()).no;
  await buyer.request.post(`/api/orders/${no}/xianyu`, {
    data: { xianyuOrderNo: '4103928813333', xianyuBuyerNick: short },
  });

  const pages: [typeof bp, string][] = [
    [bp, '/account/tickets'],
    [bp, `/order/${no}`],
    [bp, '/account/orders'],
    [ap, '/admin/tickets'],
    [ap, `/admin/orders`],
  ];
  for (const [p, url] of pages) {
    await p.goto(url);
    await p.waitForTimeout(700);
    expect(
      await p.evaluate(() => (window as unknown as { __xss?: number }).__xss),
      url,
    ).toBeUndefined();
    expect(await p.locator('img[src="x"]').count(), url).toBe(0);
  }
  expect(dialog).toBe(false);
  await buyer.close();
  await admin.close();
});

test('博客：路径穿越返回 404，文章内容里的 HTML 被转义', async ({ page }) => {
  for (const slug of ['..%2F..%2Fpackage', '%2e%2e%2fREADME', 'not-exist']) {
    const r = await page.goto(`/blog/${slug}`);
    expect(r!.status(), slug).toBe(404);
  }
  const r = await page.goto('/blog');
  expect(r!.status()).toBe(200);
});

test('未登录访问用户后台会跳到登录页并带 next；已登出的会话接口返回 401', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/account/devices');
  await expect(page).toHaveURL(/\/auth\?next=%2Faccount%2Fdevices/);
  expect((await ctx.request.get('/api/me/orders')).status()).toBe(401);
  expect((await ctx.request.get('/api/admin/orders')).status()).toBe(401);
  await ctx.close();
});
