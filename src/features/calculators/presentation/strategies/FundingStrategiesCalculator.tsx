/**
 * ⑩ استراتژی‌های آربیتراژ فاندینگ — فرم، راهنما و مقایسه از داده (data/fundingStrategies) ساخته می‌شوند؛
 * همهٔ محاسبات در evaluateStrategy. استراتژی جدید هیچ تغییری در این فایل نمی‌خواهد.
 */
import { useMemo, useState } from 'react';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { CalcShell, ResultHero } from '../StatCard';
import { ScenarioTable } from '../delta/ScenarioTable';
import { numOr, parseNum } from '../parse';
import {
  aprToInterval,
  compareStrategies,
  evaluateStrategy,
  FUNDING_INTERVALS,
  strategySensitivity,
  validateStrategyInputs,
  type FundingInterval,
  type LegCosts,
  type NumericInputKey,
  type ScenarioKind,
  type Severity,
  type StrategyInputs
} from '@/features/calculators/domain';
import {
  COMMON_FIELDS,
  COST_FIELDS,
  FIELD_META,
  RISK_LABEL,
  SCENARIO_LABEL,
  SEVERITY_LABEL,
  STRATEGIES,
  strategyById,
  WARNING_TEXT,
  type StrategyContent,
  type StrategyId
} from '@/features/calculators/data/fundingStrategies';

type Form = Record<NumericInputKey, string> & { notional: string; legCosts: Record<keyof LegCosts, string>[] };

const SEVERITY_TONE: Record<Severity, Tone> = { low: 'gain', medium: 'warn', high: 'loss' };
const LEG_COST_FIELDS: { key: keyof LegCosts; label: string }[] = [
  { key: 'feeEntryPct', label: 'کارمزد ورود' },
  { key: 'feeExitPct', label: 'کارمزد خروج' },
  { key: 'slipEntryPct', label: 'اسلیپیج ورود' },
  { key: 'slipExitPct', label: 'اسلیپیج خروج' }
];
const SENS_FACTORS = [-1, 0, 0.5, 1, 1.5, 2];
const SENS_DAYS = [7, 30, 90, 180];

const toForm = (i: StrategyInputs): Form => ({
  ...(Object.fromEntries(Object.keys(FIELD_META).map((k) => [k, String(i[k as NumericInputKey])])) as Record<NumericInputKey, string>),
  notional: i.notional ? String(i.notional) : '',
  legCosts: i.legCosts.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Record<keyof LegCosts, string>)
});

function fromForm(f: Form, fallback: StrategyInputs): StrategyInputs {
  const num = Object.fromEntries((Object.keys(FIELD_META) as NumericInputKey[]).map((k) => [k, parseNum(f[k])])) as Record<NumericInputKey, number>;
  const legCosts = f.legCosts.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, parseNum(v)]))) as unknown as [LegCosts, LegCosts];
  return {
    ...fallback,
    ...num,
    intervalA: num.intervalA as FundingInterval,
    intervalB: num.intervalB as FundingInterval,
    notional: numOr(f.notional, 0) > 0 ? numOr(f.notional, 0) : null,
    legCosts
  };
}

const scenarioOf = (s: StrategyContent, kind: ScenarioKind) => s.scenarios.find((x) => x.kind === kind) ?? { stress: {}, overrides: undefined, title: '', note: '', kind };

export function FundingStrategiesCalculator() {
  const [id, setId] = useState<StrategyId>('spotPerp');
  const strategy = strategyById(id);
  const [form, setForm] = useState<Form>(() => toForm(strategy.defaults));
  const [kind, setKind] = useState<ScenarioKind>('base');

  const switchStrategy = (next: StrategyId) => {
    const s = strategyById(next);
    // سرمایه و مدت کاربر حفظ می‌شود؛ بقیه از پیش‌فرض استراتژی
    setForm(toForm({ ...s.defaults, capital: numOr(form.capital, s.defaults.capital), holdDays: numOr(form.holdDays, s.defaults.holdDays) }));
    setId(next);
  };
  const set = (k: NumericInputKey | 'notional') => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setLeg = (leg: number, k: keyof LegCosts) => (v: string) =>
    setForm((f) => ({ ...f, legCosts: f.legCosts.map((c, i) => (i === leg ? { ...c, [k]: v } : c)) }));

  const inputs = useMemo(() => fromForm(form, strategy.defaults), [form, strategy]);
  const errors = useMemo(() => validateStrategyInputs(inputs), [inputs]);
  const valid = Object.keys(errors).length === 0;
  const scenario = scenarioOf(strategy, kind);
  const scenarioInputs = useMemo(() => ({ ...inputs, ...scenario.overrides }), [inputs, scenario]);
  const result = useMemo(() => (valid ? evaluateStrategy(strategy.legs, scenarioInputs, scenario.stress) : null), [valid, strategy, scenarioInputs, scenario]);

  const sensKey = strategy.sensitivityKey;
  const sensBase = inputs[sensKey] as number;
  const sensValues = useMemo(() => SENS_FACTORS.map((k) => (sensBase === 0 ? k * 0.01 : sensBase * k)), [sensBase]);
  const sens = useMemo(
    () => (valid ? strategySensitivity(strategy.legs, scenarioInputs, sensKey, sensValues, SENS_DAYS, scenario.stress) : null),
    [valid, strategy, scenarioInputs, sensKey, sensValues, scenario]
  );
  const compare = useMemo(
    () => (valid ? compareStrategies(STRATEGIES, { capital: inputs.capital, holdDays: inputs.holdDays, leverage: inputs.leverage }) : []),
    [valid, inputs.capital, inputs.holdDays, inputs.leverage]
  );

  const numField = (k: NumericInputKey) =>
    k === 'intervalA' || k === 'intervalB' ? (
      <Field key={k} label={FIELD_META[k].label} error={errors[k]}>
        <Select value={form[k]} onChange={(e) => set(k)(e.target.value)}>
          {FUNDING_INTERVALS.map((h) => (
            <option key={h} value={h}>
              {toFaDigits(h)} ساعته
            </option>
          ))}
        </Select>
      </Field>
    ) : (
      <Field key={k} label={FIELD_META[k].label} error={errors[k]}>
        <Input dir="ltr" inputMode="decimal" value={form[k]} onChange={(e) => set(k)(e.target.value)} suffix={FIELD_META[k].suffix} />
      </Field>
    );

  const inputPanel = (
    <>
      <Field label="استراتژی">
        <Select value={id} onChange={(e) => switchStrategy(e.target.value as StrategyId)}>
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-muted">{strategy.summary}</p>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">سناریو</p>
        <SegmentedControl<ScenarioKind>
          label="سناریو"
          fill
          size="sm"
          value={kind}
          onChange={setKind}
          options={(['best', 'base', 'stress'] as const).map((k) => ({ value: k, label: SCENARIO_LABEL[k] }))}
        />
        {scenario.title && (
          <p className="mt-1.5 text-xs text-muted">
            <span className="font-semibold text-ink">{scenario.title}</span> — {scenario.note}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {COMMON_FIELDS.map(numField)}
        <Field label="نوتیونال هر پا (خالی = بیشینه)" error={errors.notional}>
          <Input dir="ltr" inputMode="decimal" value={form.notional} onChange={(e) => set('notional')(e.target.value)} suffix="دلار" />
        </Field>
        {strategy.inputs.map(numField)}
      </div>
      <Disclosure summary="کارمزد، اسلیپیج و هزینه‌های دیگر">
        <div className="space-y-4">
          {strategy.legs.map((leg, i) => (
            <div key={i}>
              <p className="mb-2 text-xs font-bold text-ink">{leg.label}</p>
              <div className="grid grid-cols-2 gap-3">
                {LEG_COST_FIELDS.map((c) => (
                  <Field key={c.key} label={c.label}>
                    <Input dir="ltr" inputMode="decimal" value={form.legCosts[i][c.key]} onChange={(e) => setLeg(i, c.key)(e.target.value)} suffix="٪" />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          {errors.legCosts && <p className="text-xs text-negative">{errors.legCosts}</p>}
          <div className="grid grid-cols-2 gap-3">{COST_FIELDS.map(numField)}</div>
        </div>
      </Disclosure>
    </>
  );

  return (
    <div className="space-y-6">
      <Notice tone="warn">توصیهٔ مالی نیست؛ نرخ‌های فاندینگ دائماً تغییر می‌کنند و نتیجه فقط برآورد با فرض‌های شماست.</Notice>
      <CalcShell inputs={inputPanel}>
        {!result ? (
          <Notice tone="error">ورودی‌های نامعتبر را اصلاح کنید.</Notice>
        ) : (
          <>
            {result.warnings.map((w) => (
              <Notice key={w} tone={w === 'liquidated' || w === 'netNegative' ? 'error' : 'warn'}>
                {WARNING_TEXT[w]}
              </Notice>
            ))}
            <ResultHero
              label={`سود خالص — سناریوی ${SCENARIO_LABEL[kind]}`}
              value={<MoneyValue value={result.net} signed tone="auto" />}
              sub={
                <>
                  APR خالص <PercentValue value={result.netAprPct} className="font-semibold" /> · ROI روی کل سرمایه{' '}
                  <PercentValue value={result.roiPct} className="font-semibold" /> · {toFaDigits(Math.round(result.holdDays))} روز
                </>
              }
            >
              <MetricGrid cols={3}>
                <Metric label="APY خالص (مرکب)" value={<PercentValue value={result.netApyPct} />} />
                <Metric label="بازدهی سرمایه" value={<PercentValue value={result.capitalEfficiencyPct} signed={false} tone="none" />} sub="نوتیونال ÷ سرمایهٔ قفل" />
                <Metric label="نوتیونال هر پا" value={<MoneyValue value={result.notional} />} />
                <Metric
                  label="فاندینگ/carry سربه‌سر"
                  value={<PercentValue value={result.breakEvenCarryAprPct} tone="none" />}
                  sub={
                    result.breakEvenCarryAprPct !== null && strategy.inputs.includes('fundingA') ? (
                      <>
                        هر بازه <PercentValue value={aprToInterval(result.breakEvenCarryAprPct, inputs.intervalA)} digits={4} tone="none" />
                      </>
                    ) : (
                      'سالانه روی نوتیونال'
                    )
                  }
                />
                <Metric label="روز تا سربه‌سر" value={result.breakEvenDays === null ? 'هرگز' : toFaDigits(result.breakEvenDays.toFixed(1))} />
                <Metric label="پس از هزینهٔ فرصت" value={<MoneyValue value={result.netAfterOpportunity} signed tone="auto" />} />
              </MetricGrid>
            </ResultHero>

            <Surface className="p-4 md:p-5">
              <h3 className="mb-2 text-sm font-bold text-ink">درآمد و هزینه‌ها</h3>
              <KeyValueList
                dense
                rows={[
                  { label: 'فاندینگ ناخالص', value: <MoneyValue value={result.grossFunding} signed tone="auto" /> },
                  { label: 'بیسیس فیوچرز (carry)', value: <MoneyValue value={result.futuresCarry} signed tone="auto" /> },
                  { label: 'لندینگ / استیکینگ', value: <MoneyValue value={result.yieldIncome} signed tone="auto" /> },
                  { label: 'کارمزد (۴ رویداد + رول)', value: <MoneyValue value={-result.costs.fees} signed tone="auto" /> },
                  { label: 'اسلیپیج', value: <MoneyValue value={-result.costs.slippage} signed tone="auto" /> },
                  { label: 'بهرهٔ قرض', value: <MoneyValue value={-result.costs.borrow} signed tone="auto" /> },
                  { label: 'انتقال، گس و بالانس', value: <MoneyValue value={-result.costs.transfer} signed tone="auto" /> },
                  { label: 'سود/زیان بیسیس اجرا', value: <MoneyValue value={result.basisPnl} signed tone="auto" /> },
                  { label: 'سود/زیان قیمت (لیکویید/دیپگ)', value: <MoneyValue value={result.pricePnl} signed tone="auto" /> },
                  { label: 'سود خالص', value: <MoneyValue value={result.net} signed tone="auto" />, emphasis: true }
                ]}
              />
            </Surface>

            <Surface className="p-4 md:p-5">
              <h3 className="mb-2 text-sm font-bold text-ink">لیکوئیدیشن و مارجین</h3>
              <KeyValueList
                dense
                rows={[
                  ...result.legs.map((l, i) => ({
                    label: strategy.legs[i].label,
                    hint: l.liquidated ? 'در این سناریو لیکویید می‌شود' : undefined,
                    value:
                      l.liquidationMovePct === null ? (
                        'لیکویید نمی‌شود'
                      ) : (
                        <span>
                          <MoneyValue value={l.liquidationPrice} /> · <PercentValue value={l.liquidationMovePct} signed={false} tone="none" />
                        </span>
                      )
                  })),
                  { label: 'سرمایهٔ قفل‌شده', value: <MoneyValue value={result.capitalLocked} /> },
                  { label: 'مارجین اضافهٔ لازم پس از حرکت قیمت', value: <MoneyValue value={result.marginTopUp} /> }
                ]}
              />
            </Surface>

            {sens && (
              <Surface className="p-4 md:p-5">
                <h3 className="text-sm font-bold text-ink">حساسیت APR خالص</h3>
                <p className="mb-2 mt-0.5 text-xs text-muted">
                  سطر: {FIELD_META[sensKey].label} · ستون: روز نگهداری
                </p>
                <ScenarioTable
                  caption="APR خالص در برابر نرخ و مدت"
                  unit="٪"
                  cols={SENS_DAYS.map((d) => `${toFaDigits(d)} روز`)}
                  rows={sens.map((row, ri) => ({
                    head: <bdi dir="ltr">{toFaDigits(Number(sensValues[ri].toPrecision(3)))}</bdi>,
                    cells: row.map((v, ci) => ({ value: v, current: SENS_FACTORS[ri] === 1 && SENS_DAYS[ci] === inputs.holdDays }))
                  }))}
                />
              </Surface>
            )}
          </>
        )}
      </CalcShell>

      <StrategyGuide strategy={strategy} inputs={inputs} />

      {compare.length > 0 && (
        <Surface className="overflow-hidden">
          <div className="px-4 pt-4 md:px-5">
            <h3 className="text-sm font-bold text-ink">مقایسهٔ استراتژی‌ها</h3>
            <p className="mt-0.5 text-xs text-muted">همان سرمایه، مدت و اهرم روی نرخ‌های پیش‌فرض هر استراتژی · امتیاز ریسک = APR خالص ÷ وزن ریسک</p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table is-compact mt-2">
              <caption className="sr-only">مقایسهٔ استراتژی‌ها</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4 md:!ps-5">استراتژی</th>
                  <th scope="col" className="col-num">APR خالص</th>
                  <th scope="col" className="col-num">وزن ریسک</th>
                  <th scope="col" className="col-num">تعدیل‌شده</th>
                  <th scope="col" className="col-num !pe-4 md:!pe-5">رتبهٔ ریسک</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((r) => (
                  <tr key={r.id} className={cn(r.id === id && 'bg-surface-2')}>
                    <td className="!ps-4 md:!ps-5">
                      {toFaDigits(r.rankByApr)}. {strategyById(r.id as StrategyId).name}
                    </td>
                    <td className="col-num"><PercentValue value={r.result.netAprPct} /></td>
                    <td className="col-num">{toFaDigits(r.riskWeight.toFixed(1))}</td>
                    <td className="col-num"><PercentValue value={r.riskAdjusted} /></td>
                    <td className="col-num !pe-4 md:!pe-5">{toFaDigits(r.rankByRisk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-bold text-ink">{title}</h4>
      <ul className="list-disc space-y-0.5 ps-5 text-sm text-muted">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** راهنمای استراتژی + سناریوهای محاسبه‌شده روی پیش‌فرض‌ها با سرمایه و مدت کاربر */
function StrategyGuide({ strategy, inputs }: { strategy: StrategyContent; inputs: StrategyInputs }) {
  const base = { ...strategy.defaults, capital: inputs.capital, holdDays: inputs.holdDays };
  return (
    <Surface className="space-y-5 p-4 md:p-5">
      <div>
        <h3 className="text-sm font-bold text-ink">
          {strategy.name} <bdi dir="ltr" className="text-xs text-subtle">{strategy.nameEn}</bdi>
        </h3>
        <p className="mt-0.5 text-sm text-muted">{strategy.capitalNote}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="کی جواب می‌دهد" items={strategy.worksWhen} />
        <List title="کی شکست می‌خورد" items={strategy.failsWhen} />
        <List title="شرایط ورود" items={strategy.entry} />
        <List title="محرک‌های خروج" items={strategy.exits} />
        <List title="پاها" items={strategy.legs.map((l) => `${l.label} — ${l.venueType}`)} />
        <List title="اجزای هزینه" items={strategy.costs} />
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold text-ink">ریسک‌ها</h4>
        <ul className="space-y-1.5">
          {strategy.risks.map((r) => (
            <li key={r.kind} className="flex flex-wrap items-baseline gap-2 text-sm text-muted">
              <Badge tone={SEVERITY_TONE[r.severity]}>
                {RISK_LABEL[r.kind]} · {SEVERITY_LABEL[r.severity]}
              </Badge>
              {r.note}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold text-ink">سناریوهای عددی (پیش‌فرض‌ها، سرمایه و مدت شما)</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {strategy.scenarios.map((s) => {
            const r = evaluateStrategy(strategy.legs, { ...base, ...s.overrides }, s.stress);
            return (
              <div key={s.title} className="rounded-card border border-divider p-3">
                <p className="text-xs font-bold text-ink">
                  {SCENARIO_LABEL[s.kind]}: {s.title}
                </p>
                <p className="mt-0.5 text-2xs text-muted">{s.note}</p>
                <p className="mt-2 text-sm">
                  <MoneyValue value={r.net} signed tone="auto" className="font-bold" /> · APR <PercentValue value={r.netAprPct} />
                </p>
                {r.warnings.includes('liquidated') && <p className="text-2xs text-negative">{WARNING_TEXT.liquidated}</p>}
              </div>
            );
          })}
        </div>
      </div>
      <List title="چک‌لیست پایش" items={strategy.checklist} />
    </Surface>
  );
}
