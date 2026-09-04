# گزارش Audit معماری — پیش از Migration به Neon + Vercel

تاریخ: ۱۲ اوت ۲۰۲۶ · وضعیت: **در انتظار تأیید شما — هیچ کدی تغییر نکرده است**

---

## ۱) معماری فعلی چگونه است؟

```
Browser (Client-only PWA — Vite + React 18 + TS)
   ├── UI (features/*) — Persian RTL, Glassmorphism
   ├── Business Logic — موتورهای Pure در features/*/domain + engine (Pendle/Boros/Simulation)
   ├── Data Layer — لایه db.ts (Dexie/IndexedDB) + repositories سبک داخل هر feature
   └── Market Data — Pipeline متمرکز (features/markets/pipeline) ← پروکسی سرور Vite ← CoinGecko

بدون Backend. بدون سرور. بدون ORM. بدون Auth.
```

**نکته کلیدی:** این اپلیکیشن «Client-Side SPA» است — تمام منطق و داده در مرورگر اجرا میشود.
هیچ runtime سرور (Node/Express/Next) وجود ندارد و `package.json` هیچ وابستگی سروری ندارد.

---

## ۲) دادهها الان کجا ذخیره میشوند؟

| داده | محل فعلی | جدول/کلید |
|---|---|---|
| **حسابداری** (دفتر/سند/سوابق FIFO) | IndexedDB (Dexie v8) | `accAccounts` · `accEntries` · `accLots` · `accEvents` |
| **سرمایه/موجودی کاربر** (کیف پول) | IndexedDB | از `accAccounts` (مثل cash) + `accEntries` خوانده میشود؛ فالبک `USER_ASSETS` |
| **نرخ ارز دلار→تومان** | IndexedDB | `fxRates` (با تاریخچه ۲۴ساعته) |
| **علاقهمندیها (Watchlist)** | IndexedDB | `watchlist` |
| **تنظیمات** (سناریو، کلیدهای AV کاربر) | IndexedDB + localStorage | `settings` + کلید `app:*` |
| **خودرو / ملک** | IndexedDB | `vehicles`+`vehicleSnapshots` · `realAssets`+`realEstateSnapshots` |
| **Registry توکنایز** (فراداده) | IndexedDB | `tokenizedAssetRegistry` + `tokenizedAssetSyncRuns` |
| **داده بازار (قیمت/لوگو)** | IndexedDB cache | `priceCache` + `assetMeta` — کش موقتی است (نه منبع حقیقت) |
| **سرمایه شبیهسازی** (۳۲٬۵۱۶ / ۲۳٬۱۲۶) | **Hardcoded** | `BASE_CAPITAL_2025/2026` — سناریوی «صرفاً فرضی» با سلب مسئولیت (طراحی عمدی) |
| **حالت UI** (سایدبار/تم) | localStorage | کلیدهای `app:*` |

**جمعبندی:** دادههای «کاربری/مالی» واقعی = IndexedDB محلی. داده بازار = کش موقتی (هرگز منبع حقیقت نیست). داده شبیهسازی = Hardcoded فرضی (عمدی).

---

## ۳) ⚠️ مهمترین محدودیت فنی (قبل از هر تصمیم)

**مرورگر نمیتواند مستقیم به PostgreSQL وصل شود.**
- `DATABASE_URL` فقط در سمت سرور قابل استفاده است.
- قرار دادن DATABASE_URL در کد کلاینت = نقض قانون Security خود شما (Secret داخل کد ممنوع).
- Vercel **استاتیک** (فقط ZIP آپلود) نمیتواند Query دیتابیس بزند.

### تنها مسیر درست معماری:
```
UI (مرورگر)
   ↓  HTTPS (fetch)
Vercel Serverless Functions  ← api/ داخل پروژه (Vercel آنها را خودکار deploy میکند)
   ↓  @neondatabase/serverless
Neon PostgreSQL (DATABASE_URL — فقط سرور)
```

یعنی پروژه باید **یک لایه API سرورلس** داشته باشد (پوشه `api/` + چند تابع Node).
Vercel این را با همان آپلود ZIP پشتیبانی میکند (بدون نیاز به سرور جدا) — فقط ساختار پروژه کمی تغییر میکند.

---

## ۴) چه بخشهایی نیاز به Migration دارند؟

### باید Database-محور شوند (طبق خواسته شما)
1. **حسابداری** — `accAccounts/accEntries/accLots/accEvents` → جدولهای معادل در Postgres (دقیقاً همین ۴ جدول؛ حذف نشوند). قوانین: دوسویه، دفتر کل، Immutable، Audit، جدایی Market Value.
2. **سرمایه/پورتفولیوی کاربر** → جدول `portfolioAssets` + حسابهای نقد (پیشنهاد شما، هماهنگ با accAccounts).
3. **داشبورد** → فقط View: از Snapshotها/Repository بخواند (جدول `dashboardSnapshots` — فقط برای تاریخچه، نه منبع اصلی؛ منبع اصلی = حسابداری).
4. **تنظیمات/نرخ ارز/Watchlist** → اختیاری (میخواهید؟ در سؤال ۳).

### Database-محور **نمی**شوند (با حفظ کامل)
- **Market Analysis** (`features/markets`, `market`, `marketData`): لمس نمیشود — قیمتها همچنان کش زنده هستند.
- **Simulation Engine**: موتور محاسباتی دست نمیخورد؛ «سرمایه فرضی» سیمولیشن عمداً سناریوی نمایشی میماند (سلب مسئولیت).
- **خودرو/ملک**: داده محلی (اسنپشات دستی کاربر) — میتوان بعداً افزود؛ الان دست نمیخورند.
- **UI / Design System / Routing / کامپوننتها**: بدون دلیل تغییر نمیکنند (طبق قانون شما).
- **جداول Dexie حذف نمیشوند** — محلی بهعنوان «آفلاینفرست + کش» باقی میمانند (PWA آفلاین).

---

## ۵) چه فایلهایی تغییر خواهند کرد؟ (پس از تأیید)

```
.env.example                                  ← ایجاد (بدون مقدار واقعی)
src/lib/database/client.ts                    ← اتصال مرکزی Neon (فقط سرور/توابع)
src/lib/database/schema.sql                   ← DDL جداول (برای اعمال در Neon)
src/lib/database/migrate.ts                   ← اجرای Schema (اختیاری — از API)
src/repositories/accountingRepository.ts      ← واسط + پیادهسازی Neon
src/repositories/portfolioRepository.ts
src/repositories/dashboardRepository.ts
src/repositories/localAccounting.ts           ← پیادهسازی Dexie (آفلاین) — موجود حفظ
api/accounting.ts · api/portfolio.ts · api/dashboard.ts · api/health.ts   ← Vercel Functions
vercel.json                                   ← مسیر SPA + Rewrites (فقط اگر API اضافه شود)
src/features/accounting/data/…                ← لایه خواندن از Repository (واسط یکسان)
src/features/eth-summary/presentation/…       ← فقط در صورت نیازِ خواندن از API
src/features/markets/… · simulation/…         ← عمداً تغییر نمیکنند
```

**الگوی پیشنهادی:** `Repository Interface` یکسان با **دو پیادهسازی**:
- `Local (Dexie)` — همان رفتار فعلی (آفلاین، بدون DATABASE_URL)
- `Remote (Neon via /api)` — وقتی `DATABASE_URL` در سرور موجود باشد

این یعنی: اپ بدون هیچ Env هم مثل امروز کار میکند (Build بدون Secret موفق) و با اضافهکردن Env در Vercel، خودکار به Neon وصل میشود.

---

## ۶) جدولهای پیشنهادی Neon (هماهنگ با معماری فعلی)

```sql
-- حسابداری (دقیقاً معادل Dexie — Backward Compatible)
accAccounts (key TEXT PK, name, kind, currency, createdAt)
accEntries  (id BIGSERIAL PK, date, createdAt, payload JSONB)   -- سند دوسویه
accLots     (id BIGSERIAL PK, asset, openedAt, payload JSONB)   -- FIFO
accEvents   (id BIGSERIAL PK, at, payload JSONB)                -- Audit Trail

-- پورتفولیو/سرمایه کاربر
portfolioAssets (id, userId, assetType, assetId, quantity,
                 averageCost, purchaseDate, currency, createdAt, updatedAt)

-- تاریخچه داشبورد (فقط View/گزارش)
dashboardSnapshots (id, userId, timestamp, totalValue, totalCost,
                    profitLoss, allocationSnapshot JSONB, createdAt)

-- تنظیمات/نرخ (اختیاری)
userSettings (key TEXT PK, value JSONB)     -- fxRate, watchlist, …
```

> ⚠️ **نکته Auth:** اپ امروز هیچ Login ندارد و `userId` وجود ندارد. بدون Auth، همه کاربران یک userId واحد (مثلاً `'local-user'`) دارند. افزودن Auth واقعی (Supabase/Clerk) کار جداگانهای است — الان اضافه نمیشود مگر بخواهید.

---

## ۷) استراتژی انتقال دادههای فعلی (IndexedDB → Neon)

```
Dexie (محلی)                          Neon (Postgres)
accAccounts ──┐
accEntries  ──┤   Migration Script (در api/migrate یا صفحه «همگامسازی»)
accLots     ──┼──→  INSERT با id یکسان (بدون از دست رفتن)  ──→ جداول Neon
accEvents   ──┘         │
                        └── upsert: در صورت وجود id → skip (idempotent)
```

- **یکطرفه و Idempotent:** دوباره اجرا شود، تکرار نمیشود (بر اساس کلید/ID).
- **حسابداری Immutable:** تراکنشهای گذشته هرگز ویرایش نمیشوند؛ فقط کپی میشوند.
- اگر IndexedDB خالی باشد → شروع تمیز از Neon.

---

## ۸) چطور تضمین میشود چیزی خراب نشود؟

1. **Market Analysis و Simulation:** هیچ فایلی از `features/markets`، `features/market`، `features/marketData`، `features/simulation/domain` تغییر نمیکند — فقط Regression Test اجرا میشود (۶۲۱ تست فعلی + اسموک).
2. **حسابداری:** لایه خواندن به واسط Repository میرود؛ موتورهای محاسباتی (P&L/FIFO/دفتر) دست نمیخورند. رفتار «آفلاین» دقیقاً مثل امروز.
3. **Dual-Backend:** بدون `DATABASE_URL` → Dexie (هیچ تغییری محسوس). با `DATABASE_URL` → Neon.
4. **Build بدون Secret:** `npm run build` باید بدون `.env` سبز بماند (تست میشود).
5. **آزمون‌ها:** Refresh/Reload (ماندگاری)، Create Transaction، Ledger، Balance، Audit، Regression بازار/سیمولیشن.

---

## ۹) محدودیت صادقانه Sandbox

- در این سندباکس **DATABASE_URL واقعی وجود ندارد** — اتصال زنده به Neon را نمیتوانم اینجا تست کنم.
- میتوانم: معماری/کد/مایگریشن SQL/تستها را کامل بسازم و `npm run build` + ۶۲۱ تست را سبز نگه دارم.
- تست واقعی Neon پس از افزودن Env در Vercel توسط شما انجام میشود (یا اگر DATABASE_URL بدهید، همینجا).

---

## ۱۰) سؤالات قبل از شروع (پاسخ دهید تا اجرا کنم)

1. **لایه سرورلس**: اجازه دارید پوشه `api/` (Vercel Functions) + `vercel.json` اضافه شود؟ (تنها راه اتصال به Postgres از این SPA)
2. **Auth**: اپ Login ندارد — userId ثابت تککاربره بگذارم؟ یا Auth جدا میخواهید؟
3. **نرخ ارز/Watchlist/تنظیمات**: به Neon منتقل شوند یا فعلاً محلی بمانند؟
4. **سرمایه شبیهسازی** (۲۳٬۱۲۶): عمداً Hardcoded فرضی میماند یا میخواهید واقعاً کاربری/قابل ویرایش شود؟
5. **حسابداری**: انتقال خودکار یکباره (دکمه/اسکریپت) مورد تأیید است؟
