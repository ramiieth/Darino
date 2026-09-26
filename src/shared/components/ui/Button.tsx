import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Button — one action system for the whole product.
 *
 *  primary     the single most important action in a view (never two side by side)
 *  secondary   tinted brand — important but not primary
 *  outline     neutral bordered — default for secondary actions
 *  ghost       low-emphasis, toolbar/inline actions
 *  destructive irreversible or corrective actions (e.g. reversal entry)
 *  inverse     on dark/brand surfaces
 *  link        inline textual action
 *
 * Heights: sm 32 · md 40 · lg 48 (touch devices get +4px on sm/md).
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'inverse'
  | 'link'
  /** @deprecated use `destructive` */
  | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps width, disables interaction */
  loading?: boolean;
  /** Icon rendered before the label (start side in RTL) */
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong active:bg-brand-700',
  secondary: 'bg-accent-soft text-accent hover:bg-brand-100',
  outline: 'border border-divider-strong bg-card text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  destructive: 'border border-negative/25 bg-card text-negative hover:bg-negative/8',
  danger: 'border border-negative/25 bg-card text-negative hover:bg-negative/8',
  inverse: 'bg-white text-ink hover:bg-white/90',
  link: 'h-auto px-0 text-accent underline-offset-4 hover:underline'
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-control px-3 text-xs coarse:h-9 [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-10 gap-2 rounded-field px-4 text-sm coarse:h-11',
  lg: 'h-12 gap-2 rounded-field px-5 text-base',
  icon: 'h-10 w-10 rounded-field coarse:h-11 coarse:w-11',
  'icon-sm': 'h-8 w-8 rounded-control coarse:h-9 coarse:w-9 [&_svg]:h-3.5 [&_svg]:w-3.5'
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold',
    'transition-colors duration-fast ease-standard',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
    variant !== 'link' && buttonSizes[size],
    variants[variant]
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', type = 'button', loading = false, icon, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass(variant, size), className)}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

/** Icon-only button — `aria-label` is mandatory */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'size' | 'icon'> & { 'aria-label': string; size?: 'sm' | 'md' }
>(({ size = 'md', variant = 'ghost', className, children, ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={size === 'sm' ? 'icon-sm' : 'icon'}
    title={props['aria-label']}
    className={cn(variant === 'ghost' && 'text-muted hover:text-ink', className)}
    {...props}
  >
    {children}
  </Button>
));
IconButton.displayName = 'IconButton';
