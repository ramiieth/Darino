/**
 * انتخاب دارایی (Explore) — بدون تایپ مستقیم:
 * ۱) کلاس دارایی  ۲) جستجو و انتخاب از لیست
 */
import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { Input } from '@/shared/components/ui/Input';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { assetsOfClass, ASSET_CLASS_LABELS, type CalculatorAsset, type CalculatorAssetClass } from '@/features/calculators/data/catalogs';
import { normalizeForSearch } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const CLASSES: CalculatorAssetClass[] = ['crypto', 'stock', 'etf', 'tokenized', 'commodity'];

export function AssetPicker({
  value,
  onChange,
  compact = false
}: {
  value: CalculatorAsset | null;
  onChange: (a: CalculatorAsset | null) => void;
  compact?: boolean;
}) {
  const [cls, setCls] = useState<CalculatorAssetClass>('crypto');
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const all = assetsOfClass(cls);
    const q = normalizeForSearch(query);
    if (!q) return all.slice(0, 60);
    return all
      .filter((a) => normalizeForSearch(a.symbol).includes(q) || normalizeForSearch(a.nameFa).includes(q))
      .slice(0, 60);
  }, [cls, query]);

  const kindForLogo = (k: CalculatorAssetClass) =>
    k === 'stock' || k === 'etf' || k === 'commodity' ? 'tradfi' : k === 'tokenized' ? 'tokenized' : 'crypto';

  return (
    <div className="space-y-2.5">
      {/* کلاس دارایی */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CLASSES.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCls(c);
              setQuery('');
              onChange(null);
            }}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95',
              cls === c ? 'bg-accent text-white shadow-glow' : 'glass-inset text-muted hover:text-ink'
            )}
          >
            {ASSET_CLASS_LABELS[c]}
          </button>
        ))}
      </div>

      {/* جستجو */}
      <Input
        withSearchIcon
        placeholder={`جستجو در ${ASSET_CLASS_LABELS[cls]}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={compact ? 'h-10 text-xs' : 'h-11 text-sm'}
      />

      {/* لیست */}
      <div className="glass-inset max-h-52 overflow-auto rounded-2xl">
        {list.length === 0 && (
          <p className="px-4 py-6 text-center text-[11px] font-bold text-muted">
            دارایی‌ای یافت نشد
          </p>
        )}
        {list.map((a) => {
          const active = value?.symbol === a.symbol;
          return (
            <button
              key={a.symbol}
              onClick={() => onChange(a)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2 text-start transition-colors',
                active ? 'bg-accent/10' : 'hover:bg-line/[0.04]'
              )}
            >
              <AssetLogo symbol={a.symbol} kind={kindForLogo(a.kind)} size={28} />
              <span className="min-w-0 flex-1">
                <span className="tnum block text-[12px] font-extrabold text-ink">{a.symbol}</span>
                <span className="block truncate text-[10px] font-medium text-muted">{a.nameFa}</span>
              </span>
              {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </button>
          );
        })}
      </div>

      {/* انتخاب فعلی */}
      {value && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-accent/10 px-3.5 py-2.5 ring-1 ring-accent/25">
          <AssetLogo symbol={value.symbol} kind={kindForLogo(value.kind)} size={30} />
          <div className="min-w-0 flex-1">
            <p className="tnum text-[13px] font-extrabold text-ink">{value.symbol}</p>
            <p className="truncate text-[10px] font-medium text-muted">{value.nameFa}</p>
          </div>
          <span className="badge bg-accent/15 text-accent">{ASSET_CLASS_LABELS[value.kind]}</span>
        </div>
      )}
    </div>
  );
}
