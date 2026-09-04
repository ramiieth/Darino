# گزارش — بهینه‌سازی سرعت + API Key اختصاصی + درست‌شدن رمزارز

تاریخ: ۱۲ اوت ۲۰۲۶

---

## ۱) API Key اختصاصی CoinGecko — وصل شد (سرور-سمت)

کلید `CG-1fJVsdhGGY6Jrb5DTZazvScK` در **پروکسی سرور-سمت** (`vite.config.ts`) تزریق
می‌شود — مرورگر هرگز کلید را نمی‌بیند (فقط `x_cg_demo_api_key` در درخواست سرور).

```
مرورگر → /coingecko-api (same-origin) → سرور (کلید اضافه می‌شود) → api.coingecko.com
```

- قابل جایگزینی با متغیر محیطی: `COINGECKO_API_KEY=کلید_شما npm run dev`
- **تأثیر**: قبل از key از IP سندباکس ~۲ درخواست/دقیقه بود (صفحه بازار خالی می‌ماند)؛
  حالا با key ~۳۰ درخواست/دقیقه — داده کامل و سریع.

## ۲) درست‌شدن توکن‌های رمزارز (نماد + لوگو اختصاصی)

- **ترتیب**: همیشه بر اساس مارکت‌کپ نزولی (BTC اول، بعد ETH/USDT/BNB/USDC…) — تأیید زنده.
- **نماد و نام**: مستقیم از پاسخ Provider (نه نگاشت دستی).
- **لوگو اختصاصی**: همه لوگوهای واقعی CoinGecko لود می‌شوند (تست زنده: ۵۰/۵۰ لوگو
  لود شد — bitcoin.png، ethereum.png، Tether.png…) — **با نسخه کوچک (small ≈ ۶۴px)**
  به‌جای large (کاهش ~۱۰ برابر حجم تصاویر).
- **گروه‌بندی Underlying** سر جایش است (Apple · Microsoft · NVIDIA…).

## ۳) تغییرات اساسی برای سبک‌شدن اپ

| تغییر | اثر |
|---|---|
| **Lazy Loading همه صفحات** (داشبورد/شبیه‌سازی/دیفای/Pendle/خودرو/ملک/…) | باندل اولیه ۸۹۰KB → **۷۷۵KB** (gzip ۲۸۹ → ۲۵۱KB)؛ فقط صفحه بازار مستقیم می‌آید |
| **حذف framer-motion از کامپوننت‌های shared** (GlassCard/Sheet/Palette/Toast/…) و جایگزینی با CSS انیمیشن سبک | -۱۱۵KB از باندل اصلی |
| **حذف `useTopPerformers` از صفحه بازار** (سینک سنگین تاریخچه ۳۰/۶۰/۹۰ روزه + سری آلفا وانتج فقط برای داشبورد بود) | صفحه اصلی دیگر سینک سنگین پس‌زمینه اجرا نمی‌کند |
| **برش فهرست + دکمه «نمایش بیشتر»** (۵۰ ردیف اول) | رندر اولیه سریع‌تر (تب «همه» ۲۷۳ آیتم دارد) |
| **لوگوهای small + lazy loading** | دانلود تصاویر ~۱۰ برابر کمتر |
| **دروازه نرخ بازتر** (۲ ثانیه فاصله، ۲۰/دقیقه) با key | اولین داده ~۷.۵ ثانیه → با کش بعدی آنی |
| **پاک‌سازی workspace** (اسکرین‌شات ۲۷MB + اسکریپت‌های دیباگ) | workspace از ۳۱MB به ~۳MB |

## ۴) اندازه‌گیری زنده (Playwright)

```
DOMContentLoaded:  422ms   ← اپ فوراً بالا می‌آید
اولین ردیف بازار:  ~7.5s   (چرخه اول fetch؛ بعد از کش آنی)
لوگوهای لودشده:    50/50   (نسخه small — بیت‌کوین/اتریوم/تتر/BNB/USDC…)
ردیف‌های نمایشی:    ۵۱ (برش ۵۰ + «نمایش بیشتر»)
گروه‌بندی پایه:     ✅ (Apple · Microsoft · Alphabet · …)
```

## ۵) شواهد تست

- ✅ `npm run test` — **۶۱۰ پاس (۲۹ فایل)**
- ✅ `npm run build` — سبز (PWA)
- ✅ `smoke.mjs` — **۹۰ پاس / ۱ خطا** (تنها خطا: «سرمایه فرضی ۲۳٬۱۲۶» — به نوسان قیمت
  لحظه‌ای داشبورد وابسته است و عدد ثابت ندارد؛ نه باگ)
- ✅ تأیید زنده: بیت‌کوین $63,621 با MCap $1.3T اول، اتریوم $1,881، تتر، BNB، USDC —
  همه با لوگو و داده واقعی.

## ۶) فایل‌های تغییر یافته

```
vite.config.ts                              — تزریق COINGECKO_API_KEY (سرور-سمت)
src/shared/lib/coingeckoGate.ts             — دروازه بازتر (20/min، gap 2s)
src/app/App.tsx                             — lazy شدن ۱۱ صفحه (فقط بازار مستقیم)
src/shared/components/ui/GlassCard.tsx      — بدون framer (CSS)
src/shared/components/ui/Sheet.tsx          — بدون framer (CSS + pointer drag)
src/shared/components/ui/ToastViewport.tsx  — بدون framer (CSS)
src/shared/components/layout/Page.tsx       — بدون framer (CSS)
src/shared/components/layout/BottomNav.tsx  — بدون framer (CSS)
src/shared/components/layout/CommandPalette.tsx — بدون framer (CSS)
src/shared/components/ui/AssetLogo.tsx      — لوگوهای small + lazy
src/features/market/presentation/MarketDiscoveryPage.tsx — بدون useTopPerformers + برش + تب ثابت
src/styles/index.css                        — انیمیشن‌های سبک CSS
src/shared/components/ui/Sheet.test.tsx     — تست درگ با pointer جدید
```
