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
      if (!prev || s.dateTs > prev.dateTs) byDay.set(s.day, s);
    }
  }
  return [...byDay.values()].sort((a, b) => a.dateTs - b.dateTs);
}
