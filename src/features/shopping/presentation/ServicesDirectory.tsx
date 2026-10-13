/** فهرست همهٔ سرویس‌ها به تفکیک دسته — وضعیت اتصال شفاف است */
import { ExternalLink } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { CATEGORY_LABELS, SERVICES } from '../domain/services';
import type { ServiceCategory } from '../domain/types';
import { ServiceLogo } from './ServiceLogo';

const ORDER: ServiceCategory[] = ['shopping', 'food', 'travel', 'health', 'books', 'beauty', 'payment'];

export function ServicesDirectory() {
  return (
    <div className="space-y-6">
      <p className="text-xs leading-6 text-muted">
        «جستجوی زنده» یعنی دستیار نتیجه را مستقیم از همان سایت می‌خواند؛ «لینک مستقیم» یعنی سایت از سرورهای خارج از ایران پاسخ نمی‌دهد،
        به ورود نیاز دارد یا حساب شخصی است، پس فقط صفحهٔ جستجوی خودش باز می‌شود. هیچ‌جا ورود، خرید یا پرداختی از طرف شما انجام نمی‌شود.
      </p>
      {ORDER.map((cat) => (
        <Section key={cat} title={CATEGORY_LABELS[cat]}>
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {SERVICES.filter((s) => s.category === cat).map((s) => (
              <li key={s.id}>
                <Surface className="flex h-full items-center gap-3 p-3">
                  <ServiceLogo id={s.id} className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                      {s.name}
                      <Badge tone={s.mode === 'live' ? 'gain' : 'neutral'}>{s.mode === 'live' ? 'جستجوی زنده' : 'لینک مستقیم'}</Badge>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{s.blurb}</p>
                  </div>
                  <a href={s.site} target="_blank" rel="noopener noreferrer" aria-label={`ورود به ${s.name}`} className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-accent">
                    <ExternalLink aria-hidden className="h-4 w-4" />
                  </a>
                </Surface>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
