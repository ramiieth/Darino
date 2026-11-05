/**
 * تورم و قدرت خرید — بخش مستقل
 *   پنج پرسش ساده (تغییر دلاری، تغییر تومانی، تومانی در برابر تورم ایران، قدرت خرید دلاری، رشد واقعی)
 *   بازده اسمی جدا از واقعی: واقعی = (۱ + اسمی) ÷ (۱ + تورم همان بازه) − ۱
 *   تورم رسمی (مرکز آمار/بانک جهانی، BLS) جدا از شاخص‌های جایگزین بازار (دلار آزاد، طلا)
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { toEnDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { DAY_MS, endpointOf, inflationLeg, nearestRecord, realReturn } from '../domain/engine';
import type { PeriodAnalysis } from '../domain/analysis';
import type { PerfSettings, Series, ValueRecord } from '../domain/types';
import { newId, saveSettings } from '../data/store';
import { PeriodPicker } from './PeriodPicker';
import { Pct, SourceLine, Toman, Usd } from './parts';

function Answer({ n, q, children }: { n: string; q: string; children: React.ReactNode }) {
  return (
    <li className="py-3">
      <p className="text-xs font-bold text-ink">{n}. {q}</p>
      <div className="mt-1 text-sm leading-7 text-muted">{children}</div>
    </li>
  );
}

const verdict = (real: number | null, good: string, bad: string) => (real === null ? null : real >= 0 ? <span className="font-semibold text-positive">{good}</span> : <span className="font-semibold text-negative">{bad}</span>);

export function InflationTab({
  records,
  startId,
  endId,
  onPeriod,
  analysis,
  series,
  settings
}: {
  records: ValueRecord[];
  startId: string;
  endId: string;
  onPeriod: (s: string, e: string) => void;
  analysis: PeriodAnalysis | null;
  series: Record<string, Series>;
  settings: PerfSettings;
}) {
  // قدرت خرید دلاری نسبت به حدود یک سال قبل از پایان دوره
  const yearUsd = useMemo(() => {
    if (!analysis) return null;
    const base = nearestRecord(records.filter((r) => r.dateTs < analysis.end.dateTs), analysis.end.dateTs - 365 * DAY_MS, 45 * DAY_MS);
    if (!base) return null;
    const us = inflationLeg(series.us_cpi, base.dateTs, analysis.end.dateTs, true);
    const nominal = analysis.end.usd / base.usd - 1;
    return { base, nominal, us, real: us ? realReturn(nominal, us.cumulative) : null };
  }, [analysis, records, series.us_cpi]);

  if (records.length < 2) return <Notice tone="info">برای بررسی قدرت خرید حداقل دو سابقهٔ ارزش لازم است.</Notice>;
  if (!analysis) return null;
  const inf = analysis.inflation;
  const e = endpointOf(analysis.end);

  return (
    <div className="space-y-5">
      <Surface className="p-4">
        <h2 className="mb-3 text-sm font-bold text-ink">بازهٔ بررسی</h2>
        <PeriodPicker records={records} startId={startId} endId={endId} onChange={onPeriod} />
      </Surface>

      <Surface variant="focal" className="p-4 md:p-5">
        <h2 className="text-sm font-bold text-ink">به زبان ساده</h2>
        <ol className="divide-y divide-divider">
          <Answer n="۱" q="ارزش دلاری سرمایه چقدر تغییر کرده؟">
            از <Usd v={analysis.start.usd} /> به <Usd v={analysis.end.usd} /> رسیده: <Usd v={analysis.portfolio.pnlUsd} signed /> (<Pct v={inf.nominalUsd} />).
          </Answer>
          <Answer n="۲" q="ارزش تومانی سرمایه چقدر تغییر کرده؟">
            {inf.nominalToman === null ? (
              'نرخ دلار یکی از دو تاریخ ثبت نشده؛ تغییر تومانی قابل محاسبه نیست.'
            ) : (
              <>
                از <Toman v={analysis.portfolio.startToman} /> به <Toman v={analysis.portfolio.endToman} />: <Pct v={inf.nominalToman} />.
                {inf.fx && (
                  <> از این تغییر، <Toman v={inf.fx.fromRate} signed /> فقط به‌خاطر تغییر نرخ دلار (<Pct v={inf.fx.rateChange} />) و <Toman v={inf.fx.fromUsdValue} signed /> به‌خاطر تغییر ارزش دلاری خود دارایی بوده است.</>
                )}
              </>
            )}
          </Answer>
          <Answer n="۳" q="بازده تومانی از تورم ایران بیشتر بوده یا کمتر؟">
            {inf.iran && inf.nominalToman !== null ? (
              <>
                تورم رسمی ایران در همین بازه <Pct v={inf.iran.cumulative} tone="none" /> و بازده تومانی شما <Pct v={inf.nominalToman} /> بوده؛ بازده واقعی تومانی <Pct v={inf.realToman} /> —{' '}
                {verdict(inf.realToman, 'از تورم جلوتر بوده‌اید.', 'از تورم عقب مانده‌اید.')}
              </>
            ) : (
              <>داده کافی موجود نیست — شاخص رسمی تورم ایران برای هر دو تاریخ این بازه در دسترس نیست. می‌توانید شاخص رسمی مرکز آمار را پایین همین صفحه ثبت کنید.</>
            )}
          </Answer>
          <Answer n="۴" q="قدرت خرید دلاری سرمایه نسبت به سال قبل کم شده؟">
            {yearUsd?.us ? (
              <>
                از {formatJalali(yearUsd.base.dateTs)} تا پایان دوره، ارزش دلاری <Pct v={yearUsd.nominal} /> و تورم آمریکا <Pct v={yearUsd.us.cumulative} tone="none" /> بوده؛ قدرت خرید دلاری <Pct v={yearUsd.real} /> —{' '}
                {verdict(yearUsd.real, 'افزایش یافته.', 'کاهش یافته.')}
              </>
            ) : (
              'داده کافی موجود نیست — سابقه‌ای در حدود یک سال قبل از پایان دوره، یا CPI آمریکا برای این تاریخ‌ها، در دسترس نیست.'
            )}
          </Answer>
          <Answer n="۵" q="سرمایه به لحاظ واقعی چقدر رشد یا افت کرده؟">
            {inf.realUsd !== null || inf.realToman !== null ? (
              <>
                {inf.realUsd !== null && <>با معیار دلار و تورم آمریکا: <Pct v={inf.realUsd} />. </>}
                {inf.realToman !== null && <>با معیار تومان و تورم ایران: <Pct v={inf.realToman} />.</>}
                {analysis.returns && !analysis.returns.qualified && <span className="block text-xs text-subtle">این اعداد بر پایهٔ «تغییر ارزش» است و اثر واریز/برداشت خارجی را جدا نمی‌کند.</span>}
              </>
            ) : (
              'داده کافی موجود نیست.'
            )}
          </Answer>
        </ol>
      </Surface>

      <div className="grid gap-5 md:grid-cols-2">
        <Surface className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink">تورم رسمی</h2>
            <Badge tone="info">رسمی</Badge>
          </div>
          <ul className="divide-y divide-divider text-xs">
            <li className="py-2.5">
              <div className="flex justify-between gap-2"><span className="text-muted">تورم مصرف‌کنندهٔ ایران (همین بازه)</span>{inf.iran ? <Pct v={inf.iran.cumulative} tone="none" /> : <span className="text-subtle">داده کافی نیست</span>}</div>
              {inf.iran && <SourceLine source={`${inf.iran.source} · ${formatJalali(inf.iran.from.at)} تا ${formatJalali(inf.iran.to.at)}`} />}
            </li>
            <li className="py-2.5">
              <div className="flex justify-between gap-2"><span className="text-muted">تورم آمریکا CPI-U (همین بازه)</span>{inf.us ? <Pct v={inf.us.cumulative} tone="none" /> : <span className="text-subtle">داده کافی نیست</span>}</div>
              {inf.us && <SourceLine source={`${inf.us.source} · ${formatJalali(inf.us.from.at)} تا ${formatJalali(inf.us.to.at)}`} url={series.us_cpi?.sourceUrl} />}
            </li>
            <li className="flex justify-between gap-2 py-2.5"><span className="text-muted">بازده اسمی دلاری ← واقعی</span><span><Pct v={inf.nominalUsd} /> ← <Pct v={inf.realUsd} /></span></li>
            <li className="flex justify-between gap-2 py-2.5"><span className="text-muted">بازده اسمی تومانی ← واقعی</span><span><Pct v={inf.nominalToman} /> ← <Pct v={inf.realToman} /></span></li>
          </ul>
          <p className="mt-2 text-2xs leading-5 text-subtle">تورم برای دقیقاً همین بازه از شاخص قیمت دو سر بازه محاسبه می‌شود؛ بین دو انتشار ماهانه/سالانه درون‌یابی هندسی می‌شود و برون‌یابی نمی‌شود.</p>
        </Surface>

        <Surface className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink">شاخص‌های جایگزین بازار</h2>
            <Badge tone="warn">غیررسمی</Badge>
          </div>
          <ul className="divide-y divide-divider text-xs">
            {inf.proxies.map((p) => (
              <li key={p.id} className="py-2.5">
                <div className="flex justify-between gap-2"><span className="text-muted">{p.name}</span><Pct v={p.change} tone="none" /></div>
                <SourceLine source={p.source} />
              </li>
            ))}
            <li className="flex justify-between gap-2 py-2.5"><span className="text-muted">دارایی‌های مالی شما (تومانی)</span><Pct v={inf.nominalToman} /></li>
          </ul>
          <p className="mt-2 text-2xs leading-5 text-subtle">رشد دلار آزاد و طلا نشانهٔ کاهش ارزش ریال است، اما تورم رسمی نیست و جایگزین آن حساب نمی‌شود.</p>
        </Surface>
      </div>

      <CpiEditor settings={settings} wbAvailable={!!series.ir_cpi_wb} endTs={e.ts} />
    </div>
  );
}

function CpiEditor({ settings, wbAvailable, endTs }: { settings: PerfSettings; wbAvailable: boolean; endTs: number }) {
  const [date, setDate] = useState<number | null>(null);
  const [index, setIndex] = useState('');
  const [source, setSource] = useState('مرکز آمار ایران');
  const n = Number(toEnDigits(index).replace(/[,\s]/g, ''));
  const valid = date !== null && Number.isFinite(n) && n > 0 && source.trim().length >= 3;
  const pts = [...settings.iranCpi].sort((a, b) => a.dateTs - b.dateTs);
  return (
    <Surface variant="subtle" className="p-4">
      <Disclosure summary={`شاخص رسمی تورم ایران (${pts.length >= 2 ? 'از ورود شما' : wbAvailable ? 'بانک جهانی، سالانه' : 'در دسترس نیست'})`}>
        <div className="space-y-3 py-2 text-xs leading-6 text-muted">
          <p>
            بانک جهانی شاخص سالانه را با تأخیر منتشر می‌کند، پس برای بازه‌هایی که تا امروز ادامه دارند معمولاً کافی نیست. اگر شاخص ماهانهٔ CPI مرکز آمار ایران را دارید، حداقل دو نقطه (نزدیک شروع و پایان
            بازه) را با منبع ثبت کنید؛ از آن پس همین شاخص استفاده می‌شود. اپ هیچ عددی از خودش اضافه نمی‌کند.
          </p>
          {pts.length > 0 && (
            <ul className="divide-y divide-divider">
              {pts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{formatJalali(p.dateTs)}</span>
                  <span className="num-ltr text-ink">{p.index}</span>
                  <span className="min-w-0 flex-1 truncate text-subtle">{p.source}</span>
                  <Button size="icon-sm" variant="ghost" icon={<Trash2 />} aria-label="حذف نقطه" onClick={() => void saveSettings({ ...settings, iranCpi: settings.iranCpi.filter((x) => x.id !== p.id) })} />
                </li>
              ))}
            </ul>
          )}
          {pts.length > 0 && pts[pts.length - 1].dateTs < endTs - 45 * DAY_MS && <Notice tone="warn">آخرین شاخص ثبت‌شده بیش از ۴۵ روز قبل از پایان بازه است؛ تورم این بازه محاسبه نمی‌شود.</Notice>}
          <div className="grid gap-3 sm:grid-cols-3">
            <SmartDateField label="ماه شاخص" value={date} onChange={setDate} max={Date.now()} />
            <Field label="عدد شاخص">
              <Input dir="ltr" inputMode="decimal" value={index} onChange={(e) => setIndex(e.target.value)} />
            </Field>
            <Field label="منبع">
              <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} />
            </Field>
          </div>
          <Button
            size="sm"
            variant="outline"
            icon={<Plus />}
            disabled={!valid}
            onClick={() => {
              if (!valid || date === null) return;
              void saveSettings({ ...settings, iranCpi: [...settings.iranCpi, { id: newId(), dateTs: date, index: n, source: source.trim() }] });
              setIndex('');
              setDate(null);
            }}
          >
            افزودن نقطه
          </Button>
          <p className="text-2xs text-subtle">همهٔ نقطه‌ها باید از یک سال پایه باشند (مثلاً پایهٔ ۱۴۰۰ = ۱۰۰).</p>
        </div>
      </Disclosure>
    </Surface>
  );
}
