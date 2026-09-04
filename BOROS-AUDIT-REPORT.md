# Boros Engine — Master Audit Report

**تاریخ:** ۲۰۲۶-۰۸-۰۹ · **نسخه تستها:** ۴۹۰ واحد + ۷۱ اسموک + ۱۵ چک زنده · بیلد: ✅

## اصل معماری: دو لایه مجزا (هرگز ادغام نمی‌شوند)

```
BOROS ENGINE
   ├── MARKET LAYER (API عمومی)
   │     Implied/Fixed APR · Mark APR · Underlying APR · OI · Volume · Liquidity · Maturity · MAs
   │     → ANALYTICS: Margin · Notional · Sensitivity · Settlement · Fees · Slippage · Net · Edge
   │     → Scenarios · Robustness · Risk · Confidence · Anomaly · Score · Ranking
   │     → Liquidation APR = N/A (بدون Position)
   └── POSITION LAYER (فقط Position واقعی Boros)
         Collateral · Entry APR · Current Mark · Liquidation APR · Health · Maintenance Margin
         → Liquidation APR = مقدار رسمی Boros (source = boros_position_api/data/preview)
```

## ماژول به ماژول

| Module | Status | Formula | Data Sources | Calculated Fields | Boros Fields | N/A Conditions | Tests |
|---|---|---|---|---|---|---|---|
| **Market Data** | ✅ | — | Boros API (markets) | — | Implied/Mark/Underlying/OI/Volume/Maturity/Vol | — | ✅ |
| **Margin** | ✅ | `Size × max(\|Rate\|,RateFloor) × max(YTM,TimeFloor) × IM` | marginFloor/kIM از API؛ ytmFloor پارامتر بازار | MarginRequired, MarginPerUnit | RateFloor, IM, YTMFloor | داده ناقص → بازار حذف | ✅ (مثال 222×0.08×0.055×0.476) |
| **Rate Sensitivity** | ✅ | `Notional × YTM × 1%` | Calculated | Sensitivity | — | — | ✅ |
| **Settlement PnL** | ✅ | Long: `N×(Underlying−Fixed)×YTM` · Short: قرینه | Underlying/Fixed از API | SettlementPnl | — | — | ✅ (Long=−Short) |
| **MTM** | ✅ | `Sensitivity × (Mark−Entry)/1%` (جهت‌دار) | Mark از API | Mtm | Mark | سناریو بدون Mark → **N/A** (هرگز ۰) | ✅ |
| **Fees** | ✅ | Entry `\|Size\|×Rate×YTM` · Settlement `\|Size\|×Rate×Period×Count` | مستندات رسمی + API | Entry/Exit/Settlement/Gas | FeeRates | Entrance/Slippage بدون داده → N/A | ✅ (بدون double-count) |
| **Slippage** | ✅ | سه حالت Actual/Estimated/Unavailable | Order Book (در دسترس نیست) | — | — | بدون Order Book → **N/A** (نه ۰) | ✅ |
| **Net PnL / Economic Edge** | ✅ | Net = Settlement+MTM−Costs · Edge = Net − min($1, 0.1%×N) | Calculated | Net, Edge | — | Edge زیر حد → «جذاب نیست» | ✅ |
| **Scenarios** | ✅ | Bear=min(P25,Cur) ≤ Base=Cur ≤ Bull=max(P75,Cur) · نقش اقتصادی بر اساس جهت | Historical OHLCV (≥۱۰ نقطه) | Scenario PnL/ROI | — | داده ناکافی → **N/A** | ✅ (Ordering تضمین‌شده) |
| **Constant / MeanRev / Stress** | ✅ | Constant=نرخ فعلی · MeanRev=λ×MA ترکیبی · Stress=σ/توزیع تاریخی | Historical | — | — | داده ناکافی → **N/A** | ✅ |
| **Risk Monitor** | ✅ | Market Risk جدا از Position Risk | Calculated | RiskScore, Alerts | — | Liquidation/Health بدون Position → **N/A** | ✅ |
| **Opportunity/Score/Rank** | ✅ | Score≠احتمال موفقیت · Rank با اولویت Validity→Executable→Net→Edge→Liq→Risk→Conf→Robust→Anomaly | Calculated | Score, Rank, Status | — | Spread عظیم → anomaly (هرگز رتبه اول) | ✅ |
| **Capital Projection** | ✅ | `Capital → Notional = C/(EffRate×EffTime×IM)` → RoundTrip = C | Calculated | Notional, Exposure, ROI, Ann.ROI | — | Liquidation APR = **N/A** | ✅ (RoundTrip ۵ سرمایه) |
| **Order Preview (MODE C)** | ✅ **جدید** | Margin/Sensitivity/Fees/Expected PnL از فرمول‌های یکسان | Calculated + ورودی Collateral کاربر | Margin, AvailMargin, Net, ROI | Liquidation فقط اگر Boros Preview بدهد | بدون مقدار رسمی → **N/A** | ✅ (19 تست) |
| **Liquidation APR** | ✅ | Position-Specific — هرگز از Market ساخته نمی‌شود | فقط Boros Position/Preview | — | value + source + isPositionSpecific | بدون Position → **N/A** | ✅ (11+ تست) |
| **Data Freshness/Confidence/Anomaly** | ✅ | از API/تاریخچه (هرگز ±5% ساختگی) | API | Freshness, Confidence, Anomaly | — | داده کهنه → Confidence ↓ | ✅ |

## حالت‌های چهارگانه (§3)

| حالت | Liquidation APR | Health Factor | Collateral |
|---|---|---|---|
| A — Market Scanner | **N/A** | N/A | N/A |
| B — Simulator | **N/A** | N/A | N/A |
| C — Order Preview | **N/A** مگر مقدار رسمی Boros Preview | N/A | ورودی کاربر (کفایت ریاضی فقط) |
| D — Active Position | **مقدار رسمی Boros** (source مشخص) | Boros | Boros |

## Critical Integration Test (§45) — ✅ PASS

```
ETHUSDT (Fixed 6.62% / Underlying 10.95%)
  Scanner            → Liquidation APR = N/A ✅
  Simulator (2 YU)   → Liquidation APR = N/A ✅
  Order Preview      → Liquidation APR = N/A (بدون مقدار رسمی) ✅
  Position واقعی      → Liquidation APR = 78.23% [source=boros_position_api] ✅
                      Buffer = |78.23 − 6.62| = 71.61 pp ✅
```

## مثال §4 — Short 2 YU · Collateral 0.102 ETH — ✅ PASS
- Sensitivity = 2 × (19/365) × 1% ≈ 0.001041 (ETH/1%)
- Margin = 2 × max(6.62%,6%) × (19/365) × IM (فرمول واحد — تبدیل به ETH با قیمت Collateral)
- Short با Fixed < Underlying → Settlement منفی (Pay Floating) · Long قرینه
- بدون Order Book → Slippage = N/A → Total Cost/Net = N/A (نه ۰ جعلی)

## Known Limitations
- **Borrow/Liquidation/Health واقعی**: API عمومی Boros ارائه نمی‌دهد → فقط با Position واقعی (WORLD B) پر می‌شود؛ اتصال Position API به‌محض در دسترس‌بودن از طریق `makePositionLiquidationAPR` انجام می‌شود.
- **Slippage**: Order Book عمومی در دسترس نیست → N/A (مدل تخمینی اضافه نشده تا «تخمین جعلی» نباشد).
- **YTM Floor**: پارامتر بازار (پیش‌فرض مستند ۰.۰۱۴ در نبود API).
- **Scenario تاریخچه**: حداقل ۱۰ نقطه (OHLCV روزانه) — کمتر → N/A.

## اصول نهایی enforce شده
`NO POSITION → NO REAL LIQUIDATION APR` · `NO DATA → N/A` · `NO OFFICIAL FORMULA → DO NOT GUESS` · `SPREAD ≠ OPPORTUNITY` · `SIMULATION ≠ POSITION` · `CURRENT RATE ≠ GUARANTEED FUTURE RATE` · `THEORETICAL ROI ≠ FORECAST` · `SCORE ≠ PROBABILITY OF SUCCESS`

## تستها
- **Unit:** ۴۹۰ پاس (۲۳ فایل) — شامل 19 تست یکپارچه Master Corrective
- **Smoke:** ۷۱ پاس
- **زنده (مرورگر):** ۱۵ پاس (`scripts/verify-master.mjs`) — MODE B/C، Provenance Badges، Position Layer
- **Build:** ✅

---

# پیوست — Deposit-Aware Simulator (MASTER PROMPT 2)

## تغییرات این مرحله

| فایل | تغییر |
|---|---|
| `domain/collateral.ts` | **جدید** — Collateral-Aware Engine: `userCapitalOpportunity` (Max Notional = Collateral ÷ MPU)، `rankUserCapitalOpportunities` (رتبهبندی چندبعدی ۱۰ عاملی)، `DEFAULT_SIMULATION_COLLATERAL_ETH = 0.102` |
| `presentation/UserCapitalCard.tsx` | **جدید** — کارت فرصت کاربر-آگاه: Collateral/N otional/Margin/Net/ROI/Edge/Robustness + Liquidation N/A |
| `presentation/OpportunitiesTab.tsx` | **بازطراحی** — ورودی Simulation Collateral + جهت (هر دو/لانگ/شورت) + دو بخش: «بهترین فرصتها برای سرمایه شما» و «فرصتهای بازار (Market Intelligence)» |
| `presentation/ComparisonTab.tsx` | ستون «Net PnL برای X ETH» با Simulation Collateral مشترک |
| `domain/collateral.test.ts` | **جدید** — ۱۹ تست (Test A-E Liquidation، Collateral Scaling، Rate Edge، Ranking، Reason) |

## فرمولهای کلیدی
- **Max Notional** = CollateralAsset ÷ MPU — MPU = max(Rate,Floor) × max(YTM,TimeFloor) × IM (واحد Collateral/YU — مثال: 0.102 ETH → ~51 YU)
- **Margin** = Notional × MPU × قیمت Collateral ≈ CollateralUSD (RoundTrip ✓)
- **Rate Edge** = Underlying−Fixed (Long) / Fixed−Underlying (Short)
- **Settlement** = Notional × Edge × YTM · **Net** = Settlement + MTM − Fees − Slippage (Slippage نامعلوم → Net = N/A)
- **userScore** = Edge 30% + ROI 20% + Robustness 15% + Liquidity 10% + Risk 10% + Confidence 5% + Execution 5% + CollateralFit 5%

## تستها (۱۹ تست جدید)
- **Test A-E** (§49): بدون Deposit → null · Simulation → null · Boros Preview 78.23% [boros_preview] · Boros Position -67.87% [boros_position_api] · بدون فیلد → N/A (نه ۰)
- **Collateral Scaling** (§50): 0.102/0.25/0.5/1 ETH — نهional خطی، ROI تقریباً ثابت، Liquidation همیشه N/A بدون Position
- **Ranking**: Spread عظیم ولی غیرقابل اجرا → حذف · Net منفی → حذف · Anomaly → حذف · نزولی بر اساس userScore
- **Reason Engine**: positive/negative دلایل کمی

## تأیید زنده (`verify-deposit.mjs` — ۹ چک)
Simulation Collateral 0.102 → 1 ETH دوباره محاسبه میشود · دو بخش رتبهبندی · مقایسه با ستون Collateral.

## نتایج نهایی
- Unit: **۵۰۹ پاس (۲۴ فایل)**
- Smoke: **۷۱ پاس**
- زنده: **۹ پاس** (`verify-deposit.mjs`)
- Build: ✅
