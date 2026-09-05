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
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
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
  const d = assetDisplayName(symbol, fallbackName);
  const sameAsTicker = d.name === d.ticker;

  return (
    <div className={cn('min-w-0', className)}>
      <p
        title={d.name}
        className={cn(
          'truncate text-start text-[12px] font-extrabold leading-tight text-ink',
          nameClassName
        )}
      >
        <bdi dir={d.rtl ? 'rtl' : 'ltr'}>{d.name}</bdi>
      </p>
      {(!sameAsTicker || meta) && (
        <p
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-start text-[9px] font-black leading-tight tracking-wide text-muted/70',
            tickerClassName
          )}
        >
          {!sameAsTicker && <bdi dir="ltr" className="truncate">{d.ticker}</bdi>}
          {meta && (
            <span className="shrink-0 truncate font-bold text-muted/50">{meta}</span>
          )}
        </p>
      )}
    </div>
  );
}
