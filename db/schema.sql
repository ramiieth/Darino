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

-- ------------------------------------------------------------
-- بازار املاک (Property Market) — کلکشنر Divar + Snapshotهای بازار
-- قوانین:
--   * آگهی‌ها (pmListings): کلید (کاربر، توکن دیوار) — حذف تکراری با توکن
--   * Snapshotها (pmSnapshots): تاریخچه بازار — الحاقی/Immutable (هرگز
--     رونویسی نمی‌شود؛ §۲۰ مأموریت). آمار فقط «تومانی» ذخیره می‌شود؛
--     تبدیل دلاری با نرخ زنده در لایه سرویس اپ انجام می‌شود.
--   * نرخ دلار منبع جداگانه ندارد — از جدول/سرویس موجود (fx) اپ خوانده می‌شود.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "pmListings" (
  "userId"    TEXT NOT NULL DEFAULT 'local-user',
  token       TEXT NOT NULL,              -- شناسه آگهی دیوار
  city        TEXT NOT NULL DEFAULT 'ahvaz',
  payload     JSONB NOT NULL,             -- PropertyMarketListing کامل
  "listedAt"  BIGINT,
  "scrapedAt" BIGINT NOT NULL,
  PRIMARY KEY ("userId", token)
);
CREATE INDEX IF NOT EXISTS idx_pmListings_city ON "pmListings" ("userId", city, "scrapedAt");

CREATE TABLE IF NOT EXISTS "pmSnapshots" (
  "userId"    TEXT NOT NULL DEFAULT 'local-user',
  id          TEXT NOT NULL,              -- pmsnap-{ts} / legacy-{id}
  "dateTs"    BIGINT NOT NULL,
  payload     JSONB NOT NULL,             -- PropertyMarketSnapshot (آمار + گزارش پاک‌سازی)
  "createdAt" BIGINT NOT NULL,
  PRIMARY KEY ("userId", id)
);
CREATE INDEX IF NOT EXISTS idx_pmSnapshots_date ON "pmSnapshots" ("userId", "dateTs");

-- ------------------------------------------------------------
-- احراز هویت با Passkey (WebAuthn) — تک‌کاربره، چنددستگاهی
--   * فقط کلید عمومی passkey ذخیره می‌شود (هیچ کلید خصوصی/رمز)
--   * از توکن نشست فقط هش SHA-256 ذخیره می‌شود
--   * بازگشت: این جدول‌ها مستقل‌اند؛ حذفشان فقط ورود را غیرفعال می‌کند (داده‌ها دست نمی‌خورند)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "authCredentials" (
  id            TEXT PRIMARY KEY,           -- credential ID (base64url)
  "userId"      TEXT NOT NULL,
  "publicKey"   TEXT NOT NULL,              -- COSE public key (base64url)
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "deviceType"  TEXT,
  "backedUp"    BOOLEAN NOT NULL DEFAULT false,
  label         TEXT NOT NULL DEFAULT '',
  "createdAt"   BIGINT NOT NULL,
  "lastUsedAt"  BIGINT
);
CREATE INDEX IF NOT EXISTS idx_authCredentials_user ON "authCredentials" ("userId");

CREATE TABLE IF NOT EXISTS "authChallenges" (
  id            TEXT PRIMARY KEY,
  challenge     TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  "userId"      TEXT,
  "expiresAt"   BIGINT NOT NULL,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "authSessions" (
  id             TEXT PRIMARY KEY,
  "tokenHash"    TEXT NOT NULL UNIQUE,
  "userId"       TEXT NOT NULL,
  "credentialId" TEXT,
  "createdAt"    BIGINT NOT NULL,
  "lastSeenAt"   BIGINT NOT NULL,
  "expiresAt"    BIGINT NOT NULL,
  "revokedAt"    BIGINT,
  "stepUpAt"     BIGINT NOT NULL DEFAULT 0,
  "userAgent"    TEXT NOT NULL DEFAULT '',
  ip             TEXT NOT NULL DEFAULT '',
  label          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_authSessions_user ON "authSessions" ("userId", "lastSeenAt");

CREATE TABLE IF NOT EXISTS "authPairCodes" (
  "codeHash"         TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL,
  "expiresAt"        BIGINT NOT NULL,
  "createdBySession" TEXT,
  "usedAt"           BIGINT
);

CREATE TABLE IF NOT EXISTS "authEvents" (
  id          BIGSERIAL PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  at          BIGINT NOT NULL,
  kind        TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_authEvents_user ON "authEvents" ("userId", at);
CREATE INDEX IF NOT EXISTS idx_authEvents_ip ON "authEvents" (ip, at);

-- رمز عبور (جایگزین/کنار کلید عبور) — فقط هش scrypt؛ کد ۶ رقمی (TOTP) اختیاری
CREATE TABLE IF NOT EXISTS "authPassword" (
  "userId"       TEXT PRIMARY KEY,
  hash           TEXT NOT NULL,
  "totpSecret"   TEXT,
  "totpPending"  TEXT,
  "totpLastStep" BIGINT NOT NULL DEFAULT 0,
  "failCount"    INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"  BIGINT NOT NULL DEFAULT 0,
  "updatedAt"    BIGINT NOT NULL
);

-- ------------------------------------------------------------
-- دارایی چندشبکه‌ای — همگام‌سازی بین دستگاه‌ها (وب + PWA آیفون)
--   هر رکورد با (revision, updatedAt) نسخه‌گذاری می‌شود؛ نسخهٔ جدیدتر برنده است.
--   حذف سخت ندارد (باطل‌کردن/بایگانی = نسخهٔ جدید).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "custodyRecords" (
  "userId"     TEXT NOT NULL,
  collection   TEXT NOT NULL,               -- holdings | operations | networks | assets
  id           TEXT NOT NULL,
  revision     INTEGER NOT NULL,
  "updatedAt"  BIGINT NOT NULL,
  payload      JSONB NOT NULL,
  PRIMARY KEY ("userId", collection, id)
);

-- ------------------------------------------------------------
-- نسخهٔ اسکیما — اثر انگشت (SHA-256) همین فایل پس از آخرین اعمال موفق.
-- اگر این فایل تغییر کند (جدول/ستون/ایندکس جدید)، در اولین Deploy یا اولین درخواست
-- همهٔ statementها دوباره (idempotent) اجرا می‌شوند؛ نیازی به db:migrate دستی نیست.
--
-- قانون افزودن فیچر جدید:
--   • جدول جدید:  CREATE TABLE IF NOT EXISTS "name" (...)
--   • ستون جدید:  ALTER TABLE "name" ADD COLUMN IF NOT EXISTS "col" TYPE [DEFAULT ...]
--   • ایندکس:     CREATE INDEX IF NOT EXISTS ...
--   • هرگز DROP / TRUNCATE / DELETE / تغییر نوع ستون موجود (اجرا متوقف می‌شود).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "schemaMeta" (
  id          INTEGER PRIMARY KEY,
  hash        TEXT NOT NULL,
  "appliedAt" BIGINT NOT NULL
);

-- ============================================================
-- Migration راهنمای اجرا:
--   1) روی Vercel: متغیر DATABASE_URL را تنظیم کنید
--   2) خودکار: هنگام Build (ensure-schema) + هنگام اولین درخواست (گارد runtime)
--   3) دستی:  npm run db:migrate   (از محیط دارای DATABASE_URL)
--   4) یا:    psql "$DATABASE_URL" -f db/schema.sql
-- اجرای مجدد بی‌خطر است (IF NOT EXISTS).
-- ============================================================
