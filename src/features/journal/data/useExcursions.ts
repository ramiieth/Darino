/**
 * کندل‌های مسیر قیمت برای MAE/MFE — مستقیم از info هایپرلیکوئید در مرورگر (مثل تاریخچهٔ ژورنال)
 *
 *   هر (کوین، بازه) یک درخواست candleSnapshot با کل ۵۰۰۰ کندل اخیر؛ کش ۳۰ دقیقه.
 *   فقط بازه‌هایی که معاملات واقعاً لازم دارند گرفته می‌شوند (معمولاً ۳ تا ۸ درخواست).
 */
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { Trade } from '../domain/types';
import { candleNeeds, excursionsFor, HL_CANDLE_CAP, summarize, type Candle, type CandleSet } from '../domain/excursions';

const HL_INFO = 'https://api.hyperliquid.xyz/info';

async function fetchCandles(coin: string, key: string, ms: number): Promise<CandleSet> {
  const now = Date.now();
  const res = await fetch(HL_INFO, {
    method: 'POST',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: key, startTime: now - HL_CANDLE_CAP * ms, endTime: now } })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as { t: number; o: string; h: string; l: string; c: string }[];
  const candles: Candle[] = (Array.isArray(raw) ? raw : [])
    .map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c) }))
    .filter((k) => k.o > 0 && k.h > 0 && k.l > 0)
    .sort((a, b) => a.t - b.t);
  return { coin, intervalMs: ms, candles };
}

export function useExcursions(trades: readonly Trade[]) {
  // ساعت ثابت در طول جلسه تا انتخاب بازه با هر رندر عوض نشود
  const now = useMemo(() => Math.floor(Date.now() / 600_000) * 600_000, []);
  const needs = useMemo(() => candleNeeds(trades, now), [trades, now]);
  const q = useQueries({
    queries: needs.map((n) => ({
      queryKey: ['journal-candles', n.coin, n.interval.key],
      queryFn: () => fetchCandles(n.coin, n.interval.key, n.interval.ms),
      staleTime: 30 * 60_000,
      gcTime: 60 * 60_000,
      retry: 1
    }))
  });
  const stamp = q.map((x) => x.dataUpdatedAt).join(',');
  return useMemo(() => {
    const sets = new Map<string, CandleSet>();
    needs.forEach((n, i) => q[i].data && sets.set(`${n.coin}|${n.interval.key}`, q[i].data!));
    const { measured, unmeasured } = excursionsFor(trades, sets, now);
    return {
      loading: q.some((x) => x.isPending),
      failed: needs.filter((_, i) => q[i].isError).map((n) => n.coin),
      measured,
      unmeasured,
      symbols: summarize(measured)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, trades, needs, now]);
}

/** قیمت میانهٔ لحظه‌ای پرپ هم‌نام (پیش‌فرض قیمت ورود؛ با قیمت بروکر فرق دارد) */
export function useLiveMid(coin: string | null) {
  const dex = coin?.includes(':') ? coin.split(':')[0] : null;
  return useQuery({
    queryKey: ['journal-mid', dex ?? ''],
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await fetch(HL_INFO, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'allMids', ...(dex ? { dex } : {}) }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Record<string, string>;
    },
    enabled: !!coin,
    staleTime: 15_000,
    refetchInterval: 30_000,
    select: (m) => (coin && m[coin] ? Number(m[coin]) : null)
  });
}
