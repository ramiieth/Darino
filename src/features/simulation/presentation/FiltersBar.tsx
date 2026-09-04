import { Search, Layers, Download } from 'lucide-react';
import { Input } from '@/shared/components/ui/Input';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

export type CategoryFilter =
  | 'all'
  | 'crypto'
  | 'tokenized'
  | 'tradfi'
  | 'us-stock'
  | 'etf'
  | 'index'
  | 'commodity'
  | 'bond';
export type SortKey = 'default' | 'value' | 'profit' | 'return' | 'name' | 'buy' | 'current' | 'vseth';

export const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: t('filterAll') },
  { value: 'crypto', label: t('filterCrypto') },
  { value: 'tokenized', label: t('filterTokenized') },
  { value: 'tradfi', label: t('filterTradFi') },
  { value: 'us-stock', label: 'سهام آمریکا' },
  { value: 'etf', label: 'ETF' },
  { value: 'index', label: 'شاخص' },
  { value: 'commodity', label: 'کامودیتی' },
  { value: 'bond', label: 'اوراق' }
];

export function FiltersBar({
  query,
  onQuery,
  category,
  onCategory,
  grouped,
  onToggleGroup,
  onExport
}: {
  query: string;
  onQuery: (v: string) => void;
  category: CategoryFilter;
  onCategory: (v: CategoryFilter) => void;
  grouped: boolean;
  onToggleGroup: () => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <Input
        withSearchIcon
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_OPTIONS.map((opt) => {
          const active = category === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onCategory(opt.value)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all active:scale-95',
                active ? 'bg-accent text-white shadow-accent' : 'glass-inset text-muted hover:text-ink'
              )}
            >
              {opt.label}
            </button>
          );
        })}

        <span className="mx-1 w-px shrink-0 bg-line/10" aria-hidden />

        {/* گروه‌بندی */}
        <button
          onClick={onToggleGroup}
          aria-pressed={grouped}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all active:scale-95',
            grouped ? 'bg-info/15 text-info ring-1 ring-info/30' : 'glass-inset text-muted hover:text-ink'
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          {t('groupBy')}
        </button>

        {/* خروجی CSV */}
        <button
          onClick={onExport}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-positive/10 px-3.5 py-1.5 text-[11px] font-bold text-positive ring-1 ring-positive/25 transition-all hover:bg-positive/15 active:scale-95"
        >
          <Download className="h-3.5 w-3.5" />
          {t('exportCsv')}
        </button>
      </div>
    </div>
  );
}
