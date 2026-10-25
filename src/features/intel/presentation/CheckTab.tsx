/**
 * تب «چک قبل از ورود» — کاربر بازار، جهت و اهرم را می‌دهد و دو جواب جدا می‌گیرد:
 *   ۱) ریسک در شرایط عادی: احتمال لیکوئید ۲۴ ساعت و ۷ روز + اهرم پیشنهادی (ریسک ۷ روزه ≤ ۵٪)
 *   ۲) اگر آبشاری مثل بدترین روز تاریخچهٔ همین بازار تکرار شود — دستور، نه احتمال
 * جهت بازار را پیش‌بینی نمی‌کند. حالت در URL (?m= ، ?side= ، ?lev=) تا لینک قابل اشتراک باشد.
 */
import { useMemo } from 'react';
import { ShieldAlert, Zap } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Metric, MetricGrid, PercentValue } from '@/shared/components/ui/FinancialValue';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { SAFE_TARGET_7D, VERDICT_FA, assess, buildRiskModel, type Assessment, type RiskModel, type Side } from '../domain/survival';
import { usePerpMarkets, useRiskCandles } from '../data/intelApi';
import { fmtPrice } from './parts';

const MARKETS = 40;
const pct = (v: number, digits = 1) => `${toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`;
const prob = (v: number | null, floored: boolean) => (v === null ? '—' : floored ? `کمتر از ${pct(v)}` : pct(v));
const faDate = (t: number) => new Date(t).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

export function CheckTab({
  market,
  side,
  leverage,
  onChange,
  onCoin
}: {
  market: string;
  side: Side;
  leverage: number;
  onChange: (patch: { m?: string; side?: Side; lev?: number }) => void;
  onCoin: (coin: string) => void;
}) {
  const markets = usePerpMarkets();
  const m = markets.data?.find((x) => x.coin === market) ?? null;
  const candles = useRiskCandles(m ? market : null);
  const options = useMemo(() => {
    const top = (markets.data ?? []).slice(0, MARKETS);
    return m && !top.includes(m) ? [m, ...top] : top;
  }, [markets.data, m]);

  const lev = m ? Math.min(Math.max(1, Math.round(leverage)), m.maxLeverage) : leverage;
  const model = useMemo(() => (candles.data ? buildRiskModel(candles.data, side) : null), [candles.data, side]);
  const result = useMemo(() => (m && model ? assess(model, { leverage: lev, maxLeverage: m.maxLeverage, fundingHourly: m.fundingHourly }) : null), [m, model, lev]);
  const ladder = useMemo(() => {
    if (!m || !model) return [];
    const steps = [...new Set([1, 2, 3, 5, 10, 20, m.maxLeverage, lev])].filter((l) => l <= m.maxLeverage).sort((a, b) => a - b);
    return steps.map((l) => assess(model, { leverage: l, maxLeverage: m.maxLeverage, fundingHourly: m.fundingHourly }));
  }, [m, model, lev]);

  if (markets.isLoading) return <ListSkeleton rows={4} />;
  if (markets.isError) return <ErrorState message="بازارهای هایپرلیکوئید دریافت نشد" onRetry={() => void markets.refetch()} />;

  return (
    <div className="space-y-5">
      <Surface className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="بازار">
          <Select value={m ? market : ''} onChange={(e) => onChange({ m: e.target.value })}>
            {!m && <option value="">انتخاب بازار</option>}
            {options.map((o) => (
              <option key={o.coin} value={o.coin}>{o.coin} · {fmtPrice(o.markPx)}</option>
            ))}
          </Select>
        </Field>
        <Field label="جهت">
          <SegmentedControl<Side>
            fill
            label="جهت"
            value={side}
            onChange={(v) => onChange({ side: v })}
            options={[{ value: 'long', label: 'لانگ' }, { value: 'short', label: 'شورت' }]}
          />
        </Field>
        <Field label={m ? `اهرم (حداکثر ${toFaDigits(m.maxLeverage)}x)` : 'اهرم'}>
          <Input
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={1}
            max={m?.maxLeverage}
            value={String(lev)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 1) onChange({ lev: Math.round(v) });
            }}
            suffix="x"
          />
        </Field>
      </Surface>

      {!m ? (
        <Notice tone="neutral">این بازار در هایپرلیکوئید پیدا نشد؛ از فهرست انتخاب کنید.</Notice>
      ) : candles.isLoading ? (
        <ListSkeleton rows={3} />
      ) : candles.isError || !result || !model ? (
        <ErrorState message="کندل‌های این بازار دریافت نشد" onRetry={() => void candles.refetch()} />
      ) : (
        <>
          <NormalRisk r={result} model={model} onLev={(l) => onChange({ lev: l })} />
          <CrashScenario r={result} model={model} side={side} onLev={(l) => onChange({ lev: l })} />

          <Surface className="p-4">
            <MetricGrid cols={4}>
              <Metric label="فاصلهٔ لیکوئید" value={pct(result.liqPct)} sub={`تخمین ایزوله با ${toFaDigits(lev)}x`} />
              <Metric label="احتمال لیکوئید ۲۴ ساعت" value={prob(result.p24, result.p24Floored)} sub="در شرایط عادی" />
              <Metric label="احتمال لیکوئید ۷ روز" value={prob(result.p7d, result.p7dFloored)} sub="در شرایط عادی" />
              <Metric
                label="فاندینگ روزانه"
                value={<PercentValue value={result.fundingDayMarginPct === null ? null : -result.fundingDayMarginPct} digits={2} />}
                sub={result.fundingDayMarginPct === null ? undefined : result.fundingDayMarginPct > 0 ? 'از مارجین شما کم می‌شود' : 'به مارجین شما اضافه می‌شود'}
              />
            </MetricGrid>
          </Surface>

          <Surface className="p-4">
            <p className="mb-3 text-sm font-bold text-ink">همین پوزیشن با اهرم‌های دیگر</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ladder.map((r) => (
                <li key={r.leverage}>
                  <button
                    type="button"
                    onClick={() => onChange({ lev: r.leverage })}
                    className={cn('w-full rounded-field border px-3 py-2 text-start text-sm', r.leverage === lev ? 'border-brand' : 'border-line hover:border-ink/30')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold text-ink"><bdi dir="ltr">{toFaDigits(r.leverage)}x</bdi></span>
                      <Badge tone={VERDICT_FA[r.verdict].tone}>{VERDICT_FA[r.verdict].short}</Badge>
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      ۷ روز {prob(r.p7d, r.p7dFloored)} · آبشار {r.crashSurvives === null ? '—' : r.crashSurvives ? 'می‌ماند' : 'می‌سوزد'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Surface>

          <p className="text-xs leading-6 text-subtle">
            احتمال‌ها از «تاریخچهٔ مقیاس‌شده با نوسان» می‌آیند: حرکت‌های خلاف جهت {toFaDigits(model.days)} روز گذشتهٔ همین بازار، به نسبت نوسان آن روزها، با نوسان امروز دوباره مقیاس شده‌اند؛ بازار پرتلاطم‌تر یعنی احتمال بالاتر.
            در آزمون عقب‌گرد روی ۱۰ بازار هایپرلیکوئید (ژوئیهٔ ۲۰۲۴ تا اکتبر ۲۰۲۶) وقتی این روش ۱ تا ۳٪ گفت، در واقعیت ۱.۶٪ (۲۴ ساعت) و ۲٪ (۷ روز) لیکوئید شدند، و «اهرم پیشنهادی» در عمل ۳.۱٪ لیکوئید شد.
            زیر ۰.۲٪ و ۲٪ مدل کم‌برآورد بود، پس کمتر از این‌ها نشان داده نمی‌شود.
            لیکوئید برای مارجین ایزوله تخمین زده شده؛ در مارجین کراس موجودی اضافه آن را دورتر می‌برد. کندل‌ها قیمت معامله‌اند و لیکوئید با قیمت مارک، پس اعداد کمی محافظه‌کارانه‌اند.
            این چک جهت بازار را پیش‌بینی نمی‌کند و توصیهٔ مالی نیست.{' '}
            <button type="button" onClick={() => onCoin(market)} className="font-semibold text-brand hover:underline">فاندینگ و پوزیشن برترها روی {market}</button>
          </p>
        </>
      )}
    </div>
  );
}

function NormalRisk({ r, model, onLev }: { r: Assessment; model: RiskModel; onLev: (l: number) => void }) {
  const v = VERDICT_FA[r.verdict];
  const safe = r.safeLeverage;
  const text =
    r.verdict === 'unknown'
      ? `فقط ${toFaDigits(model.days)} روز سابقه هست؛ برای تخمین احتمال دست‌کم ۱۸۰ روز لازم است.`
      : `با ${toFaDigits(r.leverage)}x، اگر بازار مثل روزهای عادی‌اش ولی با نوسان امروز رفتار کند، احتمال لیکوئید طی ۷ روز ${prob(r.p7d, r.p7dFloored)} و طی ۲۴ ساعت ${prob(r.p24, r.p24Floored)} است.` +
        (safe === null ? ' حتی بدون اهرم ریسک ۷ روزه از ۵٪ بیشتر است.' : r.verdict === 'ok' ? '' : ` برای ریسک ۷ روزهٔ حداکثر ${pct(SAFE_TARGET_7D, 0)}، اهرم را به ${toFaDigits(safe)}x یا کمتر برسانید.`) +
        (model.shortHistory ? ` سابقهٔ این بازار کمتر از یک سال (${toFaDigits(model.days)} روز) است؛ احتمال ممکن است کم‌برآورد باشد.` : '');
  return (
    <Notice
      tone={r.verdict === 'danger' ? 'error' : r.verdict === 'tight' ? 'warn' : r.verdict === 'ok' ? 'success' : 'neutral'}
      icon={<ShieldAlert />}
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          ۱. ریسک در شرایط عادی: {v.label}
          {safe !== null && r.verdict !== 'unknown' && <Badge tone="brand">اهرم پیشنهادی تا {toFaDigits(safe)}x</Badge>}
        </span>
      }
      action={safe !== null && r.verdict !== 'ok' && r.verdict !== 'unknown' && safe < r.leverage ? <Button size="sm" onClick={() => onLev(safe)}>{`اهرم ${toFaDigits(safe)}x`}</Button> : undefined}
    >
      {text}
    </Notice>
  );
}

function CrashScenario({ r, model, side, onLev }: { r: Assessment; model: RiskModel; side: Side; onLev: (l: number) => void }) {
  if (model.crashPct === null || model.crashAt === null) return null;
  const dir = side === 'long' ? 'ریزش' : 'جهش';
  const max = r.crashMaxLeverage;
  return (
    <Notice
      tone={r.crashSurvives ? 'neutral' : 'warn'}
      icon={<Zap />}
      title={`۲. اگر بدترین روز این بازار تکرار شود: ${r.crashSurvives ? 'این اهرم می‌ماند' : 'این اهرم می‌سوزد'}`}
      action={!r.crashSurvives && max !== null && max < r.leverage ? <Button size="sm" variant="outline" onClick={() => onLev(max)}>{`اهرم ${toFaDigits(max)}x`}</Button> : undefined}
    >
      بدترین {dir} ۲۴ ساعتهٔ این بازار در {toFaDigits(model.days)} روز گذشته {pct(model.crashPct)} بود ({faDate(model.crashAt)}).
      {max !== null && max >= 2 ? ` فقط تا ${toFaDigits(max)}x از آن جان به در می‌برد.` : ' هر اهرمی بالاتر از ۱x در آن روز لیکوئید می‌شد.'}
      {' '}صبح ریزش ۱۰ اکتبر ۲۰۲۵ همهٔ مدل‌ها برای ۳x آلت‌کوین‌ها ریسک را نزدیک صفر می‌دیدند و همه لیکوئید شدند؛ آبشار پیش‌بینی‌پذیر نیست.
      {' '}<b>فقط مارجینی بگذارید که حاضرید در یک آبشار کامل از دست بدهید، و از مارجین ایزوله استفاده کنید تا بقیهٔ حساب درگیر نشود.</b>
    </Notice>
  );
}
