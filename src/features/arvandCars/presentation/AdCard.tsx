/** ============================================================
 * کارت آگهی خودروی اروند: عکس، لوگو، قیمت، کارکرد، شهر، نوع پلاک،
 * تغییر قیمت (از تاریخچه خودمان) و پیوند به دیوار
 * ============================================================ */
import { memo, useState } from 'react';
import { ExternalLink, Gauge, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { CarBrandLogo } from '@/features/carMarket/presentation/CarBrandLogo';
import { ChangePill } from '@/features/carMarket/presentation/ChangeCell';
import { fmtCarToman, fmtCarUsd } from '@/features/carMarket/presentation/format';
import { brandLabelOf, brandSlugOf } from '../domain/brandOf';
import type { CarAd } from '../domain/types';
import { PlateBadge } from './PlateBadge';

const nf = new Intl.NumberFormat('en-US');

export const AdCard = memo(function AdCard({ ad, usdRate }: { ad: CarAd; usdRate: number | null }) {
  const [imgOk, setImgOk] = useState(true);
  const slug = brandSlugOf(ad.model) ?? '';
  const brand = brandLabelOf(ad.model);
  const first = ad.priceHistory[0]?.price ?? null;
  const pct = first && ad.price && first !== ad.price ? ((ad.price - first) / first) * 100 : null;
  const seen = ad.updatedAt ?? ad.listedAt;
  return (
    <a
      href={`https://divar.ir/v/${ad.token}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col overflow-hidden rounded-card border border-divider bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-2">
        {ad.image && imgOk ? (
          <img
            src={ad.image}
            alt={ad.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CarBrandLogo brand={slug} label={brand} size={56} />
          </div>
        )}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <PlateBadge kind={ad.region === 'tehran' ? 'national' : ad.plate} className="shadow-card" />
          {ad.image && imgOk && <CarBrandLogo brand={slug} label={brand} size={30} className="shadow-card" />}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 text-ink group-hover:text-accent">{ad.title}</p>
        <p className="mt-1 truncate text-2xs text-muted">
          {ad.model ?? '—'}
          {ad.year ? ` · ${toFaDigits(ad.year)}` : ''}
          {ad.gearbox ? ` · ${ad.gearbox}` : ''}
        </p>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-extrabold tracking-tight text-ink">
              {ad.price ? fmtCarToman(ad.price) : 'توافقی'}
              {ad.price && <span className="ms-1 text-xs font-medium text-muted">تومان</span>}
            </p>
            {ad.price && usdRate ? <p className="text-2xs text-muted">≈ {fmtCarUsd(ad.price / usdRate)}</p> : null}
          </div>
          {pct !== null && <ChangePill pct={pct} label="قیمت" />}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider pt-2.5 text-2xs text-muted">
          {ad.km !== null && (
            <span className="inline-flex items-center gap-1">
              <Gauge aria-hidden className="h-3.5 w-3.5" />
              {ad.km === 0 ? 'صفر کیلومتر' : `${toFaDigits(nf.format(ad.km))} کیلومتر`}
            </span>
          )}
          {ad.where && ad.region !== 'tehran' && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{ad.where}</span>
            </span>
          )}
          {(ad.dealerMulti || ad.installment) && (
            <span className={cn('rounded-full bg-surface-2 px-1.5 py-0.5')}>{ad.dealerMulti ? 'نمایشگاه' : 'شرایطی'}</span>
          )}
          <span className="ms-auto inline-flex items-center gap-1 text-subtle">
            {seen ? fmtRelativeAge(seen) : ''}
            <ExternalLink aria-hidden className="h-3 w-3" />
          </span>
        </div>
      </div>
    </a>
  );
});
