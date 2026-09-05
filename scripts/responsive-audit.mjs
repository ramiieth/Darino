#!/usr/bin/env node
/**
 * DARINO — Responsive / PWA Audit (Playwright)
 *
 * اجرای محلی (پس از `npm run dev` روی http://localhost:5173 یا `npm run preview`):
 *
 *   node scripts/responsive-audit.mjs [baseUrl]
 *
 * خروجی:
 *  1) بررسی اسکرول افقی Body در هر صفحه × هر Viewport:
 *        document.documentElement.scrollWidth <= innerWidth
 *  2) بررسی خارج‌شدن عناصر مهم از Viewport (Button / Input / Table container / Modal / Header)
 *  3) Screenshot هر صفحه در هر Viewport → ./responsive-screenshots/
 *
 * نکته: این اسکریپت جزو `npm test` نیست (نیاز به مرورگر واقعی دارد) —
 * ابزار ممیزی بصری طبق بخش ۴۶/۴۷ مأموریت.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';

/** مسیرهای اصلی اپ (همه مقصدهای ناوبری موجود) */
const ROUTES = [
  ['market', '/#/'],
  ['dashboard', '/#/dashboard'],
  ['simulation', '/#/simulation'],
  ['defi', '/#/defi'],
  ['pendle', '/#/pendle'],
  ['calculators', '/#/calculators'],
  ['accounting', '/#/accounting'],
  ['boros', '/#/boros'],
  ['vehicle', '/#/vehicle'],
  ['realestate', '/#/realestate'],
  ['defi-loop', '/#/defi-loop']
];

/** Viewportهای الزامی (Portrait + Landscape + Desktop) */
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024-landscape', width: 1024, height: 768 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 }
];

const OUT = join(process.cwd(), 'responsive-screenshots');
mkdirSync(OUT, { recursive: true });

/** بررسی اسکرول افقی + عناصر خارج از Viewport */
async function auditPage(page, routeName, vp) {
  const issues = [];

  // ۱) Horizontal body overflow
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      scrollWidth: de.scrollWidth,
      innerWidth: window.innerWidth
    };
  });
  if (overflow.scrollWidth > overflow.innerWidth) {
    issues.push(
      `HORIZONTAL OVERFLOW: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`
    );
  }

  // ۲) عناصر تعاملی/مهم خارج از Viewport
  const outOfBounds = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    const sel = [
      'button',
      'input',
      'select',
      '[role="dialog"]',
      'header',
      'table',
      'nav'
    ].join(', ');
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      // عناصر مخفی (display:none / inert hidden) را نادیده بگیر
      if (r.width === 0 && r.height === 0) continue;
      if (el.offsetParent === null && el.getComputedStyle(el).position !== 'fixed') continue;
      if (r.right > vw + 1 || r.left < -1) {
        const tag = el.tagName.toLowerCase();
        const cls = (el.className ?? '').toString().slice(0, 60);
        bad.push(`${tag}.${cls} right=${Math.round(r.right)} left=${Math.round(r.left)}`);
      }
    }
    return bad.slice(0, 8);
  });
  for (const b of outOfBounds) issues.push(`OUT OF VIEWPORT: ${b}`);

  return issues;
}

const browser = await chromium.launch();
let failed = 0;
let checked = 0;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.width < 768,
    hasTouch: vp.width < 768
  });
  const page = await context.newPage();

  for (const [name, path] of ROUTES) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(1200); // استتبل شدن داده/رندر

      const issues = await auditPage(page, name, vp);
      checked++;

      const shot = join(OUT, `${vp.name}-${name}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      if (issues.length > 0) {
        failed++;
        console.log(`✗ [${vp.name}] ${name}`);
        for (const i of issues) console.log(`    ${i}`);
      } else {
        console.log(`✓ [${vp.name}] ${name}`);
      }
    } catch (err) {
      failed++;
      console.log(`✗ [${vp.name}] ${name} — ERROR: ${String(err).split('\n')[0]}`);
    }
  }

  // بررسی Modal (شیت «بیشتر» نوار پایین) در موبایل
  if (vp.width < 1024) {
    try {
      await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(600);
      const more = page.locator('nav[aria-label="ناوبری پایین"] >> text=بیشتر').first();
      if (await more.count()) {
        await more.click();
        await page.waitForTimeout(400);
        const modalOk = await page.evaluate(() => {
          const m = document.querySelector('[role="dialog"]');
          if (!m) return { ok: true, why: 'no modal' };
          const r = m.getBoundingClientRect();
          return {
            ok: r.right <= window.innerWidth + 1 && r.left >= -1,
            why: `right=${Math.round(r.right)} left=${Math.round(r.left)}`
          };
        });
        checked++;
        if (!modalOk.ok) {
          failed++;
          console.log(`✗ [${vp.name}] bottom-sheet modal — ${modalOk.why}`);
        } else {
          console.log(`✓ [${vp.name}] bottom-sheet modal`);
        }
        await page.keyboard.press('Escape');
      }
    } catch {
      /* بدون modal — نادیده */
    }
  }

  await context.close();
}

await browser.close();

console.log(`\n=== Responsive Audit ===`);
console.log(`Checked: ${checked} | Failed: ${failed}`);
console.log(`Screenshots: ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
