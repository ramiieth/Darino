import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { buttonClass } from '@/shared/components/ui/Button';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { errorText, getProduct } from '../data/api';
import type { DkProduct } from '../domain/types';
import { fmtCount, fmtPrice } from './format';
import { RatingLine } from './RatingLine';
import { ProductImage } from './ProductImage';

export function useProduct(id: number | null) {
  const [state, setState] = useState<{ data: DkProduct | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (id == null) return;
    let stop = false;
    setState({ data: null, error: null });
    getProduct(id).then(
      (data) => { if (!stop) setState({ data, error: null }); },
      (e) => { if (!stop) setState({ data: null, error: errorText(e) }); }
    );
    return () => { stop = true; };
  }, [id]);
  return state;
}

export function ProductSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: p, error } = useProduct(id);
  return (
    <Sheet open={id != null} onClose={onClose} title={p?.title ?? 'جزئیات کالا'} size="lg"
      footer={p && <a href={p.url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'md') + ' w-full'}>مشاهده و خرید در دیجی‌کالا <ExternalLink aria-hidden className="h-4 w-4" /></a>}>
      {error && <Notice tone="error">{error}</Notice>}
      {!p && !error && <ListSkeleton rows={6} />}
      {p && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <ProductImage src={p.image} priority className="h-32 w-32 shrink-0 shadow-card" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs text-muted">{[p.brand, p.category].filter(Boolean).join(' · ')}</p>
              <p className="text-lg font-extrabold text-ink">{p.inStock ? fmtPrice(p.priceToman) : 'ناموجود'}</p>
              <RatingLine card={p} />
              {p.recommendPercent != null && (
                <p className="text-xs text-muted">{toFaDigits(p.recommendPercent)}٪ خریداران این کالا را پیشنهاد کرده‌اند · {fmtCount(p.commentsCount)} دیدگاه</p>
              )}
            </div>
          </div>

          {(p.overview || p.advantages.length > 0 || p.disadvantages.length > 0) && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-ink">خلاصهٔ نظر خریداران</h3>
              {p.overview && <p className="whitespace-pre-line text-sm leading-7 text-muted">{p.overview}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {p.advantages.length > 0 && (
                  <ul className="space-y-1">{p.advantages.map((a) => <li key={a} className="flex gap-1.5 text-xs text-positive"><ThumbsUp aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</li>)}</ul>
                )}
                {p.disadvantages.length > 0 && (
                  <ul className="space-y-1">{p.disadvantages.map((a) => <li key={a} className="flex gap-1.5 text-xs text-negative"><ThumbsDown aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</li>)}</ul>
                )}
              </div>
            </section>
          )}

          {p.offers.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-ink">فروشندگان ({toFaDigits(p.offers.length)}) — از ارزان‌ترین</h3>
              <ul className="divide-y divide-divider rounded-field border border-divider">
                {p.offers.map((o, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 font-semibold text-ink">
                        <span className="truncate">{o.seller}</span>
                        {(o.official || o.trusted) && <BadgeCheck aria-label={o.official ? 'رسمی' : 'معتبر'} className="h-3.5 w-3.5 shrink-0 text-accent" />}
                      </p>
                      <p className="truncate text-muted">
                        {[o.sellerStars != null && `امتیاز فروشنده ${toFaDigits(o.sellerStars.toFixed(1))}`, o.color, o.warranty].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 font-bold text-ink">{fmtPrice(o.priceToman)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.comments.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-ink">آخرین دیدگاه‌ها</h3>
              <ul className="space-y-2">
                {p.comments.map((c, i) => (
                  <li key={i} className="rounded-field bg-surface-2/70 p-3 text-xs leading-6">
                    <p className="mb-1 text-muted">
                      {c.rate != null && <span className="font-semibold text-ink">{toFaDigits(c.rate)} از ۵ · </span>}
                      {c.isBuyer && 'خریدار · '}{c.date}
                    </p>
                    <p className="text-ink">{c.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.specs.map((g) => (
            <section key={g.title} className="space-y-2">
              <h3 className="text-sm font-bold text-ink">{g.title || 'مشخصات'}</h3>
              <dl className="divide-y divide-divider rounded-field border border-divider text-xs">
                {g.rows.map((r) => (
                  <div key={r.title} className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2">
                    <dt className="text-muted">{r.title}</dt>
                    <dd className="text-ink">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}
