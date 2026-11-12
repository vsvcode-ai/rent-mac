import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { stepOf, totpAt } from '../apps/api/src/admin/totp';

export const BUYER = { email: 'buyer@e2e.test', password: 'Buyer-Passw0rd!' };
export const ADMIN_PASSWORD = 'Admin-Passw0rd!!';
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const RECOVERY_CODE = 'abcde-12345';
export const DB_URL = 'postgresql://nyd:nyd@localhost:54330/nyd_e2e';

/** 直接读库，用来核对界面之外的后端状态（凭证查看记录等） */
export function prisma() {
  const req = createRequire(resolve(process.cwd(), 'apps/api/package.json'));
  const { PrismaClient } = req('@prisma/client');
  return new PrismaClient({ datasources: { db: { url: DB_URL } } });
}

export const totp = () => totpAt(TOTP_SECRET, stepOf(new Date()));

/** 管理员登录（每个管理员账号只能登录一次：同一步长的动态码不能重放） */
export async function adminLogin(
  browser: Browser,
  role: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill(`${role}@e2e.test`);
  await page.locator('input[type=password]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('input[inputmode=numeric]').fill(totp());
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return { ctx, page };
}

export async function buyerLogin(page: Page, next = '/account') {
  await page.goto(`/auth?next=${encodeURIComponent(next)}`);
  await page.locator('#email').fill(BUYER.email);
  await page.locator('#pwd').fill(BUYER.password);
  await page.getByRole('button', { name: /^登录$/ }).last().click();
}
