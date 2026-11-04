/**
 * ژورنال اسپات — سواپ‌های همهٔ کیف پول‌های «دارایی من» از زریون (فقط سواپ: op=swaps)، بدون تایپ
 *
 *   هر کیف پول: صفحه‌های ۱۰۰تایی؛ بار اول تا ۳ صفحه (۳۰۰ سواپ اخیر)، «قدیمی‌تر» صفحهٔ بعد را می‌خواند.
 *   پاسخ‌ها در سرور کش می‌شوند (سهمیهٔ زریون)؛ این‌جا ۳۰ دقیقه تازه می‌مانند.
 *   قیمت لحظه‌ای برای سود/زیان باز: از موجودی کیف پول (همان دادهٔ صفحهٔ دارایی من).
 */
import { useEffect, useMemo } from 'react';
import { useInfiniteQueries } from './infiniteQueries';
import { useCustody } from '@/features/custody/data/useCustody';
import { isBitcoinAddress } from '@/features/connected/domain/bitcoinAddress';
import { refreshWallet, useConnectedStore } from '@/features/connected/data/store';
import { addressKey, type TransactionPage } from '@/features/connected/domain/model';
import { fetchJson } from '@/repositories/remoteClient';
import { assetKey, spotBook, toSwaps, type SpotBook } from '../domain/spot';

const FIRST_PAGES = 3;

async function loadPages(address: string, next: string | null, pages: number): Promise<TransactionPage> {
  const rows: TransactionPage['rows'] = [];
  let cursor = next;
  let fetchedAt = Date.now();
  for (let i = 0; i < pages; i++) {
    const q = new URLSearchParams({ op: 'swaps', address });
    if (cursor) q.set('next', cursor);
    const r = await fetchJson<TransactionPage>(`/api/integrations?${q}`, { timeoutMs: 25_000 });
    rows.push(...r.rows);
    fetchedAt = r.fetchedAt;
    cursor = r.next;
    if (!cursor) break;
  }
  return { rows, next: cursor, fetchedAt };
}

export interface SpotState {
  wallets: { address: string; label: string; status: 'loading' | 'ready' | 'error'; swaps: number; hasMore: boolean; error: string | null }[];
  book: SpotBook | null;
  loading: boolean;
  loadMore: (address: string) => void;
  refetch: () => void;
}

export function useSpot(fromMs: number): SpotState {
  const custody = useCustody();
  const wallets = useMemo(() => {
    const seen = new Map<string, { address: string; label: string }>();
    for (const h of custody.holdings) {
      if (h.archivedAt || h.kind !== 'wallet' || !h.address || isBitcoinAddress(h.address)) continue;
      const k = addressKey(h.address);
      if (!seen.has(k)) seen.set(k, { address: h.address, label: h.label || `${h.address.slice(0, 6)}…${h.address.slice(-4)}` });
    }
    return [...seen.values()];
  }, [custody.holdings]);

  const q = useInfiniteQueries(wallets.map((w) => ({
    key: ['journal-spot', addressKey(w.address)],
    first: () => loadPages(w.address, null, FIRST_PAGES),
    more: (prev: TransactionPage) => (prev.next ? loadPages(w.address, prev.next, 1) : null)
  })));

  // قیمت لحظه‌ای از موجودی کیف پول (همان دادهٔ «دارایی من»؛ خودش محدودیت سهمیه را رعایت می‌کند)
  useEffect(() => { wallets.forEach((w) => void refreshWallet(w.address)); }, [wallets]);
  const snaps = useConnectedStore((s) => s.wallets);

  const stamp = q.map((x) => x.updatedAt).join(',');
  const book = useMemo(() => {
    if (!wallets.length || q.every((x) => !x.pages.length)) return null;
    const swaps = wallets.flatMap((w, i) => q[i].pages.flatMap((p) => toSwaps(w.address, p.rows)));
    const price = new Map<string, number>();
    for (const w of wallets) {
      for (const p of snaps[addressKey(w.address)]?.data?.positions ?? []) {
        if (p.spam || !p.displayable || p.verified === false || p.price === null || !(p.price > 0) || p.type !== 'wallet') continue;
        price.set(assetKey({ symbol: p.symbol, tokenId: p.tokenId, verified: p.verified }), p.price);
      }
    }
    // یک سواپ ممکن است از دو کیف پول خودی دیده شود (انتقال داخلی نیست، ولی شناسه یکی است)
    const unique = [...new Map(swaps.map((s) => [s.hash || s.id, s])).values()];
    return spotBook(unique, price, fromMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, wallets, snaps, fromMs]);

  return {
    wallets: wallets.map((w, i) => ({
      address: w.address,
      label: w.label,
      status: q[i].loading ? 'loading' : q[i].error && !q[i].pages.length ? 'error' : 'ready',
      swaps: q[i].pages.reduce((s, p) => s + toSwaps(w.address, p.rows).length, 0),
      hasMore: !!q[i].pages.at(-1)?.next,
      error: q[i].error
    })),
    book,
    loading: q.some((x) => x.loading),
    loadMore: (address) => { const i = wallets.findIndex((w) => addressKey(w.address) === addressKey(address)); if (i >= 0) q[i].loadMore(); },
    refetch: () => q.forEach((x) => x.refetch())
  };
}
