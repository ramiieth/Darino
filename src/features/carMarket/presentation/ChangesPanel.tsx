/** ============================================================
 * Car Market — رشد و کاهش قیمت در دوره (تومانی/دلاری) + رتبه‌بندی
 * ⚠️ فقط نمایش — محاسبه در domain/changes.ts
 * ============================================================ */
import { useMemo, useState } from 'react';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import type { CarView } from '../domain/changes';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangeCell } from './ChangeCell';
import { fmtCarPct, fmtCarToman, fmtCarTomanSigned, fmtCarUsdSigned, trimLabel } from './format';

type Basis = 'toman' | 'usd';
const TOP_N = 15;

function avg(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function Ranking({
  title,
  items,
  basis,
  onPick
}: {
  title: string;
  items: CarView[];
  basis: Basis;
  onPick: (v: CarView) => void;
}) {
  return (
    <div className="rounded-card border border-divider">
      <h3 className="border-b border-divider px-4 py-3 text-sm font-bold text-ink">{title}</h3>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">موردی نیست</p>
      ) : (
        <ol className="divide-y divide-divider">
          {items.map((v, i) => (
            <li key={v.row.id}>
              <button type="button" onClick={() => onPick(v)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-surface-2">
                <span className="w-5 shrink-0 text-center text-xs text-subtle">{toFaDigits(i + 1)}</span>
                <CarBrandLogo brand={v.row.brand} label={v.brandFa} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{v.row.model}</span>
                  <span className="block text-2xs text-muted">
                    {v.brandFa} · {trimLabel(v.row)} · {fmtCarToman(v.change?.fromToman)} ← {fmtCarToman(v.change?.toToman)}
                  </span>
                </span>
                <span className="shrink-0 text-end text-sm">
                  <ChangeCell
                    strong
                    pct={basis === 'toman' ? v.change?.tomanPct : v.change?.usdPct}
                    sub={basis === 'toman' ? fmtCarTomanSigned(v.change?.tomanAbs) : fmtCarUsdSigned(v.change?.usdAbs)}
                    estimated={v.change?.basis === 'source'}
                  />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ChangesPanel({
  views,
  periodLabel,
  availableFrom,
  onPick
}: {
  views: CarView[];
  periodLabel: string;
  /** نبود داده دوره → زودترین زمان قابل نمایش */
  availableFrom: number | null;
  onPick: (v: CarView) => void;
}) {
  const [basis, setBasis] = useState<Basis>('toman');
  const withChange = useMemo(() => views.filter((v) => v.change !== null && (basis === 'toman' || v.change.usdPct !== null)), [views, basis]);
  const metric = (v: CarView) => (basis === 'toman' ? v.change!.tomanPct : v.change!.usdPct!);

  const sorted = useMemo(() => [...withChange].sort((a, b) => metric(b) - metric(a)), [withChange, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const gainers = sorted.filter((v) => metric(v) > 0.05).slice(0, TOP_N);
  const losers = [...sorted].reverse().filter((v) => metric(v) < -0.05).slice(0, TOP_N);
  const estimated = withChange.some((v) => v.change?.basis === 'source');

  if (withChange.length === 0) {
    return (
      <p className="rounded-card border border-divider px-4 py-10 text-center text-sm text-muted">
        برای دوره {periodLabel} هنوز تاریخچه کافی ثبت نشده
        {availableFrom && availableFrom > Date.now() ? ` — از ${formatJalali(availableFrom)} قابل نمایش است` : ''}.
        <span className="mt-1 block text-xs">قیمت‌ها هر روز خودکار ذخیره می‌شوند و این بخش با گذشت زمان کامل می‌شود.</span>
      </p>
    );
  }

  const tomanAvg = avg(withChange.map((v) => v.change!.tomanPct));
  const usdAvg = avg(withChange.map((v) => v.change!.usdPct).filter((x): x is number => x !== null));
  const up = withChange.filter((v) => v.change!.tomanPct > 0.05).length;
  const down = withChange.filter((v) => v.change!.tomanPct < -0.05).length;

  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <Metric size="lg" label={`میانگین تغییر تومانی (${periodLabel})`} value={<ChangeCell strong pct={tomanAvg} />} />
        <Metric size="lg" label="میانگین تغییر دلاری" value={<ChangeCell strong pct={usdAvg} />} />
        <Metric label="گران‌شده / ارزان‌شده" value={<span><span className="text-positive">{toFaDigits(up)}</span> / <span className="text-negative">{toFaDigits(down)}</span></span>} />
        <Metric label="بدون تغییر" value={<span>{toFaDigits(withChange.length - up - down)}</span>} />
      </MetricGrid>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">مبنای رتبه‌بندی:</span>
        <ChipGroup<Basis>
          label="مبنای رتبه‌بندی"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'toman', label: 'تومانی' },
            { value: 'usd', label: 'دلاری' }
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Ranking title={`بیشترین رشد ${basis === 'toman' ? 'تومانی' : 'دلاری'} · ${periodLabel}`} items={gainers} basis={basis} onPick={onPick} />
        <Ranking title={`بیشترین کاهش ${basis === 'toman' ? 'تومانی' : 'دلاری'} · ${periodLabel}`} items={losers} basis={basis} onPick={onPick} />
      </div>

      <p className="text-2xs leading-5 text-muted">
        تغییر دلاری = قیمت هر روز تقسیم بر نرخ تتر همان روز؛ ممکن است قیمت تومانی بالا برود ولی ارزش دلاری کم شود. میانگین ساده درصد تغییر
        {' '}{toFaDigits(withChange.length)} خودرو ({fmtCarPct(tomanAvg)} تومانی).
        {estimated && ' * تغییر روزانه تا ثبت قیمت دیروز در اپ، از درصد تغییر اعلامی car.ir است.'}
      </p>
    </div>
  );
}
