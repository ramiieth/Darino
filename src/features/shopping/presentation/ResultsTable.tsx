/** جدول مقایسهٔ ۱۰ گزینهٔ برتر — جدول در دسکتاپ، کارت فشرده در موبایل؛ داده‌ها یکسان */
import { useState } from 'react';
import { ExternalLink, MapPin, Navigation, ShoppingBag, Star } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { buttonClass } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { fmtCount, fmtPrice } from '../digikala/presentation/format';
import { SERVICE } from '../domain/services';
import type { RankedItem } from '../domain/types';
import { ServiceTag } from './ServiceLogo';

/** بعضی CDNها (ترب) گاهی اتصال HTTP/2 را می‌بندند و همهٔ تصاویر با هم خطا می‌دهند؛ دو بار دوباره تلاش می‌شود */
const MAX_RETRIES = 2;

export function Thumb({ src, className }: { src: string | null; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const failed = attempt > MAX_RETRIES;
  const url = src && attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;
  const retry = () => (attempt < MAX_RETRIES ? window.setTimeout(() => setAttempt((n) => n + 1), 800 * (attempt + 1)) : setAttempt(MAX_RETRIES + 1));
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-field bg-surface-2', className)}>
      {url && !failed ? (
        <img key={attempt} src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={retry} className="h-full w-full object-cover" />
      ) : (
        <ShoppingBag aria-hidden className="h-1/3 w-1/3 text-subtle" />
      )}
    </span>
  );
}

/** خلاصه + لوگوی فروشنده/رستوران (اگر سرویس جدا داده باشد) */
function Summary({ item }: { item: RankedItem }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
      {item.brandLogo && <img src={item.brandLogo} alt="" width={20} height={20} loading="lazy" referrerPolicy="no-referrer" className="h-5 w-5 shrink-0 rounded-full bg-white object-cover ring-1 ring-divider" />}
      <span className="line-clamp-1">{item.summary}</span>
    </p>
  );
}

function Rating({ item }: { item: RankedItem }) {
  if (item.rating == null) return <span className="text-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star aria-hidden className="h-3.5 w-3.5 fill-warn text-warn" />
      <span className="font-semibold text-ink">{toFaDigits(item.rating.toFixed(1))}</span>
      {!!item.ratingCount && <span className="text-xs text-muted">({fmtCount(item.ratingCount)})</span>}
    </span>
  );
}

function Price({ item }: { item: RankedItem }) {
  const negotiable = item.facts.find((f) => f.label === 'قیمت');
  if (item.priceToman == null) return <span className="text-sm text-muted">{negotiable?.value ?? '—'}</span>;
  return (
    <span className="flex flex-col">
      <span className="font-bold text-ink">{item.priceToman === 0 ? 'رایگان' : fmtPrice(item.priceToman)}</span>
      {item.priceBeforeToman && <span className="text-[11px] text-subtle line-through">{fmtPrice(item.priceBeforeToman)}</span>}
      {negotiable && <span className="text-[11px] text-muted">{negotiable.value}</span>}
    </span>
  );
}

const facts = (item: RankedItem) => item.facts.filter((f) => f.label !== 'قیمت');

function Links({ item, compact }: { item: RankedItem; compact?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className={cn(buttonClass('primary', 'sm'), 'gap-1')}>
        {compact ? SERVICE[item.service].name : `ورود به ${SERVICE[item.service].name}`} <ExternalLink aria-hidden className="h-3.5 w-3.5" />
      </a>
      {item.mapUrl && (
        <a href={item.mapUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClass('outline', 'sm'), 'gap-1')} aria-label={`مسیریابی تا ${item.title}`}>
          <Navigation aria-hidden className="h-3.5 w-3.5" /> مسیر
        </a>
      )}
    </span>
  );
}

export function ResultsTable({ items, topIds }: { items: RankedItem[]; topIds: string[] }) {
  const anyDiscount = items.some((i) => i.discountPercent > 0);
  const anyRating = items.some((i) => i.rating != null);
  const anyPrice = items.some((i) => i.priceToman != null || i.facts.some((f) => f.label === 'قیمت'));
  return (
    <>
      {/* دسکتاپ */}
      <Surface className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">مقایسهٔ گزینه‌های برتر</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-5">#</th>
                <th scope="col">گزینه</th>
                {anyPrice && <th scope="col">قیمت</th>}
                {anyDiscount && <th scope="col">تخفیف</th>}
                {anyRating && <th scope="col">امتیاز</th>}
                <th scope="col">موقعیت و جزئیات</th>
                <th scope="col"><span className="sr-only">لینک</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={cn(topIds.includes(i.id) && 'bg-accent-soft')}>
                  <td className="!ps-5 font-bold tabular-nums text-muted">{toFaDigits(i.rank)}</td>
                  <td className="!whitespace-normal">
                    <div className="flex min-w-[260px] max-w-[420px] items-center gap-3">
                      <Thumb src={i.image} className="h-14 w-14" />
                      <div className="min-w-0 space-y-1">
                        <a href={i.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-semibold leading-6 text-ink hover:text-accent">{i.title}</a>
                        {i.summary && <Summary item={i} />}
                        <ServiceTag id={i.service} />
                      </div>
                    </div>
                  </td>
                  {anyPrice && <td><Price item={i} /></td>}
                  {anyDiscount && <td>{i.discountPercent > 0 ? <span className="font-bold text-negative">{toFaDigits(i.discountPercent)}٪</span> : <span className="text-subtle">—</span>}</td>}
                  {anyRating && <td><Rating item={i} /></td>}
                  <td className="!whitespace-normal">
                    <div className="max-w-[260px] space-y-0.5 text-xs text-muted">
                      {i.location && <p className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3 w-3" />{i.location}</p>}
                      {facts(i).map((f) => <p key={f.label}><span className="text-subtle">{f.label}:</span> {toFaDigits(f.value)}</p>)}
                    </div>
                  </td>
                  <td className="!pe-5"><Links item={i} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* موبایل */}
      <ol className="space-y-2.5 md:hidden">
        {items.map((i) => (
          <li key={i.id}>
            <Surface className={cn('space-y-2.5 p-3', topIds.includes(i.id) && 'ring-2 ring-accent')}>
              <div className="flex gap-3">
                <div className="relative">
                  <Thumb src={i.image} className="h-20 w-20" />
                  <span className="absolute -top-1.5 start-1 rounded-full bg-ink px-1.5 text-[10px] font-bold text-card">{toFaDigits(i.rank)}</span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-semibold leading-6 text-ink">{i.title}</a>
                  {i.summary && <Summary item={i} />}
                  <ServiceTag id={i.service} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {anyPrice && <div><dt className="text-subtle">قیمت</dt><dd><Price item={i} /></dd></div>}
                {(i.rating != null || i.discountPercent > 0) && (
                  <div>
                    <dt className="text-subtle">{i.rating != null ? 'امتیاز' : 'تخفیف'}</dt>
                    <dd className="flex items-center gap-2">
                      {i.rating != null && <Rating item={i} />}
                      {i.discountPercent > 0 && <span className="font-bold text-negative">{toFaDigits(i.discountPercent)}٪</span>}
                    </dd>
                  </div>
                )}
                {i.location && <div className="col-span-2"><dt className="sr-only">موقعیت</dt><dd className="inline-flex items-center gap-1 text-muted"><MapPin aria-hidden className="h-3 w-3" />{i.location}</dd></div>}
                {facts(i).map((f) => <div key={f.label}><dt className="text-subtle">{f.label}</dt><dd className="text-ink">{toFaDigits(f.value)}</dd></div>)}
              </dl>
              <Links item={i} />
            </Surface>
          </li>
        ))}
      </ol>
    </>
  );
}
