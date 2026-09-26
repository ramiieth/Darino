/** ============================================================
 * MarketsPage — Markets module body
 *
 *  Tabs (page sections):
 *   - همه:        Crypto Top 200 + Ondo + xStocks (one row per symbol)
 *   - رمزارز:     Crypto Top 200
 *   - توکن‌ایز:   Ondo + xStocks (source chips)
 *   - سنتی:       reference catalogue (reference prices — no fake live data)
 *
 *  All reads come from the central pipeline — no requests in render.
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { useMarketsStore } from '../pipeline/store';
import { MarketsTable } from './MarketsTable';
import { TradFiTable } from './TradFiTable';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { useUiStore } from '@/shared/store/uiStore';
import type { MarketUniverse } from '../pipeline/types';

export type MarketsTab = 'all' | 'crypto' | 'tokenized' | 'tradfi';

const TABS: { value: MarketsTab; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'crypto', label: 'رمزارز' },
  { value: 'tokenized', label: 'دارایی توکن‌ایز' },
  { value: 'tradfi', label: 'سنتی (TradFi)' }
];

export const TAB_UNIVERSES: Record<Exclude<MarketsTab, 'tradfi'>, MarketUniverse[]> = {
  all: ['crypto_top_200', 'ondo_tokenized', 'xstocks'],
  crypto: ['crypto_top_200'],
  tokenized: ['ondo_tokenized', 'xstocks']
};

export function MarketsPage({ tab, onTabChange }: { tab: MarketsTab; onTabChange: (t: MarketsTab) => void }) {
  // search handed over from the command palette (consumed once)
  const marketSearch = useUiStore((s) => s.marketSearch);
  const setMarketSearch = useUiStore((s) => s.setMarketSearch);
  const [initialQuery, setInitialQuery] = useState('');
  useEffect(() => {
    if (marketSearch) {
      setInitialQuery(marketSearch);
      onTabChange('all');
      setMarketSearch('');
    }
  }, [marketSearch, setMarketSearch, onTabChange]);

  const counts = useMarketsStore((s) => s.data);
  const tabs = useMemo(
    () =>
      TABS.map((t) =>
        t.value === 'tradfi'
          ? t
          : { ...t, badge: TAB_UNIVERSES[t.value].reduce((n, u) => n + counts[u].length, 0) }
      ),
    [counts]
  );

  return (
    <div className="space-y-5">
      <Tabs label="دسته بازار" options={tabs} value={tab} onChange={onTabChange} />

      {tab === 'all' && <MarketsTable universes={TAB_UNIVERSES.all} title="همه بازارها" initialQuery={initialQuery} />}
      {tab === 'crypto' && <MarketsTable universes={TAB_UNIVERSES.crypto} title="۲۰۰ رمزارز برتر (ارزش بازار)" />}
      {tab === 'tokenized' && (
        <MarketsTable universes={TAB_UNIVERSES.tokenized} title="دارایی‌های توکن‌ایز" sourceFilter />
      )}
      {tab === 'tradfi' && <TradFiTable />}
    </div>
  );
}
