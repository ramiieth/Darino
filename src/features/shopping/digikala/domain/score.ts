/** ============================================================
 * «بهترین خرید» — رتبه‌بندی شفاف و قابل‌توضیح نتایج دیجی‌کالا
 *
 *  امتیاز = ۴۵٪ کیفیت (میانگین بیزی امتیاز خریداران)
 *         + ۱۵٪ اعتبار (تعداد رأی، لگاریتمی)
 *         + ۲۵٪ قیمت (نسبت به ارزان‌ترین/گران‌ترین نامزد)
 *         + ۷٪ تخفیف + ۸٪ اعتبار فروشنده
 *  میانگین بیزی نمی‌گذارد «۵ ستاره با ۲ رأی» از «۴.۵ با ۲۰۰۰ رأی» جلو بزند.
 * ============================================================ */
import type { DkCard } from './types.js';

const PRIOR_STARS = 3.5;
const PRIOR_WEIGHT = 20;
const W = { quality: 0.45, trust: 0.15, price: 0.25, discount: 0.07, seller: 0.08 };

export interface RankedCard {
  card: DkCard;
  /** ۰ تا ۱۰۰ */
  score: number;
  reasons: string[];
}

export function bayesStars(stars: number | null, count: number): number {
  const n = stars == null ? 0 : Math.max(0, count);
  return (PRIOR_STARS * PRIOR_WEIGHT + (stars ?? 0) * n) / (PRIOR_WEIGHT + n);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** کاندیدهای قابل خرید در بودجه (budget به تومان؛ null یعنی بدون سقف) */
export function eligible(cards: DkCard[], budget: number | null, minBudget: number | null = null): DkCard[] {
  return cards.filter(
    (c) =>
      c.inStock &&
      c.priceToman != null &&
      c.priceToman > 0 &&
      (budget == null || c.priceToman <= budget) &&
      (minBudget == null || c.priceToman >= minBudget)
  );
}

export function rankBestValue(
  cards: DkCard[],
  opts: { budget?: number | null; minBudget?: number | null; limit?: number } = {}
): RankedCard[] {
  const pool = eligible(cards, opts.budget ?? null, opts.minBudget ?? null);
  if (!pool.length) return [];
  const prices = pool.map((c) => c.priceToman as number);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const ranked = pool.map((card) => {
    const price = card.priceToman as number;
    const bayes = bayesStars(card.stars, card.ratingCount);
    const quality = clamp01((bayes - 1) / 4);
    const trust = clamp01(Math.log10(card.ratingCount + 1) / Math.log10(5001));
    const priceScore = hi === lo ? 1 : 1 - (price - lo) / (hi - lo);
    const discount = clamp01(card.discountPercent / 50);
    const seller = card.sellerStars == null ? 0.5 : clamp01(card.sellerStars / 5);
    const score =
      W.quality * quality + W.trust * trust + W.price * priceScore + W.discount * discount + W.seller * seller;

    const reasons: string[] = [];
    if (card.stars != null && card.ratingCount >= 30 && card.stars >= 4) reasons.push('رضایت بالای خریداران');
    if (card.ratingCount >= 500) reasons.push('تعداد رأی زیاد');
    if (pool.length > 2 && price < median) reasons.push('ارزان‌تر از میانهٔ نتایج');
    if (card.discountPercent >= 10) reasons.push(`${card.discountPercent}٪ تخفیف`);
    if (card.incredible) reasons.push('شگفت‌انگیز');
    if (card.sellerStars != null && card.sellerStars >= 4.2) reasons.push('فروشنده خوش‌سابقه');
    if (card.stars != null && card.ratingCount < 10) reasons.push('نمونهٔ نظرات کم است');
    return { card, score: Math.round(score * 1000) / 10, reasons };
  });

  ranked.sort((a, b) => b.score - a.score || (a.card.priceToman ?? 0) - (b.card.priceToman ?? 0));
  return ranked.slice(0, opts.limit ?? 3);
}
