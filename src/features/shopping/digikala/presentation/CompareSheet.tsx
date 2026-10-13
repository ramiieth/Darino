import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { errorText, getProduct } from '../data/api';
import { bayesStars } from '../domain/score';
import type { DkCard, DkProduct } from '../domain/types';
import { fmtCount, fmtPrice, fmtStars } from './format';
import { ProductImage } from './ProductImage';

const MAX_SPEC_ROWS = 25;

export function CompareSheet({ open, cards, onClose, onOpenProduct }: {
  open: boolean;
  cards: DkCard[];
  onClose: () => void;
  onOpenProduct: (id: number) => void;
}) {
  const [products, setProducts] = useState<DkProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = cards.map((c) => c.id).join(',');

  useEffect(() => {
    if (!open) return;
    let stop = false;
    setProducts(null); setError(null);
    void Promise.allSettled(cards.map((c) => getProduct(c.id))).then((all) => {
      if (stop) return;
      const ok = all.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const failed = all.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) setError(`${toFaDigits(all.length - ok.length)} کالا دریافت نشد: ${errorText(failed.reason)}`);
      setProducts(ok);
    });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const rows = useMemo(() => (products ? buildRows(products) : []), [products]);

  return (
    <Sheet open={open} onClose={onClose} title="مقایسهٔ کالاها" size="lg">
      {error && <Notice tone="warn" className="mb-3">{error}</Notice>}
      {!products && <ListSkeleton rows={6} />}
      {products && products.length > 0 && (
        <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky start-0 z-10 w-28 bg-card p-2 text-start font-semibold text-muted" />
                {products.map((p) => (
                  <th key={p.id} className="p-2 align-top font-normal">
                    <button type="button" onClick={() => onOpenProduct(p.id)} className="flex w-full flex-col items-center gap-2 text-center">
                      <ProductImage src={p.image} className="h-20 w-20" />
                      <span className="line-clamp-3 font-semibold text-ink hover:text-accent">{p.title}</span>
                    </button>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-on-accent">
                      دیجی‌کالا <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="sticky start-0 z-10 border-t border-divider bg-card p-2 text-start font-semibold text-muted">{row.label}</th>
                  {row.cells.map((cell, i) => (
                    <td key={i} className={cn('border-t border-divider p-2 text-center text-ink', row.best === i && 'font-bold text-positive')}>{cell ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-subtle">سبز = بهترین مقدار در آن ردیف. «امتیاز وزنی» امتیاز خریداران را با تعداد رأی تعدیل می‌کند.</p>
        </div>
      )}
    </Sheet>
  );
}

interface Row { label: string; cells: (ReactNode | null)[]; best?: number }

function argBest(values: (number | null)[], dir: 'min' | 'max'): number | undefined {
  let best: number | undefined;
  values.forEach((v, i) => {
    if (v == null) return;
    if (best === undefined || (dir === 'min' ? v < (values[best] as number) : v > (values[best] as number))) best = i;
  });
  const distinct = new Set(values.filter((v) => v != null));
  return distinct.size > 1 ? best : undefined;
}

function buildRows(ps: DkProduct[]): Row[] {
  const price = ps.map((p) => (p.inStock ? p.priceToman : null));
  const cheapest = ps.map((p) => p.offers[0]?.priceToman ?? null);
  const weighted = ps.map((p) => (p.stars == null ? null : Math.round(bayesStars(p.stars, p.ratingCount) * 100) / 100));
  const recommend = ps.map((p) => p.recommendPercent);
  const rows: Row[] = [
    { label: 'قیمت', cells: price.map((v) => (v == null ? 'ناموجود' : fmtPrice(v))), best: argBest(price, 'min') },
    { label: 'ارزان‌ترین فروشنده', cells: cheapest.map((v) => (v == null ? null : fmtPrice(v))), best: argBest(cheapest, 'min') },
    { label: 'تخفیف', cells: ps.map((p) => (p.discountPercent ? `${toFaDigits(p.discountPercent)}٪` : null)), best: argBest(ps.map((p) => p.discountPercent || null), 'max') },
    { label: 'امتیاز خریداران', cells: ps.map((p) => `${fmtStars(p.stars)}${p.ratingCount ? ` (${fmtCount(p.ratingCount)})` : ''}`) },
    { label: 'امتیاز وزنی', cells: weighted.map((v) => (v == null ? null : toFaDigits(v.toFixed(2)))), best: argBest(weighted, 'max') },
    { label: 'پیشنهاد خریداران', cells: recommend.map((v) => (v == null ? null : `${toFaDigits(v)}٪`)), best: argBest(recommend, 'max') },
    { label: 'تعداد فروشنده', cells: ps.map((p) => toFaDigits(p.offers.length)) },
    { label: 'برند', cells: ps.map((p) => p.brand) }
  ];

  // Spec rows shared by at least two of the products, in first-seen order.
  const specMaps = ps.map((p) => new Map(p.specs.flatMap((g) => g.rows).map((r) => [r.title, r.value])));
  const titles: string[] = [];
  for (const m of specMaps) for (const t of m.keys()) if (!titles.includes(t)) titles.push(t);
  for (const t of titles.filter((t) => specMaps.filter((m) => m.has(t)).length >= 2).slice(0, MAX_SPEC_ROWS)) {
    rows.push({ label: t, cells: specMaps.map((m) => m.get(t) ?? null) });
  }
  return rows;
}
