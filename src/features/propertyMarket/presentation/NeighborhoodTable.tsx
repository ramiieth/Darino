/** ============================================================
 * Property Market — جدول مناطق (§۹/§۱۰ مأموریت)
 *
 *  تومان/متر · دلار/متر فعلی · دلار آینده (سناریو) · تغییر دلاری ·
 *  موقعیت نسبت به میانه اهواز — با مرتب‌سازی روی همه ستون‌ها.
 * ⚠️ همه اعداد از ویوی سرویس خوانده می‌شوند — هیچ محاسبه‌ای اینجا نیست.
 * ============================================================ */
import { useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { fmtIntLatin, toFaDigits } from '@/shared/utils/formatters';
import { Badge } from '@/shared/components/ui/Badge';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { MARKET_SORT_FA, type MarketSortKey, type NeighborhoodMarketRow } from '../service/propertyMarketService';

/** «۵۰ میلیون» — نمایش فشرده تومان/متر با ارقام فارسی */
export function fmtMillionToman(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
  return `${fa.format(v / 1_000_000)}M`;
}

/** position vs the city median — neutral (above/below the median is not a gain or loss) */
function PositionBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-subtle">—</span>;
  return (
    <Badge tone="neutral" ltr>
      {pct > 0 ? '+' : ''}
      {fmtIntLatin(Math.round(pct * 10) / 10)}%
    </Badge>
  );
}


export function NeighborhoodTable({ rows }: { rows: NeighborhoodMarketRow[] }) {
  const [sortKey, setSortKey] = useState<MarketSortKey>('toman');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const val = (r: NeighborhoodMarketRow): number => {
    switch (sortKey) {
      case 'toman': return r.medianTomanPerM2 ?? -Infinity;
      case 'usd': return r.currentUsdPerM2 ?? -Infinity;
      case 'futureUsd': return r.futureUsdPerM2 ?? -Infinity;
      case 'usdChange': return r.usdChangePercent ?? -Infinity;
      case 'distanceFromMedian': return r.positionVsCityPct === null ? -Infinity : Math.abs(r.positionVsCityPct);
    }
  };
  const sorted = [...rows].sort((a, b) => (dir === 'desc' ? val(b) - val(a) : val(a) - val(b)));

  const toggleSort = (k: MarketSortKey) => {
    if (k === sortKey) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      setDir('desc');
    }
  };

  if (rows.length === 0) {
    return <p className="rounded-field bg-surface-2 py-6 text-center text-sm text-muted">هنوز داده‌ای برای مناطق ثبت نشده است</p>;
  }

  const th = (k: MarketSortKey, label: string) => (
    <th scope="col" className="col-num" aria-sort={sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(k)} className={cn('inline-flex items-center gap-1 hover:text-ink', sortKey === k && 'text-ink')}>
        {label}
        <ArrowDownUp aria-hidden className={cn('h-3 w-3', sortKey !== k && 'opacity-40')} />
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[720px]">
        <caption className="sr-only">مناطق — میانه قیمت هر مترمربع</caption>
        <thead>
          <tr>
            <th scope="col" className="!ps-5">منطقه</th>
            {th('toman', 'میانه تومان/متر')}
            <th scope="col" className="col-num">میانگین</th>
            {th('usd', 'دلار/متر')}
            {th('futureUsd', 'دلار آینده')}
            {th('usdChange', 'تغییر دلاری')}
            <th scope="col" className="!pe-5" aria-sort={sortKey === 'distanceFromMedian' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" onClick={() => toggleSort('distanceFromMedian')} className={cn('inline-flex items-center gap-1 hover:text-ink', sortKey === 'distanceFromMedian' && 'text-ink')}>
                {MARKET_SORT_FA.distanceFromMedian}
                <ArrowDownUp aria-hidden className={cn('h-3 w-3', sortKey !== 'distanceFromMedian' && 'opacity-40')} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.neighborhoodKey}>
              <td className="!ps-5">
                <span className="font-semibold text-ink">{r.displayName}</span>
                <span className="ms-1 text-xs text-muted">({toFaDigits(r.listingCount)} آگهی)</span>
              </td>
              <td className="col-num">{r.medianTomanPerM2 !== null ? fmtMillionToman(r.medianTomanPerM2) : '—'}</td>
              <td className="col-num text-muted">{fmtMillionToman(r.meanTomanPerM2)}</td>
              <td className="col-num"><MoneyValue value={r.currentUsdPerM2} /></td>
              <td className="col-num text-muted"><MoneyValue value={r.futureUsdPerM2} /></td>
              <td className="col-num">
                <PercentValue value={r.usdChangePercent !== null ? Math.round(r.usdChangePercent * 10) / 10 : null} digits={1} />
              </td>
              <td className="!pe-5"><PositionBadge pct={r.positionVsCityPct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
