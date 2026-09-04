-- ============================================================
-- DARINO — Neon PostgreSQL Schema
-- Migration: Safe / Idempotent / Non-destructive / Repeatable
--   (CREATE TABLE IF NOT EXISTS — بدون DROP/TRUNCATE/DELETE)
--
-- کاربر: تک‌کاربره (local-user) — ستون userId برای Auth آینده آماده است.
-- IDهای حسابداری عددی فعلی (Dexie) حفظ می‌شوند → کلید ترکیبی (userId, id)
-- ============================================================
--
-- ⚠️ قانون حیاتی حروف (Case-Sensitivity):
--   PostgreSQL شناسه‌های «بدون دابل‌کوتیشن» را به lowercase تبدیل می‌کند
--   (accAccounts → accaccounts). اما کوئری‌های api/*.ts ستون‌ها و جدول‌ها را
--   به‌صورت Quoted و camelCase استفاده می‌کنند (مثل "userId"، "assetType").
--   پس «همه نام‌های camelCase در این فایل باید داخل دابل‌کوتیشن باشند»
--   تا دقیقاً همان نامی ساخته شود که API انتظار دارد. حذف کوتیشن‌ها =
--   خطای column "userId" does not exist در همه endpointهای Neon.
--   (تست نگهبان: src/repositories/syncScenarios.test.ts — بخش «Schema/Case»)
--
-- ⚠️ اگر نسخه قبلی (بدون کوتیشن) قبلاً روی دیتابیس شما اعمال شده:
--   جدول‌های lowercase قدیمی (مثل accaccounts) خالی و بلااستفاده‌اند
--   (چون هیچ INSERT موفقی با آن‌ها انجام نشده). پس از اطمینان از خالی بودن،
--   می‌توانید دستی حذفشان کنید:
--     DROP TABLE IF EXISTS accaccounts, accentries, acclots, accevents,
--       portfolioassets, dashboardsnapshots;
--   (این DROP دستی و آگاهانه است — خود schema هرگز DROP ندارد.)
-- ============================================================

-- ------------------------------------------------------------
-- حسابداری — معادل دقیق جداول Dexie (v8): accAccounts/accEntries/accLots/accEvents
-- قوانین: Double Entry · Ledger · FIFO · Audit Trail · Immutable History
-- payloadها JSONB هستند تا ساختار داخلی Types فعلی اپ (بدون بازنویسی) حفظ شود.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "accAccounts" (
  "userId"   TEXT NOT NULL DEFAULT 'local-user',
  key      TEXT NOT NULL,              -- کلید حساب (مثل cash:usdt)
  "nameFa"   TEXT NOT NULL,
  type     TEXT NOT NULL,              -- asset | cash | liability | equity | income | expense
  "createdAt" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("userId", key)
);

CREATE TABLE IF NOT EXISTS "accEntries" (
  "userId"    TEXT NOT NULL DEFAULT 'local-user',
  id        BIGINT NOT NULL,           -- شناسه ترتیبی موجود در Dexie حفظ می‌شود
  date      BIGINT NOT NULL,           -- تاریخ سند (timestamp)
  "createdAt" BIGINT NOT NULL,
  payload   JSONB NOT NULL,            -- { memo, lines:[{account,debit,credit}], source, ... }
  PRIMARY KEY ("userId", id)
);
CREATE INDEX IF NOT EXISTS idx_accEntries_date ON "accEntries" ("userId", date);

CREATE TABLE IF NOT EXISTS "accLots" (
  "userId"    TEXT NOT NULL DEFAULT 'local-user',
  id        BIGINT NOT NULL,
  asset     TEXT NOT NULL,
  "openedAt"  BIGINT NOT NULL,
  payload   JSONB NOT NULL,            -- { qty, unitCost, closedAt?, ... }
  PRIMARY KEY ("userId", id)
);
CREATE INDEX IF NOT EXISTS idx_accLots_asset ON "accLots" ("userId", asset);

CREATE TABLE IF NOT EXISTS "accEvents" (
  "userId"  TEXT NOT NULL DEFAULT 'local-user',
  id        BIGINT NOT NULL,
  at        BIGINT NOT NULL,
  payload JSONB NOT NULL,              -- { kind, refId, detail }
  PRIMARY KEY ("userId", id)
);

-- ------------------------------------------------------------
-- پورتفولیو / سرمایه کاربر (مدل پیشنهادی هماهنگ‌شده با اپ)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "portfolioAssets" (
  id           BIGSERIAL PRIMARY KEY,
  "userId"       TEXT NOT NULL DEFAULT 'local-user',
  "assetType"    TEXT NOT NULL,          -- crypto | tokenized | tradfi | cash
  "assetId"      TEXT NOT NULL,          -- نماد (BTC / AAPLON / ...)
  quantity     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageCost"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchaseDate" BIGINT,
  currency     TEXT NOT NULL DEFAULT 'USD',
  note         TEXT,
  "createdAt"    BIGINT NOT NULL,
  "updatedAt"    BIGINT NOT NULL,
  UNIQUE ("userId", "assetType", "assetId")
);

-- ------------------------------------------------------------
-- اسنپ‌شات داشبورد — فقط برای تاریخچه/نمودار عملکرد (نه منبع اصلی)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dashboardSnapshots" (
  id        BIGSERIAL PRIMARY KEY,
  "userId"    TEXT NOT NULL DEFAULT 'local-user',
  timestamp BIGINT NOT NULL,           -- لحظه ثبت snapshot
  "totalValue" DOUBLE PRECISION NOT NULL,
  "totalCost"  DOUBLE PRECISION,
  "profitLoss" DOUBLE PRECISION,
  "allocationSnapshot" JSONB,            -- { symbol: { value, sharePct } , ... }
  "fxRateUsed" DOUBLE PRECISION,         -- نرخ دلار→تومان در همان لحظه (Historical FX)
  "createdAt" BIGINT NOT NULL,
  UNIQUE ("userId", timestamp)
);

-- ============================================================
-- Migration راهنمای اجرا:
--   1) روی Vercel: متغیر DATABASE_URL را تنظیم کنید
--   2) خودکار: هنگام Build (ensure-schema) + هنگام اولین درخواست (گارد runtime)
--   3) دستی:  npm run db:migrate   (از محیط دارای DATABASE_URL)
--   4) یا:    psql "$DATABASE_URL" -f db/schema.sql
-- اجرای مجدد بی‌خطر است (IF NOT EXISTS).
-- ============================================================
