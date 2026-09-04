# گزارش — بازطراحی و سبک‌سازی معماری Markets (Pipeline متمرکز)

تاریخ: ۱۲ اوت ۲۰۲۶ · فقط روی اپ Sandbox (بدون وابستگی به هیچ Repo/Git)

---

## ۱) Audit — علت واقعی کندی (قبل از تغییر)

| یافته | وضعیت |
|---|---|
| **۹ درخواست به CoinGecko** در لود صفحه بازار | ۴× `/search` (جستجوی لوگوی نمادهای قدیمی AALON/JNJON/MRKON/BTC) + ۳× `coins/markets` + ۲× `simple/price` |
| **`useAssetMeta` در AssetLogo/CommandPalette** (هر دو در لود عمومی) | همگام‌سازی قیمت توکنایز (شامل جستجوها) را در لود هر صفحه اجرا می‌کرد + `refetchInterval: 2min` |
| **Payload کامل به Client** | `CgMarket[]` با ۳۰+ فیلد (ath/atl/supply/…) برای هر ۲۰۰ ردیف به UI منتقل می‌شد |
| **دو مسیر موازی** برای داده بازار | Discovery + Registry (UI گروهی) — نگهداری و درخواست تکراری |
| **UI گروهی Underlying** | نمایش «Apple ← AAPLX/AAPLON» — خلاف هدف «هر Symbol مستقل» |

## ۲) معماری جدید — Market Data Pipeline واحد

```
External Market API (CoinGecko)
        ↓
Server-side Fetch (پروکسی + کلید سرور + دروازه نرخ)
        ↓
Normalization (فقط فیلدهای UI → Minimal DTO)
        ↓
Validation (Tokenized: فقط Market Cap معتبر > 0)
        ↓
Centralized Cache (Dexie + TTL + حفظ داده قدیمی)
        ↓
Minimal Market DTO (symbol/image/price/mcap/24h/7d/30d)
        ↓
UI (یک جدول — هر Symbol یک Row مستقل)
```

**فایل‌ها:**
```
src/features/markets/
├── pipeline/
│   ├── types.ts       — MarketAsset DTO مینیمال + Universeها
│   ├── normalize.ts   — CG row → DTO (فقط ۷ فیلد UI) + isValidTokenized
│   ├── fetch.ts       — Top200 (dedup سراسری) + Category-level (Ondo/xStocks)
│   ├── cache.ts       — کش مرکزی (TTL: کریپتو ۱د، توکنایز ۱۰د)
│   ├── store.ts       — استور مرکزی + Request Dedup + Refresh مرکزی
│   └── useMarkets.ts  — هوک‌های مصرفی (selectors جزئی)
└── presentation/
    ├── MarketsPage.tsx   — تب‌ها: همه / رمزارز / توکنایز / سنتی
    ├── MarketsTable.tsx  — جدول واحد (Row memoized + برش ۵۰ + جستجو)
    └── TradFiTable.tsx   — سنتی (مرجع — سبک)
```

**قواعد اجراشده:**
- **یک Data Model مشترک** برای همه Universeها (بخش ۱۷) — Universe فقط تعیین‌کننده ورودی
- **Request Deduplication** (بخش ۱۹): مصرف‌کننده‌های هم‌زمان → یک fetch (تست شده)
- **Batch/Category-Level Fetch** (بخش ۲۰/۲۱): هرگز برای هر Token درخواست جدا
- **Refresh مرکزی** (بخش ۲۵): یک تایمر (useAutoSync) برای همه — نه چند Polling
- **Minimal DTO** (بخش ۵/۲۸): فقط symbol/image/price/mcap/24h/7d/30d — بقیه Response دور ریخته می‌شود
- **فقط MCap معتبر** برای Ondo/xStocks (بخش ۸/۹) — بدون MCap → نمایش داده نمی‌شود
- **هر Symbol یک Row مستقل** (بخش ۱۰-۱۶): AAPLON و AAPLX مستقل — قیمت/۲۴H/۷D/۳۰D/MCap هر کدام از داده خودشان؛ هیچ جمع/میانگین/Merge
- **بدون Asset/Underlying/Company/Grouping/Pairing در UI** (بخش ۱۲/۱۳)
- **Metric ناقص → «—»** (بخش ۲۹): Token حذف نمی‌شود
- **شکست → داده قبلی حفظ** (بخش ۲۹): هرگز خالی/جعلی؛ Error State
- **Accounting/Ledger/FIFO کاملاً جدا** (بخش ۳۰/۳۱) — تست خودکار وابستگی صفر

## ۳) بهینه‌سازی‌های دیگر

- `useAssetMeta` از مسیر لود عمومی حذف شد (فقط صفحات تخصصی) → **۴ جستجوی `/search` حذف**
- `AssetLogo` فقط از `logoStore` (لوگو — سبک) می‌خواند؛ لوگوهای توکنایز از seed تأییدشده
- حذف UI گروهی Registry؛ Registry فقط به‌عنوان لایه متادیتا/تاریخچه باقی می‌ماند

## ۴) Benchmark — قبل ← بعد

| معیار | قبل | بعد |
|---|---|---|
| DOMContentLoaded | ~420ms | **~410ms** |
| اولین ردیف بازار | ~7.5s | **~3.4s** |
| درخواست‌های CoinGecko (لود) | **۹** (۴ جستجو + ۳ markets + ۲ price) | **۳** (بدون هیچ /search) |
| Payload به UI | CgMarket کامل (۳۰+ فیلد × ۲۰۰) | **DTO ۷ فیلد** × ۲۰۰ |
| توکنایز نمایشی | ۵۵۳ (بدون فیلتر MCap) | **۵۳۸** (فقط MCap معتبر — ۱۵ حذف) |
| Re-render | استورهای چندگانه | selectors جزئی + Row memoized + برش ۵۰ |
| باندل اصلی | 775KB | **760KB** |

## ۵) Acceptance Criteria — تأیید

- ✅ معماری قبلی Audit شد · ✅ Bottleneck مشخص (۹ درخواست/جستجوهای لوگو/پیلود کامل)
- ✅ Refactor اساسی → Pipeline متمرکز · ✅ Initial Load سبک‌تر · ✅ درخواست‌ها ۹→۳
- ✅ Duplicate حذف · ✅ Batch/Category Fetch · ✅ Cache مرکزی + TTL · ✅ Dedup (تست‌شده)
- ✅ Client Payload کاهش (DTO ۷ فیلد) · ✅ Client Processing کاهش (Filter سمت Pipeline)
- ✅ Re-render کاهش (memo + selector + برش) · ✅ Crypto Top 200 حفظ · ✅ Ondo · ✅ xStocks
- ✅ فقط MCap معتبر · ✅ هر Symbol یک Row · ✅ همان Market Row برای همه
- ✅ بدون Asset/Underlying/Company/Pairing/Grouping در UI
- ✅ AAPLON/AAPLX مستقل (قیمت/۲۴H/۷D/۳۰D/MCap/لوگو) — تست‌شده
- ✅ Accounting/Ledger/FIFO/P&L دست‌نخورده — تست‌شده (صفر وابستگی)

## ۶) تست‌ها

```
npm run test   → 621 پاس (30 فایل) — شامل 15 تست جدید Pipeline
                 (normalize/validate/dedup/cache/failure-safe/استقلال/Accounting)
npm run build  → سبز (PWA)
smoke.mjs      → 92 پاس / 1 خطا (تنها: «سرمایه فرضی» — وابسته به نوسان قیمت زنده، نه باگ)
```

**تأیید زنده:** تب توکنایز — ۵۳۸ دارایی: `1 CRCLON $71.32 +6.7% $100.3M`، `2 IVVON $781.68`،
`3 SPYON $777.13`، `6 NVDAON $218.07`، `10 GOOGLON $347.34` — هر کدام Row مستقل با
قیمت/۲۴H/MCap خودشان؛ 7D/30D = «—» وقتی Provider داده ندارد.
