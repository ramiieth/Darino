import type { CarPriceRow, CarSnapshot } from '../types';

const DAY = 86_400_000;
export const T0 = Date.parse('2026-09-01T08:00:00Z');

export function row(id: string, market: number | null, extra: Partial<CarPriceRow> = {}): CarPriceRow {
  return {
    id,
    modelId: `m${id}`,
    brand: 'iran-khodro',
    model: `مدل ${id}`,
    year: '1405',
    option: null,
    market,
    dealer: 1_000_000_000,
    marketUpdatedAt: null,
    srcChangePct: null,
    ...extra
  };
}

export function snap(dayOffset: number, rate: number | null, rows: CarPriceRow[], base = T0): CarSnapshot {
  const ts = base + dayOffset * DAY;
  const day = new Date(ts + 3.5 * 3600_000).toISOString().slice(0, 10);
  return { id: `car-${day}`, day, dateTs: ts, source: 'car.ir', usdtRate: rate, usdtSource: rate ? 'wallex' : null, brandNames: {}, rows, createdAt: ts };
}
