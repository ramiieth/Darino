/** ============================================================
 * Property Market — داده‌های تاریخی ماژول قبلی (فقط‌خواندنی)
 *
 * ⚠️ ماژول «ثبت دستی قیمت/دارایی» از گردش‌کار حذف شده اما داده‌های
 *    ثبت‌شده کاربر حذف نمی‌شوند (§۱۶ مأموریت) — اینجا صرفاً نمایش است.
 *    ثبت جدید فقط از مسیر کلکشنر دیوار انجام می‌شود.
 * ============================================================ */
import { useState } from 'react';
import { Archive, ChevronDown } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { fmtTomanAmount, fmtUsdAmount, toFaDigits, fmtDateTime } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import type { LegacyRealAssetRow } from '../data/store';

/** نام محله‌های کاتالوگ قدیمی (برای نمایش — کاتالوگ قدیمی حذف شده) */
const LEGACY_NB_NAME: Record<string, string> = {
  'ahvaz-golestan': 'گلستان',
  'ahvaz-saadi': 'سعدی',
  'ahvaz-farhangshahr': 'فرهنگ شهر',
  'ahvaz-bagh-sheikh': 'باغ شیخ',
  'ahvaz-amanieh': 'امانیه',
  'ahvaz-kourosh': 'کوروش',
  'ahvaz-kompolo-north': 'کمپلو شمالی',
  'ahvaz-kianpars-east': 'کیان‌پارس شرقی',
  'ahvaz-kianpars-west': 'کیان پارس غربی',
  'ahvaz-shahrak-daneshgah': 'شهرک دانشگاه',
  'ahvaz-zeytoon-karmandi': 'زیتون کارمندی',
  'ahvaz-kianabad-east': 'کیان آباد شرقی',
  'ahvaz-kianabad-west': 'کیان آباد غربی',
  'ahvaz-padad': 'پاداد',
  'ahvaz-aryashahr': 'آریا شهر',
  'ahvaz-mehrshahr': 'مهر شهر'
};

const TYPE_FA: Record<string, string> = { apartment: 'آپارتمان', villa: 'ویلایی' };

export function LegacyPanel({ assets }: { assets: LegacyRealAssetRow[] }) {
  const [open, setOpen] = useState(false);
  if (assets.length === 0) return null;

  return (
    <GlassCard className="p-3.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-ink">
          <Archive className="h-3.5 w-3.5 text-muted" />
          دارایی‌های ثبت‌شده در ماژول قبلی (فقط‌خواندنی — {toFaDigits(assets.length)} مورد)
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg border border-line/10 bg-surface-2/40 px-2.5 py-1.5 text-[8px] font-medium leading-4 text-muted">
            ثبت دارایی جدید در این ماژول غیرفعال شده است؛ داده‌های قبلی برای حفظ تاریخچه نگه داشته
            شده‌اند و ارزش‌گذاری دلاری آن‌ها با نرخ ثبت‌شده در زمان خودشان (فریزشده) نمایش داده می‌شود.
          </p>
          {assets.map((a) => {
            const profitUsd = a.currentValueUsd - a.purchasePriceUsd;
            return (
              <div key={a.id} className="rounded-xl border border-line/10 bg-card px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[10px] font-extrabold text-ink">
                    {TYPE_FA[a.propertyType] ?? a.propertyType} · {LEGACY_NB_NAME[a.neighborhoodId] ?? a.neighborhoodId}
                  </span>
                  <span className="text-[8px] font-medium text-muted">{fmtDateTime(a.createdAt)}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-bold">
                  <span className="text-muted">
                    خرید: <span className="text-ink">{fmtTomanAmount(a.purchasePriceToman)}</span>{' '}
                    <span className="num-ltr text-muted">({fmtUsdAmount(a.purchasePriceUsd)})</span>
                  </span>
                  <span className="text-muted">
                    ارزش فعلی: <span className="text-ink">{fmtTomanAmount(a.currentValueToman)}</span>{' '}
                    <span className="num-ltr text-muted">({fmtUsdAmount(a.currentValueUsd)})</span>
                  </span>
                  <span className={cn('num-ltr', profitUsd >= 0 ? 'text-positive' : 'text-negative')}>
                    سود دلاری: {profitUsd >= 0 ? '+' : '−'}
                    {fmtUsdAmount(Math.abs(profitUsd))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
