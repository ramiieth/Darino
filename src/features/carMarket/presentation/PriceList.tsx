/** ============================================================
 * Car Market — فهرست قیمت روز به تفکیک برند (لوگو + نام فارسی)
 *  دسکتاپ: جدول · موبایل: فهرست فشرده
 * ============================================================ */
import { Fragment, useMemo } from 'react';
import { Badge } from '@/shared/components/ui/Badge';
import { toFaDigits } from '@/shared/utils/formatters';
import type { CarView } from '../domain/changes';
import type { CarCategory } from '../domain/types';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangeCell } from './ChangeCell';
import { CATEGORY_FA, fmtCarPct, fmtCarToman, fmtCarTomanSigned, fmtCarUsd, trimLabel } from './format';

const CAT_ORDER: Record<CarCategory, number> = { domestic: 0, assembled: 1, imported: 2 };

interface BrandGroup {
  brand: string;
  brandFa: string;
  categories: CarCategory[];
  items: CarView[];
}

export function groupByBrand(views: CarView[]): BrandGroup[] {
  const map = new Map<string, BrandGroup>();
  for (const v of views) {
    let g = map.get(v.row.brand);
    if (!g) {
      g = { brand: v.row.brand, brandFa: v.brandFa, categories: [], items: [] };
      map.set(v.row.brand, g);
    }
    g.items.push(v);
    if (!g.categories.includes(v.category)) g.categories.push(v.category);
  }
  for (const g of map.values()) {
    g.categories.sort((a, b) => CAT_ORDER[a] - CAT_ORDER[b]);
    g.items.sort((a, b) => a.row.model.localeCompare(b.row.model, 'fa') || b.row.year.localeCompare(a.row.year));
  }
  return [...map.values()].sort(
    (a, b) => CAT_ORDER[a.categories[0]] - CAT_ORDER[b.categories[0]] || a.brandFa.localeCompare(b.brandFa, 'fa')
  );
}

function BrandHeading({ g }: { g: BrandGroup }) {
  return (
    <span className="flex items-center gap-2.5">
      <CarBrandLogo brand={g.brand} label={g.brandFa} size={30} />
      <span className="font-bold text-ink">{g.brandFa}</span>
      {g.categories.map((c) => (
        <Badge key={c} tone={c === 'imported' ? 'info' : c === 'domestic' ? 'brand' : 'neutral'}>
          {CATEGORY_FA[c]}
        </Badge>
      ))}
      <span className="text-xs text-muted">{toFaDigits(g.items.length)} خودرو</span>
    </span>
  );
}

export function PriceList({ views, periodLabel, onPick }: { views: CarView[]; periodLabel: string; onPick: (v: CarView) => void }) {
  const groups = useMemo(() => groupByBrand(views), [views]);
  if (views.length === 0) return <p className="py-10 text-center text-sm text-muted">خودرویی با این فیلترها پیدا نشد</p>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table min-w-[860px]">
          <caption className="sr-only">قیمت روز خودروها به تفکیک برند</caption>
          <thead>
            <tr>
              <th scope="col" className="!ps-5">خودرو</th>
              <th scope="col" className="col-num">قیمت بازار</th>
              <th scope="col" className="col-num">معادل دلاری</th>
              <th scope="col" className="col-num">قیمت کارخانه</th>
              <th scope="col" className="col-num">اختلاف بازار</th>
              <th scope="col" className="col-num">تغییر تومانی ({periodLabel})</th>
              <th scope="col" className="col-num !pe-5">تغییر دلاری</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.brand}>
                <tr className="bg-surface-2/60">
                  <th scope="rowgroup" colSpan={7} className="!ps-5 !py-2.5 text-start font-normal">
                    <BrandHeading g={g} />
                  </th>
                </tr>
                {g.items.map((v) => (
                  <tr key={v.row.id} className="cursor-pointer" onClick={() => onPick(v)}>
                    <td className="min-w-[13rem] max-w-[20rem] !whitespace-normal !ps-5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPick(v);
                        }}
                        className="text-start font-semibold text-ink hover:text-accent"
                      >
                        {v.row.model}
                      </button>
                      <span className="block text-2xs text-muted">
                        {trimLabel(v.row)}
                        {v.stale && <span className="ms-1 text-warn">· قیمت به‌روز نشده</span>}
                      </span>
                    </td>
                    <td className="col-num font-semibold">{fmtCarToman(v.row.market)}</td>
                    <td className="col-num text-muted">{fmtCarUsd(v.marketUsd)}</td>
                    <td className="col-num text-muted">{fmtCarToman(v.row.dealer)}</td>
                    <td className="col-num text-muted">{v.gapPct !== null ? fmtCarPct(v.gapPct) : '—'}</td>
                    <td className="col-num">
                      <ChangeCell pct={v.change?.tomanPct} sub={v.change ? fmtCarTomanSigned(v.change.tomanAbs) : undefined} estimated={v.change?.basis === 'source'} />
                    </td>
                    <td className="col-num !pe-5">
                      <ChangeCell pct={v.change?.usdPct} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {groups.map((g) => (
          <section key={g.brand} aria-label={g.brandFa}>
            <div className="sticky top-0 z-[1] border-b border-divider bg-surface-2 px-4 py-2.5">
              <BrandHeading g={g} />
            </div>
            <ul className="divide-y divide-divider px-4">
              {g.items.map((v) => (
                <li key={v.row.id}>
                  <button type="button" onClick={() => onPick(v)} className="flex w-full items-center gap-3 py-3 text-start">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{v.row.model}</span>
                      <span className="block text-2xs text-muted">
                        {trimLabel(v.row)}
                        {v.stale && <span className="ms-1 text-warn">· به‌روز نشده</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-sm font-semibold text-ink">{fmtCarToman(v.row.market ?? v.row.dealer)}</span>
                      <span className="block text-2xs text-muted">{fmtCarUsd(v.marketUsd)}</span>
                    </span>
                    <span className="w-20 shrink-0 text-end text-xs">
                      <ChangeCell pct={v.change?.tomanPct} sub={v.change?.usdPct != null ? `دلاری ${fmtCarPct(v.change.usdPct)}` : undefined} estimated={v.change?.basis === 'source'} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
