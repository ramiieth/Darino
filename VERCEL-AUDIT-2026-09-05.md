# گزارش آدیت دیپلوی دارینو روی Vercel — ۵ سپتامبر ۲۰۲۶

> این گزارش نتیجه بررسی مستقل کل پروژه (سورس + بیلد + تست + رفتار ران‌تایم) است،
> شامل راستی‌آزمایی ادعاهای گزارش قبلی، یافتن باگ‌های جدید، فیکس‌ها و چک‌لیست دیپلوی.

## ۱) خلاصه اجرایی (جواب کوتاه)

| سؤال | جواب |
|---|---|
| پروژه آماده دیپلوی است؟ | ✅ **بله — پس از فیکس‌های این برنچ.** بیلد Vercel (`vercel-build`) با exit 0، هر ۶۳۹ تست سبز، باندل Production سالم. |
| بازار کار می‌کند؟ | ✅ **بله، به‌شرط دیپلوی تمیز.** کلاینت Production به `/api/cg` و `/api/boros` وصل می‌شود (تأیید در باندل) و هر دو فانکشن تست شدند. بازار در حالت خطا عمداً «کش/اسنپ‌شات» نشان می‌دهد، نه عدد جعلی. |
| چرا روی Vercel خطا می‌داد؟ | گزارش قبلی هر ۶ ریشه را درست تشخیص داده بود (تأیید شد). **یک باگ بحرانی جدید** هم پیدا شد که در هیچ گزارشی نبود (بخش ۲). |

## ۲) یافته‌های جدید این آدیت (مهم)

### 🔴 P0 — باگ Case-Sensitivity در PostgreSQL (همه APIهای Neon را ۵۰۰ می‌کرد)

- `db/schema.sql` جدول‌ها/ستون‌ها را **بدون دابل‌کوتیشن** می‌ساخت → PostgreSQL همه را lowercase می‌کند (`accaccounts.userid`, `namefa`, …).
- ولی `api/accounting.ts` ،`portfolio.ts` ،`dashboard.ts` همه شناسه‌ها را **Quoted و camelCase** استفاده می‌کنند (`"userId"`، `"assetType"`، …).
- نتیجه: **هر درخواست GET/POST به هر سه endpoint با `column "userId" does not exist` می‌ترکد (۵۰۰)** — با اثبات اجرایی (pg-mem، بخش ۴).
- بدتر: `/api/health` سبزِ دروغین می‌داد، چون `to_regclass('public.accAccounts')` بدون کوتیشن هم fold می‌شود و جدول خراب را «موجود» گزارش می‌دهد → DDL ترمیمی هم اجرا نمی‌شد.
- کلاینت این ۵۰۰ها را می‌بلعد و به Dexie محلی برمی‌گردد → کاربر فقط «همگام نشدن» و «داده ناکافی» می‌بیند.

**فیکس (همین برنچ):**
- `db/schema.sql`: همه شناسه‌های camelCase داخل دابل‌کوتیشن (جدول + ستون + قیود).
- `api/accounting.ts` ،`portfolio.ts` ،`dashboard.ts`: نام جدول‌ها هم Quoted شد (قاعده واحد: همه‌چیز Quoted، بدون تکیه بر fold).
- `api/_schema.ts` و `scripts/ensure-schema.mjs`: چک `to_regclass('public."accAccounts"')` با کوتیشن → روی دیتابیس‌های قدیمی (lowercase) هم خودترمیم (self-heal) می‌کند.
- `src/repositories/syncScenarios.test.ts`: تست قدیمی با نام بدون کوتیشن اصلاح شد + **۳ تست نگهبان رگرسیون** (هر شناسه Quoted در api باید در schema باشد؛ چک regclass باید Quoted باشد).
- `scripts/migrate-db.mjs`: پارسر یکسان با ensure-schema (حذف کامنت‌ها).

> ⚠️ اگر schema قدیمی قبلاً روی Neon شما اعمال شده، جدول‌های lowercase خالی و بلااستفاده مانده‌اند. بعد از دیپلوی موفق و اطمینان از خالی بودن، دستی حذفشان کنید (دستور در بالای `db/schema.sql`).

### 🟠 P0 — سورس در گیت نبود (فقط ZIP)

- ریپوی گیت‌هاب فقط `darino-deploy.zip` داشت؛ **دیپلوی خودکار Vercel از روی گیت غیرممکن بود** (package.json در ریشه نیست).
- **فیکس:** سورس کامل در ریشه همین برنچ استخراج شد و ZIP از ترکینگ خارج شد. از این پس Vercel را به گیت وصل کنید، نه آپلود ZIP.

### 🟡 P1 — ریسک همراه‌نشدن `db/schema.sql` با فانکشن‌ها

- `api/_schema.ts` در ران‌تایم `db/schema.sql` را با `fs` می‌خواند؛ اگر Vercel آن را همراه فانکشن باندل نکند → ۵۰۳ در health و هر سه API دیتابیسی.
- **فیکس:** `vercel.json` → `functions.includeFiles: db/schema.sql` برای هر ۴ فانکشن دیتابیسی + پیام خطای شفاف در `_schema.ts` (با همان رفتار graceful قبلی: ۵۰۳، نه ۵۰۰).

### 🟡 P1 — موارد کوچک

- `.gitignore`: مسیر `/dist` اضافه شد.
- کلیدهای API هاردکدشده (۵ کلید AlphaVantage در باندل کلاینت + کلید demo کوین‌گکو در `api/cg.ts` و `vite.config.ts`): کار می‌کنند ولی بهداشت امنیتی نیستند — بخش ۵.

## ۳) راستی‌آزمایی ادعاهای گزارش قبلی (همه تأیید شد)

| # | ادعا | نتیجه بررسی |
|---|---|---|
| ۱ | ZIP تودرتو باعث `vite: command not found` بود | ✅ ساختار ZIP فعلی در ریشه درست است؛ `npm ci` و بیلد سبز |
| ۲ | بیلد اولیه اجرا نشده بود (index.html سورس سرو می‌شد) | ✅ خروجی `dist/index.html` فعلی به `/assets/*` اشاره می‌کند؛ هیچ ارجاع `/src/` در dist نیست |
| ۳ | پروکسی بازار فقط dev بود؛ حالا `api/cg.ts` + `api/boros.ts` هست | ✅ هر دو فانکشن موجود و تست‌شده؛ باندل PROD فقط `/api/cg` و `/api/boros` را صدا می‌زند؛ هیچ نشانی از `coingecko-api`/`boros-api` در باندل نیست |
| ۴ | ترکیب کلاینت-جدید + سرور-قدیمی (۴۰۴ها) | ✅ با دیپلوی تمیز از گیت (یک پروژه، یک deployment) حل می‌شود — چک‌لیست بخش ۶ |
| ۵ | باگ `sql()` به‌جای `sql.unsafe()` در ensure-schema | ✅ در کد فعلی درست است (`sql.unsafe(st)`) |
| ۶ | سردرگمی دو دامنه + SSO روی Preview | ✅ مدیریتی است: Deployment Protection را برای Production خاموش/محدود کنید؛ پروژه‌های اضافه را حذف کنید |

## ۴) نتایج راستی‌آزمایی اجرایی (همه در همین محیط)

| آزمون | نتیجه |
|---|---|
| `npm ci` (همگامی lockfile) | ✅ exit 0، ~۷ ثانیه |
| `npm run vercel-build` (دقیقاً دستور Vercel: ensure-schema + tsc کلاینت + tsc سرور + vite + PWA) | ✅ exit 0؛ بدون DATABASE_URL با پیام فارسی soft-skip می‌شود |
| `npx vitest run` | ✅ ۳۲ فایل / **۶۳۹ تست سبز** (۶۳۶ قبلی + ۳ نگهبان جدید) |
| اثبات باگ قدیمی: schema قبلی + کوئری‌های دقیق api در شبیه‌ساز Postgres | ❌ هر ۴ کوئری: `column "userId" does not exist` (باگ تأیید شد) |
| اثبات فیکس: schema جدید + همان کوئری‌ها (+ شکل کلیدهای `SELECT *` برای کلاینت) | ✅ ۵/۵ موفق |
| تست handlerها با fetch ساختگی: نگاشت `/api/cg/*` → `api.coingecko.com/api/v3/*` + تزریق کلید؛ `/api/boros/*` → `api-boros.pendle.finance/apis/v1/*`؛ خطای upstream → ۵۰۲ کنترل‌شده؛ health بدون DB → `{ok:true,database:"local"}` | ✅ ۴/۴ موفق |
| بازبینی باندل Production | ✅ ارجاع `/api/cg` و `/api/boros`؛ بدون نشت مسیرهای dev؛ بدون ارجاع `/src/` |
| `vite preview` روی dist | ✅ `/` و manifest و آیکون‌ها ۲۰۰ |

> محدودیت محیط: خروجی مستقیم به CoinGecko/Pendle/AlphaVantage در سندباکس بسته است؛
> تست زنده upstream باید پس از دیپلوی با چک‌لیست بخش ۶ انجام شود (Vercel خروجی کامل دارد).

## ۵) ریسک‌های باقی‌مانده (غیرمسدودکننده، ولی بدانید)

1. **سهمیه مشترک کلید demo کوین‌گکو:** همه بازدیدکنندگان از یک کلید استفاده می‌کنند (~۳۰ req/min). با ترافیک بالا، 429 و نشان «کش» بیشتر می‌شود. راه‌حل: `COINGECKO_API_KEY` اختصاصی در Env ورسل (پلن Pro/پولی برای ترافیک جدی).
2. **AlphaVantage رایگان فقط ۲۵ درخواست/روز/کلید** است و کلیدها داخل باندل کلاینت عمومی‌اند (قابل چرخش توسط دیگران). تب TradFi عمداً «مرجع» است و زنده نیست — این رفتار طراحی است، نه باگ.
3. **متغیرهای محیطی Build-time:** `DATABASE_URL` باید در همه Environmentها (شامل Build) در دسترس باشد تا schema هنگام بیلد اعمال شود؛ وگرنه گارد runtime در اولین درخواست می‌سازد (کندتر ولی سالم).
4. **دیتابیس قدیمی:** جدول‌های lowercase یتیم (بخش ۲) را پس از اطمینان دستی پاک کنید.
5. **PWA و کش:** بعد از هر دیپلوی، نسخه جدید Service Worker ممکن است با یک رفرش دیر به‌روز شود؛ در تست پسادیپلوی از پنجره ناشناس/هاردرفرش استفاده کنید.

## ۶) چک‌لیست دیپلوی (قدم‌به‌قدم)

1. همین برنچ (`arena/01a06eb8-darino`) را در PR مرج کنید به `main`.
2. در Vercel: پروژه‌های/دامنه‌های قدیمی و Previewهای اضافی را حذف کنید (یک پروژه تمیز).
3. پروژه را به ریپوی گیت‌هاب وصل کنید (Import Git Repository) — **دیگر ZIP آپلود نکنید.**
4. Environment Variable فقط: `DATABASE_URL` (همه Environmentها). اختیاری: `COINGECKO_API_KEY`.
5. Deploy → لاگ بیلد باید شامل این‌ها باشد: `vercel-build`، پیام ensure-schema (✅ آماده یا ℹ️ محلی)، `tsc` بدون خطا، `vite build` و `PWA ... precache`.
6. تست پسادیپلوی (مرورگر/کرل):
   - `/api/health` → `{"ok":true,"database":"connected"}`
   - `/api/cg/coins/markets?vs_currency=usd&per_page=2` → JSON واقعی (نه ۴۰۴)
   - `/api/boros/markets` → JSON (نه ۴۰۴)
   - صفحه بازار → قیمت **زنده** (بدون برچسب کش در بار اول)؛ تب‌ها بدون «داده ناکافی»
   - یک تراکنش آزمایشی در حسابداری → در Neon ذخیره و پس از رفرش باقی بماند (اثبات سلامت case-fix)
7. اگر `/api/health` همچنان ۵۰۰ داد: Build Logs را بفرستید (احتمال ۹۰٪: deployment قدیمی هنوز سرو می‌شود یا DATABASE_URL اشتباه است).

## ۷) فایل‌های تغییرکرده در این برنچ

- استخراج سورس به ریشه گیت؛ حذف `darino-deploy.zip` از ترکینگ
- `db/schema.sql` — Quoted شدن همه شناسه‌های camelCase (+ راهنمای پاک‌سازی جدول‌های قدیمی)
- `api/accounting.ts` ،`api/portfolio.ts` ،`api/dashboard.ts` — Quoted شدن نام جدول‌ها
- `api/_schema.ts` — چک regclass دقیق + خطای شفاف برای فایل schema
- `scripts/ensure-schema.mjs` — چک regclass دقیق
- `scripts/migrate-db.mjs` — پارسر یکسان و امن
- `vercel.json` — `includeFiles: db/schema.sql` برای ۴ فانکشن دیتابیسی
- `.gitignore` — افزودن `/dist`
- `src/repositories/syncScenarios.test.ts` — اصلاح + ۳ تست نگهبان رگرسیون
- این گزارش (`VERCEL-AUDIT-2026-09-05.md`)
