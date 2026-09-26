import { Badge, StatusDot } from '@/shared/components/ui/Badge';
import type { PriceSource } from '@/shared/types';
import { t } from '@/shared/i18n/fa';

/** Data source badge: live / snapshot / N/A */
export function SourceBadge({ source, className }: { source: PriceSource; className?: string }) {
  if (source === 'live') {
    return <StatusDot tone="gain" label={t('live')} className={className} />;
  }
  if (source === 'snapshot') {
    return (
      <Badge tone="warn" className={className}>
        {t('snapshot')}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" className={className}>
      N/A
    </Badge>
  );
}

/** Asset-class marker (paired with a text label wherever it appears) */
export function KindDot({ kind }: { kind: 'crypto' | 'tokenized' | 'tradfi' }) {
  const color = kind === 'crypto' ? 'bg-accent' : kind === 'tokenized' ? 'bg-ink' : 'bg-gold';
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
