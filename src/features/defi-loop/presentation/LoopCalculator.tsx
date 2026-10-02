/**
 * DeFi loop calculator — "I have $X; should I loop?"
 *  INPUT: capital / period / safety level / user parameters (LTV, LT, borrow APY —
 *         not available from the public API)
 *  RESULT: net profit + real APY at the recommended point
 *  then: recommendation vs reference (DeFiLlama 5 loops, no user costs) · risk &
 *  stress test · loop table · economics · calculation details
 * ⚠️ No "safe" guarantee — every figure is an estimate from current data.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import {
  runLoopStrategy,
  SAFETY_LABEL,
  RISK_LEVEL_FA,
  parseLtvInput,
  parsePercentInput,
  parseSupplyComponents,
  type SafetyLevel
} from '@/features/defi-loop/domain/loopEngine';
import type { YieldPool } from '@/features/defi-loop/data/yieldsService';
import { ensurePoolChart } from '@/features/defi-loop/data/useYieldLoops';
import { computeApyStats } from '@/features/defi-loop/domain/yieldAnalytics';
import { fmtPct, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const DAYS_OPTIONS = [7, 30, 90, 180, 365];

/** reference leverage with one decimal (3.288 → 3.3x) */
const fmtLev = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)}x`);

export function LoopCalculator({ pool }: { pool: YieldPool; onClose?: () => void }) {
  const [capital, setCapital] = useState(10000);
  const [days, setDays] = useState(90);
  const [safety, setSafety] = useState<SafetyLevel>('balanced');
  const [ltv, setLtv] = useState<string>('0.75');
  const [lt, setLt] = useState<string>('0.8');
  const [borrowApy, setBorrowApy] = useState<string>('0.05');
  const [borrowReward, setBorrowReward] = useState<string>('0');
  const [gasPerLoop, setGasPerLoop] = useState('3');
  const [slippage, setSlippage] = useState('5');
  const [rewardMult, setRewardMult] = useState<1 | 0.5 | 1.5>(1);
  const [chart, setChart] = useState<Awaited<ReturnType<typeof ensurePoolChart>>>(null);

  // lazy history for the stats (side effect → useEffect)
  useEffect(() => {
    let cancelled = false;
    void ensurePoolChart(pool.pool).then((c) => !cancelled && setChart(c));
    return () => {
      cancelled = true;
    };
  }, [pool.pool]);

  const apyStats = useMemo(() => computeApyStats(chart ?? [], pool.apy ?? 0), [chart, pool.apy]);
  // APY components — no double count (base + reward = total)
  const components = useMemo(() => parseSupplyComponents(pool.apy, pool.apyBase, pool.apyReward), [pool]);

  const result = useMemo(
    () =>
      runLoopStrategy({
        initialCapital: capital,
        supplyApy: components.base,
        rewardApy: components.reward,
        borrowApy: parsePercentInput(borrowApy),
        borrowRewardApy: parsePercentInput(borrowReward),
        ltv: parseLtvInput(ltv),
        liquidationThreshold: parseLtvInput(lt),
        days,
        safety,
        costPerLoopUsd: Number(gasPerLoop) || 0,
        slippageUsd: Number(slippage) || 0,
        bridgeFeeUsd: 0,
        protocolMaxLoops: null,
        availableBorrowLiquidity: null,
        rewardMultiplier: rewardMult
      }),
    [capital, days, safety, ltv, lt, borrowApy, borrowReward, gasPerLoop, slippage, rewardMult, components]
  );

  const stress = result.risk.stress;
  const hfMin = safety === 'conservative' ? 2 : safety === 'balanced' ? 1.75 : 1.5;
  const riskTone =
    result.risk.riskLevel === 'low' ? 'gain' : result.risk.riskLevel === 'moderate' ? 'warn' : result.risk.riskLevel === 'unknown' ? 'neutral' : 'loss';

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      {/* INPUT */}
      <section aria-label="ورودی‌ها" className="lg:col-span-4">
        <Surface className="space-y-5 p-4 md:p-5 lg:sticky lg:top-8">
          <div className="grid grid-cols-2 gap-4">
            <Field label="سرمایه اولیه" className="col-span-2">
              <Input dir="ltr" type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} suffix="دلار" />
            </Field>
            <Field label="مدت">
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {DAYS_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {toFaDigits(d)} روز
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="سناریوی پاداش">
              <Select value={rewardMult} onChange={(e) => setRewardMult(Number(e.target.value) as 1 | 0.5 | 1.5)}>
                <option value={0.5}>محافظه‌کارانه (۵۰٪)</option>
                <option value={1}>پایه (۱۰۰٪)</option>
                <option value={1.5}>خوش‌بینانه (۱۵۰٪)</option>
              </Select>
            </Field>
            <Field label="سطح ایمنی" className="col-span-2">
              <Select value={safety} onChange={(e) => setSafety(e.target.value as SafetyLevel)}>
                {(Object.keys(SAFETY_LABEL) as SafetyLevel[]).map((s) => (
                  <option key={s} value={s}>
                    {SAFETY_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-4 rounded-field bg-warn/8 p-3">
            <p className="text-xs leading-5 text-ink">
              Borrow APY، LTV و آستانه لیکوییدیشن از API عمومی در دسترس نیستند — مقادیر زیر ورودی شما و برآوردی‌اند.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="نسبت وام به وثیقه" hint="۰.۷۵ یا ۷۵">
                <Input dir="ltr" value={ltv} onChange={(e) => setLtv(e.target.value)} />
              </Field>
              <Field label="آستانه لیکوییدیشن">
                <Input dir="ltr" value={lt} onChange={(e) => setLt(e.target.value)} />
              </Field>
              <Field label="نرخ سالانهٔ وام" hint="درصد یا اعشار">
                <Input dir="ltr" value={borrowApy} onChange={(e) => setBorrowApy(e.target.value)} />
              </Field>
              <Field label="پاداش وام">
                <Input dir="ltr" value={borrowReward} onChange={(e) => setBorrowReward(e.target.value)} />
              </Field>
              <Field label="گس هر حلقه">
                <Input dir="ltr" value={gasPerLoop} onChange={(e) => setGasPerLoop(e.target.value)} suffix="دلار" />
              </Field>
              <Field label="لغزش">
                <Input dir="ltr" value={slippage} onChange={(e) => setSlippage(e.target.value)} suffix="دلار" />
              </Field>
            </div>
          </div>
        </Surface>
      </section>

      {/* RESULT */}
      <section aria-label="نتیجه" aria-live="polite" className="space-y-6 lg:col-span-8">
        <Surface variant="focal" className="p-5 md:p-6">
          <p className="text-sm font-semibold text-muted">
            سود خالص {toFaDigits(days)} روزه — در نقطه پیشنهادی ({toFaDigits(result.recommendation.recommendedLoops)} حلقه)
          </p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">
            <MoneyValue value={result.economics.netProfit} signed tone="auto" />
          </p>
          <p className="mt-1 text-sm text-muted">
            بازده سالانه واقعی شما <PercentValue value={result.economics.realApy * 100} className="font-semibold" /> · ROI دوره{' '}
            <PercentValue value={result.economics.realRoiPct} className="font-semibold" />
          </p>
          <MetricGrid cols={4} className="mt-6 border-t border-divider pt-5">
            <Metric label="اهرم پیشنهادی" value={<span className="num-ltr">{fmtLev(result.recommendation.recommendedLeverage)}</span>} sub={`مرجع ${fmtLev(result.reference.leverage)}`} />
            <Metric
              label="ضریب سلامت"
              value={
                <span className={cn('num-ltr', (result.risk.healthFactor ?? 2) < 1.5 && 'text-negative')}>
                  {result.risk.healthFactor !== null ? result.risk.healthFactor.toFixed(2) : '—'}
                </span>
              }
              sub={`حداقل ${hfMin}`}
            />
            <Metric label="سطح ریسک" value={<Badge tone={riskTone} className="text-sm">{RISK_LEVEL_FA[result.risk.riskLevel]}</Badge>} />
            <Metric
              label="فاصله تا لیکوییدیشن"
              value={result.risk.liquidationDistancePct !== null ? <span className="num-ltr">{result.risk.liquidationDistancePct.toFixed(1)}%</span> : '—'}
            />
          </MetricGrid>
        </Surface>

        {result.recommendation.reason && <Notice tone="warn">{result.recommendation.reason}</Notice>}

        <div className="grid gap-6 xl:grid-cols-2">
          <Section id="reference" title="مرجع دیفای‌لاما" description={`${toFaDigits(result.reference.loops ?? 0)} حلقه، بدون هزینه‌های شما`}>
            <Surface className="px-4">
              <KeyValueList
                rows={[
                  { label: 'LTV', value: <PercentValue value={(parseLtvInput(ltv) ?? 0) * 100} signed={false} tone="none" digits={0} /> },
                  { label: 'اهرم مرجع', value: <span className="num-ltr">{fmtLev(result.reference.leverage)}</span> },
                  { label: 'کل سپرده', value: <MoneyValue value={result.reference.totalSupply} /> },
                  { label: 'کل وام', value: <MoneyValue value={result.reference.totalBorrow} /> },
                  { label: 'بازده سپرده مؤثر', value: <PercentValue value={result.reference.effectiveSupplyApy * 100} signed={false} tone="none" /> },
                  { label: 'نرخ سالانهٔ وام خالص', value: <PercentValue value={result.reference.netBorrowApy !== null ? result.reference.netBorrowApy * 100 : null} signed={false} tone="none" /> },
                  { label: 'بازده حلقه مرجع', emphasis: true, value: <PercentValue value={result.reference.loopedApy !== null ? result.reference.loopedApy * 100 : null} /> }
                ]}
              />
            </Surface>
            <p className="mt-2 text-xs text-muted">مرجع یک عدد اقتصادی خالص است، نه تضمین ایمنی. توصیه بر اساس ضریب سلامت و سطح ایمنی شما جدا محاسبه می‌شود.</p>
          </Section>

          <Section id="economics" title="اقتصاد حلقه" description={`${toFaDigits(days)} روز، در نقطه پیشنهادی`}>
            <Surface className="px-4">
              <KeyValueList
                rows={[
                  { label: 'درآمد سپرده', value: <MoneyValue value={result.economics.supplyIncome} signed tone="auto" /> },
                  { label: 'درآمد پاداش', value: <MoneyValue value={result.economics.rewardIncome} signed tone="auto" /> },
                  { label: 'هزینه وام', value: <MoneyValue value={-Math.abs(result.economics.borrowCost)} /> },
                  ...(result.economics.borrowRewardIncome > 0
                    ? [{ label: 'پاداش وام', value: <MoneyValue value={result.economics.borrowRewardIncome} signed tone="auto" /> }]
                    : []),
                  { label: 'هزینه تأمین مالی (خالص)', value: <MoneyValue value={-Math.abs(result.economics.financingCost)} /> },
                  { label: 'هزینه‌های عملیاتی', value: <MoneyValue value={-Math.abs(result.economics.operatingCosts)} /> },
                  { label: 'سود ناخالص', value: <MoneyValue value={result.economics.grossYield} signed tone="auto" /> },
                  { label: 'سود خالص', emphasis: true, value: <MoneyValue value={result.economics.netProfit} signed tone="auto" /> }
                ]}
              />
            </Surface>
          </Section>
        </div>

        {stress.length > 0 && (
          <Section id="stress" title="آزمون تنش" description="ضریب سلامت با افت قیمت وثیقه — برآورد، نه تضمین">
            <Surface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <caption className="sr-only">آزمون تنش</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="!ps-5">افت قیمت</th>
                      {stress.map((s) => (
                        <th key={s.dd} scope="col" className="col-num">{s.dd === 0 ? 'فعلی' : `-${toFaDigits(s.dd)}٪`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row" className="!ps-5 text-start font-semibold text-ink">ضریب سلامت</th>
                      {stress.map((s) => (
                        <td
                          key={s.dd}
                          className={cn('col-num num-ltr font-semibold', s.risk === 'ok' ? 'text-positive' : s.risk === 'warning' ? 'text-warn' : 'text-negative')}
                        >
                          {s.hf !== null ? s.hf.toFixed(2) : '—'}
                          <span className="block text-2xs font-normal">{s.risk === 'ok' ? 'OK' : s.risk === 'warning' ? 'هشدار' : 'لیکوییدیشن'}</span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Surface>
            <p className="mt-2 text-xs text-muted">برای وثیقه استیبل حساسیت قیمت صفر است؛ برای اتریوم و مشابه، افت قیمت مستقیماً روی ضریب سلامت اثر می‌گذارد.</p>
          </Section>
        )}

        <Section id="steps" title="جدول حلقه‌ها (توصیه‌شده)">
          <Surface className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table is-compact min-w-[560px]">
                <caption className="sr-only">جدول حلقه‌ها</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-5">حلقه</th>
                    <th scope="col" className="col-num">سپرده</th>
                    <th scope="col" className="col-num">وام</th>
                    <th scope="col" className="col-num">کل سپرده</th>
                    <th scope="col" className="col-num">کل وام</th>
                    <th scope="col" className="col-num">اهرم</th>
                    <th scope="col" className="col-num">ضریب سلامت</th>
                    <th scope="col" className="!pe-5">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {result.steps.map((s) => (
                    <tr key={s.loop}>
                      <td className="num-ltr !ps-5 font-semibold text-ink">#{s.loop}</td>
                      <td className="col-num"><MoneyValue value={s.supply} /></td>
                      <td className="col-num"><MoneyValue value={s.borrow} /></td>
                      <td className="col-num font-semibold"><MoneyValue value={s.totalSupply} /></td>
                      <td className="col-num"><MoneyValue value={s.totalBorrow} /></td>
                      <td className="col-num num-ltr">{s.leverage.toFixed(2)}x</td>
                      <td className="col-num num-ltr">{s.healthFactor !== null ? s.healthFactor.toFixed(2) : '—'}</td>
                      <td className="!pe-5"><Badge tone={s.status === 'safe' ? 'gain' : 'warn'}>{s.status === 'safe' ? 'ایمن' : 'هشدار'}</Badge></td>
                    </tr>
                  ))}
                  {result.steps.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-sm text-muted">
                        هیچ گام Loop با سطح ایمنی فعلی سازگار نیست — فقط Supply بدون اهرم.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Surface>
          {(result.stops.length > 0 || result.warnings.length > 0) && (
            <div className="mt-3 space-y-2">
              {result.stops.map((s, i) => (
                <Notice key={'s' + i} tone="warn">{s}</Notice>
              ))}
              {result.warnings.map((w, i) => (
                <Notice key={'w' + i} tone="neutral">{w}</Notice>
              ))}
            </div>
          )}
        </Section>

        <Surface className="px-4 md:px-5">
          <Disclosure summary="جزئیات محاسبه">
            <KeyValueList
              dense
              rows={[
                {
                  label: 'سپرده',
                  value: (
                    <span className="num-ltr">
                      {fmtPct(components.base * 100)} + {fmtPct(components.reward * 100)} ×{rewardMult} = {fmtPct(result.reference.effectiveSupplyApy * 100)}
                    </span>
                  )
                },
                { label: 'وام خالص', value: <span className="num-ltr">{borrowApy} − {borrowReward} = {result.reference.netBorrowApy !== null ? fmtPct(result.reference.netBorrowApy * 100) : '—'}</span> },
                { label: 'اهرم مرجع = 1 + L + … + L⁵', value: <span className="num-ltr">{result.reference.leverage?.toFixed(4)}x</span> },
                { label: 'Looped APY = Supply×Lev − Borrow×(Lev−1)', value: <PercentValue value={result.reference.loopedApy !== null ? result.reference.loopedApy * 100 : null} /> },
                { label: 'بازده سالانه واقعی = (1 + خالص/سرمایه)^(365/روز) − 1', value: <PercentValue value={result.economics.realApy * 100} /> },
                { label: 'میانگین بازده سالانه ۳۰ روزه', value: <PercentValue value={apyStats.avg30d} signed={false} tone="none" /> },
                { label: 'جهش ناگهانی بازده سالانه', value: apyStats.spikeDetected ? <Badge tone="warn">بله</Badge> : 'خیر' }
              ]}
            />
          </Disclosure>
        </Surface>

        <p className="flex items-start gap-2 text-xs leading-5 text-muted">
          <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          همه نتایج برآورد بر اساس داده فعلی‌اند؛ APY، نرخ Borrow، قیمت Collateral و Health Factor تغییر می‌کنند. هیچ تضمین «ایمن» یا
          «بدون لیکوییدیشن» وجود ندارد.
        </p>
      </section>
    </div>
  );
}
