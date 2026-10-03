import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import type { CarCategory } from '../domain/types';
import { statusLabel, type CarModelView, type ProductionStatus } from '../domain/models';
import { CATEGORY_FA } from './format';

const STATUS_STYLE: Record<ProductionStatus, string> = {
  current: 'bg-gain/10 text-positive',
  'no-new': 'bg-warn/10 text-warn',
  stopped: 'bg-negative/10 text-negative'
};
const DOT: Record<ProductionStatus, string> = { current: 'bg-gain', 'no-new': 'bg-warn', stopped: 'bg-negative' };

/** وضعیت تولید/عرضه — «آخرین مدل ۱۴۰۴» برای بدون مدل جدید */
export function StatusBadge({ model, className }: { model: Pick<CarModelView, 'status' | 'category' | 'latestYear'>; className?: string }) {
  const text = model.status === 'no-new' ? `آخرین مدل ${toFaDigits(model.latestYear)}` : statusLabel(model);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold', STATUS_STYLE[model.status], className)}>
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DOT[model.status])} />
      {text}
    </span>
  );
}

const CAT_STYLE: Record<CarCategory, string> = {
  domestic: 'bg-accent-soft text-accent',
  assembled: 'bg-surface-2 text-muted',
  imported: 'bg-info/10 text-info'
};

export function CategoryBadge({ category, className }: { category: CarCategory; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold', CAT_STYLE[category], className)}>{CATEGORY_FA[category]}</span>;
}
