/**
 * Asset picker — choose an asset class, then search and pick from the list
 * (no free-typed symbols). Selected asset collapses the list to a summary row.
 */
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { SearchField } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { assetsOfClass, ASSET_CLASS_LABELS, type CalculatorAsset, type CalculatorAssetClass } from '@/features/calculators/data/catalogs';
import { normalizeForSearch } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const CLASSES: CalculatorAssetClass[] = ['crypto', 'stock', 'etf', 'tokenized', 'commodity'];

const kindForLogo = (k: CalculatorAssetClass) =>
  k === 'stock' || k === 'etf' || k === 'commodity' ? 'tradfi' : k === 'tokenized' ? 'tokenized' : 'crypto';

export function AssetPicker({
  value,
  onChange,
  compact = false,
  label = 'دارایی'
}: {
  value: CalculatorAsset | null;
  onChange: (a: CalculatorAsset | null) => void;
  /** multi-add mode (compare): the list stays open after picking */
  compact?: boolean;
  label?: string;
}) {
  const [cls, setCls] = useState<CalculatorAssetClass>('crypto');
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(!value);

  const list = useMemo(() => {
    const all = assetsOfClass(cls);
    const q = normalizeForSearch(query);
    if (!q) return all.slice(0, 60);
    return all.filter((a) => normalizeForSearch(a.symbol).includes(q) || normalizeForSearch(a.nameFa).includes(q)).slice(0, 60);
  }, [cls, query]);

  if (value && !browsing && !compact) {
    return (
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
        <div className="flex items-center gap-3 rounded-field border border-divider-strong bg-card px-3 py-2.5">
          <AssetLogo symbol={value.symbol} kind={kindForLogo(value.kind)} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{value.nameFa}</p>
            <p className="text-2xs font-semibold text-muted">
              <bdi dir="ltr">{value.symbol}</bdi> · {ASSET_CLASS_LABELS[value.kind]}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-accent" onClick={() => setBrowsing(true)}>
            تغییر
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <ChipGroup<CalculatorAssetClass>
        label="کلاس دارایی"
        value={cls}
        onChange={(c) => {
          setCls(c);
          setQuery('');
        }}
        options={CLASSES.map((c) => ({ value: c, label: ASSET_CLASS_LABELS[c] }))}
      />
      <SearchField value={query} onChange={setQuery} placeholder={`جستجو در ${ASSET_CLASS_LABELS[cls]}…`} />
      <ul className="max-h-56 divide-y divide-divider overflow-auto rounded-field border border-divider" role="listbox" aria-label={label}>
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">دارایی‌ای یافت نشد</li>}
        {list.map((a) => {
          const active = value?.symbol === a.symbol;
          return (
            <li key={a.symbol} role="option" aria-selected={active}>
              <button
                type="button"
                onClick={() => {
                  onChange(a);
                  if (!compact) setBrowsing(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors',
                  active ? 'bg-accent-soft' : 'hover:bg-surface-2'
                )}
              >
                <AssetLogo symbol={a.symbol} kind={kindForLogo(a.kind)} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{a.nameFa}</span>
                  <span className="block text-2xs font-semibold text-muted"><bdi dir="ltr">{a.symbol}</bdi></span>
                </span>
                {active ? <Check aria-hidden className="h-4 w-4 shrink-0 text-accent" /> : compact && <Badge tone="neutral">افزودن</Badge>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
