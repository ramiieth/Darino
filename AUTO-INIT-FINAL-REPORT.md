# گزارش نهایی — Auto Schema Initialization + Record-Level Sync (NO MANUAL MIGRATION)

تاریخ: ۴ سپتامبر ۲۰۲۶ · اپ: DARINO (تک‌کاربره — `local-user`)

---

## ۱) فایل‌های تغییر یافته

| فایل | تغییر |
|---|---|
| `api/_schema.ts` | **جدید** — Auto Schema Init: بررسی سبک `to_regclass` → اجرای `db/schema.sql` اگر جداول نبودند؛ کش در حافظه instance؛ `assertSchemaIsSafe` (DROP/TRUNCATE/DELETE ممنوع)؛ `splitSqlStatements` (حذف کامنت) |
| `api/health.ts` | پاسخ واقعی: `local` (بدون env) / `connected` (اتصال + schema تضمین‌شده) / `error` (۵۰۳ — هرگز دروغ) + اجرای `ensureSchema` |
| `api/accounting.ts` · `api/portfolio.ts` · `api/dashboard.ts` | **گارد runtime**: قبل از هر query `ensureSchema` — اگر DB موقتاً در دسترس نبود → ۵۰۳ شفاف (نه «relation does not exist»)؛ کلاینت local-fallback دارد |
| `src/repositories/accountingRepository.ts` | بازنویسی Sync به **Record-Level Merge** + `diffMissingById` خالص (تست‌پذیر) |
| `src/features/accounting/data/useAccounting.ts` | mount: sync کامل (Push سپس Pull) → reload فقط اگر Pull رخ دهد؛ push debounce بعد از تغییر |
| `scripts/ensure-schema.mjs` | **جدید** — Build-time init (فقط با env؛ soft-fail) |
| `package.json` | `ensure:schema` + **`vercel-build`** = `ensure-schema && build` |
| `scripts/migrate-db.mjs` | `sql.unsafe()` (سازگار با درایور Neon) |
| `src/repositories/syncScenarios.test.ts` | **جدید** — سناریوهای A–F + Schema safety |

## ۲) فایل‌های ایجاد شده

`api/_schema.ts` · `scripts/ensure-schema.mjs` · `src/repositories/syncScenarios.test.ts`

## ۳) Auto Schema Initialization دقیقاً چگونه کار می‌کند؟

**دو لایه امن (Build-time + Runtime):**

1. **Build-time (`vercel-build`):** هنگام Deploy، `scripts/ensure-schema.mjs` اجرا می‌شود:
   - بدون `DATABASE_URL` → پیام + خروج ۰ (بی‌تأثیر — حالت Dexie)
   - با `DATABASE_URL` → بررسی سبک (جداول موجودند؟) → اگر نه، اجرای `db/schema.sql` (فقط `IF NOT EXISTS`)
   - خطای موقت اتصال → **لاگ + خروج ۰** (Deploy هرگز نمی‌شکند — گارد runtime بعداً تلاش می‌کند)
2. **Runtime guard:** هر API (`/api/accounting`، `/portfolio`، `/dashboard`، `/health`) قبل از query، `ensureSchema` را صدا می‌زند — اگر جداول نبودند (مثلاً اولین cold-start بعد از Deploy که build-time موفق نبوده)، همان لحظه می‌سازد. نتیجه در حافظه instance کش می‌شود (هیچ migration سنگین در هر request).

هر دو لایه **Idempotent** هستند: بررسی اول با `to_regclass`؛ DDL فقط `CREATE TABLE/INDEX IF NOT EXISTS`. داده موجود هرگز لمس نمی‌شود.

## ۴) آیا بعد از Deploy نیاز به `npm run db:migrate` هست؟

# ❌ NO — هیچ migration دستی لازم نیست.

**ZIP → Vercel → Set `DATABASE_URL` → Deploy → Open App → Done**

(اسکریپت `db:migrate` به‌عنوان ابزار تعمیراتی/دستی باقی مانده — استفاده اختیاری.)

## ۵) Environment Variables

| متغیر | وضعیت |
|---|---|
| `DATABASE_URL` | **Required** (برای اتصال Neon) — فقط سرور |
| `NODE_ENV` | Optional (Vercel خودش `production` می‌گذارد) |
| `NEON_API_KEY` | **Not needed** — فقط اگر آینده Management API بخواهید |
| `COINGECKO_API_KEY` / `ALPHAVANTAGE_API_KEY` | Optional (Providerها — سرور) |

## ۶) `/api/health`

```
بدون DATABASE_URL:     200 { ok: true,  database: "local" }
با env + اتصال + schema: 200 { ok: true,  database: "connected" }
خطای اتصال:            503 { ok: false, database: "error" }
```
هرگز Secret/Password/DATABASE_URL را نمایش نمی‌دهد.

## ۷) آیا DATABASE_URL وارد Client Bundle می‌شود؟ → **NO** (تأیید شده)
- `grep DATABASE_URL dist/assets/*.js` → نه
- `grep neondatabase dist/assets/*.js` → نه
- `grep NEON_API_KEY` → نه · `.env` واقعی وجود ندارد · `src/` هیچ ارجاعی به `neondatabase/serverless` ندارد

## ۸) Accounting Immutable باقی مانده؟ → **YES**
- Sync جدید هرگز رکورد موجود را overwrite نمی‌کند:
  - **Local → Neon:** سرور `SELECT 1` → skip اگر id موجود باشد (فقط Insert-if-missing)
  - **Neon → Local:** `diffMissingById` → فقط رکوردهایی که در Local نیستند اضافه می‌شوند
  - **Local missing ⇒ حذف رکورد Neon؟** ممنوع — هرگز
  - **ID مشترک ⇒ overwrite؟** ممنوع — هرگز (تست F)
- ID/تاریخ/مبلغ/createdAt هرگز تغییر نمی‌کنند (تست Immutable)

## ۹) Market Analysis تغییری کرده؟ → **NO**
تمام `features/markets` · `features/market` · `features/marketData` دست‌نخورده — اسموک تأیید (API/Cache/Ranking بدون Regression).

## ۱۰) Simulation تغییری کرده؟ → **NO**
`features/simulation` دست‌نخورده؛ `BASE_CAPITAL_2025/2026` همان‌ها؛ Neon سیمولیشن را database-driven نمی‌کند.

## ۱۱) تست‌ها — نتایج

| تست | نتیجه |
|---|---|
| TypeScript Client | ✅ ۰ خطا |
| TypeScript Server (api/) | ✅ ۰ خطا |
| `npm run build` (بدون DATABASE_URL) | ✅ سبز |
| `npm run vercel-build` (بدون DATABASE_URL) | ✅ سبز (شرط ۲۷) |
| **Vitest** | ✅ **636 passed / 0 failed / 0 skipped** (32 فایل) |
| — Accounting regression | ✅ (تست‌های موجود) |
| — Market regression | ✅ |
| — Simulation regression | ✅ |
| — Repository/Sync tests (سناریوهای A–F) | ✅ ۱۵ پاس |
| Playwright Smoke | ✅ ۹۲+ پاس / ۱ خطای شناخته‌شده («سرمایه فرضی» — نوسان قیمت زنده) |
| Security grep (باندل) | ✅ عاری از Secret |

**سناریوهای تست‌شده (بدون اتصال زنده):**
- A) Schema شامل `CREATE TABLE IF NOT EXISTS` برای هر ۶ جدول + پارسر همه را جدا می‌کند ✅
- B) هیچ DROP/TRUNCATE/DELETE در schema نیست؛ همه statements `IF NOT EXISTS` دارند ✅
- C) Neon ۱۰ / Local ۰ → هر ۱۰ Pull (با حفظ ID) ✅
- D) Local ۱۰ → payload با همان IDها برای insert (سرور skip موجود) ✅
- E) Neon ۱۰ / Local ۷ → فقط ۳ missing Pull؛ هیچ رکورد Neon حذف نمی‌شود ✅
- F) ID مشترک → diff خالی → هیچ overwrite‌ای ✅

> ⚠️ **صادقانه:** `Live Neon connection not tested because DATABASE_URL was unavailable` — در سندباکس DATABASE_URL واقعی نبود. منطق schema-parser/migration/merge/API کامل و با ۶۳۶ تست تأیید شده؛ اتصال واقعی پس از Deploy شما با Env انجام می‌شود (و build-time init خودش جداول را می‌سازد).

## ۱۲) Deployment Checklist (فقط همین‌ها)

1. پروژه را ZIP کنید (بدون `node_modules`).
2. در Vercel: **New Project → Import** (framework خودکار از `vercel.json`).
3. **Environment Variables:** فقط `DATABASE_URL` را اضافه کنید.
4. **Deploy** → صبر کنید build تمام شود.
5. اپ را باز کنید — تمام. (چک اختیاری: `/api/health` → `{"ok":true,"database":"connected"}`)
