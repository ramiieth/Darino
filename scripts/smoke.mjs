/**
 * Smoke test v3 — قابلیت‌های ممیزی: LTR/Latin، Hero، Watchlist، پالت، CSV،
 * مرتب‌سازی هدر، گروه‌بندی، Drill-Down، نرخ ارز، ESC و دسترس‌پذیری
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 140)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const nav = (h) => page.evaluate((x) => { location.hash = x; }, h);

// 1) صفحه اصلی = Market Explorer + داشبورد
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
check('صفحه اصلی: Market Explorer', await page.evaluate(() => !location.hash.includes('dashboard')));
check('صفحه اصلی: تب‌های Markets (همه/رمزارز/توکن‌ایز/سنتی)', await page.evaluate(() => {
  const t = document.body.textContent || '';
  return t.includes('همه') && t.includes('رمزارز') && t.includes('دارایی توکن‌ایز') && t.includes('سنتی (TradFi)');
}));
check('صفحه اصلی: جستجوی بازار', (await page.getByPlaceholder(/جستجوی نماد/).count()) > 0);
check('صفحه اصلی: لینک Pendle', (await page.getByText('Pendle Markets').count()) > 0);
await nav('#/dashboard');
await page.waitForTimeout(8000);
check('Hero: ارزش خالص دارایی', (await page.getByText('ارزش خالص دارایی').count()) > 0);
const heroLatin = await page.evaluate(() => /^\$[\d,]+\.\d{2}$/.test((document.querySelector('main')?.textContent ?? '').match(/\$[\d,]+\.\d{2}/)?.[0] ?? ''));
check('Hero: ارقام لاتین (مثل $36,900.00)', heroLatin);
const toman = await page.evaluate(() => (document.body.textContent ?? '').match(/≈\s*[\d۰-۹٬٫\.]+\s*(میلیارد|میلیون|هزار)\s*تومان/)?.[0] ?? '');
check('Hero: معادل تومانی با ارقام فارسی', /[۰-۹]/.test(toman), toman);
check('کارت اتریوم: 3.33 ETH + 23,216 USDT', await page.evaluate(() => (document.body.textContent ?? '').includes('3.33 ETH + 23,216 USDT')));
check('Watchlist: حالت خالی', (await page.getByText('هنوز دارایی', { exact: false }).count()) > 0);
check('داشبورد: عملکرد (۳۰/۶۰/۹۰ روزه)', (await page.getByText('عملکرد', { exact: false }).count()) > 0);
check('داشبورد: عملکرد شامل همه بازارها', await page.evaluate(() => (document.body.textContent || '').includes('۲۰۰ رمزارز برتر + سهام توکن')));
check('داشبورد: شبیه‌سازی نمایشی', (await page.getByText('شبیه‌سازی نمایشی', { exact: true }).count()) > 0);
check('داشبورد: سرمایه فرضی ۲۳٬۱۲۶', await page.evaluate(() => /سرمایه فرضی[\s\S]{0,20}?\$23,126/.test(document.body.textContent || '')));
check('داشبورد: سلب مسئولیت نمایشی', await page.evaluate(() => (document.body.textContent || '').includes('سناریوی صرفاً فرضی')));
check('داشبورد: سوییچ بازه ۶۰ روزه', (await page.getByText('۶۰ روزه').count()) > 0);
check('داشبورد: بازه ۱ روزه', (await page.getByText('۱ روزه').count()) > 0);
check('داشبورد: بازه ۷ روزه', (await page.getByText('۷ روزه').count()) > 0);

// 1.5) حسابداری
await nav('#/accounting');
await page.waitForTimeout(12000);
check('حسابداری: صفحه خرید/فروش', (await page.getByText('خرید/فروش', { exact: true }).count()) > 0);
check('حسابداری: موجودی نقد افتتاحیه', await page.evaluate(() => /موجودی نقد[\s\S]{0,40}?\$[\d,]+\.\d{2}/.test(document.body.textContent || '')));
check('حسابداری: فیلد تاریخ هوشمند (شمسی/میلادی)', await page.evaluate(() => !!document.querySelector('input[placeholder="1404/05/17"]')));
check('حسابداری: دفتر کل', (await page.getByText('دفتر کل', { exact: true }).count()) > 0);
check('حسابداری: برگه ممیزی', (await page.getByText('ممیزی', { exact: true }).count()) > 0);
check('حسابداری: برداشت نقدی مخارج', (await page.getByText('برداشت نقدی مخارج', { exact: true }).count()) > 0);
await page.getByText('برداشت نقدی مخارج', { exact: true }).first().click();
await page.waitForTimeout(1200);
check('حسابداری: عنوان Cash Withdrawal & Expense Funding', (await page.getByText('Cash Withdrawal', { exact: false }).count()) > 0);
check('حسابداری: مقصد صندوق مخارج و حساب بانکی', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('صندوق مخارج') && b.includes('حساب بانکی');
}));
check('حسابداری: بدون فروش رمزارز در بخش مخارج', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return !b.includes('فروش رمزارز برای مخارج') && !b.includes('Sell Crypto');
}));
check('حسابداری: دکمه پیش‌نمایش برداشت', (await page.locator('button', { hasText: /پیش‌?نمایش برداشت/ }).count()) > 0);
check('حسابداری: واریز دارایی', (await page.getByText('واریز دارایی', { exact: true }).count()) > 0);
await page.getByText('واریز دارایی', { exact: true }).first().click();
await page.waitForTimeout(1200);
check('واریز: Asset Explorer', (await page.getByText('انتخاب دارایی (Explorer)').count()) > 0);
check('واریز: جستجوی دارایی', (await page.getByPlaceholder('جستجوی دارایی…').count()) > 0);
check('واریز: بدون نام خارجی', await page.evaluate(() => !(document.body.textContent || '').includes('Deposit Asset')));

// 2) پالت فرمان Ctrl+K
await page.keyboard.press('Control+k');
await page.waitForTimeout(700);
check('پالت: باز شدن با Ctrl+K', (await page.getByPlaceholder('جستجوی سریع دارایی').count()) > 0);
await page.keyboard.type('nvd');
await page.waitForTimeout(700);
check('پالت: جستجو', (await page.locator('li button').count()) > 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check('پالت: بسته شدن با Esc', (await page.getByPlaceholder('جستجوی سریع دارایی').count()) === 0);

// 2.5) Pendle
await nav('#/pendle');
await page.waitForTimeout(18000);
check('Pendle: صفحه بازارها', (await page.getByText('Pendle Markets').count()) > 0);
check('Pendle: کارت بازار', (await page.evaluate(() => (document.body.textContent || '').includes('TVL'))));
check('Pendle: نوار Rate Limit', (await page.getByText('سهمیه لحظه‌ای').count()) > 0);

// 3) بازار: Pipeline مرکزی (Crypto Top200 + Ondo + xStocks)
await nav('#/market');
await page.waitForTimeout(12000);
check('بازار: بدون Watch Only', (await page.getByText('Watch Only').count()) === 0);
check('بازار: بدون سربرگ Crypto Markets', (await page.getByText('Crypto Markets').count()) === 0);
check('بازار: جستجوی نماد', (await page.getByPlaceholder(/جستجوی نماد/).count()) > 0);
check('بازار: ردیف‌های زنده کریپتو (BTC/ETH)', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('BTC') && (b.includes('ETH') || b.includes('USDT'));
}));
// تب توکن‌ایز — جدول واحد (هر Symbol مستقل، بدون Underlying/Company)
await page.locator('button', { hasText: /^دارایی توکن‌ایز$/ }).first().click();
await page.waitForTimeout(6000);
check('توکن‌ایز: Ondo + xStocks در یک جدول', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('Ondo') && b.includes('xStocks');
}));
check('توکن‌ایز: بدون Underlying/Company/Grouping در UI', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return !/Apple|Underlying|Company Name|نسخه/.test(b);
}));
check('توکن‌ایز: هر Symbol یک Row (مثل NVDAON/SPYON)', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return /\d+NVDAON/.test(b) || /\d+SPYON/.test(b) || /\d+CRCLON/.test(b);
}));
// تب همه — بازگشت
await page.locator('button', { hasText: /^همه$/ }).first().click();
await page.waitForTimeout(2000);

// 3.5) دیفای — جریان سرمایه
await nav('#/defi');
await page.waitForTimeout(12000);
check('دیفای: تب جریان سرمایه', (await page.getByText('جریان سرمایه', { exact: false }).count()) > 0);
check('دیفای: خلاصه ورود/خروج', await page.evaluate(() => (document.body.textContent || '').includes('بیشترین ورود و خروج سرمایه')));
check('دیفای: نقشه حرارتی', (await page.locator('[role="tab"]').filter({ hasText: /نقشه حرارتی/ }).count()) > 0);
check('دیفای: جریان هوشمند', (await page.locator('[role="tab"]').filter({ hasText: /جریان هوشمند/ }).count()) > 0);

// 3.6) Boros
await nav('#/boros');
await page.waitForTimeout(15000);
check('Boros: عنوان تحلیل', (await page.getByText('تحلیل Boros', { exact: false }).count()) > 0);
check('Boros: فرصت‌ها با جدول بازارها', await page.evaluate(() => (document.body.textContent || '').includes('همه بازارها')));
check('Boros: تب شبیه‌ساز', (await page.locator('[role="tab"]').filter({ hasText: /شبیه/ }).count()) > 0);
check('Boros: مانیتور ریسک', (await page.locator('[role="tab"]').filter({ hasText: /ریسک/ }).count()) > 0);
check('Boros: Best Long Opportunities', (await page.getByText('بهترین فرصت‌های لانگ', { exact: false }).count()) > 0);
check('Boros: Best Short Opportunities', (await page.getByText('بهترین فرصت‌های شورت', { exact: false }).count()) > 0);
check('Boros: Long/Short Score جدا', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('Long Spread') && b.includes('Short Spread') && b.includes('Long Net') && b.includes('Short Net');
}));
check('Boros: Status فرصت/جذاب نیست', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('فرصت بالقوه') || b.includes('پس از هزینه‌ها جذاب نیست');
}));
check('Boros: بدون BUY/SELL', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return !b.includes('BUY') && !b.includes('SELL') && !b.includes('ENTER NOW');
}));
await page.locator('[role="tab"]').filter({ hasText: /ممیزی/ }).first().click();
await page.waitForTimeout(2500);
check('Boros: تب ممیزی با Breakdown', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('Gross Settlement Long') && b.includes('MTM Long (Unrealized)') && b.includes('YTMFloor');
}));
await page.locator('[role="tab"]').filter({ hasText: /فرصت/ }).first().click();
await page.waitForTimeout(2000);
check('Boros: Min Economic Edge تعریف‌شده', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('لبه اقتصادی') || b.includes('Min Edge');
}));
await page.locator('[role="tab"]').filter({ hasText: /شبیه/ }).first().click();
await page.waitForTimeout(2000);
check('Boros: پروجکشن (Leverage + RoundTrip + Liq N/A)', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('Notional / Capital') && b.includes('Round Trip Margin') && b.includes('Liquidation Implied APR') && b.includes('Theoretical APR Risk Buffer');
}));
await page.locator('[role="tab"]').filter({ hasText: /ممیزی/ }).first().click();
await page.waitForTimeout(2000);
check('Boros: Audit Report نهایی', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('Audit Report نهایی') && b.includes('Exposure');
}));
await page.locator('[role="tab"]').filter({ hasText: /فرصت/ }).first().click();
await page.waitForTimeout(1500);
check('Boros: وضعیت‌های جدید (مشروط/ناهنجاری)', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('فرصت مشروط') || b.includes('ناهنجاری نرخ') || b.includes('جذاب نیست');
}));
check('Boros: Explain WHY (چرا این رتبه؟)', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('چرا این رتبه؟') && (b.includes('✓') || b.includes('✗'));
}));

// 3.7) DeFi Yield Loop
await nav('#/defi-loop');
await page.waitForTimeout(15000);
check('Yield Loop: صفحه', (await page.getByText('Yield Loop', { exact: false }).count()) > 0);
check('Yield Loop: Explorer با پول‌ها', await page.evaluate(() => {
  const b = document.body.textContent || '';
  return b.includes('DeFiLlama Yields') && /پایه \(Intrinsic\)/.test(b);
}));
check('Yield Loop: فیلترها', await page.evaluate(() => document.querySelectorAll('select').length >= 3));
check('بازار: بدون Omni', (await page.evaluate(() => !(document.body.textContent || '').includes('Omni'))));
// بازگشت به بازار برای ادامه تست‌های قبلی (صفحه سبک است — سریع)
await nav('#/market');
await page.waitForTimeout(4000);
const discSearch = page.getByPlaceholder(/جستجوی نام/);
await discSearch.fill('sol');
await page.waitForTimeout(1200);
check('بازار: جستجوی Discovery (SOL)', (await page.evaluate(() => (document.body.textContent || '').includes('SOL'))));
await discSearch.fill('');

// 4) شبیه‌سازی بازه ۱: ارقام لاتین در جدول + مرتب‌سازی هدر + گروه‌بندی + CSV + Drill-Down
await nav('#/simulation');
// صبر با تلاش مجدد — ردیف اول ممکن است کمی دیر رندر شود
let rowFirstCell = 'NONE';
for (let i = 0; i < 8 && rowFirstCell === 'NONE'; i++) {
  await page.waitForTimeout(1500);
  rowFirstCell = await page.evaluate(() => {
    const tr = document.querySelector('table.sim-table tbody tr');
    return tr ? tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : 'NONE';
  });
}
check('جدول: ارقام لاتین', /[$][\d,]+\.\d{2}/.test(rowFirstCell), rowFirstCell.slice(0, 60));

// مرتب‌سازی روی هدر «ارزش ($)»
await page.getByRole('button', { name: /ارزش/ }).first().click();
await page.waitForTimeout(600);
check('مرتب‌سازی هدر: aria-sort فعال', (await page.locator('th[aria-sort]').count()) > 0);

// گروه‌بندی
await page.getByRole('button', { name: /گروه‌بندی/ }).click();
await page.waitForTimeout(700);
check('گروه‌بندی: سرگروه رمزارز', (await page.getByText('رمزارزها', { exact: false }).count()) > 0);
await page.getByRole('button', { name: /گروه‌بندی/ }).click();

// Drill-Down: کلیک روی ردیف
await page.locator('table.sim-table tbody tr').first().click();
await page.waitForTimeout(700);
check('Drill-Down: شیت جزئیات باز شد', (await page.getByText('جزئیات دارایی').count()) > 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check('Drill-Down: بسته با Esc', (await page.getByText('جزئیات دارایی').count()) === 0);

// CSV
const dlPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.getByRole('button', { name: /خروجی CSV/ }).click();
const dl = await dlPromise;
check('CSV: دانلود', dl !== null, dl ? dl.suggestedFilename() : '');

// 5) بازه ۲: کارت تحلیلی/چارت + تنظیمات نرخ ارز
await page.getByRole('tab', { name: /ژوئیه ۲۰۲۶/ }).click();
await page.waitForTimeout(2500);
check('چارت بازده دستهها', (await page.locator('canvas').count()) > 0);

// تنظیمات: نرخ ارز
await page.getByRole('button', { name: 'تنظیمات' }).last().click();
await page.waitForTimeout(800);
check('تنظیمات: نرخ ارز', (await page.getByText('نرخ ارز (دلار به تومان)').count()) > 0);
const fxInput = page.getByLabel('نرخ دلار به تومان');
await fxInput.fill('1500000');
await page.getByRole('button', { name: 'ثبت نرخ' }).click();
await page.waitForTimeout(700);
const fxSaved = await page.evaluate(() => {
  const idx = indexedDB.open('portfolio-simulator-db');
  return new Promise((res) => {
    idx.onsuccess = () => {
      const db = idx.result;
      if (!db.objectStoreNames.contains('fxRates')) return res(null);
      const tx = db.transaction('fxRates').objectStore('fxRates').get('usd-irr');
      tx.onsuccess = () => res(tx.result?.rate ?? null);
    };
    idx.onerror = () => res(null);
  });
});
check('fx_rates: ذخیره در IndexedDB', fxSaved === 1500000, `rate=${fxSaved}`);

// 6) دسترس‌پذیری: لینک پرش + فوکوس‌ویزیبل
const skip = await page.evaluate(() => !!document.querySelector('a.skip-link'));
check('دسترس‌پذیری: لینک پرش به محتوا', skip);
const focusRing = await page.evaluate(() => {
  const btn = document.querySelector('button');
  btn?.focus();
  return getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() !== '';
});
check('دسترس‌پذیری: توکن فوکوس تعریف شده', focusRing);

// ===== ماژول خودرو (Vehicle Investment) =====
await nav('#/vehicle');
await page.waitForTimeout(6000);
const vText = await page.evaluate(() => document.body.textContent || '');
check('خودرو: صفحه «سرمایه‌گذاری خودرو»', vText.includes('سرمایه‌گذاری خودرو'));
check('خودرو: توضیح منبع قیمت (نمایشگاه‌داران)', vText.includes('میانگین قیمت پیشنهادی فروشندگان'));
check('خودرو: رتبه‌بندی خودروها', vText.includes('رتبه‌بندی خودروها'));
check('خودرو: ۱۱۰ خودرو در پایگاه', vText.includes('۱۱۰ خودرو'));
check('خودرو: نرخ دلار ۱۸۶,۵۰۰', vText.includes('۱۸۶,۵۰۰'));
check('خودرو: نرخ دلار ۱۸۶,۵۰۰ ثبت‌شده', /186,500/.test(vText) || vText.includes('۱۸۶,۵۰۰'));
check('خودرو: دکمه «ثبت قیمت جدید»', vText.includes('ثبت قیمت جدید'));
await page.screenshot({ path: 'screenshots/smoke-vehicle.png' });

// ===== ماژول ملک (Real Estate) =====
await nav('#/realestate');
await page.waitForTimeout(5000);
const reText = await page.evaluate(() => document.body.textContent || '');
check('ملک: صفحه «سرمایه‌گذاری ملک»', reText.includes('سرمایه‌گذاری ملک'));
check('ملک: شاخص مرجع (نوساز / کلید اول)', reText.includes('نوساز / کلید اول'));
check('ملک: شهر اهواز', reText.includes('اهواز'));
check('ملک: ۱۶ محله تعریف‌شده', (await page.locator('select').nth(1).locator('option').count()) === 16);
check('ملک: دکمه «ثبت قیمت محله»', reText.includes('ثبت قیمت محله'));
await page.screenshot({ path: 'screenshots/smoke-realestate.png' });

console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
