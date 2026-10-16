/**
 * انتخاب بازار ماشین‌حساب هج — شبکهٔ ۳ ستونه از کارت‌های ارز (لوگو · نماد · نام فارسی)
 * جستجو روی نماد و نام؛ هر کارت یک دکمهٔ واقعی با aria-pressed (Tab/Enter/Space).
 */
import { useMemo, useState } from 'react';
import { SearchField } from '@/shared/components/ui/Input';
import { cn } from '@/shared/lib/cn';
import { toEnDigits } from '@/shared/utils/formatters';
import type { Coin } from '@/features/calculators/domain';

export function CoinLogo({ coin, size }: { coin: Coin; size: number }) {
  return (
    <img
      src={coin.logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-full bg-card object-contain"
      style={{ width: size, height: size }}
    />
  );
}

const normalize = (s: string) => toEnDigits(s).toLowerCase().replace(/[\s‌‌-]/g, '');

export function CoinPicker({
  coins,
  value,
  onChange
}: {
  coins: readonly Coin[];
  value: Coin;
  onChange: (coin: Coin) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = normalize(query);
    if (!q) return coins;
    return coins.filter((c) => normalize(c.symbol).includes(q) || normalize(c.name).includes(q));
  }, [coins, query]);

  return (
    <div className="space-y-3">
      <SearchField value={query} onChange={setQuery} placeholder="جستجوی ارز (نماد یا نام)" label="جستجوی بازار" />
      <div
        role="group"
        aria-label="بازارها"
        className="-mx-1 max-h-[22rem] overflow-y-auto overscroll-contain px-1 py-1"
      >
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">ارزی با این نام پیدا نشد.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {visible.map((coin) => {
              const active = coin.symbol === value.symbol;
              return (
                <button
                  key={coin.symbol}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${coin.name} (${coin.symbol})`}
                  onClick={() => onChange(coin)}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-1.5 rounded-card border px-2 py-3 text-center',
                    'transition-colors duration-fast ease-standard',
                    active
                      ? 'border-accent bg-accent-soft'
                      : 'border-divider bg-card hover:border-divider-strong hover:bg-surface-2/60'
                  )}
                >
                  <CoinLogo coin={coin} size={32} />
                  <bdi dir="ltr" className={cn('font-latin text-xs font-bold', active ? 'text-accent' : 'text-ink')}>
                    {coin.symbol}
                  </bdi>
                  <span className="w-full truncate text-[11px] text-muted">{coin.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
