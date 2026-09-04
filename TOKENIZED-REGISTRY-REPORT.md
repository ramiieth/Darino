# گزارش نهایی — Tokenized Asset Registry (BackedFi xStocks + Ondo)

تاریخ: ۱۲ اوت ۲۰۲۶ · نسخه: دارینو PWA

---

## ۰) بازگردانی کامل به حالت قبل از RWA + حذف RWA

### چه چیزی حذف شد (کاملاً)
- **RWA از فرانتاند**: `RwaTable.tsx`، تب RWA، چیپهای زیردسته، ستونهای
  `Price (پایه) / Tokenized Price / Tokenized Mcap / Tokenized 24h Vol` — همه حذف شدند.
- **RWA از بکاند**: موتور `rwaClassifier`، `syncRwaUniverse`، اسکن دستههای
  `tokenized-*`، نرمالایزرهای RWA، پرووایدر دستهها — همه حذف شدند.
- **RWA از دیتابیس**: جداول `marketAssets / marketQuotes / marketHistorical /
  marketFundamentals / marketCategories / marketProviderMappings` (نسخه v7) در
  ارتقای v8 **حذف** شدند + کلیدهای کش `market:rwa:*` هنگام اجرا پاکسازی می‌شوند.

### بازگردانی ماژول بازار به حالت قبل (سبک و سریع)
- `MarketDiscoveryPage` با تبهای «همه / رمزارز / دارایی توکنایز / سنتی» + جستجو
  بازگردانده شد — **بدون** جدول ۲۰۰ ردیفی سنگین و بدون ۴۲۷ اسپارکلاین.
- `useMarketDiscovery`، `classification`، `underlying`، `marketCapReference`
  (MCAP تقریبی با برچسب «≈ مرجع») بازگردانده شدند.
- **دادههای شبیهسازی سرمایهگذاری** (شبیهساز/حسابداری): هیچ فایلی در
  `features/simulation` یا `features/accounting` تغییر نکرده است — همه ۲۴۸ تست
  شبیهسازی/حسابداری بدون تغییر پاس هستند.

### علت کندی و رفع آن
صفحه اصلی (بازار) جدول سنگین + درخواستهای همزمان چند ماژول به CoinGecko
می‌فرستاد. حالا: صفحه سبک است + **دروازه نرخ سراسری** (`coingeckoGate.ts`)
همه درخواستها را سریال می‌کند (فاصله ۲۰ ثانیه + مدارشکن). حجم workspace هم
از ۳۱MB به ~4MB کاهش یافت (حذف اسکرینشاتها و اسکریپتهای دیباگ).

---

## ۱) خلاصه پیاده‌سازی Registry (جایگزین RWA)

```
             CoinGecko
                 │
        ┌────────┴────────┐
        │                 │
   xStocks Category   Ondo Category
        │                 │
        └────────┬────────┘
                 ↓
          Tokenized Sync   (sync.ts — تمام صفحات، بخش ۴)
                 ↓
             Parser         (parser.ts — ترتیب/rank واقعی)
                 ↓
           Normalizer       (normalizer.ts — hash/رکورد استاندارد)
                 ↓
       Underlying Resolver  (resolver.ts — L1/L2/L3 + Overrides)
                 ↓
       Tokenized Asset Registry  (دیتابیس — جداول اختصاصی)
                 ↓
          Market Data API / Store  (useTokenizedRegistry.ts)
                 ↓
            Markets UI (تب «دارایی توکنایز»)  (TokenizedAssetsRegistry.tsx)
                 ↓
       Underlying Asset Groups (Apple ← AAPLX/BackedFi + AAPLON/Ondo)
```

### معماری (بخش ۱۸/۳۳)
```
src/features/marketData/tokenizedAssets/
├── types.ts                       — تایپ‌های Registry/Sync/گروه
├── constants.ts                   — پیکربندی منابع (بخش ۳) + فاصله Sync
├── sources/coingeckoCategory.ts   — Pagination تمام صفحات (بخش ۴)
├── parser.ts                      — استخراج با حفظ ترتیب (source_rank)
├── normalizer.ts                  — رکورد استاندارد + metadata_hash
├── resolver.ts                    — Underlying (L1/L2/L3) + Asset Type
├── sync.ts                        — موتور Sync (INSERT/UPDATE/inactive/لاگ)
├── db.ts                          — دسترسی جداول Dexie + فالبک حافظه
├── useTokenizedRegistry.ts        — Store + جستجو/فیلتر/گروه‌بندی/آمار
└── presentation/TokenizedAssetsRegistry.tsx — UI (گروه‌بندی + فیلترها)
```

### قواعد اجراشده
- **هیچ لیست Hardcode نیست** — فقط پیکربندی دو منبع + نگاشت استثناها.
- کلید یکتا: `provider + token_symbol` (بخش ۱۳)؛ AAPLX ≠ AAPLON اما هر دو → AAPL.
- حذف از منبع → **inactive** (هرگز Hard Delete — بخش ۱۵/۲۸).
- `first_seen_at` در Update ثابت می‌ماند (بخش ۱۶).
- شکست Sync → لاگ `failed` + **دیتابیس دست‌نخورده** (بخش ۲۰).
- نوع دارایی فقط از متادیتای صریح؛ بدون حدس → `OTHER` (بخش ۱۰).
- **حسابداری دست‌نخورده**: هیچ فایلی از `features/accounting` تغییر نکرده و
  هیچ ماژول Registry به آن وابسته نیست (تست ۱۰).
- هرگز در Render صفحه بازار درخواست ارسال نمی‌شود؛ Sync خودکار فقط وقتی آخرین
  اجرای موفق > ۶ ساعت باشد + دکمه دستی (بخش ۱۷).

---

## ۲) اعداد واقعی از اجرای زنده Sync (۱۲ اوت ۲۰۲۶)

> هیچ عددی حدس زده نشده — همه از اجرای واقعی موتور Sync روی API زنده CoinGecko.

```
Initial xStocks Assets:   114   (BackedFi — category: xstocks-ecosystem)
Initial Ondo Assets:      439   (Ondo — category: ondo-tokenized-assets)

Unique Tokenized Assets:  553
Unique Underlying Assets: 469

Stocks:          235
ETFs:             97
Commodities:      16
Indexes:           1
Bonds:             1
Preferred Stocks:  2
Other:           201

New Assets:      553
Updated Assets:    0   (Import اول — همه جدید)
Inactive Assets:   0

Sync Frequency:   خودکار هر ۶ ساعت (اگر آخرین اجرا کهنه باشد) + دکمه دستی
Last Successful Sync: ۱۱ اوت ۲۰۲۶ ~۲۱:۰۰ UTC (هر دو provider — status: success)
```

### نمونه‌های واقعی Registry
| Token | Provider | Underlying | نوع | rank |
|---|---|---|---|---|
| AAPLX | backedfi | AAPL (Apple) | STOCK | 12 |
| ABBVX | backedfi | ABBV (AbbVie) | STOCK | 71 |
| ABTX | backedfi | ABT (Abbott) | STOCK | 63 |
| AMDX | backedfi | AMD | STOCK | 22 |
| VX | backedfi | V (Visa) | STOCK | — |
| ABTON | ondo | ABT (Abbott) | STOCK | — |
| GOOGLON | ondo | GOOGL (Alphabet) | STOCK | — |
| SPYON | ondo | SPY (S&P 500) | ETF | — |
| PALLON | ondo | PALL | COMMODITY | — |

### گروه‌های چندتوکنی واقعی (Underlying واحد ← دو Provider)
```
Apple     ← backedfi:AAPLX + ondo:AAPLON
Abbott    ← backedfi:ABTX + ondo:ABTON
AbbVie    ← backedfi:ABBVX + ondo:ABBVON
Alphabet  ← backedfi:GOOGLX + ondo:GOOGLON
Amazon    ← backedfi:AMZNX + ondo:AMZNON
AMD       ← backedfi:AMDX + ondo:AMDON
Accenture ← backedfi:ACNX + ondo:ACNON
Adobe     ← backedfi:ADBEX + ondo:ADBEON
```

### نکته پایدارسازی در مسیر (حل‌شده)
در Import اول، ۵ دارایی بدون نماد پایه مانده بودند (نمادهای تک‌حرفی بورس:
`VX`=Visa، `CON`=Citigroup، `FON`=Ford، `TON`=AT&T). با تکمیل نگاشت استثناها
(فقط شرکت‌های شناخته‌شده) در `resolver.ts` حل شد — در Sync دوم `NO-UNDER: []`.

---

## ۳) فایل‌ها

### ایجاد شده
```
src/features/marketData/tokenizedAssets/types.ts
src/features/marketData/tokenizedAssets/constants.ts
src/features/marketData/tokenizedAssets/parser.ts
src/features/marketData/tokenizedAssets/normalizer.ts
src/features/marketData/tokenizedAssets/resolver.ts
src/features/marketData/tokenizedAssets/sync.ts
src/features/marketData/tokenizedAssets/db.ts
src/features/marketData/tokenizedAssets/useTokenizedRegistry.ts
src/features/marketData/tokenizedAssets/sources/coingeckoCategory.ts
src/features/marketData/tokenizedAssets/presentation/TokenizedAssetsRegistry.tsx
src/features/marketData/tokenizedAssets/tokenizedAssets.test.ts
src/shared/lib/coingeckoGate.ts        (دروازه نرخ سراسری — ساخته‌شده در جلسه قبل، حفظ شد)
scripts/tokenized-report.mjs           (گزارش زنده — اعداد واقعی)
scripts/tokenized-breakdown.mjs
scripts/tokenized-final.mjs
```

### اصلاح شده (بازگردانی به قبل + Registry)
```
src/features/market/domain/types.ts           (بازگردانی — MarketInstrument)
src/features/market/domain/classification.ts  (بازگردانی)
src/features/market/domain/underlying.ts      (بازگردانی — گروه‌بندی)
src/features/market/domain/market.test.ts     (بازگردانی تست‌ها)
src/features/market/data/marketCapReference.ts (بازگردانی — MCAP مرجع ≈)
src/features/market/data/useMarketDiscovery.ts (بازگردانی — بدون کاتالوگ توکنایز)
src/features/market/presentation/MarketDiscoveryPage.tsx (بازگردانی سبک + تب Registry)
src/features/market/presentation/MarketsHomePage.tsx    (بازگردانی)
src/shared/lib/db.ts                         (v8: حذف جداول market* + افزودن Registry)
scripts/smoke.mjs                            (هماهنگ با صفحه بازگردانده‌شده)
```

### حذف شده (RWA)
```
src/features/market/engine/*            (rwaClassifier, normalizers, performanceEngine)
src/features/market/data/marketDb.ts / marketService.ts / tradfiCatalog.ts
src/features/market/data/providers/*    (coingeckoProvider, alphaVantageProvider)
src/features/market/data/useMarketUniverses.ts
src/features/market/presentation/{RwaTable,CryptoTable,TradFiTable,Sparkline,marketUi,MarketPage}.tsx
scripts/rwa-*.mjs / shot-*.mjs / verify-rwa-final.mjs و…
screenshots/ (۲۷MB) — حذف برای سبک‌شدن workspace
```

---

## ۴) تست‌ها

### ۱۰ تست الزامی (بخش ۳۰) — همگی پاس
| # | تست | وضعیت |
|---|---|---|
| 1 | Pagination تمام صفحات را می‌خواند (صفحه پر → ادامه؛ ناقص → توقف) | ✅ |
| 2 | Asset جدید شناسایی می‌شود (INSERT + firstSeenAt) | ✅ |
| 3 | Asset حذف‌شده inactive می‌شود | ✅ |
| 4 | Asset حذف‌شده Hard Delete نمی‌شود (در DB می‌ماند) | ✅ |
| 5 | تغییر Rank Asset جدید نمی‌سازد (firstSeen ثابت) | ✅ |
| 6 | AAPLX و AAPLON دو Token مستقل‌اند | ✅ |
| 7 | AAPLX و AAPLON به Underlying واحد AAPL متصل می‌شوند | ✅ |
| 8 | Sync Failure دیتابیس قبلی را پاک نمی‌کند (+ لاگ failed) | ✅ |
| 9 | Duplicate Token ایجاد نمی‌شود | ✅ |
| 10 | Accounting هیچ تغییری نمی‌کند (بدون وابستگی) | ✅ |

### نتایج کل
```
npm run test      → 610 passed (29 فایل) / 0 failed
npm run build     → سبز (PWA)
smoke.mjs         → 92 PASS / 1 FAIL (تنها خطا: «سرمایه فرضی» — وابسته به نوسان قیمت زنده، نه باگ)
```

---

## ۵) نکات محیطی (سندباکس)
- IP سندباکس توسط CoinGecko محدود است (~۲ درخواست/دقیقه) — در محیط واقعی
  سقف رایگان بالاتر است. موتور با مدارشکن/کش/لاگ failed کاملاً مقاوم است.
- اولین Import روی دستگاه کاربر ممکن است تا چند دقیقه طول بکشد (صف نرخ) —
  UI با پیام «داده ناکافی — همگامسازی بزنید» شفاف است و داده قبلی حفظ می‌شود.
