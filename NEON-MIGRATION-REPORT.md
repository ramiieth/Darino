# گزارش نهایی — Migration به Neon PostgreSQL + آماده‌سازی Vercel

تاریخ: ۴ سپتامبر ۲۰۲۶ · اپ: DARINO (تک‌کاربره — `local-user`)

---

## خلاصه معماری نهایی

```
Browser (React PWA — بدون تغییر UI)
   ↓  fetch /api/* (relative — فقط userId در هدر)
Vercel Serverless Functions  (پوشه api/)
   ↓  @neondatabase/serverless (فقط سرور — DATABASE_URL از env)
Neon PostgreSQL  (SSOT برای داده مالی واقعی)
        ↕
Dexie (IndexedDB) — آفلاین/کش/موقت (حذف نشده)
```

**Dual-Backend:** بدون `DATABASE_URL` → اپ دقیقاً مثل امروز با Dexie کار می‌کند.
با `DATABASE_URL` → داده مالی از Neon خوانده/نوشته می‌شود (همگام‌سازی خودکار).

---

## ۱) فایل‌های تغییر‌یافته/ایجادشده

### ایجاد شده
```
.env.example                              — DATABASE_URL / NEON_API_KEY / NODE_ENV (بدون مقدار)
db/schema.sql                             — DDL کامل (Idempotent — IF NOT EXISTS)
api/_neon.ts                              — اتصال مرکزی Neon + userId + json/readBody (فقط سرور)
api/health.ts                             — GET: وضعیت دیتابیس (هرگز Secret نمایش نمی‌دهد)
api/accounting.ts                         — GET (خواندن کامل) / POST (Upsert Idempotent)
api/portfolio.ts                          — GET / POST upsert / POST delete
api/dashboard.ts                          — GET (آخرین ۹۰ اسنپ‌شات) / POST (ثبت — skip تکراری)
scripts/migrate-db.mjs                    — اجرای Schema روی Neon (npm run db:migrate)
tsconfig.server.json                      — تایپ‌چک جدا برای api/
vercel.json                               — framework vite + functions maxDuration
src/lib/database/constants.ts             — USER_ID = 'local-user' (مرکزی) + API_BASE + isTestMode
src/repositories/types.ts                 — تایپ‌های مشترک (payload/پورتفولیو/اسنپ‌شات)
src/repositories/remoteClient.ts          — fetch امن (timeout، health-cache، غیرفعال در تست/آفلاین)
src/repositories/accountingRepository.ts  — serialize/deserialize + push/pull با حفظ ID
src/repositories/portfolioRepository.ts   — Local (Dexie v9) + Remote (Neon)
src/repositories/dashboardRepository.ts   — اسنپ‌شات‌ها (Local + Remote)
src/repositories/repositories.test.ts     — ۵ تست (round-trip بدون Data Loss، حفظ ID، جدایی)
```

### تغییر یافته (فقط Data Access — بدون UI/Business Logic)
```
package.json                    — deps: @neondatabase/serverless · scripts: db:migrate/typecheck:server/build
src/shared/lib/db.ts            — Dexie v9: جداول portfolioAssets + dashboardSnapshots (آفلاین)
src/features/accounting/data/db.ts — توابع Put-Level با حفظ ID (entryBulkPutExact/lotBulkPutExact/eventBulkPutExact)
src/features/accounting/data/useAccounting.ts — همگام‌سازی پس‌زمینه با Neon (pull-if-needed + push بعد از هر تغییر، debounce)
src/features/boros/domain/engine/requiredTests.test.ts — اصلاح وابستگی تاریخ ثابت → داینامیک (پایدار در گذر زمان)
```

## ۲) فایل‌های عمداً دست‌نخورده (محافظت‌شده)

- **Market Analysis:** تمام `features/markets`، `features/market`، `features/marketData` — API/Cache/Pipeline/Ranking بدون تغییر.
- **Simulation:** تمام `features/simulation` — موتور، Calculatorها، `BASE_CAPITAL_2025/2026` (فرضی — هرگز با User Capital ترکیب نمی‌شود).
- **Pendle/Boros/DeFi/Yield Loop/خودرو/ملک:** Business Logic دست‌نخورده.
- **UI/Design System/Routing/Components:** بدون تغییر.
- **Dexie:** حذف نشده — آفلاین/کش می‌ماند.

## ۳) جدول‌های Neon (schema.sql — Idempotent)

| جدول | توضیح |
|---|---|
| `accAccounts` | PK (userId, key) — حساب‌ها |
| `accEntries` | PK (userId, id) — سندهای دوسویه (payload JSONB) + ایندکس date |
| `accLots` | PK (userId, id) — لات‌های FIFO |
| `accEvents` | PK (userId, id) — رویدادهای ممیزی |
| `portfolioAssets` | UNIQUE (userId, assetType, assetId) — Cost Basis/Quantity (قیمت جاری از Market) |
| `dashboardSnapshots` | UNIQUE (userId, timestamp) — فقط تاریخچه + fxRateUsed همان لحظه (Historical FX) |

## ۴) API Endpointها (Vercel Functions)

| Endpoint | متد | کار |
|---|---|---|
| `/api/health` | GET | `{ ok, database: connected\|not_configured\|error }` — بدون Secret |
| `/api/accounting` | GET/POST | خواندن کامل / Upsert Idempotent |
| `/api/portfolio` | GET/POST | فهرست / upsert / delete |
| `/api/dashboard` | GET/POST | اسنپ‌شات‌ها / ثبت (skip تکراری) |

## ۵) Migration Dexie → Neon — شرح دقیق

**اتوماتیک و شفاف** (بدون نیاز به دکمه):
1. هنگام باز شدن صفحه حسابداری: داده محلی (Dexie) بارگذاری می‌شود (رفتار فعلی — آفلاین).
2. اگر سرور در دسترس باشد (`health` = connected):
   - **Pull-if-needed:** اگر Neon داده دارد و محلی خالی است (Deploy جدید/مرورگر جدید) → محلی از Neon با **حفظ IDها** پر می‌شود.
   - **Push:** اگر محلی داده دارد → کل دیتاست با Upsert Idempotent به Neon فرستاده می‌شود.
3. پس از هر تغییر (debounce ۳ ثانیه): push خودکار کل دیتاست — **اجرای مجدد هرگز Duplicate نمی‌سازد** (چک `SELECT 1` قبل از INSERT؛ رکورد موجود → skip).
4. برای اجرای دستی Schema: `DATABASE_URL=... npm run db:migrate` (یا psql) — Safe/Repeatable.

### جلوگیری از Data Loss و Duplicate
- **حفظ ID:** entries/lots/events با همان id عددی به Neon می‌روند (کلید ترکیبی userId+id).
- **Idempotency:** رکورد موجود → skip (تراکنش‌های Immutable هرگز بازنویسی نمی‌شوند).
- **بدون DROP/TRUNCATE/DELETE** در migration.
- **Historical Data:** نرخ دلار در لحظه اسنپ‌شات داخل همان رکورد (`fxRateUsed`) ذخیره می‌شود — تغییر نرخ امروز هرگز تاریخچه را عوض نمی‌کند.
- **قیمت بازار هیچ‌وقت Transaction نمی‌سازد** — فقط Current Value از Market Data زنده.

## ۶) امنیت

- `DATABASE_URL` فقط در `api/*` (سرور) از `process.env` خوانده می‌شود.
- تأیید خودکار: باندل کلاینت (`dist/assets/*.js`) **فاقد** `DATABASE_URL` و `neondatabase` است (تست grep).
- `@neondatabase/serverless` فقط از پوشه `api/` import می‌شود؛ هرگز از `src/`.
- هیچ Secret در `console.log`/Response/localStorage نیست. `/api/health` فقط وضعیت مفهومی می‌دهد.
- خطاهای سرور فقط پیام کوتاه (۱۶۰ کاراکتر) برمی‌گردانند.
- `.env.example` بدون هیچ مقدار واقعی.

## ۷) Deploy روی Vercel — مراحل دقیق

1. پروژه را ZIP کنید (بدون `node_modules`، بدون `.env*` واقعی).
2. در Vercel: **New Project → Import** (Framework: Vite — خودکار از `vercel.json`).
3. در **Environment Variables** اضافه کنید:
   ```
   DATABASE_URL=postgresql://...
   NODE_ENV=production
   ```
   (اختیاری: `NEON_API_KEY` فقط برای Management API آینده؛ `COINGECKO_API_KEY` / `ALPHAVANTAGE_API_KEY` برای Providerها)
4. **Deploy** — Vercel توابع `api/*` را خودکار به‌صورت Serverless بیلد می‌کند و `dist/` را سرو می‌کند.
5. برای اعمال Schema یک‌بار: در Vercel ترمینال/محلی `DATABASE_URL=... npm run db:migrate`.
6. چک: `https://دامنه/api/health` → `{ "ok": true, "database": "connected" }`.
7. اپ باز شود → داده حسابداری خودکار از Dexie به Neon push می‌شود؛ از این پس Neon = منبع حقیقت.

> ⚠️ نکته: چون روتینگ Hash-based است (`#/...`)، نیازی به Rewrite نیست. Build بدون Secret محلی موفق است (تست شد).

## ۸) Environment Variables

```env
DATABASE_URL=      # الزامی برای اتصال Neon (فقط سرور)
NEON_API_KEY=      # اختیاری — فقط Management API آینده (برای Query استفاده نمی‌شود)
NODE_ENV=          # production روی Vercel
COINGECKO_API_KEY= # اختیاری — سرور-سمت
ALPHAVANTAGE_API_KEY= # اختیاری — سرور-سمت
```

## ۹) تست‌ها — نتایج

| تست | نتیجه |
|---|---|
| TypeScript (client) `tsc --noEmit` | ✅ ۰ خطا |
| TypeScript (server) `tsc -p tsconfig.server.json` | ✅ ۰ خطا |
| Build Production `npm run build` | ✅ سبز (PWA + SW) — بدون هیچ Secret |
| Vitest — کل سویییت | ✅ **۶۲۶ پاس / ۳۱ فایل** (۶۲۱ قبلی + ۵ تست جدید Repositories) |
| Accounting (Create/Ledger/Balance/FIFO/Audit) | ✅ (تست‌های موجود بدون تغییر پاس) |
| Market Regression | ✅ (Pipeline/Cache/Ranking دست‌نخورده — اسموک تأیید) |
| Simulation Regression | ✅ (موتور/سناریو/مقایسه دست‌نخورده) |
| Playwright Smoke | ✅ ۹۲+ پاس / ۱ خطای شناخته‌شده («سرمایه فرضی» — نوسان قیمت زنده) |

> ⚠️ **محدودیت صادقانه:** در این سندباکس DATABASE_URL واقعی وجود ندارد؛ بنابراین اتصال زنده به
> Neon اینجا قابل تست نبود. کد/اسکیما/مایگریشن/تست‌ها کامل ساخته و بیلد بدون Secret سبز است؛
> اتصال واقعی پس از افزودن Env در Vercel انجام می‌شود. در حالت بدون Env، اپ دقیقاً مثل قبل
> (محلی/آفلاین) کار می‌کند — این رفتار در تست‌ها و اسموک تأیید شد.
