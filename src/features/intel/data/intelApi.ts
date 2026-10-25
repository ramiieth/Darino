/**
 * دادهٔ هاب اطلاعات
 *  - امنیت توکن، میم‌کوین‌ها و غربال «محافظ سرمایه»: /api/intel (سرور منابع را ترکیب و کش می‌کند)
 *  - بازار مشتقات: مستقیم از API رسمی هایپرلیکوئید روی IP کاربر، از همان صف وزنی تریدرها
 */
import { useQuery } from '@tanstack/react-query';
import { hlCandles, hlFundingHistory, hlMetaAndCtxs } from '@/features/hyperliquid/data/hyperliquidService';
import { weighted } from '@/features/traders/data/tradersApi';
import { fundingStats, type FundingPoint } from '../domain/funding';
import { parseCandles, type Candle } from '../domain/survival';
import type { MemeScreenPayload } from '../domain/memeScreen';
import type { Chain, TokenSafety } from '../domain/tokenSafety';
import type { MemeToken } from '../domain/memes';

export type MemeRow = MemeToken & { safety: { verdict: TokenSafety['verdict']; dangers: number; warns: number } };
export interface MemesPayload { fetchedAt: number; list: 'trending' | 'new'; tokens: MemeRow[] }

async function getPublic<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? fallback);
  return body;
}

export function useTokenSafety(chain: Chain, address: string | null) {
  return useQuery({
    queryKey: ['intel', 'token', chain, address],
    queryFn: () => getPublic<TokenSafety>(`/api/intel?op=token&chain=${chain}&address=${encodeURIComponent(address!)}`, 'بررسی امنیت انجام نشد'),
    enabled: !!address,
    staleTime: 10 * 60_000,
    retry: 1
  });
}

export function useMemes(list: 'trending' | 'new') {
  return useQuery({
    queryKey: ['intel', 'memes', list],
    queryFn: () => getPublic<MemesPayload>(`/api/intel?op=memes&list=${list}`, 'فهرست میم‌کوین‌ها دریافت نشد'),
    staleTime: 2 * 60_000,
    refetchInterval: 3 * 60_000
  });
}

export interface PerpMarket {
  coin: string;
  markPx: number;
  fundingHourly: number;
  openInterestUsd: number;
  volume24h: number;
  change24h: number | null;
  premium: number | null;
  maxLeverage: number;
}

const num = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** همهٔ بازارهای پرپ اصلی هایپرلیکوئید (یک درخواست، کش ۶۰ ثانیه) */
export function usePerpMarkets() {
  return useQuery({
    queryKey: ['intel', 'perp-markets'],
    queryFn: async (): Promise<PerpMarket[]> => {
      const [meta, ctxs] = await weighted(20, () => hlMetaAndCtxs(), 0);
      return meta.universe
        .map((u, i) => {
          const c = ctxs[i];
          const mark = num(c?.markPx);
          const prev = num(c?.prevDayPx);
          if (!c || !mark) return null;
          return {
            coin: u.name,
            markPx: mark,
            fundingHourly: num(c.funding) ?? 0,
            openInterestUsd: (num(c.openInterest) ?? 0) * mark,
            volume24h: num(c.dayNtlVlm) ?? 0,
            change24h: prev ? ((mark - prev) / prev) * 100 : null,
            premium: num(c.premium),
            maxLeverage: u.maxLeverage
          };
        })
        .filter((m): m is PerpMarket => !!m && m.openInterestUsd > 0)
        .sort((a, b) => b.openInterestUsd - a.openInterestUsd);
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000
  });
}

const DAY = 86_400_000;

/** ۳۰ روز فاندینگ ساعتی (دو صفحهٔ ۵۰۰تایی) → صدک، میانگین‌ها، رژیم */
export function useFundingStats(coin: string | null, currentHourly: number | null, enabled = true) {
  return useQuery({
    queryKey: ['intel', 'funding', coin],
    queryFn: async () => {
      const start = Date.now() - 30 * DAY;
      const first = await weighted(30, () => hlFundingHistory(coin!, start));
      let all: FundingPoint[] = first;
      if (first.length >= 500) all = [...first, ...(await weighted(30, () => hlFundingHistory(coin!, first[first.length - 1].time + 1)))];
      return all;
    },
    select: (history) => fundingStats(history, currentHourly),
    enabled: !!coin && enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000
  });
}

/** ۵۰۰۰ کندل ۴ ساعته (~۲.۳ سال) برای چک قبل از ورود؛ وزن هایپرلیکوئید ≈ ۲۰ + ۱ به ازای هر ۶۰ کندل */
export function useRiskCandles(coin: string | null) {
  return useQuery({
    queryKey: ['intel', 'candles4h', coin],
    queryFn: async (): Promise<Candle[]> => parseCandles(await weighted(105, () => hlCandles(coin!, '4h', Date.now() - 5000 * 4 * 3_600_000), 0)),
    enabled: !!coin,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000
  });
}

/** غربال «محافظ سرمایه» — روی سرور تدریجی ساخته می‌شود؛ اینجا فقط خوانده می‌شود */
export function useMemeScreen() {
  return useQuery({
    queryKey: ['intel', 'meme-screen'],
    queryFn: () => getPublic<MemeScreenPayload>('/api/intel?op=memeScreen', 'غربال میم‌کوین دریافت نشد'),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000
  });
}
