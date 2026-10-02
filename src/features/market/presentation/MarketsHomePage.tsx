/**
 * Markets (home route) — scan the market fast on desktop, drill down on phones.
 */
import { useCallback, useMemo, useState } from 'react';
import { Percent, RefreshCw } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Button } from '@/shared/components/ui/Button';
import { StatusDot } from '@/shared/components/ui/Badge';
import { ListRow } from '@/shared/components/ui/ListRow';
import { Surface } from '@/shared/components/ui/GlassCard';
import { useNow } from '@/shared/hooks/useNow';
import { fmtRelativeAge } from '@/shared/utils/formatters';
import { MarketsPage, TAB_UNIVERSES, type MarketsTab } from '@/features/markets/presentation/MarketsPage';
import { refreshAllMarkets, useMarketsStore } from '@/features/markets/pipeline/store';

function MarketsStatus({ tab }: { tab: MarketsTab }) {
  const now = useNow(15_000);
  const data = useMarketsStore((s) => s.data);
  const error = useMarketsStore((s) => s.error);
  const lastSyncAt = useMarketsStore((s) => s.lastSyncAt);
  const loading = useMarketsStore((s) => s.loading);

  if (tab === 'tradfi') return <StatusDot tone="warn" label="قیمت مرجع (غیرزنده)" className="font-normal" />;
  const us = TAB_UNIVERSES[tab];
  const anyLoading = us.some((u) => loading[u]);
  const anyError = us.some((u) => error[u]);
  const snapshot = us.some((u) => data[u].some((a) => a.snapshot));
  const last = Math.max(0, ...us.map((u) => lastSyncAt[u] ?? 0));

  if (anyLoading && !last) return <StatusDot tone="info" label="در حال همگام‌سازی" pulse className="font-normal" />;
  if (anyError || snapshot)
    return (
      <StatusDot
        tone="warn"
        className="font-normal"
        label={last ? `داده ذخیره‌شده · ${fmtRelativeAge(last, now)}` : 'داده ذخیره‌شده (آفلاین)'}
      />
    );
  return <StatusDot tone="gain" className="font-normal" label={last ? `زنده · ${fmtRelativeAge(last, now)}` : 'زنده'} />;
}

export function MarketsHomePage() {
  const [tab, setTab] = useState<MarketsTab>('all');
  const onTabChange = useCallback((t: MarketsTab) => setTab(t), []);
  const loading = useMarketsStore((s) => s.loading);
  const syncing = useMemo(() => Object.values(loading).some(Boolean), [loading]);

  return (
    <Page>
      <PageHeader
        title="بازارها"
        subtitle="رمزارزها، دارایی‌های توکن‌ایز و بازار سنتی — قیمت، تغییرات و ارزش بازار"
        meta={<MarketsStatus tab={tab} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw />} loading={syncing} onClick={refreshAllMarkets}>
            همگام‌سازی
          </Button>
        }
      />

      <MarketsPage tab={tab} onTabChange={onTabChange} />

      <Surface className="px-4">
        <ListRow
          to="/pendle"
          leading={
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Percent className="h-5 w-5" />
            </span>
          }
          title="بازارهای پندل"
          subtitle="بازده ثابت توکن اصل، توکن بازده و نقدینگی — بازده سالانه اعلام‌شده و تحلیل پس از هزینه"
        />
      </Surface>
    </Page>
  );
}
