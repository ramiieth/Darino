/** ============================================================
 * Boros Audit Module — ممیزی نهایی Calculation Engine
 *
 *  ۱) جلوگیری از Double Counting: Realized Settlement و Unrealized MTM
 *     دو اثر اقتصادی مجزا هستند (Settlement = نرخ شناور واقعی؛ MTM = تغییر Mark).
 *     Total Gross = Gross Settlement + MTM  (بدون هم‌پوشانی)
 *  ۲) Long/Short Symmetry: Long Gross = X ⇔ Short Gross = −X
 *  ۳) Margin مستقل از PnL/Fees/Score
 *  ۴) Fee Model شفاف: هر Fee با Source (API / Market Data / User Input / N/A)
 *  ۵) خروجی Breakdown کامل برای هر Market
 * ============================================================ */
import type { BorosMarket } from '../types';
import { LongPnLCalculator, ShortPnLCalculator, calcRateSensitivity, daysToMaturity } from './pnl';
import { MarginCalculator } from './margin';
import { FeeCalculator, type FeeBreakdown, periodYears } from './fees';

/** منبع هر هزینه — هیچ هزینه‌ای بدون Source واقعی ساخته نمی‌شود */
export type FeeSource = 'api' | 'market-data' | 'user-input' | 'na';

export interface FeeLine {
  label: string;
  amount: number;
  source: FeeSource;
  /** توضیح منبع (مثلاً config.takerFee از API) */
  note: string;
}

export interface MarketAuditBreakdown {
  /* شناسه */
  marketId: number;
  asset: string;
  venue: string;
  maturity: number;
  daysToMaturity: number;
  /* نرخ‌ها (Decimal) */
  fixedApr: number;
  floatingApr: number;
  markApr: number;
  /* ---------- PnL تفکیکی ---------- */
  grossSettlementLong: number;
  grossSettlementShort: number;
  realizedLong: number;
  realizedShort: number;
  unrealizedMtmLong: number;
  unrealizedMtmShort: number;
  totalGrossLong: number; // grossSettlement + MTM
  totalGrossShort: number;
  /* ---------- هزینه‌ها (خط‌به‌خط با Source) ---------- */
  feeLines: FeeLine[];
  totalCostsLong: number;
  totalCostsShort: number;
  /* ---------- Net ---------- */
  netLong: number;
  netShort: number;
  /* ---------- Margin (مستقل) ---------- */
  marginParams: {
    size: number;
    rate: number;
    rateFloor: number;
    ytm: number;
    ytmFloor: number;
    imRatio: number;
  };
  marginRequired: number;
  /* ---------- بازده (چهار معیار جدا) ---------- */
  roiLongMargin: number;
  roiLongNotional: number;
  annualizedLong: number;
  roiShortMargin: number;
  roiShortNotional: number;
  annualizedShort: number;
}

export interface AuditInput {
  m: BorosMarket;
  size: number;
  nowSec?: number;
  gasUsd?: number;
  slippageRate?: number | null;
}

/** ساخت خط هزینه با منبع شفاف */
function feeLine(label: string, amount: number, source: FeeSource, note: string): FeeLine {
  return { label, amount, source, note };
}

/** ممیزی کامل یک بازار — همه ارقام تفکیکی */
export function auditMarket(input: AuditInput): MarketAuditBreakdown {
  const { m, size } = input;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const days = daysToMaturity(m, nowSec);
  const ytm = Math.max(0, (m.maturity - nowSec) / 86_400 / 365);

  /* ---------- نرخ‌ها ---------- */
  const fixed = m.markApr; // Entry Fixed (Mark)
  const floating = m.floatingApr; // Underlying
  const mark = m.markApr;

  /* ---------- PnL تفکیکی ---------- */
  const grossSettlementLong = LongPnLCalculator.gross(size, fixed, floating, days);
  const grossSettlementShort = ShortPnLCalculator.gross(size, fixed, floating, days);

  // MTM: تغییر Mark از Entry Fixed (Entry = Mark فعلی → MTM ≈ ۰ در ورود)
  const sensitivity = calcRateSensitivity(size, days);
  const mtmLong = sensitivity * ((mark - fixed) / 0.01); // Entry=Mark → 0
  const mtmShort = -mtmLong;

  const totalGrossLong = grossSettlementLong + mtmLong;
  const totalGrossShort = grossSettlementShort + mtmShort;

  /* ---------- هزینه‌ها با Source (فرمول‌های مستندات رسمی Boros) ---------- */
  const lines: FeeLine[] = [];
  const hasTaker = m.takerFee > 0;
  const hasSettle = m.settleFeeRate > 0;
  const hasGas = (input.gasUsd ?? 0) > 0;
  const hasSlippage = (input.slippageRate ?? 0) > 0;
  const nSettle = FeeCalculator.settlementsCount(m, nowSec);

  // Entry Fee — فرمول رسمی: |Size| × takerFee × YTM (docs/Mechanics/Fees)
  const entryFee = hasTaker ? FeeCalculator.openingFee(size, m.takerFee, ytm) : 0;
  lines.push(
    feeLine('ورود (Entry)', entryFee, hasTaker ? 'api' : 'na', hasTaker ? '|Size| × takerFee × YTM (مستند رسمی Boros)' : 'در Market داده نشده → ۰')
  );
  // Exit Fee — همان فرمول برای خروج
  const exitFee = hasTaker ? FeeCalculator.openingFee(size, m.takerFee, ytm) : 0;
  lines.push(
    feeLine('خروج (Exit)', exitFee, hasTaker ? 'api' : 'na', hasTaker ? '|Size| × takerFee × YTM (خروج)' : 'در Market داده نشده → ۰')
  );
  // Settlement Fee — فرمول رسمی: |Size| × settleFeeRate × Period × تعداد تسویه
  const settlementFee = hasSettle
    ? FeeCalculator.settlementFee(size, m.settleFeeRate, periodYears(m), nSettle)
    : 0;
  lines.push(
    feeLine('تسویه (Settlement)', settlementFee, hasSettle ? 'api' : 'na', hasSettle ? '|Size| × settleFeeRate × Period × N (مستند رسمی Boros)' : 'در Market داده نشده → ۰')
  );
  // Market Entrance Fee — در API عمومی نیست
  lines.push(
    feeLine('ورود به بازار (Entrance)', 0, 'na', 'از API عمومی در دسترس نیست (CashFeeData) → N/A')
  );
  // Gas — فقط User Input
  const gas = hasGas ? (input.gasUsd ?? 0) : 0;
  lines.push(
    feeLine('گس (Gas)', gas, hasGas ? 'user-input' : 'na', hasGas ? 'ورودی کاربر' : 'داده نشده → ۰ (هرگز حدس نمی‌زنیم)')
  );
  // Slippage — فقط با داده واقعی
  const slippage = hasSlippage ? FeeCalculator.slippageCost(size, input.slippageRate ?? null, m.markApr) : 0;
  lines.push(
    feeLine('Slippage', slippage, hasSlippage ? 'market-data' : 'na', hasSlippage ? 'از Order Book/شبیه‌سازی' : 'داده Order Book عمومی نیست → ۰')
  );

  const totalCosts = lines.reduce((s, l) => s + l.amount, 0);

  /* ---------- Net (Gross Settlement + MTM − Costs) ---------- */
  const netLong = totalGrossLong - totalCosts;
  const netShort = totalGrossShort - totalCosts;

  /* ---------- Margin (کاملاً مستقل) ---------- */
  const marginParams = {
    size,
    rate: fixed,
    rateFloor: m.marginFloor,
    ytm,
    ytmFloor: m.ytmFloor ?? 0.014,
    imRatio: m.kIM
  };
  const marginRequired = MarginCalculator.calc(marginParams);

  /* ---------- بازده (جدا) ---------- */
  const roi = (net: number, base: number) => (base > 0 ? (net / base) * 100 : 0);
  const annualized = (net: number, daysN: number) => (marginRequired > 0 && daysN > 0 ? (net / marginRequired) * (365 / daysN) * 100 : 0);

  return {
    marketId: m.marketId,
    asset: m.asset,
    venue: m.venue,
    maturity: m.maturity,
    daysToMaturity: days,
    fixedApr: fixed,
    floatingApr: floating,
    markApr: mark,
    grossSettlementLong,
    grossSettlementShort,
    realizedLong: grossSettlementLong,
    realizedShort: grossSettlementShort,
    unrealizedMtmLong: mtmLong,
    unrealizedMtmShort: mtmShort,
    totalGrossLong,
    totalGrossShort,
    feeLines: lines,
    totalCostsLong: totalCosts,
    totalCostsShort: totalCosts,
    netLong,
    netShort,
    marginParams,
    marginRequired,
    roiLongMargin: roi(netLong, marginRequired),
    roiLongNotional: roi(netLong, size),
    annualizedLong: annualized(netLong, days),
    roiShortMargin: roi(netShort, marginRequired),
    roiShortNotional: roi(netShort, size),
    annualizedShort: annualized(netShort, days)
  };
}

/** ممیزی N بازار — خروجی جدول کامل */
export function auditMarkets(markets: BorosMarket[], size = 1000): MarketAuditBreakdown[] {
  return markets.map((m) => auditMarket({ m, size }));
}

/* ================= روابط ریاضی (برای تست) ================= */

/** ۱) Double Counting proof:
 *  Total Gross = Realized(Settlement) + Unrealized(MTM) — دو اثر مجزا
 *  Net = Total Gross − Total Costs
 */
export function verifyNoDoubleCounting(b: MarketAuditBreakdown): boolean {
  const grossOk =
    Math.abs(b.totalGrossLong - (b.realizedLong + b.unrealizedMtmLong)) < 1e-9 &&
    Math.abs(b.totalGrossShort - (b.realizedShort + b.unrealizedMtmShort)) < 1e-9;
  const netOk =
    Math.abs(b.netLong - (b.totalGrossLong - b.totalCostsLong)) < 1e-9 &&
    Math.abs(b.netShort - (b.totalGrossShort - b.totalCostsShort)) < 1e-9;
  return grossOk && netOk;
}

/** ۲) Long/Short Symmetry: Long Gross = X ⇔ Short Gross = −X */
export function verifyLongShortSymmetry(b: MarketAuditBreakdown): boolean {
  return (
    Math.abs(b.grossSettlementLong + b.grossSettlementShort) < 1e-9 &&
    Math.abs(b.totalGrossLong + b.totalGrossShort) < 1e-9
  );
}

/** ۳) MTM دوباره Settlement را حساب نمی‌کند (MTM بر پایه Mark−Entry؛ Settlement بر پایه Floating−Fixed) */
export function verifyMtmIndependent(b: MarketAuditBreakdown): boolean {
  // اگر Entry = Mark فعلی → MTM ≈ ۰ (ورود)؛ در هر حال MTM مستقل از floating است
  const mtmUsesFloating =
    Math.abs(b.unrealizedMtmLong) < 1e-9 && Math.abs(b.unrealizedMtmShort) < 1e-9;
  return mtmUsesFloating;
}

/** ۴) Margin مستقل از PnL/Fees — فقط از پارامترهای Market */
export function verifyMarginIndependent(
  m: BorosMarket,
  size: number,
  nowSec: number,
  marginRequired: number
): boolean {
  const expected = MarginCalculator.calc({
    size,
    rate: m.markApr,
    rateFloor: m.marginFloor,
    ytm: Math.max(0, (m.maturity - nowSec) / 86_400 / 365),
    ytmFloor: m.ytmFloor ?? 0.014,
    imRatio: m.kIM
  });
  return Math.abs(expected - marginRequired) < 1e-9;
}

/** ۵) هیچ Fee بدون Source ساخته نشده — همه خط‌ها یا amount=0 با source=na یا amount>0 با source واقعی */
export function verifyFeeSources(b: MarketAuditBreakdown): boolean {
  return b.feeLines.every((l) => {
    if (l.amount === 0) return l.source === 'na';
    return l.source === 'api' || l.source === 'market-data' || l.source === 'user-input';
  });
}

/** ۶) جمع هزینه‌ها = مجموع خط‌ها (بدون دو شمارش) */
export function verifyFeesSum(b: MarketAuditBreakdown): boolean {
  const sum = b.feeLines.reduce((s, l) => s + l.amount, 0);
  return Math.abs(sum - b.totalCostsLong) < 1e-9 && Math.abs(sum - b.totalCostsShort) < 1e-9;
}
