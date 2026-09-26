import { Download, Layers } from 'lucide-react';
import { SearchField } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
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

/** Toolbar: search · category chips · group toggle · CSV export */
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={query} onChange={onQuery} placeholder={t('searchPlaceholder')} className="min-w-0 flex-1 md:max-w-sm" />
        <Button variant={grouped ? 'secondary' : 'outline'} size="sm" icon={<Layers />} aria-pressed={grouped} onClick={onToggleGroup}>
          {t('groupBy')}
        </Button>
        <Button variant="outline" size="sm" icon={<Download />} onClick={onExport}>
          {t('exportCsv')}
        </Button>
      </div>
      <ChipGroup bleed label="دسته دارایی" options={CATEGORY_OPTIONS} value={category} onChange={onCategory} />
    </div>
  );
}
