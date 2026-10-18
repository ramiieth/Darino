/**
 * ⑧ Delta neutral — Long و Short هم‌ارزش روی یک دارایی در دو صرافی (آرکوس · اوندو پرپس · لایتر)
 * INPUT (بازار و جهت · سرمایه و اندازه · زمان · هزینه‌ها · سناریوی خروج)
 * → سود خالص تخمینی و سرمایهٔ نهایی → مسیر سرمایه → وضعیت پوزیشن و دلتا → حساسیت → اسکنر → ریسک‌ها
 * فقط تحلیل؛ هیچ سفارشی ثبت نمی‌شود و به حساب کاربر وصل نیست. محاسبات در domain (calcDeltaNeutral, deltaSensitivity, fundingSpreads).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { usePublishInsight } from '@/shared/assistant/insights';
import { CalcShell, ResultHero, ResultPlaceholder } from '../StatCard';
import { parseNum } from '../parse';
import { useDeltaBooks, DELTA_VENUE_LABELS, type DeltaVenue, type VenueQuote } from '@/features/calculators/data/deltaMarkets';
import {
  calcDeltaNeutral,
  deltaSensitivity,
  fundingSpreads,
  type DeltaDriver,
  type DeltaInput,
  type DeltaLegResult,
  type DeltaResult,
  type ExitBasis,
  type FundingSpread
} from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { FALLBACK_MMF, FALLBACK_TAKER_PCT } from './arbEval';
import { CapitalFlow, SourceTag, type FlowLine } from './CapitalFlow';
import { ScenarioTable } from './ScenarioTable';

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
const SENS_MOVES = [-25, -10, 0, 10, 25];
const SENS_HOLDS = [8, 24, 168, 720];

const DRIVER_LABEL: Record<DeltaDriver, string> = {
  price: 'سود/زیان قیمت (سناریوی خروج)',
  funding: 'فاندینگ',
  fees: 'کارمزد',
  slippage: 'اسلیپیج'
};

const aprOf = (hourly: number | null) => (hourly === null ? null : hourly * 8760 * 100);
const logoKind = (q: VenueQuote) => (q.category === 'crypto' || q.category === 'other' ? 'crypto' : 'tradfi');
/** کارمزد هر معامله (٪) — نبودِ دادهٔ API صفر فرض نمی‌شود */
const feeOf = (q: VenueQuote, order: OrderType): { pct: number; assumed: boolean } => {
  const v = order === 'maker' ? (q.makerFeePct ?? q.takerFeePct) : q.takerFeePct;
  return v === null ? { pct: FALLBACK_TAKER_PCT, assumed: true } : { pct: v, assumed: false };
};
const lowLiquidity = (s: FundingSpread<VenueQuote>) =>
  [s.a.volume24hUsd, s.b.volume24hUsd].some((v) => v !== null && v < LOW_LIQUIDITY_USD);
const holdLabel = (h: number) => (h < 24 ? `${toFaDigits(h)} ساعت` : `${toFaDigits(h / 24)} روز`);

/** گروه ورودی‌ها با عنوان کوچک */
function InputGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="space-y-4 border-t border-divider pt-4 first:border-t-0 first:pt-0">
      <p aria-hidden className="text-2xs font-bold text-subtle">
        {title}
      </p>
      {children}
    </div>
  );
}

export function DeltaNeutralCalculator() {
  const books = useDeltaBooks();
  const [pair, setPair] = useState<Pair>('arcus-ondo');
  const [base, setBase] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [notional, setNotional] = useState('1000');
  const [leverage, setLeverage] = useState('3');
  const [available, setAvailable] = useState('');
  const [hold, setHold] = useState('24');
  const [holdUnit, setHoldUnit] = useState<HoldUnit>('hour');
  const [cycles, setCycles] = useState('1');
  const [order, setOrder] = useState<OrderType>('maker');
  const [slippage, setSlippage] = useState('0');
  const [move, setMove] = useState('0');
  const [exitBasis, setExitBasis] = useState<ExitBasis>('keep');

  const [va, vb] = pair.split('-') as [DeltaVenue, DeltaVenue];
  const status = [books[va].status, books[vb].status];
  const spreads = useMemo(() => fundingSpreads(books[va].quotes, books[vb].quotes), [books, va, vb]);
  const selected = spreads.find((s) => s.base === base) ?? spreads[0] ?? null;

  const shortSide = selected ? (flipped ? (selected.shortOn === 'a' ? 'b' : 'a') : selected.shortOn) : 'a';
  const shortQ = selected ? selected[shortSide] : null;
  const longQ = selected ? selected[shortSide === 'a' ? 'b' : 'a'] : null;
  const maxLev = longQ && shortQ ? Math.min(longQ.maxLeverage ?? Infinity, shortQ.maxLeverage ?? Infinity) : Infinity;

  const n = {
    notional: parseNum(notional),
    leverage: parseNum(leverage),
    available: available.trim() === '' ? null : parseNum(available),
    hold: parseNum(hold),
    cycles: parseNum(cycles),
    slippage: parseNum(slippage),
    move: parseNum(move)
  };
  const errors = {
    notional: !(n.notional > 0) ? 'ارزش هر طرف باید بیشتر از صفر باشد.' : null,
    leverage: !(n.leverage > 0) ? 'اهرم باید بیشتر از صفر باشد.' : n.leverage > maxLev ? `حداکثر اهرم مشترک این بازار ${toFaDigits(maxLev)} برابر است.` : null,
    available: n.available !== null && !(n.available > 0) ? 'عدد مثبت وارد کنید یا خالی بگذارید.' : null,
    hold: !(n.hold >= 0) ? 'مدت نمی‌تواند منفی باشد.' : null,
    cycles: !(n.cycles >= 1) || !Number.isInteger(n.cycles) ? 'تعداد دور باید عدد صحیح ۱ یا بیشتر باشد.' : null,
    slippage: !(n.slippage >= 0) ? 'اسلیپیج نمی‌تواند منفی باشد.' : null,
    move: !Number.isFinite(n.move) || n.move <= -100 ? 'حرکت قیمت باید بیشتر از −۱۰۰٪ باشد.' : null
  };
  // اهرمِ بیش از سقف هشدار است، نه مانع محاسبه
  const blocking = Object.entries(errors).some(([k, e]) => e !== null && !(k === 'leverage' && n.leverage > 0));
  const holdHours = (n.hold || 0) * (holdUnit === 'day' ? 24 : 1);
  const longFee = longQ ? feeOf(longQ, order) : null;
  const shortFee = shortQ ? feeOf(shortQ, order) : null;

  const calcInput = useMemo<DeltaInput | null>(() => {
    if (!longQ || !shortQ || !longFee || !shortFee || blocking) return null;
    const leg = (q: VenueQuote, fee: number) => ({
      feePct: fee,
      fundingHourly: q.fundingHourly ?? 0,
      maintenanceMarginFraction: q.maintenanceMarginFraction ?? FALLBACK_MMF,
      markPrice: q.markPrice
    });
    return {
      notional: n.notional,
      leverage: n.leverage,
      holdHours,
      cycles: n.cycles,
      long: leg(longQ, longFee.pct),
      short: leg(shortQ, shortFee.pct),
      slippagePct: n.slippage,
      exit: { priceMovePct: n.move, basis: exitBasis },
      availableCapital: n.available
    };
  }, [longQ, shortQ, longFee?.pct, shortFee?.pct, blocking, n.notional, n.leverage, holdHours, n.cycles, n.slippage, n.move, exitBasis, n.available]);
  const result = useMemo(() => (calcInput ? calcDeltaNeutral(calcInput) : null), [calcInput]);
  const sens = useMemo(() => (calcInput ? deltaSensitivity(calcInput, SENS_MOVES, SENS_HOLDS) : null), [calcInput]);

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
      <InputGroup title="بازار و جهت">
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
      </InputGroup>

      <InputGroup title="سرمایه و اندازه">
        <div className="grid grid-cols-2 gap-4">
          <Field label="ارزش اسمی هر طرف" error={errors.notional}>
            <Input dir="ltr" inputMode="decimal" value={notional} onChange={(e) => setNotional(e.target.value)} suffix="دلار" />
          </Field>
          <Field label="اهرم (هر دو طرف)" error={errors.leverage}>
            <Input dir="ltr" inputMode="decimal" value={leverage} onChange={(e) => setLeverage(e.target.value)} suffix="×" />
          </Field>
        </div>
        <Field label="کل سرمایهٔ در دسترس (اختیاری)" error={errors.available}>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={available}
            onChange={(e) => setAvailable(e.target.value)}
            placeholder={result ? String(Math.round(result.capital * 100) / 100) : ''}
            suffix="دلار"
          />
        </Field>
        <p className="-mt-3 text-2xs leading-5 text-subtle">
          مارجین لازم = ۲ × ارزش ÷ اهرم. خالی = همان مارجین لازم، مبنای بازده. با عدد بزرگ‌تر، سرمایهٔ آزاد و بازده روی کل سرمایه دیده می‌شود.
        </p>
      </InputGroup>

      <InputGroup title="زمان">
        <div className="grid grid-cols-2 gap-4">
          <Field label="مدت نگهداری هر دور" error={errors.hold}>
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
        <Field label="تعداد دور (باز و بسته)" error={errors.cycles}>
          <Input dir="ltr" inputMode="numeric" value={cycles} onChange={(e) => setCycles(e.target.value)} />
        </Field>
      </InputGroup>

      <InputGroup title="هزینه‌ها">
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
        <Field label="اسلیپیج هر معامله (تخمین شما)" error={errors.slippage}>
          <Input dir="ltr" inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} suffix="٪" />
        </Field>
        <p className="-mt-3 text-2xs leading-5 text-subtle">
          کارمزد از API همان صرافی می‌آید؛ ربیت منفی صفر فرض می‌شود. سفارش محدود (میکر/TWAP) معمولاً اسلیپیج ندارد؛ برای تیکر عددی وارد کنید. ربات Tread.fi حداقل ۵۰۰ دلار برای هر طرف می‌خواهد.
        </p>
      </InputGroup>

      <InputGroup title="سناریوی خروج (هر دور)">
        <Field label="تغییر قیمت تا خروج" error={errors.move}>
          <Input dir="ltr" inputMode="decimal" value={move} onChange={(e) => setMove(e.target.value)} suffix="٪" />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">اختلاف قیمت دو صرافی در خروج</p>
          <SegmentedControl<ExitBasis>
            label="اختلاف قیمت در خروج"
            fill
            value={exitBasis}
            onChange={setExitBasis}
            options={[
              { value: 'keep', label: 'ثابت می‌ماند' },
              { value: 'converge', label: 'صفر می‌شود' }
            ]}
          />
        </div>
      </InputGroup>
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
      ) : !longQ || !shortQ || !selected ? (
        <ResultPlaceholder>بازار مشترکی با نرخ فاندینگ معلوم بین این دو صرافی پیدا نشد.</ResultPlaceholder>
      ) : !result || !sens || !longFee || !shortFee ? (
        <ResultPlaceholder>ورودی‌های قرمزشده را اصلاح کنید تا نتیجه محاسبه شود.</ResultPlaceholder>
      ) : (
        <>
          <ResultHero
            label="سود خالص تخمینی پس از بستن"
            value={<MoneyValue value={result.net} signed tone="auto" digits={2} />}
            sub={
              <>
                سرمایهٔ نهایی <MoneyValue value={result.ledger.finalEquity} digits={2} className="font-semibold text-ink" /> · بازده خالص{' '}
                <PercentValue value={result.ledger.roiPct} digits={2} className="font-semibold" /> روی{' '}
                {n.available !== null ? 'کل سرمایهٔ شما' : 'مارجین دو طرف'}
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-subtle">
                  <SourceTag kind="estimate" /> نرخ فاندینگ لحظه‌ای، کارمزد صرافی و سناریوی خروج شما — نه سود تحقق‌یافته
                </span>
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
              <Metric label="سود/زیان قیمت (ناخالص)" value={<MoneyValue value={result.pricePnl} signed tone="auto" digits={2} />} />
              <Metric label="فاندینگ خالص" value={<MoneyValue value={result.funding} signed tone="auto" digits={2} />} />
              <Metric label="کل هزینه‌ها" value={<MoneyValue value={-result.ledger.totalCosts} tone={result.ledger.totalCosts > 0 ? 'loss' : 'none'} digits={2} />} />
              <Metric
                label="بازده سالانهٔ فاندینگ پس از هزینه"
                value={<PercentValue value={result.aprOnCapital} digits={1} />}
                sub="روی مارجین، بدون سود قیمت"
              />
              <Metric
                label="سربه‌سر هزینه‌ها"
                value={result.breakEvenHours === null ? <span className="text-negative">هرگز</span> : `${toFaDigits(result.breakEvenHours.toFixed(1))} ساعت`}
                sub="نگهداری هر دور"
              />
              <Metric label="حجم ساخته‌شده (دو صرافی)" value={<MoneyValue value={result.volume} compact />} />
            </MetricGrid>
          </ResultHero>

          <Warnings result={result} holdHours={holdHours} feeAssumed={longFee.assumed || shortFee.assumed} mmfAssumed={longQ.maintenanceMarginFraction === null || shortQ.maintenanceMarginFraction === null} />

          <CapitalFlow
            base={result.ledger.baseCapital}
            margin={result.capital}
            allocation={allocationLines(result, longQ, shortQ, n.available !== null)}
            pnl={pnlLines(result, longQ, shortQ, n.slippage)}
            settlement={settlementLines(result, longQ, shortQ)}
            footnote="سود تحقق‌یافته و تحقق‌نیافتهٔ پوزیشن‌های واقعی شما این‌جا نیست: ماشین‌حساب به حساب صرافی وصل نیست و همهٔ اعداد تخمین پیش از معامله‌اند. فاندینگ روی ارزش ورود حساب می‌شود. پرپ هزینهٔ استقراض یا بهرهٔ جدا ندارد (فاندینگ همان هزینهٔ نگهداری است). هزینهٔ واریز، برداشت و گس این‌جا نیست؛ در تب «سود واقعی دلتا» وارد کنید."
          />

          <Position result={result} longQ={longQ} shortQ={shortQ} longFee={longFee} shortFee={shortFee} />

          <Sensitivity result={result} sens={sens} move={n.move} hold={holdHours} />

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

/* ---------------- هشدارها ---------------- */

function Warnings({ result, holdHours, feeAssumed, mmfAssumed }: { result: DeltaResult; holdHours: number; feeAssumed: boolean; mmfAssumed: boolean }) {
  return (
    <>
      {result.capitalShortfall && (
        <Notice tone="error" title="سرمایهٔ در دسترس کمتر از مارجین لازم است">
          برای این اندازه و اهرم <MoneyValue value={result.capital} digits={2} className="font-semibold text-ink" /> مارجین لازم است. اندازه را کم یا اهرم را زیاد کنید.
        </Notice>
      )}
      {result.liquidated && (
        <Notice tone="error" title="در این سناریو یک طرف لیکویید می‌شود">
          تخمین محافظه‌کارانه: کل مارجین طرف بازنده از دست می‌رود و فاندینگ آن طرف متوقف می‌شود. عدد واقعی به زمان و قیمت لیکویید و صندوق بیمهٔ صرافی بستگی دارد.
        </Notice>
      )}
      {result.net < 0 && !result.liquidated && (
        <Notice tone="warn" title="این حجم بدون پوینت زیان‌ده است">
          برای سربه‌سر شدن، پوینت/ایردراپ این حجم باید دست‌کم <MoneyValue value={result.breakEvenPoints} digits={2} className="font-semibold text-ink" /> بیرزد.
          {result.breakEvenHours !== null && result.breakEvenHours > holdHours && holdHours > 0 && (
            <> با همین اختلاف فاندینگ، نگه‌داشتن هر دور دست‌کم {toFaDigits(Math.ceil(result.breakEvenHours))} ساعت هزینه‌ها را جبران می‌کند.</>
          )}
        </Notice>
      )}
      {(feeAssumed || mmfAssumed) && (
        <p className="-mt-2 px-1 text-2xs leading-5 text-warn">
          {feeAssumed && `کارمزد یکی از صرافی‌ها از API نیامد؛ ${toFaDigits(FALLBACK_TAKER_PCT)}٪ فرض شد. `}
          {mmfAssumed && `مارجین نگهداری یکی از صرافی‌ها معلوم نبود؛ ${toFaDigits(FALLBACK_MMF * 100)}٪ فرض شد.`}
        </p>
      )}
    </>
  );
}

/* ---------------- مسیر سرمایه ---------------- */

const venue = (q: VenueQuote) => DELTA_VENUE_LABELS[q.venue];

function allocationLines(r: DeltaResult, longQ: VenueQuote, shortQ: VenueQuote, hasAvailable: boolean): FlowLine[] {
  return [
    {
      label: 'سرمایهٔ مبنا',
      value: r.ledger.baseCapital,
      as: 'money',
      source: hasAvailable ? 'input' : undefined,
      hint: hasAvailable ? undefined : 'همان مارجین لازم (سرمایهٔ کل وارد نشده)'
    },
    { label: `مارجین Long · ${venue(longQ)}`, value: r.long.margin, as: 'money', sub: true },
    { label: `مارجین Short · ${venue(shortQ)}`, value: r.short.margin, as: 'money', sub: true },
    { label: 'مارجین قفل‌شده (وثیقه)', value: r.capital, as: 'money' },
    { label: 'سرمایهٔ آزاد', value: r.freeCapital, as: r.freeCapital < 0 ? 'pnl' : 'money', hint: r.freeCapital < 0 ? 'کمبود سرمایه' : 'نقدینگی بیرون از پوزیشن' },
    { label: 'ارزش اسمی کل در معرض بازار', value: r.grossExposure, as: 'money', hint: '۲ × ارزش هر طرف — پول پرداختی نیست' }
  ];
}

function pnlLines(r: DeltaResult, longQ: VenueQuote, shortQ: VenueQuote, slipPct: number): FlowLine[] {
  const lines: FlowLine[] = [
    { label: `سود/زیان قیمت Long · ${venue(longQ)}`, value: r.long.pricePnl, as: 'pnl', sub: true, source: 'scenario' },
    { label: `سود/زیان قیمت Short · ${venue(shortQ)}`, value: r.short.pricePnl, as: 'pnl', sub: true, source: 'scenario' },
    { label: 'سود/زیان معاملاتی ناخالص', value: r.pricePnl, as: 'pnl' },
    { label: `فاندینگ Long`, value: r.long.funding, as: 'pnl', sub: true, source: 'estimate' },
    { label: `فاندینگ Short`, value: r.short.funding, as: 'pnl', sub: true, source: 'estimate' },
    { label: 'فاندینگ خالص دورهٔ نگهداری', value: r.funding, as: 'pnl', hint: 'نرخ لحظه‌ای ثابت فرض شده' },
    { label: 'کارمزد ورود', value: r.entryFees, as: 'cost' },
    { label: 'کارمزد خروج', value: r.exitFees, as: 'cost' },
    { label: 'اسلیپیج', value: r.slippage, as: 'cost', source: 'input', hint: `${toFaDigits(slipPct)}٪ هر معامله، ورود و خروج` },
    { label: 'سود خالص تخمینی', value: r.net, as: 'pnl', total: true }
  ];
  return lines;
}

function settlementLines(r: DeltaResult, longQ: VenueQuote, shortQ: VenueQuote): FlowLine[] {
  const bal = (l: DeltaLegResult, q: VenueQuote, side: string): FlowLine => ({
    label: `موجودی ${venue(q)} (${side}) پس از بستن`,
    value: l.closingBalance,
    as: 'money',
    sub: true,
    hint: l.liquidatedAtExit ? 'لیکویید — مارجین از دست رفته' : `مارجین آزادشده ${fmtUsd(l.margin)} + سود/زیان این طرف`
  });
  return [
    bal(r.long, longQ, 'Long'),
    bal(r.short, shortQ, 'Short'),
    ...(r.freeCapital > 0 ? [{ label: 'سرمایهٔ آزاد', value: r.freeCapital, as: 'money' as const, sub: true }] : []),
    { label: 'سرمایهٔ نهایی', value: r.ledger.finalEquity, as: 'money', total: true },
    { label: 'اختلاف با سرمایهٔ اولیه', value: r.ledger.finalEquity - r.ledger.baseCapital, as: 'pnl' }
  ];
}

const fmtUsd = (v: number) => `${toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: 2 }))} دلار`;

/* ---------------- وضعیت پوزیشن و دلتا ---------------- */

function Position({
  result,
  longQ,
  shortQ,
  longFee,
  shortFee
}: {
  result: DeltaResult;
  longQ: VenueQuote;
  shortQ: VenueQuote;
  longFee: { pct: number; assumed: boolean };
  shortFee: { pct: number; assumed: boolean };
}) {
  return (
    <Surface as="section" aria-labelledby="delta-position" className="space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="delta-position" className="text-sm font-bold text-ink">
          وضعیت پوزیشن و دلتا
        </h3>
        <span className="text-2xs text-subtle">
          اختلاف فاندینگ سالانه <PercentValue value={result.spreadApr} digits={1} className="font-semibold" />
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LegCard side="long" quote={longQ} r={result.long} fee={longFee} share={result.capital > 0 ? (result.long.margin / result.capital) * 100 : null} />
        <LegCard side="short" quote={shortQ} r={result.short} fee={shortFee} share={result.capital > 0 ? (result.short.margin / result.capital) * 100 : null} />
      </div>

      <MetricGrid cols={3} className="rounded-field bg-surface-2/70 px-3.5 py-3">
        <Metric size="sm" label="دلتای دلاری خالص" value={<MoneyValue value={result.netDeltaUsd} digits={2} />} sub="ارزش برابر دو طرف" />
        <Metric
          size="sm"
          label="اختلاف مقدار دو طرف"
          value={<PercentValue value={result.quantityImbalancePct} digits={3} tone="none" />}
          sub="مثبت = واحد Long بیشتر"
        />
        <Metric
          size="sm"
          label="اختلاف قیمت دو صرافی"
          value={<PercentValue value={result.basisPct} digits={3} tone="none" />}
          sub={result.basisPct === null ? 'قیمت مارک نامعلوم' : result.basisPct >= 0 ? 'Short گران‌تر فروخته می‌شود' : 'Short ارزان‌تر فروخته می‌شود'}
        />
      </MetricGrid>

      <Disclosure summary="خنثی بودن دلتا، ارزش اسمی و ریسک چه فرقی دارند؟">
        <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
          <li>
            <b className="text-ink">خنثی بودن ارزش اسمی:</b> ارزش دلاری Long و Short برابر است. این ماشین‌حساب همیشه همین را می‌سازد.
          </li>
          <li>
            <b className="text-ink">خنثی بودن دلتا:</b> اگر قیمت در هر دو صرافی به یک درصد حرکت کند، سود یک طرف زیان طرف دیگر را دقیقاً می‌پوشاند (دلتای دلاری خالص صفر). چون قیمت دو
            صرافی کمی فرق دارد، مقدار دارایی دو طرف به همان اندازه فرق دارد.
          </li>
          <li>
            <b className="text-ink">خنثی بودن ریسک:</b> برقرار نیست. اختلاف قیمت دو صرافی می‌تواند تغییر کند (سناریوی «صفر می‌شود» را ببینید)، هر طرف جدا لیکویید می‌شود و فاندینگ ممکن
            است برعکس شود. این مدل فقط برای پرپ خطی است، نه آپشن یا ابزار غیرخطی.
          </li>
        </ul>
      </Disclosure>
    </Surface>
  );
}

function LegCard({
  side,
  quote,
  r,
  fee,
  share
}: {
  side: 'long' | 'short';
  quote: VenueQuote;
  r: DeltaLegResult;
  fee: { pct: number; assumed: boolean };
  share: number | null;
}) {
  const long = side === 'long';
  return (
    <article className="rounded-field border border-divider p-3.5">
      <h4 className="mb-1 flex items-center justify-between gap-2 text-sm font-bold text-ink">
        <span className={long ? 'text-positive' : 'text-negative'}>{long ? 'Long' : 'Short'}</span>
        <span className="flex items-center gap-1.5">
          {r.liquidatedAtExit && <Badge tone="loss">لیکویید در سناریو</Badge>}
          <Badge tone="neutral">{DELTA_VENUE_LABELS[quote.venue]}</Badge>
        </span>
      </h4>
      <KeyValueList
        dense
        rows={[
          { label: <LabelTag text="قیمت ورود (مارک)" kind="live" />, value: <MoneyValue value={r.entryPrice} /> },
          { label: <LabelTag text="قیمت خروج" kind="scenario" />, value: r.liquidatedAtExit ? <span className="text-negative">لیکویید</span> : <MoneyValue value={r.exitPrice} /> },
          { label: 'مقدار دارایی', value: <QuantityValue value={r.quantity} unit={quote.base} digits={6} /> },
          { label: 'ارزش اسمی', value: <MoneyValue value={r.notional} digits={2} /> },
          { label: 'دلتای دلاری', value: <MoneyValue value={r.deltaUsd} signed digits={2} /> },
          { label: 'مارجین', value: <MoneyValue value={r.margin} digits={2} />, hint: share === null ? undefined : `${toFaDigits(share.toFixed(0))}٪ مارجین کل` },
          { label: <LabelTag text="فاندینگ سالانه" kind="live" />, value: <PercentValue value={aprOf(quote.fundingHourly)} digits={1} tone="none" />, hint: long ? 'مثبت = لانگ می‌پردازد' : 'مثبت = شورت دریافت می‌کند' },
          {
            label: <LabelTag text="کارمزد هر معامله" kind={fee.assumed ? 'assumed' : 'live'} />,
            value: <PercentValue value={fee.pct} digits={4} signed={false} tone="none" />
          },
          {
            label: 'فاصله تا لیکویید',
            value: r.liquidationMovePct === null ? '—' : `${long ? 'ریزش' : 'رشد'} ${toFaDigits(r.liquidationMovePct.toFixed(1))}٪`,
            emphasis: true
          }
        ]}
      />
    </article>
  );
}

function LabelTag({ text, kind }: { text: string; kind: 'live' | 'scenario' | 'assumed' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {text}
      <SourceTag kind={kind} />
    </span>
  );
}

/* ---------------- حساسیت ---------------- */

function Sensitivity({ result, sens, move, hold }: { result: DeltaResult; sens: ReturnType<typeof deltaSensitivity>; move: number; hold: number }) {
  const fmtMove = (m: number) => `${m > 0 ? '+' : ''}${toFaDigits(m)}٪`;
  return (
    <Surface as="section" aria-labelledby="delta-sensitivity" className="space-y-4 p-4 md:p-5">
      <div>
        <h3 id="delta-sensitivity" className="text-sm font-bold text-ink">
          حساسیت سود خالص
        </h3>
        <p className="mt-0.5 text-2xs leading-5 text-subtle">همه از همین مدل و ورودی‌های شما؛ فقط یک متغیر عوض شده است.</p>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted">تغییر قیمت تا خروج (اختلاف قیمت: {result.exitBasis === 'converge' ? 'صفر می‌شود' : 'ثابت'})</p>
        <ScenarioTable
          caption="سود خالص در تغییر قیمت‌های مختلف"
          cols={sens.priceMoves.map((p) => fmtMove(p.movePct))}
          rows={[
            {
              head: 'سود خالص',
              cells: sens.priceMoves.map((p) => ({ value: p.net, note: p.liquidated ? 'لیکویید' : undefined, current: p.movePct === move }))
            }
          ]}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted">مدت نگهداری هر دور</p>
        <ScenarioTable
          caption="سود خالص با مدت نگهداری متفاوت"
          cols={sens.holds.map((h) => holdLabel(h.hours))}
          rows={[{ head: 'سود خالص', cells: sens.holds.map((h) => ({ value: h.net, current: h.hours === hold })) }]}
        />
      </div>

      <KeyValueList
        dense
        rows={[
          { label: 'هر ۰٫۰۱٪ کارمزد یا اسلیپیج بیشتر در هر معامله', value: <MoneyValue value={-result.costPerBp} tone="loss" digits={2} /> },
          { label: 'کارمزد هر ۱ میلیون دلار حجم', value: <MoneyValue value={result.costPerMillion} digits={2} /> },
          { label: 'بیشترین اثر روی نتیجهٔ فعلی', value: sens.driver ? DRIVER_LABEL[sens.driver] : '—' }
        ]}
      />
    </Surface>
  );
}

/* ---------------- اسکنر ---------------- */

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
