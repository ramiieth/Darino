/**
 * Dashboard aside — "what needs attention" + "what can I do next".
 * Attention items are factual system states (stale prices, missing data,
 * upcoming maturities of watched markets) — never investment advice.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeftRight, Calculator, CircleCheck, Clock3, TriangleAlert } from 'lucide-react';
import { Section } from '@/shared/components/ui/GlassCard';
import { buttonClass } from '@/shared/components/ui/Button';



import { cn } from '@/shared/lib/cn';
import type { PortfolioOverview } from './usePortfolioOverview';

export function QuickActions({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      <Link to="/accounting?tab=trade" className={cn(buttonClass('primary', 'md'), 'col-span-3 sm:col-span-1')}>
        <ArrowLeftRight />
        خرید / فروش
      </Link>
      <Link to="/accounting?tab=deposit" className={cn(buttonClass('outline', 'md'), 'col-span-3 sm:col-span-1')}>
        <ArrowDownToLine />
        واریز
      </Link>
      <Link to="/calculators" className={cn(buttonClass('outline', 'md'), 'col-span-3 sm:col-span-1')}>
        <Calculator />
        ماشین‌حساب
      </Link>
    </div>
  );
}

interface Item {
  id: string;
  tone: 'warn' | 'info';
  icon: typeof Clock3;
  title: string;
  detail?: string;
  to?: string;
}

export function AttentionPanel({ o }: { o: PortfolioOverview }) {

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (o.state === 'ready' && o.stale) {
      out.push({
        id: 'stale',
        tone: 'warn',
        icon: Clock3,
        title: 'قیمت‌ها زنده نیستند',
        detail: 'ارزش‌ها با آخرین قیمت ذخیره‌شده محاسبه شده‌اند.'
      });
    }
    if (o.unpriced.length > 0) {
      out.push({
        id: 'unpriced',
        tone: 'warn',
        icon: TriangleAlert,
        title: `قیمت ${o.unpriced.join('، ')} در دسترس نیست`,
        detail: 'ارزش کل ناقص است.'
      });
    }
    return out;
  }, [o.state, o.stale, o.unpriced]);

  return (
    <Section id="attention" title="نیازمند توجه" headingLevel={2}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-field bg-gain/8 px-3.5 py-3 text-sm text-ink">
          <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-positive" />
          {o.state === 'loading' ? 'در حال بررسی…' : 'مورد خاصی نیست — داده‌ها به‌روز هستند.'}
        </p>
      ) : (
        <ul className="divide-y divide-divider">
          {items.map((it) => {
            const Icon = it.icon;
            const body = (
              <>
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    it.tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-accent-soft text-accent'
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{it.title}</span>
                  {it.detail && <span className="block text-xs text-muted">{it.detail}</span>}
                </span>
              </>
            );
            return (
              <li key={it.id}>
                {it.to ? (
                  <Link to={it.to} className="flex items-start gap-3 py-3 hover:opacity-80">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
