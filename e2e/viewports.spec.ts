import { devices, expect, test, type BrowserContextOptions, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma } from './helpers';

// 桌面 1280 与 iPhone 13 两个视口：关键页面不能横向溢出、关键按钮可点；并把截图与原型同视口截图一起存到 e2e/screenshots/ 供人工对比。
// defaultBrowserType 不能传给 newContext
const iphone: BrowserContextOptions = { ...devices['iPhone 13'] };
delete (iphone as Record<string, unknown>).defaultBrowserType;
const VIEWPORTS: Record<string, BrowserContextOptions> = {
  desktop: { viewport: { width: 1280, height: 800 } },
  mobile: iphone,
};

const SHOT = 'e2e/screenshots';
const proto = (f: string) => pathToFileURL(resolve(process.cwd(), 'prototype', f)).href;

/** 手机模拟下 window.innerWidth 会随内容变宽（布局视口扩展），所以必须拿设备真实宽度（viewportSize）来比较 */
async function noHScroll(p: Page, label: string) {
  const vw = p.viewportSize()!.width;
  const over = await p.evaluate(() => {
    const wide: string[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth + 1 && r.width > 0 && wide.length < 5) {
        wide.push(
          `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)}(${Math.round(r.right)})`,
        );
      }
    });
    return { sw: document.documentElement.scrollWidth, wide };
  });
  expect(
    over.sw,
    `${label} 横向溢出：scrollWidth ${over.sw} > ${vw}；超出的元素：${over.wide.join(', ')}`,
  ).toBeLessThanOrEqual(vw + 1);
}

const db = prisma();
test.afterAll(async () => db.$disconnect());

for (const [vp, opts] of Object.entries(VIEWPORTS)) {
  test.describe(`视口：${vp}`, () => {
    test(`${vp}：前台首页与套餐区`, async ({ browser }) => {
      const ctx = await browser.newContext(opts);
      const p = await ctx.newPage();
      await p.goto('/');
      await p.waitForTimeout(1800); // 等入场动画跑完
      await noHScroll(p, '首页');
      await p.screenshot({ path: `${SHOT}/${vp}-home.png` });
      await p.locator('#pricing').scrollIntoViewIfNeeded();
      await p.waitForTimeout(900);
      await expect(p.getByRole('link', { name: /立即租用/ }).last()).toBeVisible();
      await p.locator('#pricing').screenshot({ path: `${SHOT}/${vp}-pricing.png` });
      await ctx.close();

      const pc = await browser.newContext(opts);
      const pp = await pc.newPage();
      await pp.goto(proto('index.html'));
      await pp.waitForTimeout(2200);
      await pp.screenshot({ path: `${SHOT}/proto-${vp}-home.png` });
      await pp.locator('#pricing').scrollIntoViewIfNeeded();
      await pp.waitForTimeout(900);
      await pp.locator('#pricing').screenshot({ path: `${SHOT}/proto-${vp}-pricing.png` });
      await pc.close();
    });

    test(`${vp}：付款页与用户设备页`, async ({ browser }) => {
      const ctx = await browser.newContext({
        ...opts,
        storageState: 'e2e/.results/auth-buyer.json',
      });
      const p = await ctx.newPage();
      const o = await db.order.findFirst({ where: { status: 'active', kind: 'new', quantity: 2 } });
      await p.goto(`/order/${o.no}`);
      await p.waitForTimeout(800);
      await noHScroll(p, '付款页');
      await p.screenshot({ path: `${SHOT}/${vp}-pay.png`, fullPage: true });
      await p.goto('/account/devices');
      await expect(p.locator('.dev').first()).toBeVisible();
      await p.waitForTimeout(800); // 等页面淡入完成再截图
      await noHScroll(p, '设备页');
      await p.screenshot({ path: `${SHOT}/${vp}-devices.png`, fullPage: true });
      await expect(p.locator('.dev').first().getByRole('button', { name: '显示' })).toBeVisible();
      await p.goto('/account');
      await expect(p.locator('.side a').first()).toBeVisible(); // 导航在登录态加载后才渲染
      await noHScroll(p, '账户概览');
      // 手机上账户导航是一行标签，邮箱不显示；通知铃铛仍然能打开并且不被裁掉
      if (vp === 'mobile') {
        await expect(p.locator('.side .me-id')).toBeHidden();
        await expect(p.locator('.side a').first()).toBeVisible();
      }
      await p.locator('.side .me button').first().click();
      const pop = p.locator('.bell-pop');
      await expect(pop).toContainText('已开通');
      const box = await pop.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual((p.viewportSize()?.width ?? 1280) + 1);
      await p.keyboard.press('Escape');
      await p.goto('/account/orders');
      await expect(p.locator('.side a').first()).toBeVisible();
      await noHScroll(p, '订单列表');
      await ctx.close();

      // 原型对应页面
      const pc = await browser.newContext(opts);
      const pp = await pc.newPage();
      await pp.goto(proto('index.html'));
      await pp.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('nyd_state_v1') ?? '{}');
        s.user = { email: 'wang@example.com', wechat: '', telegram: '' };
        localStorage.setItem('nyd_state_v1', JSON.stringify(s));
      });
      await pp.goto(`${proto('pay.html')}?no=NY2611090003`);
      await pp.waitForTimeout(800);
      await pp.screenshot({ path: `${SHOT}/proto-${vp}-pay.png`, fullPage: true });
      await pp.goto(proto('account.html'));
      await pp.waitForTimeout(800);
      await pp.screenshot({ path: `${SHOT}/proto-${vp}-account.png`, fullPage: true });
      await pc.close();
    });

    test(`${vp}：其余页面不横向溢出`, async ({ browser }) => {
      const ctx = await browser.newContext({
        ...opts,
        storageState: 'e2e/.results/auth-buyer.json',
      });
      const p = await ctx.newPage();
      const urls = [
        '/help',
        '/refund',
        '/terms',
        '/privacy',
        '/aup',
        '/consult',
        '/blog',
        '/auth',
        '/order/new',
        '/account/tickets',
        '/account/settings',
      ];
      for (const u of urls) {
        await p.goto(u);
        await p.waitForTimeout(700);
        await noHScroll(p, u);
      }
      await ctx.close();
    });

    test(`${vp}：管理后台订单页与看板`, async ({ browser }) => {
      const ctx = await browser.newContext({
        ...opts,
        storageState: 'e2e/.results/auth-admin.json',
      });
      const p = await ctx.newPage();
      await p.goto('/admin');
      await expect(p.locator('.kpi').first()).toBeVisible();
      await p.waitForTimeout(600);
      await noHScroll(p, '后台看板');
      await p.screenshot({ path: `${SHOT}/${vp}-admin-dashboard.png`, fullPage: true });
      await p.goto('/admin/orders');
      await expect(p.locator('tbody tr').first()).toBeVisible();
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${SHOT}/${vp}-admin-orders.png`, fullPage: true });
      await ctx.close();

      const pc = await browser.newContext(opts);
      const pp = await pc.newPage();
      await pp.goto(proto('admin.html'));
      await pp.waitForTimeout(800);
      await pp.screenshot({ path: `${SHOT}/proto-${vp}-admin-dashboard.png`, fullPage: true });
      await pp.goto(`${proto('admin.html')}#orders`);
      await pp.waitForTimeout(500);
      await pp.screenshot({ path: `${SHOT}/proto-${vp}-admin-orders.png`, fullPage: true });
      await pc.close();
    });
  });
}
