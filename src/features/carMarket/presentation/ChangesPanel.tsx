/** ============================================================
 * Car Market — رتبه‌بندی رشد و کاهش مدل‌ها در دوره (تومانی/دلاری)
 *  فقط مدل‌های در حال عرضه/بدون مدل جدید (توقف تولید قیمت مرجع ندارد)
 * ============================================================ */
import { useMemo, useState } from 'react';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import type { CarModelView } from '../domain/models';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangeCell } from './ChangeCell';
import { fmtCarToman, fmtCarTomanSigned, fmtCarUsd, fmtCarUsdSigned } from './format';

type Basis = 'toman' | 'usd';
const TOP_N = 20;

function Ranking({ title, tone, items, basis, onPick }: { title: string; tone: 'up' | 'down'; items: CarModelView[]; basis: Basis; onPick: (m: CarModelView) => void }) {
  return (
    <div className="overflow-hidden rounded-card border border-divider bg-card shadow-card">
      <h3 className={`border-b border-divider px-4 py-3 text-sm font-bold ${tone === 'up' ? 'text-positive' : 'text-negative'}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">موردی نیست</p>
      ) : (
        <ol className="divide-y divide-divider">
          {items.map((m, i) => (
            <li key={m.key}>
              <button type="button" onClick={() => onPick(m)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-surface-2">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-subtle">{toFaDigits(i + 1)}</span>
                <CarBrandLogo brand={m.brand} label={m.brandFa} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{m.model}</span>
                  <span className="block truncate text-2xs text-muted">
                    {m.brandFa} · مدل {toFaDigits(m.latestYear)} ·{' '}
                    {basis === 'toman'
                      ? `${fmtCarToman(m.change?.fromToman)} ← ${fmtCarToman(m.change?.toToman)}`
                      : `${fmtCarUsd(m.change?.fromUsd)} ← ${fmtCarUsd(m.change?.toUsd)}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm">
                  <ChangeCell
                    strong
                    pct={basis === 'toman' ? m.change?.tomanPct : m.change?.usdPct}
                    sub={basis === 'toman' ? fmtCarTomanSigned(m.change?.tomanAbs) : fmtCarUsdSigned(m.change?.usdAbs)}
                    estimated={m.change?.basis === 'source'}
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
  models,
  periodLabel,
  availableFrom,
  onPick
}: {
  models: CarModelView[];
  periodLabel: string;
  availableFrom: number | null;
  onPick: (m: CarModelView) => void;
}) {
  const [basis, setBasis] = useState<Basis>('toman');
  const metric = (m: CarModelView) => (basis === 'toman' ? m.change!.tomanPct : m.change!.usdPct!);
  const sorted = useMemo(
    () =>
      models
        .filter((m) => m.status !== 'stopped' && m.change && (basis === 'toman' || m.change.usdPct !== null))
        .sort((a, b) => metric(b) - metric(a)),
    [models, basis] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (sorted.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-divider px-4 py-12 text-center text-sm text-muted">
        برای دوره {periodLabel} هنوز تاریخچه کافی ثبت نشده
        {availableFrom && availableFrom > Date.now() ? ` — از ${formatJalali(availableFrom)} قابل نمایش است` : ''}.
      </p>
    );
  }
  const gainers = sorted.filter((m) => metric(m) > 0.05).slice(0, TOP_N);
  const losers = [...sorted].reverse().filter((m) => metric(m) < -0.05).slice(0, TOP_N);
  const label = basis === 'toman' ? 'تومانی' : 'دلاری';

  return (
    <div className="space-y-4">
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
        <Ranking title={`بیشترین رشد ${label} · ${periodLabel}`} tone="up" items={gainers} basis={basis} onPick={onPick} />
        <Ranking title={`بیشترین کاهش ${label} · ${periodLabel}`} tone="down" items={losers} basis={basis} onPick={onPick} />
      </div>
      <p className="text-2xs leading-5 text-muted">
        تغییر دلاری = قیمت هر روز تقسیم بر نرخ تتر همان روز؛ ممکن است قیمت تومانی بالا برود ولی ارزش دلاری کم شود. مبنای هر مدل، آخرین سال ساخت آن است.
        {sorted.some((m) => m.change?.basis === 'source') && ' * تغییر روزانه تا ثبت قیمت دیروز در اپ، از درصد تغییر اعلامی car.ir است.'}
      </p>
    </div>
  );
}
