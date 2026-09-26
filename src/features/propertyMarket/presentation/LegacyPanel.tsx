/** ============================================================
 * Property Market — داده‌های تاریخی ماژول قبلی (فقط‌خواندنی)
 *
 * ⚠️ ماژول «ثبت دستی قیمت/دارایی» از گردش‌کار حذف شده اما داده‌های
 *    ثبت‌شده کاربر حذف نمی‌شوند (§۱۶ مأموریت) — اینجا صرفاً نمایش است.
 *    ثبت جدید فقط از مسیر کلکشنر دیوار انجام می‌شود.
 * ============================================================ */
import { Surface } from '@/shared/components/ui/GlassCard';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { fmtTomanAmount, fmtUsdAmount, toFaDigits, fmtDateTime } from '@/shared/utils/formatters';
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
  if (assets.length === 0) return null;
  return (
    <Surface className="px-4 md:px-5">
      <Disclosure summary={`دارایی‌های ماژول قبلی (فقط‌خواندنی — ${toFaDigits(assets.length)} مورد)`}>
        <p className="mb-3 text-xs leading-5 text-muted">
          ثبت دارایی جدید در این ماژول غیرفعال است؛ داده‌های قبلی برای حفظ تاریخچه نگه داشته شده‌اند و ارزش دلاری آن‌ها با نرخ
          ثبت‌شده در زمان خودشان نمایش داده می‌شود.
        </p>
        <ul className="divide-y divide-divider">
          {assets.map((a) => {
            const profitUsd = a.currentValueUsd - a.purchasePriceUsd;
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {TYPE_FA[a.propertyType] ?? a.propertyType} · {LEGACY_NB_NAME[a.neighborhoodId] ?? a.neighborhoodId}
                  </span>
                  <span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span>
                </div>
                <KeyValueList
                  dense
                  rows={[
                    { label: 'خرید', value: <span>{fmtTomanAmount(a.purchasePriceToman)} <span className="num-ltr text-muted">({fmtUsdAmount(a.purchasePriceUsd)})</span></span> },
                    { label: 'ارزش فعلی', value: <span>{fmtTomanAmount(a.currentValueToman)} <span className="num-ltr text-muted">({fmtUsdAmount(a.currentValueUsd)})</span></span> },
                    { label: 'سود دلاری', value: <MoneyValue value={Math.round(profitUsd)} signed tone="auto" /> }
                  ]}
                />
              </li>
            );
          })}
        </ul>
      </Disclosure>
    </Surface>
  );
}
