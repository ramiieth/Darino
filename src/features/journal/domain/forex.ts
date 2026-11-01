/**
 * برنامهٔ معاملهٔ متاتریدر — حجم به لات، پیپ، ارزش پیپ، مارجین + پیشنهاد استاپ/هدف/جهت از تاریخچهٔ خود کاربر (خالص)
 *
 *   حجم = (سرمایه × ریسک٪) ÷ (فاصلهٔ استاپ × اندازهٔ قرارداد + اسپرد × ارزش پیپ + کمیسیون هر لات)، رو به پایین به گام لات
 *         → ریسک واقعی هرگز از سقف بیشتر نمی‌شود؛ اگر کمتر از حداقل لات شد، معامله با این ریسک ممکن نیست.
 *   ارزش پیپ هر لات = اندازهٔ پیپ × اندازهٔ قرارداد (فقط برای نمادی که ارز دومش دلار است و حساب دلاری؛ وگرنه هشدار)
 *   مارجین = لات × اندازهٔ قرارداد × قیمت ÷ اهرم
 *
 *   پیشنهاد: استاپ = صدک ۹۰ حرکت خلاف برنده‌ها، هدف = میانهٔ حرکت موافق برنده‌ها (پنل مسیر قیمت)،
 *   به‌علاوهٔ امید ریاضی خود کاربر در همین نماد × جهت و همین ساعت روز. زمان ورود را پیش‌بینی نمی‌کند.
 */
import type { ClassifiedTrade, Direction } from './types';
import type { MtTrade } from './metatrader';
import type { SymbolExcursions } from './excursions';
import { baseOf } from './roundTrips';
import { hourOf } from './time';

/** نماد قابل برنامه‌ریزی در حالت متاتریدر (شش حرف ارزی، طلا، نقره، نفت) */
export function isForexSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return /^[A-Z]{6}$/.test(s) || /^(XAUUSD|XAGUSD|UKOUSD|USOUSD|UKOIL|USOIL|XBRUSD|XTIUSD)$/.test(s);
}

export const quotesUsd = (symbol: string) => /USD$/.test(symbol.toUpperCase()) || /^(UKOIL|USOIL)$/.test(symbol.toUpperCase());

/**
 * ارزش دلاری یک واحد ارز دوم نماد (برای ارزش پیپ و ریسک دلاری درست)
 *   …USD → ۱ ؛ USD… (USDJPY، USDCAD، USDCHF) → ۱ ÷ قیمت خود نماد ؛ …JPY → ۱ ÷ USDJPY ؛ …GBP → GBPUSD ؛ …EUR → EURUSD
 *   null = نرخ تبدیل را نداریم (ریسک دلاری تقریبی می‌ماند)
 */
export function quoteToUsd(symbol: string, price: number | null, rates: { USDJPY?: number | null; GBPUSD?: number | null; EURUSD?: number | null }): number | null {
  const s = symbol.toUpperCase();
  if (quotesUsd(s)) return 1;
  if (/^USD[A-Z]{3}$/.test(s)) return price && price > 0 ? 1 / price : null;
  if (s.endsWith('JPY')) return rates.USDJPY ? 1 / rates.USDJPY : null;
  if (s.endsWith('GBP')) return rates.GBPUSD ?? null;
  if (s.endsWith('EUR')) return rates.EURUSD ?? null;
  return null;
}

/** اندازهٔ پیپ رایج: ارز ۴ رقمی 0.0001، ین 0.01، طلا 0.1، نقره 0.01، نفت 0.01 */
export function pipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU')) return 0.1;
  if (s.startsWith('XAG') || /OIL|UKO|USO|XBR|XTI/.test(s)) return 0.01;
  if (s.endsWith('JPY')) return 0.01;
  return 0.0001;
}

const DEFAULT_CONTRACT: Record<string, number> = { XAUUSD: 100, XAGUSD: 5000 };

/** اندازهٔ قرارداد: از آخرین استیتمنت واردشدهٔ همین نماد؛ وگرنه پیش‌فرض رایج؛ نفت بدون پیش‌فرض (بروکرها ۱۰ تا ۱۰۰۰) */
export function contractSizeFor(symbol: string, mt: readonly MtTrade[]): { size: number | null; source: 'statement' | 'default' | null } {
  const s = symbol.toUpperCase();
  const fromMt = [...mt].filter((m) => m.symbol === s && m.contractSize !== null).sort((a, b) => b.closeTime - a.closeTime)[0];
  if (fromMt) return { size: fromMt.contractSize, source: 'statement' };
  if (DEFAULT_CONTRACT[s]) return { size: DEFAULT_CONTRACT[s], source: 'default' };
  if (/^[A-Z]{6}$/.test(s) && !/OIL|UKO|USO|XBR|XTI|XAU|XAG/.test(s)) return { size: 100_000, source: 'default' };
  return { size: null, source: null };
}

export interface ForexInput {
  symbol: string;
  direction: Direction;
  entry: number | null;
  stop: number | null;
  target: number | null;
  contractSize: number | null;
  capital: number | null;
  riskPct: number;
  leverage: number | null;
  spreadPips: number;
  commissionPerLot: number;
  lotStep?: number;
  minLot?: number;
  /** ارزش دلاری یک واحد ارز دوم (quoteToUsd)؛ نبودن = فرض دلار */
  quoteUsd?: number | null;
}

export interface ForexCalc {
  pip: number;
  stopPips: number | null;
  targetPips: number | null;
  pipValuePerLot: number | null;
  lots: number | null;
  /** واحد دارایی (لات × قرارداد) — همان «اندازه» برنامه تا R حسابرسی درست باشد */
  units: number | null;
  riskUsd: number | null;
  riskPct: number | null;
  rewardUsd: number | null;
  rr: number | null;
  margin: number | null;
  problems: string[];
}

const floorStep = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;

export function calcForex(i: ForexInput): ForexCalc {
  const pip = pipSize(i.symbol);
  const problems: string[] = [];
  const { entry, stop, target, contractSize: cs } = i;
  const step = i.lotStep ?? 0.01, minLot = i.minLot ?? 0.01;
  const dist = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  const tDist = entry !== null && target !== null ? Math.abs(target - entry) : null;
  if (entry !== null && stop !== null && (i.direction === 'long' ? stop >= entry : stop <= entry)) problems.push(i.direction === 'long' ? 'در لانگ، استاپ باید زیر ورود باشد.' : 'در شورت، استاپ باید بالای ورود باشد.');
  if (entry !== null && target !== null && (i.direction === 'long' ? target <= entry : target >= entry)) problems.push(i.direction === 'long' ? 'در لانگ، هدف باید بالای ورود باشد.' : 'در شورت، هدف باید زیر ورود باشد.');
  const q = quotesUsd(i.symbol) ? 1 : i.quoteUsd ?? null;
  if (q === null) problems.push('ارز دوم این نماد دلار نیست و نرخ تبدیلش را نداریم؛ ارزش پیپ و ریسک دلاری تقریبی است.');
  const fx = q ?? 1;
  if (cs === null) problems.push('اندازهٔ قرارداد هر لات معلوم نیست؛ از مشخصات نماد در متاتریدر (Contract size) وارد کنید.');
  // همهٔ مبالغ به دلار: حرکت قیمت × قرارداد به ارز دوم است، × fx
  const pipValuePerLot = cs !== null ? pip * cs * fx : null;
  const costPerLot = pipValuePerLot !== null ? i.spreadPips * pipValuePerLot + i.commissionPerLot : 0;
  const riskPerLot = dist !== null && cs !== null ? dist * cs * fx + costPerLot : null;
  const budget = i.capital ? (i.capital * i.riskPct) / 100 : null;
  let lots = budget !== null && riskPerLot ? floorStep(budget / riskPerLot, step) : null;
  if (lots !== null && lots < minLot) {
    problems.push(`با ریسک ${i.riskPct}٪ حتی حداقل ${minLot} لات هم بیش از سقف است؛ استاپ را نزدیک‌تر کنید یا معامله را نگیرید.`);
    lots = null;
  }
  if (!i.capital) problems.push('سرمایه را وارد کنید تا حجم حساب شود.');
  const riskUsd = lots !== null && riskPerLot !== null ? lots * riskPerLot : null;
  const rewardUsd = lots !== null && tDist !== null && cs !== null ? lots * (tDist * cs * fx - costPerLot) : null;
  const rr = riskUsd && rewardUsd !== null ? rewardUsd / riskUsd : null;
  if (rr !== null && rr < 1.5 && !problems.length) problems.push(`نسبت سود به ریسک پس از هزینه ${rr.toFixed(2)} است؛ زیر ۱٫۵.`);
  const margin = lots !== null && cs !== null && entry !== null && i.leverage ? (lots * cs * entry * fx) / i.leverage : null;
  if (margin !== null && i.capital && margin > i.capital * 0.5) problems.push('مارجین این پوزیشن بیش از نصف سرمایه است.');
  return {
    pip,
    stopPips: dist !== null ? dist / pip : null,
    targetPips: tDist !== null ? tDist / pip : null,
    pipValuePerLot,
    lots,
    units: lots !== null && cs !== null ? lots * cs : null,
    riskUsd,
    riskPct: riskUsd !== null && i.capital ? (riskUsd / i.capital) * 100 : null,
    rewardUsd,
    rr,
    margin,
    problems
  };
}

/* ---------------- پیشنهاد از تاریخچه ---------------- */

export interface EdgeStat { n: number; winRate: number; expectancy: number }

function stat(ts: readonly ClassifiedTrade[]): EdgeStat | null {
  if (!ts.length) return null;
  return { n: ts.length, winRate: ts.filter((t) => t.netPnl > 0).length / ts.length, expectancy: ts.reduce((s, t) => s + t.netPnl, 0) / ts.length };
}

export interface Suggestion {
  stop: number | null;
  target: number | null;
  /** کسر از قیمت (برای نمایش منبع) */
  stopFrac: number | null;
  targetFrac: number | null;
  enough: boolean;
  direction: EdgeStat | null;
  opposite: EdgeStat | null;
  hour: EdgeStat | null;
  notes: string[];
}

export const MIN_EDGE_N = 20;

/** پیشنهاد استاپ/هدف برای این ورود و هشدارهای تاریخچه؛ همه از معاملات بستهٔ جهت‌دار خود کاربر */
export function suggest(p: { symbol: string; direction: Direction; entry: number | null; now: number; tz: string }, ex: SymbolExcursions | undefined, trades: readonly ClassifiedTrade[]): Suggestion {
  const base = baseOf(p.symbol);
  const same = trades.filter((t) => t.book === 'directional' && !t.open && !t.truncated && t.base === base);
  const dir = same.filter((t) => t.direction === p.direction);
  const opp = same.filter((t) => t.direction !== p.direction);
  const h = hourOf(p.now, p.tz);
  const hour = stat(same.filter((t) => hourOf(t.openTime, p.tz) === h));
  const sign = p.direction === 'long' ? 1 : -1;
  const stopFrac = ex?.stop?.level ?? null;
  const targetFrac = ex?.target?.level ?? null;
  const notes: string[] = [];
  const d = stat(dir), o = stat(opp);
  if (d && d.n >= MIN_EDGE_N && d.expectancy < 0) notes.push(`${d.n} معاملهٔ ${p.direction === 'long' ? 'لانگ' : 'شورت'} قبلی شما روی این نماد به‌طور میانگین ضرر داده‌اند.`);
  if (d && o && o.n >= MIN_EDGE_N && o.expectancy > 0 && (d.expectancy < 0 || d.n < MIN_EDGE_N)) notes.push(`جهت مخالف (${p.direction === 'long' ? 'شورت' : 'لانگ'}) در تاریخچهٔ شما روی این نماد سودده بوده است.`);
  if (hour && hour.n >= 10 && hour.expectancy < 0) notes.push(`معامله‌هایی که در همین ساعت روز باز کرده‌اید (${hour.n} معامله) به‌طور میانگین ضرر داده‌اند.`);
  if (!ex) notes.push('برای این نماد هنوز مسیر قیمت اندازه‌گیری‌شده‌ای نیست؛ استاپ و هدف پیشنهادی ندارد.');
  else if (!ex.enough) notes.push(`استاپ و هدف از ${ex.n} معامله آمده‌اند؛ کمتر از ۲۰، پس فرضیه‌اند.`);
  return {
    stop: p.entry !== null && stopFrac !== null ? p.entry * (1 - sign * stopFrac) : null,
    target: p.entry !== null && targetFrac !== null ? p.entry * (1 + sign * targetFrac) : null,
    stopFrac,
    targetFrac,
    enough: !!ex?.enough,
    direction: d,
    opposite: o,
    hour,
    notes
  };
}
