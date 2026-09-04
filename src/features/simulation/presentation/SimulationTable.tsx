/**
 * جدول شبیه‌سازی — ستون‌های استاندارد الزامی:
 *   Asset | Buy/Reference Price | Current Price | Value ($) | Profit/Loss | Vs ETH ($)
 *
 * بهبودهای ممیزی:
 *  - مرتب‌سازی با کلیک روی هدر (aria-sort + نشانگر ▲▼)
 *  - گروه‌بندی اختیاری با ردیف‌های سرگروه
 *  - ایزوله LTR ارقام (num-ltr) + سطوح مات
 *  - کلیک روی ردیف → شیت جزئیات (Drill-Down)
 *  - دسترس‌پذیری: scope/caption/aria-live
 */
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, Info } from 'lucide-react';
import type { SimAssetRow, TimelineResult } from '@/shared/types';
import { fmtUSD, fmtPct, fmtPctEn, pnlClass } from '@/shared/utils/formatters';
import { SourceBadge } from '@/shared/components/ui/SourceBadge';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';
import type { SortKey } from './FiltersBar';

export type SortDir = 'asc' | 'desc' | null;

interface GroupSpec {
  label: string;
  rows: SimAssetRow[];
  value: number;
  count: number;
}

interface Props {
  result: TimelineResult;
  visibleRows: SimAssetRow[];
  /** وقتی تعریف شود، جدول گروه‌بندی‌شده رندر می‌شود */
  groups?: GroupSpec[] | null;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  onSelectRow: (row: SimAssetRow) => void;
}

const HEADERS: { key: SortKey | null; label: string; col: string }[] = [
  { key: 'name', label: t('colAsset'), col: 'asset' },
  { key: 'buy', label: t('colBuyPrice'), col: 'buy' },
  { key: 'current', label: t('colCurrentPrice'), col: 'current' },
  { key: 'value', label: t('colValue'), col: 'value' },
  { key: 'profit', label: t('colProfitLoss'), col: 'pl' },
  { key: 'vseth', label: t('colVsEth'), col: 'vseth' }
];

export function SimulationTable({ result, visibleRows, groups, sort, dir, onSort, onSelectRow }: Props) {
  const rows = groups ? groups.flatMap((g) => g.rows) : visibleRows;

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <DataStatusStrip result={result} />

      <div className="flex items-start gap-2 border-b border-line/10 px-4 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <p className="text-[11px] font-medium leading-5 text-muted">{t('rowSemanticsNote')}</p>
      </div>

      <div className="max-h-[62dvh] overflow-auto overscroll-contain bg-card">
        <table className="sim-table min-w-[680px] text-start">
          <caption className="sr-only">جدول شبیه‌سازی سرمایه‌گذاری</caption>
          <thead>
            <tr>
              {HEADERS.map((h) => {
                const active = h.key !== null && sort === h.key;
                const ariaSort =
                  active && dir === 'asc'
                    ? 'ascending'
                    : active && dir === 'desc'
                      ? 'descending'
                      : 'none';
                return (
                  <th
                    key={h.key ?? h.label}
                    scope="col"
                    aria-sort={h.key ? ariaSort : undefined}
                    className={cn('sticky start-0 z-30 !text-start', h.key === 'name' && 'sticky')}
                  >
                    {h.key ? (
                      <button
                        onClick={() => onSort(h.key as SortKey)}
                        className="flex items-center gap-1 transition-colors hover:text-ink"
                      >
                        {h.label}
                        {active && dir === 'asc' ? (
                          <ChevronUp className="h-3 w-3 text-accent" />
                        ) : active && dir === 'desc' ? (
                          <ChevronDown className="h-3 w-3 text-accent" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      h.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="!py-10 text-center">
                  <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-warn" />
                  <p className="text-xs font-bold text-muted">{t('noAssetsFound')}</p>
                </td>
              </tr>
            )}

            {groups
              ? groups.map((g) => (
                  <GroupRows key={g.label} group={g} onSelectRow={onSelectRow} />
                ))
              : rows.map((row, i) => (
                  <Row key={row.key} row={row} index={i} onSelectRow={onSelectRow} />
                ))}
          </tbody>
        </table>
      </div>

      {result.totals.naCount > 0 && (
        <div className="flex items-center gap-2 border-t border-line/10 px-4 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn" />
          <p className="text-[11px] font-medium leading-5 text-muted">{t('naNotice')}</p>
        </div>
      )}
    </div>
  );
}

function GroupRows({ group, onSelectRow }: { group: GroupSpec; onSelectRow: (r: SimAssetRow) => void }) {
  return (
    <>
      <tr className="bg-accent/[0.06]">
        <td colSpan={6} className="!border-b !border-line/10 !px-4 !py-2">
          <span className="flex items-center gap-2 text-[11px] font-extrabold text-ink">
            {group.label}
            <span className="badge bg-accent/15 text-accent">{group.count}</span>
            <span className="num-ltr ms-auto text-[11px] font-bold text-muted">
              Σ {fmtUSD(group.value)}
            </span>
          </span>
        </td>
      </tr>
      {group.rows.map((row, i) => (
        <Row key={row.key} row={row} index={i} onSelectRow={onSelectRow} />
      ))}
    </>
  );
}

function Row({
  row,
  index,
  onSelectRow
}: {
  row: SimAssetRow;
  index: number;
  onSelectRow: (r: SimAssetRow) => void;
}) {
  const na = row.currentPrice === null || row.buyPrice === null;

  return (
    <motion.tr
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.004, 0.3) }}
      onClick={() => onSelectRow(row)}
      className={cn(
        'group cursor-pointer transition-colors hover:bg-line/[0.04]',
        na && 'opacity-60'
      )}
    >
      {/* دارایی: لوگو + نماد + نام فارسی */}
      <td className="sticky start-0 z-10 bg-card group-hover:bg-line/[0.04]">
        <div className="flex min-w-[150px] items-center gap-2.5">
          <AssetLogo symbol={row.symbol} kind={row.kind} size={32} />
          <div className="min-w-0">
            <p className="tnum text-[13px] font-extrabold text-ink">{row.symbol}</p>
            <p className="max-w-[140px] truncate text-[11px] font-medium text-muted">{row.nameFa}</p>
          </div>
        </div>
      </td>

      <td className="num-ltr text-muted">
        {row.unit === 'pct' ? fmtPctEn(row.buyPrice) : fmtUSD(row.buyPrice)}
      </td>

      <td>
        <div className="flex flex-col items-start gap-1">
          <span className="num-ltr font-bold text-ink">
            {row.unit === 'pct' ? fmtPctEn(row.currentPrice) : fmtUSD(row.currentPrice)}
          </span>
          <SourceBadge source={row.source} />
        </div>
      </td>

      <td className="num-ltr font-extrabold text-ink">{fmtUSD(row.valueUsd)}</td>

      <td className={cn('num-ltr font-bold', pnlClass(row.profitLoss))}>
        {row.profitLoss !== null ? fmtUSD(row.profitLoss) : 'N/A'}
      </td>

      <td>
        <div className="flex flex-col items-start gap-1">
          <span className={cn('num-ltr font-bold', pnlClass(row.vsEth))}>{fmtUSD(row.vsEth)}</span>
          {row.changePct !== null && (
            <span className={cn('num-ltr text-[11px] font-bold', pnlClass(row.changePct))}>
              {fmtPct(row.changePct)}
            </span>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

/** نوار وضعیت منبع داده — با aria-live برای به‌روزرسانی‌ها */
function DataStatusStrip({ result }: { result: TimelineResult }) {
  const { liveCount, snapshotCount, naCount, totalRows } = result.totals;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/10 px-4 py-2.5">
      <div className="flex items-center gap-2" aria-live="polite">
        <span className="text-[11px] font-bold text-muted">{t('source')}:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="badge bg-positive/10 text-positive">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            {t('live')} {liveCount}
          </span>
          <span className="badge bg-warn/10 text-warn">{t('snapshot')} {snapshotCount}</span>
          <span className="badge bg-muted/10 text-muted">N/A {naCount}</span>
        </div>
      </div>
      <span className="num-ltr shrink-0 text-[11px] font-bold text-muted">
        {totalRows} {t('rowsCount')}
      </span>
    </div>
  );
}
