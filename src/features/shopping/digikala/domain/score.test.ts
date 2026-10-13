import { describe, expect, it } from 'vitest';
import { bayesStars, eligible, rankBestValue } from './score';
import type { DkCard } from './types';

const card = (p: Partial<DkCard> & { id: number }): DkCard => ({
  title: `کالا ${p.id}`,
  brand: null,
  category: null,
  image: null,
  url: `https://www.digikala.com/product/dkp-${p.id}/`,
  priceToman: 1_000_000,
  priceBeforeToman: null,
  discountPercent: 0,
  stars: 4,
  ratingCount: 100,
  inStock: true,
  seller: null,
  sellerStars: null,
  incredible: false,
  ...p
});

describe('digikala best value', () => {
  it('bayesian stars pull thin samples toward the prior', () => {
    expect(bayesStars(5, 2)).toBeLessThan(bayesStars(4.5, 2000));
    expect(bayesStars(null, 0)).toBe(3.5);
  });

  it('drops out-of-stock, unpriced and over-budget items', () => {
    const cards = [
      card({ id: 1, inStock: false }),
      card({ id: 2, priceToman: null }),
      card({ id: 3, priceToman: 3_000_000 }),
      card({ id: 4, priceToman: 900_000 })
    ];
    expect(eligible(cards, 2_000_000).map((c) => c.id)).toEqual([4]);
    expect(rankBestValue(cards, { budget: 2_000_000 }).map((r) => r.card.id)).toEqual([4]);
  });

  it('prefers a well-rated, well-reviewed item over a 5-star item with 2 votes at the same price', () => {
    const ranked = rankBestValue([card({ id: 1, stars: 5, ratingCount: 2 }), card({ id: 2, stars: 4.5, ratingCount: 2000 })]);
    expect(ranked[0].card.id).toBe(2);
    expect(ranked[0].reasons).toContain('تعداد رأی زیاد');
  });

  it('cheaper wins when quality is equal', () => {
    const ranked = rankBestValue([card({ id: 1, priceToman: 2_000_000 }), card({ id: 2, priceToman: 1_000_000 })]);
    expect(ranked.map((r) => r.card.id)).toEqual([2, 1]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('returns nothing when no candidate fits the budget', () => {
    expect(rankBestValue([card({ id: 1, priceToman: 5_000_000 })], { budget: 1_000_000 })).toEqual([]);
  });
});
