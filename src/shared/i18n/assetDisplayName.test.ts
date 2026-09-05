import { describe, it, expect } from 'vitest';
import { assetDisplayName, hasAssetNameFa, assetSearchText, ASSET_NAME_FA } from './assetDisplayName';

describe('assetDisplayName — نام نمایشی دارایی', () => {
  it('نمادهای شناخته‌شده نام فارسی می‌گیرند و Ticker حفظ می‌شود', () => {
    const cases: Array<[string, string]> = [
      ['BTC', 'بیت‌کوین'],
      ['ETH', 'اتریوم'],
      ['SOL', 'سولانا'],
      ['BNB', 'بایننس کوین'],
      ['XRP', 'ریپل'],
      ['USDT', 'تتر'],
      ['USDC', 'یو‌اس‌دی‌سی'],
      ['XAUT', 'تتر گلد']
    ];
    for (const [sym, fa] of cases) {
      const d = assetDisplayName(sym);
      expect(d.name).toBe(fa);
      expect(d.ticker).toBe(sym); // Symbol واقعی تغییر نمی‌کند
      expect(d.mapped).toBe(true);
      expect(d.rtl).toBe(true);
    }
  });

  it('نماد کوچک/بزرگ فرقی ندارد اما Ticker دست‌نخورده برمی‌گردد', () => {
    const d = assetDisplayName('btc');
    expect(d.name).toBe('بیت‌کوین');
    expect(d.ticker).toBe('btc');
  });

  it('نماد ناشناخته حدس زده نمی‌شود', () => {
    const d = assetDisplayName('XYZ');
    expect(d.name).toBe('XYZ');
    expect(d.ticker).toBe('XYZ');
    expect(d.mapped).toBe(false);
    expect(d.rtl).toBe(false);
  });

  it('در نبود نگاشت، نام فعلی سیستم حفظ می‌شود', () => {
    const d = assetDisplayName('TSLAX', 'تسلا (توکن‌ایز)');
    expect(d.name).toBe('تسلا (توکن‌ایز)');
    expect(d.ticker).toBe('TSLAX');
    expect(d.mapped).toBe(false);
    expect(d.rtl).toBe(true);
    const e = assetDisplayName('NVDA', 'NVIDIA Corporation');
    expect(e.name).toBe('NVIDIA Corporation');
    expect(e.rtl).toBe(false);
  });

  it('نگاشت بر نام فعلی اولویت دارد', () => {
    expect(assetDisplayName('BTC', 'Bitcoin').name).toBe('بیت‌کوین');
  });

  it('hasAssetNameFa و جستجو', () => {
    expect(hasAssetNameFa('ETH')).toBe(true);
    expect(hasAssetNameFa('XYZ')).toBe(false);
    expect(assetSearchText('BTC')).toContain('بیت‌کوین');
    expect(assetSearchText('BTC')).toContain('btc');
  });

  it('هیچ نگاشتی خالی یا برابر خود نماد نیست', () => {
    for (const [sym, fa] of Object.entries(ASSET_NAME_FA)) {
      expect(fa.trim().length).toBeGreaterThan(0);
      expect(fa).not.toBe(sym);
    }
  });
});
