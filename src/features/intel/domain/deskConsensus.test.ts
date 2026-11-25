import { describe, expect, it } from 'vitest';
import { reconcileDeskSignals, resolveUnifiedDeskPrice } from './deskConsensus';

describe('Unified Desk Price Integrity & Signal Consensus', () => {
  it('prefers live CoinGecko market price over reference fallback perp price (prevents stale 2820 vs live 1645 bug)', () => {
    const resolved = resolveUnifiedDeskPrice({
      livePerpPrice: 2820,
      livePerpIsReference: true,
      livePerpChange24h: 1.8,
      topMarketPrice: 1645,
      topMarketIsSnapshot: false,
      topMarketChange24h: -3.44,
      curatedRefPrice: 2820,
      curatedRefChange24h: 1.8
    });

    expect(resolved.price).toBe(1645);
    expect(resolved.isLive).toBe(true);
    expect(resolved.change24h).toBe(-3.44);
  });

  it('prefers real live Hyperliquid perp price when not reference', () => {
    const resolved = resolveUnifiedDeskPrice({
      livePerpPrice: 1652,
      livePerpIsReference: false,
      livePerpChange24h: -2.1,
      topMarketPrice: 1645,
      topMarketIsSnapshot: false,
      topMarketChange24h: -3.44
    });

    expect(resolved.price).toBe(1652);
    expect(resolved.isLive).toBe(true);
  });

  it('explicitly flags reference fallback price as non-live when no live source is available', () => {
    const resolved = resolveUnifiedDeskPrice({
      livePerpPrice: 2820,
      livePerpIsReference: true,
      topMarketPrice: null,
      curatedRefPrice: 2820
    });

    expect(resolved.price).toBe(2820);
    expect(resolved.isLive).toBe(false);
    expect(resolved.sourceLabelFa).toContain('مرجع');
  });

  it('reconciles short-term Underweight committee vs medium-term accumulate swing into explicit timeframe_conflict warning', () => {
    const consensus = reconcileDeskSignals({
      committeeRating: 'Underweight',
      swingVerdict: 'accumulate',
      swingScore: 80,
      regimeState: 'off'
    });

    expect(consensus.alignment).toBe('timeframe_conflict');
    expect(consensus.committeeDirection).toBe('short');
    expect(consensus.swingDirection).toBe('long');
    expect(consensus.tone).toBe('warn');
    expect(consensus.badgeFa).toContain('تضاد تایم‌فریم');
  });

  it('reports aligned_long when both committee and swing agree on bullish setup', () => {
    const consensus = reconcileDeskSignals({
      committeeRating: 'Buy',
      swingVerdict: 'entry',
      swingScore: 84,
      regimeState: 'on'
    });

    expect(consensus.alignment).toBe('aligned_long');
    expect(consensus.tone).toBe('gain');
  });
});
