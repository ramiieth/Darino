/** ============================================================
 * AssetName — نمایش استاندارد «نام دارایی + Ticker»
 *
 *   [نام فارسی]   ← عنصر اصلی (RTL)
 *   [TICKER]      ← ثانویه، کوچک‌تر، ایزوله‌شده LTR
 *
 * ⚠️ فقط Presentation: Symbol واقعی هرگز تغییر نمی‌کند.
 *  - جهت بلوک از صفحه (RTL) ارث می‌برد → alignment یکنواخت
 *  - متن لاتین با <bdi dir="ltr"> ایزوله می‌شود → به‌هم‌ریختگی bidi ندارد
 *  - نام‌های طولانی truncate می‌شوند → ارتفاع ردیف‌ها ثابت می‌ماند
 * ============================================================ */
import { persianAssetName } from '@/shared/i18n/assetDisplayName';
import { cn } from '@/shared/lib/cn';

export function AssetName({
  symbol,
  fallbackName,
  meta,
  className,
  nameClassName,
  tickerClassName
}: {
  symbol: string;
  /** نام فعلی موجود در سیستم (اگر نگاشت فارسی نبود، همین حفظ می‌شود) */
  fallbackName?: string | null;
  /** برچسب کمکی اختیاری (مثلاً منبع داده) — هم‌خط با Ticker تا ارتفاع ثابت بماند */
  meta?: string;
  className?: string;
  nameClassName?: string;
  tickerClassName?: string;
}) {
  const name = persianAssetName(symbol, fallbackName);

  return (
    <div className={cn('min-w-0', className)}>
      <p
        title={name}
        className={cn(
          'truncate text-start text-sm font-semibold leading-5 text-ink',
          nameClassName
        )}
      >
        <bdi dir="rtl">{name}</bdi>
      </p>
      {meta && (
        <p
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-start text-2xs font-semibold leading-4 text-muted',
            tickerClassName
          )}
        >

          {meta && (
            <span className="shrink-0 truncate font-normal text-subtle">{meta}</span>
          )}
        </p>
      )}
    </div>
  );
}
