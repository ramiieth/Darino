/** ============================================================
 * Arcus — صفحه‌بندی کامل تاریخچه (newest-first)
 *
 * طبق مستندات fills/orders/funding/accountTransferUpdates:
 *  • from/to میکروثانیه و «شامل» (inclusive) هستند؛ مرز صفحات عمداً هم‌پوشانی دارد
 *    → حذف تکراری با شناسه (tradeId / orderId / id / marketId+time).
 *  • صفحهٔ بعد: to = قدیمی‌ترین زمانِ صفحهٔ فعلی (همان واحد و همان فیلد).
 *  • اگر یک صفحهٔ پر هیچ رکورد جدیدی نیاورد (بیش از `limit` رکورد با زمان یکسان)،
 *    ادامه بدون جاانداختن رکورد ممکن نیست → صریحاً «ناقص» اعلام می‌شود (نه پرش زمانی).
 *  • funding: بدون from، API فقط ۳۰ روز اخیر را می‌دهد — پس from همیشه صریح ارسال می‌شود.
 * ============================================================ */
import { arcusGet, MIN_US, type FetchOptions } from './client';
import type { ArcusFill, ArcusFunding, ArcusOrder, ArcusTransfer, BigNum } from './types';
import { toUs } from './types';
import type { ArcusEnv } from '@/features/custody/domain/types';

export type HistoryKind = 'fills' | 'orders' | 'funding' | 'transfers';

interface KindSpec<T> {
  path: '/v1/fills' | '/v1/orders' | '/v1/funding' | '/v1/accountTransferUpdates';
  field: 'fills' | 'orders' | 'fundingPayments' | 'accountTransferUpdates';
  time: (r: T) => BigNum;
  id: (r: T) => string;
}

export const HISTORY_SPECS = {
  fills: { path: '/v1/fills', field: 'fills', time: (r: ArcusFill) => r.createdAt, id: (r: ArcusFill) => `t:${r.tradeId}` } as KindSpec<ArcusFill>,
  // orders: پنجرهٔ زمانی روی updatedAt است
  orders: { path: '/v1/orders', field: 'orders', time: (r: ArcusOrder) => r.updatedAt, id: (r: ArcusOrder) => `o:${r.orderId}` } as KindSpec<ArcusOrder>,
  funding: {
    path: '/v1/funding',
    field: 'fundingPayments',
    time: (r: ArcusFunding) => r.time,
    // هر (بازار، حساب) در هر تیک فقط یک پرداخت دارد
    id: (r: ArcusFunding) => `f:${r.marketId}:${toUs(r.time)}`
  } as KindSpec<ArcusFunding>,
  transfers: {
    path: '/v1/accountTransferUpdates',
    field: 'accountTransferUpdates',
    time: (r: ArcusTransfer) => r.createdAt,
    id: (r: ArcusTransfer) => `x:${r.id}`
  } as KindSpec<ArcusTransfer>
};

export interface HistoryRowMap {
  fills: ArcusFill;
  orders: ArcusOrder;
  funding: ArcusFunding;
  transfers: ArcusTransfer;
}

export interface HistoryResult<T> {
  rows: T[];
  complete: boolean;
  /** دلیل ناقص‌بودن */
  limitation: string | null;
  pages: number;
}

export interface PageOptions extends FetchOptions {
  env: ArcusEnv;
  address: string;
  accountIndex: number;
  /** میکروثانیه (رشته) — شامل */
  fromUs?: string | null;
  toUs?: string | null;
  limit?: number;
  maxPages?: number;
  market?: string | null;
  onProgress?: (p: { pages: number; rows: number }) => void;
}

export async function fetchHistory<K extends HistoryKind>(kind: K, o: PageOptions): Promise<HistoryResult<HistoryRowMap[K]>> {
  const spec = HISTORY_SPECS[kind] as unknown as KindSpec<HistoryRowMap[K]>;
  const limit = Math.min(Math.max(o.limit ?? 500, 1), 1000);
  const maxPages = o.maxPages ?? 40;
  const seen = new Set<string>();
  const rows: HistoryRowMap[K][] = [];
  let to = o.toUs ?? null;
  // funding بدون from فقط ۳۰ روز می‌دهد — حداقل مجاز مستند به‌عنوان «از ابتدا»
  const from = o.fromUs ?? (kind === 'funding' ? MIN_US.toString() : null);
  let pages = 0;

  while (pages < maxPages) {
    if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const body = await arcusGet<Record<string, unknown>>(
      o.env,
      spec.path,
      { address: o.address, accountIndex: o.accountIndex, limit, from, to, market: o.market ?? undefined },
      o
    );
    pages++;
    const page = (Array.isArray(body[spec.field]) ? body[spec.field] : []) as HistoryRowMap[K][];
    let added = 0;
    let oldest: string | null = null;
    for (const r of page) {
      const t = toUs(spec.time(r));
      if (t && (oldest === null || BigInt(t) < BigInt(oldest))) oldest = t;
      const id = spec.id(r);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(r);
      added++;
    }
    o.onProgress?.({ pages, rows: rows.length });

    if (page.length < limit) return { rows, complete: true, limitation: null, pages };
    if (added === 0 || oldest === null) {
      return {
        rows,
        complete: false,
        limitation: `بیش از ${limit} رکورد با زمان یکسان وجود دارد؛ آرکوس امکان ادامهٔ بدون جاافتادگی را نمی‌دهد`,
        pages
      };
    }
    if (from && BigInt(oldest) <= BigInt(from)) return { rows, complete: true, limitation: null, pages };
    to = oldest; // inclusive — هم‌پوشانی با شناسه حذف می‌شود
  }
  return { rows, complete: false, limitation: `برای جلوگیری از مصرف بیش از حد سهمیه، پس از ${maxPages} صفحه متوقف شد`, pages };
}
