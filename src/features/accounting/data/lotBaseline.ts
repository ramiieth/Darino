/** ============================================================
 * مبنای لات‌های FIFO (یک‌بار در مهاجرت به حسابداری چنددستگاهی)
 *
 *  • مبنا = لات‌های باز ذخیره‌شده در لحظهٔ مهاجرت + بزرگ‌ترین شناسهٔ سند قدیمی.
 *  • از طریق «تنظیمات همگام» (custodyRecords/prefs) در Neon ذخیره و بین دستگاه‌ها یکی می‌شود.
 *  • اگر سرور قبلاً مبنا دارد (دستگاه دیگر زودتر مهاجرت کرده)، همان استفاده می‌شود؛
 *    دستگاه دوم مبنای خودش را جایگزین نمی‌کند مگر کاربر در «تطبیق» صراحتاً بخواهد.
 * ============================================================ */
import { repairPartiallyClosedLots } from '../domain/engine';
import type { LotBaseline } from '../domain/lotReplay';
import type { FifoLot, JournalEntry } from '../domain/types';
import { getPref, savePref } from '@/features/custody/data/repository';

export const LOT_BASELINE_PREF = 'acc-lot-baseline';

export function readBaseline(): LotBaseline | null {
  return getPref<LotBaseline>(LOT_BASELINE_PREF)?.value ?? null;
}

export function buildBaseline(storedLots: FifoLot[], entries: JournalEntry[], source: string, now = Date.now()): LotBaseline {
  const legacy = entries.filter((e) => !e.trade && !e.derivedFrom);
  return {
    lots: repairPartiallyClosedLots(storedLots).filter((l) => !l.closedAt && l.qty > 1e-9),
    asOfEntryId: legacy.reduce((m, e) => Math.max(m, e.id), 0),
    createdAt: now,
    source
  };
}

let creating: Promise<LotBaseline> | null = null;

/** اگر مبنایی (محلی یا همگام‌شده از سرور) نیست، از لات‌های همین دستگاه بساز (یک‌بار، حتی با چند نمونهٔ هوک) */
export function ensureBaseline(storedLots: FifoLot[], entries: JournalEntry[], source: string): Promise<LotBaseline> {
  const existing = readBaseline();
  if (existing) return Promise.resolve(existing);
  if (!creating) {
    creating = (async () => {
      const b = buildBaseline(storedLots, entries, source);
      await savePref(LOT_BASELINE_PREF, b);
      return b;
    })().finally(() => {
      creating = null;
    });
  }
  return creating;
}

/** جایگزینی مبنا با لات‌های این دستگاه — فقط با تأیید صریح کاربر در «تطبیق» */
export async function replaceBaseline(storedLots: FifoLot[], entries: JournalEntry[], source: string): Promise<LotBaseline> {
  const b = buildBaseline(storedLots, entries, source);
  await savePref(LOT_BASELINE_PREF, b);
  return b;
}

/**
 * آیا ساختن «افتتاحیهٔ خودکار» مجاز است؟
 * فقط وقتی مطمئنیم سرور هیچ سندی ندارد، یا اپ کلاً بدون سرور (حالت محلی) کار می‌کند.
 * قبلاً دستگاه تازه (مثلاً اپ آیفون) قبل از دریافت سندهای سرور، افتتاحیهٔ خودش را می‌ساخت
 * و با شناسه‌های یکتا این به موجودی تکراری روی سرور منجر می‌شد.
 */
export type RemoteLedgerState = 'empty' | 'has_data' | 'local_only' | 'unknown';

export function mayAutoSeed(localCount: number, remote: RemoteLedgerState): boolean {
  if (localCount > 0) return false;
  return remote === 'empty' || remote === 'local_only';
}
