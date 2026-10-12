import { Star } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { DkCard } from '../domain/types';
import { fmtCount, fmtStars } from './format';

export function RatingLine({ card }: { card: Pick<DkCard, 'stars' | 'ratingCount'> }) {
  return (
    <p className="inline-flex items-center gap-1 text-xs text-muted">
      <Star aria-hidden className={cn('h-3.5 w-3.5', card.stars != null && 'fill-warn text-warn')} />
      <span className="font-semibold text-ink">{fmtStars(card.stars)}</span>
      {card.ratingCount > 0 && <span>({fmtCount(card.ratingCount)} رأی)</span>}
    </p>
  );
}
