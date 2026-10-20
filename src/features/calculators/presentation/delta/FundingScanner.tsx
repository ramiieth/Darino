/**
 * ⑩ اسکنر فاندینگ — ایدهٔ fomohub روی صرافی‌های دارینو (آرکوس · اوندو پرپس · لایتر · لایتر رابین‌هود · هایپرلیکوئید)
 * میانگین اسپرد ۱/۷/۳۰ روز از نرخ‌های تسویه‌شده · تعداد چرخش · ساعت‌های سودده · اسلیپیج · هشدار برعکس‌شدن
 * حالت «فارم پوینت»: یک طرف روی آرکوس یا لایتر رابین‌هود، ارزان‌ترین پوشش با سود خالص ۷ روز پس از کارمزد و اسلیپیج
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
import { useDeltaBooks, type DeltaVenue } from '@/features/calculators/data/deltaMarkets';
import { farmPairs, POINTS_VENUES, SCAN_PAIRS, useFundingOpportunities, type Opportunity, type PointsVenue } from '@/features/calculators/data/fundingHistory';
import { currentSpreadApr, hydrateSpreadWatch, toggleWatch, useReversalAlerts, useSpreadWatch } from '@/features/calculators/data/spreadAlerts';
import type { SpreadStats } from '@/features/calculators/domain';
import { evaluateArb, farmCostPer100k, logoKindOf, STABILITY, venueName } from './arbEval';

type SortKey = 'd7' | 'now' | 'stable' | 'net';
type Mode = 'funding' | PointsVenue;
const STABLE_RANK = { high: 0, medium: 1, unknown: 2, low: 3 } as const;
/** سرور هشدار فقط این صرافی‌ها را می‌شناسد */
const ALERT_VENUES = ['arcus', 'ondo', 'lighter'] as const;
const isAlertVenue = (v: DeltaVenue): v is (typeof ALERT_VENUES)[number] => (ALERT_VENUES as readonly DeltaVenue[]).includes(v);
const HOLD_DAYS = 7;
/** ارزیابی کارت‌ها: اهرم ۱ و سرمایه = ارزش، نگهداری ۷ روز با میانگین ۷ روز؛ کارمزد تیکر (محافظه‌کارانه) */
const evalCard = (o: Opportunity, notional: number) => evaluateArb(o, { capitalPerSide: notional, leverage: 1, holdDays: HOLD_DAYS, transferCostUsd: 0 });

export function FundingScanner() {
  const books = useDeltaBooks();
  useReversalAlerts(books);
  const [mode, setMode] = useState<Mode>('funding');
  const pairs = useMemo(() => (mode === 'funding' ? SCAN_PAIRS : farmPairs(mode)), [mode]);
  const opportunities = useFundingOpportunities(books, 12, pairs, mode === 'funding' ? 'spread' : 'farm');
  const watched = useSpreadWatch((s) => s.entries);
  useEffect(() => {
    void hydrateSpreadWatch();
  }, []);
  const [size, setSize] = useState('2000');
  const [sort, setSort] = useState<SortKey>('d7');
  const notional = Number.isFinite(parseNum(size)) ? parseNum(size) : 0;
  const changeMode = (m: Mode) => {
    setMode(m);
    setSort(m === 'funding' ? 'd7' : 'net');
  };

  const rows = useMemo(() => {
    const list = [...opportunities];
    const d7 = (o: Opportunity) => o.stats?.d7.avgApr ?? -Infinity;
    const net = new Map(list.map((o) => [o.key, evalCard(o, notional).net ?? -Infinity]));
    if (sort === 'now') list.sort((a, b) => b.currentApr - a.currentApr);
    else if (sort === 'stable') list.sort((a, b) => STABLE_RANK[a.stability] - STABLE_RANK[b.stability] || d7(b) - d7(a));
    else if (sort === 'net') list.sort((a, b) => net.get(b.key)! - net.get(a.key)!);
    else list.sort((a, b) => d7(b) - d7(a));
    return list;
  }, [opportunities, sort, notional]);
  const farm = mode !== 'funding';

  const loading = opportunities.length === 0;

  return (
    <div className="space-y-5">
      <Surface className="space-y-4 p-4 md:p-5">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">هدف</p>
          <SegmentedControl<Mode>
            label="هدف اسکنر"
            fill
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'funding', label: 'سود فاندینگ' },
              { value: 'arcus', label: 'پوینت آرکوس' },
              { value: 'lighterRh', label: 'پوینت لایتر رابین‌هود' }
            ]}
          />
        </div>
        {farm ? (
          <p className="text-xs leading-6 text-muted">
            یک طرف روی <span className="font-semibold text-ink">{venueName(mode)}</span> برای حجم و پوینت، طرف دیگر روی هر صرافی که پوشش ارزان‌تری بدهد. فقط بازارهای پرحجم
            (بیش از ۱ میلیون دلار در ۲۴ ساعت) آمده‌اند. «سود/هزینهٔ ۷ روز» با میانگین فاندینگ واقعاً پرداخت‌شدهٔ ۷ روز گذشته، کارمزد سفارش فوری و اسلیپیج دفتر سفارش زنده حساب
            شده است؛ هدف، سود کم یا کمترین هزینه برای همان حجم است.
          </p>
        ) : (
          <p className="text-xs leading-6 text-muted">
            جفت‌هایی که اختلاف فاندینگشان <span className="font-semibold text-ink">در گذشته</span> پایدار بوده، نه فقط همین الان. اعداد از نرخ‌های واقعاً پرداخت‌شدهٔ
            هر ساعت ساخته شده‌اند. زنگ را بزنید تا اگر اختلاف برعکس شد خبر بدهیم.
          </p>
        )}
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
                { value: 'net', label: 'کمترین هزینه' },
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

      {[...new Set(pairs.flat())].some((v) => books[v].status === 'error') ? (
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
            <ScannerCard key={o.key} o={o} notional={notional} farm={farm} watched={watched.some((w) => w.key === o.key)} />
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
          <li>
            <b className="text-ink">هزینهٔ هر ۱۰۰ هزار دلار حجم:</b> در حالت پوینت، سود یا هزینهٔ خالص ۷ روز تقسیم بر حجمی که روی صرافی پوینت ساخته می‌شود (باز و بسته
            کردن = ۲ برابر ارزش هر طرف). عدد کمتر یعنی پوینت ارزان‌تر.
          </li>
          <li>
            <b className="text-ink">HIP-3:</b> بازار هایپرلیکوئید که یک سازندهٔ شخص ثالث راه انداخته؛ قیمت مرجع (اوراکل) و قواعدش دست اوست و ریسک بیشتری دارد.
          </li>
          <li>کارمزد برداشت، گس و پل در این فهرست نیست؛ در تب «سود واقعی دلتا» وارد کنید.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

function ScannerCard({ o, notional, farm, watched }: { o: Opportunity; notional: number; farm: boolean; watched: boolean }) {
  const r = evalCard(o, notional);
  const roundTripCost = r.slippage === null ? null : r.fees + r.slippage;
  const per100k = farmCostPer100k(r.net, notional);
  const s = STABILITY[o.stability];
  const hip3 = o.long.builderDex ?? o.short.builderDex ?? null;
  const shortVenue = o.short.venue;
  const longVenue = o.long.venue;
  const isPoints = (v: DeltaVenue) => (POINTS_VENUES as readonly DeltaVenue[]).includes(v);
  const doublePoints = farm && isPoints(shortVenue) && isPoints(longVenue);
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
              {doublePoints && <Badge tone="gain">پوینت در هر دو طرف</Badge>}
              {hip3 && (
                <Badge tone="warn">
                  <bdi dir="ltr">HIP-3 · {hip3}</bdi>
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              <span className="font-semibold text-positive">Long</span> {venueName(o.long.venue)} ·{' '}
              <span className="font-semibold text-negative">Short</span> {venueName(o.short.venue)}
            </p>
          </div>
          {isAlertVenue(shortVenue) && isAlertVenue(longVenue) && (
          <IconButton
            size="sm"
            aria-pressed={watched}
            aria-label={watched ? 'حذف هشدار' : 'هشدار وقتی برعکس شد'}
            className={cn(watched && 'text-accent hover:text-accent')}
            onClick={() => {
              const on = toggleWatch({ key: o.key, base: o.base, shortVenue, shortRef: o.short.ref, longVenue, longRef: o.long.ref });
              toast('info', on ? `${o.base} زیر نظر است؛ اگر اختلاف برعکس شد خبر می‌دهیم.` : `هشدار ${o.base} حذف شد.`);
            }}
          >
            {watched ? <BellRing aria-hidden /> : <Bell aria-hidden />}
          </IconButton>
          )}
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
        {farm && (
          <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-divider pt-2 text-center">
            <Cell
              label="سود/هزینهٔ خالص ۷ روز"
              value={
                o.bookStatus === 'loading' || o.historyStatus === 'loading' ? (
                  <Skeleton className="mx-auto h-4 w-12" />
                ) : r.net === null ? (
                  '—'
                ) : (
                  <MoneyValue value={r.net} tone={r.net >= 0 ? 'gain' : 'loss'} digits={2} className="font-bold" />
                )
              }
            />
            <Cell
              label="هزینهٔ هر ۱۰۰ هزار دلار حجم"
              value={
                per100k === null ? (
                  '—'
                ) : per100k <= 0 ? (
                  <span className="font-semibold text-positive">سودده</span>
                ) : (
                  <MoneyValue value={-per100k} tone="loss" digits={2} />
                )
              }
            />
          </dl>
        )}
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
