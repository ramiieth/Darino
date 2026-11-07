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
import { CAR_AVG_ID, PROP_AVG_ID, SOURCE_FA, carMarketId, propertyMarketId } from '../domain/markets';
import type { BenchmarksPayload, CpiPoint, ManualPricePoint, PerfSettings, Pt, Series } from '../domain/types';

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

const DAY = 86_400_000;
const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY;

/**
 * قیمت‌های دستی کاربر برای یک بازار به سری اضافه می‌شوند (همان روز → قیمت دستی جایگزین Snapshot نمی‌شود؛
 * Snapshot اپ مقدم است). منبع سری فهرست منابع دستی را هم نشان می‌دهد.
 */
export function withManual(base: { points: Pt[]; source: string; detail?: string } | null, manual: ManualPricePoint[], market: string): { points: Pt[]; source: string; manualCount: number } | null {
  const mine = manual.filter((m) => m.market === market && m.price > 0 && Number.isFinite(m.price));
  const days = new Set((base?.points ?? []).map(([t]) => dayStart(t)));
  const extra: Pt[] = mine.filter((m) => !days.has(dayStart(m.dateTs))).map((m) => [dayStart(m.dateTs), m.price]);
  const points = normalizePoints([...(base?.points ?? []), ...extra]);
  if (!points.length) return null;
  const srcs = [...new Set(mine.map((m) => m.source.trim()).filter(Boolean))];
  const manualNote = extra.length ? `قیمت دستی ثبت‌شده توسط شما (${toFa(extra.length)} نقطه${srcs.length ? ` — ${srcs.join('، ')}` : ''})` : '';
  return { points, source: [base?.source, manualNote].filter(Boolean).join(' + '), manualCount: extra.length };
}
const toFa = (n: number | string) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** از ۱ آبان ۱۴۰۵ قیمت خودرو از دیوارِ خود اپ (میانهٔ آگهی‌های همان مدل و سال) خوانده می‌شود */
export const DIVAR_CAR_FROM = Date.parse('2026-10-23T00:00:00Z');
/** مدل car.ir → نام مدل‌های دیوار (فقط همان گیربکس؛ سقف شیشه‌ای «P» جداست) */
export const DIVAR_CAR_MATCH: Record<string, RegExp> = {
  '472': /^Peugeot 207i manual(?:-normal)?(?: TU[35])?$/i,
  '473': /^Peugeot 207i automatic(?:-normal)?(?: TU[35])?$/i,
  '761': /^Tara Manual$/i,
  '762': /^Tara Automatic$/i
};

/** قیمت دیوار یک مدل/سال در یک Snapshot: میانگین وزنی (تعداد آگهی) میانه‌های ردیف‌های هم‌نام */
export function divarCarPrice(snap: CarSnapshot, modelId: string, year: string): { price: number; n: number } | null {
  const re = DIVAR_CAR_MATCH[modelId];
  if (!re) return null;
  const hits = snap.rows.filter((r) => r.source === 'divar' && r.year === year && r.market && re.test(r.modelId.replace(/^dv:/, '')));
  const n = hits.reduce((a, r) => a + (r.n ?? 1), 0);
  if (!hits.length || n < 3) return null;
  return { price: Math.round(hits.reduce((a, r) => a + (r.market as number) * (r.n ?? 1), 0) / n), n };
}

/** ضریب اتصال car.ir → دیوار در اولین روز دیوار (با آخرین قیمت car.ir تا همان روز)؛ null = اتصالی لازم نیست */
export function linkFactor(days: { t: number; cir: number | null; dv: number | null }[]): number | null {
  let lastCir: number | null = null;
  for (const d of days) {
    if (d.cir !== null) lastCir = d.cir;
    if (d.dv !== null) return lastCir && lastCir > 0 ? d.dv / lastCir : null;
  }
  return null;
}

/**
 * سری «قیمت بازار» (نه کارخانه) یک مدل خودرو برای «خرید در تاریخ شروع»: همان تیپ-سالی که در Snapshot نزدیک به شروع
 * جدیدترین سال با قیمت بازار بود؛ در Snapshotهای بعدی همان ردیف (خودروی کارکرده‌شدهٔ همان سال) + قیمت‌های دستی.
 */
export function carSeries(snaps: CarSnapshot[], modelId: string | null, startTs: number, manual: ManualPricePoint[] = []): Series | undefined {
  if (!modelId) return undefined;
  const id = carMarketId(modelId);
  let base: CarSnapshot | undefined;
  for (const s of snaps) if (s.dateTs <= startTs + 15 * DAY) base = s;
  base ??= snaps.find((s) => s.dateTs - startTs <= 15 * DAY) ?? snaps[0];
  const rows = (base?.rows ?? []).filter((r) => r.modelId === modelId && r.market && (r.source ?? 'car.ir') === 'car.ir');
  const trim = rows.sort((a, b) => Number(b.year) - Number(a.year))[0];
  // روز به روز: قیمت car.ir همان تیپ-سال و (از آبان ۱۴۰۵) قیمت دیوار همان مدل و سال
  const days: { t: number; cir: number | null; dv: number | null }[] = [];
  if (trim) {
    for (const s of snaps) {
      const t = Date.parse(`${s.day}T00:00:00Z`);
      const r = s.rows.find((x) => x.id === trim.id && (x.source ?? 'car.ir') === 'car.ir');
      days.push({ t, cir: r?.market ?? null, dv: t >= DIVAR_CAR_FROM ? divarCarPrice(s, modelId, trim.year)?.price ?? null : null });
    }
  }
  /**
   * زنجیره‌سازی (بدون پرش): در اولین روزی که دیوار قیمت دارد، ضریب = دیوار ÷ car.ir (همان روز یا آخرین قبل از آن).
   * قیمت‌های قبل از آبان (car.ir و دستی) و روزهای بعد از آبان که دیوار آگهی کافی نداشت × ضریب، تا سطح سری با دیوار یکی شود؛
   * تغییرات واقعی قیمت (نسبت‌ها) دست نمی‌خورد و قیمت فعلی دقیقاً دیوار می‌ماند.
   */
  const factor = linkFactor(days);
  const scale = (v: number) => Math.round(v * (factor ?? 1));
  const pts: Pt[] = [];
  for (const d of days) {
    if (d.dv !== null) pts.push([d.t, d.dv]);
    else if (d.cir !== null) pts.push([d.t, scale(d.cir)]);
  }
  const scaledManual = factor === null ? manual : manual.map((m) => (m.market === id && m.dateTs < DIVAR_CAR_FROM ? { ...m, price: scale(m.price) } : m));
  const factorFa = factor === null ? '' : ` — قیمت‌های قبل از آبان ۱۴۰۵ با ضریب ×${toFa(factor.toFixed(3))} به سطح دیوار هم‌تراز شده‌اند (بدون پرش؛ درصد تغییرها همان است)`;
  const baseSrc = factor !== null
    ? `car.ir (قیمت بازار، نه کارخانه) تا مهر ۱۴۰۵ + دیوار اپ دارینو از آبان ۱۴۰۵ (میانهٔ آگهی‌های همان مدل و سال، تهران)${factorFa}`
    : 'car.ir — قیمت بازار (نه کارخانه)، Snapshotهای روزانهٔ بخش بازار خودرو';
  const merged = withManual(pts.length ? { points: pts, source: baseSrc } : null, scaledManual, id);
  if (!merged) return undefined;
  const last = snaps[snaps.length - 1];
  return {
    id,
    points: merged.points,
    unit: 'toman',
    frequency: 'snapshot',
    source: merged.source,
    sourceUrl: 'https://car.ir',
    fetchedAt: last?.dateTs ?? merged.points[merged.points.length - 1][0],
    detail: trim ? `قیمت بازار ${trim.model.trim()} مدل ${trim.year}${trim.option ? ` (${trim.option})` : ''}` : 'فقط قیمت‌های دستی'
  };
}

/**
 * قیمت هر مترمربع یک محله/منطقه در Snapshotهای بازار املاک — چارک بالا (۷۵٪ آگهی‌ها ارزان‌ترند)،
 * نه میانه یا میانگین، تا قیمت واحدهای بهتر محله را نشان دهد. + قیمت‌های دستی.
 */
export function propertySeries(snaps: PropertyMarketSnapshot[], key: string, manual: ManualPricePoint[] = []): Series | undefined {
  const id = propertyMarketId(key);
  const pts: Pt[] = [];
  let name: string | undefined;
  for (const s of snaps) {
    const hit = s.groupStats?.find((g) => g.neighborhoodKey === key) ?? s.neighborhoodStats.find((n) => n.neighborhoodKey === key);
    if (hit?.stats.p75TomanPerM2 && hit.stats.listingCount >= 3) {
      pts.push([s.dateTs, hit.stats.p75TomanPerM2]);
      name = hit.displayName;
    }
  }
  const merged = withManual(pts.length ? { points: pts, source: 'دیوار — Snapshotهای بخش بازار املاک اهواز (چارک بالای قیمت هر مترمربع)' } : null, manual, id);
  if (!merged) return undefined;
  return {
    id,
    points: merged.points,
    unit: 'toman',
    frequency: 'snapshot',
    source: merged.source,
    sourceUrl: 'https://divar.ir',
    fetchedAt: snaps.length ? snaps[snaps.length - 1].dateTs : merged.points[merged.points.length - 1][0],
    detail: `${name ?? key} — چارک بالای قیمت هر مترمربع`
  };
}

/**
 * میانگین هم‌وزن چند سری: از اولین روزی که همه داده دارند، شاخص = میانگین (قیمت ÷ قیمت روز اول) هر جزء
 * × میانگین قیمت‌های روز اول (تا عدد در مقیاس تومان بماند). فقط روزهایی که همهٔ اجزا قیمت معتبر دارند.
 */
export function averageSeries(id: string, comps: Series[], source: string, detail: string): Series | undefined {
  if (comps.length < 2) return undefined;
  const days = [...new Set(comps.flatMap((c) => c.points.map(([t]) => t)))].sort((a, b) => a - b);
  let base: number[] | null = null;
  const pts: Pt[] = [];
  for (const t of days) {
    const vals = comps.map((c) => valueAt(c, t)?.value ?? null);
    if (vals.some((v) => v === null || !(v > 0))) continue;
    const vs = vals as number[];
    base ??= vs;
    const b = base;
    const idx = vs.reduce((acc, v, i) => acc + v / b[i], 0) / vs.length;
    pts.push([t, idx * (b.reduce((x, y) => x + y, 0) / b.length)]);
  }
  if (!pts.length) return undefined;
  return { id, points: normalizePoints(pts), unit: 'toman', frequency: 'snapshot', source, fetchedAt: Math.max(...comps.map((c) => c.fetchedAt)), detail };
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
    const manual = settings.manualPrices ?? [];
    const carComps: Series[] = [];
    if (startTs !== null) {
      for (const id of settings.carModelIds ?? []) {
        const car = carSeries(cars, id, startTs, manual);
        if (car) { out[car.id] = car; carComps.push(car); }
      }
    }
    const avgCar = averageSeries(CAR_AVG_ID, carComps, 'میانگین هم‌وزن قیمت بازار مدل‌های منتخب (car.ir + قیمت‌های دستی)', `${toFa(carComps.length)} مدل`);
    if (avgCar) out[CAR_AVG_ID] = avgCar;
    const propComps: Series[] = [];
    for (const k of settings.neighborhoods) {
      const p = propertySeries(props, k, manual);
      if (p) { out[p.id] = p; propComps.push(p); }
    }
    const avgProp = averageSeries(PROP_AVG_ID, propComps, 'میانگین هم‌وزن چارک بالای قیمت هر مترمربع محله‌های منتخب (دیوار + قیمت‌های دستی)', `${toFa(propComps.length)} محله`);
    if (avgProp) out[PROP_AVG_ID] = avgProp;
    return out;
  }, [bench.data, usdtS, settings.iranCpi, settings.carModelIds, settings.manualPrices, settings.neighborhoods, cars, props, startTs]);

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
