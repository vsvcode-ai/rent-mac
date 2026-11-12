import { expect, test } from '@playwright/test';
import { ADMIN_PASSWORD, RECOVERY_CODE, totp } from './helpers';

// 每个管理员账号只在这里走一次真实的「密码 + 动态码」登录，之后的用例复用保存下来的会话。
// （同一个动态码 30 秒内不能重放，这是后端的安全设计）
for (const role of ['support', 'ops', 'admin']) {
  test(`管理员登录（密码 + 两步验证）：${role}`, async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type=email]').fill(`${role}@e2e.test`);
    await page.locator('input[type=password]').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '下一步' }).click();
    // 动态码错误被拒绝
    await page.locator('input[inputmode=numeric]').fill('000000');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.locator('body')).toContainText('动态码不正确');
    await page.locator('input[inputmode=numeric]').fill(totp());
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('body')).toContainText(`E2E ${role}`);
    await page.context().storageState({ path: `e2e/.results/auth-${role}.json` });
  });
}

test('密码错误不能进入第二步', async ({ page }) => {
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill('support@e2e.test');
  await page.locator('input[type=password]').fill('wrong-password-123');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('input[inputmode=numeric]')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('邮箱或密码不正确');
});

test('未登录访问后台会被带到登录页', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('买家登录并保存会话', async ({ page }) => {
  await page.goto('/auth');
  await page.locator('#email').fill('buyer@e2e.test');
  await page.locator('#pwd').fill('Buyer-Passw0rd!');
  await page.getByRole('button', { name: '登录' }).last().click();
  await expect(page).toHaveURL(/\/account|\/$/);
  await page.context().storageState({ path: 'e2e/.results/auth-buyer.json' });
});

// 恢复码登录会消耗掉 admin 账号里唯一的恢复码，所以放在最后单独验证
test('恢复码只能用一次', async ({ page, browser }) => {
  const login = async (p: typeof page) => {
    await p.goto('/admin/login');
    await p.locator('input[type=email]').fill('admin@e2e.test');
    await p.locator('input[type=password]').fill(ADMIN_PASSWORD);
    await p.getByRole('button', { name: '下一步' }).click();
    await p.getByText('手机不在身边？使用恢复码').click();
    await p.locator('input[placeholder="xxxxx-xxxxx"]').fill(RECOVERY_CODE);
    await p.getByRole('button', { name: '登录' }).click();
  };
  await login(page);
  await expect(page).toHaveURL(/\/admin$/);
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await login(p2);
  await expect(p2.locator('body')).toContainText('动态码不正确');
  await ctx2.close();
});
