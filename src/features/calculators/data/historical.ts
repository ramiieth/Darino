/**
 * داده تاریخی قیمت (Backend adapter) — برای نمودارها و مقایسه
 *  - رمزارز/Perpetual: CoinGecko market_chart/range (کش IndexedDB ۲۴h)
 *  - سهام/ETF/کالا: Alpha Vantage TIME_SERIES_DAILY (صف محدود + سهمیه)
 *  - توکن‌ایز: داده تاریخی وجود ندارد → null + پیام مناسب در UI
 */
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { cgFetch } from '@/shared/lib/coingeckoGate';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { avQueue } from '@/shared/lib/alphavantage';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { useSettingsStore, effectiveApiKeys } from '@/shared/store/settingsStore';
import { useAvBudgetStore } from '@/shared/store/avBudgetStore';
import { assetsOfClass, type CalculatorAssetClass } from './catalogs';
import { ALPHA_VANTAGE_BASE } from '@/app/config/apiConfig';

export interface PricePoint {
  t: number;
  price: number;
}

const HIST_CACHE_MS = 24 * 60 * 60 * 1000;

/* ---------- CoinGecko (crypto / perp) ---------- */

export async function fetchCryptoHistory(
  coinId: string,
  from: number,
  to: number
): Promise<PricePoint[] | null> {
  const cacheKey = `cghist:${coinId}:${Math.floor(from / 86_400_000)}:${Math.floor(to / 86_400_000)}`;
  try {
    const cached = await cacheBulkGetPrice([cacheKey]);
    const rec = cached.get(cacheKey);
    if (rec && Date.now() - rec.fetchedAt < HIST_CACHE_MS) {
      return (rec.price as unknown as PricePoint[]) ?? null;
    }
  } catch {
    /* ادامه */
  }

  try {
    const url =
      `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/market_chart/range` +
      `?vs_currency=usd&from=${Math.floor(from / 1000)}&to=${Math.floor(to / 1000)}`;
    const res = await cgFetch(url, { timeoutMs: 20_000 });
    if (!res.ok) return null;
    const data = (await res.json()) as { prices?: [number, number][] };
    if (!Array.isArray(data.prices)) return null;
    const points: PricePoint[] = data.prices
      .filter((p) => Array.isArray(p) && p.length >= 2 && typeof p[1] === 'number')
      .map((p) => ({ t: p[0], price: p[1] }));
    if (points.length > 0) {
      await cachePutPrice(cacheKey, {
        price: points as unknown as number,
        source: 'snapshot',
        fetchedAt: Date.now()
      });
    }
    return points;
  } catch {
    return null;
  }
}

/* ---------- Alpha Vantage (stock / etf / commodity) ---------- */

const AV_SERIES_FUNCS: Record<string, string> = {
  WTI: 'WTI',
  BRENT: 'BRENT',
  NG: 'NATURAL_GAS',
  COPPER: 'COPPER',
  CORN: 'CORN',
  WHEAT: 'WHEAT',
  COFFEE: 'COFFEE',
  SUGAR: 'SUGAR'
};

export async function fetchAvDailyHistory(symbol: string): Promise<PricePoint[] | null> {
  const cacheKey = `avhist:${symbol}`;
  try {
    const cached = await cacheBulkGetPrice([cacheKey]);
    const rec = cached.get(cacheKey);
    if (rec && Date.now() - rec.fetchedAt < HIST_CACHE_MS) {
      return (rec.price as unknown as PricePoint[]) ?? null;
    }
  } catch {
    /* ادامه */
  }

  const key = effectiveApiKeys(useSettingsStore.getState().apiKeys).find((k) =>
    useAvBudgetStore.getState().canUse(k)
  );
  if (!key) return null; // سهمیه تمام → پیام در UI

  try {
    const points = await avQueue.enqueue(async () => {
      await useAvBudgetStore.getState().consume(key);
      const func = AV_SERIES_FUNCS[symbol] ?? 'TIME_SERIES_DAILY';
      const url =
        `${ALPHA_VANTAGE_BASE}?function=${func}` +
        (func === 'TIME_SERIES_DAILY'
          ? `&symbol=${encodeURIComponent(symbol)}&outputsize=full`
          : `&interval=daily`) +
        `&apikey=${encodeURIComponent(key)}`;
      const res = await fetchWithRetry(url, { retries: 1 });
      if (!res.ok) return null;
      const json = (await res.json()) as Record<string, unknown>;

      if (json['Information'] || json['Note']) {
        await useAvBudgetStore.getState().exhaust(key);
        return null;
      }

      if (func === 'TIME_SERIES_DAILY') {
        const series = json['Time Series (Daily)'] as
          | Record<string, Record<string, string>>
          | undefined;
        if (!series) return null;
        return Object.entries(series).map(([date, vals]) => ({
          t: new Date(date + 'T00:00:00Z').getTime(),
          price: parseFloat(vals['4. close'])
        }));
      }
      const data = json['data'] as { date: string; value: string }[] | undefined;
      if (!data) return null;
      return data.map((d) => ({ t: new Date(d.date + 'T00:00:00Z').getTime(), price: parseFloat(d.value) }));
    });

    if (points && points.length > 0) {
      await cachePutPrice(cacheKey, {
        price: points as unknown as number,
        source: 'snapshot',
        fetchedAt: Date.now()
      });
    }
    return points;
  } catch {
    return null;
  }
}

/* ---------- یونیفای ---------- */

export async function getHistoricalSeries(
  kind: CalculatorAssetClass,
  symbol: string,
  from: number,
  to: number
): Promise<PricePoint[] | null> {
  if (kind === 'crypto') {
    const asset = assetsOfClass(kind).find((a) => a.symbol === symbol);
    if (!asset?.coinId) return null;
    return fetchCryptoHistory(asset.coinId, from, to);
  }
  if (kind === 'tokenized') {
    return null; // داده تاریخی توکن‌ایز موجود نیست — پیام در UI
  }
  return fetchAvDailyHistory(symbol);
}

/** نقطه شروع بازه‌های زمانی (برای نمودار رشد P&L) */
export const TIMEFRAME_MS: Record<string, number> = {
  today: 1 * 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  quarter: 90 * 86_400_000,
  half: 180 * 86_400_000,
  year: 365 * 86_400_000,
  threeYears: 3 * 365 * 86_400_000,
  fiveYears: 5 * 365 * 86_400_000,
  max: 8 * 365 * 86_400_000
};

export const TIMEFRAME_LABELS: { key: string; label: string }[] = [
  { key: 'today', label: 'امروز' },
  { key: 'week', label: 'یک هفته' },
  { key: 'month', label: 'یک ماه' },
  { key: 'quarter', label: 'سه ماه' },
  { key: 'half', label: 'شش ماه' },
  { key: 'year', label: 'یک سال' },
  { key: 'threeYears', label: 'سه سال' },
  { key: 'fiveYears', label: 'پنج سال' },
  { key: 'max', label: 'حداکثر' }
];
