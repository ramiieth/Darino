import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ONLINE_PLATFORMS,
  GOLD_ETF_FEE_CONFIG,
  GOLD_ETF_PRESETS,
   GOLD_ETF_SNAPSHOT_DATE_FA,
  calculateGoldEtfInvestment,
  calculateJewelryGold,
  calculateOnlineGold,
  compareOnlineAndJewelry,
  compareWithSnapshot,
  computeMovingHorizon,
  evaluateFutureGoldScenarios,
  evaluateFxHistorical,
  evaluateGoldEtfCard
} from './goldInvestment';
import type { DayClose, PlatformRow } from './gold';

describe('ماژول طلای ایران — تحلیل تاریخی متحرک ۷، ۳۰ و ۶۰ روزه', () => {
  const DAY = 86_400_000;
  const nowMs = Date.UTC(2026, 10, 18, 12, 0, 0);
  const history: DayClose[] = Array.from({ length: 65 }, (_, i) => ({
    t: nowMs - (65 - i) * DAY,
    close: 20_000_000 + i * 100_000
  }));

  it('رشد ۷، ۳۰ و ۶۰ روزه را بر اساس تاریخچه واقعی و بدون تخمین محاسبه می‌کند', () => {
    const current = 27_000_000;
    const h7 = computeMovingHorizon(history, current, 7, nowMs);
    const h30 = computeMovingHorizon(history, current, 30, nowMs);
    const h60 = computeMovingHorizon(history, current, 60, nowMs);

    expect(h7.available).toBe(true);
    expect(h7.startPriceToman).toBe(20_000_000 + (65 - 7) * 100_000); // 25,800,000
    expect(h7.changeToman).toBe(1_200_000);
    expect(h7.changePct).toBeCloseTo((1_200_000 / 25_800_000) * 100, 5);

    expect(h30.available).toBe(true);
    expect(h30.startPriceToman).toBe(20_000_000 + (65 - 30) * 100_000); // 23,500,000

    expect(h60.available).toBe(true);
    expect(h60.startPriceToman).toBe(20_000_000 + (65 - 60) * 100_000); // 20,500,000
    expect(h60.series.length).toBeGreaterThanOrEqual(60);
  });

  it('در صورت نبود داده تاریخی کافی، وضعیت ناموجود برمی‌گرداند و داده جعلی نمی‌سازد', () => {
    const empty = computeMovingHorizon([], 27_000_000, 30, nowMs);
    expect(empty.available).toBe(false);
    expect(empty.startPriceToman).toBeNull();
    expect(empty.changePct).toBeNull();
  });
});

describe('ماژول طلای ایران — قیمت مرجع (Snapshot) مستقل', () => {
  it('مقایسه قیمت روز با Snapshot را بدون تغییر قیمت مرجع محاسبه می‌کند', () => {
    const snap = {
      id: 'snap-1',
      title: 'خرید مرداد ۱۴۰۵',
      createdAt: Date.UTC(2026, 7, 1),
      dateLabelFa: '۱۰ مرداد ۱۴۰۵',
      price18kToman: 22_000_000,
      protectedPreset: true
    };
    const res = compareWithSnapshot(snap, 26_400_000, Date.UTC(2026, 7, 31));
    expect(res).not.toBeNull();
    expect(res?.snapshot.price18kToman).toBe(22_000_000);
    expect(res?.diffToman).toBe(4_400_000);
    expect(res?.changePct).toBeCloseTo(20, 5);
    expect(res?.elapsedDays).toBe(30);
  });
});

describe('ماژول طلای ایران — محاسبه‌گر طلای آنلاین و طلای زینتی و مقایسه', () => {
  const liveRows: PlatformRow[] = [
    { platform: 'melligold', buy: 26_000_000, sell: 25_900_000, spread: 0.00385, premium: 0.002 }
  ];

  it('هزینه خرید، فروش، نگهداری و قیمت سربه‌سر طلای آنلاین (ملی‌گلد) را دقیق محاسبه می‌کند', () => {
    const melli = DEFAULT_ONLINE_PLATFORMS.find((p) => p.id === 'melligold')!;
    const res = calculateOnlineGold({
      weightGrams: 3,
      holdingMonths: 2,
      includePhysicalDelivery: false,
      profile: {
        ...melli,
        buyFeePct: 0.5,
        sellFeePct: 0.5,
        storageFeeMode: 'monthly_fixed',
        storageFeeValue: 50_000
      },
      fallbackMarketPriceToman: 26_000_000,
      liveRows
    });

    expect(res.valid).toBe(true);
    expect(res.isEstimatedQuote).toBe(false);
    expect(res.baseGoldValueToman).toBe(78_000_000);
    expect(res.buyFeeToman).toBe(390_000);
    expect(res.totalBuyCostToman).toBe(78_390_000);
    expect(res.storageCostToman).toBe(100_000);
    expect(res.grossSellValueToman).toBe(77_700_000);
    expect(res.sellFeeToman).toBe(388_500);
    expect(res.netSellProceedsToman).toBe(77_311_500);
    expect(res.netProfitToman).toBe(77_311_500 - 78_390_000 - 100_000);
    expect(res.breakEvenSellPricePerGramToman).toBeGreaterThan(26_000_000);
  });

  it('فاکتور خرید حلقه ۳ گرمی زینتی (اجرت، سود فروشنده، مالیات بر اجرت+سود) و فروش مجدد بدون سنگ را دقیق محاسبه می‌کند', () => {
    const j = calculateJewelryGold({
      productName: 'حلقه طلا',
      grossWeightGrams: 3,
      stoneOrNonGoldWeightGrams: 0.2,
      karat: 750,
      market18kPriceToman: 26_000_000,
      makingChargeMode: 'percent',
      makingChargeValue: 15, // ۱۵٪ اجرت ساخت
      sellerProfitPct: 7, // ۷٪ سود فروشنده روی (طلا + اجرت)
      sellerProfitBase: 'raw_plus_making',
      taxPct: 10, // ۱۰٪ مالیات فقط روی (اجرت + سود)
      taxBase: 'making_plus_profit',
      otherBuyCostToman: 0,
      discountToman: 0,
      resaleDeductionPct: 1.5,
      resaleFixedDeductionToman: 0
    });

    expect(j.valid).toBe(true);
    expect(j.rawGoldValueToman).toBe(78_000_000);
    expect(j.makingChargeToman).toBe(11_700_000);
    // سود فروشنده: 7% * (78,000,000 + 11,700,000) = 6,279,000
    expect(j.sellerProfitToman).toBe(6_279_000);
    // پایه مالیات: 11,700,000 + 6,279,000 = 17,979,000 → مالیات ۱۰٪ = 1,797,900
    expect(j.taxableAmountToman).toBe(17_979_000);
    expect(j.taxToman).toBe(1_797_900);
    expect(j.totalBuyInvoiceToman).toBe(78_000_000 + 11_700_000 + 6_279_000 + 1_797_900);

    // در فروش مجدد، وزن سنگ (0.2 گرم) کسر شده و اجرت/سود/مالیات بازگردانده نمی‌شود
    expect(j.netGoldWeightGrams).toBeCloseTo(2.8, 5);
    expect(j.resaleGrossValueToman).toBeCloseTo(2.8 * 26_000_000, 2);
    expect(j.resaleNetProceedsToman).toBeLessThan(j.rawGoldValueToman);
    expect(j.netProfitOrLossToman).toBeLessThan(0);
    expect(j.requiredMarketGrowthPctToBreakEven).toBeGreaterThan(25);
  });

  it('مقایسه یکسان طلای آنلاین و زینتی و سناریوی قیمت آینده را بدون دستکاری قیمت روز انجام می‌دهد', () => {
    const melli = DEFAULT_ONLINE_PLATFORMS[0];
    const onlineIn = {
      weightGrams: 3,
      holdingMonths: 0,
      includePhysicalDelivery: false,
      profile: melli,
      fallbackMarketPriceToman: 26_000_000,
      liveRows
    };
    const jewelryIn = {
      grossWeightGrams: 3,
      stoneOrNonGoldWeightGrams: 0,
      karat: 750,
      market18kPriceToman: 26_000_000,
      makingChargeMode: 'percent' as const,
      makingChargeValue: 12,
      sellerProfitPct: 7,
      sellerProfitBase: 'raw_plus_making' as const,
      taxPct: 10,
      taxBase: 'making_plus_profit' as const,
      otherBuyCostToman: 0,
      discountToman: 0,
      resaleDeductionPct: 1,
      resaleFixedDeductionToman: 0
    };

    const cmp = compareOnlineAndJewelry(onlineIn, jewelryIn);
    expect(cmp.lowerInitialCostMethod).toBe('online');
    expect(cmp.higherNetResaleMethod).toBe('online');
    expect(cmp.betterRoiMethod).toBe('online');

    const scenarios = evaluateFutureGoldScenarios([30_000_000, 35_000_000], 26_000_000, onlineIn, jewelryIn);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].onlineRoiPct).toBeGreaterThan(scenarios[0].jewelryRoiPct);
    expect(scenarios[1].onlineNetProfitToman).toBeGreaterThan(0);
  });
});

describe('ماژول طلای ایران — صندوق‌های طلای بورسی (مرجع ثابت ۱۰ مرداد ۱۴۰۵)', () => {
  it('دارای ۶ صندوق استاندارد با قیمت‌های مرجع ثابت ۱۰ مرداد ۱۴۰۵ است', () => {
    expect(GOLD_ETF_SNAPSHOT_DATE_FA).toBe('۱۰ مرداد ۱۴۰۵');
    expect(GOLD_ETF_PRESETS).toEqual([
      { id: 'ayar', nameFa: 'صندوق عیار', tickerFa: 'عیار', snapshotPriceToman: 52_105 },
      { id: 'mesghal', nameFa: 'صندوق طلای مثقال', tickerFa: 'مثقال', snapshotPriceToman: 15_093 },
      { id: 'tala', nameFa: 'صندوق طلای لوتوس', tickerFa: 'طلا', snapshotPriceToman: 133_045 },
      { id: 'kahroba', nameFa: 'صندوق کهربا', tickerFa: 'کهربا', snapshotPriceToman: 18_045 },
      { id: 'ghirat', nameFa: 'صندوق قیراط', tickerFa: 'قیراط', snapshotPriceToman: 3_463 },
      { id: 'gohar', nameFa: 'صندوق گوهر کیان', tickerFa: 'گوهر', snapshotPriceToman: 89_448 }
    ]);
    expect(GOLD_ETF_FEE_CONFIG.roundTripFeePct).toBe(0.24);
  });

  it('مقایسه کارت صندوق با مرجع ثابت و ماشین‌حساب سرمایه‌گذاری (بر اساس مبلغ و تعداد واحد با کارمزد ۰.۱۲٪) را دقیق انجام می‌دهد', () => {
    const ayar = GOLD_ETF_PRESETS[0];
    const card = evaluateGoldEtfCard(ayar, 62_526, 75_000);
    expect(card.diffCurrentVsSnapshotToman).toBe(10_421);
    expect(card.changeCurrentVsSnapshotPct).toBeCloseTo(20, 4);

    // روش اول: بر اساس مبلغ سرمایه‌گذاری (واحد صحیح + باقیمانده نقدی)
    const byAmt = calculateGoldEtfInvestment({
      etfId: 'ayar',
      mode: 'by_amount',
      investmentAmountToman: 10_000_000,
      units: 0,
      integerUnitsOnly: true,
      buyPricePerUnitToman: 50_000,
      currentPricePerUnitToman: 55_000,
      futurePricePerUnitToman: 60_000
    });
    expect(byAmt.valid).toBe(true);
    // هر واحد با کارمزد ۰.۱۲٪ = ۵۰,۰۶۰ تومان ← با ۱۰ میلیون می‌توان ۱۹۹ واحد خرید
    expect(byAmt.unitsPurchased).toBe(199);
    expect(byAmt.leftoverCashToman).toBeCloseTo(10_000_000 - 199 * 50_060, 2);
    expect(byAmt.netProfitOrLossToman).toBeGreaterThan(0);

    // روش دوم: بر اساس تعداد واحد
    const byUnits = calculateGoldEtfInvestment({
      etfId: 'tala',
      mode: 'by_units',
      investmentAmountToman: 0,
      units: 100,
      buyPricePerUnitToman: 133_045,
      futurePricePerUnitToman: 160_000
    });
    expect(byUnits.valid).toBe(true);
    expect(byUnits.unitsPurchased).toBe(100);
    expect(byUnits.rawPurchaseValueToman).toBe(13_304_500);
    expect(byUnits.buyFeeToman).toBeCloseTo(13_304_500 * 0.0012, 2);
  });
});

describe('ماژول طلای ایران — تحلیل تاریخی دلار و تتر', () => {
  it('تغییرات دلار آزاد و تتر و اسپرد بین آن‌ها را محاسبه می‌کند', () => {
    const fx = evaluateFxHistorical({
      referenceDateLabelFa: '۱۰ مرداد ۱۴۰۵',
      referenceDollarToman: 60_000,
      referenceUsdtToman: 60_600,
      currentDollarToman: 72_000,
      currentUsdtToman: 72_360,
      goldGrowthPctInSamePeriod: 28
    });
    expect(fx.valid).toBe(true);
    expect(fx.dollarChangePct).toBeCloseTo(20, 4);
    expect(fx.referenceUsdtSpreadPct).toBeCloseTo(1, 4);
    expect(fx.currentUsdtSpreadPct).toBeCloseTo(0.5, 4);
    expect(fx.goldOutperformanceVsDollarPct).toBeCloseTo(8, 4);
  });
});
