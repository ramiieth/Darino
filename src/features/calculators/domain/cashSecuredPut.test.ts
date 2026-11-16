import { describe, expect, it } from 'vitest';
import {
  buildDefaultScenarioPrices,
  buildRyskEarnUrl,
  calculateCsp,
  estimateRyskFeeUsd,
  evaluateCspScenario
} from './cashSecuredPut';

describe('Cash-Secured Put (CSP) Financial Engine', () => {
  const DAY = 86_400_000;
  const nowMs = Date.UTC(2026, 10, 16, 20, 0, 0); // 2026-11-16 20:00 UTC
  const expiryMs = Date.UTC(2026, 10, 20, 8, 0, 0); // 2026-11-20 08:00 UTC (3.5 روز مانده)

  it('محاسبات پایه وثیقه، پریمیوم، قیمت تمام‌شده خالص، سربه‌سر و APR را دقیق انجام می‌دهد', () => {
    // نمونه مرجع: WHYPE با Strike=66.50 و ۵۰ واحد و ۱.۸٪ پریمیوم
    const quantity = 50;
    const strikePrice = 66.5;
    const requiredCollateral = strikePrice * quantity; // 3325
    const premiumUsd = requiredCollateral * 0.018; // 59.85

    const calc = calculateCsp({
      asset: 'WHYPE',
      networkLabel: 'HyperEVM',
      chainId: 999,
      collateralToken: 'USDT0',
      spotPrice: 70,
      strikePrice,
      quantity,
      premiumUsd,
      feeUsd: 0,
      expiryTimestampMs: expiryMs,
      nowMs
    });

    expect(calc.valid).toBe(true);
    expect(calc.requiredCollateralUsd).toBeCloseTo(3325, 4);
    expect(calc.grossPremiumUsd).toBeCloseTo(59.85, 4);
    expect(calc.premiumPctOfCollateral).toBeCloseTo(1.8, 4);
    expect(calc.premiumPerUnit).toBeCloseTo(1.197, 4);
    expect(calc.netEffectiveBuyPrice).toBeCloseTo(65.303, 4);
    expect(calc.breakEvenPrice).toBeCloseTo(65.303, 4);
    expect(calc.remainingDays).toBeCloseTo(3.5, 4);
    expect(calc.aprPct).toBeCloseTo((1.8 / 3.5) * 365, 2);
    expect(calc.currentMoneyness).toBe('OTM');
    expect(calc.maxProfitUsd).toBeCloseTo(59.85, 4);
    expect(calc.maxLossUsd).toBeCloseTo(3325 - 59.85, 4);
  });

  it('سناریوهای OTM، ATM، سربه‌سر، ITM و سقوط شدید را برای Strike=66.50 دقیق تحلیل می‌کند', () => {
    const input = {
      asset: 'WHYPE',
      networkLabel: 'HyperEVM',
      chainId: 999,
      collateralToken: 'USDT0',
      spotPrice: 70,
      strikePrice: 66.5,
      quantity: 50,
      premiumUsd: 59.85,
      feeUsd: 0,
      expiryTimestampMs: expiryMs,
      nowMs
    };
    const calc = calculateCsp(input);

    // سناریو ۸۰ و ۷۲: OTM — بدون اعمال، حفظ وثیقه + پریمیوم
    for (const p of [80, 72]) {
      const s = evaluateCspScenario(input, calc, p);
      expect(s.moneyness).toBe('OTM');
      expect(s.assigned).toBe(false);
      expect(s.assetReceivedQty).toBe(0);
      expect(s.assetReceivedValueUsd).toBe(0);
      expect(s.economicPnlUsd).toBeCloseTo(59.85, 4);
    }

    // سناریو ۶۶.۵۰ (دقیقاً روی Strike): ATM و عدم اعمال
    const atStrike = evaluateCspScenario(input, calc, 66.5);
    expect(atStrike.moneyness).toBe('ATM');
    expect(atStrike.assigned).toBe(false);
    expect(atStrike.economicPnlUsd).toBeCloseTo(59.85, 4);

    // سناریو ۶۵: ITM و اعمال می‌شود، ولی هنوز بالاتر از سربه‌سر (65.303) نیست؛ زیان خیلی کم
    const at65 = evaluateCspScenario(input, calc, 65);
    expect(at65.moneyness).toBe('ITM');
    expect(at65.assigned).toBe(true);
    expect(at65.assetReceivedQty).toBe(50);
    expect(at65.assetReceivedValueUsd).toBeCloseTo(3250, 4);
    // (65 - 66.5) * 50 + 59.85 = -75 + 59.85 = -15.15
    expect(at65.economicPnlUsd).toBeCloseTo(-15.15, 4);
    expect(at65.premiumBufferUsd).toBeCloseTo(59.85, 4);
    expect(at65.premiumBufferPctOfDrop).toBeCloseTo((1.197 / 1.5) * 100, 2);

    // سناریو دقیقاً روی نقطه سربه‌سر (65.303): سود و زیان اقتصادی صفر
    const atBreakEven = evaluateCspScenario(input, calc, calc.breakEvenPrice);
    expect(atBreakEven.economicPnlUsd).toBeCloseTo(0, 2);

    // سناریو ۶۰ و ۵۰: ITM با زیان اقتصادی واضح
    const at60 = evaluateCspScenario(input, calc, 60);
    expect(at60.economicPnlUsd).toBeCloseTo((60 - 66.5) * 50 + 59.85, 4); // -265.15

    const at50 = evaluateCspScenario(input, calc, 50);
    expect(at50.economicPnlUsd).toBeCloseTo((50 - 66.5) * 50 + 59.85, 4); // -765.15

    // سقوط به صفر: حداکثر زیان برابر وثیقه منهای پریمیوم
    const atZero = evaluateCspScenario(input, calc, 0);
    expect(atZero.economicPnlUsd).toBeCloseTo(-calc.maxLossUsd, 4);
  });

  it('اثر کارمزد معامله (از جمله فرمول Rysk) را روی سربه‌سر و سود خالص لحاظ می‌کند', () => {
    const fee = estimateRyskFeeUsd(70, 1.197, 50);
    // min(0.7, 0.149625) * 50 = 7.48125
    expect(fee).toBeCloseTo(7.48125, 4);

    const calc = calculateCsp({
      asset: 'WHYPE',
      networkLabel: 'HyperEVM',
      chainId: 999,
      collateralToken: 'USDT0',
      spotPrice: 70,
      strikePrice: 66.5,
      quantity: 50,
      premiumUsd: 59.85,
      feeUsd: fee,
      expiryTimestampMs: nowMs + 10 * DAY,
      nowMs
    });

    expect(calc.netPremiumUsd).toBeCloseTo(59.85 - fee, 4);
    expect(calc.breakEvenPrice).toBeGreaterThan(65.303);
    expect(calc.netEffectiveBuyPrice).toBeCloseTo(66.5 - (59.85 - fee) / 50, 4);
  });

  it('در صورت منقضی‌شدن زمان سررسید یا ورودی نامعتبر، خطای شفاف برمی‌گرداند', () => {
    const expired = calculateCsp({
      asset: 'ETH',
      networkLabel: 'Ethereum Mainnet',
      chainId: 1,
      collateralToken: 'USDC',
      spotPrice: 3200,
      strikePrice: 3000,
      quantity: 1,
      premiumUsd: 45,
      expiryTimestampMs: nowMs - 1000,
      nowMs
    });
    expect(expired.valid).toBe(false);
    expect(expired.expired).toBe(true);
    expect(expired.aprPct).toBeNull();
    expect(expired.errors.length).toBeGreaterThan(0);
  });

  it('لینک مستقیم Rysk Finance و قیمت‌های پیشنهادی سناریو را صحیح می‌سازد', () => {
    const url = buildRyskEarnUrl({
      chainId: 999,
      asset: 'WHYPE',
      collateralToken: 'USDT0',
      expiryTimestampMs: 1795161600 * 1000
    });
    expect(url).toBe(
      'https://app.rysk.finance/earn/?chainId=999&asset=WHYPE&collateral=USDT0&strike=USDT0&type=put&expiry=1795161600'
    );

    const prices = buildDefaultScenarioPrices(66.5, 65.3);
    expect(prices).toContain(66.5);
    expect(prices.length).toBeGreaterThanOrEqual(5);
  });
});
