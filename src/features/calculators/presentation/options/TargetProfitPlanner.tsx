/**
 * کادر جداگانهٔ «هدف سود»: برای یک سود دلاری مشخص (پیش‌فرض ۱۰۰۰ دلار) چه بخریم، چقدر سرمایه لازم است
 * و در هر سناریوی قیمت چه می‌شود. به سرمایه و سقف ریسکی که کاربر وارد کرده ربطی ندارد.
 * همهٔ اعداد از domain/targetPlan (دادهٔ واقعی Derive) می‌آید.
 */
import { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Field, Input } from '@/shared/components/ui/Input';
import { KeyValueList, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { exitPlan, plansForTarget, STRATEGY_FA, type ChainOption, type MarketInputs, type OptionLeg } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import { parseNum } from '../parse';
import { cents, faDate, fmtPct, fmtQty } from './helpers';
import { STRATEGY_PLAIN } from './plainText';

const MOVE_FA: Record<number, string> = { 20: 'صعود شدید', 10: 'صعود', 5: 'صعود ملایم', 0: 'بدون تغییر', [-5]: 'نزول ملایم', [-10]: 'نزول', [-20]: 'نزول شدید' };

export function TargetProfitPlanner({ chain, m, currency, expiry, days }: { chain: readonly ChainOption[]; m: MarketInputs; currency: string; expiry: string; days: number }) {
  const [raw, setRaw] = useState('1000');
  const target = raw.trim() === '' ? NaN : parseNum(raw);
  const ok = target > 0;
  const plans = useMemo(() => (ok ? plansForTarget(chain, m, target) : []), [chain, m, target, ok]);
  const best = plans[0] ?? null;

  return (
    <Surface as="section" aria-labelledby="target-profit-title" className="space-y-4 border-2 border-dashed border-accent/40 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Target aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
        <div>
          <h2 id="target-profit-title" className="text-base font-bold text-ink">
            برای یک سود مشخص چقدر سرمایه لازم است؟
          </h2>
          <p className="mt-1 text-xs leading-6 text-muted">
            این کادر جداست و به سرمایه و تحمل ریسکی که بالا وارد کرده‌اید ربطی ندارد. فقط می‌گوید برای رسیدن به سود هدف روی بازار <bdi dir="ltr">{currency}</bdi> با سررسید {faDate(expiry)} ({toFaDigits(Math.round(days))} روز دیگر)، چه چیزی و به چه اندازه باید معامله شود.
          </p>
        </div>
      </div>

      <Notice tone="warn" title="هیچ استراتژی‌ای در همهٔ سناریوها سود نمی‌دهد">
        در آپشن، سود بیشتر یعنی یا سرمایهٔ بیشتر یا احتمال کمتر. در هر استراتژی، حرکت قیمت در جهتی خاص به زیان منجر می‌شود. پیشنهاد زیر گزینه‌ای است که با دادهٔ فعلی بیشترین احتمال سود را دارد و زیانش سقف مشخص دارد.
      </Notice>

      <Field label="سود هدف (دلار)" hint="سودی که می‌خواهید اگر همه‌چیز طبق برنامه پیش برود به دست بیاید، پس از کسر کارمزد." error={raw.trim() !== '' && !ok ? 'عدد مثبت وارد کنید.' : null}>
        <Input dir="ltr" inputMode="decimal" autoComplete="off" value={raw} onChange={(e) => setRaw(e.target.value)} suffix="دلار" />
      </Field>

      {ok && !best && <Notice tone="warn" title="گزینهٔ مناسبی پیدا نشد">در این سررسید قیمت معتبر برای ساختن استراتژی ریسک‌محدود پیدا نشد. سررسید دیگری انتخاب کنید.</Notice>}

      {best && (
        <>
          <div className="rounded-card border border-accent/40 bg-accent-soft/40 p-3.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
              پیشنهاد: {STRATEGY_FA[best.b.id]}
              <Badge tone="info">زیان سقف‌دار</Badge>
            </p>
            <p className="mt-1 text-xs leading-6 text-muted">{STRATEGY_PLAIN[best.b.id]}</p>
          </div>

          <KeyValueList
            dense
            rows={[
              { label: 'سرمایهٔ لازم', hint: 'وثیقه‌ای که Derive قفل می‌کند (برابر بیشترین زیان) به‌علاوهٔ کارمزد باز کردن؛ تقریبی', value: <MoneyValue value={best.capitalNeeded} digits={2} className="font-bold" /> },
              { label: 'سود خالص اگر طبق برنامه پیش برود', hint: 'بیشترین سود در سررسید منهای کارمزد', value: <MoneyValue value={best.netMaxProfit} digits={2} className="text-positive" /> },
              { label: 'بدترین زیان ممکن', hint: 'اگر قیمت خلاف برنامه حرکت کند؛ بیشتر از این نمی‌شود', value: <MoneyValue value={-best.worstLoss} digits={2} tone="loss" /> },
              { label: 'احتمال تقریبی سود در سررسید', hint: 'از قیمت فعلی آپشن‌ها؛ پیش‌بینی نیست', value: best.pop === null ? '—' : fmtPct(best.pop * 100) },
              { label: 'سود هدف نسبت به سرمایهٔ لازم', value: fmtPct(best.returnOnCapital * 100) }
            ]}
          />

          <TargetSteps plan={best} currency={currency} expiry={expiry} days={days} />
          <TargetScenarios plan={best} />
          <TargetAlternatives plans={plans} />
        </>
      )}

      <p className="text-2xs leading-5 text-subtle">اعداد تقریبی‌اند و با تغییر قیمت و نوسان تغییر می‌کنند. این محاسبه آموزشی است و توصیه مالی قطعی نیست؛ هیچ سفارشی ثبت نمی‌شود.</p>
    </Surface>
  );
}

function TargetSteps({ plan, currency, expiry, days }: { plan: NonNullable<ReturnType<typeof plansForTarget>[number]>; currency: string; expiry: string; days: number }) {
  const legs = plan.b.legs.filter((l): l is OptionLeg => l.kind === 'option');
  const xp = exitPlan(plan.b, days);
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-ink">قدم به قدم چه کنیم؟</h3>
      <ol className="list-decimal space-y-2 ps-5 text-xs leading-6 text-muted">
        <li>
          حدود <MoneyValue value={plan.capitalNeeded} digits={0} className="font-semibold text-ink" /> به حساب Derive واریز کنید (برای وثیقه و کارمزد).
        </li>
        {legs.map((l) => (
          <li key={l.name}>
            <b className="text-ink">
              {l.side === 'buy' ? 'خرید' : 'فروش'} {fmtQty(l.qty)} {l.type === 'C' ? 'اختیار خرید (Call)' : 'اختیار فروش (Put)'}
            </b>{' '}
            <bdi dir="ltr">{currency}</bdi> با قیمت توافقی <MoneyValue value={l.strike} digits={0} /> و سررسید {faDate(expiry)}. سفارش با قیمت مشخص (Limit) حدود <MoneyValue value={l.premium} digits={2} /> برای هر واحد ثبت کنید.
            <span className="block font-latin text-2xs text-subtle" dir="ltr">
              {l.name}
            </span>
          </li>
        ))}
        <li>همهٔ بخش‌ها را با هم باز کنید؛ اگر فقط یک بخش انجام شود، ریسک موقعیت دیگر سقف ندارد.</li>
        <li>
          اگر سود به <MoneyValue value={xp.takeProfitUsd} digits={0} className="text-positive" /> رسید، می‌توانید زودتر ببندید. اگر زیان به <MoneyValue value={xp.stopLossUsd === null ? null : -xp.stopLossUsd} digits={0} tone="loss" /> رسید، بستن را در نظر بگیرید.
        </li>
        <li>حدود {toFaDigits(xp.closeOrRollDaysLeft)} روز مانده به سررسید، موقعیت را ببندید یا به سررسید بعدی منتقل کنید.</li>
      </ol>
    </div>
  );
}

function TargetScenarios({ plan }: { plan: NonNullable<ReturnType<typeof plansForTarget>[number]> }) {
  const be = plan.b.stats.breakevens;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-ink">در هر سناریوی قیمت چه می‌شود؟ (در سررسید، پس از کارمزد)</h3>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">سناریوهای هدف سود</caption>
          <thead>
            <tr className="text-2xs text-subtle">
              <th scope="col" className="pb-2 text-start font-semibold">حرکت قیمت</th>
              <th scope="col" className="pb-2 text-end font-semibold">قیمت</th>
              <th scope="col" className="pb-2 text-end font-semibold">سود یا زیان</th>
            </tr>
          </thead>
          <tbody>
            {plan.scenarios.map((r) => (
              <tr key={r.movePct}>
                <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                  {MOVE_FA[r.movePct]}
                  <span className="block text-2xs text-subtle">
                    {r.movePct > 0 ? '+' : ''}
                    {toFaDigits(r.movePct)}٪
                  </span>
                </th>
                <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                  <MoneyValue value={r.price} digits={0} />
                </td>
                <td className="border-t border-divider py-2 text-end font-bold">
                  <MoneyValue value={cents(r.net)} signed tone="auto" digits={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {be.length > 0 && (
        <p className="text-xs leading-6 text-muted">
          نقطهٔ سربه‌سر: {be.map((x) => toFaDigits(Math.round(x).toLocaleString('en-US'))).join(' و ')} دلار.{' '}
          {be.length === 2 ? 'اگر قیمت در سررسید بین این دو عدد باشد سود می‌کنید و بیرون از آن زیان.' : 'یک طرف این قیمت سود و طرف دیگر زیان است.'}
        </p>
      )}
    </div>
  );
}

function TargetAlternatives({ plans }: { plans: ReturnType<typeof plansForTarget> }) {
  if (plans.length < 2) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-ink">گزینه‌های دیگر برای همین هدف</h3>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-xs">
          <caption className="sr-only">مقایسهٔ استراتژی‌ها برای سود هدف</caption>
          <thead>
            <tr className="text-2xs text-subtle">
              <th scope="col" className="pb-2 text-start font-semibold">استراتژی</th>
              <th scope="col" className="pb-2 text-end font-semibold">سرمایهٔ لازم</th>
              <th scope="col" className="pb-2 text-end font-semibold">احتمال سود</th>
              <th scope="col" className="pb-2 text-end font-semibold">بدترین زیان</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <tr key={p.b.id}>
                <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                  {STRATEGY_FA[p.b.id]}
                  {i === 0 && <Badge tone="info" className="ms-1 text-2xs">پیشنهاد</Badge>}
                </th>
                <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                  <MoneyValue value={p.capitalNeeded} digits={0} />
                </td>
                <td className="border-t border-divider py-2 text-end">{p.pop === null ? '—' : fmtPct(p.pop * 100)}</td>
                <td className="border-t border-divider py-2 text-end">
                  <MoneyValue value={-p.worstLoss} digits={0} tone="loss" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs leading-5 text-subtle">ترتیب: بیشترین احتمال سود، سپس سرمایهٔ کمتر. گزینه‌ای با سرمایهٔ کمتر معمولاً احتمال سود کمتری دارد.</p>
    </div>
  );
}
