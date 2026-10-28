/** ============================================================
 * Car Market — ساخت/ادغام Snapshot روزانه (خالص)
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */
import { tehranDayKey } from '../../../shared/fx/usdtHistory.js';
import type { ParsedCarPrices } from '../collector/carIr.js';
import type { CarSnapshot } from './types.js';

export function carSnapshotId(day: string): string {
  return `car-${day}`;
}

export function buildCarSnapshot(
  parsed: ParsedCarPrices,
  usdt: { rateToman: number; source: 'wallex' | 'bitpin' } | null,
  now = Date.now()
): CarSnapshot {
  const day = tehranDayKey(now);
  return {
    id: carSnapshotId(day),
    day,
    dateTs: now,
    source: 'car.ir',
    usdtRate: usdt?.rateToman ?? null,
    usdtSource: usdt?.source ?? null,
    brandNames: parsed.brandNames,
    rows: parsed.rows,
    createdAt: now
  };
}

/** اعتبار حداقلی Snapshot دریافتی از سرور/حافظه */
export function isCarSnapshot(v: unknown): v is CarSnapshot {
  const s = v as CarSnapshot | null;
  return !!s && typeof s.id === 'string' && typeof s.day === 'string' && typeof s.dateTs === 'number' && Array.isArray(s.rows);
}

/** ادغام: هر روز یک Snapshot — نسخه با dateTs جدیدتر می‌ماند؛ مرتب صعودی */
export function mergeCarSnapshots(...lists: CarSnapshot[][]): CarSnapshot[] {
  const byDay = new Map<string, CarSnapshot>();
  for (const list of lists) {
    for (const s of list) {
      if (!isCarSnapshot(s)) continue;
      const prev = byDay.get(s.day);
      if (!prev) byDay.set(s.day, s);
      else byDay.set(s.day, s.dateTs > prev.dateTs ? carryDivar(s, prev) : carryDivar(prev, s));
    }
  }
  const sorted = [...byDay.values()].sort((a, b) => a.dateTs - b.dateTs);
  // روز تازه با واکشی مستقیم car.ir (هنوز بدون دیوار) ← ردیف‌های دیوارِ آخرین روزِ دارای دیوار؛
  // وگرنه همهٔ خودروهای دست‌دوم دیوار «حذف‌شده» و «توقف تولید» به نظر می‌رسیدند
  const last = sorted.length - 1;
  if (last > 0 && !sorted[last].rows.some((r) => r.source === 'divar')) {
    const prev = [...sorted].reverse().find((s) => s.rows.some((r) => r.source === 'divar') && sorted[last].dateTs - s.dateTs <= DIVAR_CARRY_MS);
    if (prev) sorted[last] = carryDivar(sorted[last], prev);
  }
  return sorted;
}

/** ردیف‌های دیوار میانهٔ ۱۴ روز آگهی‌اند؛ تا همین بازه برای روز تازه معتبرند */
const DIVAR_CARRY_MS = 14 * 86_400_000;

/** نسخهٔ جدیدتر همان روز می‌ماند؛ اگر ردیف‌های دیوار ندارد (واکشی مستقیم car.ir در مرورگر) از نسخهٔ دیگر می‌آیند */
export function carryDivar(newer: CarSnapshot, older: CarSnapshot): CarSnapshot {
  if (newer.rows.some((r) => r.source === 'divar')) return newer;
  const divar = older.rows.filter((r) => r.source === 'divar');
  return divar.length ? { ...newer, rows: [...newer.rows, ...divar] } : newer;
}
