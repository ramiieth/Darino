/**
 * فیلد تاریخ هوشمند مشترک — پیش‌نمایش دوگانه شمسی/میلادی
 *
 * ⚠️ همه فرم‌های دارای فیلد تاریخ باید از همین کامپوننت استفاده کنند.
 * - ورودی شمسی (متن، ارقام فارسی یا لاتین) + ورودی میلادی (تقویم مرورگر)
 * - هر تغییر در یکی → دیگری خودکار محاسبه و نمایش داده می‌شود (موتور مشترک jalali.ts)
 * - خروجی همیشه timestamp (میلی‌ثانیه، ساعت ۱۲ محلی)
 */
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/shared/components/ui/Input';
import {
  formatJalali,
  formatGregorianIso,
  parseJalaliToTs,
  parseIsoToTs,
  tsToJalaali,
  tsToGregorian
} from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

export function SmartDateField({
  value,
  onChange,
  label,
  className,
  compact = false
}: {
  /** timestamp (میلی‌ثانیه) یا null */
  value: number | null;
  onChange: (ts: number | null) => void;
  label?: string;
  className?: string;
  /** حالت فشرده: بدون پیش‌نمایش و راهنما (برای ردیف‌های جدولی) */
  compact?: boolean;
}) {
  const [jText, setJText] = useState('');
  const [gIso, setGIso] = useState('');
  const [invalid, setInvalid] = useState(false);

  // همگام‌سازی از بیرون (تغییر value)
  useEffect(() => {
    if (value === null) {
      setJText('');
      setGIso('');
      setInvalid(false);
      return;
    }
    const j = tsToJalaali(value);
    setJText(`${j.year}/${String(j.month).padStart(2, '0')}/${String(j.day).padStart(2, '0')}`);
    setGIso(formatGregorianIso(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** تغییر ورودی شمسی → محاسبه میلادی + خروجی */
  const onJChange = (text: string) => {
    setJText(text);
    setInvalid(false);
    if (!text.trim()) {
      setGIso('');
      onChange(null);
      return;
    }
    const ts = parseJalaliToTs(text);
    if (ts === null) {
      setInvalid(true);
      setGIso('');
      return;
    }
    setGIso(formatGregorianIso(ts));
    onChange(ts);
  };

  /** تغییر تقویم میلادی → محاسبه شمسی + خروجی */
  const onGChange = (iso: string) => {
    setGIso(iso);
    setInvalid(false);
    if (!iso) {
      setJText('');
      onChange(null);
      return;
    }
    const ts = parseIsoToTs(iso);
    if (ts === null) return;
    const j = tsToJalaali(ts);
    setJText(`${j.year}/${String(j.month).padStart(2, '0')}/${String(j.day).padStart(2, '0')}`);
    onChange(ts);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <span className="block text-[11px] font-bold text-muted">{label}</span>}
      <div className="grid grid-cols-2 gap-2">
        {/* شمسی */}
        <div>
          <Input
            dir="ltr"
            inputMode="numeric"
            value={jText}
            onChange={(e) => onJChange(e.target.value)}
            placeholder="1404/05/17"
            aria-label="تاریخ شمسی"
            className={cn(
              'h-10 text-xs text-start',
              invalid && 'ring-2 ring-negative/50 focus:ring-negative/50'
            )}
          />
        </div>
        {/* میلادی */}
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            type="date"
            dir="ltr"
            value={gIso}
            onChange={(e) => onGChange(e.target.value)}
            aria-label="تاریخ میلادی"
            className="h-10 px-2 ps-8 text-xs text-start"
          />
        </div>
      </div>
      {!compact && value !== null && !invalid && (
        <p className="text-[9px] font-medium text-muted/80">
          {formatJalali(value)} شمسی · {formatGregorianIso(value)} میلادی
        </p>
      )}
      {!compact && invalid && (
        <p className="text-[9px] font-bold text-negative">تاریخ شمسی نامعتبر است — مثال: 1404/05/17</p>
      )}
      {!compact && (
        <p className="text-[9px] font-medium text-muted/60">
          ورودی شمسی یا میلادی — دیگری خودکار محاسبه می‌شود
        </p>
      )}
    </div>
  );
}
