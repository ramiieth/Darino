import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { Search } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  withSearchIcon?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, withSearchIcon = false, ...props }, ref) => (
    <div className="relative">
      {withSearchIcon && (
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      )}
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-xl border border-line/15 bg-card px-4 text-sm font-medium text-ink shadow-card outline-none transition-all placeholder:text-muted/70',
          'hover:border-line/25 focus:border-accent/50 focus:ring-2 focus:ring-accent/20',
          withSearchIcon && 'ps-10',
          className
        )}
        {...props}
      />
    </div>
  )
);
Input.displayName = 'Input';
