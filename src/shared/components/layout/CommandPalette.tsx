import { persianAssetName } from '@/shared/i18n/assetDisplayName';
/**
 * Command palette (Ctrl/⌘K) — jump to any section or find an asset.
 * Combobox + listbox semantics, arrow/enter/escape, focus restore.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
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
import { ALL_NAV_ITEMS, type NavItem } from './navigation';

type Entry =
  | { type: 'page'; key: string; item: NavItem }
  | { type: 'asset'; key: string; symbol: string; nameFa: string; kind: AssetKind; price: number | null };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const navigate = useNavigate();
  const setMarketSearch = useUiStore((s) => s.setMarketSearch);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const crypto = useCryptoPrices();
  const stockLive = useMarketStore((s) => s.quotes);

  const assets = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const [id, sym] of Object.entries(COINS)) {
      const p = crypto.data?.prices?.[id];
      out.push({
        type: 'asset',
        key: `a:${sym}`,
        symbol: sym,
        nameFa: COIN_NAMES_FA[id] ?? sym,
        kind: 'crypto',
        price: typeof p === 'number' ? p : (PRICE_SNAPSHOT_FALLBACK[id] ?? null)
      });
    }
    for (const sym of Object.keys(TOKENIZED_STOCK_PRICES)) {
      out.push({
        type: 'asset',
        key: `a:${sym}`,
        symbol: sym,
        nameFa: TOKENIZED_NAMES[sym] ?? sym,
        kind: 'tokenized',
        price: TOKENIZED_STOCK_PRICES[sym] ?? null
      });
    }
    for (const a of TRADFI_ASSETS) {
      const live = stockLive[a.symbol];
      out.push({
        type: 'asset',
        key: `a:${a.symbol}`,
        symbol: a.symbol,
        nameFa: TRADFI_NAMES[a.symbol] ?? a.nameFa,
        kind: 'tradfi',
        price: live && Number.isFinite(live.price) ? live.price : (PRICE_SNAPSHOT_FALLBACK[a.symbol] ?? null)
      });
    }
    return out;
  }, [crypto.data, stockLive]);

  const pages = useMemo<Entry[]>(() => ALL_NAV_ITEMS.map((item) => ({ type: 'page', key: `p:${item.id}`, item })), []);

  const results = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return { pages: pages.slice(0, 6), assets: assets.slice(0, 6) };
    const pageHits = pages.filter(
      (e) =>
        e.type === 'page' &&
        (normalizeForSearch(e.item.label).includes(q) || normalizeForSearch(e.item.description).includes(q))
    );
    const assetHits = assets
      .filter(
        (e) =>
          e.type === 'asset' &&
          (normalizeForSearch(e.symbol).includes(q) || normalizeForSearch(e.nameFa).includes(q))
      )
      .slice(0, 10);
    return { pages: pageHits, assets: assetHits };
  }, [pages, assets, query]);

  const flat = useMemo(() => [...results.pages, ...results.assets], [results]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onWindowKey);
    return () => {
      window.removeEventListener('keydown', onWindowKey);
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const choose = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    if (e.type === 'page') {
      navigate(e.item.to);
    } else {
      setMarketSearch(e.symbol);
      navigate('/market');
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[active]);
    }
  };

  if (!open) return null;

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let index = -1;

  const renderEntry = (e: Entry) => {
    index += 1;
    const i = index;
    const selected = i === active;
    return (
      <li
        key={e.key}
        id={optionId(i)}
        role="option"
        aria-selected={selected}
        onMouseEnter={() => setActive(i)}
        onClick={() => choose(e)}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-field px-3 py-2.5',
          selected ? 'bg-surface-2' : 'hover:bg-surface-2/60'
        )}
      >
        {e.type === 'page' ? (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted">
              <e.item.icon aria-hidden className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{e.item.label}</span>
              <span className="block truncate text-xs text-muted">{e.item.description}</span>
            </span>
          </>
        ) : (
          <>
            <AssetLogo symbol={e.symbol} kind={e.kind} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{e.nameFa}</span>
              <span className="block text-2xs font-semibold text-muted"><bdi dir="rtl">
                {persianAssetName(e.symbol)}
              </bdi></span>
            </span>
            <span className="num-ltr shrink-0 text-sm font-semibold text-ink">{fmtUSD(e.price)}</span>
          </>
        )}
        {selected && <CornerDownLeft aria-hidden className="h-4 w-4 shrink-0 text-subtle" />}
      </li>
    );
  };

  return (
    <>
      <div className="anim-fade-in fixed inset-0 z-palette bg-[rgb(9_13_27/0.45)]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('paletteTitle')}
        className="anim-pop fixed inset-x-3 top-[calc(0.75rem+var(--safe-top))] z-palette mx-auto flex max-h-[min(36rem,calc(100dvh-2rem))] max-w-xl flex-col overflow-hidden rounded-panel bg-card shadow-pop md:top-[12vh]"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-divider px-4">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="جستجوی بخش یا دارایی…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat[active] ? optionId(active) : undefined}
            aria-label={t('paletteTitle')}
            className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-subtle"
          />
          <kbd className="hidden shrink-0 rounded-control border border-divider px-1.5 py-0.5 text-2xs font-semibold text-muted md:block">
            Esc
          </kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="نتایج" className="min-h-0 flex-1 overflow-y-auto p-2">
          {flat.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-muted">{t('noAssetsFound')}</li>
          )}
          {results.pages.length > 0 && (
            <li role="presentation" className="px-3 pb-1 pt-2 text-xs font-semibold text-subtle">
              بخش‌ها
            </li>
          )}
          {results.pages.map(renderEntry)}
          {results.assets.length > 0 && (
            <li role="presentation" className="px-3 pb-1 pt-3 text-xs font-semibold text-subtle">
              دارایی‌ها
            </li>
          )}
          {results.assets.map(renderEntry)}
        </ul>

        <p className="hidden shrink-0 border-t border-divider px-4 py-2 text-xs text-muted md:block">{t('paletteHint')}</p>
      </div>
    </>
  );
}
