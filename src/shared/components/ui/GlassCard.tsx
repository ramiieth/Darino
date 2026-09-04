import { forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** شدت سطح */
  variant?: 'default' | 'strong' | 'soft';
  /** انیمیشن ورود (CSS سبک — بدون framer-motion) */
  animated?: boolean;
  delay?: number;
}

/**
 * کارت سطح — سطح آرام با حاشیه ظریف (بدون شیشه/سایه سنگین)
 * default: کارت سفید با سایه ملایم | strong: برجسته‌تر | soft: سطح پس‌زمینه
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', animated = false, delay = 0, style, ...props }, ref) => {
    const base = cn(
      'rounded-2xl',
      variant === 'strong' && 'glass-strong',
      variant === 'soft' && 'glass-soft',
      variant === 'default' && 'glass'
    );
    return (
      <div
        ref={ref}
        className={cn(base, animated && 'anim-fade-up', className)}
        style={animated && delay ? { ...style, animationDelay: `${delay}ms` } : style}
        {...props}
      />
    );
  }
);
GlassCard.displayName = 'GlassCard';
