/**
 * هوک‌های TanStack Query برای ماژول‌های دیفای
 * — با placeholderData برای 429/خطا (استفاده از داده قبلی) و retry محدود
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isRateLimitError } from '@/shared/lib/throttler';
import { fetchChains, fetchProtocols } from './defillamaService';
import { filterYieldPools, auditFieldAvailable } from '@/features/defi/domain/logic';
import type { YieldChartResponse } from '@/features/defi/domain/logic';

const STALE = 5 * 60_000;
/** به‌روزرسانی خودکار هر ۵ دقیقه */
const REFETCH = 5 * 60_000;
const RETRY = 1;

function is429(e: unknown): boolean {
  return isRateLimitError(e);
}

/** ماژول ۴: شبکه‌ها + پروتکل‌ها */
export function useChains() {
  return useQuery({
    queryKey: ['defi', 'chains'],
    queryFn: () => fetchChains(),
    staleTime: STALE,
    refetchInterval: REFETCH,
    refetchOnWindowFocus: true,
    retry: RETRY,
    placeholderData: (prev) => prev
  });
}

export function useProtocolsList() {
  return useQuery({
    queryKey: ['defi', 'protocols'],
    queryFn: () => fetchProtocols(),
    staleTime: STALE,
    refetchInterval: REFETCH,
    refetchOnWindowFocus: true,
    retry: RETRY,
    placeholderData: (prev) => prev
  });
}

/** بررسی وضعیت خطای 429 (برای بنر کم‌رنگ) */
export function isRateLimited(error: unknown): boolean {
  return is429(error);
}

/** رفرش دستی همه ماژول‌های دیفای */
export function useDefiRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['defi'] });
  };
}
