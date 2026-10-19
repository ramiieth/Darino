/**
 * تحلیل عمیق سناریو برای یک استراتژی یا یک ترکیب چندبازاری:
 *   بازه‌های سود/زیان با احتمال · ۲۰ سناریو با تجزیه به قیمت/IV/زمان و علت · مونت‌کارلو با IV و با HV
 */
import { useMemo, type ReactNode } from 'react';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import {
  comboScenarios,
  monteCarlo,
  oneSigmaMovePct,
  pnlZones,
  probMoveBeyond,
  STRATEGY_FA,
  type Combo,
  type ComboScenario,
  type MonteCarlo,
  type ScenarioGroup
} from '@/features/calculators/domain';
import { cents, fmtPct } from './helpers';

const GROUP_FA: Record<ScenarioGroup, string> = {
  market: 'حرکت قیمت (تا سررسید)',
  divergence: 'واگرایی بازارها (تا سررسید)',
  vol: 'شوک نوسان (فوری)',
  combo: 'سناریوهای ترکیبی واقعی',
  time: 'گذر زمان',
  replay: 'تکرار حرکت اخیر'
};
const usd0 = (v: number) => toFaDigits(Math.round(v).toLocaleString('en-US'));
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${toFaDigits(Math.abs(v * 100).toFixed(1))}٪`;

export function DeepScenarios({ combo }: { combo: Combo }) {
  const rows = useMemo(() => comboScenarios(combo), [combo]);
  const mcIv = useMemo(() => monteCarlo(combo, 'iv'), [combo]);
  const mcHv = useMemo(() => monteCarlo(combo, 'hv'), [combo]);
  const multi = combo.legs.length > 1;
  const groups = [...new Set(rows.map((r) => r.group))];
  const best = rows.reduce((a, b) => (b.total.total > a.total.total ? b : a));
  const worst = rows.reduce((a, b) => (b.total.total < a.total.total ? b : a));

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold text-ink">کجا سود می‌دهد و کجا ضرر (در سررسید)</h3>
        {combo.legs.map((l) => {
          const zones = pnlZones(l.strategy.legs, l.snap.m.forward, l.snap.m.T, l.snap.atmIv);
          const sigma = oneSigmaMovePct(l.snap.atmIv, l.snap.m.T);
          return (
            <div key={l.currency} className="rounded-field border border-divider p-3">
              <p className="text-xs font-bold text-ink">
                <bdi dir="ltr">{l.currency}</bdi> · {STRATEGY_FA[l.strategy.id]}
                <span className="ms-1 font-normal text-subtle">
                  (قیمت فعلی {usd0(l.snap.spot)}{sigma !== null && <>، حرکت معمول ±{fmtPct(sigma)} تا سررسید</>})
                </span>
              </p>
              <ul className="mt-2 space-y-1">
                {zones.map((z, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted">
                      {z.lo === null ? `زیر ${usd0(z.hi!)}` : z.hi === null ? `بالای ${usd0(z.lo)}` : `بین ${usd0(z.lo)} و ${usd0(z.hi)}`}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge tone={z.profit ? 'gain' : 'loss'}>{z.profit ? 'سود' : 'ضرر'}</Badge>
                      <span className="text-2xs text-subtle">احتمال {z.prob === null ? '—' : fmtPct(z.prob * 100, 0)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-2xs leading-5 text-subtle">احتمال‌ها تقریبی‌اند و از نوسانی که بازار در قیمت آپشن‌ها لحاظ کرده (IV) به دست آمده‌اند؛ پیش‌بینی جهت قیمت نیستند.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-ink">سناریوها با علت سود و زیان</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-field border border-divider bg-card p-3">
            <p className="text-2xs font-semibold text-muted">بهترین سناریو</p>
            <p className="mt-1 text-xs text-ink">{best.label}</p>
            <MoneyValue value={cents(best.total.total)} signed tone="auto" digits={2} className="text-sm font-bold" />
          </div>
          <div className="rounded-field border border-divider bg-card p-3">
            <p className="text-2xs font-semibold text-muted">بدترین سناریو</p>
            <p className="mt-1 text-xs text-ink">{worst.label}</p>
            <MoneyValue value={cents(worst.total.total)} signed tone="auto" digits={2} className="text-sm font-bold" />
          </div>
        </div>
        {groups.map((g) => (
          <div key={g} className="space-y-1.5">
            <p className="text-2xs font-semibold text-subtle">{GROUP_FA[g]}</p>
            <ul className="divide-y divide-divider rounded-field border border-divider">
              {rows.filter((r) => r.group === g).map((r) => (
                <ScenarioRow key={r.id} r={r} multi={multi} />
              ))}
            </ul>
          </div>
        ))}
        <p className="text-2xs leading-5 text-subtle">
          {multi && 'در سناریوی «کل بازار»، حرکت هر دارایی از حرکت بیت‌کوین و میزان همراهی آن دارایی با بیت‌کوین در ۴۵ روز اخیر (Beta) تخمین زده شده. '}هر سود یا زیان به سه بخش تقسیم شده: اثر تغییر قیمت، اثر تغییر نوسان بازار (IV) و اثر گذر زمان. جمع این سه برابر کل است.
        </p>
      </section>

      {(mcIv || mcHv) && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold text-ink">شبیه‌سازی {toFaDigits(4000)} مسیر قیمت تا سررسید</h3>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
              <caption className="sr-only">نتیجهٔ شبیه‌سازی</caption>
              <thead>
                <tr className="text-2xs text-subtle">
                  <th scope="col" className="w-[40%] pb-2 text-start font-semibold" />
                  <th scope="col" className="pb-2 text-end font-semibold">
                    اگر نوسان آینده = نوسان مورد انتظار بازار (IV)
                  </th>
                  <th scope="col" className="pb-2 text-end font-semibold">
                    اگر نوسان آینده = نوسان واقعی ۳۰ روز اخیر (HV)
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['احتمال سود کل', (m: MonteCarlo) => fmtPct(m.pProfit * 100, 0)],
                    ['میانگین سود یا زیان', (m: MonteCarlo) => <MoneyValue value={cents(m.expected)} signed tone="auto" digits={2} />],
                    ['میانگین ۵٪ بدترین حالت‌ها', (m: MonteCarlo) => <MoneyValue value={cents(m.worst5)} signed tone="auto" digits={2} />],
                    ['میانگین ۵٪ بهترین حالت‌ها', (m: MonteCarlo) => <MoneyValue value={cents(m.best5)} signed tone="auto" digits={2} />],
                    ...(multi ? [['احتمال اینکه همهٔ بخش‌ها با هم زیان کنند', (m: MonteCarlo) => fmtPct(m.pAllLose * 100, 0)]] : [])
                  ] as [string, (m: MonteCarlo) => ReactNode][]
                ).map(([label, f]) => (
                  <tr key={label}>
                    <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                      {label}
                    </th>
                    <td className="border-t border-divider py-2 text-end font-semibold">{mcIv ? f(mcIv) : '—'}</td>
                    <td className="border-t border-divider py-2 text-end font-semibold">{mcHv ? f(mcHv) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <EdgeNote combo={combo} iv={mcIv?.expected ?? null} hv={mcHv?.expected ?? null} />
        </section>
      )}

      <Disclosure summary="احتمال حرکت‌های بزرگ قیمت تا سررسید (تقریبی)">
        <ul className="space-y-1 text-xs text-muted">
          {combo.legs.map((l) => (
            <li key={l.currency}>
              <bdi dir="ltr">{l.currency}</bdi>:{' '}
              {[5, 10, 20, 30]
                .map((p) => {
                  const x = probMoveBeyond(l.snap.atmIv, l.snap.m.T, p);
                  return `±${toFaDigits(p)}٪ → ${x === null ? '—' : fmtPct(x * 100, 0)}`;
                })
                .join(' · ')}
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

function ScenarioRow({ r, multi }: { r: ComboScenario; multi: boolean }) {
  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-ink">{r.label}</span>
        <MoneyValue value={cents(r.total.total)} signed tone="auto" digits={2} className="shrink-0 text-xs font-bold" />
      </div>
      {r.perLeg.map((p) => (
        <p key={p.currency} className={cn('text-2xs leading-5 text-muted', !multi && 'text-xs')}>
          {multi && (
            <>
              <bdi dir="ltr" className="font-semibold text-ink">
                {p.currency}
              </bdi>{' '}
              ({signedPct(p.move)}):{' '}
              <MoneyValue value={cents(p.attribution.total)} signed tone="auto" digits={2} /> —{' '}
            </>
          )}
          {!multi && p.move !== 0 && <>قیمت {signedPct(p.move)} — </>}
          {p.why}
          <span className="text-subtle">
            {' '}
            (اثر قیمت {usd0(p.attribution.price)}، اثر نوسان {usd0(p.attribution.vol)}، اثر زمان {usd0(p.attribution.time)})
          </span>
        </p>
      ))}
    </li>
  );
}

/** لبهٔ واقعی: اختلاف نتیجه با نوسان واقعی (HV) و نوسان قیمت‌شده (IV) */
function EdgeNote({ combo, iv, hv }: { combo: Combo; iv: number | null; hv: number | null }) {
  if (iv === null || hv === null) return <p className="text-2xs text-subtle">برای مقایسه با نوسان تاریخی، تاریخچهٔ قیمت کافی نیست.</p>;
  const edge = hv - iv;
  const tiny = Math.max(1, combo.totalMaxLoss * 0.02);
  return (
    <p className="text-xs leading-6 text-muted">
      اگر نوسان آینده همان چیزی باشد که بازار انتظار دارد (IV)، میانگین سود تقریباً صفر است (بدون کارمزد و فاصلهٔ خرید و فروش). یعنی سود فقط وقتی می‌آید که نوسان واقعی با انتظار بازار فرق کند؛ این یک احتمال است، نه پیش‌بینی.{' '}
      {Math.abs(edge) < tiny ? (
        <>اگر نوسان مثل ۳۰ روز اخیر بماند، تفاوت معناداری ندارد؛ این ترکیب «لبه» آماری خاصی ندارد و نتیجه به حرکت واقعی بستگی دارد.</>
      ) : edge > 0 ? (
        <>
          اگر نوسان مثل ۳۰ روز اخیر بماند، میانگین حدود <MoneyValue value={cents(edge)} digits={2} className="font-semibold text-positive" /> بهتر است — به نفع این ترکیب.
        </>
      ) : (
        <>
          اگر نوسان مثل ۳۰ روز اخیر بماند، میانگین حدود <MoneyValue value={cents(-edge)} digits={2} className="font-semibold text-negative" /> بدتر است — به ضرر این ترکیب.
        </>
      )}{' '}
      گذشته تضمین آینده نیست.
    </p>
  );
}
