/** ============================================================
 * Property Market — تازه‌سازی خودکار روزانه (سرور، Cron)
 *
 *  جدیدترین صفحه‌های دیوار در بودجهٔ زمانی یک فانکشن → seed → پاک‌سازی (همان قیف کلاینت)
 *  → آگهی آماده برای ذخیره در Neon. کلاینت هنگام باز شدن صفحه همین آگهی‌ها را ادغام می‌کند،
 *  پس قیمت‌ها بدون زدن «به‌روزرسانی داده» روزانه تازه می‌شوند.
 *
 *  آگهی شناخته‌شده: جزئیاتش دوباره واکشی نمی‌شود (سریع‌تر)؛ قیمت تازه از فهرست می‌آید و
 *  متراژ/سال ساخت از نسخهٔ ذخیره‌شده پر می‌شود.
 * ============================================================ */
import type { PropertyMarketListing } from '../domain/types.js';
import type { Fetcher } from './client.js';
import { collectChunk, newCursor } from './run.js';
import { fillFromStored, newCleaningReport, normalizeAndValidate } from './pipeline.js';

/** سقف واکشی جزئیات در هر تکهٔ Cron */
export const CRON_DETAIL_BUDGET = 6;

export interface RefreshResult {
  listings: PropertyMarketListing[];
  seen: number;
  pages: number;
  /** همهٔ صفحه‌ها خوانده شد (معمولاً نه؛ بودجهٔ زمان محدود است) */
  complete: boolean;
}

export async function refreshNewestListings(opts: {
  known: ReadonlyMap<string, PropertyMarketListing>;
  /** بودجهٔ کل زمان (ms) — کمتر از سقف فانکشن */
  timeBudgetMs: number;
  now?: number;
  fetcher?: Fetcher;
  pauseMs?: number;
}): Promise<RefreshResult> {
  const now = opts.now ?? Date.now();
  const deadline = Date.now() + opts.timeBudgetMs;
  let cursor = newCursor();
  let cityId: string | null = null;
  const seeds = new Map<string, Parameters<typeof fillFromStored>[0]>();
  let complete = false;
  // بودجهٔ هر تکه نرم است (یک درخواست دیوار چند ثانیه طول می‌کشد) → حاشیهٔ امن بزرگ
  while (deadline - Date.now() > 12_000) {
    const r = await collectChunk({
      city: 'ahvaz',
      cursor,
      knownTokens: [...opts.known.keys()],
      timeBudgetMs: deadline - Date.now() - 10_000,
      // جزئیات کم، صفحهٔ بیشتر: آگهی‌های کامل فهرست (بیشترشان) زودتر به دست می‌آیند
      detailBudget: CRON_DETAIL_BUDGET,
      pauseMs: opts.pauseMs,
      fetcher: opts.fetcher
    });
    cursor = r.cursor;
    cityId = r.cityId ?? cityId;
    for (const s of r.seeds) seeds.set(s.token, s);
    if (r.done) {
      complete = true;
      break;
    }
  }
  const report = newCleaningReport();
  const listings: PropertyMarketListing[] = [];
  for (const s of seeds.values()) {
    const l = normalizeAndValidate(fillFromStored(s, opts.known.get(s.token)), 'ahvaz', cityId, now, report);
    if (l) listings.push(l);
  }
  return { listings, seen: seeds.size, pages: cursor.pagesRead, complete };
}
