/**
 * تب «چک قبل از ورود» — کاربر بازار، جهت و اهرم را می‌دهد و یک حکم می‌گیرد:
 *   کارت حکم: احتمال لیکوئید ۷ روز در شرایط عادی + سرنوشت در تکرار بدترین روز + اهرم معقول (یک دکمه)
 *   نوار اهرم: همین پوزیشن با اهرم‌های دیگر، یک نگاه
 *   جزئیات و روش: پشت بازشو
 * جهت بازار را پیش‌بینی نمی‌کند. حالت در URL (?m= ، ?side= ، ?lev=) تا لینک قابل اشتراک باشد.
 */
import { useMemo } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, TONE_SOFT } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList, PercentValue } from '@/shared/components/ui/FinancialValue';
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
const SIDE_FA = { long: 'لانگ', short: 'شورت' } as const;

type CardTone = 'loss' | 'warn' | 'gain' | 'neutral';
const CARD: Record<CardTone, { border: string; label: string }> = {
  loss: { border: 'border-negative/50', label: 'پرریسک' },
  warn: { border: 'border-warn/50', label: 'کم‌حاشیه' },
  gain: { border: 'border-gain/50', label: 'معقول' },
  neutral: { border: 'border-divider', label: VERDICT_FA.unknown.label }
};

/** اهرم معقول: هم ریسک ۷ روزه ≤ ۵٪ و هم زنده ماندن در تکرار بدترین روز؛ null وقتی حتی ۱x ریسک ۷ روزه را رد می‌کند */
function sensibleLeverage(r: Assessment): number | null {
  if (r.safeLeverage === null) return null;
  return Math.max(1, Math.min(r.safeLeverage, r.crashMaxLeverage ?? r.safeLeverage));
}

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
    <div className="space-y-4">
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
          <VerdictCard r={result} model={model} coin={market} side={side} onLev={(l) => onChange({ lev: l })} />

          <div>
            <p className="mb-2 text-xs font-semibold text-muted">همین پوزیشن با اهرم‌های دیگر</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {ladder.map((r) => (
                <button
                  key={r.leverage}
                  type="button"
                  aria-pressed={r.leverage === lev}
                  onClick={() => onChange({ lev: r.leverage })}
                  className={cn('rounded-field px-2 py-2 text-center ring-offset-2 transition', TONE_SOFT[r.verdict === 'ok' && r.crashSurvives === false ? 'warn' : VERDICT_FA[r.verdict].tone], r.leverage === lev ? 'ring-2 ring-ink/70' : 'hover:ring-1 hover:ring-ink/20')}
                >
                  <span className="block text-sm font-extrabold"><bdi dir="ltr">{toFaDigits(r.leverage)}x</bdi></span>
                  <span className="block text-[10px] font-semibold">{r.crashSurvives === false ? 'آبشار می‌سوزد' : VERDICT_FA[r.verdict].short}</span>
                </button>
              ))}
            </div>
          </div>

          <Disclosure summary="جزئیات و روش محاسبه">
            <KeyValueList
              dense
              rows={[
                { label: 'فاصلهٔ لیکوئید از ورود', value: pct(result.liqPct), hint: `تخمین مارجین ایزوله با ${toFaDigits(lev)}x` },
                { label: 'احتمال لیکوئید ۲۴ ساعت', value: prob(result.p24, result.p24Floored), hint: 'در شرایط عادی' },
                { label: 'احتمال لیکوئید ۷ روز', value: prob(result.p7d, result.p7dFloored), hint: 'در شرایط عادی' },
                {
                  label: 'فاندینگ روزانه نسبت به مارجین',
                  value: <PercentValue value={result.fundingDayMarginPct === null ? null : -result.fundingDayMarginPct} digits={2} />,
                  hint: result.fundingDayMarginPct === null ? undefined : result.fundingDayMarginPct > 0 ? 'از مارجین شما کم می‌شود' : 'به مارجین شما اضافه می‌شود'
                },
                ...(model.crashPct !== null && model.crashAt !== null
                  ? [{ label: `بدترین ${side === 'long' ? 'ریزش' : 'جهش'} ۲۴ ساعته`, value: pct(model.crashPct), hint: faDate(model.crashAt) }]
                  : [])
              ]}
            />
            <p className="mt-3 text-xs leading-6 text-subtle">
              احتمال‌ها از حرکت‌های خلاف جهت {toFaDigits(model.days)} روز گذشتهٔ همین بازار می‌آیند که با نوسان امروز دوباره مقیاس شده‌اند؛ بازار پرتلاطم‌تر یعنی احتمال بالاتر.
              در آزمون عقب‌گرد روی ۱۰ بازار (ژوئیهٔ ۲۰۲۴ تا اکتبر ۲۰۲۶) وقتی این روش ۱ تا ۳٪ گفت، در واقعیت ۱.۶٪ (۲۴ ساعت) و ۲٪ (۷ روز) لیکوئید شدند. زیر ۰.۲٪ و ۲٪ مدل کم‌برآورد بود، پس کمتر از این‌ها نشان داده نمی‌شود.
              صبح ریزش ۱۰ اکتبر ۲۰۲۵ همهٔ مدل‌ها ریسک ۳x آلت‌کوین‌ها را نزدیک صفر می‌دیدند و همه لیکوئید شدند؛ برای همین «اهرم معقول» آبشار را هم در نظر می‌گیرد.
              در مارجین کراس موجودی اضافه لیکوئید را دورتر می‌برد. توصیهٔ مالی نیست.{' '}
              <button type="button" onClick={() => onCoin(market)} className="font-semibold text-brand hover:underline">فاندینگ و پوزیشن برترها روی {market}</button>
            </p>
          </Disclosure>
        </>
      )}
    </div>
  );
}

function VerdictCard({ r, model, coin, side, onLev }: { r: Assessment; model: RiskModel; coin: string; side: Side; onLev: (l: number) => void }) {
  const sensible = sensibleLeverage(r);
  const lower = sensible !== null && sensible < r.leverage;
  const crashBurns = r.crashSurvives === false;
  const unknown = r.verdict === 'unknown';
  const tone: CardTone = unknown ? 'neutral' : r.verdict === 'danger' ? 'loss' : r.verdict === 'tight' || lower || crashBurns ? 'warn' : 'gain';
  const headline = unknown
    ? `فقط ${toFaDigits(model.days)} روز سابقه هست؛ برای حکم دست‌کم ۱۸۰ روز لازم است.`
    : r.safeLeverage === null
      ? `حتی بدون اهرم احتمال لیکوئید ۷ روزه از ${pct(SAFE_TARGET_7D, 0)} بیشتر است؛ این بازار الان برای پوزیشن اهرمی مناسب نیست.`
      : lower
        ? `اهرم را به ${toFaDigits(sensible)}x یا کمتر برسانید.`
        : crashBurns
          ? 'در شرایط عادی مشکلی ندارد، اما یک آبشار مثل بدترین روز این بازار آن را می‌سوزاند.'
          : 'با این اهرم هم در شرایط عادی و هم در تکرار بدترین روز این بازار جان به در می‌برد.';

  return (
    <Surface variant="focal" className={cn('border-2 p-5', CARD[tone].border)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold text-ink">
          {SIDE_FA[side]} <bdi dir="ltr">{coin}</bdi> با <bdi dir="ltr">{toFaDigits(r.leverage)}x</bdi>
        </h3>
        <Badge tone={tone}>{CARD[tone].label}</Badge>
      </div>
      <p className="mt-1.5 text-sm leading-7 text-muted">{headline}</p>

      {!unknown && (
        <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-divider pt-4">
          <div>
            <dt className="text-2xs font-semibold text-muted">احتمال لیکوئید در ۷ روز</dt>
            <dd className={cn('mt-1 text-xl font-extrabold', r.p7d !== null && r.p7d > SAFE_TARGET_7D ? 'text-negative' : 'text-ink')}>{prob(r.p7d, r.p7dFloored)}</dd>
            <dd className="text-2xs text-subtle">شرایط عادی</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold text-muted">اگر بدترین روز تکرار شود</dt>
            <dd className={cn('mt-1 text-xl font-extrabold', crashBurns ? 'text-negative' : 'text-positive')}>{r.crashSurvives === null ? '—' : crashBurns ? 'می‌سوزد' : 'می‌ماند'}</dd>
            {model.crashPct !== null && <dd className="text-2xs text-subtle">{side === 'long' ? 'ریزش' : 'جهش'} {pct(model.crashPct, 0)}</dd>}
          </div>
          <div>
            <dt className="text-2xs font-semibold text-muted">اهرم معقول</dt>
            <dd className="mt-1 text-xl font-extrabold text-ink">{sensible === null ? '—' : <>تا <bdi dir="ltr">{toFaDigits(sensible)}x</bdi></>}</dd>
            <dd className="text-2xs text-subtle">۷ روز ≤ {pct(SAFE_TARGET_7D, 0)} و آبشار</dd>
          </div>
        </dl>
      )}

      {lower && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => onLev(sensible!)}>{`اعمال ${toFaDigits(sensible!)}x`}</Button>
          <span className="text-xs text-muted">فقط مارجینی بگذارید که حاضرید در یک آبشار کامل از دست بدهید؛ مارجین ایزوله بقیهٔ حساب را درگیر نمی‌کند.</span>
        </div>
      )}
    </Surface>
  );
}
