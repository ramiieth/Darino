import { describe, expect, it } from 'vitest';
import { calculateMt5Risk, floorToLotStep, sumDailyTradesPnl, type Mt5RiskInput } from './mt5RiskManager';

function baseInput(overrides: Partial<Mt5RiskInput> = {}): Mt5RiskInput {
  return {
    side: 'buy',
    equityUsd: 10000,
    riskMode: 'percent',
    riskPercent: 1,
    fixedRiskUsd: 100,
    entryPrice: 2650,
    stopLossPrice: 2640, // $10 = 100 pips on XAUUSD
    takeProfitPrice: 2675, // $25 = 250 pips -> 2.5R
    contractSize: 100,
    pipSize: 0.1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    quoteCurrency: 'USD',
    leverage: 100,
    maxDailyLossPct: 3,
    todayRealizedPnlUsd: 0,
    partialSteps: [
      { id: 'tp1', label: 'پله ۱', closePct: 50, rMultiple: 1 },
      { id: 'tp2', label: 'پله ۲', closePct: 30, rMultiple: 2 },
      { id: 'tp3', label: 'پله ۳', closePct: 20, rMultiple: 3 }
    ],
    breakeven: { enabled: true, triggerR: 1, offsetPips: 2 },
    trailing: { enabled: true, startR: 1.5, distancePips: 50 },
    ...overrides
  };
}

describe('mt5RiskManager', () => {
  it('floors lot sizes cleanly without floating point drift', () => {
    expect(floorToLotStep(0.3, 0.1)).toBe(0.3);
    expect(floorToLotStep(0.299, 0.01)).toBe(0.29);
    expect(floorToLotStep(0.009, 0.01)).toBe(0);
  });

  it('computes exact lot size, risk, R:R, and partial closes on XAUUSD', () => {
    const res = calculateMt5Risk(baseInput());
    expect(res.valid).toBe(true);
    expect(res.plannedRiskUsd).toBe(100);
    expect(res.pipValuePerLotUsd).toBe(10);
    expect(res.slPips).toBe(100);
    expect(res.recommendedLots).toBe(0.1);
    expect(res.actualRiskUsd).toBe(100);
    expect(res.rewardRiskRatio).toBeCloseTo(2.5, 6);
    expect(res.targetProfitUsd).toBe(250);

    // Partial close: 0.05 + 0.03 + 0.02 = 0.10 lots
    expect(res.partialPlan).toHaveLength(3);
    expect(res.partialPlan[0].lotsToClose).toBe(0.05);
    expect(res.partialPlan[0].targetPrice).toBe(2660);
    expect(res.partialPlan[0].profitUsd).toBe(50);
    expect(res.partialPlan[1].lotsToClose).toBe(0.03);
    expect(res.partialPlan[1].profitUsd).toBe(60);
    expect(res.partialPlan[2].lotsToClose).toBe(0.02);
    expect(res.partialPlan[2].profitUsd).toBe(60);
    expect(res.totalPartialProfitUsd).toBe(170);
    expect(res.blendedRewardRisk).toBeCloseTo(1.7, 6);
  });

  it('handles EURUSD standard 100k contract sizing', () => {
    const res = calculateMt5Risk(
      baseInput({
        equityUsd: 5000,
        riskPercent: 2, // $100
        entryPrice: 1.085,
        stopLossPrice: 1.0825, // 25 pips
        takeProfitPrice: 1.09, // 50 pips -> 2R
        contractSize: 100000,
        pipSize: 0.0001
      })
    );
    expect(res.valid).toBe(true);
    expect(res.pipValuePerLotUsd).toBe(10);
    expect(res.slPips).toBeCloseTo(25, 6);
    expect(res.recommendedLots).toBe(0.4); // 100 / (25 * 10) = 0.40 lots
    expect(res.rewardRiskRatio).toBeCloseTo(2, 6);
  });

  it('handles JPY-quoted pairs (USDJPY) pip value conversion', () => {
    const res = calculateMt5Risk(
      baseInput({
        equityUsd: 10000,
        riskPercent: 1, // $100
        entryPrice: 150,
        stopLossPrice: 149.5, // 50 pips
        takeProfitPrice: 151,
        contractSize: 100000,
        pipSize: 0.01,
        quoteCurrency: 'JPY'
      })
    );
    expect(res.valid).toBe(true);
    // Pip value per lot = (0.01 * 100,000) / 150 = 6.6666... USD
    expect(res.pipValuePerLotUsd).toBeCloseTo(6.6667, 3);
    // 50 pips * 6.6667 = $333.33 per lot -> 100 / 333.33 = 0.30 lots
    expect(res.recommendedLots).toBe(0.3);
  });

  it('flags invalid stop loss side for buy and sell', () => {
    const badBuy = calculateMt5Risk(baseInput({ side: 'buy', entryPrice: 100, stopLossPrice: 105 }));
    expect(badBuy.valid).toBe(false);
    expect(badBuy.warnings).toContain('invalidSlSide');

    const badSell = calculateMt5Risk(baseInput({ side: 'sell', entryPrice: 100, stopLossPrice: 95 }));
    expect(badSell.valid).toBe(false);
    expect(badSell.warnings).toContain('invalidSlSide');
  });

  it('detects daily drawdown caution and breach', () => {
    // Max daily loss 3% of $10,000 = $300. Already lost $220, new risk $100 -> $320 > $300 -> breached
    const breached = calculateMt5Risk(baseInput({ todayRealizedPnlUsd: -220 }));
    expect(breached.dailyStatus).toBe('breached');
    expect(breached.warnings).toContain('dailyDrawdownBreached');
    expect(breached.remainingDailyRiskUsd).toBe(80);

    // Already lost $150, new risk $100 -> $250 / $300 = 83.3% -> caution
    const caution = calculateMt5Risk(baseInput({ todayRealizedPnlUsd: -150 }));
    expect(caution.dailyStatus).toBe('caution');
    expect(caution.warnings).toContain('dailyDrawdownCaution');
  });

  it('sums daily closed trades accurately without floating point drift', () => {
    expect(
      sumDailyTradesPnl([
        { pnlUsd: -45.2 },
        { pnlUsd: 120.5 },
        { pnlUsd: -15.3 }
      ])
    ).toBe(60);
  });
});
