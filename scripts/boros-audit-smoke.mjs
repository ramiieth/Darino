/** Isolated Boros QA. Synthetic data, no wallet, keys, exchange or signed requests. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome' });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: process.env.TOUCH_QA === '1', isMobile: process.env.TOUCH_QA === '1' });
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/*', route => {
  const u = new URL(route.request().url());
  if (u.origin !== base) return route.abort();
  if (u.pathname.includes('-api') || u.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  return route.continue();
 });
 await page.goto(base);
 await page.evaluate(async () => {
  const React = (await import('/node_modules/.vite/deps/react.js')).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const { default: BorosDashboard } = await import('/src/features/boros/presentation/BorosDashboard.tsx');
  const transformed = await (await fetch('/src/features/boros/presentation/BorosDashboard.tsx')).text();
  const storePath = transformed.match(/from ["']([^"']*\/useBoros\.ts[^"']*)["']/)?.[1];
  if (!storePath) throw new Error('Boros store import missing');
  const { useBorosStore } = await import(storePath);
  const { mapMarket } = await import('/src/features/boros/data/borosService.ts');
  const { borosRaw } = await import('/tests/fixtures/boros.ts');
  const now = Math.floor(Date.now() / 1000);
  const m = { ...mapMarket(borosRaw, Date.now()), maturity: now + 19 * 86400, markApr: .08, floatingApr: .1, collateralSymbol: 'ETH', collateralPriceUsd: 3000, assetMarkPrice: 3000, status: 'GOOD', fundingHistory: Array.from({ length: 30 }, (_, i) => ({ ts: now - (30 - i) * 86400, c: .06 + i * .002 })), ohlcv: Array.from({ length: 30 }, (_, i) => ({ ts: now - (30 - i) * 86400, c: .08 + i * .001 })) };
  useBorosStore.setState({ markets: [m, { ...m, marketId: m.marketId + 1, venue: 'Binance' }], loadedAt: Date.now(), loading: true });
  const host = document.createElement('div');
  host.id = 'boros-qa'; host.dir = 'rtl'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgb(var(--c-canvas));padding:20px;overflow:auto';
  document.body.append(host); createRoot(host).render(React.createElement(BorosDashboard));
 });
 const host = page.locator('#boros-qa');
 await host.getByRole('heading', { name: 'تحلیل بوروس', exact: true }).waitFor({ timeout: 8000 }).catch(async e => { console.log(JSON.stringify({ errors, text: await page.locator('body').innerText() })); throw e; });

 {
  for (const theme of ['light', 'dark']) {
   await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
   for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['فرصت‌ها', 'مقایسه', 'شبیه‌ساز', 'مانیتور ریسک', 'بررسی محاسبات']) {
     await host.getByRole('tab', { name: tab, exact: true }).click();
     const fit = await host.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
     if (fit.scroll > fit.client + 1) { console.log(JSON.stringify(await host.evaluate(el => [...el.querySelectorAll('*')].filter(x => {const r=x.getBoundingClientRect();return r.right>innerWidth+1 || r.left< -1}).slice(0,18).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,70),width:x.getBoundingClientRect().width,left:x.getBoundingClientRect().left})) )));await page.screenshot({path:'/tmp/darino-boros-overflow.png'}); }
     assert(fit.scroll <= fit.client + 1, `horizontal page overflow: ${tab}, ${width}, ${theme}`);
    }
   }
  }
 }
 await page.setViewportSize({ width: 390, height: 844 });
 await host.getByRole('tab', { name: 'شبیه‌ساز', exact: true }).click();
 await host.getByRole('radio', { name: 'تحلیل ورود', exact: true }).click();
 const quantity = host.getByLabel('حجم واحد بازده', { exact: true });
 await quantity.fill(''); await quantity.pressSequentially('0.65', { delay: 40 });
 await page.waitForTimeout(100);
 assert.equal(await quantity.inputValue(), '0.65');
 await quantity.fill('۰٫۶۵'); assert.equal(await quantity.inputValue(), '0.65');
 await host.getByLabel('وثیقه موجود', { exact: true }).fill('۰٫۱');
 assert.equal(await host.getByLabel('وثیقه موجود', { exact: true }).inputValue(), '0.1');
 await host.getByLabel('مجموع کارمزدها', { exact: true }).fill('۰٫۲');
 await host.getByLabel('هزینه لغزش', { exact: true }).fill('۰٫۱');
 await host.getByLabel('گس', { exact: true }).fill('۰٫۰۵');
 assert((await host.innerText()).includes('نرخ ضمنی لیکوییدشدن'));
 assert((await host.innerText()).includes('سناریوی بدبینانه'));
 assert((await host.innerText()).includes('تسویه تا سررسید (فرض نرخ ثابت)'));
 assert(!(await host.innerText()).includes('سود تسویه‌شده'));
 const formulas = await host.innerText();
 assert(!formulas.includes('NaN') && !formulas.includes('Infinity'));
 for (const width of [320, 390, 1440]) {
  await page.setViewportSize({ width, height: 844 });
  const fit = await host.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  assert(fit.scroll <= fit.client + 1, `entry analysis overflow: ${width}`);
 }
 await host.getByRole('button', { name: 'محاسبه حجم با سرمایه', exact: true }).click();
 assert(Number(await quantity.inputValue()) > 0);
 await host.getByRole('radio', { name: 'شورت', exact: true }).click();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: '/tmp/darino-boros-preview-mobile.png' });
 assert.deepEqual(errors, []);
 console.log('PASS: 5 Boros tabs at 320/390/1440px in light/dark; decimal typing, native collateral units, manual entry costs, allocated YU size and forecast labels. PWA layout uses the same responsive surfaces; installation is not tested.');
} finally { await browser.close(); }
