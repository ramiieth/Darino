/** بخش‌های نتیجهٔ آزمایشگاه کری: حکم، معیارها، هزینه‌ها، نقشهٔ جاروب و آزمون پیش‌رونده */
import { CheckCircle2, XCircle } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, TONE_SOFT, type Tone } from '@/shared/components/ui/Badge';
import { KeyValueList, Metric, MetricGrid, PercentValue } from '@/shared/components/ui/FinancialValue';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { DSR_PASS, ENTRY_APRS, LOOKBACKS_H, MIN_DAYS, PLATEAU_PASS, type Check, type ConfigRun, type Rule, type Study, type VerdictKind } from '../domain/engine';

/** کسر → درصد علامت‌دار */
export const Pct = ({ v, digits = 1, tone }: { v: number | null | undefined; digits?: number; tone?: 'auto' | 'none' }) => (
  <PercentValue value={v === null || v === undefined ? null : v * 100} digits={digits} tone={tone} />
);
const fa = (v: number, digits = 0) => toFaDigits(v.toFixed(digits));

const LOOKBACK_LABEL: Record<number, string> = { 24: '۱ روز', 72: '۳ روز', 168: '۷ روز', 336: '۱۴ روز' };

export function ruleLabel(rule: Rule): string {
  if (rule.kind === 'always') return 'همیشه باز';
  return `ورود وقتی میانگین ${LOOKBACK_LABEL[rule.lookbackH] ?? `${fa(rule.lookbackH)} ساعت`} ≥ ${fa(rule.entryApr)}٪ سالانه · خروج زیر ${fa(rule.exitApr, rule.exitApr % 1 ? 1 : 0)}٪`;
}

export const runLabel = (study: Study, id: string) => {
  const r = study.runs.find((x) => x.id === id);
  return r ? ruleLabel(r.rule) : id;
};

/* ---------------- حکم ---------------- */

const VERDICT: Record<VerdictKind, { tone: Tone; badge: string; title: string; body: string }> = {
  validated: {
    tone: 'gain',
    badge: 'تأییدشده با داده',
    title: 'لبه از همهٔ آزمون‌ها گذشت',
    body: 'روی برش‌های زمانیِ ندیده هم از بازده استیبل بهتر بود، از آزمون شانس گذشت، تنظیم‌های همسایه هم سودده‌اند و لیکوئیدی نداشت. معنی‌اش «ارزش آزمایش کاغذی» است، نه تضمین سود.'
  },
  fragile: {
    tone: 'warn',
    badge: 'شکننده',
    title: 'سود روی گذشته هست، ولی همهٔ آزمون‌ها را رد نشد',
    body: 'بخشی از نتیجه ممکن است شانس یا یک عدد خوش‌شانس باشد. آزمون‌های ردشده را ببینید؛ با پول واقعی وارد نشوید.'
  },
  'no-edge': {
    tone: 'loss',
    badge: 'بدون لبه',
    title: 'بعد از هزینه‌ها از بازده استیبل بهتر نبود',
    body: 'روی برش‌های زمانی‌ای که در انتخاب قانون دیده نشده بودند، نگه‌داشتن استیبل بهتر یا برابر بود. این نتیجه را باور کنید — از هر بک‌تست برنده‌ای بیشتر پول نجات می‌دهد.'
  },
  insufficient: {
    tone: 'neutral',
    badge: 'دادهٔ ناکافی',
    title: `کمتر از ${toFaDigits(MIN_DAYS)} روز داده`,
    body: 'برای آزمون پیش‌رونده و حکم، بازهٔ طولانی‌تری انتخاب کنید یا دارایی با سابقهٔ بیشتر.'
  }
};

function checkText(c: Check, trials: number): { label: string; value: string } {
  switch (c.id) {
    case 'oos':
      return { label: 'برش‌های ندیده (آزمون پیش‌رونده): بازده سالانهٔ مازاد بر استیبل > ۰', value: c.value === null ? '—' : `${c.value >= 0 ? '+' : ''}${fa(c.value * 100, 1)}٪` };
    case 'dsr':
      return { label: `آزمون شانس (شارپ تعدیل‌شده با ${toFaDigits(trials)} آزمون) ≥ ${fa(DSR_PASS * 100)}٪`, value: c.value === null ? 'محاسبه‌پذیر نیست' : `${fa(c.value * 100, 1)}٪` };
    case 'plateau':
      return { label: `پایداری: سهم تنظیم‌های همسایهٔ سودده ≥ ${fa(PLATEAU_PASS * 100)}٪`, value: c.value === null ? '—' : `${fa(c.value * 100)}٪` };
    case 'liquidation':
      return { label: 'بدون لیکوئید پای شورت (بهترین قانون، «همیشه باز» و برش‌های ندیده)', value: c.value === null ? '—' : `${toFaDigits(c.value)} بار` };
  }
}

export function VerdictCard({ study }: { study: Study }) {
  const v = VERDICT[study.verdict];
  return (
    <Surface variant="focal" className="p-4 md:p-5">
      <Badge tone={v.tone}>{v.badge}</Badge>
      <h2 className="mt-2 text-lg font-bold text-ink">{v.title}</h2>
      <p className="mt-1 text-sm leading-7 text-muted">{v.body}</p>
      {study.verdict !== 'insufficient' && (
        <ul className="mt-4 space-y-2 border-t border-divider pt-4">
          {study.checks.map((c) => {
            const t = checkText(c, study.trials);
            return (
              <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-start gap-2">
                  {c.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-label="قبول" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-label="رد" />}
                  <span className="text-ink">{t.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-ink">{t.value}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

/* ---------------- معیارها ---------------- */

export function StatsCard({ study }: { study: Study }) {
  const b = study.best;
  const inMarket = b.sim.hoursTotal ? b.sim.hoursIn / b.sim.hoursTotal : 0;
  return (
    <Surface className="p-4 md:p-5">
      <p className="text-xs text-muted">بهترین قانون روی کل دوره (درون نمونه — خوش‌بینانه)</p>
      <p className="mt-1 text-sm font-semibold text-ink">{ruleLabel(b.rule)}</p>
      <MetricGrid cols={4} className="mt-4">
        <Metric size="md" label="بازده سالانه" value={<Pct v={b.metrics.cagr} />} sub={<>مازاد بر استیبل <Pct v={b.metrics.excessCagr} /></>} />
        <Metric size="md" label="بیرون از نمونه (پیش‌رونده)" value={study.oos ? <Pct v={study.oos.excessCagr} /> : '—'} sub="مازاد سالانه بر استیبل" />
        <Metric size="md" label="بیشترین افت" value={<Pct v={b.metrics.maxDrawdown} />} sub={`شارپ مازاد ${b.metrics.sharpe === null ? '—' : fa(b.metrics.sharpe, 2)}`} />
        <Metric size="md" label="زمان در بازار" value={`${fa(inMarket * 100)}٪`} sub={`${toFaDigits(b.sim.entries)} ورود · ${toFaDigits(b.sim.liquidations.length)} لیکوئید`} />
      </MetricGrid>
      <p className={cn('mt-4 border-t border-divider pt-3 text-xs leading-6', study.always.sim.peakLiqUse >= 0.8 ? 'text-negative' : 'text-muted')}>
        نزدیک‌ترین فاصله تا لیکوئید («همیشه باز» با همین اهرم): {fa(study.always.sim.peakLiqUse * 100)}٪ از فاصلهٔ لیکوئید مصرف شد
        {study.always.sim.peakLiqUse >= 0.8 ? ' — حاشیهٔ امنی نمانده؛ اهرم را کم کنید.' : '.'}
      </p>
    </Surface>
  );
}

export function CostCard({ run }: { run: ConfigRun }) {
  const br = run.sim.breakdown;
  const net = br.funding + br.idle + br.tradingFees + br.rebalance + br.liquidation;
  const negShare = run.sim.hoursIn ? run.sim.negativeHoursIn / run.sim.hoursIn : 0;
  return (
    <Surface className="p-4 md:p-5">
      <KeyValueList
        dense
        rows={[
          { label: 'فاندینگ دریافتی (خالص پرداخت‌های منفی)', value: <Pct v={br.funding} digits={2} />, hint: `${fa(negShare * 100)}٪ ساعت‌های داخل بازار فاندینگ منفی بود` },
          { label: 'بازده استیبل بیرون از بازار', value: <Pct v={br.idle} digits={2} /> },
          { label: 'کارمزد و اسلیپیج ورود/خروج', value: <Pct v={br.tradingFees} digits={2} />, hint: `${toFaDigits(run.sim.entries)} بار ورود` },
          { label: 'ریبالانس مارجین', value: <Pct v={br.rebalance} digits={2} /> },
          { label: 'لیکوئید', value: <Pct v={br.liquidation} digits={2} /> },
          { label: 'خالص روی سرمایهٔ اولیه', value: <Pct v={net} digits={2} />, emphasis: true }
        ]}
      />
    </Surface>
  );
}

/* ---------------- نقشهٔ جاروب ---------------- */

export function SweepHeatmap({ study }: { study: Study }) {
  const cell = (li: number, ei: number) => study.runs.find((r) => r.cell?.li === li && r.cell?.ei === ei);
  const tone = (x: number): string => (x > 0.02 ? TONE_SOFT.gain : x > 0 ? 'bg-gain/5 text-positive' : x > -0.02 ? 'bg-negative/5 text-negative' : TONE_SOFT.loss);
  return (
    <Surface className="p-4 md:p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-center text-xs">
          <caption className="sr-only">بازده سالانهٔ مازاد بر استیبل برای هر ترکیب پنجرهٔ میانگین و آستانهٔ ورود</caption>
          <thead>
            <tr>
              <th className="text-start font-semibold text-muted">میانگین ↓ / ورود ←</th>
              {ENTRY_APRS.map((e) => (
                <th key={e} className="font-semibold text-muted">{`${toFaDigits(e)}٪`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LOOKBACKS_H.map((l, li) => (
              <tr key={l}>
                <th className="whitespace-nowrap text-start font-semibold text-muted">{LOOKBACK_LABEL[l]}</th>
                {ENTRY_APRS.map((e, ei) => {
                  const r = cell(li, ei);
                  if (!r) return <td key={e} />;
                  const x = r.metrics.excessCagr;
                  const isBest = r.id === study.best.id;
                  if (r.sim.entries === 0)
                    return (
                      <td key={e} className={cn('rounded-control bg-surface-2 px-1 py-2 text-subtle')} title="در این دوره هیچ‌وقت وارد نشد">
                        —
                      </td>
                    );
                  return (
                    <td key={e} className={cn('rounded-control px-1 py-2 font-semibold', tone(x), isBest && 'ring-2 ring-accent')} title={ruleLabel(r.rule)}>
                      {Math.abs(x) < 0.0005 ? '۰٫۰' : `${x > 0 ? '+' : ''}${fa(x * 100, 1)}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted">
        هر خانه: بازده سالانهٔ مازاد بر استیبل (٪) روی کل دوره. «همیشه باز»: <Pct v={study.always.metrics.excessCagr} />. «—» یعنی آستانه هیچ‌وقت نخورد (همان استیبل؛ کاندید بهترین نیست). لبهٔ واقعی یک «فلات» سبز است؛ خانهٔ سبزِ تنها میان قرمزها احتمالاً شانس است.
        {study.best.id === 'always' && ' بهترین گزینه «همیشه باز» است؛ قاب آبی ندارد.'}
      </p>
    </Surface>
  );
}

/* ---------------- آزمون پیش‌رونده ---------------- */

export function WalkForwardTable({ study }: { study: Study }) {
  if (!study.folds.length) return null;
  return (
    <Surface className="p-4 md:p-5">
      <ul className="divide-y divide-divider">
        {study.folds.map((f) => (
          <li key={f.index} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                برش {toFaDigits(f.index)}: {formatJalali(f.from)} تا {formatJalali(f.to - 1)}
              </span>
              <span className="text-sm">
                بیرون از نمونه <Pct v={f.oos.excessCagr} />
              </span>
            </div>
            <p className="mt-1 text-xs leading-6 text-muted">
              انتخاب روی گذشته: {runLabel(study, f.chosen)} (درون نمونه <Pct v={f.inSampleExcess} />) · بیشترین افت <Pct v={f.oos.maxDrawdown} />
              {f.oosLiquidations > 0 && <span className="text-negative"> · {toFaDigits(f.oosLiquidations)} لیکوئید</span>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-divider pt-3 text-xs leading-6 text-muted">
        در هر برش، قانون فقط با داده‌های قبل از آن برش انتخاب و بعد بدون تغییر روی برش اجرا شده است. فاصلهٔ زیاد «درون نمونه» و «بیرون از نمونه» یعنی بیش‌برازش.
      </p>
    </Surface>
  );
}
