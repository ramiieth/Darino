import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { borosAssetName, borosVenueName } from './borosLabels';
/**
 * Boros simulator — Input → BorosCalculationEngine → Output
 *
 * WORLD A (preview / simulation):
 *  - projected margin / notional / settlement / fees / net PnL / scenarios
 *  - rate sensitivity · theoretical APR risk buffer (simulator metric)
 *  - Liquidation Implied APR = N/A (live Boros position required) — never guessed
 *  - scenario MTM = N/A (no scenario mark; underlying is never used as mark)
 *
 * Layout: INPUT → primary result → breakdown (progressive disclosure).
 */
import { useMemo, useState } from 'react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { fmtPct, toFaDigits, fmtUSD } from '@/shared/utils/formatters';
import { OrderPreviewPanel } from './OrderPreviewPanel';
import { BorosCalculationEngine, calcRateSensitivity, daysToMaturity, projectCapital } from '@/features/boros/domain/calc';
import type { BorosDirection, BorosMarket } from '@/features/boros/domain/types';
import { isLiquidationAPRAvailable, LIQUIDATION_SOURCE_FA } from '@/features/boros/domain/liquidationApr';

const LIVE_POSITION_NA_REASON =
  'بدون پوزیشن و وثیقه واقعی در بوروس، نرخ لیکوئید ضمنی قابل محاسبه نیست (نامشخص).';

export function SimulatorTab({ markets }: { markets: BorosMarket[] }) {
  const [marketId, setMarketId] = useState(markets[0]?.marketId ?? 0);
  const [direction, setDirection] = useState<BorosDirection>('long');
  const [size, setSize] = useState('222');
  const [fixedRateInput, setFixedRateInput] = useState('');
  const fixedRate = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(fixedRateInput) ? Number(fixedRateInput) / 100 : null;
  const [gasInput, setGasInput] = useState('0');
  const gasUsd = Number(gasInput);
  const [capitalInput, setCapitalInput] = useState('1000');
  const capitalUsd = Number(capitalInput) || 0;
  /** MODE B = simulation (hypothetical capital) · MODE C = order preview */
  const [previewMode, setPreviewMode] = useState<'sim' | 'preview'>('preview');

  const market = markets.find((m) => m.marketId === marketId) ?? markets[0];
  const days = market ? daysToMaturity(market) : 0;
  const rate = fixedRate ?? market?.markApr ?? 0;

  const sim = useMemo(() => {
    if (!market || !Number.isFinite(Number(size)) || !(Number(size) > 0) || !Number.isFinite(gasUsd) || gasUsd < 0) return null;
    const sizeN = Number(size) || 0;
    const analysis = BorosCalculationEngine.analyze({
      m: market,
      direction,
      size: sizeN,
      fixedApr: fixedRate ?? undefined,
      gasUsd,
      slippageRate: null // no public order book → N/A (never guessed)
    });
    const sensitivity = calcRateSensitivity(sizeN, days);
    const isLong = direction === 'long';
    const currentPnl = isLong ? analysis.grossLongPnl : analysis.grossShortPnl;
    const netCurrent = isLong ? analysis.totalLongPnl : analysis.totalShortPnl;
    const mtm = isLong ? analysis.mtmLongPnl : analysis.mtmShortPnl;
    const proj = projectCapital({ m: market, capitalUsd: Number(capitalUsd) || 0, direction, gasUsd, fixedApr: fixedRate ?? undefined });
    return { analysis, sensitivity, currentPnl, netCurrent, mtm, isLong, proj };
  }, [market, size, fixedRate, days, gasUsd, direction, capitalUsd]);

  if (!market) return <EmptyState message="بازار فعالی موجود نیست" />;

  const a = sim?.analysis;
  const fees = a?.fees;
  const proj = sim?.proj;
  const liqAvail = proj ? isLiquidationAPRAvailable(proj.liquidation.liquidationApr) : false;
  const dirFa = direction === 'long' ? 'لانگ' : 'شورت';

  return (
    <div className="space-y-6">
      {/* INPUT */}
      <Surface className="p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="بازار" className="md:col-span-6">
            <Select value={market.marketId} onChange={(e) => setMarketId(Number(e.target.value))}>
              {markets.map((m) => (
                <option key={m.marketId} value={m.marketId}>
                  {`${borosAssetName(m.asset)} · ${borosVenueName(m.venue)}`} — {fmtPct(m.markApr * 100)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-6">
            <p className="mb-1.5 text-xs font-semibold text-muted">جهت</p>
            <SegmentedControl
              label="جهت"
              fill
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'long', label: 'لانگ' },
                { value: 'short', label: 'شورت' }
              ]}
            />
          </div>
          {previewMode === 'sim' && <Field label="حجم" className="md:col-span-3">
            <Input dir="ltr" inputMode="decimal" value={size} onChange={(e) => setSize(normalizeDecimalInput(e.target.value))} suffix="دلار" />
          </Field>}
          <Field label="نرخ ثابت" error={fixedRateInput !== '' && fixedRate === null ? 'نرخ معتبر وارد کنید' : undefined} hint={`پیش‌فرض: مارک ${fmtPct(market.markApr * 100)}`} className="md:col-span-3">
            <Input
              dir="ltr"
              inputMode="decimal"
              value={fixedRateInput}
              onChange={(e) => setFixedRateInput(normalizeDecimalInput(e.target.value))}
              placeholder={(market.markApr * 100).toFixed(2)}
              suffix="%"
            />
          </Field>
          {previewMode === 'sim' && <Field label="گس" className="md:col-span-3">
            <Input dir="ltr" inputMode="decimal" value={gasInput} onChange={(e) => setGasInput(normalizeDecimalInput(e.target.value))} suffix="دلار" />
          </Field>}
          {previewMode === 'sim' && <Field label="سرمایه مارجین" hint="فقط مارجین اولیه" className="md:col-span-3">
            <Input dir="ltr" inputMode="decimal" value={capitalInput} onChange={(e) => setCapitalInput(normalizeDecimalInput(e.target.value))} suffix="دلار" />
          </Field>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-divider pt-4 text-xs text-muted">
          <span>{toFaDigits(Math.ceil(days))} روز تا سررسید</span>
          <span className="inline-flex items-center gap-1">نرخ ثابت <PercentValue value={rate * 100} signed={false} tone="none" className="font-semibold text-ink" /> <ProvenanceBadge kind={fixedRate === null ? "boros" : "simulated"} /></span>
          <span className="inline-flex items-center gap-1">مارک <PercentValue value={market.markApr * 100} signed={false} tone="none" className="font-semibold text-ink" /></span>
          <span className="inline-flex items-center gap-1">شناور <PercentValue value={market.floatingApr * 100} signed={false} tone="none" className="font-semibold text-ink" /></span>
          <span>میانگین ضمنی ۷ روزه {a && a.avg7d !== null ? <PercentValue value={a.avg7d * 100} signed={false} tone="none" /> : '—'}</span>
        </div>
      </Surface>

      <SegmentedControl
        label="حالت"
        value={previewMode}
        onChange={setPreviewMode}
        options={[
          { value: 'sim', label: 'شبیه‌سازی با سرمایه فرضی' },
          { value: 'preview', label: 'تحلیل ورود' }
        ]}
      />

      {previewMode === 'preview' && (
        <OrderPreviewPanel
          markets={markets}
          onSelectMarket={(id, side) => { setMarketId(id); setDirection(side); setFixedRateInput(''); }}
          market={market}
          direction={direction}
          fixedRate={fixedRate}
          underlyingApr={market.floatingApr}
          collateralPriceUsd={market.collateralPriceUsd ?? 0}
        />
      )}

      {previewMode === 'sim' && sim && a && fees && proj && (
        <>
          {/* RESULT */}
          <Surface variant="focal" className="p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-muted">
                  خالص سناریوی سررسید — اگر <span className="num-ltr">{fmtUSD(proj.capital)}</span> صرف مارجین اولیه شود ({dirFa})
                </p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight">
                  <MoneyValue value={proj.expectedNetPnl} signed tone="auto" />
                </p>
                <p className="mt-1 text-sm text-muted">
                  بازده روی مارجین <PercentValue value={proj.roiOnMargin} className="font-semibold" /> · سالانه‌شده (نظری){' '}
                  <PercentValue value={proj.theoreticalAnnualizedRoi} className="font-semibold" />
                </p>
              </div>
              <ProvenanceBadge kind="simulated" />
            </div>
            <MetricGrid cols={3} className="mt-6 border-t border-divider pt-5">
              <Metric label="مارجین اولیه" value={<MoneyValue value={proj.initialMargin} />} />
              <Metric label="ارزش اسمی قابل‌دستیابی" value={<MoneyValue value={proj.notional} />} />
              <Metric label="ارزش اسمی / سرمایه" value={<span className="num-ltr">{toFaDigits(proj.effectiveExposure.toFixed(2))} برابر</span>} />
              <Metric label="حساسیت به ۱٪ نرخ" value={<MoneyValue value={proj.rateSensitivity} />} />
              <Metric label="سود تسویه" value={<MoneyValue value={proj.expectedSettlementPnl} signed tone="auto" />} />
              <Metric label="هزینه کل" value={<MoneyValue value={proj.totalCost !== null ? -Math.abs(proj.totalCost) : null} />} />
            </MetricGrid>
          </Surface>

          <Notice tone="warn" title={`${toFaDigits(proj.effectiveExposure.toFixed(1))} برابر، اهرم دارایی نیست`}>
            نسبت ارزش اسمی به سرمایه، اهرم متعارف وثیقه نیست؛ در بوروس ریسک عمدتاً با حساسیت نرخ و حاشیه مارجین تعیین می‌شود.
            سالانه‌شده فقط یک برون‌یابی ریاضی است و پیش‌بینی بازده آینده نیست.
          </Notice>

          {/* scenarios */}
          <Section
            id="rate-scenarios"
            title={`سناریوهای نرخ (${dirFa})`}
            description="ترتیب اقتصادی تضمین‌شده: برای لانگ نامطلوب ≤ پایه ≤ مطلوب (برای شورت برعکس)"
          >
            {proj.scenarios.base === null ? (
              <Notice tone="neutral">داده تاریخی کافی برای سناریو وجود ندارد (نامشخص).</Notice>
            ) : (
              <Surface className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[560px]">
                    <caption className="sr-only">سناریوهای نرخ</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="!ps-5">سناریو</th>
                        <th scope="col" className="col-num">نرخ شناور فرضی</th>
                        <th scope="col" className="col-num">تسویه</th>
                        <th scope="col" className="col-num">هزینه</th>
                        <th scope="col" className="col-num">خالص</th>
                        <th scope="col" className="col-num !pe-5">بازده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[proj.scenarios.bear, proj.scenarios.base, proj.scenarios.bull].map((sc) => (
                        <tr key={sc!.label}>
                          <th scope="row" className="!ps-5 text-start font-semibold text-ink">{sc!.label}</th>
                          <td className="col-num"><PercentValue value={sc!.assumedFloatingRate * 100} signed={false} tone="none" /></td>
                          <td className="col-num"><MoneyValue value={sc!.settlementPnl} signed tone="auto" /></td>
                          <td className="col-num text-muted"><MoneyValue value={sc!.totalCosts} /></td>
                          <td className="col-num font-semibold"><MoneyValue value={sc!.netPnl} signed tone="auto" /></td>
                          <td className="col-num !pe-5"><PercentValue value={sc!.roiOnMargin} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-divider px-5 py-3 text-xs text-muted">
                  ارزش روز سناریو نامشخص است؛ نرخ مارک آینده در دسترس نیست.
                </p>
              </Surface>
            )}
          </Section>

          {/* liquidation (always N/A in WORLD A) */}
          <Section id="liquidation" title="ریسک لیکوییدیشن">
            <Surface className="px-4 md:px-5">
              <KeyValueList
                rows={[
                  {
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        نرخ لیکوئید ضمنی <ProvenanceBadge kind={liqAvail ? 'boros' : 'na'} label={liqAvail ? 'بوروس' : 'نیازمند پوزیشن'} />
                      </span>
                    ),
                    hint: liqAvail ? LIQUIDATION_SOURCE_FA[proj.liquidation.liquidationApr.source] : LIVE_POSITION_NA_REASON,
                    value: liqAvail ? <span className="num-ltr">{toFaDigits(proj.liquidation.liquidationApr.value!.toFixed(2))}٪</span> : <span className="text-subtle">نامشخص</span>
                  },
                  {
                    label: 'حاشیه ریسک نظری نرخ سالانه (متریک شبیه‌ساز)',
                    hint: 'مارجین ÷ حساسیت نرخ — لیکوییدیشن واقعی بوروس نیست',
                    value: proj.theoreticalAprRiskBufferPct !== null ? <span className="num-ltr">{toFaDigits(proj.theoreticalAprRiskBufferPct.toFixed(1))} واحد درصد</span> : <span className="text-subtle">نامشخص</span>
                  }
                ]}
              />
            </Surface>
          </Section>

          {/* scenario models */}
          <Section id="scenario-models" title="مدل‌های سناریو" description="فرضیات صریح — نه پیش‌بینی">
            <div className="grid gap-4 lg:grid-cols-3">
              <Surface className="p-4">
                <h3 className="text-sm font-bold text-ink">{a.constantRateScenario.label}</h3>
                <p className="text-xs text-muted">
                  نرخ شناور ثابت <PercentValue value={a.constantRateScenario.floatingRate * 100} signed={false} tone="none" />
                </p>
                <KeyValueList
                  dense
                  className="mt-2"
                  rows={[
                    { label: 'تسویه', value: <MoneyValue value={a.constantRateScenario.settlementPnl} signed tone="auto" /> },
                    { label: 'خالص', value: <MoneyValue value={a.constantRateScenario.netPnl} signed tone="auto" /> },
                    { label: 'ROI', value: <PercentValue value={a.constantRateScenario.roiOnMargin} /> }
                  ]}
                />
              </Surface>
              <Surface className="p-4">
                <h3 className="text-sm font-bold text-ink">بازگشت به میانگین</h3>
                <p className="text-xs text-muted">
                  {a.meanReversion.note}
                  {a.meanReversion.available && a.meanReversion.targetRate !== null && (
                    <>
                      {' '}· هدف <PercentValue value={a.meanReversion.targetRate * 100} signed={false} tone="none" />
                    </>
                  )}
                </p>
                {a.meanReversion.available && (
                  <KeyValueList dense className="mt-2" rows={[{ label: 'خالص', value: <MoneyValue value={a.meanReversion.netPnl} signed tone="auto" /> }]} />
                )}
              </Surface>
              <Surface className="p-4">
                <h3 className="text-sm font-bold text-ink">سناریوی تنش</h3>
                {a.stress.available ? (
                  <>
                    <p className="text-xs text-muted">
                      شوک <PercentValue value={(a.stress.stressAmount ?? 0) * 100} signed={false} tone="none" /> — {a.stress.stressSource}
                    </p>
                    <KeyValueList
                      dense
                      className="mt-2"
                      rows={[
                        { label: 'بدبینانه', value: <MoneyValue value={a.stress.bearNet} signed tone="auto" /> },
                        { label: 'پایه', value: <MoneyValue value={a.stress.baseNet} signed tone="auto" /> },
                        { label: 'خوش‌بینانه', value: <MoneyValue value={a.stress.bullNet} signed tone="auto" /> }
                      ]}
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted">داده تاریخی کافی برای سناریوی تنش در دسترس نیست (نامشخص).</p>
                )}
              </Surface>
            </div>
          </Section>

          {/* size-based summary + costs */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section id="size-summary" title={`خلاصه برای حجم ${toFaDigits(size)} واحد بازده`}>
              <Surface className="px-4 md:px-5">
                <KeyValueList
                  rows={[
                    { label: 'مارجین موردنیاز (فرمول رسمی)', value: <MoneyValue value={a.marginRequired} /> },
                    { label: 'حساسیت نرخ (۱٪)', value: <MoneyValue value={sim.sensitivity} /> },
                    { label: 'تسویه فرضی تا سررسید', value: <MoneyValue value={sim.currentPnl} signed tone="auto" /> },
                    { label: 'ارزش روز (هنوز بسته نشده)', value: <MoneyValue value={sim.mtm} signed tone="auto" /> },
                    { label: 'سود خالص کل (پایه)', emphasis: true, value: <MoneyValue value={sim.netCurrent} signed tone="auto" /> },
                    { label: 'بازده روی مارجین', value: <PercentValue value={sim.isLong ? a.roiLongMargin : a.roiShortMargin} /> },
                    { label: 'بازده روی ارزش اسمی', value: <PercentValue value={sim.isLong ? a.roiLongNotional : a.roiShortNotional} /> },
                    {
                      label: `نقطه سر‌به‌سر (${dirFa})`,
                      value: (
                        <PercentValue
                          value={(sim.isLong ? a.breakEvenLong : a.breakEvenShort) !== null ? ((sim.isLong ? a.breakEvenLong : a.breakEvenShort) as number) * 100 : null}
                          signed={false}
                          tone="none"
                        />
                      )
                    }
                  ]}
                />
              </Surface>
            </Section>
            <Section id="costs" title="هزینه‌ها" description="بر اساس مستندات رسمی بوروس — نامشخص یعنی داده در دسترس نیست، نه صفر">
              <Surface className="px-4 md:px-5">
                <KeyValueList
                  rows={[
                    { label: 'کارمزد ورود', hint: 'حجم × نرخ کارمزد × زمان باقی‌مانده', value: <MoneyValue value={fees.entryFee} /> },
                    { label: 'کارمزد خروج', value: <MoneyValue value={fees.exitFee} /> },
                    { label: 'هزینه تسویه', hint: 'حجم × نرخ تسویه × مدت نگهداری', value: <MoneyValue value={fees.settlementCost} /> },
                    { label: 'هزینه ورود به بازار', value: fees.entranceFee > 0 ? <MoneyValue value={fees.entranceFee} /> : <span className="text-subtle">نامشخص</span> },
                    { label: 'لغزش', value: fees.slippageCost > 0 ? <MoneyValue value={fees.slippageCost} /> : <span className="text-subtle">نامشخص</span> },
                    { label: 'گس', value: <MoneyValue value={fees.gasFee} /> },
                    { label: 'مجموع', emphasis: true, value: <MoneyValue value={fees.total} /> }
                  ]}
                />
              </Surface>
            </Section>
          </div>

          {/* audit breakdown */}
          <Surface className="px-4 md:px-5">
            <Disclosure summary="جزئیات محاسبه (فرمول‌ها و ورودی‌ها)">
              <div className="grid gap-6 pb-3 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold text-muted">ورودی‌ها</h4>
                  <KeyValueList
                    dense
                    rows={[
                      { label: 'بازار', value: `${borosAssetName(market.asset)} · ${borosVenueName(market.venue)}` },
                      { label: 'سررسید', value: `${new Date(market.maturity * 1000).toLocaleDateString('fa-IR')} (${toFaDigits(Math.ceil(proj.daysToMaturity))} روز)` },
                      { label: 'سرمایه', value: <span><MoneyValue value={proj.capital} /> (فقط مارجین اولیه)</span> }
                    ]}
                  />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted">مارجین (فرمول رسمی بوروس)</h4>
                  <p className="py-2 text-xs text-muted">حجم × بیشینه قدرمطلق نرخ و کف نرخ × ضریب مارجین × زمان مؤثر</p>
                  <KeyValueList
                    dense
                    rows={[
                      { label: 'کف نرخ → نرخ مؤثر', value: <span className="num-ltr">{fmtPct(proj.marginBreakdown.rateFloor * 100)} → {fmtPct(proj.marginBreakdown.effectiveRate * 100)}</span> },
                      { label: 'زمان (سال) → مؤثر', value: <span className="num-ltr">{toFaDigits(proj.marginBreakdown.yearsToMaturity.toFixed(4))} → {toFaDigits(proj.marginBreakdown.effectiveTime.toFixed(4))}</span> },
                      { label: 'ضریب مارجین اولیه', value: <PercentValue value={proj.marginBreakdown.imFactor * 100} signed={false} tone="none" /> },
                      { label: 'مارجین رفت‌وبرگشت', value: <MoneyValue value={proj.recalculatedMargin} /> }
                    ]}
                  />
                </div>
                <div className="md:col-span-2">
                  <h4 className="text-xs font-semibold text-muted">سود و زیان</h4>
                  <p className="py-2 text-xs leading-5 text-muted">
                    تسویه = {direction === 'long' ? 'ارزش اسمی × (شناور − ثابت) × روز/۳۶۵' : 'ارزش اسمی × (ثابت − شناور) × روز/۳۶۵'} ·
                    ارزش روز پایه = حساسیت × (مارک − ورود)/۱٪ — {proj.mtmReason} · خالص سررسید = تسویه − هزینه‌های مشخص
                  </p>
                </div>
              </div>
            </Disclosure>
          </Surface>

          <Notice tone="neutral">
            «مارجین کافی به نظر می‌رسد» به معنای «بدون ریسک لیکوییدیشن» نیست — حرکت نامطلوب نرخ مارک یا زیان تسویه می‌تواند پوزیشن
            را به مارجین نگهداری نزدیک کند؛ وضعیت واقعی بدون پوزیشن زنده بوروس در دسترس نیست.
          </Notice>
        </>
      )}
    </div>
  );
}
