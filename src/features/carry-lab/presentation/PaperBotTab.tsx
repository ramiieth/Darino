/**
 * بات کاغذی — سه پوزیشن کری روی دادهٔ زندهٔ هر ساعت، بدون پول واقعی
 *   شروع با سرمایهٔ مجازی · ارزش و بازده هر پا · مقایسه با بک‌تست · شرط رفتن به مرحلهٔ ۲ · رویدادها
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, RotateCcw, Square } from 'lucide-react';
import { Surface, Section } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Dialog } from '@/shared/components/ui/Sheet';
import { KeyValueList, Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { fmtDateTime, fmtRelativeAge, toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { PAPER_STRATEGIES, type PaperEvent } from '../domain/paper';
import { ruleLabel } from './sections';
import { Pct } from './sections';
import { EquityChart } from './charts';
import { usePaperAction, usePaperStatus } from '../data/paperApi';

const fa = (v: number, d = 0) => toFaDigits(v.toFixed(d));
const EVENT_TEXT: Record<PaperEvent['kind'], string> = {
  enter: 'ورود',
  exit: 'خروج',
  rebalance: 'ریبالانس',
  liquidation: 'لیکوئید',
  'near-liquidation': 'نزدیک لیکوئید',
  'data-gap': 'قطعی داده'
};
const EVENT_TONE: Record<PaperEvent['kind'], 'gain' | 'neutral' | 'loss' | 'warn' | 'info'> = {
  enter: 'gain',
  exit: 'neutral',
  rebalance: 'info',
  liquidation: 'loss',
  'near-liquidation': 'warn',
  'data-gap': 'warn'
};

export function PaperBotTab() {
  const status = usePaperStatus();
  const action = usePaperAction();
  const [capital, setCapital] = useState('9000');
  const [confirm, setConfirm] = useState<'stop' | 'reset' | null>(null);
  const book = status.data?.book ?? null;
  const sum = status.data?.summary ?? null;
  const tick = status.data?.tick;
  const capNum = Number(toEnDigits(capital).replace(/,/g, ''));

  const chart = useMemo(() => {
    if (!book || book.daily.length < 2) return null;
    const share = book.capitalUsd / PAPER_STRATEGIES.length;
    return {
      labels: book.daily.map((d) => formatJalali(d.day)),
      series: [
        { label: 'بات کاغذی', values: book.daily.map((d) => PAPER_STRATEGIES.reduce((a, st) => a + (d.equity[st.id] ?? 1) * share, 0) / book.capitalUsd), token: 'chart-1' as const },
        { label: 'استیبل ۴٪', values: book.daily.map((d) => (1 + 0.04 / 365) ** ((d.day - book.startedAt) / 86_400_000)), token: 'chart-3' as const, dashed: true }
      ]
    };
  }, [book]);

  if (status.isLoading) return <ListSkeleton rows={3} />;
  if (status.isError) return <ErrorState message="وضعیت بات کاغذی دریافت نشد" onRetry={() => void status.refetch()} />;

  // زمان‌بند رایگان GitHub در عمل هر ۴ تا ۸ ساعت اجرا می‌شود؛ هشدار فقط وقتی واقعاً از کار افتاده باشد
  const tickStale = tick?.lastAt ? Date.now() - tick.lastAt > 12 * 3_600_000 : true;

  return (
    <div className="space-y-6">
      {!tick?.configured ? (
        <Notice tone="warn" title="زمان‌بند فعال نیست">
          بات روی همان بررسی دوره‌ای اعلان‌ها (GitHub Actions، هر ۱۰ دقیقه) اجرا می‌شود. در صفحهٔ <Link to="/alerts" className="text-accent underline">اعلان‌ها</Link> کلید زمان‌بند را بسازید و در GitHub با نام ALERTS_TICK_KEY ذخیره کنید.
        </Notice>
      ) : tickStale ? (
        <Notice tone="stale">آخرین اجرای زمان‌بند {tick.lastAt ? fmtRelativeAge(tick.lastAt) : 'هرگز'} بوده است؛ بیش از ۱۲ ساعت؛ در Actions گیت‌هاب ببینید workflow غیرفعال نشده باشد. ساعت‌های جاافتاده بعداً جبران می‌شوند.</Notice>
      ) : null}

      {!book ? (
        <Surface variant="focal" className="space-y-4 p-4 md:p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">مرحلهٔ ۱: بات کاغذی — بدون پول واقعی</h2>
            <p className="mt-1 text-sm leading-7 text-muted">
              هر ساعت فاندینگ تسویه‌شده و قیمت را از صرافی می‌خواند و همان موتور بک‌تست را جلو می‌برد: ورود، ریبالانس، لیکوئید و ترمز. سرمایهٔ مجازی سه قسمت مساوی می‌شود. ورود، خروج و نزدیک شدن به لیکوئید با اعلان خبر داده می‌شود.
            </p>
          </div>
          <ul className="divide-y divide-divider">
            {PAPER_STRATEGIES.map((st) => (
              <li key={st.id} className="py-2.5 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{st.label}</span>
                  <Badge tone={st.status === 'validated' ? 'gain' : 'warn'}>{st.status === 'validated' ? 'تأییدشده در بک‌تست' : 'آزمایشی'}</Badge>
                </div>
                <p className="mt-1 text-xs leading-6 text-muted">
                  اهرم {fa(st.cost.leverage)}× · {ruleLabel(st.rule)} · کارمزد پرپ {fa(st.cost.perpFeePct, 3)}٪، اسپات {fa(st.cost.spotFeePct, 2)}٪ · بک‌تست ۲ ساله حدود {fa(st.backtestCagr * 100, 1)}٪ سالانه
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="سرمایهٔ مجازی" className="w-44">
              <Input dir="ltr" inputMode="numeric" value={capital} onChange={(e) => setCapital(e.target.value)} suffix="$" />
            </Field>
            <Button icon={<Play />} loading={action.isPending} disabled={!(capNum >= 100)} onClick={() => action.mutate({ action: 'start', capitalUsd: capNum })}>
              شروع بات کاغذی
            </Button>
          </div>
          {action.isError && <Notice tone="error">شروع نشد؛ دوباره تلاش کنید.</Notice>}
          <p className="text-xs leading-6 text-muted">
            محدودیت صادقانه: کاغذی همان مدل بک‌تست روی دادهٔ زنده است؛ پر نشدن سفارش میکر، تأخیر و لغزش واقعی را نمی‌سنجد — آن‌ها در مرحلهٔ ۲ (پول کم با تأیید شما) دیده می‌شوند. ارزش این مرحله: آزمون آینده‌ای که هیچ بک‌تستی ندیده، و اطمینان از کار کردن زمان‌بند، داده و اعلان‌ها.
          </p>
        </Surface>
      ) : (
        sum && (
          <>
            <Surface variant="focal" className="p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone={book.running ? 'gain' : 'neutral'}>{book.running ? 'در حال اجرا' : 'متوقف'}</Badge>
                  <span className="text-xs text-muted">
                    از {formatJalali(book.startedAt)} · {fa(sum.days, 1)} روز · آخرین تیک {book.lastTickAt ? fmtRelativeAge(book.lastTickAt) : '—'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {book.running ? (
                    <Button variant="outline" size="sm" icon={<Square />} onClick={() => setConfirm('stop')}>
                      توقف
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" icon={<RotateCcw />} onClick={() => setConfirm('reset')}>
                      شروع دوباره
                    </Button>
                  )}
                </div>
              </div>
              <MetricGrid cols={4} className="mt-4">
                <Metric size="lg" label="ارزش کل (مجازی)" value={<MoneyValue value={sum.totalUsd} digits={0} />} sub={<>بازده <Pct v={sum.ret} digits={2} /></>} />
                <Metric size="md" label="بازده سالانه‌شده" value={sum.annualized === null ? <span className="text-subtle">زیر ۷ روز</span> : <Pct v={sum.annualized} />} sub={`انتظار بک‌تست حدود ${fa(sum.expected * 100, 1)}٪`} />
                <Metric size="md" label="معیار استیبل" value={`${fa(sum.hurdle * 100)}٪ سالانه`} sub="کری باید از این بیشتر بدهد" />
                <Metric
                  size="md"
                  label="شرط مرحلهٔ ۲"
                  value={sum.gate.daysOk && sum.gate.deviation !== null && sum.gate.deviation < 0.2 ? <span className="text-positive">برقرار</span> : <span className="text-muted">هنوز نه</span>}
                  sub={`${fa(Math.min(sum.days, 30))}/۳۰ روز · فاصله از بک‌تست ${sum.gate.deviation === null ? '—' : `${fa(sum.gate.deviation * 100)}٪`} (حد ۲۰٪)`}
                />
              </MetricGrid>
              {book.lastErrors.length > 0 && <Notice tone="warn" className="mt-4">در آخرین تیک دادهٔ این پاها دریافت نشد: {book.lastErrors.join('، ')} — در تیک بعد جبران می‌شود.</Notice>}
            </Surface>

            <Section title="پوزیشن‌ها">
              <div className="grid gap-4 md:grid-cols-3">
                {PAPER_STRATEGIES.map((st) => {
                  const l = sum.legs.find((x) => x.id === st.id);
                  if (!l) return null;
                  return (
                    <Surface key={st.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">{st.label}</span>
                        <Badge tone={l.open ? 'gain' : 'neutral'}>{l.open ? `باز · ${fa(st.cost.leverage)}×` : 'ترمز: در استیبل'}</Badge>
                      </div>
                      {st.status === 'experimental' && <p className="mt-1 text-2xs text-warn">آزمایشی — تاریخچهٔ بک‌تست کوتاه است</p>}
                      <KeyValueList
                        dense
                        className="mt-2"
                        rows={[
                          { label: 'ارزش', value: <MoneyValue value={l.usd} digits={0} />, emphasis: true },
                          { label: 'بازده', value: <Pct v={l.ret} digits={2} /> },
                          { label: 'میانگین فاندینگ ۷ روز', value: l.avgAprWindow === null ? '—' : `${fa(l.avgAprWindow, 1)}٪ سالانه` },
                          { label: 'فاندینگ دریافتی', value: <Pct v={l.breakdown.funding} digits={3} /> },
                          { label: 'کارمزد و ریبالانس', value: <Pct v={l.breakdown.tradingFees + l.breakdown.rebalance} digits={3} /> },
                          { label: 'نزدیک‌ترین فاصله تا لیکوئید', value: `${fa(l.peakLiqUse * 100)}٪`, hint: 'از ۸۰٪ به بالا اعلان می‌رود' }
                        ]}
                      />
                    </Surface>
                  );
                })}
              </div>
            </Section>

            {chart && (
              <Section title="ارزش روزانه در برابر استیبل">
                <Surface className="p-4 md:p-5">
                  <EquityChart labels={chart.labels} series={chart.series} height={220} />
                </Surface>
              </Section>
            )}

            <Section title="رویدادها">
              <Surface className="p-4 md:p-5">
                {book.events.length === 0 ? (
                  <p className="text-sm text-muted">هنوز رویدادی نیست. اولین ورود در اولین تیک بعد از شروع (حداکثر حدود یک ساعت) ثبت می‌شود.</p>
                ) : (
                  <ul className="divide-y divide-divider">
                    {[...book.events].reverse().slice(0, 40).map((e, i) => {
                      const st = PAPER_STRATEGIES.find((s) => s.id === e.strategy);
                      return (
                        <li key={`${e.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span className="flex items-center gap-2">
                            <Badge tone={EVENT_TONE[e.kind]}>{EVENT_TEXT[e.kind]}</Badge>
                            <span className="text-ink">{st?.label ?? e.strategy}</span>
                            {e.price ? <span className="num-ltr text-xs text-muted">@ {e.price.toLocaleString('en-US')}</span> : null}
                            {e.kind === 'data-gap' && e.amount ? <span className="text-xs text-muted">{fa(e.amount)} ساعت</span> : null}
                          </span>
                          <span className="text-xs text-subtle">{fmtDateTime(e.at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Surface>
            </Section>

            <Notice tone="info">
              این مرحله پول واقعی، کلید یا سفارشی ندارد. مرحلهٔ ۲ (پول کم با تأیید شما و API wallet بدون حق برداشت) فقط وقتی پیشنهاد می‌شود که ۳۰ روز کاغذی با فاصلهٔ کمتر از ۲۰٪ از بک‌تست تمام شود.
            </Notice>
          </>
        )
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'stop' ? 'توقف بات کاغذی؟' : 'شروع دوباره؟'}
        description={confirm === 'stop' ? 'پوزیشن‌های مجازی با هزینهٔ خروج بسته و نتیجه نگه داشته می‌شود.' : 'دفتر فعلی و همهٔ رویدادها پاک می‌شود.'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              loading={action.isPending}
              onClick={() => {
                if (confirm) action.mutate({ action: confirm }, { onSettled: () => setConfirm(null) });
              }}
            >
              {confirm === 'stop' ? 'توقف' : 'پاک کردن'}
            </Button>
          </div>
        }
      >
        <span />
      </Dialog>
    </div>
  );
}
