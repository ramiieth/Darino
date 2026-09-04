/** تست لوگوی اختصاصی کامودیتی‌ها — هر ۱۶ کالا باید آیکون اختصاصی داشته باشد */
import { describe, expect, it } from 'vitest';
import { isValidElement } from 'react';
import { COMMODITY_ICONS } from './AssetLogo';
import { TRADFI_SYMBOLS } from '@/features/simulation/domain/constants';

/** ۱۶ کامودیتی تعریف‌شده در دنیای عملکرد */
const COMMODITY_SYMBOLS = [
  'GLD', 'SLV', 'USO', 'UNG', 'CPER', 'DBA', 'PPLT', 'PALL',
  'WTI', 'BRENT', 'NG', 'COPPER', 'CORN', 'WHEAT', 'COFFEE', 'SUGAR'
];

describe('لوگوی اختصاصی کامودیتی‌ها', () => {
  it('هر ۱۶ کالا آیکون اختصاصی دارد (نه آواتار حرفی)', () => {
    for (const sym of COMMODITY_SYMBOLS) {
      expect(isValidElement(COMMODITY_ICONS[sym]), `${sym} باید آیکون اختصاصی داشته باشد`).toBe(true);
    }
  });

  it('همه نمادهای کامودیتی در دنیای عملکرد (TRADFI_SYMBOLS) هستند', () => {
    for (const sym of COMMODITY_SYMBOLS) {
      expect(TRADFI_SYMBOLS, `${sym} باید در TRADFI_SYMBOLS باشد`).toContain(sym);
    }
  });

  it('تعداد کل دارایی‌های سنتی ≥ ۷۳ (سهام + ETF + اوراق + کامودیتی + شاخص)', () => {
    expect(TRADFI_SYMBOLS.length).toBeGreaterThanOrEqual(73);
  });
});
