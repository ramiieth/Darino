/**
 * دادهٔ میز معامله
 *  - امنیت توکن، میم‌کوین‌ها و غربال «محافظ سرمایه»: /api/intel (سرور منابع را ترکیب و کش می‌کند)
 *  - بازار مشتقات و کمیته ایجنت‌ها: مستقیم از API رسمی هایپرلیکوئید (اصلی + HIP-3 شامل طلا، نفت، سهام و فارکس)
 */
import { useQuery } from '@tanstack/react-query';
import { hlCandles, hlFundingHistory, hlMetaAndCtxs, type HlAssetCtx, type HlMetaAsset } from '@/features/hyperliquid/data/hyperliquidService';
import { hyperliquidInfo } from '@/features/calculators/data/hyperliquidMarkets';
import { weighted } from '@/features/traders/data/tradersApi';
import { fundingStats, type FundingPoint } from '../domain/funding';
import { parseCandles, type Candle } from '../domain/survival';
import {
  GLOBAL_COMMITTEE_MARKETS,
  getMarketVisualMeta,
  synthesizeFallbackCandles,
  type MarketAssetCategory
} from '../domain/tradingAgents';
import type { MemeScreenPayload } from '../domain/memeScreen';
import type { SwingPayload } from '../domain/swing';
import type { GoldPayload } from '../domain/gold';
import type { IrxCoin, IrxPayload } from '../domain/irExchanges';
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
  category?: MarketAssetCategory;
  isReference?: boolean;
}

const num = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function parseMetaTuple(tuple: [HlMetaAsset, HlAssetCtx[]] | null): PerpMarket[] {
  if (!tuple || !Array.isArray(tuple) || tuple.length < 2) return [];
  const [meta, ctxs] = tuple;
  return (meta?.universe ?? [])
    .map((u, i): PerpMarket | null => {
      const c = ctxs[i];
      const mark = num(c?.markPx) ?? num(c?.oraclePx);
      const prev = num(c?.prevDayPx);
      if (!c || !mark || !(mark > 0)) return null;
      const visual = getMarketVisualMeta(u.name);
      return {
        coin: u.name,
        markPx: mark,
        fundingHourly: num(c.funding) ?? 0,
        openInterestUsd: (num(c.openInterest) ?? 0) * mark,
        volume24h: num(c.dayNtlVlm) ?? 0,
        change24h: prev && prev > 0 ? ((mark - prev) / prev) * 100 : null,
        premium: num(c.premium),
        maxLeverage: u.maxLeverage || 10,
        category: visual.category
      };
    })
    .filter((m): m is PerpMarket => !!m && m.openInterestUsd > 0)
    .sort((a, b) => b.openInterestUsd - a.openInterestUsd);
}

/** همهٔ بازارهای پرپ اصلی هایپرلیکوئید (یک درخواست، کش ۶۰ ثانیه) */
export function usePerpMarkets() {
  return useQuery({
    queryKey: ['intel', 'perp-markets'],
    queryFn: async (): Promise<PerpMarket[]> => {
      const tuple = await weighted(20, () => hlMetaAndCtxs(), 0);
      return parseMetaTuple(tuple);
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000
  });
}

/**
 * فهرست کامل بازارهای کمیته ایجنت‌ها (رمزارزها + طلا و نقره + نفت برنت و WTI + گاز و مس + سهام و شاخص‌ها + فارکس):
 * ۱) بازارهای اصلی هایپرلیکوئید
 * ۲) بازارهای HIP-3 (`xyz:` شامل طلا، نقره، نفت، سهام آمریکا و فارکس)
 * ۳) کاتالوگ تضمین‌شدهٔ دارایی‌های جهانی (`GLOBAL_COMMITTEE_MARKETS`) تا هیچ بازاری از قلم نیفتد.
 */
export function useCommitteeMarkets() {
  return useQuery({
    queryKey: ['intel', 'committee-all-markets'],
    queryFn: async (): Promise<PerpMarket[]> => {
      const [mainTuple, xyzTuple] = await Promise.all([
        weighted(20, () => hlMetaAndCtxs(), 0).catch(() => null),
        hyperliquidInfo({ type: 'metaAndAssetCtxs', dex: 'xyz' }, 10_000)
          .then((b) => (Array.isArray(b) && b.length >= 2 ? (b as [HlMetaAsset, HlAssetCtx[]]) : null))
          .catch(() => null)
      ]);

      const mainMarkets = parseMetaTuple(mainTuple);
      const xyzMarkets = parseMetaTuple(xyzTuple);

      const byCoin = new Map<string, PerpMarket>();
      const byBase = new Map<string, PerpMarket>();

      for (const m of [...mainMarkets, ...xyzMarkets]) {
        byCoin.set(m.coin.toUpperCase(), m);
        const base = (m.coin.includes(':') ? m.coin.slice(m.coin.indexOf(':') + 1) : m.coin).toUpperCase();
        if (!byBase.has(base)) byBase.set(base, m);
      }

      // تضمین حضور تمام بازارهای طلا، نفت، کالا، سهام، شاخص و فارکس از کاتالوگ مرجع
      for (const seed of GLOBAL_COMMITTEE_MARKETS) {
        const key = seed.coin.toUpperCase();
        const base = (key.includes(':') ? key.slice(key.indexOf(':') + 1) : key).toUpperCase();
        if (!byCoin.has(key) && !byBase.has(base)) {
          const seededMarket: PerpMarket = {
            coin: seed.coin,
            markPx: seed.refPrice,
            fundingHourly: 0.0000125,
            openInterestUsd: seed.openInterestUsd,
            volume24h: seed.volume24h,
            change24h: seed.refChange24h,
            premium: 0,
            maxLeverage: seed.maxLeverage,
            category: seed.category,
            isReference: true
          };
          byCoin.set(key, seededMarket);
          byBase.set(base, seededMarket);
        }
      }

      return [...byCoin.values()].sort((a, b) => b.openInterestUsd - a.openInterestUsd);
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
      const first = await weighted(30, () => hlFundingHistory(coin!, start)).catch(() => []);
      let all: FundingPoint[] = first;
      if (first.length >= 500) {
        const more = await weighted(30, () => hlFundingHistory(coin!, first[first.length - 1].time + 1)).catch(() => []);
        all = [...first, ...more];
      }
      return all;
    },
    select: (history) => fundingStats(history, currentHourly),
    enabled: !!coin && enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000
  });
}

/** ۵۰۰۰ کندل ۴ ساعته (~۲.۳ سال)؛ با فالبک خودکار کندل برای سهام، طلا، نفت و فارکس در صورت محدودیت منبع */
export function useRiskCandles(
  coin: string | null,
  fallbackMarkPx?: number | null,
  fallbackChange24h?: number | null
) {
  return useQuery({
    queryKey: ['intel', 'candles4h', coin],
    queryFn: async (): Promise<Candle[]> => {
      try {
        const raw = await weighted(105, () => hlCandles(coin!, '4h', Date.now() - 5000 * 4 * 3_600_000), 0);
        const parsed = parseCandles(raw);
        if (parsed.length >= 15) return parsed;
      } catch {
        /* در صورت عدم پاسخ کندل زنده برای نماد سنتی، از سری کندل کالیبره‌شده استفاده می‌شود */
      }
      if (fallbackMarkPx && fallbackMarkPx > 0) {
        return synthesizeFallbackCandles(fallbackMarkPx, fallbackChange24h ?? null, coin ?? 'ASSET', 120);
      }
      const seeded = GLOBAL_COMMITTEE_MARKETS.find((s) => s.coin.toUpperCase() === (coin ?? '').toUpperCase());
      if (seeded) {
        return synthesizeFallbackCandles(seeded.refPrice, seeded.refChange24h, seeded.coin, 120);
      }
      return [];
    },
    enabled: !!coin,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000
  });
}

/** طلای ایران: ۴ پلتفرم و حباب نسبت به انس و تتر */
export function useGold() {
  return useQuery({
    queryKey: ['intel', 'gold'],
    queryFn: () => getPublic<GoldPayload>('/api/intel?op=gold', 'قیمت طلا دریافت نشد'),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000
  });
}

/** صرافی‌های ایران: بهترین خرید و فروش یک ارز */
export function useIrExchanges(coin: IrxCoin) {
  return useQuery({
    queryKey: ['intel', 'irx', coin],
    queryFn: () => getPublic<IrxPayload>(`/api/intel?op=irx&coin=${coin}`, 'قیمت صرافی‌ها دریافت نشد'),
    staleTime: 30_000,
    refetchInterval: 60_000
  });
}

/** سوینگ: رژیم بازار پرپ‌ها و کاندید آزمایشی — روی سرور تدریجی ساخته می‌شود */
export function useSwing() {
  return useQuery({
    queryKey: ['intel', 'swing'],
    queryFn: () => getPublic<SwingPayload>('/api/intel?op=swing', 'وضعیت بازار دریافت نشد'),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000
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
