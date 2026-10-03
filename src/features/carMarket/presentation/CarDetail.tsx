/** ============================================================
 * Car Market — جزئیات مدل: قیمت مبنا (آخرین سال ساخت)، وضعیت تولید،
 * همه سال‌ها/تیپ‌ها، تغییر در همه دوره‌ها (روزانه تا ۷۲ ماهه)، روند
 * ============================================================ */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import type { DailyRates } from '@/shared/fx/usdtHistory';
import { TrendChart } from '@/features/propertyMarket/presentation/MarketCharts';
import { CAR_IR_SOURCE_URL } from '../collector/carIr';
import { brandInfo } from '../domain/brands';
import { priceSeries, trimChanges } from '../domain/changes';
import type { CarModelView } from '../domain/models';
import type { CarSnapshot } from '../domain/types';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangeCell, ChangePill } from './ChangeCell';
import { CategoryBadge, StatusBadge } from './StatusBadge';
import { fmtCarPct, fmtCarToman, fmtCarTomanSigned, fmtCarUsd, fmtCarUsdSigned } from './format';

type Unit = 'toman' | 'usd';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-field bg-surface-2 px-3 py-2.5">
      <p className="text-2xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
      {sub && <p className="text-2xs text-subtle">{sub}</p>}
    </div>
  );
}

export function CarDetail({ model: m, snapshots, daily }: { model: CarModelView; snapshots: CarSnapshot[]; daily: DailyRates }) {
  const [unit, setUnit] = useState<Unit>('toman');
  const r = m.basis.row;
  const periods = useMemo(() => trimChanges(snapshots, r.id, daily), [snapshots, r.id, daily]);
  const shown = periods.filter((p) => p.change);
  const pending = periods.filter((p) => !p.change);
  const series = useMemo(() => priceSeries(snapshots, r.id, daily), [snapshots, r.id, daily]);
  const points = series
    .filter((p) => unit === 'toman' || p.usd !== null)
    .map((p) => ({ ts: p.ts, label: formatJalali(p.ts), value: unit === 'toman' ? p.toman : (p.usd as number) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <CarBrandLogo brand={m.brand} label={m.brandFa} size={64} />
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {m.brandFa} <span dir="ltr" className="text-subtle">{brandInfo(m.brand).en}</span>
          </p>
          <p className="text-xl font-extrabold text-ink">{m.model}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge model={m} />
            <CategoryBadge category={m.category} />
          </div>
        </div>
      </div>

      <div className="rounded-panel border border-divider bg-card p-5 shadow-card">
        <p className="text-xs text-muted">
          قیمت بازار · مدل {toFaDigits(r.year)}
          {r.option ? ` · ${r.option}` : ''} (مبنا: آخرین سال ساخت)
        </p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight text-ink">
          {fmtCarToman(r.market ?? r.dealer)} <span className="text-base font-semibold text-muted">تومان</span>
        </p>
        <p className="mt-1 text-sm text-muted">≈ {fmtCarUsd(m.basis.marketUsd)}</p>
        {!m.delisted && m.change && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ChangePill size="md" pct={m.change.tomanPct} label="تومانی" estimated={m.change.basis === 'source'} />
            <ChangePill size="md" pct={m.change.usdPct} label="دلاری" />
          </div>
        )}
        {m.delisted && (
          <p className="mt-3 rounded-field bg-negative/10 px-3 py-2 text-xs text-negative">
            این خودرو دیگر در فهرست car.ir نیست — آخرین قیمت ثبت‌شده در {m.lastSeenTs ? formatJalali(m.lastSeenTs) : '—'}.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="قیمت کارخانه / نمایندگی" value={r.dealer ? fmtCarToman(r.dealer) : 'اعلام نشده'} />
          <Stat label="حباب بازار" value={m.basis.gapPct !== null ? fmtCarPct(m.basis.gapPct) : '—'} />
          <Stat label="به‌روزرسانی منبع" value={r.marketUpdatedAt ? formatJalali(r.marketUpdatedAt) : '—'} sub={m.basis.stale ? 'قدیمی' : undefined} />
        </div>
      </div>

      {m.trims.length > 1 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">همه سال‌های ساخت ({toFaDigits(m.trims.length)})</h3>
          <div className="overflow-x-auto rounded-field border border-divider">
            <table className="data-table is-compact min-w-[460px]">
              <caption className="sr-only">قیمت سال‌های ساخت</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4">مدل</th>
                  <th scope="col" className="col-num">بازار</th>
                  <th scope="col" className="col-num">کارخانه</th>
                  <th scope="col" className="col-num !pe-4">به‌روزرسانی</th>
                </tr>
              </thead>
              <tbody>
                {m.trims.map((t) => (
                  <tr key={t.row.id} className={t.row.id === r.id ? 'bg-accent-soft/40' : undefined}>
                    <td className="!ps-4">
                      <span className="font-semibold text-ink">{toFaDigits(t.row.year)}</span>
                      {t.row.option && <span className="text-2xs text-muted"> · {t.row.option}</span>}
                      {t.row.id === r.id && <span className="ms-1 text-2xs text-accent">مبنا</span>}
                    </td>
                    <td className="col-num">{fmtCarToman(t.row.market)}</td>
                    <td className="col-num text-muted">{fmtCarToman(t.row.dealer)}</td>
                    <td className={`col-num !pe-4 text-2xs ${t.stale ? 'text-warn' : 'text-muted'}`}>{t.row.marketUpdatedAt ? formatJalali(t.row.marketUpdatedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">رشد و کاهش قیمت (مدل {toFaDigits(r.year)})</h3>
        {shown.length === 0 ? (
          <p className="rounded-field bg-surface-2 px-4 py-4 text-sm text-muted">هنوز تاریخچه کافی برای مقایسه ثبت نشده — قیمت‌ها هر روز خودکار ذخیره می‌شوند.</p>
        ) : (
          <div className="overflow-x-auto rounded-field border border-divider">
            <table className="data-table is-compact min-w-[420px]">
              <caption className="sr-only">تغییر قیمت در دوره‌ها</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4">دوره</th>
                  <th scope="col" className="col-num">تومانی</th>
                  <th scope="col" className="col-num !pe-4">دلاری</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.period.key}>
                    <td className="!ps-4">
                      <span className="font-semibold text-ink">{p.period.label}</span>
                      <span className="block text-2xs text-muted">از {formatJalali(p.change!.baseTs)}</span>
                    </td>
                    <td className="col-num">
                      <ChangeCell pct={p.change!.tomanPct} sub={fmtCarTomanSigned(p.change!.tomanAbs)} estimated={p.change!.basis === 'source'} />
                    </td>
                    <td className="col-num !pe-4">
                      <ChangeCell pct={p.change!.usdPct} sub={fmtCarUsdSigned(p.change!.usdAbs)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pending.length > 0 && (
          <Disclosure summary={`دوره‌های بدون داده کافی (${toFaDigits(pending.length)})`}>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 pb-2 text-xs text-muted sm:grid-cols-3">
              {pending.map((p) => (
                <li key={p.period.key}>
                  <span className="font-semibold text-ink">{p.period.label}</span>
                  {p.availableFrom && p.availableFrom > Date.now() ? ` · از ${formatJalali(p.availableFrom)}` : ''}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink">روند قیمت بازار</h3>
          <ChipGroup<Unit>
            label="واحد نمودار"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'toman', label: 'تومان' },
              { value: 'usd', label: 'دلار' }
            ]}
          />
        </div>
        <TrendChart points={points} format={(v) => (unit === 'toman' ? fmtCarToman(v) : fmtCarUsd(v))} />
      </div>

      <a href={CAR_IR_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
        منبع قیمت: car.ir <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
    </div>
  );
}
