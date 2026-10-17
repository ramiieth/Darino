/**
 * ⑧ Delta neutral — Long و Short هم‌اندازه روی یک دارایی در دو صرافی (آرکوس · اوندو پرپس · لایتر)
 * INPUT (جفت صرافی · بازار · جهت · اندازه · اهرم · مدت · دور · نوع سفارش)
 * → RESULT (سود خالص = فاندینگ − کارمزد) → دو طرف (لیکویید، فاندینگ، کارمزد) → اسکنر اختلاف فاندینگ → ریسک‌ها
 * فقط تحلیل؛ هیچ سفارشی ثبت نمی‌شود. محاسبات در domain (calcDeltaNeutral, fundingSpreads).
 */
import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { usePublishInsight } from '@/shared/assistant/insights';
import { CalcShell, ResultHero, ResultPlaceholder } from '../StatCard';
import { parseNum } from '../parse';
import { useDeltaBooks, DELTA_VENUE_LABELS, type DeltaVenue, type VenueQuote } from '@/features/calculators/data/deltaMarkets';
import { calcDeltaNeutral, fundingSpreads, type DeltaLegResult, type FundingSpread } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type Pair = 'arcus-ondo' | 'arcus-lighter' | 'ondo-lighter';
type HoldUnit = 'hour' | 'day';
type OrderType = 'maker' | 'taker';

const PAIRS: { value: Pair; label: string }[] = [
  { value: 'arcus-ondo', label: 'آرکوس ↔ اوندو' },
  { value: 'arcus-lighter', label: 'آرکوس ↔ لایتر' },
  { value: 'ondo-lighter', label: 'اوندو ↔ لایتر' }
];

/** بازار با حجم ۲۴ساعته کمتر از این مقدار «کم‌نقد» علامت می‌خورد */
const LOW_LIQUIDITY_USD = 5_000_000;
/** مارجین نگهداری محافظه‌کارانه وقتی API مقدار نمی‌دهد */
const FALLBACK_MMF = 0.05;

const num = (s: string, fallback = 0) => {
  const n = parseNum(s);
  return Number.isFinite(n) ? n : fallback;
};
const aprOf = (hourly: number | null) => (hourly === null ? null : hourly * 8760 * 100);
const logoKind = (q: VenueQuote) => (q.category === 'crypto' || q.category === 'other' ? 'crypto' : 'tradfi');
const feeOf = (q: VenueQuote, order: OrderType) => (order === 'maker' ? (q.makerFeePct ?? q.takerFeePct ?? 0) : (q.takerFeePct ?? 0));
const lowLiquidity = (s: FundingSpread<VenueQuote>) =>
  [s.a.volume24hUsd, s.b.volume24hUsd].some((v) => v !== null && v < LOW_LIQUIDITY_USD);

export function DeltaNeutralCalculator() {
  const books = useDeltaBooks();
  const [pair, setPair] = useState<Pair>('arcus-ondo');
  const [base, setBase] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [notional, setNotional] = useState('1000');
  const [leverage, setLeverage] = useState('3');
  const [hold, setHold] = useState('24');
  const [holdUnit, setHoldUnit] = useState<HoldUnit>('hour');
  const [cycles, setCycles] = useState('1');
  const [order, setOrder] = useState<OrderType>('maker');

  const [va, vb] = pair.split('-') as [DeltaVenue, DeltaVenue];
  const status = [books[va].status, books[vb].status];
  const spreads = useMemo(() => fundingSpreads(books[va].quotes, books[vb].quotes), [books, va, vb]);
  const selected = spreads.find((s) => s.base === base) ?? spreads[0] ?? null;

  const shortSide = selected ? (flipped ? (selected.shortOn === 'a' ? 'b' : 'a') : selected.shortOn) : 'a';
  const shortQ = selected ? selected[shortSide] : null;
  const longQ = selected ? selected[shortSide === 'a' ? 'b' : 'a'] : null;
  const maxLev = longQ && shortQ ? Math.min(longQ.maxLeverage ?? Infinity, shortQ.maxLeverage ?? Infinity) : Infinity;
  const levNum = num(leverage);
  const holdHours = num(hold) * (holdUnit === 'day' ? 24 : 1);
  const cyclesNum = Math.floor(num(cycles));

  const result = useMemo(() => {
    if (!longQ || !shortQ) return null;
    const leg = (q: VenueQuote) => ({
      feePct: feeOf(q, order),
      fundingHourly: q.fundingHourly ?? 0,
      maintenanceMarginFraction: q.maintenanceMarginFraction ?? FALLBACK_MMF,
      markPrice: q.markPrice
    });
    return calcDeltaNeutral({ notional: num(notional), leverage: levNum, holdHours, cycles: cyclesNum, long: leg(longQ), short: leg(shortQ) });
  }, [longQ, shortQ, order, notional, levNum, holdHours, cyclesNum]);

  usePublishInsight(
    'calculatorDeltaNeutral',
    selected ? `دلتا نوترال ${selected.a.nameFa}` : 'دلتا نوترال',
    result
      ? { net: result.net, funding: result.funding, fees: result.fees, volume: result.volume, spreadApr: result.spreadApr, capital: result.capital, nearestLiquidationPct: result.nearestLiquidationPct }
      : null
  );

  const pickMarket = (b: string) => {
    setBase(b);
    setFlipped(false);
  };

  const inputs = (
    <>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">دو صرافی</p>
        <SegmentedControl<Pair>
          label="جفت صرافی"
          fill
          size="sm"
          value={pair}
          onChange={(p) => {
            setPair(p);
            setBase(null);
            setFlipped(false);
          }}
          options={PAIRS}
        />
      </div>

      <Field label="بازار (مشترک در هر دو صرافی)">
        <Select value={selected?.base ?? ''} onChange={(e) => pickMarket(e.target.value)} disabled={!spreads.length}>
          {!spreads.length && <option value="">—</option>}
          {spreads.map((s) => (
            <option key={s.base} value={s.base}>
              {s.base} · {s.a.nameFa} · اختلاف {toFaDigits(s.spreadApr.toFixed(1))}٪ سالانه
            </option>
          ))}
        </Select>
      </Field>

      {longQ && shortQ && (
        <div className="flex items-center justify-between gap-3 rounded-field bg-surface-2/70 px-3.5 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="font-semibold text-positive">Long</span> روی {DELTA_VENUE_LABELS[longQ.venue]}
            <span className="mx-1.5 text-subtle">·</span>
            <span className="font-semibold text-negative">Short</span> روی {DELTA_VENUE_LABELS[shortQ.venue]}
          </span>
          <Button variant="ghost" size="sm" className="shrink-0 text-accent" icon={<ArrowLeftRight />} onClick={() => setFlipped((f) => !f)}>
            جابه‌جایی
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="ارزش هر طرف">
          <Input dir="ltr" inputMode="decimal" value={notional} onChange={(e) => setNotional(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="اهرم (هر دو طرف)">
          <Input dir="ltr" inputMode="decimal" value={leverage} onChange={(e) => setLeverage(e.target.value)} suffix="×" invalid={levNum > maxLev} />
        </Field>
      </div>
      {levNum > maxLev && <p className="-mt-3 text-xs text-negative">حداکثر اهرم مشترک این بازار {toFaDigits(maxLev)} برابر است.</p>}

      <div className="grid grid-cols-2 gap-4">
        <Field label="مدت نگهداری هر دور">
          <Input dir="ltr" inputMode="decimal" value={hold} onChange={(e) => setHold(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">واحد</p>
          <SegmentedControl<HoldUnit>
            label="واحد مدت"
            fill
            value={holdUnit}
            onChange={setHoldUnit}
            options={[
              { value: 'hour', label: 'ساعت' },
              { value: 'day', label: 'روز' }
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="تعداد دور (باز و بسته)">
          <Input dir="ltr" inputMode="numeric" value={cycles} onChange={(e) => setCycles(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">نوع سفارش</p>
          <SegmentedControl<OrderType>
            label="نوع سفارش"
            fill
            value={order}
            onChange={setOrder}
            options={[
              { value: 'maker', label: 'میکر / TWAP' },
              { value: 'taker', label: 'تیکر' }
            ]}
          />
        </div>
      </div>
      <p className="-mt-3 text-2xs leading-5 text-subtle">
        ربات Tread.fi حداقل ۵۰۰ دلار برای هر طرف می‌خواهد. TWAP با سفارش‌های محدود معمولاً کارمزد میکر می‌گیرد؛ ربیت منفی در محاسبه صفر فرض می‌شود.
      </p>
    </>
  );

  const loading = status.includes('loading') && !spreads.length;
  const failed = status.map((s, i) => (s === 'error' ? [va, vb][i] : null)).filter((v): v is DeltaVenue => v !== null);

  return (
    <CalcShell inputs={inputs}>
      {failed.length > 0 && (
        <Notice tone="warn" title={`دادهٔ ${failed.map((v) => DELTA_VENUE_LABELS[v]).join(' و ')} در دسترس نیست`}>
          اتصال به این صرافی برقرار نشد. کمی بعد دوباره امتحان کنید یا جفت صرافی دیگری انتخاب کنید.
        </Notice>
      )}

      {loading ? (
        <Surface className="space-y-3 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-16 w-full" />
        </Surface>
      ) : !result || !longQ || !shortQ || !selected ? (
        <ResultPlaceholder>بازار مشترکی با نرخ فاندینگ معلوم بین این دو صرافی پیدا نشد.</ResultPlaceholder>
      ) : (
        <>
          <ResultHero
            label="سود خالص (فاندینگ − کارمزد)"
            value={<MoneyValue value={result.net} signed tone="auto" />}
            sub={
              <>
                سرمایهٔ لازم <MoneyValue value={result.capital} className="font-semibold text-ink" />
                {result.aprOnCapital !== null && (
                  <>
                    {' '}
                    · بازده سالانه روی سرمایه <PercentValue value={result.aprOnCapital} digits={1} className="font-semibold" />
                  </>
                )}
              </>
            }
            aside={
              <div className="flex items-center gap-2">
                <AssetLogo symbol={selected.base} kind={logoKind(selected.a)} size={36} />
                <div className="min-w-0">
                  <bdi dir="ltr" className="block font-latin text-sm font-bold text-ink">
                    {selected.base}
                  </bdi>
                  <span className="block truncate text-xs text-muted">{selected.a.nameFa}</span>
                </div>
              </div>
            }
          >
            <MetricGrid cols={3}>
              <Metric label="خالص فاندینگ" value={<MoneyValue value={result.funding} signed tone="auto" />} />
              <Metric label="کل کارمزد" value={<MoneyValue value={-result.fees} tone={result.fees > 0 ? 'loss' : 'none'} />} />
              <Metric label="حجم ساخته‌شده (دو صرافی)" value={<MoneyValue value={result.volume} compact />} />
              <Metric label="اختلاف فاندینگ سالانه" value={<PercentValue value={result.spreadApr} digits={1} />} />
              <Metric
                label="سربه‌سر کارمزد"
                value={result.breakEvenHours === null ? <span className="text-negative">هرگز</span> : `${toFaDigits(result.breakEvenHours.toFixed(1))} ساعت`}
              />
              <Metric label="کارمزد هر ۱ میلیون دلار حجم" value={<MoneyValue value={result.costPerMillion} />} />
            </MetricGrid>
          </ResultHero>

          {result.net < 0 && (
            <Notice tone="warn" title="این حجم بدون پوینت زیان‌ده است">
              برای سربه‌سر شدن، پوینت/ایردراپ این حجم باید دست‌کم <MoneyValue value={result.breakEvenPoints} className="font-semibold text-ink" /> بیرزد.
            </Notice>
          )}
          {result.breakEvenHours !== null && result.breakEvenHours > holdHours && result.net < 0 && holdHours > 0 && (
            <p className="-mt-2 px-1 text-xs text-muted">
              با این اختلاف فاندینگ، نگه‌داشتن هر دور دست‌کم {toFaDigits(Math.ceil(result.breakEvenHours))} ساعت کارمزد را جبران می‌کند.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <LegCard side="long" quote={longQ} r={result.long} feePct={feeOf(longQ, order)} />
            <LegCard side="short" quote={shortQ} r={result.short} feePct={feeOf(shortQ, order)} />
          </div>

          {result.basisPct !== null && (
            <p className="px-1 text-xs leading-5 text-muted">
              اختلاف قیمت مارک دو صرافی: <PercentValue value={result.basisPct} digits={3} tone="none" className="font-semibold text-ink" />{' '}
              {result.basisPct >= 0 ? '(Short گران‌تر فروخته می‌شود — به نفع شما اگر همگرا شود)' : '(Short ارزان‌تر فروخته می‌شود — هزینه هنگام همگرایی)'}؛ در سود خالص لحاظ نشده است.
            </p>
          )}

          <Scanner spreads={spreads} venues={[va, vb]} selected={selected.base} onPick={pickMarket} />

          <Notice tone="info" title="ریسک‌هایی که دلتا نوترال حذف نمی‌کند">
            <ul className="list-disc space-y-1 ps-4">
              <li>
                هر طرف مارجین جدا در صرافی خودش دارد؛ با حرکت حدود {result.nearestLiquidationPct === null ? '—' : `${toFaDigits(result.nearestLiquidationPct.toFixed(1))}٪`} قیمت، طرف بازنده لیکویید می‌شود و سود طرف دیگر در صرافی دیگر می‌ماند.
              </li>
              <li>نرخ‌های فاندینگ لحظه‌ای‌اند و هر ساعت عوض می‌شوند؛ اختلاف امروز ممکن است فردا برعکس شود.</li>
              <li>بازارهای سهام خارج از ساعت معاملات بورس سقف قیمت و مارجین متفاوت دارند؛ نقدشوندگی بازارهای کوچک کم است.</li>
              <li>ربات‌های اجرا (مثل Tread.fi) کلید API با مجوز معامله می‌خواهند؛ ارزش پوینت و ایردراپ تضمینی نیست.</li>
            </ul>
          </Notice>
        </>
      )}
    </CalcShell>
  );
}

function LegCard({ side, quote, r, feePct }: { side: 'long' | 'short'; quote: VenueQuote; r: DeltaLegResult; feePct: number }) {
  const long = side === 'long';
  return (
    <Surface as="article" className="p-4 md:p-5">
      <h3 className="mb-1 flex items-center justify-between gap-2 text-sm font-bold text-ink">
        <span className={long ? 'text-positive' : 'text-negative'}>{long ? 'Long' : 'Short'}</span>
        <Badge tone="neutral">{DELTA_VENUE_LABELS[quote.venue]}</Badge>
      </h3>
      <KeyValueList
        dense
        rows={[
          { label: 'قیمت مارک', value: <MoneyValue value={quote.markPrice} /> },
          { label: 'فاندینگ سالانه', value: <PercentValue value={aprOf(quote.fundingHourly)} digits={1} tone="none" />, hint: long ? 'مثبت = لانگ می‌پردازد' : 'مثبت = شورت دریافت می‌کند' },
          { label: 'کارمزد هر معامله', value: <PercentValue value={feePct} digits={4} signed={false} tone="none" /> },
          { label: 'فاندینگ دوره', value: <MoneyValue value={r.funding} signed tone="auto" /> },
          { label: 'کارمزد دوره', value: <MoneyValue value={-r.fees} tone={r.fees > 0 ? 'loss' : 'none'} /> },
          { label: 'مارجین', value: <MoneyValue value={r.margin} /> },
          {
            label: 'فاصله تا لیکویید',
            value: r.liquidationMovePct === null ? '—' : `${long ? 'ریزش' : 'رشد'} ${toFaDigits(r.liquidationMovePct.toFixed(1))}٪`,
            emphasis: true
          }
        ]}
      />
    </Surface>
  );
}

function Scanner({
  spreads,
  venues,
  selected,
  onPick
}: {
  spreads: FundingSpread<VenueQuote>[];
  venues: [DeltaVenue, DeltaVenue];
  selected: string;
  onPick: (base: string) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = all ? spreads : spreads.slice(0, 8);
  return (
    <Surface as="section" aria-labelledby="delta-scanner" className="p-4 md:p-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id="delta-scanner" className="text-sm font-bold text-ink">
          بیشترین اختلاف فاندینگ
        </h3>
        <span className="text-2xs text-subtle">
          {toFaDigits(spreads.length)} بازار مشترک {DELTA_VENUE_LABELS[venues[0]]} و {DELTA_VENUE_LABELS[venues[1]]}
        </span>
      </div>
      <ul className="divide-y divide-divider">
        {rows.map((s) => {
          const active = s.base === selected;
          const shortVenue = s[s.shortOn].venue;
          return (
            <li key={s.base}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onPick(s.base)}
                className={cn(
                  '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-field px-2 py-2.5 text-start transition-colors duration-fast',
                  active ? 'bg-accent-soft' : 'hover:bg-surface-2/60'
                )}
              >
                <AssetLogo symbol={s.base} kind={logoKind(s.a)} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <bdi dir="ltr" className={cn('font-latin text-sm font-bold', active ? 'text-accent' : 'text-ink')}>
                      {s.base}
                    </bdi>
                    {lowLiquidity(s) && <Badge tone="warn">کم‌نقد</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">Short روی {DELTA_VENUE_LABELS[shortVenue]}</span>
                </span>
                <span className="shrink-0 text-end">
                  <PercentValue value={s.spreadApr} digits={1} signed={false} tone={s.spreadApr > 0 ? 'gain' : 'none'} className="text-sm font-bold" />
                  <span className="block text-2xs text-subtle">سالانه</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {spreads.length > 8 && (
        <Button variant="ghost" size="sm" className="mt-2 text-accent" onClick={() => setAll((v) => !v)}>
          {all ? 'نمایش کمتر' : `نمایش همه (${toFaDigits(spreads.length)})`}
        </Button>
      )}
    </Surface>
  );
}
