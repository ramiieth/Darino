/**
 * پالت فرمان (Command Palette) — Ctrl/⌘K
 * جستجوی سریع در کل کاتالوگ دارایی‌ها و پرش به بازار
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { TOKENIZED_LOGO_SEED } from '@/shared/store/logoStore';
import { useCryptoPrices } from '@/features/simulation/data/useCryptoPrices';
import { useMarketStore } from '@/shared/store/marketStore';
import { useUiStore } from '@/shared/store/uiStore';
import {
  COINS,
  COIN_NAMES_FA,
  TOKENIZED_STOCK_PRICES,
  TOKENIZED_NAMES,
  TRADFI_ASSETS,
  TRADFI_NAMES,
  PRICE_SNAPSHOT_FALLBACK
} from '@/features/simulation/domain/constants';
import { fmtUSD, normalizeForSearch } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';
import type { AssetKind } from '@/shared/types';

interface PaletteItem {
  symbol: string;
  nameFa: string;
  kind: AssetKind;
  price: number | null;
}

export function CommandPalette({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const setMarketSearch = useUiStore((s) => s.setMarketSearch);

  const crypto = useCryptoPrices();
  const stockLive = useMarketStore((s) => s.quotes);
  // قیمت توکنایز از کش (بدون sync سنگین در لود) — لوگو از seed
  const [tokenizedPrices] = [{} as Record<string, number>];

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    for (const [id, sym] of Object.entries(COINS)) {
      const p = crypto.data?.prices?.[id];
      out.push({
        symbol: sym,
        nameFa: COIN_NAMES_FA[id] ?? sym,
        kind: 'crypto',
        price: typeof p === 'number' ? p : (PRICE_SNAPSHOT_FALLBACK[id] ?? null)
      });
    }
    for (const sym of Object.keys(TOKENIZED_STOCK_PRICES)) {
      out.push({
        symbol: sym,
        nameFa: TOKENIZED_NAMES[sym] ?? sym,
        kind: 'tokenized',
        price: TOKENIZED_STOCK_PRICES[sym] ?? null
      });
    }
    for (const a of TRADFI_ASSETS) {
      const live = stockLive[a.symbol];
      out.push({
        symbol: a.symbol,
        nameFa: TRADFI_NAMES[a.symbol] ?? a.nameFa,
        kind: 'tradfi',
        price:
          live && Number.isFinite(live.price)
            ? live.price
            : (PRICE_SNAPSHOT_FALLBACK[a.symbol] ?? null)
      });
    }
    return out;
  }, [crypto.data, tokenizedPrices, stockLive]);

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return items.slice(0, 12);
    return items
      .filter(
        (i) =>
          normalizeForSearch(i.symbol).includes(q) || normalizeForSearch(i.nameFa).includes(q)
      )
      .slice(0, 12);
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const select = (symbol: string) => {
    setMarketSearch(symbol);
    onClose();
    navigate('/market');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[active];
      if (item) select(item.symbol);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // بستن با Escape حتی وقتی فوکوس روی input نیست
  useEffect(() => {
    if (!open) return;
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="anim-fade-in fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="anim-pop fixed inset-x-4 top-20 z-[80] mx-auto max-w-md overflow-hidden rounded-2xl border border-line/10 bg-card shadow-pop"
        role="dialog"
        aria-label={t('paletteTitle')}
      >
            <div className="flex items-center gap-2.5 border-b border-line/10 px-4 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={t('paletteTitle')}
                className="w-full bg-transparent text-sm font-bold text-ink outline-none placeholder:text-muted/70"
                aria-label={t('paletteTitle')}
              />
              <kbd className="rounded-lg bg-line/5 px-1.5 py-0.5 text-[11px] font-black text-muted">
                Esc
              </kbd>
            </div>

            <ul className="max-h-[52dvh] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <li className="px-3 py-8 text-center text-xs font-bold text-muted">
                  {t('noAssetsFound')}
                </li>
              )}
              {filtered.map((item, i) => (
                <li key={item.symbol}>
                  <button
                    onClick={() => select(item.symbol)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors',
                      i === active ? 'bg-line/[0.06]' : 'hover:bg-line/[0.04]'
                    )}
                  >
                    <AssetLogo symbol={item.symbol} kind={item.kind} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="tnum block text-[12px] font-extrabold text-ink">
                        {item.symbol}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-muted">
                        {item.nameFa}
                      </span>
                    </span>
                    <span className="num-ltr shrink-0 text-[11px] font-black text-ink">
                      {fmtUSD(item.price)}
                    </span>
                    {i === active && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <p className="border-t border-line/10 px-4 py-2 text-[11px] font-bold text-muted">
              {t('paletteHint')}
            </p>
      </div>
    </>
  );
}
