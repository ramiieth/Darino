/**
 * نقطهٔ سربه‌سر دلاری و تورمی مغازه — همهٔ ریاضی در domain/shopBreakEven؛
 * اینجا فقط ورودی‌ها، اتصال به نرخ زندهٔ تتر و چهار کارت تحلیلی.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Landmark, PackageCheck, Siren, Store, TrendingUp, Zap } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { KeyValueList, Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { StatusDot } from '@/shared/components/ui/Badge';
import { useUsdRate } from '@/shared/store/usdtStore';
import { fmtRelativeAge, fmtTomanAmount, fmtUSD, toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { calcShopBreakEven, presetTargetRate, SHOP_FX_PRESETS } from '@/features/calculators/domain';
import { CalcShell, ResultPlaceholder } from './StatCard';
import { numOr } from './parse';

type CreditRatio = '0' | '30' | '50';

const CREDIT_OPTIONS: { value: CreditRatio; label: string; hint: string }[] = [
  { value: '0', label: '۱۰۰٪ نقد', hint: 'خرید کاملاً نقدی — بدون چک' },
  { value: '30', label: '۷۰ نقد / ۳۰ چک', hint: 'عرف بازار: ۷۰٪ نقد و ۳۰٪ چک در گردش' },
  { value: '50', label: '۵۰ / ۵۰', hint: 'کاسب خوش‌اعتبار قدیمی: ۵۰٪ نقد و ۵۰٪ چک در گردش' }
];

/** «3000000000» → «3,000,000,000» (ارقام فارسی/لاتین را می‌پذیرد) */
function groupDigits(s: string): string {
  const digits = toEnDigits(s).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  return digits === '' ? '' : Number(digits).toLocaleString('en-US');
}

function TomanInput({ value, onChange, suffix = 'تومان' }: { value: string; onChange: (v: string) => void; suffix?: string }) {
  return <Input dir="ltr" inputMode="numeric" value={value} onChange={(e) => onChange(groupDigits(e.target.value))} suffix={suffix} />;
}

const toman = (v: number | null) => fmtTomanAmount(v === null ? null : Math.round(v));
const faPct = (v: number, digits = 1) => `${toFaDigits(Number(v.toFixed(digits)).toLocaleString('en-US'))}٪`;

function ApplyLiveButton({ rate, onApply }: { rate: number | null; onApply: (r: number) => void }) {
  return (
    <button
      type="button"
      disabled={rate === null}
      onClick={() => rate !== null && onApply(rate)}
      className="flex items-center gap-1 rounded-control px-1.5 py-0.5 text-2xs font-semibold text-accent hover:bg-accent-soft disabled:opacity-40"
    >
      <Zap aria-hidden className="h-3 w-3" />
      اعمال نرخ لحظه‌ای تتر
    </button>
  );
}

function ResultCard({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone?: 'danger' }) {
  return (
    <Surface className={cn('space-y-4 p-4 md:p-5', tone === 'danger' && 'ring-1 ring-negative/30')}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink [&_svg]:h-4 [&_svg]:w-4">
        <span className={tone === 'danger' ? 'text-negative' : 'text-accent'}>{icon}</span>
        {title}
      </h3>
      {children}
    </Surface>
  );
}

export function ShopBreakEvenCalculator() {
  const live = useUsdRate();
  const [inventory, setInventory] = useState('3,000,000,000');
  const [buyRate, setBuyRate] = useState('108,800');
  const [deposit, setDeposit] = useState('2,000,000,000');
  const [rent, setRent] = useState('200,000,000');
  const [opex, setOpex] = useState('25,000,000');
  const [targetRate, setTargetRate] = useState(() => presetTargetRate(108_800, 110).toLocaleString('en-US'));
  const [margin, setMargin] = useState('30');
  const [credit, setCredit] = useState<CreditRatio>('30');
  const [creditCost, setCreditCost] = useState('42');
  const [actualSales, setActualSales] = useState('800,000,000');

  const buy = numOr(buyRate);
  const result = useMemo(
    () =>
      calcShopBreakEven({
        initialInventoryTomans: numOr(inventory),
        buyExchangeRate: buy,
        depositTomans: numOr(deposit),
        monthlyRentTomans: numOr(rent),
        monthlyOpexTomans: numOr(opex),
        targetExchangeRate: numOr(targetRate),
        grossMarginPercent: numOr(margin),
        creditRatioPercent: Number(credit),
        annualCreditCostPercent: numOr(creditCost),
        actualMonthlySales: numOr(actualSales)
      }),
    [inventory, buy, deposit, rent, opex, targetRate, margin, credit, creditCost, actualSales]
  );

  const fmtRate = (r: number) => Math.round(r).toLocaleString('en-US');
  const liveTone = live.kind === 'live' ? 'gain' : live.kind === 'stale' ? 'warn' : 'loss';
  const liveBadge = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2 px-3.5 py-2.5">
      <span className="text-xs font-semibold text-muted">نرخ زندهٔ تتر اپ</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-bold text-ink">{live.rate !== null ? toman(live.rate) : '—'}</span>
        <StatusDot tone={liveTone} pulse={live.kind === 'live'} label={live.kind === 'live' ? 'زنده' : live.kind === 'stale' ? `قدیمی · ${fmtRelativeAge(live.fetchedAt)}` : 'نامشخص'} />
      </span>
    </div>
  );

  const chip = 'h-8 rounded-control border border-divider-strong bg-card px-3 text-xs font-semibold text-muted hover:border-subtle hover:text-ink disabled:opacity-40 coarse:h-9';

  const inputs = (
    <>
      {liveBadge}
      <Field label="سرمایهٔ اولیهٔ خرید جنس">
        <TomanInput value={inventory} onChange={setInventory} />
      </Field>
      <Field label="نرخ دلار در زمان خرید جنس" labelAside={<ApplyLiveButton rate={live.rate} onApply={(r) => setBuyRate(fmtRate(r))} />}>
        <TomanInput value={buyRate} onChange={setBuyRate} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="رهن / پول پیش مغازه">
          <TomanInput value={deposit} onChange={setDeposit} />
        </Field>
        <Field label="اجارهٔ ماهیانه">
          <TomanInput value={rent} onChange={setRent} />
        </Field>
      </div>
      <Field label="هزینه‌های جاری ماهیانه (قبوض، شاگرد، مالیات)">
        <TomanInput value={opex} onChange={setOpex} />
      </Field>
      <div>
        <Field label="نرخ دلار سال بعد / هدف" labelAside={<ApplyLiveButton rate={live.rate} onApply={(r) => setTargetRate(fmtRate(r))} />}>
          <TomanInput value={targetRate} onChange={setTargetRate} />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="سناریوهای تورمی">
          {SHOP_FX_PRESETS.map((p) => (
            <button key={p} type="button" disabled={buy <= 0} className={chip} onClick={() => setTargetRate(fmtRate(presetTargetRate(buy, p)))}>
              +{toFaDigits(p)}٪ رشد
            </button>
          ))}
          <button type="button" disabled={live.rate === null} className={cn(chip, 'flex items-center gap-1')} onClick={() => live.rate !== null && setTargetRate(fmtRate(live.rate))}>
            <Zap aria-hidden className="h-3 w-3" />
            نرخ زندهٔ تتر اپ
          </button>
        </div>
        {result && <p className="mt-1.5 text-xs text-muted">رشد دلار نسبت به روز خرید: <span className="font-semibold text-ink">{faPct(result.fxGrowthPercent)}</span></p>}
      </div>
      <Field label="حاشیهٔ سود ناخالص فروش (قبل از اجاره)">
        <Input dir="ltr" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} suffix="٪" />
      </Field>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">مدل خرید کالا از بنکدار</p>
        <SegmentedControl<CreditRatio> label="مدل خرید کالا" fill size="sm" value={credit} onChange={setCredit} options={CREDIT_OPTIONS.map(({ value, label }) => ({ value, label }))} />
        <p className="text-xs text-muted">{CREDIT_OPTIONS.find((o) => o.value === credit)!.hint}</p>
        {credit !== '0' && (
          <Field label="بهرهٔ سالانهٔ خرید چکی (تفاوت نقد و چک)">
            <Input dir="ltr" inputMode="decimal" value={creditCost} onChange={(e) => setCreditCost(e.target.value)} suffix="٪" />
          </Field>
        )}
      </div>
      <Field label="فروش واقعی فعلی در ماه (تست بحران)">
        <TomanInput value={actualSales} onChange={setActualSales} />
      </Field>
    </>
  );

  if (!result) {
    return (
      <CalcShell inputs={inputs}>
        <ResultPlaceholder>نرخ دلار زمان خرید و نرخ هدف را وارد کنید.</ResultPlaceholder>
      </CalcShell>
    );
  }

  const r = result;
  const s = r.stress;
  const creditLabel = CREDIT_OPTIONS.find((o) => o.value === credit)!.label;

  return (
    <CalcShell inputs={inputs}>
      {/* کارت ۱ */}
      <ResultCard icon={<PackageCheck aria-hidden />} title="حفظ اصل کالا — چقدر بفروشم تا دوباره همان جنس را بخرم؟">
        <Metric size="hero" label="ارزش جایگزینی جنس با دلار هدف" value={toman(r.replacementCostTomans)} sub={`ارزش دلاری جنس روز خرید: ${fmtUSD(r.inventoryUSD)}`} />
        <p className="text-sm leading-6 text-muted">
          برای اینکه از تورم عقب نمانید و بتوانید دقیقاً همان حجم جنس اولیه را دوباره جایگزین کنید، ارزش ریالی کالاهای مغازه باید از{' '}
          <span className="font-semibold text-ink">{toman(numOr(inventory))}</span> به <span className="font-semibold text-ink">{toman(r.replacementCostTomans)}</span> برسد
          (افزایش <span className="font-semibold text-ink">{toman(r.nominalInventoryGap)}</span> صرفاً جهت حفظ موجودی قفسه).
        </p>
        <Notice tone="neutral">این افزایش سود نیست؛ اگر آن را خرج کنید، قفسه کم‌کم خالی می‌شود.</Notice>
      </ResultCard>

      {/* کارت ۲ */}
      <ResultCard icon={<Landmark aria-hidden />} title="کالبدشکافی زیان پول پیش و اثر خرید چکی">
        <MetricGrid cols={3}>
          <Metric label="ارزش دلاری پیش در روز قرارداد" value={fmtUSD(r.depositUSD)} />
          <Metric label="ارزش دلاری پیش در پایان دوره" value={fmtUSD(r.depositEndUSD)} />
          <Metric label="زیان مستقیم" value={<span className="text-negative">{fmtUSD(r.depositLossUSD)}</span>} sub={toman(r.depositLossTomans)} />
        </MetricGrid>
        <KeyValueList
          dense
          rows={[
            { label: `بدهی چکی در گردش (${creditLabel})`, value: toman(r.creditDebtTomans) },
            { label: 'سود خالص تورمی چک', hint: 'رشد دلار منهای بهرهٔ بنکدار', value: faPct(r.netCreditShieldRate * 100) },
            { label: 'جبران‌شده با خرید چکی', value: <span className="text-positive">{toman(r.creditShieldTomans)}</span> },
            { label: 'کسری باقی‌مانده روی دوش فروش', value: <span className="text-negative">{toman(r.uncoveredDepositLossTomans)}</span>, emphasis: true }
          ]}
        />
        {credit !== '0' && r.netCreditShieldRate === 0 && <Notice tone="warn">بهرهٔ چکی بنکدار از رشد دلار بیشتر است؛ خرید چکی در این سناریو هیچ سپر تورمی ندارد.</Notice>}
      </ResultCard>

      {/* کارت ۳ */}
      <ResultCard icon={<TrendingUp aria-hidden />} title="خط قرمز سود و فروش — چقدر بفروشم تا از دلار عقب نمانم؟">
        <MetricGrid cols={2}>
          <Metric size="lg" label="حداقل فروش ماهانه" value={toman(r.breakEvenMonthlySales)} />
          <Metric size="lg" label="فروش روزانهٔ لازم" value={toman(r.breakEvenDailySales)} />
          <Metric label="سود ناخالص ماهانهٔ لازم" value={toman(r.requiredMonthlyGrossProfit)} sub="قبل از کسر اجاره و هزینه‌ها" />
          <Metric label="سود خالص ماهانه پس از اجاره" value={toman(r.requiredMonthlyNetProfit)} sub="فقط برای جبران افت دلاری پول پیش" />
        </MetricGrid>
        <KeyValueList
          dense
          rows={[
            { label: 'اجاره و هزینهٔ یک سال', value: toman(r.annualFixedCosts) },
            { label: 'دفعات گردش کالا در سال', hint: 'فروش سالانه ÷ ارزش جایگزینی جنس', value: r.requiredAnnualTurnover === null ? '—' : `${toFaDigits(r.requiredAnnualTurnover.toFixed(2))} بار` }
          ]}
        />
        {r.breakEvenMonthlySales === null && <Notice tone="warn">حاشیهٔ سود باید بیشتر از صفر باشد.</Notice>}
      </ResultCard>

      {/* کارت ۴ */}
      <ResultCard icon={<Siren aria-hidden />} title="تست بحران — فروش ضعیف و ریسک برگشت چک‌ها" tone={s.meetsBreakEven ? undefined : 'danger'}>
        <MetricGrid cols={2}>
          <Metric label="فروش واقعی ماهانه" value={toman(numOr(actualSales))} sub={`سود ناخالص: ${toman(s.actualMonthlyGrossProfit)}`} />
          <Metric label="فروش سربه‌سر" value={toman(r.breakEvenMonthlySales)} sub={`سود لازم: ${toman(r.requiredMonthlyGrossProfit)}`} />
        </MetricGrid>
        {s.meetsBreakEven ? (
          <Notice tone="success" title="بالای خط قرمز">با این فروش از دلار عقب نمی‌مانید.</Notice>
        ) : (
          <div role="alert" className="space-y-3 rounded-field border border-negative/30 bg-negative/8 p-4 text-sm leading-6 text-ink">
            <p className="flex items-center gap-2 font-bold text-negative">
              <AlertTriangle aria-hidden className="h-4 w-4" />
              زیر خط قرمز
            </p>
            <p>
              ۱. هر ماه <span className="font-bold">{toman(s.monthlyShortfallTomans)}</span> (معادل <span className="font-bold">{fmtUSD(s.monthlyShortfallUSD)}</span> به نرخ هدف) از دلار عقب می‌مانید؛ در یک سال{' '}
              <span className="font-bold">{toman(s.monthlyShortfallTomans * 12)}</span>.
            </p>
            {s.monthlyDepositBurnTomans > 0 ? (
              <p>
                ۲. سود ناخالص حتی کفاف اجاره و هزینه‌ها ({toman(r.monthlyFixedCosts)}) را نمی‌دهد: هر ماه{' '}
                <span className="font-bold text-negative">{toman(s.monthlyDepositBurnTomans)}</span> از اصل پول پیش مغازه بلعیده می‌شود
                {s.monthsUntilDepositGone !== null && <> و با این روند پس از حدود <span className="font-bold">{toFaDigits(Math.floor(s.monthsUntilDepositGone))} ماه</span> چیزی از پیش نمی‌ماند</>}.
              </p>
            ) : (
              <p>۲. سود ناخالص فعلاً اجاره و هزینه‌ها را می‌دهد؛ کسری از جیب ارزش دلاری پول پیش و قفسه می‌رود، نه اصل پیش.</p>
            )}
            {s.chequeRisk && (
              <p>
                ۳. <span className="font-bold">قیچی نقدینگی:</span> <span className="font-bold">{toman(r.creditDebtTomans)}</span> چک صیادی در گردش دارید و فروش به خط قرمز نمی‌رسد. سررسید
                چک‌ها با فروش ضعیف یعنی خطر برگشت خوردن چک و اجبار به حراج جنس زیر قیمت جایگزینی ({toman(r.replacementCostTomans)})؛ هر حراجی قفسه را کوچک‌تر می‌کند.
              </p>
            )}
          </div>
        )}
      </ResultCard>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Store aria-hidden className="h-3.5 w-3.5" />
        کل سرمایهٔ دلاری روز اول (جنس + پیش): {fmtUSD(r.totalInitialUSD)}
      </p>
    </CalcShell>
  );
}
