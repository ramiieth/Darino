/** ============================================================
 * Markets Pipeline — تست‌های واحد
 *
 * پوشش Acceptance Criteria:
 *  - Normalize → DTO مینیمال (فقط فیلدهای UI)
 *  - Tokenized: فقط Market Cap معتبر (بخش ۸/۹)
 *  - هر Symbol مستقل (بدون Merge/Grouping)
 *  - Dedup: چند مصرف‌کننده هم‌زمان → یک Fetch (بخش ۱۹)
 *  - Cache مرکزی (TTL + حفظ داده قدیمی)
 *  - Metric ناقص → null (نمایش «—») نه حذف کل Token (بخش ۲۹)
 *  - Accounting دست‌نخورده (بخش ۳۰/۳۱)
 * ============================================================ */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// دروازه نرخ سراسری mock (بدون درخواست واقعی)
vi.mock('@/shared/lib/coingeckoGate', () => ({
  cgFetch: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    constructor(m = '429') {
      super(m);
      this.name = 'RateLimitError';
    }
  }
}));

import { normalizeRow, isValidTokenized } from './normalize';
import { assetId, type MarketAsset, type MarketSource } from './types';
import { cacheGetUniverse, cacheGetUniverseStale, cachePutUniverse, UNIVERSE_TTL_MS } from './cache';
import { syncUniverse, useMarketsStore, refreshAllMarkets } from './store';
import { cacheClearPrices, cachePutPrice } from '@/shared/lib/db';

// پاک‌سازی کامل بین تست‌ها (استور + کش مرکزی)
beforeEach(async () => {
  useMarketsStore.setState({
    data: { crypto_top_200: [], ondo_tokenized: [], xstocks: [] },
    loading: { crypto_top_200: false, ondo_tokenized: false, xstocks: false },
    lastSyncAt: { crypto_top_200: null, ondo_tokenized: null, xstocks: null },
    error: { crypto_top_200: null, ondo_tokenized: null, xstocks: null }
  });
  await cacheClearPrices();
});

describe('Normalize — DTO مینیمال', () => {
  const raw = {
    id: 'apple-ondo-tokenized-stock',
    symbol: 'aaplon',
    name: 'Apple (Ondo Tokenized Stock)',
    image: 'https://coin-images.coingecko.com/coins/images/1/large/x.png',
    current_price: 111.44,
    market_cap: 500_000_000,
    market_cap_rank: 123,
    fully_diluted_valuation: 900_000_000,
    total_volume: 2_000_000,
    high_24h: 112,
    low_24h: 110,
    price_change_percentage_24h: 1.2,
    price_change_percentage_7d_in_currency: 3.4,
    price_change_percentage_30d_in_currency: -2.1,
    circulating_supply: 4_000_000,
    ath: 200,
    atl: 50,
    last_updated: '2026-08-12'
  };

  it('فقط فیلدهای UI در DTO می‌مانند (نه کل Response)', () => {
    const a = normalizeRow(raw, 'ondo', 1);
    const keys = Object.keys(a).sort();
    expect(keys).toEqual(['change24h', 'change30d', 'change7d', 'id', 'image', 'marketCap', 'price', 'rank', 'source', 'symbol']);
    expect(a.symbol).toBe('AAPLON');
    expect(a.price).toBe(111.44);
    expect(a.marketCap).toBe(500_000_000);
    expect(a.change24h).toBe(1.2);
    expect(a.change7d).toBe(3.4);
    expect(a.change30d).toBe(-2.1);
    // فیلدهای سنگین Response حذف شده‌اند
    expect(a).not.toHaveProperty('fullyDilutedValuation');
    expect(a).not.toHaveProperty('totalVolume');
    expect(a).not.toHaveProperty('ath');
  });

  it('id پایدار: source + symbol (بخش ۱۷/۱۸)', () => {
    expect(assetId('ondo', 'AAPLON')).toBe('ondo:AAPLON');
    expect(assetId('xstocks', 'AAPLX')).toBe('xstocks:AAPLX');
  });

  it('Metric ناقص → null (نه حذف Token — بخش ۲۹)', () => {
    const a = normalizeRow({ ...raw, price_change_percentage_7d_in_currency: null, current_price: null }, 'ondo', 1);
    expect(a.change7d).toBeNull();
    expect(a.price).toBeNull();
    expect(a.symbol).toBe('AAPLON'); // Token حذف نمی‌شود
  });
});

describe('Validation — فقط Market Cap معتبر (بخش ۸/۹)', () => {
  const mk = (mcap: number | null): MarketAsset =>
    normalizeRow({ id: 'x', symbol: 'T', current_price: 1, market_cap: mcap }, 'ondo', 1);

  it('MCap معتبر → نمایش', () => {
    expect(isValidTokenized(mk(500))).toBe(true);
  });
  it('MCap null → حذف از نمایش', () => {
    expect(isValidTokenized(mk(null))).toBe(false);
  });
  it('MCap صفر → حذف از نمایش', () => {
    expect(isValidTokenized(mk(0))).toBe(false);
  });
  it('MCap منفی → حذف از نمایش', () => {
    expect(isValidTokenized(mk(-5))).toBe(false);
  });
});

describe('استقلال هر Symbol (بخش ۱۱/۱۵/۱۶)', () => {
  it('AAPLON و AAPLX دو Asset مستقل‌اند — بدون Merge', () => {
    const ondo = normalizeRow({ id: 'a1', symbol: 'aaplon', current_price: 111, market_cap: 500_000_000, price_change_percentage_24h: 1.0 }, 'ondo', 1);
    const x = normalizeRow({ id: 'a2', symbol: 'aaplx', current_price: 110, market_cap: 720_000_000, price_change_percentage_24h: -0.5 }, 'xstocks', 1);
    expect(ondo.id).not.toBe(x.id);
    expect(ondo.marketCap).toBe(500_000_000); // جمع/میانگین نشده
    expect(x.marketCap).toBe(720_000_000);
    expect(ondo.change24h).toBe(1.0); // 24H مخصوص خودش
    expect(x.change24h).toBe(-0.5);
  });

  it('هیچ فیلد Underlying/Company در DTO نیست (بخش ۱۲)', () => {
    const a = normalizeRow({ id: 'x', symbol: 'aaplx', name: 'Apple xStock' }, 'xstocks', 1);
    const keys = Object.keys(a).join(',');
    expect(keys).not.toMatch(/underlying|company|asset/i);
  });
});

describe('Cache مرکزی (بخش ۱۸)', () => {
  it('TTL: داده تازه از کش می‌آید', async () => {
    const assets: MarketAsset[] = [normalizeRow({ id: 'x', symbol: 'T', current_price: 1 }, 'crypto', 1)];
    await cachePutUniverse('crypto_top_200', assets);
    const got = await cacheGetUniverse('crypto_top_200');
    expect(got).not.toBeNull();
    expect(got![0].symbol).toBe('T');
    expect(UNIVERSE_TTL_MS.crypto_top_200).toBeLessThanOrEqual(120_000);
    expect(UNIVERSE_TTL_MS.ondo_tokenized).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('TTL منقضی → کش تازه null ولی داده قبلی همچنان در دسترس (بخش ۲۹)', async () => {
    const assets: MarketAsset[] = [normalizeRow({ id: 'x', symbol: 'T', current_price: 1, market_cap: 1000 }, 'ondo', 1)];
    // شبیه‌سازی کش قدیمی: fetchedAt = 0 (خیلی کهنه‌تر از TTL)
    await cachePutPrice('markets:v2:ondo_tokenized', { price: assets as unknown as number, source: 'live', fetchedAt: 0 });

    expect(await cacheGetUniverse('ondo_tokenized')).toBeNull();
    const stale = await cacheGetUniverseStale('ondo_tokenized');
    expect(stale).not.toBeNull();
    expect(stale![0].symbol).toBe('T');
  });

  it('استور هرگز از داده قبلی خالی نمی‌شود (setCached، بدون جعل زمان همگام‌سازی)', async () => {
    const assets: MarketAsset[] = [normalizeRow({ id: 'x', symbol: 'T', current_price: 1, market_cap: 1000 }, 'xstocks', 1)];
    await cachePutPrice('markets:v2:xstocks', { price: assets as unknown as number, source: 'live', fetchedAt: 0 });
    const st0 = useMarketsStore.getState();
    st0.setCached('xstocks', assets, null);
    const st1 = useMarketsStore.getState();
    expect(st1.data.xstocks).toHaveLength(1);
    expect(st1.lastSyncAt.xstocks).toBeNull(); // lastSyncAt دست‌نخورده می‌ماند
  });
});

describe('Sync — dedup و شکست‌ایمن (بخش ۱۹/۲۹)', () => {
  it('dedup: دو فراخوانی هم‌زمان → یک fetch', async () => {
    let fetchCount = 0;
    const spy = vi.spyOn(await import('./fetch'), 'fetchUniverseAssets').mockImplementation(async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 20));
      return [normalizeRow({ id: 'x', symbol: 'T', current_price: 1, market_cap: 1000 }, 'crypto', 1)];
    });

    await Promise.all([syncUniverse('ondo_tokenized'), syncUniverse('ondo_tokenized')]);
    expect(fetchCount).toBe(1); // فقط یک fetch
    const st = useMarketsStore.getState();
    expect(st.data.ondo_tokenized).toHaveLength(1);
    spy.mockRestore();
  });

  it('شکست fetch → داده قبلی حفظ می‌شود (نه خالی/جعلی)', async () => {
    // اول داده بریز
    const spy = vi.spyOn(await import('./fetch'), 'fetchUniverseAssets').mockResolvedValueOnce([
      normalizeRow({ id: 'x', symbol: 'T', current_price: 1, market_cap: 1000 }, 'xstocks', 1)
    ]);
    await syncUniverse('xstocks');
    spy.mockRestore();

    // بعد شکست
    // کش را منقضی کن تا fetch دوم واقعاً اجرا شود
    await cacheClearPrices();
    const spy2 = vi.spyOn(await import('./fetch'), 'fetchUniverseAssets').mockRejectedValueOnce(new Error('network down'));
    await syncUniverse('xstocks');
    spy2.mockRestore();

    const st = useMarketsStore.getState();
    expect(st.data.xstocks).toHaveLength(1); // حفظ شده
    expect(st.error.xstocks).toContain('network down');
  });

  it('refreshAllMarkets — همه Universeها یک‌جا (بخش ۲۵)', async () => {
    const spy = vi.spyOn(await import('./fetch'), 'fetchUniverseAssets').mockResolvedValue([]);
    refreshAllMarkets();
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('با کش کهنه + شکست شبکه → داده قبلی نمایش داده می‌شود (نه «داده ناکافی»)', async () => {
    const assets: MarketAsset[] = [normalizeRow({ id: 'x', symbol: 'T', current_price: 1, market_cap: 1000 }, 'crypto', 1)];
    await cachePutPrice('markets:v2:crypto_top_200', { price: assets as unknown as number, source: 'live', fetchedAt: 0 });

    const spy = vi.spyOn(await import('./fetch'), 'fetchUniverseAssets').mockRejectedValueOnce(new Error('offline/429'));
    await syncUniverse('crypto_top_200');
    spy.mockRestore();

    const st = useMarketsStore.getState();
    expect(st.data.crypto_top_200).toHaveLength(1); // حفظ داده واقعی قبلی
    expect(st.error.crypto_top_200).toContain('offline/429');
  });
});

describe('Accounting کاملاً جدا (بخش ۳۰/۳۱)', () => {
  it('هیچ فایل Pipeline به ماژول‌های حسابداری وابسته نیست', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const f of files) {
      const src = readFileSync(resolve(here, f), 'utf8');
      expect(src).not.toMatch(/journal|postings|accEntries|accLots|accAccounts|fifo/i);
    }
  });

  it('DTO فقط Reference Market Data است — هیچ فیلد Transaction/Entry ندارد', () => {
    const a = normalizeRow({ id: 'x', symbol: 'T', current_price: 1 }, 'crypto', 1);
    const keys = Object.keys(a).join(',');
    expect(keys).not.toMatch(/cost|entry|lot|posting|tx/i);
  });
});
