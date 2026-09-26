/**
 * هویت بصری برند «دارینو» (DARINO)
 * شعار: مدیریت هوشمند دارایی شخصی
 *
 * نماد «ستون‌های رشد» (Growth D):
 *  - دو ستون صعودی + کاسهٔ نیم‌دایره = حرف D (دارینو) و نمودار رشد، هم‌زمان
 *  - کاشی آبی برند (brand-500 → brand-700) — همان رنگ اکشن اصلی اپ
 *  - فقط سه شکل ساده: در ۱۶px (favicon) هم خوانا می‌ماند
 * ژئومتری در scripts/generate-brand-icons.mjs و index.html (اسپلش) تکرار شده است؛
 * با تغییر این فایل، آن‌ها را هم به‌روز کنید.
 */
import { useId } from 'react';
import { cn } from '@/shared/lib/cn';

/** پالت برند دارینو — برابر توکن‌های brand در index.css */
export const DARINO_COLORS = {
  brand: '#2E5BFF',
  brandLight: '#3D6BFF',
  brandDeep: '#1837B0',
  ink: '#0E1530'
} as const;

/** ژئومتری نماد روی گرید 64×64 (مشترک با آیکون‌ها) */
export const DARINO_TILE_RADIUS = 16;
export const DARINO_BAR_SHORT = { x: 14, y: 37, width: 7, height: 12, rx: 2.5 };
export const DARINO_BAR_TALL = { x: 24, y: 27, width: 7, height: 22, rx: 2.5 };
export const DARINO_BOWL_PATH = 'M34 15 A17 17 0 0 1 34 49 Z';

function Glyph({ fill, mono }: { fill: string; mono: boolean }) {
  return (
    <>
      <rect {...DARINO_BAR_SHORT} fill={fill} opacity={mono ? 0.45 : 0.55} />
      <rect {...DARINO_BAR_TALL} fill={fill} opacity={mono ? 0.7 : 0.8} />
      <path d={DARINO_BOWL_PATH} fill={fill} />
    </>
  );
}

export function DarinoMark({
  size = 32,
  mono = false,
  className
}: {
  size?: number;
  /** تک‌رنگ (currentColor، بدون کاشی) — برای چاپ و سطوح رنگی */
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
      {mono ? (
        <Glyph fill="currentColor" mono />
      ) : (
        <>
          <defs>
            <linearGradient id={`dt-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={DARINO_COLORS.brandLight} />
              <stop offset="1" stopColor={DARINO_COLORS.brandDeep} />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx={DARINO_TILE_RADIUS} fill={`url(#dt-${gid})`} />
          <Glyph fill="#fff" mono={false} />
        </>
      )}
    </svg>
  );
}

/** وردمارک «دارینو» (Vazirmatn سنگین) — نسخه لاتین DARINO اختیاری */
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
      dir={latin ? 'ltr' : 'rtl'}
      className={cn(
        'font-extrabold leading-none',
        mono ? 'text-current' : 'text-ink',
        latin ? 'tracking-[0.24em]' : 'tracking-tight',
        className
      )}
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
          <DarinoWordmark latin={latin} mono={mono} className={latin ? 'text-sm' : 'text-lg'} />
          {showTagline && (
            <span className={cn('text-2xs font-semibold', mono ? 'text-current opacity-70' : 'text-muted')}>
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
      <DarinoMark size={56} className="animate-pulse-soft" />
      <div className="text-center">
        <p className="text-base font-extrabold text-ink">{label}</p>
        <p className="mt-1 text-xs font-semibold text-muted">مدیریت هوشمند دارایی شخصی</p>
      </div>
    </div>
  );
}
