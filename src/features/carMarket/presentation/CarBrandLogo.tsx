/** ============================================================
 * لوگوی گرد برند خودرو — فقط فایل محلی public/logos/cars (هرگز URL منبع)
 *  پس‌زمینه سفید تا لوگوهای رنگی/تیره در حالت تیره هم دیده شوند؛
 *  نبود/خطای تصویر → آواتار حرفی هم‌اندازه.
 * ============================================================ */
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { brandLogo } from '../domain/brands';

export function CarBrandLogo({ brand, label, size = 32, className }: { brand: string; label: string; size?: number; className?: string }) {
  const src = brandLogo(brand);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    const letters = label.replace(/[^A-Za-z0-9؀-ۿ]/g, '').slice(0, 2) || '?';
    return (
      <span
        role="img"
        aria-label={label}
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold text-muted', className)}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34) }}
      >
        {letters}
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5', className)}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={label}
        title={label}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="object-contain"
        style={{ width: size * 0.78, height: size * 0.78 }}
      />
    </span>
  );
}
