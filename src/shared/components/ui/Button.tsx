import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-accent hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 active:scale-[0.98] disabled:opacity-50',
  outline:
    'border border-line/15 bg-card text-ink shadow-card hover:bg-surface-2 active:scale-[0.98] disabled:opacity-50',
  danger: 'bg-negative/8 text-negative border border-negative/20 hover:bg-negative/15'
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-xl'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-bold transition-all duration-150 select-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
