/** ============================================================
 * MarketsPage — صفحه واحد Markets (بازطراحی سبک)
 *
 *  تب‌ها:
 *   - همه:      Crypto Top 200 + Ondo + xStocks (هر Symbol یک Row)
 *   - رمزارز:   Crypto Top 200
 *   - توکنایز:  Ondo + xStocks
 *   - سنتی:     کاتالوگ مرجع (قیمت مرجع — بدون داده جعلی)
 *
 *  همه از Pipeline مرکزی می‌خوانند — بدون درخواست مستقیم در Render.
 * ============================================================ */
import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useMarketsStore, refreshAllMarkets } from '../pipeline/store';
import { MarketsTable } from './MarketsTable';
import { TradFiTable } from './TradFiTable';
import { cn } from '@/shared/lib/cn';
import type { MarketUniverse } from '../pipeline/types';

type Tab = 'all' | 'crypto' | 'tokenized' | 'tradfi';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'crypto', label: 'رمزارز' },
  { value: 'tokenized', label: 'دارایی توکن‌ایز' },
  { value: 'tradfi', label: 'سنتی (TradFi)' }
];

export function MarketsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const loading = useMarketsStore((s) => s.loading);

  const anyLoading = useMemo(
    () => loading.crypto_top_200 || loading.ondo_tokenized || loading.xstocks,
    [loading]
  );

  return (
    <div className="space-y-4">
      {/* سربرگ */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-[15px] font-black text-ink">بازار</h1>
          <p className="mt-0.5 text-[10px] font-bold text-muted">
            داده زنده از Provider — فقط اطلاعات لازم منتقل می‌شود؛ هر Symbol مستقل است
          </p>
        </div>
        <button
          onClick={refreshAllMarkets}
          disabled={anyLoading}
          className="flex shrink-0 items-center gap-1.5 rounded-full glass-inset px-3 py-1.5 text-[10px] font-black text-ink transition-all hover:text-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', anyLoading && 'animate-spin')} />
          همگام‌سازی
        </button>
      </div>

      {/* تب‌ها */}
      <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black transition-all',
              tab === t.value ? 'bg-accent text-white shadow-glow' : 'glass-inset text-muted hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <MarketsTable universes={['crypto_top_200', 'ondo_tokenized', 'xstocks']} title="همه بازارها" />
      )}
      {tab === 'crypto' && <MarketsTable universes={['crypto_top_200']} title="۲۰۰ رمزارز برتر (مارکت‌کپ)" />}
      {tab === 'tokenized' && (
        <MarketsTable universes={['ondo_tokenized', 'xstocks']} title="دارایی‌های توکن‌ایز (فقط Market Cap معتبر)" />
      )}
      {tab === 'tradfi' && <TradFiTable />}
    </div>
  );
}
