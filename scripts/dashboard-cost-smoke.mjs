/** Isolated native dashboard cost-basis QA; synthetic data, no provider/key calls. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome' });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== base) return route.abort(); if (u.pathname.startsWith('/api/') || u.pathname.includes('-api')) return route.fulfill({ status: 503, body: '{}' }); return route.continue(); });
 await page.goto(base);
 await page.evaluate(async () => {
  const React = (await import('/node_modules/.vite/deps/react.js')).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const source = await (await fetch('/src/features/cost-basis/presentation/CostSummaryPanel.tsx')).text();
  const routerPath = source.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1];
  const { MemoryRouter } = await import(routerPath);
  const { CostSummaryPanel } = await import('/src/features/cost-basis/presentation/CostSummaryPanel.tsx');
  const { savePref } = await import('/src/features/custody/data/repository.ts');
  const asset = { key: 'fungible:ethereum', tokenId: 'ethereum', symbol: 'ETH', name: 'اتریوم', chain: 'ethereum', contract: null, icon: '/logos/token-eth.svg' };
  const book = { version: 1, asOf: Date.now(), migrationConfirmed: true, legacyRetired: true, lots: [{ id: 'buy', asset, quantity: '.65', unitCost: '2500', fee: '0', at: Date.now()-86400000, source: 'user-confirmed' }] };
  await savePref('cost-basis-v1', book);
  const position = { ...asset, id: 'eth', quantity: '.65', price: 3000, value: 1950, type: 'wallet', verified: true, spam: false, displayable: true };
  const p = { wallets: [{ holding: { address: '0x'+'11'.repeat(20) }, state: { data: { positions: [position], complete: true }, history: [], historyLoaded: true, historyError: null, next: null }, stale: false }], arcus: [], total: 3000, partial: false, stale: false };
  const host = document.createElement('div'); host.id = 'cost-qa'; host.dir = 'rtl'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:rgb(var(--c-canvas));padding:20px'; document.body.append(host);
  const root = createRoot(host); window.costQA = { book, p, root, React, MemoryRouter, CostSummaryPanel, savePref };
  root.render(React.createElement(MemoryRouter, null, React.createElement(CostSummaryPanel, { portfolio:p, links:[] })));
 });
 const host = page.locator('#cost-qa'); await host.getByRole('heading', { name: 'بهای خرید و سود و زیان', exact: true }).waitFor();
 for (const theme of ['light', 'dark']) {
  await page.evaluate(t => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
  for (const width of [320,390,768,1280,1440]) {
   await page.setViewportSize({width,height:900});
   assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1), `overflow ${width} ${theme}`);
   if(width<1280) { await host.getByText('بهای خرید و جزئیات',{exact:true}).click(); assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1), `expanded overflow ${width}`); await host.getByText('بهای خرید و جزئیات',{exact:true}).click(); }
  }
 }
 assert((await host.innerText()).includes('۳۲۵')); assert((await host.innerText()).includes('۲۰'));
 await page.screenshot({path:'/tmp/darino-cost-desktop.png'});
 await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'/tmp/darino-cost-mobile.png'});
 // Purchase updates must reflect immediately without page refresh.
 await page.evaluate(async()=>{const q=window.costQA;await q.savePref('cost-basis-v1',{...q.book,lots:[{...q.book.lots[0],unitCost:'2000'}]});});
 await host.getByText('۶۵۰',{exact:false}).last().waitFor();
 await page.evaluate(()=>{const q=window.costQA;q.p.wallets[0].state.historyLoaded=false;q.root.render(q.React.createElement(q.MemoryRouter,null,q.React.createElement(q.CostSummaryPanel,{portfolio:q.p,links:[]})));});
 await host.getByText('تاریخچه ناقص',{exact:true}).last().waitFor();
 assert(!(await host.innerText()).includes('۶۵۰'));
 await host.getByText('بهای خرید و جزئیات',{exact:true}).click(); assert((await host.innerText()).includes('۱,۳۰۰'));
 assert.deepEqual(errors,[]);
 console.log('PASS: dashboard cost rows, Persian figures, 320/390/768/1280/1440 light/dark/touch, disclosure, reactive purchase update and history gating. No live provider or installed-PWA test.');
} finally {await browser.close();}
