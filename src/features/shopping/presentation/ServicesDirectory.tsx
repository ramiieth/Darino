/** فهرست همهٔ سرویس‌ها به تفکیک دسته — وضعیت اتصال شفاف است */
import { ExternalLink, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { CATEGORY_LABELS, SERVICES } from '../domain/services';
import type { ServiceCategory } from '../domain/types';
import { ServiceLogo } from './ServiceLogo';

const ORDER: ServiceCategory[] = ['shopping', 'food', 'travel', 'health', 'books', 'beauty', 'payment'];

export function ServicesDirectory() {
  const [, setParams] = useSearchParams();
  const ask = (q: string) => setParams({ q }, { replace: false });
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
                <Surface className="flex h-full items-start gap-3 p-3">
                  <ServiceLogo id={s.id} className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                      {s.name}
                      <Badge tone={s.mode === 'live' ? 'gain' : 'neutral'}>{s.mode === 'live' ? 'جستجوی زنده' : 'لینک مستقیم'}</Badge>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{s.blurb}</p>
                    {s.mode === 'live' && s.examples.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`درخواست‌های نمونهٔ ${s.name}`}>
                        {s.examples.map((ex) => (
                          <li key={ex}>
                            <button type="button" onClick={() => ask(ex)} className="inline-flex items-center gap-1 rounded-full border border-divider px-2 py-0.5 text-[11px] text-muted transition hover:border-accent hover:text-accent">
                              <Sparkles aria-hidden className="h-3 w-3" />{ex}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
