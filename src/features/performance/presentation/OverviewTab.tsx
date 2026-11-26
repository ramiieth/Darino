/**
 * نمای کلی عملکرد سرمایه — بازطراحی‌شده با تمرکز بر مقایسهٔ دلاری در برابر تومانی از ابتدا تا آخرین رکورد
 *   • کارت هدر شیشه‌ای با آخرین ارزش ثبت‌شده، مقایسهٔ زنده با لحظهٔ فعلی، و پنل مقایسهٔ رشد/ریزش دلاری در برابر تومانی از ابتدا
 *   • ۴ کاشی کلیدی (تغییر دلاری و تومانی از رکورد قبل، عملکرد ۱ ساله یا فاصله از سقف تاریخی، سقف و کف تاریخی)
 *   • نمودار تاریخچه با انتخاب واحد (دلار/تومان) و بازه
 *   • کارت ارزش لحظه‌ای دارایی‌های متصل با نوار سهم هر منبع و دکمه ثبت Snapshot
 */
import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Camera,
  Plus,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Dialog } from '@/shared/components/ui/Sheet';
import { cn } from '@/shared/lib/cn';
import { faNumber, toFaDigits } from '@/shared/utils/formatters';
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
  const rs = useMemo(() => activeRecords(records), [records]);
  const ov = useMemo(() => overview(records), [records]);
  const [range, setRange] = useState<Range>('all');
  const [unit, setUnit] = useState<'usd' | 'toman'>('usd');
  const [confirm, setConfirm] = useState(false);

  const chart = useMemo(() => {
    const last = rs[rs.length - 1]?.dateTs ?? Date.now();
    const shown = range === 'all' ? rs : rs.filter((r) => r.dateTs >= last - Number(range) * DAY_MS);
    return {
      labels: shown.map((r) => formatJalali(r.dateTs)),
      values: shown.map((r) => (unit === 'usd' ? r.usd : tomanOf(r))),
      notes: shown.map((r) => `${formatGregorianIso(r.dateTs)}${r.note ? ` · ${r.note}` : ''}`)
    };
  }, [rs, range, unit]);

  const liveVsLastDelta = useMemo(() => {
    if (!ov || live.total === null || !(ov.latest.usd > 0)) return null;
    const diffUsd = live.total - ov.latest.usd;
    const diffPct = diffUsd / ov.latest.usd;
    return { diffUsd, diffPct };
  }, [ov, live.total]);

  /** مقایسهٔ کامل از اولین سابقهٔ ثبت‌شده تا آخرین سابقه (دلاری در برابر تومانی) */
  const sinceStart = useMemo(() => {
    if (!ov || rs.length < 2) return null;
    const first = rs[0];
    const latest = ov.latest;
    const firstToman = tomanOf(first);
    const latestToman = tomanOf(latest);
    const diffUsd = latest.usd - first.usd;
    const pctUsd = first.usd > 0 ? diffUsd / first.usd : null;
    const diffToman = firstToman !== null && latestToman !== null ? latestToman - firstToman : null;
    const pctToman = firstToman && latestToman !== null ? diffToman! / firstToman : null;
    const fxChangePct = first.rateToman && latest.rateToman ? latest.rateToman / first.rateToman - 1 : null;
    const liveDiffFromStartUsd = live.total !== null ? live.total - first.usd : null;
    const livePctFromStartUsd = liveDiffFromStartUsd !== null && first.usd > 0 ? liveDiffFromStartUsd / first.usd : null;
    return {
      first,
      firstToman,
      latestToman,
      diffUsd,
      pctUsd,
      diffToman,
      pctToman,
      fxChangePct,
      liveDiffFromStartUsd,
      livePctFromStartUsd
    };
  }, [ov, rs, live.total]);

  /** فاصله از سقف تاریخی (Drawdown) برای زمانی که سابقهٔ یک‌ساله موجود نیست */
  const drawdown = useMemo(() => {
    if (!ov || !(ov.max.usd > 0)) return null;
    const diffUsd = ov.latest.usd - ov.max.usd;
    const pctFromPeak = diffUsd / ov.max.usd;
    return { diffUsd, pctFromPeak, atPeak: Math.abs(diffUsd) < 1 };
  }, [ov]);

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
          {/* کارت هدر اصلی با هویت بصری سرمه‌ای/آبی دارینو */}
          <Surface variant="focal" className="relative overflow-hidden border border-divider/85 shadow-sm">
            <div className="h-1.5 w-full bg-gradient-to-l from-[#0B1B5C] via-[#2E5BFF] to-[#1F47E0]" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#2E5BFF]/[0.05] via-transparent to-transparent"
              aria-hidden
            />

            <div className="relative space-y-5 p-5 sm:p-6">
              {/* ردیف بالای هدر: آخرین ارزش ثبت‌شده و مقایسه با لحظهٔ فعلی */}
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
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1 font-bold text-muted ring-1 ring-divider/80">
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

              {/* پنل کانونی: رشد یا ریزش دلاری در برابر تومانی از ابتدا تا آخرین رکورد */}
              {sinceStart && (
                <div className="rounded-2xl border border-[#0B1B5C]/12 bg-[#0B1B5C]/[0.025] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#0B1B5C] text-white">
                        <Scale className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="text-xs font-extrabold text-[#0B1B5C] dark:text-ink">
                        رشد و ریزش دلاری در برابر تومانی (از ابتدا تا آخرین رکورد)
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-muted">
                      {formatJalali(sinceStart.first.dateTs)} ← {formatJalali(ov.latest.dateTs)} ({toFaDigits(ov.count)} رکورد)
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {/* ستون دلاری از ابتدا */}
                    <div
                      className={cn(
                        'rounded-xl border bg-card p-3.5 shadow-2xs',
                        sinceStart.diffUsd >= 0 ? 'border-emerald-500/25' : 'border-rose-500/25'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-muted">تغییر دلاری از ابتدا</span>
                        <Badge tone={sinceStart.diffUsd >= 0 ? 'gain' : 'loss'}>
                          <Pct v={sinceStart.pctUsd} />
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-lg font-black">
                          <Usd v={sinceStart.diffUsd} signed />
                        </span>
                        <span className="text-[11px] text-subtle">
                          <Usd v={sinceStart.first.usd} compact /> ← <Usd v={ov.latest.usd} compact />
                        </span>
                      </div>
                      {sinceStart.liveDiffFromStartUsd !== null && (
                        <p className="mt-2 border-t border-divider/60 pt-1.5 text-[11px] text-muted">
                          تا لحظهٔ فعلی (کیف پول زنده):{' '}
                          <Usd v={sinceStart.liveDiffFromStartUsd} signed compact className="font-bold" />{' '}
                          (<Pct v={sinceStart.livePctFromStartUsd} />)
                        </p>
                      )}
                    </div>

                    {/* ستون تومانی از ابتدا */}
                    <div
                      className={cn(
                        'rounded-xl border bg-card p-3.5 shadow-2xs',
                        (sinceStart.diffToman ?? 0) >= 0 ? 'border-emerald-500/25' : 'border-rose-500/25'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-muted">تغییر تومانی از ابتدا</span>
                        <Badge tone={(sinceStart.diffToman ?? 0) >= 0 ? 'gain' : 'loss'}>
                          <Pct v={sinceStart.pctToman} />
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-lg font-black">
                          {sinceStart.diffToman !== null ? <Toman v={sinceStart.diffToman} signed /> : '—'}
                        </span>
                        {sinceStart.firstToman !== null && sinceStart.latestToman !== null && (
                          <span className="text-[11px] text-subtle">
                            <Toman v={sinceStart.firstToman} /> ← <Toman v={sinceStart.latestToman} />
                          </span>
                        )}
                      </div>
                      {sinceStart.first.rateToman && ov.latest.rateToman && (
                        <p className="mt-2 border-t border-divider/60 pt-1.5 text-[11px] text-muted">
                          نرخ دلار در همین بازه:{' '}
                          <bdi dir="ltr" className="num-ltr font-semibold text-ink">
                            {faNumber(Math.round(sinceStart.first.rateToman))}
                          </bdi>{' '}
                          ←{' '}
                          <bdi dir="ltr" className="num-ltr font-semibold text-ink">
                            {faNumber(Math.round(ov.latest.rateToman))}
                          </bdi>{' '}
                          تومان (<Pct v={sinceStart.fxChangePct} />)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ۴ کاشی شاخص کلیدی */}
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
                      ? 'bg-emerald-500/[0.06] ring-emerald-500/20'
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

                {ov.yearBase ? (
                  <div className="rounded-2xl bg-[#2E5BFF]/[0.06] p-3.5 ring-1 ring-[#2E5BFF]/20">
                    <p className="text-[11px] font-semibold text-muted">عملکرد یک سال گذشته</p>
                    <p className="mt-1 text-base font-black text-ink">
                      <Pct v={ov.yearChangePctUsd} />
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      تومانی <Pct v={ov.yearChangePctToman} /> · از {formatJalali(ov.yearBase.dateTs)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#2E5BFF]/[0.06] p-3.5 ring-1 ring-[#2E5BFF]/20">
                    <p className="text-[11px] font-semibold text-muted">فاصله از سقف تاریخی</p>
                    <p className="mt-1 flex items-center gap-1 text-base font-black text-ink">
                      {drawdown?.atPeak ? (
                        <span className="inline-flex items-center gap-1 text-positive">
                          <ArrowUpRight className="h-4 w-4" /> در سقف تاریخی
                        </span>
                      ) : (
                        <>
                          <ArrowDownRight className="h-4 w-4 text-negative" />
                          <Pct v={drawdown?.pctFromPeak} />
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {drawdown && !drawdown.atPeak ? (
                        <>
                          <Usd v={drawdown.diffUsd} signed compact /> نسبت به اوج {formatJalali(ov.max.dateTs)}
                        </>
                      ) : (
                        `ثبت‌شده در ${formatJalali(ov.max.dateTs)}`
                      )}
                    </p>
                  </div>
                )}

                <div className="rounded-2xl bg-surface-2/70 p-3.5 ring-1 ring-divider/80">
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
      <Surface className="space-y-4 border border-divider/80 p-4 sm:p-5">
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
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-surface-2/50 px-4 py-3">
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
                    <li key={s.label} className="space-y-1.5 rounded-xl bg-surface-2/35 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold text-ink">{s.label}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[11px] font-bold text-muted tabular-nums">
                            {toFaDigits(share.toFixed(0))}٪
                          </span>
                          <Usd v={s.value} className="font-extrabold text-ink" />
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-[#0B1B5C] to-[#2E5BFF]"
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
