/**
 * «امتیاز ثبات» یک تریدر (۰ تا ۱۰۰) — جواب یک سؤال: آیا ارزش دنبال کردن دارد؟
 *
 * سود دلاری کل فقط اندازهٔ حساب را نشان می‌دهد، نه مهارت؛ پس امتیاز از چیزهایی ساخته می‌شود
 * که شانس یک ماه خوب آن‌ها را نمی‌سازد:
 *   ۴۰  ثبات: سهم ماه‌های سودده
 *   ۳۰  کنترل ریسک: ۱۰۰ منهای حداکثر افت ۱۲ ماه
 *   ۱۵  طول سابقه: تا ۱۲ ماه
 *   ۱۵  کیفیت معاملات: Profit Factor تا ۳ (بدون نمونهٔ کافی، نیمه)
 * مارکت‌میکر یا کمتر از ۳ ماه سابقه امتیاز نمی‌گیرد. Pure.
 */
import type { TraderSummary } from './summary.js';
import type { TraderPosition } from './positions.js';

/** حداقل معاملهٔ کامل برای استفاده از نرخ برد و Profit Factor */
export const MIN_TRADES = 10;
export const MIN_SCORE_MONTHS = 3;
/** «شایستهٔ دنبال کردن» */
export const GOOD_SCORE = 65;

type ScoreInput = Pick<TraderSummary, 'months' | 'positiveMonths' | 'maxDrawdownPct' | 'makerLike' | 'closedCount' | 'profitFactor' | 'allWins'>;

export function qualityScore(s: ScoreInput | null | undefined): number | null {
  if (!s || s.makerLike || s.months < MIN_SCORE_MONTHS) return null;
  const consistency = s.positiveMonths / s.months;
  const risk = 1 - Math.min(s.maxDrawdownPct ?? 100, 100) / 100;
  const history = Math.min(s.months, 12) / 12;
  const trades = s.closedCount >= MIN_TRADES ? (s.allWins ? 1 : Math.min(s.profitFactor ?? 0, 3) / 3) : 0.5;
  return Math.round(40 * consistency + 30 * risk + 15 * history + 15 * trades);
}

export type ScoreTone = 'gain' | 'warn' | 'loss' | 'neutral';
export function scoreTone(score: number | null): ScoreTone {
  if (score === null) return 'neutral';
  return score >= GOOD_SCORE ? 'gain' : score >= 45 ? 'warn' : 'loss';
}

/** پوزیشن‌های باز یک آدرس به ترتیب اندازه، با سهم لانگ از کل */
export interface Book {
  positions: TraderPosition[];
  totalUsd: number;
  longUsd: number;
}

export function bookOf(address: string, positions: TraderPosition[]): Book {
  const mine = positions.filter((p) => p.address === address).sort((a, b) => b.sizeUsd - a.sizeUsd);
  return {
    positions: mine,
    totalUsd: mine.reduce((a, p) => a + p.sizeUsd, 0),
    longUsd: mine.filter((p) => p.side === 'long').reduce((a, p) => a + p.sizeUsd, 0)
  };
}

/** نمایهٔ پوزیشن‌ها به تفکیک آدرس (یک بار برای کل فهرست) */
export function booksByAddress(positions: TraderPosition[]): Map<string, Book> {
  const addresses = new Set(positions.map((p) => p.address));
  return new Map([...addresses].map((a) => [a, bookOf(a, positions)]));
}
