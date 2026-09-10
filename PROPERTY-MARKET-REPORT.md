# PROPERTY MARKET IMPLEMENTATION REPORT

تاریخ: ۲۰۲۶-۰۹-۱۰ · شعبه: `arena/01a088a8-darino` · مأموریت: حذف ماژول دستی ملک و جایگزینی با سیستم حرفه‌ای تحلیل بازار املاک اهواز (Divar)

---

## 1. Existing architecture (ممیزی دارینو)

- **کلاینت:** React 18 + TypeScript strict + Vite 6 — PWA فارسی/RTL، آفلاین-فرست با Dexie (IndexedDB) نسخه ۹.
- **سرور:** فانکشن‌های سرورلس در `api/` + Neon PostgreSQL (اختیاری؛ فالبک محلی)، الگوی `userId='local-user'`، payloadهای JSONB، جداول camelCase با دابل‌کوتیشن.
- **منبع نرخ دلار موجود:** جدول `fx_rates` در IndexedDB با استور `useFxStore` (نرخ دلار→تومان، قابل تنظیم توسط ادمین در تنظیمات، پیش‌فرض ۱٬۴۸۰٬۰۰۰). **هیچ منبع دلار دیگری در پروژه وجود ندارد.**
- ناوبری: مسیر `/realestate` در App.tsx/Sidebar/BottomNav با برچسب «ملک».

## 2. Old manual property module (ماژول قدیمی)

`src/features/realestate/` — دو گردش‌کار دستی:
- «ثبت قیمت محله» (PriceFormSheet → Snapshotهای Immutable در `realEstateSnapshots`)
- «ثبت دارایی ملک» (AssetFormSheet → `realAssets` با قیمت خرید/ارزش فعلی دستی)
- موتور بازدهی/رتبه‌بندی/مقایسه با بنچمارک + نمودار خطی محله‌ها.

**وابستگی‌ها قبل از حذف شناسایی شد:** فقط `App.tsx` (روت)، `Sidebar/BottomNav` (ناوبری)، `AppProviders` (عنوان سند) و تایپ‌های وارداتی در `shared/lib/db.ts`. هیچ ماژول دیگری (داشبورد/حسابداری/شبیه‌سازی) داده‌های آن را مصرف نمی‌کرد.

## 3. Files removed (حذف‌شده‌ها — ۱۰ فایل)

```
src/features/realestate/data/benchmarks.ts
src/features/realestate/data/catalog.ts
src/features/realestate/data/useRealEstate.ts
src/features/realestate/domain/engine.ts
src/features/realestate/domain/engine.test.ts
src/features/realestate/domain/types.ts
src/features/realestate/presentation/AssetFormSheet.tsx
src/features/realestate/presentation/NeighborhoodChart.tsx
src/features/realestate/presentation/PriceFormSheet.tsx
src/features/realestate/presentation/RealEstatePage.tsx
```

## 4. Files modified (تغییریافته‌ها)

| فایل | تغییر |
|---|---|
| `src/app/App.tsx` | روت `/realestate` → PropertyMarketPage + مسیر جدید `/property-market` |
| `src/shared/components/layout/Sidebar.tsx` | برچسب «بازار املاک» |
| `src/shared/components/layout/BottomNav.tsx` | برچسب «بازار املاک» |
| `src/app/providers/AppProviders.tsx` | عنوان سند «بازار املاک اهواز» |
| `src/shared/lib/db.ts` | نسخه ۱۰: جداول `pmListings`/`pmSnapshots` — جدول‌های قدیمی `realAssets`/`realEstateSnapshots` **حفظ شدند** (حفظ داده تاریخی) |
| `db/schema.sql` | جداول `pmListings`/`pmSnapshots` (append-only) |
| `api/_schema.ts` + `scripts/ensure-schema.mjs` | اضافه شدن جداول جدید به چک سبکِ اسکیمای موجود |
| `vercel.json` | فانکشن `api/propertyMarket.ts` + `maxDuration: 60` |
| `src/repositories/syncScenarios.test.ts` | پوشش تست نگهبان Schema/Case برای فایل سرور جدید |

## 5. Files created (ساخته‌شده‌ها — ۲۴ فایل)

**دامنه خالص (`domain/`):** `types.ts` · `scenarioEngine.ts` (موتور سناریو §۲۷) · `stats.ts` (میانه/میانگین/صدک) · `fx.ts` (تبدیل‌های خالص) + تست‌ها

**کلکشنر (`collector/`):** `endpoints.ts` (endpointهای دیوار + بدنه جستجو) · `client.ts` (شبکه با تزریق fetcher) · `parse.ts` (پارس فهرست/جزئیات/مودال ویژگی‌ها) · `pipeline.ts` (قیف پاک‌سازی) · `run.ts` (اجرای تکه‌ای) + تست‌ها

**داده (`data/`):** `catalog.ts` (محله‌های اهواز + نرمال‌سازی بدون حدس) · `legacyMigration.ts` (مهاجرت داده قدیمی) · `store.ts` (استور + هماهنگی کلکشن) + تست‌ها

**سرویس (`service/`):** `propertyMarketService.ts` (ویوی بازار: دلار فعلی/آینده، موقعیت نسبت به میانه، رتبه‌بندی) + تست

**پرزن‌تیشن (`presentation/`):** `PropertyMarketPage.tsx` · `NeighborhoodTable.tsx` · `ScenarioPanel.tsx` · `CollectorPanel.tsx` · `MarketCharts.tsx` (۴ نمودار) · `LegacyPanel.tsx` + اسموک تست رندر

**سرور/اسکریپت:** `api/propertyMarket.ts` (GET داده + POST collectChunk/finalize) · `scripts/collect-property-market.mjs` (اجرای محلی/کرون با باندل esbuild همان هندلر)

## 6. Database changes

- **Neon:** `"pmListings"` (PK: userId+token — حذف تکراری با توکن) و `"pmSnapshots"` (PK: userId+id — الحاقی/هرگز رونویسی نمی‌شود؛ آمار فقط تومانی ذخیره می‌شود تا تاریخچه به نرخ دلار وابسته نباشد).
- **IndexedDB (Dexie v10):** همان دو جدول برای حالت آفلاین + سناریو در جدول `settings` موجود (کلید `pmScenarioV1`) — **هیچ جدول ارزی جدیدی ساخته نشد.**
- جداول قدیمی `realAssets`/`realEstateSnapshots` دست‌نخورده باقی ماندند.

## 7. Migration changes

- `legacyMigration.ts`: هر Snapshot قدیمی (فقط رکوردهای آپارتمان) به `PropertyMarketSnapshot` با منبع `manual-legacy` تبدیل و در `pmSnapshots` الحاق می‌شود — کیان‌پارس شرقی/غربی و کیان‌آباد شرقی/غربی به کلید واحد ترکیب می‌شوند. اجرا یک‌باره/ایدِمپوتنت با فلگ `pmLegacyMigratedV1` است؛ داده اصلی قدیمی هرگز حذف نمی‌شود و دارایی‌های ثبت‌شده کاربر در پنل فقط‌خواندنی باقی می‌مانند.
- اسکیمای Neon: `ensure-schema` (build-time و ران‌تایم) حالا جداول جدید را هم برای دیتابیس‌های موجود می‌سازد (idempotent).

## 8. Divar integration

بازنویسی کامل تایپ‌اسکریپت مرجع `mobin-torabi/divar-house-scraper` (بررسی‌شده؛ کپی نشده — مرجع پایتون/Excel/تعاملی است و با معماری دارینو سازگار نبود):

- **شهر:** `GET https://api.divar.ir/v8/places/cities` → resolve اهواز با نام/اسلاگ (`matchCity`).
- **فهرست:** `POST https://api.divar.ir/v8/postlist/w/search` با `category: apartment-sell` و صفحه‌بندی کرسری (`pagination.data`/`has_next_page`) — دقیقاً مطابق مرجع.
- **جزئیات:** `GET https://api.divar.ir/v8/posts-v2/web/{token}` فقط برای آگهی‌های فاقد قیمت/متراژ در فهرست (بودجه هر تکه — مناسب سقف زمانی سرورلس؛ فاصله مؤدبانه ~۱ ثانیه).
- **پارس:** ویجت‌های `POST_ROW` (توکن/عنوان/محله/قیمت فرصت‌طلبانه)، `GROUP_INFO_ROW`/`UNEXPANDABLE_ROW` (متراژ، ساخت، اتاق، قیمت کل، قیمت هر متر، طبقه)، `FEATURE_ROW`/`GROUP_FEATURE_ROW` (پارکینگ/آسانسور/انباری/بالکن از آیکون‌ها)، `BREADCRUMB` (نوع ملک) و مودال «ویژگی‌ها و امکانات» — با پارس دفاعی در برابر تغییر ساختار دیوار.
- **کلکشن تکه‌ای:** مرورگر به‌دلیل CORS مستقیم به دیوار نمی‌زند؛ کلکشن فقط از `api/propertyMarket.ts` (سرور) یا اسکریپت کرون انجام می‌شود و کلاینت تکه‌ها را با کرسر حلقه می‌زند.

## 9. Data cleaning (Raw → Normalize → Validate → Deduplicate → Outlier → Market)

- **Normalize:** ارقام فارسی/عربی→لاتین، حذف نویز جهت‌دار، تبدیل «۳ از ۵» به طبقه، محاسبه قیمت/متر از قیمت‌کل÷متراژ در نبود مقدار مستقیم.
- **Validate:** قیمت کل ۱۰۰ میلیون تا ۲ همتا (ضد اسپم، مطابق مرجع)، قیمت/متر ۱ میلیون–۲ میلیارد، متراژ ۱۵–۱۰۰۰؛ بدون قیمت → رد (هرگز داده جعلی جایگزین نمی‌شود)؛ سال نامعتبر → فقط فیلد حذف می‌شود.
- **Deduplicate:** توکن یکسان + اثرانگشت (قیمت‌کل+متراژ+محله+قیمت‌متر) برای آگهی‌های دوباره ثبت‌شده؛ رکورد جدیدتر نگه داشته می‌شود.
- **Outlier:** حصار IQR (Q1−1.5·IQR … Q3+1.5·IQR) محله‌به‌محله با حداقل ۶ نمونه + حصار سراسری برای محله‌های کم‌نمونه.
- **گزارش قیف** (تعداد هر مرحله + دلایل رد) در کلکشنر و در صفحه ذخیره/نمایش داده می‌شود.

## 10. Aggregation methodology

- شاخص اصلی هر منطقه: **میانه قیمت/متر**؛ سپس میانگین، P25، P75 و تعداد آگهی (§۱۹).
- میانه کل اهواز روی **همه آگهی‌های معتبر** (وزن آگهی) — نه میانگین میانه محله‌ها.
- **Snapshotها الحاقی‌اند** (§۲۰): هر اجرا `pmsnap-{ts}` جدید می‌سازد؛ تاریخچه قیمت ملک نگهداری می‌شود اما تاریخچه نرخ دلار ساخته/ذخیره نمی‌شود (§۲۱).

## 11. Current USD calculation

`Current USD/m² = Current Toman/m² ÷ Current USD Rate` — نرخ فعلی **فقط** از منبع موجود (`useFxStore`/`fx_rates`) خوانده می‌شود؛ تبدیل در `domain/fx.ts` و فقط در لایه سرویس اعمال می‌شود (نه کامپوننت).

## 12. Future USD scenario calculation

`calculateUsdScenario({ currentPropertyPriceTomanPerM2, currentUsdRate, futureUsdRate, futurePropertyPriceTomanPerM2? })` →
`currentUsdPrice`, `futureUsdPrice`, `usdChangePercent`, مبنای سناریو.
- سناریو A (پیش‌فرض): قیمت تومانی ثابت — صریحاً برچسب‌گذاری شده.
- سناریو B: فرض رشد تومانی درصدی توسط کاربر (مثال §۱۴: ۵۵ میلیون = ‎+10٪) — بدون هیچ پیش‌بینی خودکار/داده جعلی.
- نرخ آینده: مقداردهی اولیه از همان منبع دلار موجود + ذخیره به‌عنوان «فرض سناریو» در `settings` (بدون هیچ جدول/سرویس/API جدید دلار).

مثال‌های مأموریت عیناً تست شده‌اند: ‎$500→$400 (−20٪)، ‎$500→$416.67 (−16.67٪)، ۵۵م/۱۲۰هزار→$458.33 (−8.33٪)، ۵۵م/۱۲۵هزار→$440 (−12٪).

## 13. Neighborhood comparison

`Relative % = (Neighborhood USD/m² − Ahvaz Median USD/m²) ÷ Ahvaz Median USD/m² × 100` — برای وضعیت فعلی و سناریوی آینده؛ طبقه‌بندی «بالاتر/نزدیک/پایین‌تر از بازار» (باند ±5٪) بدون هیچ ادعای سرمایه‌گذاری؛ پریست‌های «گران‌ترین/ارزان‌ترین مناطق دلاری» و مرتب‌سازی روی تومان، دلار فعلی، دلار آینده، تغییر دلاری و فاصله از میانه.

## 14. Tests

**734 تست موفق در 42 فایل** (از جمله ۷۰ تست جدید ماژول بازار املاک): موتور سناریو با مثال‌های ضروری مأموریت، آمار/میانه، پارسر دیوار با فیکسچر ساختار واقعی پاسخ، قیف پاک‌سازی و حذف تکراری/پرت، اجرای تکه‌ای کلکشنر با دیوار شبیه‌سازی‌شده، مهاجرت داده قدیمی، کاتالوگ/نرمال‌سازی محله‌ها، ویوی سرویس و اسموک رندر صفحه.

## 15. Lint

مخزن کانفیگ/اسکریپت ESLint ندارد (در `package.json` هم اسکریپت `lint` تعریف نشده بود و اضافه‌کردن زیرساخت جدید خارج از اسکوپ بود). نقش لینتر را تایپ‌چک سخت‌گیرانه (`strict: true` در هر دو tsconfig) + تست‌ها ایفا می‌کنند — هر دو تمیز.

## 16. Typecheck

`tsc --noEmit` (کلاینت) ✅ و `tsc --noEmit -p tsconfig.server.json` (سرور) ✅ — هر دو بدون خطا.

## 17. Build

`npm run build` ✅ (tsc کلاینت + سرور + vite build؛ چانک `PropertyMarketPage` ~41.5KB).

## 18. Remaining limitations

- **Divar از این سندباکس قابل دسترسی نیست** (تست شبکه: اتصال مسدود) — کلکشنر بر اساس قرارداد اثبات‌شده مرجع پیاده‌سازی و با فیکسچر تست شده؛ اولین اجرای واقعی روی استقرار (یا `node scripts/collect-property-market.mjs` با DATABASE_URL) نیازمند تأیید زنده است. ساختار پاسخ دیوار ممکن است تغییر کرده باشد — پارسر دفاعی نوشته شده و نقاط بازبینی در کامنت‌ها مشخص‌اند.
- سقف زمانی سرورلس → کلکشن به تکه‌های چند ثانیه‌ای تقسیم شده؛ جمع‌آوری کامل شهر به چند تکه/اجرا نیاز دارد (اسکریپت کرون این چرخه را خودکار می‌زند).
- `listed date` فقط وقتی دیوار در پاسخ ارائه کند پر می‌شود (در بسیاری آگهی‌ها موجود نیست — بدون حدس).
- نرخ آینده یک «فرض سناریو» است و از هیچ منبع خارجی تغذیه نمی‌شود (طبق §۱۵/§۲۱ مأموریت، ساختن منبع جدید ممنوع بود).
- قیمت آینده ملک پیش‌بینی نمی‌شود؛ فقط سناریوی قیمت ثابت (صریح) یا فرض درصدی کاربر پشتیبانی می‌شود.

---

```
TAVAZON MODIFIED: NO

CURRENT USD RATE USED: YES

FUTURE USD RATE USED: YES
```
