/**
 * نمای کلی — آخرین ارزش ثبت‌شده، تغییر نسبت به رکورد قبل، عملکرد یک‌ساله، بیشینه/کمینه،
 * نمودار تاریخچه با انتخاب بازه، و ارزش لحظه‌ای دارایی‌های متصل (جدا از سوابق)
 */
import { useMemo, useState } from 'react';
import { Camera, Plus, RefreshCw } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Dialog } from '@/shared/components/ui/Sheet';
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

export function OverviewTab({ records, live, onAdd, onSnapshot }: { records: ValueRecord[]; live: LiveValue; onAdd: () => void; onSnapshot: () => void }) {
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

  return (
    <div className="space-y-5">
      {!ov ? (
        <Surface className="p-5">
          <EmptyState
            message="هنوز سابقه‌ای ثبت نشده است"
            hint="ارزش کل دارایی‌های خود را در تاریخ‌های مختلف ثبت کنید تا روند سرمایه، مقایسه با بازارها و تحلیل تورم ساخته شود."
            action={<Button icon={<Plus />} onClick={onAdd}>ثبت اولین سابقه</Button>}
          />
        </Surface>
      ) : (
        <>
          <Surface variant="focal" className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Metric
                size="hero"
                label="آخرین ارزش ثبت‌شده"
                value={<Usd v={ov.latest.usd} />}
                sub={<Toman v={tomanOf(ov.latest)} />}
              />
              <div className="text-end text-xs text-muted">
                <p className="mb-0.5">تاریخ آخرین ثبت</p>
                <DualDate ts={ov.latest.dateTs} />
              </div>
            </div>
            <MetricGrid cols={4} className="mt-5 border-t border-divider pt-4">
              <Metric size="sm" label="تغییر دلاری از رکورد قبل" value={ov.previous ? <Usd v={ov.changeUsd} signed /> : '—'} sub={<Pct v={ov.changePctUsd} />} />
              <Metric size="sm" label="تغییر تومانی از رکورد قبل" value={ov.previous ? <Toman v={ov.changeToman} signed /> : '—'} sub={<Pct v={ov.changePctToman} />} />
              <Metric
                size="sm"
                label="عملکرد یک سال گذشته"
                value={ov.yearBase ? <Pct v={ov.yearChangePctUsd} /> : <span className="text-subtle">داده کافی نیست</span>}
                sub={ov.yearBase ? <>تومانی <Pct v={ov.yearChangePctToman} /> · از {formatJalali(ov.yearBase.dateTs)}</> : 'سابقه‌ای در حدود یک سال قبل نیست'}
              />
              <Metric size="sm" label="بیشترین / کمترین ارزش" value={<><Usd v={ov.max.usd} compact /> / <Usd v={ov.min.usd} compact /></>} sub={`${formatJalali(ov.max.dateTs)} · ${formatJalali(ov.min.dateTs)}`} />
            </MetricGrid>
            <p className="mt-4 text-2xs leading-5 text-subtle">
              این اعداد «تغییر ارزش» هستند، نه بازده سرمایه‌گذاری؛ واریز و برداشت‌های بیرونی در آن‌ها اثر دارند. بازده تفکیک‌شده در «مقایسه با بازارها».
            </p>
          </Surface>

          <Surface className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">تاریخچهٔ ارزش سرمایه</h2>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl size="sm" label="واحد" value={unit} onChange={setUnit} options={[{ value: 'usd', label: 'دلار' }, { value: 'toman', label: 'تومان' }]} />
                <ChipGroup label="بازه" value={range} onChange={setRange} options={RANGES} scroll={false} />
              </div>
            </div>
            {chart.values.length >= 2 ? (
              <HistoryChart labels={chart.labels} values={chart.values} unit={unit} notes={chart.notes} />
            ) : (
              <p className="py-8 text-center text-xs text-muted">برای نمودار حداقل دو سابقه در این بازه لازم است.</p>
            )}
          </Surface>
        </>
      )}

      <Surface variant="subtle" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">ارزش لحظه‌ای دارایی‌های متصل</h2>
            <p className="mt-1 text-xs leading-6 text-muted">کیف پول‌ها، دیفای و حساب‌های پرپچوال — جدا از سوابق؛ تا تأیید نکنید چیزی ثبت نمی‌شود.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<RefreshCw />} aria-label="به‌روزرسانی ارزش لحظه‌ای" onClick={() => void live.refresh()} />
            <Button size="sm" variant="outline" icon={<Camera />} disabled={live.total === null} onClick={() => setConfirm(true)}>
              ثبت به‌عنوان Snapshot
            </Button>
          </div>
        </div>
        {live.empty ? (
          <Notice tone="neutral" className="mt-3">کیف پول یا حسابی متصل نیست؛ از «کیف پول‌ها» اضافه کنید یا ارزش را دستی ثبت کنید.</Notice>
        ) : (
          <>
            <Metric className="mt-3" size="lg" label="ارزش لحظه‌ای" value={<Usd v={live.total} />} sub={live.breakdown?.partial ? 'برخی منابع پاسخ نداده‌اند؛ ممکن است کمتر از واقع باشد' : live.loading ? 'در حال به‌روزرسانی…' : undefined} />
            {live.sources.length > 0 && (
              <ul className="mt-3 divide-y divide-divider text-xs">
                {live.sources.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-muted">{s.label}</span>
                    <Usd v={s.value} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Surface>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ثبت Snapshot از ارزش لحظه‌ای؟"
        description="یک سابقهٔ تازه با تاریخ امروز و همین ارزش ساخته می‌شود؛ پیش از ذخیره می‌توانید آن را ویرایش کنید. سوابق قبلی تغییر نمی‌کنند."
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { setConfirm(false); onSnapshot(); }}>ادامه</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>انصراف</Button>
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
