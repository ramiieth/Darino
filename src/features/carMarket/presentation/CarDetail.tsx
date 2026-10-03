/** ============================================================
 * Car Market — جزئیات یک خودرو: قیمت‌ها، تغییر در همه دوره‌ها، روند
 * ============================================================ */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { KeyValueList } from '@/shared/components/ui/FinancialValue';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { formatJalali } from '@/shared/utils/jalali';
import type { DailyRates } from '@/shared/fx/usdtHistory';
import { TrendChart } from '@/features/propertyMarket/presentation/MarketCharts';
import { CAR_IR_SOURCE_URL } from '../collector/carIr';
import { brandInfo } from '../domain/brands';
import { priceSeries, trimChanges, type CarView } from '../domain/changes';
import type { CarSnapshot } from '../domain/types';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangeCell } from './ChangeCell';
import { CATEGORY_FA, fmtCarPct, fmtCarToman, fmtCarTomanSigned, fmtCarUsd, fmtCarUsdSigned, trimLabel } from './format';

type Unit = 'toman' | 'usd';

export function CarDetail({ view, snapshots, daily }: { view: CarView; snapshots: CarSnapshot[]; daily: DailyRates }) {
  const [unit, setUnit] = useState<Unit>('toman');
  const r = view.row;
  const periods = useMemo(() => trimChanges(snapshots, r.id, daily), [snapshots, r.id, daily]);
  const series = useMemo(() => priceSeries(snapshots, r.id, daily), [snapshots, r.id, daily]);
  const points = series
    .filter((p) => (unit === 'toman' ? true : p.usd !== null))
    .map((p) => ({ ts: p.ts, label: formatJalali(p.ts), value: unit === 'toman' ? p.toman : (p.usd as number) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CarBrandLogo brand={r.brand} label={view.brandFa} size={56} />
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {view.brandFa} <span dir="ltr" className="text-subtle">{brandInfo(r.brand).en}</span>
          </p>
          <p className="text-lg font-bold text-ink">{r.model}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {trimLabel(r)} <Badge tone={view.category === 'imported' ? 'info' : view.category === 'domestic' ? 'brand' : 'neutral'}>{CATEGORY_FA[view.category]}</Badge>
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm text-muted">قیمت بازار امروز</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">{fmtCarToman(r.market)} <span className="text-base font-semibold text-muted">تومان</span></p>
        <p className="mt-1 text-sm text-muted">≈ {fmtCarUsd(view.marketUsd)} (نرخ تتر روز)</p>
      </div>

      <KeyValueList
        rows={[
          { label: 'قیمت کارخانه / نمایندگی', value: r.dealer ? `${fmtCarToman(r.dealer)} تومان` : '—' },
          { label: 'اختلاف بازار با کارخانه', value: view.gapPct !== null ? fmtCarPct(view.gapPct) : '—' },
          { label: 'آخرین به‌روزرسانی منبع', value: r.marketUpdatedAt ? formatJalali(r.marketUpdatedAt) : '—' }
        ]}
      />

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">رشد و کاهش قیمت</h3>
        <div className="overflow-x-auto rounded-field border border-divider">
          <table className="data-table is-compact min-w-[460px]">
            <caption className="sr-only">تغییر قیمت در دوره‌ها</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-4">دوره</th>
                <th scope="col" className="col-num">تومانی</th>
                <th scope="col" className="col-num !pe-4">دلاری</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.key}>
                  <td className="!ps-4">
                    <span className="font-semibold text-ink">{p.label}</span>
                    {p.change && <span className="block text-2xs text-muted">از {formatJalali(p.change.baseTs)}</span>}
                  </td>
                  {p.change ? (
                    <>
                      <td className="col-num">
                        <ChangeCell pct={p.change.tomanPct} sub={fmtCarTomanSigned(p.change.tomanAbs)} estimated={p.change.basis === 'source'} />
                      </td>
                      <td className="col-num !pe-4">
                        <ChangeCell pct={p.change.usdPct} sub={fmtCarUsdSigned(p.change.usdAbs)} />
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="!pe-4 text-xs text-muted">
                      {p.availableFrom && p.availableFrom > Date.now() ? `از ${formatJalali(p.availableFrom)}` : 'داده کافی نیست'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
