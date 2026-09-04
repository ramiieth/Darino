/** ============================================================
 * Market Classification — طبقه‌بندی و جستجوی Instrumentها
 *
 *  - تبدیل دارایی‌های موجود اپ (crypto/tokenized/tradfi) به MarketInstrument
 *  - دسته‌بندی دقیق TradFi: سهام/ETF/شاخص/کامودیتی/اوراق
 *  - جستجو روی name/symbol/provider/underlying
 *  - مرتب‌سازی: Popularity → relevance → alphabetical (بدون رتبه‌بندی جدید)
 * ============================================================ */
import type { MarketCategory, MarketDataSource, MarketInstrument as Instrument } from './types';

/** دسته‌بندی یک دارایی سنتی از روی نوع فعلی اپ (tradfiKind) */
export function classifyTradFi(
  symbol: string,
  tradfiKind: string | undefined,
  source: MarketDataSource = 'alpha-vantage'
): { category: MarketCategory; type: Instrument['type'] } {
  switch (tradfiKind) {
    case 'etf': return { category: 'etf', type: 'ETF' };
    case 'index': return { category: 'index', type: 'INDEX' };
    case 'commodity': return { category: 'commodity', type: 'COMMODITY' };
    case 'bond': return { category: 'bond', type: 'BOND' };
    case 'stock':
    default:
      return { category: 'us-stock', type: 'US_EQUITY' };
  }
}

/** تبدیل Instrument موجود اپ به MarketInstrument */
export function toMarketInstrument(input: {
  symbol: string;
  nameFa: string;
  kind: 'crypto' | 'tokenized' | 'tradfi';
  tradfiKind?: string;
  liveKey: string;
  sourceId?: string;
}): Instrument {
  if (input.kind === 'crypto') {
    return {
      instrumentId: `cg:${input.liveKey}`,
      symbol: input.symbol,
      nameFa: input.nameFa,
      type: 'CRYPTO',
      category: 'crypto',
      source: 'coingecko',
      sourceId: input.sourceId ?? input.liveKey,
      liveKey: input.liveKey,
      status: 'Trading',
      lastSyncedAt: Date.now()
    };
  }
  if (input.kind === 'tokenized') {
    return {
      instrumentId: `tk:${input.symbol}`,
      symbol: input.symbol,
      nameFa: input.nameFa,
      type: 'TOKENIZED_STOCK',
      category: 'tokenized',
      source: 'coingecko',
      sourceId: input.sourceId ?? input.symbol,
      liveKey: input.liveKey,
      status: 'Trading',
      lastSyncedAt: Date.now()
    };
  }
  const { category, type } = classifyTradFi(input.symbol, input.tradfiKind);
  return {
    instrumentId: `av:${input.symbol}`,
    symbol: input.symbol,
    nameFa: input.nameFa,
    type,
    category,
    source: 'alpha-vantage',
    sourceId: input.sourceId ?? input.symbol,
    liveKey: input.liveKey,
    status: 'Trading',
    lastSyncedAt: Date.now()
  };
}

/* ---------------- جستجو ---------------- */

export interface SearchQuery {
  text: string;
  category?: MarketCategory | 'all';
  group?: 'crypto' | 'tokenized' | 'tradfi' | 'all';
}

/**
 * جستجو روی: name / symbol / underlying_name / underlying_symbol / provider
 * نرمال‌سازی: حروف بزرگ/کوچک + نیم‌فاصله
 */
export function searchInstruments(instruments: Instrument[], q: SearchQuery): Instrument[] {
  const text = q.text.trim().toLowerCase();
  const out = instruments.filter((inst) => {
    if (q.category && q.category !== 'all' && inst.category !== q.category) return false;
    if (q.group && q.group !== 'all') {
      const g = inst.category === 'crypto' ? 'crypto' : inst.category === 'tokenized' ? 'tokenized' : 'tradfi';
      if (g !== q.group) return false;
    }
    if (!text) return true;
    const name = inst.nameFa.toLowerCase();
    const sym = inst.symbol.toLowerCase();
    const provider = inst.source.toLowerCase();
    return name.includes(text) || sym.includes(text) || provider.includes(text);
  });
  return out;
}

/** مرتب‌سازی: دسته → الفبا (Popularity از ترتیب ورودی می‌آید) */
export function sortInstruments(
  instruments: Instrument[],
  order: 'popularity' | 'alpha' = 'popularity'
): Instrument[] {
  const arr = [...instruments];
  if (order === 'alpha') {
    return arr.sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa') || a.symbol.localeCompare(b.symbol));
  }
  return arr;
}
