/**
 * کارنامهٔ کامل یک تریدر — عملکرد حساب (کل سابقه) + آمار معاملات (۲۰۰۰ fill اخیر) + حکم‌های صریح
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellRing, Bookmark, BookmarkCheck, Copy, ExternalLink } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Section } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { toast } from '@/shared/store/toastStore';
import { toFaDigits } from '@/shared/utils/formatters';
import type { PnlCurve } from '../domain/portfolio';
import type { TraderReport } from '../domain/report';
import { useTraderReport } from '../data/useTraders';
import { useSavedTraders } from '../data/savedTraders';
import { prioritize, weighted } from '../data/tradersApi';
import { positionsOf } from '../domain/positions';
import { hlClearinghouseState } from '@/features/hyperliquid/data/hyperliquidService';
import { currentSubscription } from '@/features/alerts/data/alertsApi';
import { SignedBars, UsdShort, fmtPrice, liqDistance } from '@/features/intel/presentation/parts';
import { explorerUrl, fmtDate, fmtHold, fmtMonth, fmtRatio } from './format';
import { useFollow } from './useFollow';

const TONE = { gain: 'success', warn: 'warn', loss: 'error', info: 'info' } as const;

export function TraderReportSheet({ address, name, onClose }: { address: string | null; name?: string | null; onClose: () => void }) {
  const report = useTraderReport(address ?? '', !!address);
  const saved = useSavedTraders((s) => s.saved.some((x) => x.address === address));
  const add = useSavedTraders((s) => s.add);
  const remove = useSavedTraders((s) => s.remove);
  const { isFollowing, toggle } = useFollow();
  const following = !!address && isFollowing(address);
  const [pushHere, setPushHere] = useState<boolean | null>(null);
  useEffect(() => {
    if (address) prioritize(address);
  }, [address]);
  useEffect(() => {
    if (following) void currentSubscription().then((s) => setPushHere(!!s), () => setPushHere(false));
  }, [following]);
  if (!address) return null;

  const copy = () => {
    void navigator.clipboard?.writeText(address).then(
      () => toast('success', 'آدرس کپی شد'),
      () => toast('error', 'کپی انجام نشد')
    );
  };

  return (
    <Sheet open onClose={onClose} title={name ? `کارنامهٔ ${name}` : 'کارنامهٔ تریدر'} size="lg" description={<bdi dir="ltr" className="break-all font-latin text-xs">{address}</bdi>}>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={saved ? 'secondary' : 'primary'}
          icon={saved ? <BookmarkCheck /> : <Bookmark />}
          onClick={() => {
            if (saved) remove(address);
            else if (add(address, name) === 'full') toast('error', 'حداکثر ۵۰ آدرس ذخیره می‌شود');
          }}
        >
          {saved ? 'در آدرس‌های من' : 'افزودن به آدرس‌های من'}
        </Button>
        <Button size="sm" variant={following ? 'secondary' : 'outline'} icon={following ? <BellRing /> : <Bell />} onClick={() => toggle(address, name)}>
          {following ? 'اعلان پوزیشن‌ها روشن است' : 'اعلان پوزیشن‌ها'}
        </Button>
        <Button size="sm" variant="outline" icon={<Copy />} onClick={copy}>کپی آدرس</Button>
        <a href={explorerUrl(address)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-field px-3 text-sm font-semibold text-brand hover:underline">
          <ExternalLink className="h-4 w-4" /> اکسپلورر هایپرلیکوئید
        </a>
      </div>

      {following && pushHere === false && (
        <Notice tone="warn" className="mb-5" action={<Link to="/alerts" className="text-sm font-semibold text-brand hover:underline">فعال‌سازی</Link>}>
          دنبال کردن روی حساب ذخیره شد، اما اعلان روی این دستگاه فعال نیست.
        </Notice>
      )}
      <OpenPositions address={address} />
      {report.isLoading && <ListSkeleton rows={5} />}
      {report.isError && <ErrorState message="سابقهٔ این آدرس از هایپرلیکوئید دریافت نشد" onRetry={() => void report.refetch()} />}
      {report.data && <ReportBody r={report.data} />}

      <p className="mt-6 text-xs leading-6 text-subtle">
        داده‌ها از API عمومی هایپرلیکوئید و فقط‌خواندنی است. عملکرد گذشته تضمینی برای آینده نیست و پوزیشن‌ها ممکن است جای دیگری هج شده باشند. اعلان پوزیشن‌ها هر ۱۰ دقیقه بررسی می‌شود؛ برای کپی لحظه‌ای مناسب نیست و ورود دیرتر یعنی قیمت و لیکوئید متفاوت. توصیهٔ مالی نیست.
      </p>
    </Sheet>
  );
}

function ReportBody({ r }: { r: TraderReport }) {
  const c = r.curve;
  const bestMonth = c.months.reduce<PnlCurve['months'][number] | null>((b, m) => (!b || m.pnl > b.pnl ? m : b), null);
  const worstMonth = c.months.reduce<PnlCurve['months'][number] | null>((w, m) => (!w || m.pnl < w.pnl ? m : w), null);
  return (
    <div className="space-y-8">
      <Section title="عملکرد حساب" headingLevel={3}>
        <MetricGrid cols={4}>
          <Metric label="سود کل حساب" value={<MoneyValue value={c.totalPnl} compact signed tone="auto" />} />
          <Metric label="ماه‌های سودده" value={`${toFaDigits(c.positiveMonths)} از ${toFaDigits(c.months.length)}`} sub="نرخ برد ماهانه" />
          <Metric label="حداکثر افت ۱۲ ماه" value={<PercentValue value={c.maxDrawdownPct === null ? null : -c.maxDrawdownPct} digits={0} />} sub={<MoneyValue value={-c.maxDrawdownUsd} compact />} />
          <Metric label="بهترین / بدترین ماه" value={<MoneyValue value={bestMonth?.pnl} compact signed tone="auto" />} sub={<MoneyValue value={worstMonth?.pnl} compact signed tone="auto" />} />
        </MetricGrid>
        {c.months.length > 1 && <SignedBars className="mt-5" ariaLabel="سود و زیان ماهانه" values={c.months.slice(-12).map((m) => m.pnl)} labels={c.months.slice(-12).map((m) => fmtMonth(m.month))} height="h-28" />}
      </Section>

      <Section title="آمار معامله‌ها" headingLevel={3}>
        <p className="mb-3 text-xs text-muted">
          بر اساس {toFaDigits(r.fillsCount)} اجرای سفارش (fill) اخیر · از {fmtDate(r.coverageFrom)} تا {fmtDate(r.coverageTo)} · هر معامله = باز شدن تا بسته شدن کامل پوزیشن
        </p>
        <div className="mb-4 space-y-2">
          {r.verdicts.map((v, i) => (
            <Notice key={i} tone={TONE[v.tone]}>{v.text}</Notice>
          ))}
        </div>
        {r.closedCount === 0 ? (
          <Notice tone="neutral">
            در این بازه هیچ معاملهٔ کاملی بسته نشده؛ این حساب یا پوزیشن‌های بلندمدت دارد یا با سفارش‌های خیلی خردشده معامله می‌کند. برای قضاوت از «عملکرد حساب» استفاده کنید.
          </Notice>
        ) : (
          <MetricGrid cols={4}>
            <Metric label="نرخ برد" value={<PercentValue value={r.winRate} signed={false} digits={0} tone="none" />} sub={`${toFaDigits(r.wins)} برد از ${toFaDigits(r.closedCount)}`} />
            <Metric label="سود خالص معامله‌ها" value={<MoneyValue value={r.netPnl} compact signed tone="auto" />} sub={<>کارمزد <MoneyValue value={-r.fees} compact /></>} />
            <Metric label="نسبت سود به ضرر" value={fmtRatio(r.profitFactor)} sub="Profit Factor" />
            <Metric label="امید هر معامله" value={<MoneyValue value={r.expectancy} compact signed tone="auto" />} />
            <Metric label="میانگین برد" value={<MoneyValue value={r.avgWin} compact tone="gain" />} />
            <Metric label="میانگین باخت" value={<MoneyValue value={r.avgLoss} compact tone="loss" />} />
            <Metric label="بدترین معامله" value={<MoneyValue value={r.worst?.net} compact signed tone="auto" />} sub={r.worst ? r.worst.coin : undefined} />
            <Metric label="بیشترین باخت پیاپی" value={toFaDigits(r.maxLossStreak)} />
            <Metric label="میانهٔ نگهداری" value={fmtHold(r.medianHoldHours)} />
            <Metric label="معامله در روز" value={r.tradesPerDay === null ? '—' : toFaDigits(r.tradesPerDay.toFixed(1))} />
            <Metric label="سهم لانگ" value={<PercentValue value={r.longShare} signed={false} digits={0} tone="none" />} />
            <Metric label="پوزیشن‌های باز" value={toFaDigits(r.open.length)} sub="در انتهای داده" />
          </MetricGrid>
        )}
      </Section>

      {r.byCoin.length > 0 && (
        <Section title="به تفکیک دارایی" headingLevel={3}>
          <KeyValueList
            dense
            rows={r.byCoin.slice(0, 8).map((x) => ({
              label: <><bdi dir="ltr" className="font-semibold text-ink">{x.coin}</bdi> <span className="text-xs">· {toFaDigits(x.trades)} معامله · برد {toFaDigits(Math.round(x.winRate))}٪</span></>,
              value: <MoneyValue value={x.net} compact signed tone="auto" />
            }))}
          />
        </Section>
      )}

      {r.closed.length > 0 && (
        <Section title="آخرین معامله‌های بسته‌شده" headingLevel={3}>
          <KeyValueList
            dense
            rows={r.closed.slice(0, 15).map((t) => ({
              label: (
                <span className="flex flex-wrap items-center gap-1.5">
                  <bdi dir="ltr" className="font-semibold text-ink">{t.coin}</bdi>
                  <Badge tone={t.side === 'long' ? 'gain' : 'loss'}>{t.side === 'long' ? 'لانگ' : 'شورت'}</Badge>
                  <span className="text-xs">
                    <bdi dir="ltr">{fmtPx(t.entryPx)} → {fmtPx(t.exitPx)}</bdi> · {fmtHold(((t.closeTime ?? t.openTime) - t.openTime) / 3_600_000)} · {fmtDate(t.closeTime)}
                  </span>
                </span>
              ),
              value: <MoneyValue value={t.net} compact signed tone="auto" />
            }))}
          />
        </Section>
      )}
    </div>
  );
}

function fmtPx(v: number | null): string {
  if (v === null) return '—';
  return toFaDigits(v.toLocaleString('en-US', { maximumSignificantDigits: 5 }));
}

/** پوزیشن‌های باز همین الان — قلب «کپی دستی»: ورود، اندازه، اهرم، لیکوئید */
function OpenPositions({ address }: { address: string }) {
  const q = useQuery({
    queryKey: ['traders', 'state', address],
    queryFn: () => weighted(2, () => hlClearinghouseState(address), -1),
    select: (state) => positionsOf(address, false, state).sort((a, b) => b.sizeUsd - a.sizeUsd),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000
  });
  if (q.isLoading) return <ListSkeleton rows={2} className="mb-8" />;
  if (!q.data) return null;
  return (
    <Section title="پوزیشن‌های باز همین الان" headingLevel={3} className="mb-8">
      {q.data.length === 0 ? (
        <p className="text-sm text-muted">الان هیچ پوزیشن بازی ندارد.</p>
      ) : (
        <KeyValueList
          dense
          rows={q.data.slice(0, 12).map((p) => ({
            label: (
              <span className="flex flex-wrap items-center gap-1.5">
                <bdi dir="ltr" className="font-semibold text-ink">{p.coin}</bdi>
                <Badge tone={p.side === 'long' ? 'gain' : 'loss'}>{p.side === 'long' ? 'لانگ' : 'شورت'}{p.leverage ? ` ${toFaDigits(p.leverage)}x` : ''}</Badge>
                <span className="text-xs">
                  ورود <bdi dir="ltr">{fmtPrice(p.entryPx)}</bdi> · لیکوئید <bdi dir="ltr">{fmtPrice(p.liqPx)}</bdi>
                  {liqDistance(p.liqPx, p.markPx)}
                  {p.accountPct !== null ? ` · ${toFaDigits(Math.round(p.accountPct))}٪ حساب` : ''}
                </span>
              </span>
            ),
            value: (
              <span className="whitespace-nowrap text-end">
                <UsdShort value={p.sizeUsd} className="flex justify-end font-bold text-ink" />
                <UsdShort value={p.upnl} signed className={p.upnl >= 0 ? 'flex justify-end text-xs text-positive' : 'flex justify-end text-xs text-negative'} />
              </span>
            )
          }))}
        />
      )}
    </Section>
  );
}
