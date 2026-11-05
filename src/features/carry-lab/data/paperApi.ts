/** کلاینت بات کاغذی — با نشست و هدر CSRF از طریق fetchJson */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import type { PaperBook, summarize } from '../domain/paper';

export interface PaperStatus {
  book: PaperBook | null;
  summary: ReturnType<typeof summarize> | null;
  tick: { configured: boolean; lastAt: number | null };
}

const op = (name: string) => `/api/integrations?op=${name}`;
const KEY = ['paper-bot'];

export function usePaperStatus() {
  return useQuery({ queryKey: KEY, queryFn: () => fetchJson<PaperStatus>(op('paper-status'), { timeoutMs: 15_000 }), refetchInterval: 5 * 60_000, staleTime: 60_000 });
}

export function usePaperAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, capitalUsd }: { action: 'start' | 'stop' | 'reset'; capitalUsd?: number }) =>
      fetchJson<PaperStatus>(op(`paper-${action}`), { method: 'POST', body: capitalUsd ? { capitalUsd } : {}, timeoutMs: 40_000 }),
    onSuccess: (data) => qc.setQueryData(KEY, data)
  });
}
