import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { prisma } from './helpers';

// 整条业务链路：买家下单 → 客服核对 → 运维开通 → 买家取凭证 → 续费 → 工单 → 退款 / 回收 → 权限 → 设置与审计。
// 共享一个库，按顺序执行；每个用例依赖前面用例产生的数据。
test.describe.configure({ mode: 'serial' });

const AUTH = (r: string) => `e2e/.results/auth-${r}.json`;
const ctxs: Record<string, BrowserContext> = {};
const pages: Record<string, Page> = {};
const st: {
  no?: string;
  renewNo?: string;
  leaseId?: string;
  endBefore?: string;
  refundNo?: string;
  idleBefore?: number;
} = {};

async function as(browser: Browser, role: 'buyer' | 'support' | 'ops' | 'admin'): Promise<Page> {
  if (!pages[role]) {
    ctxs[role] = await browser.newContext({
      storageState: AUTH(role),
      viewport: { width: 1280, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    pages[role] = await ctxs[role]!.newPage();
  }
  return pages[role]!;
}

const db = prisma();
test.afterAll(async () => {
  await db.$disconnect();
  for (const c of Object.values(ctxs)) await c.close();
});

async function searchOrder(p: Page, no: string) {
  await p.goto('/admin/orders');
  await p.locator('input[placeholder="订单号 / 邮箱 / 闲鱼单号"]').fill(no);
  const row = p.locator('tr', { hasText: no });
  await expect(row).toHaveCount(1);
  return row;
}

async function verifyInAdmin(p: Page, no: string, amount: string) {
  const row = await searchOrder(p, no);
  await row.getByRole('button', { name: '核对收款' }).click();
  const modal = p.locator('.modal');
  await modal.locator('input[inputmode=decimal]').fill(amount);
  await modal.getByText('已核对金额与闲鱼一致').click();
  await modal.getByText(/已核对闲鱼拍下数量/).click();
  return modal;
}

test('1 首页：价格来自接口，选半年付 × 2 台，总价 ¥7,188，立即租用 → 登录页带 next，登录后回到下单页', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mac mini');
  await expect(page.locator('.term.on')).toContainText('¥499');
  await expect(page.locator('.term[data-term=m6]')).toContainText('¥599');
  await page.locator('.term[data-term=m6]').click();
  await page.getByRole('button', { name: '增加' }).click();
  await expect(page.locator('.summary .total strong')).toContainText('7,188');
  await expect(page.locator('.summary')).toContainText('含 1 对 1 专属客服');
  await page
    .getByRole('link', { name: /立即租用/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/auth\?next=%2Forder%2Fnew/);
  await page.locator('#email').fill('buyer@e2e.test');
  await page.locator('#pwd').fill('Buyer-Passw0rd!');
  await page.getByRole('button', { name: '登录' }).last().click();
  await expect(page).toHaveURL(/\/order\/new$/);
  // 登录后选择仍然保留
  await expect(page.locator('body')).toContainText('半年付');
  await expect(page.locator('body')).toContainText('7,188');
  await ctx.storageState({ path: AUTH('buyer') });
  await ctx.close();
});

test('2 下单：联系方式 + 条款 → 付款页 → 填闲鱼订单号（短单号被拦）→ 待核对', async ({
  browser,
}) => {
  const page = await as(browser, 'buyer');
  // 选择保存在 sessionStorage，新页面上下文里重新选一次：已登录时「立即租用」直接进入下单页
  await page.goto('/');
  await page.locator('.term[data-term=m6]').click();
  await page.getByRole('button', { name: '增加' }).click();
  await page
    .getByRole('link', { name: /立即租用/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/order\/new$/);
  await expect(page.locator('body')).toContainText('7,188');
  // 没填联系方式 / 没勾选条款不能提交
  await page.getByRole('button', { name: '提交订单，去闲鱼付款' }).click();
  await expect(page).toHaveURL(/\/order\/new$/);
  await page.locator('#wechat').fill('e2e_wx');
  await page.locator('label.check input[type=checkbox]').check();
  await page.getByRole('button', { name: '提交订单，去闲鱼付款' }).click();
  await expect(page).toHaveURL(/\/order\/NY\d{10}$/);
  st.no = page.url().split('/').pop()!;
  await expect(page.locator('body')).toContainText(st.no);
  await expect(page.locator('a[href*="goofish.com"]').first()).toHaveAttribute('href', /E2E-m6/);
  await page.getByRole('button', { name: '复制', exact: true }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(st.no);

  await page.locator('#xyno').fill('123');
  await page.locator('#xynick').fill('阿旺');
  await page.getByRole('button', { name: '我已付款，提交核对' }).click();
  await expect(page.locator('.field.bad, .errmsg').first()).toBeVisible();
  await page.locator('#xyno').fill('4103928811027');
  await page.getByRole('button', { name: '我已付款，提交核对' }).click();
  await expect(page.locator('body')).toContainText('客服正在核对你的付款');
});

test('3 客服核对收款：金额写错被拦住，写对后通过；买家刷新看到进度', async ({ browser }) => {
  const p = await as(browser, 'support');
  const modal = await verifyInAdmin(p, st.no!, '7000');
  await expect(modal.locator('.match.bad')).toBeVisible();
  await expect(modal.getByRole('button', { name: '确认收款' })).toBeDisabled();
  await modal.locator('input[inputmode=decimal]').fill('7188');
  await expect(modal.locator('.match.ok')).toBeVisible();
  await modal.getByRole('button', { name: '确认收款' }).click();
  await expect(p.locator('tr', { hasText: st.no! })).toContainText('待开通');

  const buyer = await as(browser, 'buyer');
  await buyer.goto(`/order/${st.no}`);
  await expect(buyer.locator('body')).toContainText('已确认收款，正在排队开通');
});

test('4 运维开通：批量粘贴表格分配 2 台机器', async ({ browser }) => {
  const p = await as(browser, 'ops');
  await p.goto('/admin/provision');
  const card = p.locator('.q-card', { hasText: st.no! });
  await expect(card).toHaveCount(1);
  st.idleBefore = (await (await p.request.get('/api/plans')).json()).available;
  await card.getByRole('button', { name: '分配开通' }).click();
  const modal = p.locator('.modal');
  await modal.locator('summary').click();
  await modal
    .locator('textarea')
    .fill(
      [
        'NYD-MY-0001\t583920174\tuu-pass-1\tnydesk\tmac-pass-1',
        'NYD-MY-0002,583920175,uu-pass-2,nydesk,mac-pass-2',
      ].join('\n'),
    );
  await modal.getByRole('button', { name: '解析并填入' }).click();
  await expect(modal.locator('input.input.mono').first()).toHaveValue('583920174');
  // 没勾选检查项不能提交
  await expect(modal.getByRole('button', { name: '完成开通并通知用户' })).toBeDisabled();
  await modal.getByText('已重置并更换密码').click();
  await modal.getByText('已在机器上登录 UU 远程并测试可连').click();
  await modal.getByRole('button', { name: '完成开通并通知用户' }).click();
  await expect(p.locator('.q-card', { hasText: st.no! })).toHaveCount(0);
  const o = await db.order.findUnique({ where: { no: st.no } });
  expect(o.status).toBe('active');
});

test('5 买家：设备页 2 台，连接信息默认隐藏，显示后明文可复制，后端留查看记录，铃铛有「已开通」', async ({
  browser,
}) => {
  const p = await as(browser, 'buyer');
  await p.goto('/account/devices');
  const cards = p.locator('.dev');
  await expect(cards).toHaveCount(2);
  const first = cards.first();
  await expect(first.locator('.cred-row code').first()).not.toContainText('583920174');
  const before = await db.credentialView.count();
  await first.getByRole('button', { name: '显示' }).click();
  await expect(first.locator('.cred-row code').nth(0)).toHaveText('583920174');
  await expect(first.locator('.cred-row code').nth(1)).toHaveText('uu-pass-1');
  await first.locator('.cred-row').nth(1).getByRole('button', { name: '复制' }).click();
  expect(await p.evaluate(() => navigator.clipboard.readText())).toBe('uu-pass-1');
  expect(await db.credentialView.count()).toBe(before + 1);
  // 凭证明文不能出现在 URL 里
  expect(p.url()).not.toContain('uu-pass');
  await first.getByRole('button', { name: '隐藏' }).click();
  await expect(first.locator('.cred-row code').nth(1)).not.toHaveText('uu-pass-1');
  // 铃铛
  await p.locator('.bell, [aria-label*="通知"]').first().click();
  await expect(p.locator('body')).toContainText('已开通');
  const r = await (await p.request.get('/api/me/leases')).json();
  st.leaseId = r[0].id;
  st.endBefore = r.find((l: { id: string }) => l.id === st.leaseId).endAt;
});

test('6 续费：设备页续费 → 续费单 → 填闲鱼单号；客服核对后到期时间自动延长一个月', async ({
  browser,
}) => {
  const p = await as(browser, 'buyer');
  await p.goto('/account/devices');
  await p.locator('.dev').first().getByRole('link', { name: '续费' }).click();
  await expect(p).toHaveURL(/\/account\/renew\?lease=/);
  await p.locator('label.term', { hasText: '月付' }).click();
  await p.locator('label.check input[type=checkbox]').check();
  await p.getByRole('button', { name: '生成续费订单' }).click();
  await expect(p).toHaveURL(/\/order\/NY\d{10}$/);
  st.renewNo = p.url().split('/').pop()!;
  await p.locator('#xyno').fill('4103928811999');
  await p.locator('#xynick').fill('阿旺');
  await p.getByRole('button', { name: '我已付款，提交核对' }).click();
  await expect(p.locator('body')).toContainText('客服正在核对你的付款');

  const s = await as(browser, 'support');
  const modal = await verifyInAdmin(s, st.renewNo!, '799');
  await expect(modal).toContainText('续费');
  await modal.getByRole('button', { name: '确认收款' }).click();
  await expect(s.locator('tr', { hasText: st.renewNo! })).toContainText('已续费');

  const leases = await (await p.request.get('/api/me/leases')).json();
  const after = leases.find((l: { id: string }) => l.id === st.leaseId).endAt;
  const b = new Date(st.endBefore!);
  const a = new Date(after);
  expect((a.getUTCFullYear() - b.getUTCFullYear()) * 12 + a.getUTCMonth() - b.getUTCMonth()).toBe(
    1,
  );
  await p.goto(`/order/${st.renewNo}`);
  await expect(p.locator('body')).toContainText('已续费，到期时间已延长');
});

test('7 工单：买家提交 → 运维回复（对用户可见）→ 买家看到回复', async ({ browser }) => {
  const p = await as(browser, 'buyer');
  await p.goto('/account/tickets');
  await p.getByRole('button', { name: '提交工单' }).first().click();
  const modal = p.locator('.modal');
  await modal.locator('select').first().selectOption('无法连接');
  await modal.locator('select').nth(1).selectOption({ index: 1 });
  await modal.locator('textarea').fill('UU 远程提示设备离线，已重启过一次。');
  await modal.getByRole('button', { name: '提交工单' }).click();
  await expect(p.locator('tbody')).toContainText('UU 远程提示设备离线');

  const o = await as(browser, 'ops');
  await o.goto('/admin/tickets');
  const row = o.locator('tr', { hasText: 'UU 远程提示设备离线' });
  await row.getByRole('button', { name: '处理' }).click();
  const m = o.locator('.modal');
  await m.locator('textarea').fill('请在设备上重新登录 UU 远程，我们已检查网络正常。');
  // 默认可能是「仅内部可见」，必须取消勾选才对用户可见
  const internal = m.locator('label', { hasText: '仅内部可见' }).locator('input');
  if (await internal.isChecked()) await internal.uncheck();
  await m.getByRole('button', { name: '提交' }).last().click();
  await expect(o.locator('body')).toContainText('已回复，用户会收到站内通知');

  await p.goto('/account/tickets');
  await p
    .locator('tr', { hasText: 'UU 远程提示设备离线' })
    .getByRole('button', { name: /详情/ })
    .click();
  await expect(p.locator('body')).toContainText('请在设备上重新登录 UU 远程');
});

test('8 退款与回收：管理员退款预览 → 完成退款；运维回收三项检查 → 机器回到空闲、库存恢复', async ({
  browser,
}) => {
  // 先造第二个订单（API 快速走到「使用中」），再用界面退款
  const buyer = await as(browser, 'buyer');
  const support = await as(browser, 'support');
  const ops = await as(browser, 'ops');
  const stock = async () =>
    (await (await buyer.request.get('/api/plans')).json()).available as number;
  const stockBefore = await stock();
  const created = await buyer.request.post('/api/orders', {
    data: { term: 'm3', quantity: 1, contactWechat: 'wx', agreedTerms: true },
  });
  expect(created.ok()).toBeTruthy();
  st.refundNo = (await created.json()).no;
  expect(
    (
      await buyer.request.post(`/api/orders/${st.refundNo}/xianyu`, {
        data: { xianyuOrderNo: '4103928812000', xianyuBuyerNick: 'r' },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await support.request.post(`/api/admin/orders/${st.refundNo}/verify`, {
        data: { paidCents: 209700, confirmedAmount: true, confirmedQuantity: true },
      })
    ).ok(),
  ).toBeTruthy();
  const idle = await (await ops.request.get('/api/admin/devices/idle')).json();
  const dev = idle[0];
  expect(
    (
      await ops.request.post(`/api/admin/orders/${st.refundNo}/activate`, {
        data: {
          devices: [
            {
              deviceId: dev.id,
              uuDeviceCode: '999',
              uuPassword: 'a',
              macUsername: 'u',
              macPassword: 'b',
            },
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();

  const admin = await as(browser, 'admin');
  const row = await searchOrder(admin, st.refundNo!);
  await row.getByRole('button', { name: '详情' }).click();
  await admin.locator('.modal').getByRole('button', { name: '退款' }).click();
  const m = admin.locator('.modal').last();
  await expect(m).toContainText('建议');
  await m.locator('textarea').fill('用户申请退款');
  await m.locator('input.mono').fill('4103928812001');
  await m
    .getByRole('button', { name: /确认退款|提交|登记|完成/ })
    .last()
    .click();
  await expect(admin.locator('.toast.on')).toContainText('已退款');
  const o = await db.order.findUnique({ where: { no: st.refundNo } });
  expect(o.status).toBe('refunded');

  await ops.goto('/admin/recycle');
  const card = ops.locator('.q-card', { hasText: dev.code });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('button', { name: '完成回收' })).toBeDisabled();
  await card.getByText('抹盘并重装系统').click();
  await card.getByText('重置 UU 远程').click();
  await card.getByText('更换 macOS 密码').click();
  await card.getByRole('button', { name: '完成回收' }).click();
  await expect(ops.locator('.q-card', { hasText: dev.code })).toHaveCount(0);
  const d = await db.device.findUnique({ where: { id: dev.id } });
  expect(d.status).toBe('idle');
  expect(await db.credential.count({ where: { uuDeviceCode: '999' } })).toBe(0);
  expect(await stock()).toBe(stockBefore);
});

test('9 权限：客服看不到开通入口，直接访问开通队列有明确提示', async ({ browser }) => {
  const p = await as(browser, 'support');
  await p.goto('/admin');
  await expect(p.locator('a[href="/admin/provision"]')).toHaveCount(0);
  await expect(p.locator('a[href="/admin/orders"]').first()).toBeVisible();
  await p.goto('/admin/provision');
  await expect(p.locator('body')).toContainText('没有权限');
  const r = await p.request.get('/api/admin/provision/queue');
  expect(r.status()).toBe(403);
  // 管理端接口不能被缓存
  expect(r.headers()['cache-control']).toContain('no-store');
});

test('10 设置：改价后出现「同步闲鱼」提示；重置他人两步验证；审计日志有记录', async ({
  browser,
}) => {
  const p = await as(browser, 'admin');
  await p.goto('/admin/settings');
  const priceInput = p.locator('.set-row', { hasText: '月付（1 个月）' }).locator('input').first();
  await priceInput.fill('809');
  await p.getByRole('button', { name: '保存设置' }).click();
  await expect(p.locator('body')).toContainText('请同步修改闲鱼商品价格');
  await p.getByRole('button', { name: '知道了' }).click();
  // 还原价格（还原也是一次改价，同样会提示）
  await priceInput.fill('799');
  await p.getByRole('button', { name: '保存设置' }).click();
  await p.getByRole('button', { name: '知道了' }).click();
  await expect(p.locator('.modal-bg.on')).toHaveCount(0);

  p.once('dialog', (d) => void d.accept());
  await p
    .locator('tr', { hasText: 'victim@e2e.test' })
    .getByRole('button', { name: '重置两步验证' })
    .click();
  await expect(p.locator('body')).toContainText('已重置');
  await p.reload();
  await expect(p.locator('body')).toContainText('admin.totp.reset');
  await expect(p.locator('body')).toContainText('settings.update');
  const v = await db.adminUser.findUnique({ where: { email: 'victim@e2e.test' } });
  expect(v.totpEnabledAt).toBeNull();
});
