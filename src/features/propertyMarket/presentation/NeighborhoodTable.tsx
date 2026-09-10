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
import { fmtIntLatin, fmtUSD, fmtPct } from '@/shared/utils/formatters';
import { MARKET_SORT_FA, type MarketSortKey, type NeighborhoodMarketRow } from '../service/propertyMarketService';

/** «۵۰ میلیون» — نمایش فشرده تومان/متر با ارقام فارسی */
export function fmtMillionToman(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
  return `${fa.format(v / 1_000_000)}M`;
}

function PositionBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted">—</span>;
  const cls = pct > 5 ? 'bg-negative/10 text-negative' : pct < -5 ? 'bg-positive/10 text-positive' : 'bg-line/20 text-muted';
  return (
    <span className={cn('num-ltr rounded-full px-1.5 py-0.5 text-[8px] font-extrabold', cls)}>
      {pct >= 0 ? '+' : ''}{fmtIntLatin(Math.round(pct * 10) / 10)}٪
    </span>
  );
}

const SORT_KEYS: MarketSortKey[] = ['toman', 'usd', 'futureUsd', 'usdChange', 'distanceFromMedian'];

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
    return <p className="py-6 text-center text-[10px] font-bold text-muted">هنوز داده‌ای برای مناطق ثبت نشده است</p>;
  }

  return (
    <div className="space-y-2">
      {/* پریست‌های رتبه‌بندی سریع */}
      <div className="flex flex-wrap gap-1.5">
        {SORT_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => toggleSort(k)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-extrabold transition-colors',
              sortKey === k
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-line/15 bg-card text-muted hover:text-ink'
            )}
          >
            {sortKey === k && <ArrowDownUp className="h-2.5 w-2.5" />}
            {MARKET_SORT_FA[k]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line/10">
        <table className="w-full min-w-[560px] text-right">
          <thead>
            <tr className="border-b border-line/10 bg-surface-2/50 text-[8px] font-extrabold text-muted">
              <th className="px-2 py-2">منطقه</th>
              <th className="px-2 py-2">تومان/متر</th>
              <th className="px-2 py-2">دلار/متر</th>
              <th className="px-2 py-2">دلار آینده</th>
              <th className="px-2 py-2">تغییر دلاری</th>
              <th className="px-2 py-2">نسبت به میانه</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.neighborhoodKey} className="border-b border-line/5 text-[10px] font-bold last:border-0">
                <td className="px-2 py-2">
                  <span className="text-ink">{r.displayName}</span>
                  <span className="mr-1 text-[7px] font-medium text-muted">
                    ({fmtIntLatin(r.listingCount)} آگهی)
                  </span>
                </td>
                <td className="num-ltr px-2 py-2 text-ink">
                  {r.medianTomanPerM2 !== null ? fmtMillionToman(r.medianTomanPerM2) : '—'}
                </td>
                <td className="num-ltr px-2 py-2 text-ink">
                  {r.currentUsdPerM2 !== null ? fmtUSD(r.currentUsdPerM2) : '—'}
                </td>
                <td className="num-ltr px-2 py-2 text-indigo-300">
                  {r.futureUsdPerM2 !== null ? fmtUSD(r.futureUsdPerM2) : '—'}
                </td>
                <td className={cn('num-ltr px-2 py-2 font-extrabold', r.usdChangePercent === null ? 'text-muted' : r.usdChangePercent >= 0 ? 'text-positive' : 'text-negative')}>
                  {r.usdChangePercent !== null ? fmtPct(Math.round(r.usdChangePercent * 10) / 10) : '—'}
                </td>
                <td className="px-2 py-2">
                  <PositionBadge pct={r.positionVsCityPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
