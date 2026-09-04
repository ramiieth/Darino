/**
 * هویت بصری برند «دارینو» (DARINO)
 * شعار: مدیریت هوشمند دارایی شخصی
 *
 * نماد «گوهر صعود» (Ascending Gem):
 *  - شش‌ضلعی گرد = امنیت، فناوری و دارایی
 *  - فلش صعودی با پله = رشد، مدیریت و آینده مالی
 *  - گرادیان سرمه‌ای → زمردی = اعتماد + ثروت + رشد
 * قابل استفاده در Dark/Light/Monochrome و اندازه‌های بسیار کوچک.
 */
import { useId } from 'react';
import { cn } from '@/shared/lib/cn';

/** پالت برند دارینو (Single Source of Truth رنگ‌ها) */
export const DARINO_COLORS = {
  navy: '#0B2545',
  navyDeep: '#081A36',
  emerald: '#10B981',
  emeraldLight: '#34D399'
} as const;

/** ژئومتری نماد — شش‌ضلعی + فلش پله‌ای (مشترک با آیکون‌ها) */
export const DARINO_HEXAGON_PATH = 'M32 5 L55.5 20 V44 L32 59 L8.5 44 V20 Z';
export const DARINO_ARROW_PATH =
  'M32 12 L40 22 V24 H38 V44 H16 V38 H21 V31 H26 V24 H24 V22 Z';

export function DarinoMark({
  size = 32,
  mono = false,
  className
}: {
  size?: number;
  /** حالت تک‌رنگ (currentColor) برای Monochrome */
  mono?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/[:]/g, '');
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="دارینو"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={`dg-${gid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={mono ? 'currentColor' : DARINO_COLORS.navyDeep} />
          <stop offset="0.55" stopColor={mono ? 'currentColor' : DARINO_COLORS.navy} />
          <stop offset="1" stopColor={mono ? 'currentColor' : DARINO_COLORS.emerald} />
        </linearGradient>
      </defs>
      {/* شش‌ضلعی (قاب گوهر) */}
      <path
        d={DARINO_HEXAGON_PATH}
        fill="none"
        stroke={`url(#dg-${gid})`}
        strokeWidth={3.6}
        strokeLinejoin="round"
      />
      {/* فلش صعودی با پله */}
      <path d={DARINO_ARROW_PATH} fill={`url(#dg-${gid})`} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * وردمارک «دارینو» — تایپوگرافی مدرن/مینیمال (Vazirmatn سنگین)
 * نسخه ثانویه لاتین DARINO
 */
export function DarinoWordmark({
  className,
  latin = false,
  mono = false
}: {
  className?: string;
  latin?: boolean;
  mono?: boolean;
}) {
  return (
    <span
      dir="rtl"
      className={cn(
        'font-black leading-none',
        mono ? 'text-current' : 'text-ink',
        latin ? 'tracking-[0.28em]' : 'tracking-tight',
        className
      )}
      style={latin ? { fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800 } : undefined}
    >
      {latin ? 'DARINO' : 'دارینو'}
    </span>
  );
}

/** لوگوی کامل: نماد + وردمارک (+ شعار اختیاری) — چیدمان افقی */
export function DarinoLogo({
  size = 36,
  showWordmark = true,
  showTagline = false,
  mono = false,
  latin = false,
  className
}: {
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  mono?: boolean;
  latin?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <DarinoMark size={size} mono={mono} />
      {showWordmark && (
        <span className="flex flex-col justify-center gap-1 leading-none">
          <DarinoWordmark
            latin={latin}
            mono={mono}
            className={cn('text-[max(15px,calc(var(--size,36)*0.42))]', latin && 'text-[max(12px,calc(var(--size,36)*0.34))]')}
          />
          {showTagline && (
            <span
              className={cn(
                'text-[max(8px,calc(var(--size,36)*0.23))] font-bold',
                mono ? 'text-current opacity-70' : 'text-muted'
              )}
            >
              مدیریت هوشمند دارایی شخصی
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** اسپلش/لودینگ برند — برای صفحات lazy و شروع اپ */
export function BrandSplash({ label = 'دارینو' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <DarinoMark size={56} className="animate-pulse" />
      <div className="text-center">
        <p className="text-base font-black text-ink">{label}</p>
        <p className="mt-1 text-[11px] font-bold text-muted">مدیریت هوشمند دارایی شخصی</p>
      </div>
    </div>
  );
}
