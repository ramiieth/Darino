/**
 * چند «فهرست صفحه‌دار» موازی (تعداد متغیر) روی react-query — useInfiniteQuery برای آرایهٔ پویا هوک ندارد.
 *   دادهٔ هر کلید = آرایهٔ صفحه‌ها؛ loadMore صفحهٔ بعد را می‌گیرد و به همان کش اضافه می‌کند.
 */
import { useState } from 'react';
import { useQueries, useQueryClient, type QueryKey } from '@tanstack/react-query';

export interface InfiniteSpec<P> {
  key: QueryKey;
  first: () => Promise<P>;
  /** null = صفحهٔ دیگری نیست */
  more: (last: P) => Promise<P> | null;
}

export interface InfiniteResult<P> {
  pages: P[];
  loading: boolean;
  error: string | null;
  updatedAt: number;
  loadMore: () => void;
  refetch: () => void;
}

export function useInfiniteQueries<P>(specs: InfiniteSpec<P>[]): InfiniteResult<P>[] {
  const client = useQueryClient();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const q = useQueries({
    queries: specs.map((s) => ({
      queryKey: s.key,
      queryFn: async () => [await s.first()],
      staleTime: 30 * 60_000,
      gcTime: 2 * 60 * 60_000,
      retry: 1
    }))
  });
  return specs.map((s, i) => {
    const id = JSON.stringify(s.key);
    const pages = (q[i].data ?? []) as P[];
    return {
      pages,
      loading: q[i].isPending || !!busy[id],
      error: q[i].error ? String((q[i].error as Error).message ?? q[i].error) : null,
      updatedAt: q[i].dataUpdatedAt,
      loadMore: () => {
        const last = pages.at(-1);
        const next = last ? s.more(last) : null;
        if (!next || busy[id]) return;
        setBusy((b) => ({ ...b, [id]: true }));
        void next
          .then((p) => client.setQueryData<P[]>(s.key, (old) => [...(old ?? []), p]))
          .finally(() => setBusy((b) => ({ ...b, [id]: false })));
      },
      refetch: () => void q[i].refetch()
    };
  });
}
