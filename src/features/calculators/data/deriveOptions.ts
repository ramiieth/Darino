/**
 * بازارهای آپشن Derive (derive.xyz) — از پروکسی فقط‌خواندنی سرور (/api/integrations?op=derive-*)
 * مرورگر نمی‌تواند Derive را مستقیم بخواند (CORS برای دامنهٔ ما باز نیست).
 * بازارهای افزوده‌شدهٔ دستی (نام و لوگوی دلخواه) فقط در همین مرورگر ذخیره می‌شوند و فقط اگر در Derive آپشن داشته باشند نمایش داده می‌شوند.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { jsonGet, jsonSet } from '@/shared/lib/storage';
import type { ChainOption } from '@/features/calculators/domain';

export interface DeriveMarket {
  currency: string;
  spot: number | null;
  spot24h: number | null;
  optionOi: number;
}

export interface DeriveChain {
  currency: string;
  expiry: string;
  expiries: string[];
  minAmount: number | null;
  amountStep: number | null;
  makerFeeRate: number | null;
  takerFeeRate: number | null;
  baseFee: number | null;
  feeCapRate: number | null;
  options: ChainOption[];
  index: number | null;
  forward: number | null;
  perp: { mark: number | null; index: number | null; fundingHourly: number | null };
  fetchedAt: number;
}

export function useDeriveMarkets() {
  return useQuery({
    queryKey: ['derive-markets'],
    queryFn: () => fetchJson<{ markets: DeriveMarket[] }>('/api/integrations?op=derive-markets', { timeoutMs: 20_000 }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1
  });
}

const chainQuery = (currency: string, expiry: string | null) => ({
  queryKey: ['derive-chain', currency, expiry ?? ''],
  queryFn: () => fetchJson<DeriveChain>(`/api/integrations?op=derive-chain&currency=${encodeURIComponent(currency)}${expiry ? `&expiry=${expiry}` : ''}`, { timeoutMs: 25_000 }),
  enabled: currency !== '',
  staleTime: 15_000,
  refetchInterval: 30_000,
  retry: 1
});

export function useDeriveChain(currency: string, expiry: string | null) {
  return useQuery(chainQuery(currency, expiry));
}

/** چند سررسید برای ساختار زمانی IV (Term Structure) */
export function useDeriveChains(currency: string, expiries: readonly string[]) {
  return useQueries({ queries: expiries.map((e) => chainQuery(currency, e)) });
}

const historyQuery = (currency: string) => ({
  queryKey: ['derive-history', currency],
  queryFn: () => fetchJson<{ currency: string; candles: { t: number; close: number }[] }>(`/api/integrations?op=derive-history&currency=${encodeURIComponent(currency)}`, { timeoutMs: 20_000 }),
  enabled: currency !== '',
  staleTime: 30 * 60_000,
  retry: 1
});

export function useDeriveHistory(currency: string) {
  return useQuery(historyQuery(currency));
}

/* ---------------- بازارهای افزوده‌شدهٔ دستی ---------------- */

export interface CustomMarket {
  symbol: string;
  name: string;
  /** https URL یا data:image (حداکثر ~۱۵۰ کیلوبایت) */
  logo: string | null;
}

const CUSTOM_KEY = 'calc:options:custom:v1';
const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;

export const loadCustomMarkets = (): CustomMarket[] =>
  jsonGet<CustomMarket[]>(CUSTOM_KEY, []).filter((m) => m && SYMBOL_RE.test(m.symbol) && typeof m.name === 'string');

export function saveCustomMarket(list: readonly CustomMarket[], m: CustomMarket): CustomMarket[] {
  const next = [...list.filter((x) => x.symbol !== m.symbol), m];
  jsonSet(CUSTOM_KEY, next);
  return next;
}

export function removeCustomMarket(list: readonly CustomMarket[], symbol: string): CustomMarket[] {
  const next = list.filter((x) => x.symbol !== symbol);
  jsonSet(CUSTOM_KEY, next);
  return next;
}

/** اعتبارسنجی فرم افزودن؛ null = معتبر */
export function validateCustomMarket(m: CustomMarket, derive: readonly DeriveMarket[]): string | null {
  if (!SYMBOL_RE.test(m.symbol)) return 'نماد را با حروف لاتین بزرگ و عدد وارد کنید (مثلاً ETH).';
  if (!derive.some((d) => d.currency === m.symbol)) return 'این دارایی در Derive آپشن ندارد.';
  if (m.logo && !/^https:\/\/[^\s]{4,500}$/.test(m.logo) && !/^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(m.logo)) return 'لوگو باید آدرس https یا یک تصویر کوچک باشد.';
  if (m.logo && m.logo.length > 200_000) return 'تصویر لوگو بزرگ است (حداکثر حدود ۱۵۰ کیلوبایت).';
  return null;
}

/* ---------------- ترکیب چندبازاری ---------------- */

/** زنجیرهٔ سررسید ۱۴ تا ۴۵ روزه (نزدیک ۳۰) و تاریخچهٔ قیمت هر بازار، به‌اضافهٔ BTC برای Beta */
export function useComboData(currencies: readonly string[], enabled: boolean) {
  const list = enabled ? currencies : [];
  const chains = useQueries({ queries: list.map((c) => chainQuery(c, 'auto')) });
  const histories = useQueries({ queries: [...new Set(['BTC', ...list])].filter(() => enabled).map(historyQuery) });
  return { chains, histories };
}
