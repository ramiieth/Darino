/**
 * خریدهای قبلی یک رمزارز برای «برنامهٔ من» — فقط‌خواندنی از دفتر «بهای تمام‌شده» (custody prefs، همین دستگاه)
 *
 *   بسته‌ها (lots)      خریدهای ثبت‌شده با مقدار، قیمت واحد و زمان → FIFO / LIFO واقعی
 *   موجودی تطبیق‌شده   currentBasis (مقدار + بهای کل) → فروش‌های بعدی از قدیمی‌ترین بسته‌ها کم می‌شود
 *   فقط موجودی         بدون بسته، یک بسته با میانگین همان موجودی
 * کارمزد خرید جدا لحاظ نمی‌شود. چیزی نوشته یا به سرور فرستاده نمی‌شود.
 */
import { useMemo } from 'react';
import { useCustody } from '@/features/custody/data/useCustody';
import { getPref } from '@/features/custody/data/repository';
import { COST_PREF, type CostBook } from '@/features/cost-basis/domain/book';
import { remainingLots, type Lot } from '@/features/calculators/domain';

export interface PlannerLots {
  lots: Lot[];
  /** lots = بسته‌های ثبت‌شده · basis = فقط موجودی و بهای کل · none = چیزی ثبت نشده */
  source: 'lots' | 'basis' | 'none';
  /** فروش‌ها کم نشده‌اند چون موجودی تطبیق‌شده‌ای نیست */
  unreconciled: boolean;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function costLotsFor(book: CostBook | undefined, symbol: string): PlannerLots {
  const sym = symbol.toUpperCase();
  if (!book) return { lots: [], source: 'none', unreconciled: false };
  const lots = (book.lots ?? []).flatMap((l): Lot[] => {
    const qty = num(l.quantity);
    const unitCost = num(l.unitCost);
    if (l.asset?.symbol?.toUpperCase() !== sym || qty === null || qty <= 0 || unitCost === null || unitCost < 0) return [];
    return [{ qty, unitCost, at: Number.isFinite(l.at) ? l.at : 0, source: 'existing' }];
  });
  const basis = Object.values(book.currentBasis ?? {}).filter((b) => b?.asset?.symbol?.toUpperCase() === sym);
  const basisQty = basis.length ? basis.reduce((s, b) => s + (num(b.quantity) ?? 0), 0) : null;
  const basisTotal = basis.reduce((s, b) => s + (num(b.total) ?? 0), 0);
  if (lots.length) return { lots: remainingLots(lots, basisQty), source: 'lots', unreconciled: basisQty === null };
  if (basisQty !== null && basisQty > 0) {
    const at = Math.min(...basis.map((b) => (Number.isFinite(b.at) ? b.at : 0)));
    return { lots: [{ qty: basisQty, unitCost: basisTotal / basisQty, at, source: 'existing' }], source: 'basis', unreconciled: false };
  }
  return { lots: [], source: 'none', unreconciled: false };
}

export function usePlannerLots(symbol: string): PlannerLots {
  const { loaded, holdings } = useCustody();
  return useMemo(
    () => costLotsFor(getPref<CostBook>(COST_PREF)?.value, symbol),
    // دفتر در custody است؛ loaded/holdings هر بار بارگذاری custody را نشان می‌دهند
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol, loaded, holdings]
  );
}
