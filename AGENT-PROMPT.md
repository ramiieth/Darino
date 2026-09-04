# 🎯 پرامپت جامع — بازسازی اپ «دارینو» (DARINO)

> این پرامپت را کامل به Agent جدید بدهید تا اپلیکیشنی معادل نسخه فعلی بسازد.
> تمام اطلاعات زیر از روی کد واقعی و تستهای اجراشده استخراج شدهاند — هیچ موردی حدسی نیست.

---

## ۱) شناسنامه محصول

**نام:** دارینو (DARINO) — «سامانه پایش پورتفولیو و شبیهسازی سرمایهگذاری چنددارایی»
**نوع:** PWA موبایلفرست، فارسی/RTL، آفلاین-فرست
**زبان رابط:** فارسی (همه متنها) — نمادهای معاملاتی انگلیسی — مقادیر مالی لاتین ایزوله LTR
**تکنولوژیها:**
- React 18.3 + TypeScript 5.7 + Vite 6 (strictPort: 5173)
- React Router v7 (HashRouter) · Zustand 4.5 · TanStack Query 5
- Dexie 4 (IndexedDB) — آفلاینفرست · TailwindCSS 3.4 · framer-motion (فقط صفحات غیراصلی)
- Chart.js / react-chartjs-2 · VitePWA (Service Worker + manifest) · Vazirmatn (فونت)
- Vitest + Testing Library + Playwright (تست)

---

## ۲) قوانین غیرقابل مذاکره (Hard Rules)

1. **تمام متنها فارسی و RTL**؛ نمادهای معاملاتی انگلیسی؛ مقادیر مالی با ارقام لاتین و کلاس `.num-ltr`؛ معادل تومانی فقط با ارقام فارسی (مثلاً «≈ ۵٫۴۶ میلیارد تومان»).
2. **هیچ Hardcode داده بازار**: همه قیمت/لوگو/مارکتکپ/عملکرد از API میآیند. پارامتر ناشناخته → **N/A یا «—»** (هرگز ۰ فرض نشود؛ هرگز Gas/Fee/Slippage/MTM بدون داده واقعی تخمین زده نشود).
3. **هرگز BUY/SELL/ENTER پیشنهاد نده.** وضعیتهای مجاز تحلیل: «فرصت بالقوه / فرصت مشروط / جذاب نیست / داده ناکافی / ناهنجاری نرخ».
4. **بدون نام خارجی در UI** (مثلاً بهجای «Deposit Asset» → «واریز دارایی»).
5. **Score ≠ احتمال موفقیت** — جمله صریح در UI.
6. **محاسبات مالی فقط در موتور (backend/domain)**: UI فقط Input → Engine → Output. Rateها Decimal (مثلاً 0.0791)؛ درصد فقط در UI.
7. **حسابداری (Accounting) از Market Data کاملاً جدا** — دفتر/سوابق تغییرناپذیرند؛ قیمت بازار فقط برای «ارزش جاری» است و هرگز Transaction/Entry نمیسازد.
8. نرخ ارز دلار→تومان در جدول `fx_rates` با تاریخچه ۲۴ ساعت و آپدیت دستی ادمین.

---

## ۳) معماری کلی

```
src/
├── app/            # Router (HashRouter) + AppProviders + apiConfig + App.tsx
│   └── App.tsx     # فقط صفحه اصلی (بازار) مستقیم import؛ بقیه lazy (باندل سبک)
├── shared/         # lib (db/throttler/coingeckoGate/coingecko/alphavantage/fetchWithRetry)
│   ├── store/      # Zustand: theme, fx, logo, settings, toast, sidebar, …
│   ├── components/ # ui (GlassCard, Sheet, AssetLogo, SegmentedControl…) + layout
│   ├── utils/      # formatters (فارسی/RTL + ارقام لاتین)، jalali، math
│   └── hooks/      # useAutoSync (تایمر سراسری مشترک)
├── features/
│   ├── markets/        # ★ جدیدترین: Pipeline متمرکز بازار
│   ├── market/         # طبقهبندی قدیمی (classification/underlying) + MarketCapReference
│   ├── marketData/     # Registry توکنایز (متادیتا/تاریخچه)
│   ├── cryptomarkets/  # Top200 (فالبک مقاوم) + TopPerformers (داشبورد)
│   ├── eth-summary/    # داشبورد: ارزش خالص + کارت اتریوم + Watchlist
│   ├── simulation/     # شبیهسازی دو بازه + ماشینحسابها
│   ├── accounting/     # حسابداری دوسویه (دفتر کل، ممیزی، FIFO، برداشت مخارج)
│   ├── pendle/         # تحلیل بازارهای Pendle (PT/YT/LP) + موتور تحلیلی
│   ├── boros/          # تحلیل Boros (لانگ/شورت، شبیهساز، ممیزی)
│   ├── defi/           # TVL + جریان سرمایه + استیبلکوینها
│   ├── defi-loop/      # Yield Loop (DeFiLlama)
│   ├── vehicle/        # ۱۱۰ خودرو + اسنپشات قیمت (نرخ ۱۸۶٬۵۰۰)
│   ├── realestate/     # ۱۶ محله اهواز + شاخص مرجع
│   └── calculators/    # P&L / DCA / CAGR / Compare
```

**Lazy Loading:** فقط صفحه اصلی (بازار) مستقیم؛ داشبورد/شبیهسازی/دیفای/Pendle/خودرو/ملک/حسابداری/Boros همه lazy با `<Suspense>`.

---

## ۴) ★ معماری Markets (Pipeline متمرکز — بازطراحی نهایی)

### هدف
`Lower Initial Load + Fewer API Requests + Smaller Payload + Less Client Processing + Less Re-render + Centralized Cache + Efficient Pipeline`

### مسیر داده (هرگز UI مستقیم به Provider نمیزند)
```
External Market API (CoinGecko)
   ↓  Server-side Fetch (پروکسی /coingecko-api + کلید سرور + دروازه نرخ)
   ↓  Normalization (فقط فیلدهای UI → Minimal DTO)
   ↓  Validation (Tokenized: فقط marketCap > 0)
   ↓  Centralized Cache (Dexie + TTL + حفظ داده قدیمی)
   ↓  Minimal DTO → UI (یک جدول، هر Symbol یک Row مستقل)
```

### فایلها (مسیر: `src/features/markets/`)
- `pipeline/types.ts` — **DTO مینیمال**:
  ```ts
  interface MarketAsset { id, symbol, image, price, marketCap, change24h, change7d, change30d, source, rank }
  type MarketUniverse = 'crypto_top_200' | 'ondo_tokenized' | 'xstocks'
  type MarketSource = 'crypto' | 'ondo' | 'xstocks'
  ```
- `pipeline/normalize.ts` — تبدیل ردیف خام CoinGecko → DTO (فقط ۷ فیلد؛ بقیه Response دور ریخته میشود) + `isValidTokenized` (فقط marketCap > 0)
- `pipeline/fetch.ts` — `crypto_top_200`: یک درخواست Top200 با dedup سراسری (`fetchTopMarketsOnce`)؛ `ondo/xstocks`: یک درخواست Category (تمام صفحات، ترتیب CoinGecko حفظ میشود)
- `pipeline/cache.ts` — کش مرکزی با TTL: کریپتو ۱ دقیقه، توکنایز ۱۰ دقیقه
- `pipeline/store.ts` — استور مرکزی + **Request Deduplication** (چند مصرفکننده همزمان → یک fetch) + Refresh مرکزی؛ شکست → داده قبلی حفظ (هرگز خالی/جعلی)
- `pipeline/useMarkets.ts` — هوک مصرفی با selectors جزئی (بدون re-render غیرضروری)
- `presentation/MarketsPage.tsx` — تبها: همه / رمزارز / دارایی توکنایز / سنتی
- `presentation/MarketsTable.tsx` — **جدول واحد برای همه Universeها**: `Logo | Symbol | Price | 24H | 7D | 30D | Market Cap`؛ Row با `React.memo`؛ برش ۵۰ + «نمایش بیشتر»؛ جستجوی نماد؛ Metric ناقص → «—»
- `presentation/TradFiTable.tsx` — سنتی با قیمت/MCAP مرجع (برچسب «≈ مرجع»)

### قواعد Markets (مهم)
- **هر Symbol یک Row مستقل است**: AAPLON و AAPLX دو Asset مستقل با Price/24H/7D/30D/MCap/لوگوی خودشان — هیچ جمع/میانگین/Merge.
- **بدون Asset / Underlying / Company / Grouping / Pairing در UI** — فقط Symbol.
- Ondo و xStocks: فقط Tokenهایی با `marketCap != null && marketCap > 0` نمایش داده میشوند.
- روابط Symbolها (مثل AAPLON↔AAPLX) فقط در لایه داده برای مرتبسازی مجاز است، نه UI.
- **Payload کم**: تمام Response وارد Client نمیشود؛ فقط DTO ۷ فیلدی.
- Client عمدتاً Render انجام میدهد؛ Fetch/Normalize/Validate/Filter در Pipeline.

---

## ۵) منابع داده (Data Sources)

| ماژول | Provider | نحوه |
|---|---|---|
| Crypto Top 200 | CoinGecko | `GET /coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&sparkline=true&price_change_percentage=24h,7d,30d` + فالبک اسنپشات ۷ روزه |
| Ondo Tokenized | CoinGecko | `GET /coins/markets?vs_currency=usd&category=ondo-tokenized-assets&per_page=250&page=N` (تمام صفحات) |
| xStocks | CoinGecko | `GET /coins/markets?vs_currency=usd&category=xstocks-ecosystem&per_page=250&page=N` |
| لوگوها | CoinGecko | فیلد `image` با نسخه **small** (نه large) + lazy loading |
| سهام سنتی | Alpha Vantage | کلید فقط در سرور (`process.env.ALPHAVANTAGE_API_KEY`)؛ سهمیه ۲۵/روز → مصرف امن ۲۲؛ صف ۱۲ ثانیه |
| Pendle | `https://api-v2.pendle.finance/core` | `/v2/markets/all` (پاگینیشن) + `/v1/prices/assets` (batching) + نوار Rate Limit هدرمحور |
| DeFi / Yield Loop | DefiLlama | `https://yields.llama.fi/pools` و تاریخچه |
| نرخ دلار | جدول fx_rates | دستی ادمین (پیشفرض ۱٬۴۸۰٬۰۰۰) |

### کلیدها (فقط سرور-سمت — هرگز به Client)
- CoinGecko: در پروکسی vite تزریق میشود — `COINGECKO_API_KEY` (پیشفرض داخلی) بهصورت `x_cg_demo_api_key` در درخواست سرور.
- Alpha Vantage: `ALPHAVANTAGE_API_KEY` — از طریق پلاگین vite + پروکسی `/alphavantage-api` (کلید در query درج میشود).
- پروکسیها: `/coingecko-api` → `https://api.coingecko.com/api/v3` و `/alphavantage-api` → `https://www.alphavantage.co/query` — با حذف هدرهای Origin/Referer (سرور-به-سرور).

### دروازه نرخ سراسری (`shared/lib/coingeckoGate.ts`)
همه درخواستهای CoinGecko از **یک صف واحد** عبور میکنند: فاصله ۲ ثانیه، ۲۰/دقیقه، مدارشکن ۶۰ ثانیهای — جلوی 429 زنجیرهای در لود صفحه.

---

## ۶) دیتابیس (Dexie — نسخه ۸)

جداول:
```
priceCache ('key, fetchedAt') · assetMeta · settings · fxRates · watchlist
accAccounts · accEntries · accLots · accEvents   (حسابداری)
vehicles · vehicleSnapshots · realAssets · realEstateSnapshots
tokenizedAssetRegistry ('key, provider, status, underlyingSymbol…')
tokenizedAssetSyncRuns
```
- هر رکورد کش: `{ key, price, source: 'live'|'snapshot'|'na', fetchedAt }`
- توابع: `cacheGetPrice/cachePutPrice/cacheBulkGetPrice/cacheDeleteKeys/metaPut/fxGet/fxPut/watchPut…`

---

## ۷) ماژولها (خلاصه عملکردی)

1. **بازار (Markets)** — سه Universe در یک جدول واحد؛ جستجو/فیلتر منبع؛ برش؛ MCap مستقل؛ لوگوی real؛ «—» برای داده ناقص. [شرح کامل در بخش ۴]
2. **داشبورد** — ارزش خالص دارایی (ارقام لاتین + معادل تومان فارسی)، کارت اتریوم، Watchlist، کارت «عملکرد ۳۰/۶۰/۹۰ روزه» (فقط اینجا — نه صفحه اصلی)، شبیهسازی نمایشی با سلب مسئولیت.
3. **شبیهسازی** — دو بازه (Base/Current)، جدول ۶ ستونه: `Asset | Buy/Ref Price | Current Price | Value | P/L | Vs ETH`؛ مرتبسازی هدر؛ گروهبندی؛ CSV خروجی؛ Drill-Down شیت.
4. **حسابداری دوسویه** — صفحه خرید/فروش، واریز دارایی (Asset Explorer)، برداشت نقدی مخارج (Cash Withdrawal & Expense Funding)، دفتر کل، برگه ممیزی (Audit)، FIFO، P&L؛ تاریخ شمسی/میلادی (SmartDateField، placeholder «1404/05/17»).
5. **Pendle** — فهرست بازارها (TVL/APY/سررسید)، صفحه جزئیات (روند ۹۰ روزه)، تب تحلیل: PT/YT/LP/Real APY/Break-even/مقایسه.
   - ⚠️ باگ مهم حلشده: ارزش بازخرید PT باید `ptAmount × redemptionPrice` باشد که redemptionPrice = **قیمت واقعی دارایی پایه از API** (نه ۱) — برای xStocks (مثل STRCx با پایه ~۹۴.۵$) وگرنه اعداد −۹۸٪ کاذب میدهند. بدون قیمت پایه: فقط برای استیبلها ۱ فرض شود، وگرنه «داده ناکافی».
   - کلیدهای `pt/yt/sy/underlyingAsset` از API از قبل با پیشوند chainId میآیند (مثل `1-0x…`) — دوباره chainId اضافه نشود.
   - هیچ قیمت ثابت/فرضی (مثل 0.948) در UI نباشد.
6. **Boros** — فرصتهای لانگ/شورت با Score جدا، وضعیتهای «فرصت بالقوه/مشروط/جذاب نیست/ناهنجاری نرخ»، شبیهساز (MODE B/C + Theoretical APR Buffer + Liquidation N/A)، تب ممیزی (Gross Settlement Long / MTM / YTMFloor / Exposure)، «چرا این رتبه؟»، بدون BUY/SELL.
7. **دیفای** — KPI TVL کل، جریان سرمایه (بیشترین ورود/خروج، نقشه حرارتی، جریان هوشمند)، Top 30 استیبلکوین CoinGecko.
8. **Yield Loop** — Explorer با پولهای DeFiLlama («پایه (Intrinsic)»)، فیلترها، ماشینحساب حلقه.
9. **خودرو** — ۱۱۰ خودرو با رتبهبندی، اسنپشات قیمت (۱۸ مرداد ۱۴۰۵، نرخ ۱۸۶٬۵۰۰)، «ثبت قیمت جدید».
10. **ملک** — شهر اهواز، ۱۶ محله، شاخص مرجع (نوساز/کلید اول)، «ثبت قیمت محله».
11. **ماشینحسابها** — P&L / DCA / CAGR / Compare با نمودار.
12. **پالت فرمان** — Ctrl+K، جستجوی سریع داراییها، Esc برای بستن.

---

## ۸) نکات UI/UX کلیدی

- **صفحه اصلی = بازار** (`/`)؛ داشبورد در `/dashboard`؛ مسیرها: `/market`، `/simulation`، `/accounting`، `/defi`، `/pendle`، `/pendle/:chainId/:address`، `/boros`، `/vehicle`، `/realestate`، `/defi-loop`، `/calculators`.
- Design System: Glassmorphism ملایم (`glass`, `glass-strong`, `glass-soft`, `glass-inset`, `shadow-pop`, `shadow-glow`)، رنگهای `accent/info/positive/negative/warn/muted/ink`، توکنهای CSS، پسزمینه Ambient (هالههای ملایم).
- انیمیشنها: CSS سبک (`anim-fade-up`، `anim-slide-up`، `anim-pop`، `anim-toast-in`) — framer-motion فقط در صفحات غیراصلی.
- موبایلفرست: جدول ↔ کارت، BottomNav، Sheet پایین صفحه (drag-to-close با pointer events)، safe-area (`pb-safe`).
- **دسترسپذیری**: لینک پرش به محتوا، فوکوس ترپ، ESC، aria-label فارسی، توکن فوکوس.
- **اعداد**: قیمت <۱$ تا ۶ رقم اعشار؛ <0.01$ با ۴ رقم معنادار؛ مقادیر بزرگ compact ($1.29T)؛ درصد با علامت صریح (+1.20% / −2.35%).
- **نشان منبع**: ProvenanceBadge — LIVE / BOROS / CALCULATED / SIMULATED / ESTIMATED / N/A؛ «کش»/«زنده»/«≈ مرجع».

---

## ۹) تستها (الزامی — معیار قبولی)

- **Vitest (واحد)**: ۶۲۱ تست پاس در ۳۰ فایل. پوشش مهم:
  - Markets Pipeline: normalize به DTO مینیمال، isValidTokenized (MCap > 0)، dedup (دو sync همزمان → یک fetch)، cache TTL، شکست → حفظ داده قبلی، استقلال AAPLON/AAPLX (بدون Merge)، **صفر وابستگی به Accounting** (اسکن فایلها برای journal/fifo/acc*)
  - Pendle: سناریوی کاربر ۱۰٬۰۰۰$ با PT=93.56 و redemption=94.5 → سود ≈ +۱٪ (نه −۹۸٪)؛ redemptionPrice نامعتبر → پیشفرض ۱
  - موتورهای شبیهسازی/حسابداری/Boros/خودرو/ملک
- **Playwright (اسموک)** `scripts/smoke.mjs`: ۹۲+ چک — فارسی/RTL، ارقام لاتین، معادل تومان فارسی، بدون BUY/SELL، بدون نام خارجی، بدون Watch Only، Registry بدون RWA، دسترسپذیری، CSV، مرتبسازی، و…
- **Build**: `tsc --noEmit && vite build` سبز (PWA + SW).

### دستورات
```bash
npm install --no-audit --no-fund
ALPHAVANTAGE_API_KEY=demo npm run dev      # dev روی پورت 5173 (strictPort)
npm run test                                # ۶۲۱ تست
node scripts/smoke.mjs                      # اسموک مرورگر (نیاز: npx playwright install chromium-headless-shell)
npm run build                               # بیلد PWA
```

---

## ۱۰) معیارهای پذیرش نهایی

- [ ] بارگذاری اولیه سبک (DOMContentLoaded ~400ms؛ فقط صفحه اصلی مستقیم، بقیه lazy)
- [ ] درخواستهای CoinGecko در لود صفحه بازار ≤ ۳ (بدون هیچ /search)
- [ ] DTO مینیمال (۷ فیلد) — بدون انتقال Response کامل
- [ ] Cache مرکزی + TTL + Dedup + Refresh مرکزی (یک تایمر)
- [ ] Crypto Top 200 + Ondo + xStocks در یک جدول واحد؛ هر Symbol یک Row مستقل
- [ ] فقط Market Cap معتبر برای توکنایز؛ بدون Underlying/Company/Grouping در UI
- [ ] Metric ناقص → «—»؛ شکست API → داده قبلی حفظ (نه سفید/جعلی)
- [ ] Accounting/Ledger/FIFO کاملاً دستنخورده
- [ ] ۶۲۱ تست پاس + اسموک ۹۲+ + بیلد سبز
- [ ] همه متنها فارسی/RTL؛ اعداد مالی لاتین؛ تومان فارسی

---

*گزارشهای تکمیلی موجود در workspace: `MARKETS-REFACTOR-REPORT.md` · `PERFORMANCE-REPORT.md` · `TOKENIZED-REGISTRY-REPORT.md` · `BOROS-AUDIT-REPORT.md`*
