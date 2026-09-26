/** ============================================================
 * Property Market — مرور آگهی‌ها (داده پشت آمار)
 *
 *  فیلتر منبع/محله + مرتب‌سازی؛ هر ردیف به آگهی اصلی لینک است.
 *  ⚠️ فقط نمایش — آمار از لایه سرویس/Snapshot می‌آید.
 * ============================================================ */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Select } from '@/shared/components/ui/Input';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { LISTING_SOURCE_FA, type ListingSource } from '../domain/types';
import { neighborhoodDisplayName } from '../data/catalog';
import { AGE_BANDS, AREA_BANDS, type AgeBand, type AreaBand } from '../domain/segments';
import type { ListingView } from '../service/propertyMarketService';
import { fmtMillionToman } from './NeighborhoodTable';

type SourceFilter = 'all' | ListingSource;
type SortKey = 'recent' | 'ppm-asc' | 'ppm-desc' | 'total-asc' | 'total-desc';
export type AgeFilter = 'all' | AgeBand | 'first-key';
export type AreaFilter = 'all' | AreaBand;

const PAGE = 25;

/** «۳٫۱ میلیارد» / «۸۵۰ میلیون» — قیمت کل فشرده */
export function fmtTotalToman(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });
  return v >= 1_000_000_000 ? `${fa.format(v / 1_000_000_000)} میلیارد` : `${fa.format(Math.round(v / 1_000_000))} میلیون`;
}

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
  onExactArea
}: {
  /** فیلتر متراژ دقیق (از جدول «متراژ دقیق») */
  exactArea?: number | null;
  onExactArea?: (v: number | null) => void;
  listings: ListingView[];
  age?: AgeFilter;
  area?: AreaFilter;
  onAge?: (v: AgeFilter) => void;
  onArea?: (v: AreaFilter) => void;
}) {
  const [source, setSource] = useState<SourceFilter>('all');
  const [localAge, setLocalAge] = useState<AgeFilter>(age);
  const [localArea, setLocalArea] = useState<AreaFilter>(area);
  const ageF = onAge ? age : localAge;
  const areaF = onArea ? area : localArea;
  const setAge = onAge ?? setLocalAge;
  const setArea = onArea ?? setLocalArea;
  const [nb, setNb] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [limit, setLimit] = useState(PAGE);

  const neighborhoods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of listings) if (l.neighborhoodKey) counts.set(l.neighborhoodKey, (counts.get(l.neighborhoodKey) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, n]) => ({ key, n, name: neighborhoodDisplayName(key) }))
      .sort((a, b) => b.n - a.n);
  }, [listings]);

  const bySource = useMemo(() => {
    const c: Record<ListingSource, number> = { divar: 0, sheypoor: 0 };
    for (const l of listings) if (l.source === 'divar' || l.source === 'sheypoor') c[l.source] += 1;
    return c;
  }, [listings]);

  const rows = useMemo(() => {
    const f = listings.filter(
      (l) =>
        (source === 'all' || l.source === source) &&
        (nb === 'all' || l.neighborhoodKey === nb) &&
        (ageF === 'all' || (ageF === 'first-key' ? l.firstKey === true : l.ageBand === ageF)) &&
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
  }, [listings, source, nb, sort, ageF, areaF, exactArea]);

  if (listings.length === 0) {
    return <p className="rounded-field bg-surface-2 py-6 text-center text-sm text-muted">هنوز آگهی‌ای ثبت نشده است</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
        <ChipGroup<SourceFilter>
          label="منبع"
          value={source}
          onChange={(v) => {
            setSource(v);
            setLimit(PAGE);
          }}
          options={[
            { value: 'all', label: 'همه', badge: listings.length },
            { value: 'divar', label: LISTING_SOURCE_FA.divar, badge: bySource.divar },
            { value: 'sheypoor', label: LISTING_SOURCE_FA.sheypoor, badge: bySource.sheypoor }
          ]}
        />
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
              aria-label="محله"
              value={nb}
              onChange={(e) => {
                setNb(e.target.value);
                setLimit(PAGE);
              }}
            >
              <option value="all">همه محله‌ها</option>
              {neighborhoods.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.name} ({toFaDigits(n.n)})
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select
              aria-label="سن بنا"
              value={ageF}
              onChange={(e) => {
                setAge(e.target.value as AgeFilter);
                setLimit(PAGE);
              }}
            >
              <option value="all">هر سن بنا</option>
              <option value="first-key">کلید اول</option>
              {AGE_BANDS.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
              <option value="unknown">سن نامشخص</option>
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
                  {l.ageYears !== null && <> · {l.ageYears === 0 ? 'نوساز' : `${toFaDigits(l.ageYears)} ساله`}</>}
                  {l.firstKey && <> · <span className="font-semibold text-accent">کلید اول</span></>}
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
                  <span className="text-2xs font-normal text-muted"> /متر · </span>
                  <span className="text-xs font-semibold"><MoneyValue value={l.pricePerSqmUsd} /></span>
                </p>
                <p className="text-xs text-muted">
                  کل {fmtTotalToman(l.totalPriceToman)} · <MoneyValue value={l.totalPriceUsd} />
                </p>
                {(l.source === 'divar' || l.source === 'sheypoor') && (
                  <Badge tone={l.source === 'divar' ? 'brand' : 'info'} className="mt-1">{LISTING_SOURCE_FA[l.source]}</Badge>
                )}
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
