/**
 * Simulation table — required columns:
 *   asset | buy/reference price | current price | value | profit/loss | vs ETH
 *
 *  desktop: sortable table (aria-sort), optional group header rows, sticky asset column
 *  phones:  list rows (value + P/L), tap → detail sheet
 *  numbers LTR-isolated; unavailable → "—"; source counts in the status line
 */
import { ArrowDown, ArrowUp, ArrowUpDown, Info } from 'lucide-react';
import type { SimAssetRow, TimelineResult } from '@/shared/types';
import { Surface } from '@/shared/components/ui/GlassCard';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge, StatusDot } from '@/shared/components/ui/Badge';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
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
  groups?: GroupSpec[] | null;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  onSelectRow: (row: SimAssetRow) => void;
}

const HEADERS: { key: SortKey; label: string; num: boolean }[] = [
  { key: 'name', label: t('colAsset'), num: false },
  { key: 'buy', label: t('colBuyPrice'), num: true },
  { key: 'current', label: t('colCurrentPrice'), num: true },
  { key: 'value', label: t('colValue'), num: true },
  { key: 'profit', label: t('colProfitLoss'), num: true },
  { key: 'vseth', label: t('colVsEth'), num: true }
];

function Price({ row, v }: { row: SimAssetRow; v: number | null }) {
  return row.unit === 'pct' ? <PercentValue value={v} signed={false} tone="none" /> : <MoneyValue value={v} />;
}

export function SimulationTable({ result, visibleRows, groups, sort, dir, onSort, onSelectRow }: Props) {
  const rows = groups ? groups.flatMap((g) => g.rows) : visibleRows;
  const { liveCount, snapshotCount, naCount, totalRows } = result.totals;
  const sections = groups ?? [{ label: '', rows: visibleRows, value: 0, count: visibleRows.length }];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-live="polite">
        <span className="rounded-full border border-divider bg-surface-2/60 px-2.5 py-0.5 font-semibold text-ink">
          {toFaDigits(rows.length)} از {toFaDigits(totalRows)} {t('rowsCount')}
        </span>
        <span className="inline-flex items-center rounded-full border border-divider bg-card px-2.5 py-0.5">
          <StatusDot tone="gain" label={`${t('live')} ${toFaDigits(liveCount)}`} className="font-normal" />
        </span>
        {snapshotCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-divider bg-card px-2.5 py-0.5">
            <StatusDot tone="warn" label={`${t('snapshot')} ${toFaDigits(snapshotCount)}`} className="font-normal" />
          </span>
        )}
        {naCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-divider bg-card px-2.5 py-0.5">
            <StatusDot tone="neutral" label={`بدون داده ${toFaDigits(naCount)}`} className="font-normal" />
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState message={t('noAssetsFound')} />
      ) : (
        <Surface className="overflow-hidden">
          {/* desktop */}
          <div className="hidden max-h-[70dvh] overflow-auto md:block">
            <table className="data-table min-w-[720px]">
              <caption className="sr-only">جدول شبیه‌سازی سرمایه‌گذاری</caption>
              <thead>
                <tr>
                  {HEADERS.map((h, i) => {
                    const active = sort === h.key && dir !== null;
                    const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <th
                        key={h.key}
                        scope="col"
                        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={cn(h.num && 'col-num', i === 0 && 'sticky start-0 z-20 !ps-5', i === HEADERS.length - 1 && '!pe-5')}
                      >
                        <button
                          type="button"
                          onClick={() => onSort(h.key)}
                          className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}
                        >
                          {h.label}
                          <Icon aria-hidden className={cn('h-3 w-3', !active && 'opacity-40')} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {sections.map((g) => (
                <tbody key={g.label || 'all'}>
                  {groups && (
                    <tr>
                      <th scope="rowgroup" colSpan={6} className="bg-surface-2/60 !ps-5 text-start">
                        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                          {g.label}
                          <Badge tone="neutral">{toFaDigits(g.count)}</Badge>
                          <span className="ms-auto font-normal text-muted">
                            جمع <MoneyValue value={g.value} />
                          </span>
                        </span>
                      </th>
                    </tr>
                  )}
                  {g.rows.map((row) => {
                    const na = row.currentPrice === null || row.buyPrice === null;
                    const isGain = (row.changePct ?? 0) >= 0;
                    return (
                      <tr key={row.key} onClick={() => onSelectRow(row)} className={cn('group cursor-pointer', na && 'text-muted')}>
                        <td className="sticky start-0 z-10 bg-card !ps-5 group-hover:bg-surface-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRow(row);
                            }}
                            className="flex min-w-[10.5rem] items-center gap-3 text-start"
                          >
                            <AssetLogo symbol={row.symbol} kind={row.kind} size={32} />
                            <span className="min-w-0">
                              <span className="block max-w-[11.5rem] truncate font-semibold text-ink">{row.nameFa}</span>
                              <span className="flex items-center gap-1.5 text-2xs font-semibold text-muted">
                                <bdi dir="ltr" className="font-mono uppercase">{row.symbol}</bdi>
                                {row.source === 'snapshot' && (
                                  <span className="rounded bg-warn/12 px-1 py-0.2 text-warn">{t('snapshot')}</span>
                                )}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="col-num text-muted"><Price row={row} v={row.buyPrice} /></td>
                        <td className="col-num font-semibold text-ink"><Price row={row} v={row.currentPrice} /></td>
                        <td className="col-num font-semibold text-ink"><MoneyValue value={row.valueUsd} /></td>
                        <td className="col-num">
                          <MoneyValue value={row.profitLoss} signed tone="auto" className="font-semibold" />
                          {row.changePct !== null && (
                            <span className="mt-0.5 block">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-1.5 py-0.5 text-2xs font-bold',
                                  isGain ? 'bg-gain/10 text-positive' : 'bg-negative/10 text-negative'
                                )}
                              >
                                <PercentValue value={row.changePct} />
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="col-num !pe-5"><MoneyValue value={row.vsEth} signed tone="auto" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>

          {/* phones */}
          <div className="md:hidden">
            {sections.map((g) => (
              <div key={g.label || 'all'}>
                {groups && (
                  <p className="flex items-center gap-2 bg-surface-2/60 px-4 py-2 text-xs font-semibold text-ink">
                    {g.label} <Badge tone="neutral">{toFaDigits(g.count)}</Badge>
                    <span className="ms-auto font-normal text-muted"><MoneyValue value={g.value} /></span>
                  </p>
                )}
                <ul className="divide-y divide-divider px-4">
                  {g.rows.map((row) => (
                    <li key={row.key}>
                      <button type="button" onClick={() => onSelectRow(row)} className="flex w-full items-center gap-3 py-3 text-start">
                        <AssetLogo symbol={row.symbol} kind={row.kind} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span className="truncate text-sm font-semibold text-ink">{row.nameFa}</span>
                            <bdi dir="ltr" className="font-mono text-2xs uppercase text-subtle">{row.symbol}</bdi>
                          </span>
                          <span className="block text-2xs text-muted">
                            {t('colCurrentPrice')}: <Price row={row} v={row.currentPrice} />
                          </span>
                        </span>
                        <span className="shrink-0 text-end">
                          <span className="block text-sm font-semibold text-ink"><MoneyValue value={row.valueUsd} /></span>
                          <span className="block text-xs"><PercentValue value={row.changePct} /></span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Surface>
      )}

      <Notice tone="neutral" icon={<Info />}>
        {t('rowSemanticsNote')}
        {naCount > 0 && <> {t('naNotice')}</>}
      </Notice>
    </div>
  );
}
