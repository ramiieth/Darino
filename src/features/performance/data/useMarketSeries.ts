/**
 * همهٔ سری‌های بازار برای مقایسه:
 *   سرور  — /api/intel?op=benchmarks (طلا، سکه، بورس، کریپتو، سهام جهانی، تورم)
 *   مرورگر — نرخ دلار از تاریخچهٔ روزانهٔ تتر خود اپ، خودرو و مسکن از Snapshotهای ثبت‌شدهٔ همان بخش‌ها،
 *            CPI رسمی ایران از ورود کاربر (با منبع) یا بانک جهانی
 * هیچ عددی ساخته نمی‌شود؛ نبود داده = سری خالی/ناموجود.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { useUsdtHistoryStore } from '@/shared/store/usdtStore';
import { useCarMarketStore } from '@/features/carMarket/data/store';
import { usePropertyMarketStore } from '@/features/propertyMarket/data/store';
import type { CarSnapshot } from '@/features/carMarket/domain/types';
import type { PropertyMarketSnapshot } from '@/features/propertyMarket/domain/types';
import { normalizePoints, valueAt } from '../domain/engine';
import { SOURCE_FA } from '../domain/markets';
import type { BenchmarksPayload, CpiPoint, PerfSettings, Pt, Series } from '../domain/types';

const MONTH = 30 * 86_400_000;

export function useBenchmarks(fromTs: number | null, extraCoins: string[]) {
  // ماه‌به‌ماه گرد تا کش CDN مشترک بماند
  const from = fromTs === null ? null : Math.floor(fromTs / MONTH) * MONTH;
  const coins = [...extraCoins].sort().join(',');
  return useQuery({
    queryKey: ['perf-benchmarks', from, coins],
    enabled: from !== null,
    staleTime: 3_600_000,
    gcTime: 6 * 3_600_000,
    retry: 1,
    queryFn: () => fetchJson<BenchmarksPayload>(`/api/intel?op=benchmarks&from=${from}${coins ? `&coins=${coins}` : ''}`, { timeoutMs: 45_000 })
  });
}

/** نرخ دلار آزاد = تاریخچهٔ روزانهٔ تتر اپ (همان نرخی که سراسر اپ استفاده می‌کند) */
export function usdtSeries(rates: Record<string, number>, fetchedAt: number | null): Series | undefined {
  const pts: Pt[] = Object.entries(rates).map(([day, v]) => [Date.parse(`${day}T00:00:00Z`), v]);
  if (pts.length < 2) return undefined;
  return { id: 'ir_usd', points: normalizePoints(pts), unit: 'toman', frequency: 'daily', source: SOURCE_FA.ir_usd.name, sourceUrl: SOURCE_FA.ir_usd.url, fetchedAt: fetchedAt ?? Date.now() };
}

export interface CarOption {
  modelId: string;
  name: string;
}

/** مدل‌هایی که در آخرین Snapshot قیمت بازار دارند */
export function carOptions(snaps: CarSnapshot[]): CarOption[] {
  const last = snaps[snaps.length - 1];
  if (!last) return [];
  const m = new Map<string, string>();
  for (const r of last.rows) if (r.market && (r.source ?? 'car.ir') === 'car.ir' && !m.has(r.modelId)) m.set(r.modelId, r.model);
  return [...m.entries()].map(([modelId, name]) => ({ modelId, name })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

/**
 * سری قیمت خودرو برای «خرید در تاریخ شروع»: همان تیپ-سالی که در Snapshot نزدیک به شروع
 * جدیدترین سال با قیمت بازار بود؛ در Snapshotهای بعدی همان ردیف (خودروی کارکرده‌شدهٔ همان سال).
 */
export function carSeries(snaps: CarSnapshot[], modelId: string | null, startTs: number): Series | undefined {
  if (!modelId || !snaps.length) return undefined;
  let base: CarSnapshot | undefined;
  for (const s of snaps) if (s.dateTs <= startTs + 15 * 86_400_000) base = s;
  base ??= snaps.find((s) => s.dateTs - startTs <= 15 * 86_400_000);
  const rows = (base ?? snaps[0]).rows.filter((r) => r.modelId === modelId && r.market && (r.source ?? 'car.ir') === 'car.ir');
  const trim = rows.sort((a, b) => Number(b.year) - Number(a.year))[0];
  if (!trim) return undefined;
  const pts: Pt[] = [];
  for (const s of snaps) {
    const r = s.rows.find((x) => x.id === trim.id && (x.source ?? 'car.ir') === 'car.ir');
    if (r?.market) pts.push([Date.parse(`${s.day}T00:00:00Z`), r.market]);
  }
  if (!pts.length) return undefined;
  const last = snaps[snaps.length - 1];
  return {
    id: 'car',
    points: normalizePoints(pts),
    unit: 'toman',
    frequency: 'snapshot',
    source: 'car.ir — Snapshotهای روزانهٔ بخش بازار خودرو',
    sourceUrl: 'https://car.ir',
    fetchedAt: last.dateTs,
    detail: `${trim.model} مدل ${trim.year}${trim.option ? ` (${trim.option})` : ''}`
  };
}

/** میانهٔ قیمت هر مترمربع یک محله/منطقه در Snapshotهای بازار املاک */
export function propertySeries(snaps: PropertyMarketSnapshot[], key: string): Series | undefined {
  const pts: Pt[] = [];
  let name: string | undefined;
  for (const s of snaps) {
    const hit = s.groupStats?.find((g) => g.neighborhoodKey === key) ?? s.neighborhoodStats.find((n) => n.neighborhoodKey === key);
    if (hit?.stats.medianTomanPerM2 && hit.stats.listingCount >= 3) {
      pts.push([s.dateTs, hit.stats.medianTomanPerM2]);
      name = hit.displayName;
    }
  }
  if (!pts.length) return undefined;
  return {
    id: `prop:${key}`,
    points: normalizePoints(pts),
    unit: 'toman',
    frequency: 'snapshot',
    source: 'دیوار — Snapshotهای بخش بازار املاک اهواز (میانهٔ قیمت هر مترمربع)',
    sourceUrl: 'https://divar.ir',
    fetchedAt: snaps[snaps.length - 1].dateTs,
    detail: name
  };
}

/** فهرست محله‌ها/مناطق موجود در Snapshotها (برای انتخاب) */
export function neighborhoodOptions(snaps: PropertyMarketSnapshot[]): { key: string; name: string }[] {
  const m = new Map<string, string>();
  for (const s of snaps.slice(-3)) {
    for (const g of s.groupStats ?? []) m.set(g.neighborhoodKey, g.displayName);
    for (const n of s.neighborhoodStats) if (!n.neighborhoodKey.startsWith('raw:')) m.set(n.neighborhoodKey, n.displayName);
  }
  return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

/** CPI ایران: نقاط رسمی ورودی کاربر (اگر حداقل ۲ نقطه) وگرنه بانک جهانی (سالانه) */
export function iranCpiSeries(manual: CpiPoint[], wb: Series | undefined): Series | undefined {
  if (manual.length >= 2) {
    const sources = [...new Set(manual.map((p) => p.source.trim()).filter(Boolean))];
    return {
      id: 'ir_cpi',
      points: normalizePoints(manual.map((p) => [p.dateTs, p.index])),
      unit: 'index',
      frequency: 'monthly',
      source: `شاخص رسمی ثبت‌شده توسط شما${sources.length ? ` — ${sources.join('، ')}` : ''}`,
      fetchedAt: Math.max(...manual.map((p) => p.dateTs))
    };
  }
  return wb ? { ...wb, id: 'ir_cpi' } : undefined;
}

export interface MarketSeries {
  series: Record<string, Series>;
  failed: Record<string, string>;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  carOptions: CarOption[];
  neighborhoodOptions: { key: string; name: string }[];
  /** نرخ تتر روز مشخص از تاریخچهٔ اپ */
  rateOn: (ts: number) => number | null;
  refetch: () => void;
}

export function useMarketSeries(startTs: number | null, settings: PerfSettings): MarketSeries {
  const bench = useBenchmarks(startTs, settings.extraCoins);
  const usdt = useUsdtHistoryStore();
  const cars = useCarMarketStore((s) => s.snapshots);
  const props = usePropertyMarketStore((s) => s.snapshots);

  useEffect(() => {
    void useCarMarketStore.getState().hydrate();
    void usePropertyMarketStore.getState().hydrate();
  }, []);
  useEffect(() => {
    if (startTs !== null) void useUsdtHistoryStore.getState().ensure(startTs - 30 * 86_400_000);
  }, [startTs]);

  const usdtS = useMemo(() => usdtSeries(usdt.rates, usdt.fetchedAt), [usdt.rates, usdt.fetchedAt]);

  const series = useMemo(() => {
    const out: Record<string, Series> = { ...(bench.data?.series ?? {}) };
    if (usdtS) out.ir_usd = usdtS;
    const cpi = iranCpiSeries(settings.iranCpi, out.ir_cpi_wb);
    if (cpi) out.ir_cpi = cpi;
    if (startTs !== null) {
      const car = carSeries(cars, settings.carModelId, startTs);
      if (car) out.car = car;
    }
    for (const k of settings.neighborhoods) {
      const p = propertySeries(props, k);
      if (p) out[`prop:${k}`] = p;
    }
    return out;
  }, [bench.data, usdtS, settings.iranCpi, settings.carModelId, settings.neighborhoods, cars, props, startTs]);

  const carOpts = useMemo(() => carOptions(cars), [cars]);
  const nOpts = useMemo(() => neighborhoodOptions(props), [props]);

  return {
    series,
    failed: bench.data?.failed ?? {},
    loading: bench.isLoading || usdt.status === 'loading',
    error: bench.error ? (bench.error instanceof Error ? bench.error.message : 'منبع داده در دسترس نیست') : null,
    fetchedAt: bench.data?.fetchedAt ?? null,
    carOptions: carOpts,
    neighborhoodOptions: nOpts,
    rateOn: (ts: number) => (usdtS ? valueAt(usdtS, ts)?.value ?? null : null),
    refetch: () => void bench.refetch()
  };
}
