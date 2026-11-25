/**
 * نمای کلی عملکرد سرمایه — ریدیزاین مدرن و خوانا
 *   • کارت هدر شیشه‌ای با آخرین ارزش ثبت‌شده، مقایسه زنده با آخرین Snapshot و ۴ کاشی رنگی کلیدی
 *   • نمودار تاریخچه با انتخاب واحد (دلار/تومان) و بازه
 *   • کارت ارزش لحظه‌ای دارایی‌های متصل با نوار سهم هر منبع و دکمه ثبت Snapshot
 */
import { useMemo, useState } from 'react';
import { Calendar, Camera, Plus, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Dialog } from '@/shared/components/ui/Sheet';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatGregorianIso, formatJalali } from '@/shared/utils/jalali';
import { activeRecords, DAY_MS, overview, tomanOf } from '../domain/engine';
import type { ValueRecord } from '../domain/types';
import type { LiveValue } from '../data/useLiveValue';
import { HistoryChart } from './charts';
import { DualDate, Pct, Toman, Usd } from './parts';

type Range = '180' | '365' | '1095' | 'all';
const RANGES: { value: Range; label: string }[] = [
  { value: '180', label: '۶ ماه' },
  { value: '365', label: '۱ سال' },
  { value: '1095', label: '۳ سال' },
  { value: 'all', label: 'همه' }
];

export function OverviewTab({
  records,
  live,
  onAdd,
  onSnapshot
}: {
  records: ValueRecord[];
  live: LiveValue;
  onAdd: () => void;
  onSnapshot: () => void;
}) {
  const ov = useMemo(() => overview(records), [records]);
  const [range, setRange] = useState<Range>('all');
  const [unit, setUnit] = useState<'usd' | 'toman'>('usd');
  const [confirm, setConfirm] = useState(false);

  const chart = useMemo(() => {
    const rs = activeRecords(records);
    const last = rs[rs.length - 1]?.dateTs ?? Date.now();
    const shown = range === 'all' ? rs : rs.filter((r) => r.dateTs >= last - Number(range) * DAY_MS);
    return {
      labels: shown.map((r) => formatJalali(r.dateTs)),
      values: shown.map((r) => (unit === 'usd' ? r.usd : tomanOf(r))),
      notes: shown.map((r) => `${formatGregorianIso(r.dateTs)}${r.note ? ` · ${r.note}` : ''}`)
    };
  }, [records, range, unit]);

  const liveVsLastDelta = useMemo(() => {
    if (!ov || live.total === null || !(ov.latest.usd > 0)) return null;
    const diffUsd = live.total - ov.latest.usd;
    const diffPct = diffUsd / ov.latest.usd;
    return { diffUsd, diffPct };
  }, [ov, live.total]);

  return (
    <div className="space-y-5">
      {!ov ? (
        <Surface className="border border-divider/80 p-6">
          <EmptyState
            message="هنوز سابقه‌ای ثبت نشده است"
            hint="ارزش کل دارایی‌های خود را در تاریخ‌های مختلف ثبت کنید تا روند سرمایه، مقایسه با بازارها و تحلیل تورم ساخته شود."
            action={
              <Button icon={<Plus />} onClick={onAdd}>
                ثبت اولین سابقه
              </Button>
            }
          />
        </Surface>
      ) : (
        <>
          {/* کارت هدر شیشه‌ای آخرین ارزش ثبت‌شده + ۴ کاشی شاخص کلیدی */}
          <Surface variant="focal" className="relative overflow-hidden border border-divider/85 shadow-sm">
            <div className="h-1.5 w-full bg-gradient-to-l from-indigo-500 via-sky-500 to-emerald-500" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-500/[0.08] via-sky-500/[0.02] to-transparent"
              aria-hidden
            />

            <div className="relative p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
                    <Wallet className="h-3.5 w-3.5 text-accent" />
                    آخرین ارزش ثبت‌شده سرمایه
                  </span>
                  <p className="text-3xl font-black tracking-tight text-ink tabular-nums">
                    <Usd v={ov.latest.usd} />
                  </p>
                  <p className="text-sm font-semibold text-muted">
                    <Toman v={tomanOf(ov.latest)} />
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-card/85 px-3 py-1 font-bold text-muted ring-1 ring-divider/80">
                    <Calendar className="h-3.5 w-3.5 text-accent" />
                    <DualDate ts={ov.latest.dateTs} />
                  </span>
                  {liveVsLastDelta && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                        liveVsLastDelta.diffUsd >= 0
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      )}
                    >
                      {liveVsLastDelta.diffUsd >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      نسبت به لحظه فعلی: <Usd v={liveVsLastDelta.diffUsd} signed compact /> (<Pct v={liveVsLastDelta.diffPct} />)
                    </span>
                  )}
                </div>
              </div>

              {/* ۴ کاشی رنگی و خوانا */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <div
                  className={cn(
                    'rounded-2xl p-3.5 ring-1',
                    (ov.changeUsd ?? 0) >= 0
                      ? 'bg-emerald-500/[0.06] ring-emerald-500/20'
                      : 'bg-rose-500/[0.06] ring-rose-500/20'
                  )}
                >
                  <p className="text-[11px] font-semibold text-muted">تغییر دلاری از رکورد قبل</p>
                  <p className="mt-1 text-base font-black text-ink">
                    {ov.previous ? <Usd v={ov.changeUsd} signed /> : '—'}
                  </p>
                  <p className="mt-0.5 text-xs font-bold">
                    <Pct v={ov.changePctUsd} />
                  </p>
                </div>

                <div
                  className={cn(
                    'rounded-2xl p-3.5 ring-1',
                    (ov.changeToman ?? 0) >= 0
                      ? 'bg-teal-500/[0.06] ring-teal-500/20'
                      : 'bg-rose-500/[0.06] ring-rose-500/20'
                  )}
                >
                  <p className="text-[11px] font-semibold text-muted">تغییر تومانی از رکورد قبل</p>
                  <p className="mt-1 text-base font-black text-ink">
                    {ov.previous ? <Toman v={ov.changeToman} signed /> : '—'}
                  </p>
                  <p className="mt-0.5 text-xs font-bold">
                    <Pct v={ov.changePctToman} />
                  </p>
                </div>

                <div className="rounded-2xl bg-indigo-500/[0.06] p-3.5 ring-1 ring-indigo-500/20">
                  <p className="text-[11px] font-semibold text-muted">عملکرد یک سال گذشته</p>
                  <p className="mt-1 text-base font-black text-ink">
                    {ov.yearBase ? <Pct v={ov.yearChangePctUsd} /> : <span className="text-xs text-subtle">داده کافی نیست</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {ov.yearBase ? (
                      <>
                        تومانی <Pct v={ov.yearChangePctToman} /> · از {formatJalali(ov.yearBase.dateTs)}
                      </>
                    ) : (
                      'نیاز به سابقه یک‌ساله'
                    )}
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-500/[0.06] p-3.5 ring-1 ring-amber-500/20">
                  <p className="text-[11px] font-semibold text-muted">سقف و کف تاریخی سبد</p>
                  <p className="mt-1 text-sm font-black text-ink">
                    <Usd v={ov.max.usd} compact /> <span className="text-subtle">/</span> <Usd v={ov.min.usd} compact />
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatJalali(ov.max.dateTs)} · {formatJalali(ov.min.dateTs)}
                  </p>
                </div>
              </div>

              <p className="text-[11px] leading-5 text-subtle">
                این اعداد «تغییر ارزش» هستند؛ برای بازده تفکیک‌شده از واریز و برداشت‌ها (TWR/XIRR) به تب «مقایسه با بازارها» مراجعه کنید.
              </p>
            </div>
          </Surface>

          {/* نمودار تاریخچه ارزش سرمایه */}
          <Surface className="border border-divider/80 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-extrabold text-ink">نمودار روند ارزش سرمایه</h2>
                <p className="text-[11px] text-muted">مقایسه بصری تغییرات سرمایه در طول زمان</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="sm"
                  label="واحد"
                  value={unit}
                  onChange={setUnit}
                  options={[
                    { value: 'usd', label: 'دلار' },
                    { value: 'toman', label: 'تومان' }
                  ]}
                />
                <ChipGroup label="بازه" value={range} onChange={setRange} options={RANGES} scroll={false} />
              </div>
            </div>
            {chart.values.length >= 2 ? (
              <HistoryChart labels={chart.labels} values={chart.values} unit={unit} notes={chart.notes} />
            ) : (
              <p className="py-10 text-center text-xs text-muted">برای نمودار حداقل دو سابقه در این بازه لازم است.</p>
            )}
          </Surface>
        </>
      )}

      {/* کارت ارزش لحظه‌ای دارایی‌های متصل با نوار سهم هر منبع */}
      <Surface className="border border-divider/80 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold text-ink">ارزش لحظه‌ای دارایی‌های متصل</h2>
              {!live.empty && (
                <Badge tone={live.breakdown?.partial ? 'warn' : 'gain'}>
                  {live.breakdown?.partial ? 'دریافت جزئی' : 'متصل و زنده'}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              مجموع کیف پول‌ها، دیفای و حساب‌های پرپچوال — تا تأیید نکنید به‌عنوان سابقه ثبت نمی‌شود.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className={cn('h-3.5 w-3.5', live.loading && 'animate-spin')} />}
              aria-label="به‌روزرسانی ارزش لحظه‌ای"
              onClick={() => void live.refresh()}
            />
            <Button
              size="sm"
              variant="outline"
              icon={<Camera className="h-3.5 w-3.5" />}
              disabled={live.total === null}
              onClick={() => setConfirm(true)}
            >
              ثبت به‌عنوان Snapshot
            </Button>
          </div>
        </div>

        {live.empty ? (
          <Notice tone="neutral">
            کیف پول یا حسابی متصل نیست؛ از بخش «کیف پول‌ها» اضافه کنید یا ارزش را دستی ثبت کنید.
          </Notice>
        ) : (
          <div className="space-y-3.5">
            <div className="rounded-2xl bg-surface-2/50 px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-muted">مجموع لحظه‌ای</span>
              <span className="text-2xl font-black text-ink tabular-nums">
                <Usd v={live.total} />
              </span>
            </div>

            {live.sources.length > 0 && (
              <ul className="space-y-2">
                {live.sources.map((s) => {
                  const share =
                    live.total && live.total > 0 && s.value !== null ? Math.min(100, Math.max(0, (s.value / live.total) * 100)) : 0;
                  return (
                    <li key={s.label} className="rounded-xl bg-surface-2/35 px-3 py-2 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold text-ink">{s.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-bold text-muted tabular-nums">
                            {toFaDigits(share.toFixed(0))}٪
                          </span>
                          <Usd v={s.value} className="font-extrabold text-ink" />
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-indigo-500 to-sky-400"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Surface>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ثبت Snapshot از ارزش لحظه‌ای؟"
        description="یک سابقهٔ تازه با تاریخ امروز و همین ارزش ساخته می‌شود؛ پیش از ذخیره می‌توانید آن را ویرایش کنید. سوابق قبلی تغییر نمی‌کنند."
        footer={
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                setConfirm(false);
                onSnapshot();
              }}
            >
              ادامه
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              انصراف
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink">
          ارزش: <Usd v={live.total} />
        </p>
      </Dialog>
    </div>
  );
}
