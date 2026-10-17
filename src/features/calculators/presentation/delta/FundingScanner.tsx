/**
 * ⑩ اسکنر فاندینگ — ایدهٔ fomohub روی صرافی‌های دارینو (آرکوس · اوندو پرپس · لایتر)
 * میانگین اسپرد ۱/۷/۳۰ روز از نرخ‌های تسویه‌شده · تعداد چرخش · ساعت‌های سودده · اسلیپیج · هشدار برعکس‌شدن
 * فقط تحلیل؛ هیچ سفارشی ثبت نمی‌شود.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { IconButton } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { toast } from '@/shared/store/toastStore';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { parseNum } from '../parse';
import { useDeltaBooks } from '@/features/calculators/data/deltaMarkets';
import { useFundingOpportunities, type Opportunity } from '@/features/calculators/data/fundingHistory';
import { currentSpreadApr, hydrateSpreadWatch, toggleWatch, useReversalAlerts, useSpreadWatch } from '@/features/calculators/data/spreadAlerts';
import type { SpreadStats } from '@/features/calculators/domain';
import { evaluateArb, logoKindOf, STABILITY, venueName } from './arbEval';

type SortKey = 'd7' | 'now' | 'stable';
const STABLE_RANK = { high: 0, medium: 1, unknown: 2, low: 3 } as const;

export function FundingScanner() {
  const books = useDeltaBooks();
  useReversalAlerts(books);
  const opportunities = useFundingOpportunities(books);
  const watched = useSpreadWatch((s) => s.entries);
  useEffect(() => {
    void hydrateSpreadWatch();
  }, []);
  const [size, setSize] = useState('2000');
  const [sort, setSort] = useState<SortKey>('d7');
  const notional = Number.isFinite(parseNum(size)) ? parseNum(size) : 0;

  const rows = useMemo(() => {
    const list = [...opportunities];
    const d7 = (o: Opportunity) => o.stats?.d7.avgApr ?? -Infinity;
    if (sort === 'now') list.sort((a, b) => b.currentApr - a.currentApr);
    else if (sort === 'stable') list.sort((a, b) => STABLE_RANK[a.stability] - STABLE_RANK[b.stability] || d7(b) - d7(a));
    else list.sort((a, b) => d7(b) - d7(a));
    return list;
  }, [opportunities, sort]);

  const loading = opportunities.length === 0;

  return (
    <div className="space-y-5">
      <Surface className="space-y-4 p-4 md:p-5">
        <p className="text-xs leading-6 text-muted">
          جفت‌هایی که اختلاف فاندینگشان <span className="font-semibold text-ink">در گذشته</span> پایدار بوده، نه فقط همین الان. اعداد از نرخ‌های واقعاً پرداخت‌شدهٔ
          هر ساعت ساخته شده‌اند. زنگ را بزنید تا اگر اختلاف برعکس شد خبر بدهیم.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ارزش هر طرف (برای اسلیپیج)">
            <Input dir="ltr" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} suffix="دلار" />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">مرتب‌سازی</p>
            <SegmentedControl<SortKey>
              label="مرتب‌سازی"
              fill
              value={sort}
              onChange={setSort}
              options={[
                { value: 'd7', label: 'میانگین ۷ روز' },
                { value: 'now', label: 'الان' },
                { value: 'stable', label: 'پایداری' }
              ]}
            />
          </div>
        </div>
      </Surface>

      {watched.length > 0 && (
        <Surface as="section" aria-labelledby="scanner-watch" className="p-4 md:p-5">
          <h3 id="scanner-watch" className="mb-1 text-sm font-bold text-ink">
            زیر نظر ({toFaDigits(watched.length)})
          </h3>
          <p className="mb-2 text-2xs text-subtle">هشدار فقط وقتی دارینو باز است کار می‌کند.</p>
          <ul className="divide-y divide-divider">
            {watched.map((e) => {
              const apr = currentSpreadApr(e, books);
              return (
                <li key={e.key} className="flex items-center gap-3 py-2 text-sm">
                  <bdi dir="ltr" className="font-latin font-bold text-ink">
                    {e.base}
                  </bdi>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    Long {venueName(e.longVenue)} · Short {venueName(e.shortVenue)}
                  </span>
                  {apr === null ? <span className="text-xs text-subtle">—</span> : <PercentValue value={apr} digits={1} className="text-sm font-bold" />}
                  <Badge tone={e.lastSign > 0 ? 'gain' : 'loss'}>{e.lastSign > 0 ? 'به نفع' : 'برعکس'}</Badge>
                  <IconButton size="sm" aria-label="حذف از فهرست هشدار" className="text-accent" onClick={() => toggleWatch(e)}>
                    <BellRing aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {books.arcus.status === 'error' || books.ondo.status === 'error' || books.lighter.status === 'error' ? (
        <Notice tone="warn" title="دادهٔ یکی از صرافی‌ها در دسترس نیست">جفت‌های آن صرافی در فهرست نیستند.</Notice>
      ) : null}

      {loading ? (
        <Surface className="space-y-3 p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </Surface>
      ) : (
        <ul className="space-y-3">
          {rows.map((o) => (
            <ScannerCard key={o.key} o={o} notional={notional} watched={watched.some((w) => w.key === o.key)} />
          ))}
        </ul>
      )}

      <Disclosure summary="این اعداد یعنی چه؟">
        <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
          <li>
            <b className="text-ink">اختلاف سالانه:</b> اگر Short را روی صرافی گران‌تر و Long را روی ارزان‌تر بگیرید، فاندینگ خالص دریافتی به درصد سالانهٔ ارزش پوزیشن.
          </li>
          <li>
            <b className="text-ink">۱ / ۷ / ۳۰ روز:</b> میانگین همان اختلاف از نرخ‌های واقعاً پرداخت‌شده. «الان» فقط نرخ لحظه‌ای است و ممکن است گمراه‌کننده باشد.
          </li>
          <li>
            <b className="text-ink">ساعت‌های سودده:</b> چند درصد ساعت‌های ۷ روز اخیر این جهت فاندینگ گرفته، نه داده.
          </li>
          <li>
            <b className="text-ink">چرخش:</b> چند بار در ۷ روز اختلاف علامتش را عوض کرده. کمتر بهتر است.
          </li>
          <li>
            <b className="text-ink">اسلیپیج:</b> هزینهٔ پر شدن سفارش بازار به این اندازه در دفتر سفارش زنده، برای ورود و خروج هر دو طرف.
          </li>
          <li>کارمزد برداشت، گس و پل در این فهرست نیست؛ در تب «سود واقعی دلتا» وارد کنید.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

function ScannerCard({ o, notional, watched }: { o: Opportunity; notional: number; watched: boolean }) {
  // ارزیابی با اهرم ۱ و سرمایه = ارزش، فقط برای اسلیپیج و کارمزد
  const r = evaluateArb(o, { capitalPerSide: notional, leverage: 1, holdDays: 7, transferCostUsd: 0 });
  const roundTripCost = r.slippage === null ? null : r.fees + r.slippage;
  const s = STABILITY[o.stability];
  return (
    <li>
      <Surface as="article" className="p-4">
        <div className="flex items-start gap-3">
          <AssetLogo symbol={o.base} kind={logoKindOf(o)} size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <bdi dir="ltr" className="font-latin text-sm font-bold text-ink">
                {o.base}
              </bdi>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              <span className="font-semibold text-positive">Long</span> {venueName(o.long.venue)} ·{' '}
              <span className="font-semibold text-negative">Short</span> {venueName(o.short.venue)}
            </p>
          </div>
          <IconButton
            size="sm"
            aria-pressed={watched}
            aria-label={watched ? 'حذف هشدار' : 'هشدار وقتی برعکس شد'}
            className={cn(watched && 'text-accent hover:text-accent')}
            onClick={() => {
              const on = toggleWatch({ key: o.key, base: o.base, shortVenue: o.short.venue, shortRef: o.short.ref, longVenue: o.long.venue, longRef: o.long.ref });
              toast('info', on ? `${o.base} زیر نظر است؛ اگر اختلاف برعکس شد خبر می‌دهیم.` : `هشدار ${o.base} حذف شد.`);
            }}
          >
            {watched ? <BellRing aria-hidden /> : <Bell aria-hidden />}
          </IconButton>
        </div>

        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Cell label="الان" value={<PercentValue value={o.currentApr} digits={1} className="font-bold" />} />
          <Cell label="۱ روز" value={<StatApr s={o.stats?.d1} loading={o.historyStatus === 'loading'} />} />
          <Cell label="۷ روز" value={<StatApr s={o.stats?.d7} loading={o.historyStatus === 'loading'} strong />} />
          <Cell label="۳۰ روز" value={<StatApr s={o.stats?.d30} loading={o.historyStatus === 'loading'} />} />
        </dl>

        <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-divider pt-2 text-center">
          <Cell
            label="ساعت‌های سودده"
            value={o.stats?.d7.profitableShare == null ? '—' : `${toFaDigits(Math.round(o.stats.d7.profitableShare * 100))}٪`}
          />
          <Cell label="چرخش ۷ روز" value={o.stats ? toFaDigits(o.stats.d7.reversals) : '—'} />
          <Cell
            label="هزینهٔ رفت‌وبرگشت"
            value={
              o.bookStatus === 'loading' ? (
                <Skeleton className="mx-auto h-4 w-12" />
              ) : roundTripCost === null ? (
                <span className="text-xs text-warn">عمق ناکافی</span>
              ) : (
                <MoneyValue value={-roundTripCost} tone="loss" digits={2} />
              )
            }
          />
        </dl>
        {o.historyStatus === 'error' && <p className="mt-2 text-2xs text-warn">تاریخچه دریافت نشد؛ فقط نرخ لحظه‌ای در دسترس است.</p>}
      </Surface>
    </li>
  );
}

function StatApr({ s, loading, strong }: { s: SpreadStats | undefined; loading: boolean; strong?: boolean }) {
  if (loading) return <Skeleton className="mx-auto h-4 w-10" />;
  if (!s || s.avgApr === null) return <span className="text-subtle">—</span>;
  return <PercentValue value={s.avgApr} digits={1} className={cn(strong && 'font-bold')} />;
}

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{value}</dd>
    </div>
  );
}
