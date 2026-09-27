/** ============================================================
 * Property Market — مرور آگهی‌ها (داده پشت آمار)
 *
 *  فیلتر منطقه/سال ساخت/متراژ + مرتب‌سازی؛ هر ردیف به آگهی دیوار لینک است.
 *  ⚠️ فقط نمایش — آمار از لایه سرویس/Snapshot می‌آید.
 * ============================================================ */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Input';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { areaKeyOf, neighborhoodDisplayName } from '../data/catalog';
import { AGE_BANDS, AREA_BANDS, ageBandLabel, ageBandSub, type AgeBand, type AreaBand } from '../domain/segments';
import type { ListingView } from '../service/propertyMarketService';
import { fmtMillionToman, fmtTotalToman, fmtUsdFa } from './format';

type SortKey = 'recent' | 'ppm-asc' | 'ppm-desc' | 'total-asc' | 'total-desc';
export type AgeFilter = 'all' | AgeBand;
export type AreaFilter = 'all' | AreaBand;

const PAGE = 25;

/** مبنای «جدیدترین»: آخرین به‌روزرسانی آگهی در منبع */
function updatedOf(l: ListingView): number {
  return l.sourceUpdatedAt ?? l.listedAt ?? l.scrapedAt;
}

export function ListingsExplorer({
  listings,
  age = 'all',
  area = 'all',
  onAge,
  onArea,
  exactArea = null,
  onExactArea,
  place = 'all',
  onPlace,
  jalaliYear
}: {
  /** سال شمسی جاری — برچسب فیلتر سال ساخت */
  jalaliYear: number;
  /** فیلتر منطقه (کلید منطقه) */
  place?: string;
  onPlace?: (v: string) => void;
  /** فیلتر متراژ دقیق (از جدول «متراژ دقیق») */
  exactArea?: number | null;
  onExactArea?: (v: number | null) => void;
  listings: ListingView[];
  age?: AgeFilter;
  area?: AreaFilter;
  onAge?: (v: AgeFilter) => void;
  onArea?: (v: AreaFilter) => void;
}) {
  const [localAge, setLocalAge] = useState<AgeFilter>(age);
  const [localArea, setLocalArea] = useState<AreaFilter>(area);
  const ageF = onAge ? age : localAge;
  const areaF = onArea ? area : localArea;
  const setAge = onAge ?? setLocalAge;
  const setArea = onArea ?? setLocalArea;
  const [localPlace, setLocalPlace] = useState<string>(place);
  const nb = onPlace ? place : localPlace;
  const setNb = onPlace ?? setLocalPlace;
  const [sort, setSort] = useState<SortKey>('recent');
  const [limit, setLimit] = useState(PAGE);

  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of listings) {
      const k = areaKeyOf(l.neighborhoodKey);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, n]) => ({ key, n, name: neighborhoodDisplayName(key) }))
      .sort((a, b) => b.n - a.n);
  }, [listings]);

  const rows = useMemo(() => {
    const f = listings.filter(
      (l) =>
        (nb === 'all' || areaKeyOf(l.neighborhoodKey) === nb) &&
        (ageF === 'all' || l.ageBand === ageF) &&
        (areaF === 'all' || l.areaBand === areaF) &&
        (exactArea === null || (l.areaSqm !== null && Math.round(l.areaSqm) === exactArea))
    );
    const ppm = (l: ListingView) => l.pricePerSqmToman ?? 0;
    const tot = (l: ListingView) => l.totalPriceToman ?? 0;
    return [...f].sort((a, b) => {
      switch (sort) {
        case 'recent': return updatedOf(b) - updatedOf(a);
        case 'ppm-asc': return ppm(a) - ppm(b);
        case 'ppm-desc': return ppm(b) - ppm(a);
        case 'total-asc': return tot(a) - tot(b);
        case 'total-desc': return tot(b) - tot(a);
      }
    });
  }, [listings, nb, sort, ageF, areaF, exactArea]);

  if (listings.length === 0) {
    return <p className="rounded-field bg-surface-2 py-6 text-center text-sm text-muted">هنوز آگهی‌ای ثبت نشده است</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
        <span className="text-xs text-muted">{toFaDigits(rows.length)} آگهی</span>
        {exactArea !== null && (
          <button
            type="button"
            onClick={() => onExactArea?.(null)}
            className="flex h-8 items-center gap-1 rounded-control border border-accent bg-accent-soft px-3 text-xs font-semibold text-accent"
            aria-label="حذف فیلتر متراژ دقیق"
          >
            متراژ {toFaDigits(exactArea)} متر ✕
          </button>
        )}
        <div className="flex flex-wrap gap-2 md:ms-auto">
          <div className="w-40">
            <Select
              aria-label="منطقه"
              value={nb}
              onChange={(e) => {
                setNb(e.target.value);
                setLimit(PAGE);
              }}
            >
              <option value="all">همه مناطق</option>
              {nb !== 'all' && !areas.some((n) => n.key === nb) && <option value={nb}>{neighborhoodDisplayName(nb)}</option>}
              {areas.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.name} ({toFaDigits(n.n)})
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select
              aria-label="سال ساخت"
              value={ageF}
              onChange={(e) => {
                setAge(e.target.value as AgeFilter);
                setLimit(PAGE);
              }}
            >
              <option value="all">هر سال ساخت</option>
              {AGE_BANDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {ageBandLabel(b.key, jalaliYear)} ({ageBandSub(b.key)})
                </option>
              ))}
              <option value="unknown">سال ساخت نامشخص</option>
            </Select>
          </div>
          <div className="w-36">
            <Select
              aria-label="متراژ"
              value={areaF}
              onChange={(e) => {
                setArea(e.target.value as AreaFilter);
                setLimit(PAGE);
              }}
            >
              <option value="all">هر متراژ</option>
              {AREA_BANDS.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select aria-label="مرتب‌سازی" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recent">جدیدترین</option>
              <option value="ppm-asc">ارزان‌ترین (هر متر)</option>
              <option value="ppm-desc">گران‌ترین (هر متر)</option>
              <option value="total-asc">ارزان‌ترین (قیمت کل)</option>
              <option value="total-desc">گران‌ترین (قیمت کل)</option>
            </Select>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">آگهی‌ای با این فیلتر نیست</p>
      ) : (
        <ul className="divide-y divide-divider">
          {rows.slice(0, limit).map((l) => (
            <li key={l.token} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex max-w-full items-center gap-1 text-sm font-semibold text-ink hover:text-accent"
                >
                  <span className="truncate">{l.title ?? 'آگهی بدون عنوان'}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
                </a>
                <p className="mt-0.5 text-xs text-muted">
                  {neighborhoodDisplayName(l.neighborhoodKey)}
                  {l.areaSqm !== null && <> · {toFaDigits(l.areaSqm)} متر</>}
                  {l.rooms !== null && <> · {l.rooms === 0 ? 'بدون اتاق' : `${toFaDigits(l.rooms)} خواب`}</>}
                  {l.yearBuilt !== null && <> · ساخت {toFaDigits(l.yearBuilt)}</>}
                </p>
                <p className="mt-0.5 text-2xs text-subtle">
                  {l.sourceUpdatedAt ? <>به‌روزرسانی آگهی: {fmtRelativeAge(l.sourceUpdatedAt)}</> : <>دیده‌شده: {fmtRelativeAge(l.scrapedAt)}</>}
                  {l.listedAt && l.sourceUpdatedAt && l.sourceUpdatedAt - l.listedAt > 86_400_000 && (
                    <> · انتشار اولیه: {fmtRelativeAge(l.listedAt)}</>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold text-ink">
                  {fmtMillionToman(l.pricePerSqmToman)}
                  <span className="text-2xs font-normal text-muted"> هر متر</span>
                </p>
                <p className="text-xs font-semibold text-ink">{fmtUsdFa(l.pricePerSqmUsd)}</p>
                <p className="text-xs text-muted">
                  کل {fmtTotalToman(l.totalPriceToman)} · {fmtUsdFa(l.totalPriceUsd)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && (
        <div className="border-t border-divider px-4 py-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
            نمایش بیشتر ({toFaDigits(rows.length - limit)} آگهی دیگر)
          </Button>
        </div>
      )}
    </div>
  );
}
