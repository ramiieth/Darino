/**
 * گزارش یک بازار پرپ — رژیم فاندینگ ۳۰ روزه، بازار، و پوزیشن‌های برترها روی همین دارایی
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Section } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { aggregatePositions } from '@/features/traders/domain/positions';
import { usePositions } from '@/features/traders/data/useTraders';
import { shortAddress } from '@/features/traders/presentation/format';
import { REGIME_FA, hourlyToApr } from '../domain/funding';
import { useFundingStats, usePerpMarkets } from '../data/intelApi';
import { LiqLadder, SignedBars, SplitBar, UsdShort, fmtPrice, liqDistance } from './parts';
import { RegimeBadge } from './DerivativesTab';

export function CoinSheet({ coin, onClose, onTrader }: { coin: string | null; onClose: () => void; onTrader: (address: string) => void }) {
  const markets = usePerpMarkets();
  const m = markets.data?.find((x) => x.coin === coin) ?? null;
  const stats = useFundingStats(coin, m?.fundingHourly ?? null, !!coin && !!m);
  const positions = usePositions();
  const agg = useMemo(() => aggregatePositions((positions.data?.positions ?? []).filter((p) => p.coin === coin))[0] ?? null, [positions.data, coin]);
  if (!coin) return null;
  const s = stats.data;
  const days = s?.daily.slice(-30) ?? [];

  return (
    <Sheet open onClose={onClose} title={`بازار ${coin}`} size="lg" description="هایپرلیکوئید · پرپچوال">
      <div className="space-y-8">
        <Section title="بازار" headingLevel={3}>
          {m ? (
            <MetricGrid cols={4}>
              <Metric label="قیمت" value={<bdi dir="ltr">{fmtPrice(m.markPx)}</bdi>} sub={<PercentValue value={m.change24h} digits={1} />} />
              <Metric label="فاندینگ سالانه (الان)" value={<PercentValue value={hourlyToApr(m.fundingHourly)} digits={1} />} />
              <Metric label="OI" value={<MoneyValue value={m.openInterestUsd} compact />} />
              <Metric label="حجم ۲۴ ساعت" value={<MoneyValue value={m.volume24h} compact />} sub={`حداکثر اهرم ${toFaDigits(m.maxLeverage)}x`} />
            </MetricGrid>
          ) : (
            <ListSkeleton rows={1} />
          )}
        </Section>

        <Section title="رژیم فاندینگ ۳۰ روز" headingLevel={3} action={<RegimeBadge stats={s} loading={stats.isLoading} />}>
          {s ? (
            <>
              <MetricGrid cols={4}>
                <Metric label="صدک نرخ فعلی" value={s.percentile === null ? '—' : toFaDigits(Math.round(s.percentile))} sub="از ۱۰۰ (ساعت‌های ۳۰ روز)" />
                <Metric label="میانگین ۷ روز" value={<PercentValue value={s.avg7dApr} digits={1} />} sub="سالانه" />
                <Metric label="میانگین ۳۰ روز" value={<PercentValue value={s.avg30dApr} digits={1} />} sub="سالانه" />
                <Metric label="نمونه" value={toFaDigits(s.samples)} sub="ساعت" />
              </MetricGrid>
              <Notice tone={s.regime === 'hot' || s.regime === 'negative' ? 'warn' : 'neutral'} className="mt-4">{REGIME_FA[s.regime].hint}</Notice>
              {days.length > 1 && (
                <SignedBars className="mt-5" ariaLabel="فاندینگ سالانهٔ روزانه در ۳۰ روز" values={days.map((d) => d.apr)} labels={days.map((d, i) => (i % 5 === 0 ? toFaDigits(Number(d.day.slice(8))) : ''))} />
              )}
              <p className="mt-3 text-xs text-muted">
                برای مقایسه با آرکوس، لایتر و بقیهٔ صرافی‌هایتان: <Link to="/calculators" className="font-semibold text-brand hover:underline">اسکنر فاندینگ</Link>
                {' · '}قبل از ورود: <Link to={`/desk?m=${encodeURIComponent(coin)}`} className="font-semibold text-brand hover:underline">چک بقا با اهرم شما</Link>
              </p>
            </>
          ) : (
            <ListSkeleton rows={2} />
          )}
        </Section>

        <Section title="پوزیشن برترها روی این دارایی" headingLevel={3}>
          {agg ? (
            <>
              <SplitBar long={agg.longUsd} short={agg.shortUsd} />
              <MetricGrid cols={4} className="mt-4">
                <Metric size="sm" label={`لانگ (${toFaDigits(agg.longCount)})`} value={<MoneyValue value={agg.longUsd} compact />} sub={<>ورود <bdi dir="ltr">{fmtPrice(agg.avgEntryLong)}</bdi></>} />
                <Metric size="sm" label={`شورت (${toFaDigits(agg.shortCount)})`} value={<MoneyValue value={agg.shortUsd} compact />} sub={<>ورود <bdi dir="ltr">{fmtPrice(agg.avgEntryShort)}</bdi></>} />
                <Metric size="sm" label="خالص" value={<MoneyValue value={agg.netUsd} compact signed tone="auto" />} />
                <Metric size="sm" label="سود باز" value={<MoneyValue value={agg.upnl} compact signed tone="auto" />} />
              </MetricGrid>
              {agg.liqLevels.length > 0 && <div className="mt-5"><LiqLadder levels={agg.liqLevels} /></div>}
              <KeyValueList
                dense
                className="mt-4"
                rows={agg.positions.slice(0, 15).map((p) => ({
                  label: (
                    <button type="button" onClick={() => onTrader(p.address)} className="flex flex-wrap items-center gap-1.5 text-start hover:underline">
                      <bdi dir="ltr" className="font-latin text-xs font-semibold text-ink">{shortAddress(p.address)}</bdi>
                      <Badge tone={p.side === 'long' ? 'gain' : 'loss'}>{p.side === 'long' ? 'لانگ' : 'شورت'}{p.leverage ? ` ${toFaDigits(p.leverage)}x` : ''}</Badge>
                      {p.steady && <Badge tone="brand">ثابت‌قدم</Badge>}
                      <span className="text-xs">ورود <bdi dir="ltr">{fmtPrice(p.entryPx)}</bdi> · لیکوئید <bdi dir="ltr">{fmtPrice(p.liqPx)}</bdi>{liqDistance(p.liqPx, p.markPx)}</span>
                    </button>
                  ),
                  value: <UsdShort value={p.sizeUsd} className="font-bold text-ink" />
                }))}
              />
            </>
          ) : positions.isLoading ? (
            <ListSkeleton rows={2} />
          ) : (
            <p className="text-sm text-muted">هیچ‌کدام از برترها الان روی {coin} پوزیشن ندارند.</p>
          )}
        </Section>
      </div>
    </Sheet>
  );
}
