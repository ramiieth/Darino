import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/** Product photo on a white plate (Digikala shots are white-background); placeholder on failure. */
export function ProductImage({ src, className, priority = false }: { src: string | null; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('relative flex items-center justify-center overflow-hidden rounded-field bg-white', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={300}
          height={300}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority={priority ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-2 mix-blend-multiply"
        />
      ) : (
        <ShoppingBag aria-hidden className="h-1/3 w-1/3 text-neutral-300" />
      )}
    </span>
  );
}
