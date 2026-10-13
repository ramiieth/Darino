import { SERVICE } from '../domain/services';
import type { ServiceId } from '../domain/types';
import { cn } from '@/shared/lib/cn';

export function ServiceLogo({ id, className }: { id: ServiceId; className?: string }) {
  const s = SERVICE[id];
  return (
    <img
      src={s.logo}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      className={cn('h-6 w-6 shrink-0 rounded-md bg-white object-contain ring-1 ring-divider', className)}
    />
  );
}

/** لوگو + نام فارسی سرویس */
export function ServiceTag({ id, className }: { id: ServiceId; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-muted', className)}>
      <ServiceLogo id={id} className="h-5 w-5" />
      {SERVICE[id].name}
    </span>
  );
}
