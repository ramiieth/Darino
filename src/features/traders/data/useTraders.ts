/**
 * هوک‌های تریدرهای برتر — کش React Query (۳۰ دقیقه) روی صف وزنی tradersApi
 *  - useTraderCurve: فقط portfolio (سبک) ← سود کل، ماه‌های سودده، افت
 *  - useTraderReport: portfolio + ۲۰۰۰ fill اخیر (سنگین) ← نرخ برد و آمار معاملات
 */
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { buildReport } from '../domain/report';
import { pnlCurve } from '../domain/portfolio';
import { fetchFills, fetchPortfolio, fetchPositions, fetchSummaries, fetchTradersList } from './tradersApi';

const STALE = 30 * 60_000;
const portfolioKey = (a: string) => ['traders', 'portfolio', a] as const;

export function useTradersList() {
  return useQuery({ queryKey: ['traders', 'list'], queryFn: fetchTradersList, staleTime: STALE, retry: 1 });
}

/**
 * خلاصهٔ کارنامهٔ آدرس‌ها از سرور (مشترک بین همهٔ دستگاه‌ها). تا وقتی سرور خلاصهٔ محاسبه‌نشده دارد
 * هر ۲۵ ثانیه دوباره می‌پرسد — هر درخواست چند آدرس دیگر را روی سرور محاسبه می‌کند.
 */
export function useSummaries(addresses: string[]) {
  const key = [...addresses].sort().join(',');
  return useQuery({
    queryKey: ['traders', 'summaries', key],
    queryFn: () => fetchSummaries(addresses),
    enabled: addresses.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: (q) => ((q.state.data?.pending ?? 0) > 0 ? 25_000 : false),
    staleTime: 5 * 60_000
  });
}

export function usePositions() {
  return useQuery({ queryKey: ['traders', 'positions'], queryFn: fetchPositions, staleTime: 2 * 60_000, refetchInterval: 5 * 60_000 });
}

export function curveQuery(address: string, enabled = true) {
  return {
    queryKey: portfolioKey(address),
    queryFn: () => fetchPortfolio(address),
    select: pnlCurve,
    staleTime: STALE,
    gcTime: 2 * STALE,
    enabled
  };
}

export function useTraderCurve(address: string, enabled = true) {
  return useQuery(curveQuery(address, enabled));
}

/** گزینه‌های مشترک کوئری کارنامه — ردیف‌ها و مرتب‌سازی فهرست یک کش را به اشتراک می‌گذارند */
export function reportQuery(qc: QueryClient, address: string, enabled = true) {
  return {
    queryKey: ['traders', 'report', address] as const,
    queryFn: async () => {
      const [portfolio, fills] = await Promise.all([
        qc.ensureQueryData({ queryKey: portfolioKey(address), queryFn: () => fetchPortfolio(address), staleTime: STALE }),
        fetchFills(address)
      ]);
      return buildReport(fills, portfolio);
    },
    staleTime: STALE,
    gcTime: 2 * STALE,
    enabled
  };
}

export function useTraderReport(address: string, enabled = true) {
  return useQuery(reportQuery(useQueryClient(), address, enabled));
}
