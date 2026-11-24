import { describe, expect, it } from 'vitest';
import {
  IRAN_MARKET_CATALOG,
  IRAN_MARKET_SEGMENTS,
  filterIranMarketInstruments
} from './iranMarketCatalog';

describe('iranMarketCatalog', () => {
  it('includes all 5 Iranian market segments including TSE, IFB, IME, ETF funds, and Pension/Atiyeh funds', () => {
    expect(IRAN_MARKET_SEGMENTS.map((s) => s.id)).toEqual(['tse', 'ifb', 'ime', 'funds', 'pension']);
    for (const seg of IRAN_MARKET_SEGMENTS) {
      const items = filterIranMarketInstruments({ items: IRAN_MARKET_CATALOG, segment: seg.id });
      expect(items.length).toBeGreaterThan(0);
    }
  });

  it('includes Mofid Atiyeh and other supplementary retirement funds under pension segment', () => {
    const pension = filterIranMarketInstruments({ items: IRAN_MARKET_CATALOG, segment: 'pension' });
    expect(pension.some((p) => p.symbol.includes('آتیه مفید'))).toBe(true);
    expect(pension.some((p) => p.symbol.includes('اندوخته آگاه'))).toBe(true);
    expect(pension.some((p) => p.symbol.includes('کاریز'))).toBe(true);
  });

  it('filters accurately by Persian/Arabic normalized search and fund subtype', () => {
    const byQuery = filterIranMarketInstruments({
      items: IRAN_MARKET_CATALOG,
      segment: 'all',
      query: 'آتيه مفيد' // با حروف عربی ي
    });
    expect(byQuery).toHaveLength(1);
    expect(byQuery[0].id).toBe('pension-atieh-mofid');

    const leveraged = filterIranMarketInstruments({
      items: IRAN_MARKET_CATALOG,
      segment: 'funds',
      fundSubtype: 'leveraged'
    });
    expect(leveraged.length).toBeGreaterThanOrEqual(3);
    expect(leveraged.every((f) => f.fundSubtype === 'leveraged')).toBe(true);
  });
});
