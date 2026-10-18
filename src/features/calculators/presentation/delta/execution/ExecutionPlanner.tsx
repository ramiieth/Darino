/**
 * پیش از اجرا — «محاسبهٔ ساده» (همان ماشین‌حساب دلتا نوترال) در برابر «اجرای ربات Tread.fi»
 * ورودی با معنای Tread (Notional کل، Duration ≤ ۲۴ ساعت، حد ضرر) → ۱ مقایسهٔ سود خالص → ۲ اندازه و سهم از حجم بازار
 * → ۳ اگر یک طرف دیرتر پر شود → ۴ حد ضرر در برابر لیکویید → فرض‌ها. محاسبات در domain (calcExecution).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { parseNum } from '../../parse';
import { useDeltaBooks, DELTA_VENUE_LABELS, type VenueQuote } from '@/features/calculators/data/deltaMarkets';
import {
  calcExecution,
  fundingSpreads,
  TREAD_MAX_DURATION_HOURS,
  TREAD_UNBALANCED_PCT,
  type ExecutionResult,
  type FillCase,
  type StopSide
} from '@/features/calculators/domain';
import { FALLBACK_MMF, FALLBACK_TAKER_PCT } from '../arbEval';
import { SourceTag } from '../CapitalFlow';
import { DELTA_PAIRS, pairVenues, type DeltaPair } from '../pairs';

type Pair = DeltaPair;
type StopLoss = '50' | '75' | '90' | 'none';

/** انتقال انتخاب از تب دلتا نوترال */
export interface ExecutionHandoff {
  nonce: number;
  pair: Pair;
  base: string | null;
  flipped: boolean;
  /** ارزش هر طرف در دلتا نوترال → Notional کل = ۲ برابر */
  notionalPerSide: number;
  leverage: number;
  holdHours: number;
}

const logoKind = (q: VenueQuote) => (q.category === 'crypto' || q.category === 'other' ? 'crypto' : 'tradfi');
/** کارمزد میکر (TWAP ربات سفارش محدود می‌گذارد)؛ نبود دادهٔ API صفر فرض نمی‌شود */
const makerFeeOf = (q: VenueQuote): { pct: number; assumed: boolean } => {
  const v = q.makerFeePct ?? q.takerFeePct;
  return v === null ? { pct: FALLBACK_TAKER_PCT, assumed: true } : { pct: Math.max(0, v), assumed: false };
};
const fieldValue = (v: number) => String(Math.round(v * 100) / 100);

/** ۰٫۰۰۴ ساعت → «کمتر از ۱ دقیقه» · ۰٫۵ → «۳۰ دقیقه» · ۲۴ → «۲۴ ساعت» */
export function fmtHours(h: number): string {
  if (h < 1 / 60) return 'کمتر از ۱ دقیقه';
  if (h < 1) return `${toFaDigits(Math.round(h * 60))} دقیقه`;
  return `${toFaDigits(Number(h.toFixed(1)))} ساعت`;
}

function Step({ n, title, sub, children }: { n: number; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <Surface as="section" aria-labelledby={`exec-step-${n}`} className="space-y-4 p-4 md:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
          {toFaDigits(n)}
        </span>
        <div className="min-w-0">
          <h3 id={`exec-step-${n}`} className="text-sm font-bold text-ink">
            {title}
          </h3>
          {sub && <p className="mt-0.5 text-xs leading-6 text-muted">{sub}</p>}
        </div>
      </div>
      {children}
    </Surface>
  );
}

export function ExecutionPlanner({ handoff }: { handoff: ExecutionHandoff | null }) {
  const books = useDeltaBooks();
  const [pair, setPair] = useState<Pair>('arcus-ondo');
  const [base, setBase] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [notional, setNotional] = useState('2000');
  const [leverage, setLeverage] = useState('3');
  const [duration, setDuration] = useState('24');
  const [stop, setStop] = useState<StopLoss>('75');
  const [builderLong, setBuilderLong] = useState('0');
  const [builderShort, setBuilderShort] = useState('0');
  const [lag, setLag] = useState('5');
  const [move, setMove] = useState('5');

  // انتخاب تب دلتا نوترال (بازار، جهت، اندازه، اهرم، مدت)
  useEffect(() => {
    if (!handoff) return;
    setPair(handoff.pair);
    setBase(handoff.base);
    setFlipped(handoff.flipped);
    if (handoff.notionalPerSide > 0) setNotional(fieldValue(handoff.notionalPerSide * 2));
    if (handoff.leverage > 0) setLeverage(fieldValue(handoff.leverage));
    if (handoff.holdHours > 0) setDuration(fieldValue(Math.min(handoff.holdHours, TREAD_MAX_DURATION_HOURS)));
    // هر دکمهٔ «مقایسه» یک nonce تازه می‌سازد
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff?.nonce]);

  const [va, vb] = pairVenues(pair);
  const status = [books[va].status, books[vb].status];
  const spreads = useMemo(() => fundingSpreads(books[va].quotes, books[vb].quotes), [books, va, vb]);
  const selected = spreads.find((s) => s.base === base) ?? spreads[0] ?? null;
  const shortSide = selected ? (flipped ? (selected.shortOn === 'a' ? 'b' : 'a') : selected.shortOn) : 'a';
  const shortQ = selected ? selected[shortSide] : null;
  const longQ = selected ? selected[shortSide === 'a' ? 'b' : 'a'] : null;
  const maxLev = longQ && shortQ ? Math.min(longQ.maxLeverage ?? Infinity, shortQ.maxLeverage ?? Infinity) : Infinity;

  const v = {
    notional: parseNum(notional),
    leverage: parseNum(leverage),
    duration: parseNum(duration),
    builderLong: builderLong.trim() === '' ? 0 : parseNum(builderLong),
    builderShort: builderShort.trim() === '' ? 0 : parseNum(builderShort),
    lag: lag.trim() === '' ? 0 : parseNum(lag),
    move: move.trim() === '' ? 0 : parseNum(move)
  };
  const errors = {
    notional: !(v.notional > 0) ? 'Notional باید بیشتر از صفر باشد.' : null,
    leverage: !(v.leverage > 0) ? 'اهرم باید بیشتر از صفر باشد.' : v.leverage > maxLev ? `حداکثر اهرم مشترک این بازار ${toFaDigits(maxLev)} برابر است.` : null,
    duration: !(v.duration > 0) ? 'مدت باید بیشتر از صفر باشد.' : v.duration > TREAD_MAX_DURATION_HOURS ? 'حداکثر مدت ربات ۲۴ ساعت است.' : null,
    builderLong: !(v.builderLong >= 0) ? 'نمی‌تواند منفی باشد.' : null,
    builderShort: !(v.builderShort >= 0) ? 'نمی‌تواند منفی باشد.' : null,
    lag: !(v.lag >= 0 && v.lag <= 100) ? 'بین ۰ تا ۱۰۰٪.' : null,
    move: !(v.move >= 0) ? 'عدد مثبت وارد کنید.' : null
  };
  const blocking = Object.entries(errors).some(([k, e]) => e !== null && !(k === 'leverage' && v.leverage > 0));
  const longFee = longQ ? makerFeeOf(longQ) : null;
  const shortFee = shortQ ? makerFeeOf(shortQ) : null;

  const result = useMemo<ExecutionResult | null>(() => {
    if (!longQ || !shortQ || !longFee || !shortFee || blocking) return null;
    const leg = (q: VenueQuote, fee: number, builder: number) => ({
      feePct: fee,
      builderFeePct: builder,
      fundingHourly: q.fundingHourly ?? 0,
      volume24hUsd: q.volume24hUsd,
      maintenanceMarginFraction: q.maintenanceMarginFraction ?? FALLBACK_MMF,
      markPrice: q.markPrice
    });
    return calcExecution({
      totalNotional: v.notional,
      leverage: v.leverage,
      durationHours: v.duration,
      long: leg(longQ, longFee.pct, v.builderLong),
      short: leg(shortQ, shortFee.pct, v.builderShort),
      stopLossPct: stop === 'none' ? null : Number(stop),
      lagPct: v.lag,
      stressMovePct: v.move
    });
  }, [longQ, shortQ, longFee?.pct, shortFee?.pct, blocking, v.notional, v.leverage, v.duration, v.builderLong, v.builderShort, stop, v.lag, v.move]);

  const num = (value: string, set: (s: string) => void, suffix: string) => ({
    dir: 'ltr' as const,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    value,
    suffix,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value)
  });

  const loading = status.includes('loading') && !spreads.length;
  const ondoLeg = longQ?.venue === 'ondo' || shortQ?.venue === 'ondo';

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <section aria-label="ورودی‌ها" className="min-w-0 lg:col-span-5">
        <Surface className="space-y-5 p-4 md:p-5 lg:sticky lg:top-8">
          <h2 className="text-sm font-bold text-ink">تنظیمات ربات</h2>
          <Field label="دو صرافی">
            <Select
              value={pair}
              onChange={(e) => {
                setPair(e.target.value as Pair);
                setBase(null);
                setFlipped(false);
              }}
            >
              {DELTA_PAIRS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="بازار">
            <Select
              value={selected?.base ?? ''}
              onChange={(e) => {
                setBase(e.target.value);
                setFlipped(false);
              }}
              disabled={!spreads.length}
            >
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
          <Field label="Notional کل (هر دو طرف با هم)" error={errors.notional}>
            <Input {...num(notional, setNotional, 'دلار')} />
          </Field>
          <p className="-mt-3 text-2xs leading-5 text-subtle">
            مثل Tread.fi: نصف به Long، نصف به Short. ۲۰۰۰ دلار یعنی ۱۰۰۰ دلار هر طرف (همان «ارزش هر طرف = ۱۰۰۰» در دلتا نوترال).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="اهرم" error={errors.leverage}>
              <Input {...num(leverage, setLeverage, '×')} />
            </Field>
            <Field label="مدت ربات (Duration)" error={errors.duration}>
              <Input {...num(duration, setDuration, 'ساعت')} />
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">حد ضرر (Stop Loss)</p>
            <SegmentedControl<StopLoss>
              label="حد ضرر"
              fill
              size="sm"
              value={stop}
              onChange={setStop}
              options={[
                { value: '50', label: '۵۰٪' },
                { value: '75', label: '۷۵٪' },
                { value: '90', label: '۹۰٪' },
                { value: 'none', label: 'بدون سقف' }
              ]}
            />
            <p className="mt-1.5 text-2xs leading-5 text-subtle">پیش‌فرض Tread.fi ۷۵٪ است. با فعال شدن، هر دو طرف با هم بسته می‌شوند.</p>
          </div>
          <Disclosure summary="پیشرفته: builder fee">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="builder fee طرف Long" error={errors.builderLong}>
                  <Input {...num(builderLong, setBuilderLong, '٪')} />
                </Field>
                <Field label="builder fee طرف Short" error={errors.builderShort}>
                  <Input {...num(builderShort, setBuilderShort, '٪')} />
                </Field>
              </div>
              <p className="text-2xs leading-5 text-subtle">
                صفحهٔ ربات دلتای Tread.fi این کارمزد (۰٫۰۲٪) را فقط برای Extended، Hyperliquid و Pacifica ذکر کرده، پس برای آرکوس، اوندو و لایتر ۰ گذاشته شده.
                {ondoLeg && ' جدول کارمزد کلی Tread.fi اوندو را هم در فهرست دارد؛ اگر روی اوندو کارمزد دیدید، ۰٫۰۲ وارد کنید.'}
              </p>
            </div>
          </Disclosure>
        </Surface>
      </section>

      <section aria-label="نتیجه" aria-live="polite" className="min-w-0 space-y-5 lg:col-span-7">
        {status.includes('error') && (
          <Notice tone="warn" title="دادهٔ یکی از صرافی‌ها در دسترس نیست">
            کمی بعد دوباره امتحان کنید یا جفت صرافی دیگری انتخاب کنید.
          </Notice>
        )}
        {loading ? (
          <Surface className="space-y-3 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full" />
          </Surface>
        ) : !longQ || !shortQ || !selected ? (
          <Empty>بازار مشترکی با نرخ فاندینگ معلوم بین این دو صرافی پیدا نشد.</Empty>
        ) : !result || !longFee || !shortFee ? (
          <Empty>ورودی‌های قرمزشده را اصلاح کنید تا نتیجه محاسبه شود.</Empty>
        ) : (
          <>
            <Intro base={selected.base} nameFa={selected.a.nameFa} kind={logoKind(selected.a)} />
            <Comparison r={result} />
            <SizeAndVolume r={result} longQ={longQ} shortQ={shortQ} feeAssumed={longFee.assumed || shortFee.assumed} hours={v.duration} />
            <Imbalance r={result} lag={lag} move={move} setLag={setLag} setMove={setMove} errors={errors} />
            <StopVsLiquidation r={result} stop={stop} leverage={v.leverage} />
            <Assumptions />
          </>
        )}
      </section>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center rounded-card border border-dashed border-divider-strong px-6 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function Intro({ base, nameFa, kind }: { base: string; nameFa: string; kind: 'crypto' | 'tradfi' }) {
  return (
    <div className="flex items-start gap-3 rounded-field bg-surface-2/70 px-3.5 py-3">
      <AssetLogo symbol={base} kind={kind} size={32} />
      <p className="min-w-0 text-xs leading-6 text-muted">
        <b className="text-ink">
          <bdi dir="ltr">{base}</bdi> · {nameFa}
        </b>
        <br />
        این صفحه یک اجرای ربات دلتا نوترال Tread.fi را <b className="text-ink">پیش از اجرا</b> شبیه‌سازی می‌کند و با «محاسبهٔ ساده» مقایسه می‌کند. فاندینگ و کارمزد
        زنده‌اند؛ هیچ سفارشی ثبت نمی‌شود.
      </p>
    </div>
  );
}

/* ---------------- ۱. مقایسهٔ سود خالص ---------------- */

function Comparison({ r }: { r: ExecutionResult }) {
  const simpleNet = r.simple.net;
  const cards: { title: string; how: string; c: FillCase | null; unverified: boolean }[] = [
    { title: 'محاسبهٔ ساده', how: 'همان ماشین‌حساب دلتا نوترال: هر دو طرف یک‌باره و کامل باز می‌شوند و تا پایان متوازن می‌مانند.', c: null, unverified: false },
    {
      title: 'ربات Tread.fi — پر شدن سریع',
      how: r.quickFill.fillHours === null ? 'زمان پر شدن معلوم نیست، چون حجم ۲۴ساعتهٔ یکی از دو بازار در دسترس نیست.' : `پوزیشن در ${fmtHours(r.quickFill.fillHours)} پر می‌شود (کمترین زمان مجاز ربات)، بعد تا پایان کامل باز می‌ماند.`,
      c: r.quickFill,
      unverified: true
    },
    { title: 'ربات Tread.fi — پر شدن در کل مدت', how: 'پوزیشن به‌تدریج در کل مدت پر می‌شود و در پایان بسته می‌شود؛ به‌طور میانگین فقط نصفش باز است.', c: r.wholeFill, unverified: true }
  ];
  return (
    <Step n={1} title="بعد از کارمزد چقدر می‌ماند؟" sub="هر سه ستون با همین ورودی‌ها و همین نرخ فاندینگ زنده‌اند؛ فرقشان فقط در «چطور و چه زمانی پوزیشن پر می‌شود» است.">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(({ title, how, c, unverified }, i) => {
          const net = c ? c.net : simpleNet;
          const funding = c ? c.funding : r.simple.funding;
          const fees = c ? c.fees : r.simple.fees;
          const hours = c ? c.exposureHours : null;
          const diff = c && net !== null ? net - simpleNet : null;
          return (
            <article key={title} className={cn('flex min-w-0 flex-col rounded-field border p-3.5', i === 0 ? 'border-divider bg-surface-2/50' : 'border-divider')}>
              <h4 className="text-xs font-bold text-ink">{title}</h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {unverified ? <Badge tone="warn" className="text-2xs">تفسیر تأییدنشده</Badge> : <SourceTag kind="estimate" />}
              </div>
              <p className="mt-2 text-2xs leading-5 text-muted">{how}</p>
              <div className="mt-3 text-2xl font-extrabold tracking-tight">
                {net === null ? <span className="text-base text-warn">نامشخص</span> : <MoneyValue value={net} signed tone="auto" digits={2} />}
              </div>
              <p className="text-2xs text-subtle">سود خالص تخمینی</p>
              <KeyValueList
                dense
                className="mt-2"
                rows={[
                  { label: 'فاندینگ', value: funding === null ? '—' : <MoneyValue value={funding} signed tone="auto" digits={2} /> },
                  { label: 'کارمزد', value: <MoneyValue value={fees === 0 ? 0 : -fees} tone={fees > 0 ? 'loss' : 'none'} digits={2} /> },
                  ...(hours !== null ? [{ label: 'ساعت باز کامل', value: fmtHours(hours) }] : [])
                ]}
              />
              {diff !== null && Math.abs(diff) >= 0.005 && (
                <p className={cn('mt-auto pt-2 text-2xs font-semibold', diff < 0 ? 'text-negative' : 'text-positive')}>
                  <MoneyValue value={diff} signed digits={2} /> نسبت به محاسبهٔ ساده
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-2xs leading-5 text-subtle">
        مستندات Tread.fi روشن نکرده «مدت» زمان پر شدن است یا کل عمر ربات؛ برای همین هر دو حالت آمده. نتیجهٔ واقعی را تب «در حال اجرا» از حساب شما نشان می‌دهد.
        {r.fees.builder > 0 && <> کارمزد ربات شامل <MoneyValue value={r.fees.builder} digits={2} /> builder fee است که محاسبهٔ ساده ندارد.</>}
      </p>
    </Step>
  );
}

/* ---------------- ۲. اندازه و سهم از حجم بازار ---------------- */

function SizeAndVolume({ r, longQ, shortQ, feeAssumed, hours }: { r: ExecutionResult; longQ: VenueQuote; shortQ: VenueQuote; feeAssumed: boolean; hours: number }) {
  const pov = (q: VenueQuote, p: number | null) =>
    p === null ? <span className="text-xs text-warn">نامشخص — {DELTA_VENUE_LABELS[q.venue]} حجم ۲۴ساعته نمی‌دهد</span> : <PercentValue value={p} digits={p < 0.01 ? 4 : 2} signed={false} tone="none" />;
  return (
    <Step n={2} title="اندازهٔ پوزیشن و سهم از حجم بازار" sub="ربات Tread.fi هر طرف را با بخشی از حجم معاملات بازار پر می‌کند (POV). سهم بالا یعنی پر شدن کندتر و خطر عقب ماندن.">
      <MetricGrid cols={3}>
        <Metric size="sm" label="هر طرف" value={<MoneyValue value={r.legNotional} digits={2} />} sub="نصف Notional کل" />
        <Metric size="sm" label="مارجین هر طرف" value={<MoneyValue value={r.marginPerLeg} digits={2} />} sub={<>کل <MoneyValue value={r.totalMargin} digits={2} /></>} />
        <Metric size="sm" label="کارمزد کل" value={<MoneyValue value={-r.fees.total} tone={r.fees.total > 0 ? 'loss' : 'none'} digits={2} />} sub="میکر، باز و بسته‌کردن هر دو طرف" />
      </MetricGrid>
      <KeyValueList
        dense
        rows={[
          { label: <>سهم Long از حجم {DELTA_VENUE_LABELS[longQ.venue]} در {fmtHours(hours)}</>, value: pov(longQ, r.pov.long) },
          { label: <>سهم Short از حجم {DELTA_VENUE_LABELS[shortQ.venue]} در {fmtHours(hours)}</>, value: pov(shortQ, r.pov.short) },
          {
            label: 'کمترین مدت مجاز ربات',
            hint: 'زمان پر شدن طرفِ کندتر با ۵۰٪ حجم بازار',
            value: r.minDurationHours === null ? <span className="text-xs text-warn">نامشخص</span> : fmtHours(r.minDurationHours)
          }
        ]}
      />
      {r.durationTooShort && (
        <Notice tone="warn" title="مدت کمتر از حداقل مجاز ربات است">
          Tread.fi کمترین مدت را {r.minDurationHours === null ? '—' : fmtHours(r.minDurationHours)} حساب می‌کند؛ مدت را بیشتر یا Notional را کمتر کنید.
        </Notice>
      )}
      {feeAssumed && <p className="text-2xs text-warn">کارمزد یکی از صرافی‌ها از API نیامد؛ {toFaDigits(FALLBACK_TAKER_PCT)}٪ فرض شد.</p>}
    </Step>
  );
}

/* ---------------- ۳. اگر یک طرف دیرتر پر شود ---------------- */

function Imbalance({
  r,
  lag,
  move,
  setLag,
  setMove,
  errors
}: {
  r: ExecutionResult;
  lag: string;
  move: string;
  setLag: (s: string) => void;
  setMove: (s: string) => void;
  errors: { lag: string | null; move: string | null };
}) {
  const i = r.imbalance;
  const carry = r.simple.net;
  const ratio = carry > 0 && i.worstCaseUsd > 0 ? i.worstCaseUsd / carry : null;
  return (
    <Step
      n={3}
      title="اگر یک طرف دیرتر پر شود چه می‌شود؟"
      sub="محاسبهٔ ساده فرض می‌کند دو طرف همیشه دقیقاً برابرند. در اجرای واقعی، طرف کم‌نقد ممکن است عقب بماند و آن بخش بی‌پوشش، با حرکت قیمت سود یا زیان می‌سازد."
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="طرف کندتر چقدر عقب بماند" error={errors.lag}>
          <Input dir="ltr" inputMode="decimal" autoComplete="off" value={lag} onChange={(e) => setLag(e.target.value)} suffix="٪" />
        </Field>
        <Field label="اگر قیمت حرکت کند" error={errors.move}>
          <Input dir="ltr" inputMode="decimal" autoComplete="off" value={move} onChange={(e) => setMove(e.target.value)} suffix="٪" />
        </Field>
      </div>
      <p className="-mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-subtle">
        <SourceTag kind="scenario" /> این دو عدد فرض شماست، نه داده.
      </p>
      <MetricGrid cols={3}>
        <Metric
          size="sm"
          label="عدم توازن (Net Exposure)"
          value={<PercentValue value={i.netExposurePct} digits={2} signed={false} tone="none" />}
          sub={i.unbalanced ? <Badge tone="warn">Unbalanced</Badge> : <Badge tone="gain">متوازن</Badge>}
        />
        <Metric size="sm" label="بخش بی‌پوشش" value={<MoneyValue value={i.netExposureUsd} digits={2} />} />
        <Metric size="sm" label="سود یا زیان احتمالی" value={<MoneyValue value={i.worstCaseUsd} digits={2} />} sub="در هر جهت؛ بدترین حالت زیان است" />
      </MetricGrid>
      <p className="text-xs leading-6 text-muted">
        Tread.fi بالای {toFaDigits(TREAD_UNBALANCED_PCT)}٪ عدم توازن، پوزیشن را «Unbalanced» علامت می‌زند.
        {ratio !== null && ratio >= 1 && (
          <>
            {' '}
            در این سناریو، زیان احتمالی <b className="text-negative">{toFaDigits(ratio.toFixed(1))} برابر</b> کل سود خالص محاسبهٔ ساده است.
          </>
        )}
      </p>
    </Step>
  );
}

/* ---------------- ۴. حد ضرر در برابر لیکویید ---------------- */

function StopVsLiquidation({ r, stop, leverage }: { r: ExecutionResult; stop: StopLoss; leverage: number }) {
  const first = (s: StopSide, sl: number | null) =>
    sl === null ? 'لیکویید' : s.liquidationMovePct === null || sl < s.liquidationMovePct ? 'حد ضرر' : 'لیکویید';
  const pct = (v: number | null) => (v === null ? '—' : `${toFaDigits(Number(v.toFixed(1)))}٪`);
  const row = (label: string, dir: string, s: StopSide) => (
    <tr key={label}>
      <th scope="row" className="border-t border-divider py-2 pe-2 text-start font-normal text-muted">
        {label}
        <span className="block text-2xs text-subtle">{dir}</span>
      </th>
      <td className="border-t border-divider py-2 text-end font-semibold text-ink">{pct(s.marginBasedMovePct)}</td>
      <td className="border-t border-divider py-2 text-end font-semibold text-ink">{pct(s.priceBasedMovePct)}</td>
      <td className="border-t border-divider py-2 text-end font-semibold text-ink">{pct(s.liquidationMovePct)}</td>
    </tr>
  );
  const s = r.stop;
  return (
    <Step
      n={4}
      title="در حرکت شدید قیمت، اول چه اتفاقی می‌افتد؟"
      sub="ربات با رسیدن به حد ضرر هر دو طرف را با هم می‌بندد (در ۵ تا ۱۰ دقیقه). اگر لیکویید زودتر برسد، طرف بازنده مارجینش را از دست می‌دهد و طرف دیگر بی‌پوشش باز می‌ماند."
    >
      {stop === 'none' ? (
        <Notice tone="warn" title="حد ضرر خاموش است">
          پوزیشن تا پایان مدت یا بستن دستی باز می‌ماند؛ در حرکت شدید، لیکویید Long در ریزش {pct(s.long.liquidationMovePct)} و Short در رشد {pct(s.short.liquidationMovePct)} رخ می‌دهد.
        </Notice>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full table-fixed border-separate border-spacing-0 text-xs sm:text-sm">
              <caption className="sr-only">حرکت قیمت تا حد ضرر و لیکویید</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[34%] pb-2 text-start text-2xs font-semibold text-subtle">
                    حرکت قیمت تا…
                  </th>
                  <th scope="col" className="pb-2 text-end text-2xs font-semibold text-subtle">
                    حد ضرر (روی مارجین)
                  </th>
                  <th scope="col" className="pb-2 text-end text-2xs font-semibold text-subtle">
                    حد ضرر (روی قیمت)
                  </th>
                  <th scope="col" className="pb-2 text-end text-2xs font-semibold text-subtle">
                    لیکویید
                  </th>
                </tr>
              </thead>
              <tbody>
                {row('طرف Long', 'با ریزش قیمت', s.long)}
                {row('طرف Short', 'با رشد قیمت', s.short)}
              </tbody>
            </table>
          </div>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
              <caption className="sr-only">اول کدام می‌رسد: حد ضرر یا لیکویید</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[34%] pb-2 text-start text-2xs font-semibold text-subtle">
                    اول می‌رسد به…
                  </th>
                  <th scope="col" className="pb-2 text-center text-2xs font-semibold text-subtle">
                    اگر مبنا مارجین باشد
                  </th>
                  <th scope="col" className="pb-2 text-center text-2xs font-semibold text-subtle">
                    اگر مبنا قیمت باشد
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['طرف Long', s.long],
                    ['طرف Short', s.short]
                  ] as const
                ).map(([label, side]) => (
                  <tr key={label}>
                    <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                      {label}
                    </th>
                    {[side.marginBasedMovePct, side.priceBasedMovePct].map((sl, i) => {
                      const f = first(side, sl);
                      return (
                        <td key={i} className="border-t border-divider py-2 text-center">
                          <Badge tone={f === 'لیکویید' ? 'loss' : 'gain'}>{f}</Badge>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs leading-5 text-subtle">
            «حد ضرر» یعنی ربات هر دو طرف را منظم می‌بندد و زیان تقریباً به کارمزد محدود می‌ماند. «لیکویید» یعنی صرافی طرف بازنده را می‌بندد و مارجینش از دست می‌رود.
          </p>
          <p className="text-2xs leading-5 text-subtle">
            مستندات Tread.fi می‌گوید حد ضرر «روی مارجینِ مقدار پرشده» است، ولی فرمولش را روی خود قیمت نوشته. با اهرم {toFaDigits(leverage)} این دو، دو عدد متفاوت می‌دهند؛
            تا روشن شدن، هر دو آمده‌اند.
          </p>
        </>
      )}
    </Step>
  );
}

/* ---------------- فرض‌ها ---------------- */

function Assumptions() {
  return (
    <Surface as="section" aria-labelledby="exec-assumptions" className="space-y-2 p-4 md:p-5">
      <h3 id="exec-assumptions" className="text-sm font-bold text-ink">
        فرض‌ها و منبع قواعد
      </h3>
      <Disclosure summary="قواعد Tread.fi که این صفحه از آن‌ها استفاده می‌کند">
        <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
          <li>Notional کل نصف‌نصف بین دو طرف تقسیم می‌شود و هر دو طرف با TWAP (سفارش‌های محدود تقسیم‌شده در زمان) اجرا می‌شوند.</li>
          <li>مدت حداکثر ۱ روز است و حداقلش با ۵۰٪ سهم از حجم بازارِ طرفِ کندتر تعیین می‌شود. با پایان مدت یا حد ضرر، پوزیشن بسته می‌شود.</li>
          <li>حد ضرر ۵۰، ۷۵ (پیش‌فرض) یا ۹۰٪، یا بدون سقف. با فعال شدن، سفارش بستن reduce-only هر دو طرف را در ۵ تا ۱۰ دقیقه می‌بندد.</li>
          <li>عدم توازن بالای ۱٪ = «Unbalanced».</li>
        </ul>
        <p className="mt-2 text-2xs text-subtle">
          منبع: مستندات عمومی Tread.fi (docs.tread.fi/bots/delta-neutral-bot). این صفحه وابسته یا تأییدشدهٔ Tread.fi نیست.
        </p>
      </Disclosure>
      <Disclosure summary="آنچه این شبیه‌سازی نمی‌داند">
        <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
          <li>«مدت» زمان پر شدن است یا کل عمر ربات؛ برای همین دو ستون ربات آمده.</li>
          <li>مبنای دقیق حد ضرر با اهرم بیش از ۱.</li>
          <li>ترکیب واقعی میکر و تیکر: TWAP وقتی از برنامه عقب بیفتد سفارش تیکر هم می‌فرستد. این‌جا همه میکر فرض شده.</li>
          <li>تغییر نرخ فاندینگ در طول مدت؛ نرخ لحظه‌ای ثابت فرض شده.</li>
          <li>پشتیبانی Tread.fi از لایتر در مستندات دیده نشد.</li>
        </ul>
      </Disclosure>
    </Surface>
  );
}
