import Decimal from 'decimal.js';

export type TradeSide = 'buy' | 'sell';
export type RiskMode = 'percent' | 'fixed';
export type InstrumentId =
  | 'XAUUSD'
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'NAS100'
  | 'US30'
  | 'SP500'
  | 'BTCUSD'
  | 'ETHUSD'
  | 'CUSTOM';

export interface Mt5InstrumentPreset {
  id: InstrumentId;
  symbol: string;
  nameFa: string;
  brokerNote: string;
  contractSize: number;
  pipSize: number;
  lotStep: number;
  minLot: number;
  maxLot: number;
  defaultLeverage: number;
  quoteCurrency: 'USD' | 'JPY';
  priceDecimals: number;
  defaultEntry: number;
  defaultSl: number;
  defaultTp: number;
}

/** پیش‌فرض قراردادهای بایبیت MT5 (حساب USDx / جفت‌ارزها و طلا با پسوند +) */
export const MT5_INSTRUMENTS: Mt5InstrumentPreset[] = [
  {
    id: 'XAUUSD',
    symbol: 'XAUUSD+',
    nameFa: 'طلا — بایبیت (XAUUSD+)',
    brokerNote: 'Bybit MT5 · ۱ لات = ۱۰۰ انس · اهرم تا ۵۰۰x',
    contractSize: 100,
    pipSize: 0.1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 500,
    quoteCurrency: 'USD',
    priceDecimals: 2,
    defaultEntry: 2650,
    defaultSl: 2640,
    defaultTp: 2675
  },
  {
    id: 'EURUSD',
    symbol: 'EURUSD+',
    nameFa: 'یورو / دلار — بایبیت (EURUSD+)',
    brokerNote: 'Bybit MT5 · ۱ لات = ۱۰۰,۰۰۰ واحد · اهرم تا ۵۰۰x',
    contractSize: 100000,
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 500,
    quoteCurrency: 'USD',
    priceDecimals: 5,
    defaultEntry: 1.085,
    defaultSl: 1.082,
    defaultTp: 1.0925
  },
  {
    id: 'GBPUSD',
    symbol: 'GBPUSD+',
    nameFa: 'پوند / دلار — بایبیت (GBPUSD+)',
    brokerNote: 'Bybit MT5 · ۱ لات = ۱۰۰,۰۰۰ واحد · اهرم تا ۵۰۰x',
    contractSize: 100000,
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 500,
    quoteCurrency: 'USD',
    priceDecimals: 5,
    defaultEntry: 1.27,
    defaultSl: 1.266,
    defaultTp: 1.28
  },
  {
    id: 'USDJPY',
    symbol: 'USDJPY+',
    nameFa: 'دلار / ین — بایبیت (USDJPY+)',
    brokerNote: 'Bybit MT5 · ۱ لات = ۱۰۰,۰۰۰ واحد · اهرم تا ۵۰۰x',
    contractSize: 100000,
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 500,
    quoteCurrency: 'JPY',
    priceDecimals: 3,
    defaultEntry: 154.5,
    defaultSl: 154.0,
    defaultTp: 155.75
  },
  {
    id: 'NAS100',
    symbol: 'NAS100',
    nameFa: 'شاخص نزدک — بایبیت (NAS100)',
    brokerNote: 'Bybit MT5 · شاخص CFD · اهرم تا ۱۰۰x',
    contractSize: 1,
    pipSize: 1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 100,
    quoteCurrency: 'USD',
    priceDecimals: 2,
    defaultEntry: 20800,
    defaultSl: 20700,
    defaultTp: 21050
  },
  {
    id: 'US30',
    symbol: 'US30',
    nameFa: 'شاخص داوجونز — بایبیت (US30)',
    brokerNote: 'Bybit MT5 · شاخص CFD · اهرم تا ۱۰۰x',
    contractSize: 1,
    pipSize: 1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 100,
    quoteCurrency: 'USD',
    priceDecimals: 2,
    defaultEntry: 43800,
    defaultSl: 43650,
    defaultTp: 44175
  },
  {
    id: 'SP500',
    symbol: 'SP500',
    nameFa: 'شاخص S&P 500 — بایبیت (SP500)',
    brokerNote: 'Bybit MT5 · شاخص CFD · اهرم تا ۱۰۰x',
    contractSize: 1,
    pipSize: 1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 100,
    quoteCurrency: 'USD',
    priceDecimals: 2,
    defaultEntry: 6000,
    defaultSl: 5970,
    defaultTp: 6075
  },
  {
    id: 'BTCUSD',
    symbol: 'BTCUSD',
    nameFa: 'بیت‌کوین (BTCUSD)',
    brokerNote: 'MT5 · ۱ لات = ۱ BTC',
    contractSize: 1,
    pipSize: 1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 50,
    quoteCurrency: 'USD',
    priceDecimals: 2,
    defaultEntry: 90000,
    defaultSl: 88500,
    defaultTp: 93750
  },
  {
    id: 'ETHUSD',
    symbol: 'ETHUSD',
    nameFa: 'اتریوم (ETHUSD)',
    brokerNote: 'MT5 · ۱ لات = ۱ ETH',
    contractSize: 1,
    pipSize: 1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 50,
    quoteCurrency: 'USD',
    priceDecimals: 2,
    defaultEntry: 3100,
    defaultSl: 3020,
    defaultTp: 3300
  },
  {
    id: 'CUSTOM',
    symbol: 'CUSTOM',
    nameFa: 'نماد سفارشی',
    brokerNote: 'تنظیم دستی قرارداد',
    contractSize: 100,
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 100,
    quoteCurrency: 'USD',
    priceDecimals: 4,
    defaultEntry: 100,
    defaultSl: 98,
    defaultTp: 105
  }
];

export interface DailyClosedTrade {
  id: string;
  symbol: string;
  pnlUsd: number;
  note?: string;
  createdAt: number;
}

export function sumDailyTradesPnl(trades: Pick<DailyClosedTrade, 'pnlUsd'>[]): number {
  return trades
    .reduce((acc, t) => acc.plus(Number.isFinite(t.pnlUsd) ? t.pnlUsd : 0), new Decimal(0))
    .toNumber();
}

export interface PartialCloseStepInput {
  id: string;
  label: string;
  closePct: number;
  rMultiple: number;
}

export interface BreakevenInput {
  enabled: boolean;
  triggerR: number;
  offsetPips: number;
}

export interface TrailingStopInput {
  enabled: boolean;
  startR: number;
  distancePips: number;
}

export interface Mt5RiskInput {
  side: TradeSide;
  equityUsd: number;
  riskMode: RiskMode;
  riskPercent: number;
  fixedRiskUsd: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  contractSize: number;
  pipSize: number;
  lotStep: number;
  minLot: number;
  maxLot: number;
  quoteCurrency: 'USD' | 'JPY';
  pipValuePerLotOverride?: number | null;
  leverage: number;
  maxDailyLossPct: number;
  todayRealizedPnlUsd: number;
  partialSteps: PartialCloseStepInput[];
  breakeven: BreakevenInput;
  trailing: TrailingStopInput;
}

export interface PartialCloseStepResult {
  id: string;
  label: string;
  closePct: number;
  rMultiple: number;
  targetPrice: number;
  pipsFromEntry: number;
  lotsToClose: number;
  profitUsd: number;
}

export interface TrailingCheckpoint {
  rMultiple: number;
  marketPrice: number;
  trailedSlPrice: number;
  lockedProfitUsd: number;
}

export type RiskWarningCode =
  | 'invalidEquity'
  | 'invalidPrices'
  | 'invalidSlSide'
  | 'invalidTpSide'
  | 'belowMinLot'
  | 'cappedMaxLot'
  | 'partialPctMismatch'
  | 'dailyDrawdownBreached'
  | 'dailyDrawdownCaution';

export interface Mt5RiskResult {
  valid: boolean;
  warnings: RiskWarningCode[];
  plannedRiskUsd: number;
  pipValuePerLotUsd: number;
  slDistancePrice: number;
  slPips: number;
  tpDistancePrice: number;
  tpPips: number;
  rewardRiskRatio: number | null;
  rawLots: number;
  recommendedLots: number;
  actualRiskUsd: number;
  actualRiskPct: number;
  targetProfitUsd: number;
  notionalUsd: number;
  estimatedMarginUsd: number | null;
  breakevenTriggerPrice: number | null;
  breakevenStopPrice: number | null;
  partialPlan: PartialCloseStepResult[];
  totalPartialProfitUsd: number;
  blendedRewardRisk: number | null;
  trailingStartPrice: number | null;
  trailingCheckpoints: TrailingCheckpoint[];
  maxDailyLossUsd: number;
  usedDailyLossUsd: number;
  projectedDailyLossUsd: number;
  remainingDailyRiskUsd: number;
  dailyLossUsedPct: number;
  projectedDailyLossPct: number;
  dailyStatus: 'safe' | 'caution' | 'breached';
}

function pos(n: number | null | undefined): number {
  return n !== null && n !== undefined && Number.isFinite(n) && n > 0 ? n : 0;
}

export function floorToLotStep(lots: number, step: number): number {
  if (!(lots > 0)) return 0;
  if (!(step > 0)) return lots;
  const dLots = new Decimal(lots);
  const dStep = new Decimal(step);
  return dLots.div(dStep).floor().mul(dStep).toNumber();
}

export function calculateMt5Risk(input: Mt5RiskInput): Mt5RiskResult {
  const warnings: RiskWarningCode[] = [];
  const equity = pos(input.equityUsd);
  const entry = pos(input.entryPrice);
  const sl = pos(input.stopLossPrice);
  const tp = pos(input.takeProfitPrice);
  const contractSize = pos(input.contractSize);
  const pipSize = pos(input.pipSize);
  const lotStep = pos(input.lotStep) || 0.01;
  const minLot = pos(input.minLot) || 0.01;
  const maxLot = pos(input.maxLot) || 100;
  const leverage = pos(input.leverage);

  if (equity <= 0) warnings.push('invalidEquity');
  if (entry <= 0 || sl <= 0 || contractSize <= 0 || pipSize <= 0) {
    warnings.push('invalidPrices');
  }

  const slValidSide = input.side === 'buy' ? sl < entry : sl > entry;
  if (entry > 0 && sl > 0 && !slValidSide) {
    warnings.push('invalidSlSide');
  }

  const tpValidSide = tp <= 0 ? true : input.side === 'buy' ? tp > entry : tp < entry;
  if (entry > 0 && tp > 0 && !tpValidSide) {
    warnings.push('invalidTpSide');
  }

  const plannedRiskUsd =
    input.riskMode === 'percent'
      ? new Decimal(equity).mul(pos(input.riskPercent)).div(100).toNumber()
      : pos(input.fixedRiskUsd);

  const maxDailyLossPct = pos(input.maxDailyLossPct);
  const maxDailyLossUsd = new Decimal(equity).mul(maxDailyLossPct).div(100).toNumber();
  const usedDailyLossUsd = input.todayRealizedPnlUsd < 0 ? Math.abs(input.todayRealizedPnlUsd) : 0;

  if (equity <= 0 || entry <= 0 || sl <= 0 || contractSize <= 0 || pipSize <= 0 || !slValidSide) {
    const dailyLossUsedPct = maxDailyLossUsd > 0 ? (usedDailyLossUsd / maxDailyLossUsd) * 100 : 0;
    return {
      valid: false,
      warnings,
      plannedRiskUsd,
      pipValuePerLotUsd: 0,
      slDistancePrice: 0,
      slPips: 0,
      tpDistancePrice: 0,
      tpPips: 0,
      rewardRiskRatio: null,
      rawLots: 0,
      recommendedLots: 0,
      actualRiskUsd: 0,
      actualRiskPct: 0,
      targetProfitUsd: 0,
      notionalUsd: 0,
      estimatedMarginUsd: null,
      breakevenTriggerPrice: null,
      breakevenStopPrice: null,
      partialPlan: [],
      totalPartialProfitUsd: 0,
      blendedRewardRisk: null,
      trailingStartPrice: null,
      trailingCheckpoints: [],
      maxDailyLossUsd,
      usedDailyLossUsd,
      projectedDailyLossUsd: usedDailyLossUsd,
      remainingDailyRiskUsd: Math.max(0, maxDailyLossUsd - usedDailyLossUsd),
      dailyLossUsedPct,
      projectedDailyLossPct: dailyLossUsedPct,
      dailyStatus: maxDailyLossUsd > 0 && usedDailyLossUsd >= maxDailyLossUsd ? 'breached' : 'safe'
    };
  }

  const dEntry = new Decimal(entry);
  const dSl = new Decimal(sl);
  const dPip = new Decimal(pipSize);
  const dContract = new Decimal(contractSize);

  const slDistancePrice = dEntry.minus(dSl).abs().toNumber();
  const slPips = new Decimal(slDistancePrice).div(dPip).toNumber();

  const overridePipVal = pos(input.pipValuePerLotOverride);
  const pipValuePerLotUsd =
    overridePipVal > 0
      ? overridePipVal
      : input.quoteCurrency === 'JPY'
        ? dPip.mul(dContract).div(dEntry).toNumber()
        : dPip.mul(dContract).toNumber();

  const slLossPerLotUsd = new Decimal(slPips).mul(pipValuePerLotUsd).toNumber();
  const rawLots = slLossPerLotUsd > 0 ? new Decimal(plannedRiskUsd).div(slLossPerLotUsd).toNumber() : 0;

  let recommendedLots = floorToLotStep(rawLots, lotStep);
  if (rawLots > 0 && recommendedLots < minLot) {
    warnings.push('belowMinLot');
  }
  if (recommendedLots > maxLot) {
    recommendedLots = maxLot;
    warnings.push('cappedMaxLot');
  }

  const actualRiskUsd = new Decimal(recommendedLots).mul(slLossPerLotUsd).toNumber();
  const actualRiskPct = equity > 0 ? new Decimal(actualRiskUsd).div(equity).mul(100).toNumber() : 0;

  const tpDistancePrice = tp > 0 && tpValidSide ? new Decimal(tp).minus(dEntry).abs().toNumber() : 0;
  const tpPips = tpDistancePrice > 0 ? new Decimal(tpDistancePrice).div(dPip).toNumber() : 0;
  const rewardRiskRatio = tpDistancePrice > 0 && slDistancePrice > 0 ? tpDistancePrice / slDistancePrice : null;
  const targetProfitUsd =
    tpPips > 0 ? new Decimal(recommendedLots).mul(tpPips).mul(pipValuePerLotUsd).toNumber() : 0;

  const notionalUsd =
    input.quoteCurrency === 'JPY'
      ? new Decimal(recommendedLots).mul(dContract).toNumber()
      : new Decimal(recommendedLots).mul(dContract).mul(dEntry).toNumber();
  const estimatedMarginUsd = leverage > 0 ? new Decimal(notionalUsd).div(leverage).toNumber() : null;

  const dir = input.side === 'buy' ? 1 : -1;

  // Breakeven
  const breakevenTriggerPrice =
    input.breakeven.enabled && pos(input.breakeven.triggerR) > 0
      ? dEntry.plus(new Decimal(dir).mul(input.breakeven.triggerR).mul(slDistancePrice)).toNumber()
      : null;
  const breakevenStopPrice =
    input.breakeven.enabled
      ? dEntry.plus(new Decimal(dir).mul(input.breakeven.offsetPips || 0).mul(dPip)).toNumber()
      : null;

  // Partial Close Plan
  const activeSteps = input.partialSteps.filter((s) => pos(s.closePct) > 0 && pos(s.rMultiple) > 0);
  const pctSum = activeSteps.reduce((acc, s) => acc + s.closePct, 0);
  if (activeSteps.length > 0 && Math.abs(pctSum - 100) > 0.5) {
    warnings.push('partialPctMismatch');
  }

  let allocatedLots = new Decimal(0);
  const partialPlan: PartialCloseStepResult[] = activeSteps.map((s, idx) => {
    const isLast = idx === activeSteps.length - 1;
    const rawStepLots = new Decimal(recommendedLots).mul(s.closePct).div(100).toNumber();
    let stepLots = isLast
      ? Decimal.max(0, new Decimal(recommendedLots).minus(allocatedLots)).toNumber()
      : floorToLotStep(rawStepLots, lotStep);
    stepLots = floorToLotStep(stepLots, lotStep);
    allocatedLots = allocatedLots.plus(stepLots);

    const stepPrice = dEntry.plus(new Decimal(dir).mul(s.rMultiple).mul(slDistancePrice)).toNumber();
    const stepPips = new Decimal(s.rMultiple).mul(slPips).toNumber();
    const stepProfitUsd = new Decimal(stepLots).mul(stepPips).mul(pipValuePerLotUsd).toNumber();

    return {
      id: s.id,
      label: s.label,
      closePct: s.closePct,
      rMultiple: s.rMultiple,
      targetPrice: stepPrice,
      pipsFromEntry: stepPips,
      lotsToClose: stepLots,
      profitUsd: stepProfitUsd
    };
  });

  const totalPartialProfitUsd = partialPlan.reduce((acc, p) => acc + p.profitUsd, 0);
  const blendedRewardRisk = actualRiskUsd > 0 && totalPartialProfitUsd > 0 ? totalPartialProfitUsd / actualRiskUsd : null;

  // Trailing Stop Checkpoints
  const trailingStartPrice =
    input.trailing.enabled && pos(input.trailing.startR) > 0
      ? dEntry.plus(new Decimal(dir).mul(input.trailing.startR).mul(slDistancePrice)).toNumber()
      : null;

  const trailingCheckpoints: TrailingCheckpoint[] = [];
  if (input.trailing.enabled && pos(input.trailing.distancePips) > 0 && recommendedLots > 0) {
    const startR = Math.max(1, Math.ceil(pos(input.trailing.startR) || 1));
    const trailDistPrice = new Decimal(input.trailing.distancePips).mul(dPip);
    for (const r of [startR, startR + 1, startR + 2]) {
      const mkt = dEntry.plus(new Decimal(dir).mul(r).mul(slDistancePrice));
      const trailedSl = mkt.minus(new Decimal(dir).mul(trailDistPrice));
      const lockedDist = trailedSl.minus(dEntry).mul(dir);
      const lockedPips = lockedDist.div(dPip);
      const lockedProfitUsd = lockedPips.mul(pipValuePerLotUsd).mul(recommendedLots).toNumber();
      trailingCheckpoints.push({
        rMultiple: r,
        marketPrice: mkt.toNumber(),
        trailedSlPrice: trailedSl.toNumber(),
        lockedProfitUsd
      });
    }
  }

  // Daily Drawdown Guard
  const projectedDailyLossUsd = new Decimal(usedDailyLossUsd).plus(actualRiskUsd).toNumber();
  const remainingDailyRiskUsd = Math.max(0, new Decimal(maxDailyLossUsd).minus(usedDailyLossUsd).toNumber());
  const dailyLossUsedPct = maxDailyLossUsd > 0 ? (usedDailyLossUsd / maxDailyLossUsd) * 100 : 0;
  const projectedDailyLossPct = maxDailyLossUsd > 0 ? (projectedDailyLossUsd / maxDailyLossUsd) * 100 : 0;

  let dailyStatus: 'safe' | 'caution' | 'breached' = 'safe';
  if (maxDailyLossUsd > 0) {
    if (projectedDailyLossUsd > maxDailyLossUsd || usedDailyLossUsd >= maxDailyLossUsd) {
      dailyStatus = 'breached';
      warnings.push('dailyDrawdownBreached');
    } else if (projectedDailyLossPct >= 75) {
      dailyStatus = 'caution';
      warnings.push('dailyDrawdownCaution');
    }
  }

  return {
    valid: true,
    warnings,
    plannedRiskUsd,
    pipValuePerLotUsd,
    slDistancePrice,
    slPips,
    tpDistancePrice,
    tpPips,
    rewardRiskRatio,
    rawLots,
    recommendedLots,
    actualRiskUsd,
    actualRiskPct,
    targetProfitUsd,
    notionalUsd,
    estimatedMarginUsd,
    breakevenTriggerPrice,
    breakevenStopPrice,
    partialPlan,
    totalPartialProfitUsd,
    blendedRewardRisk,
    trailingStartPrice,
    trailingCheckpoints,
    maxDailyLossUsd,
    usedDailyLossUsd,
    projectedDailyLossUsd,
    remainingDailyRiskUsd,
    dailyLossUsedPct,
    projectedDailyLossPct,
    dailyStatus
  };
}
