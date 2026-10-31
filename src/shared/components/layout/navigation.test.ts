import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, NAV_GROUPS, PRIMARY_MOBILE, navItemForPath } from './navigation';

describe('منو پس از بازچینی گروه‌ها', () => {
  it('هیچ بخشی حذف نشده (۱۸ بخش قبلی + طلای ایران)', () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    for (const id of [
      'market', 'defi', 'desk', 'dashboard', 'wallets', 'assistant', 'arcus', 'lighter', 'ondo-perps', 'security', 'alerts',
      'boros', 'market-performance', 'calculators', 'simulation', 'vehicle', 'realestate', 'shopping', 'gold', 'exchanges', 'journal', 'txflow'
    ]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('گروه‌ها: بازارها، بازار ایران، معامله، دارایی من، ابزارها، خرید', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['بازارها', 'بازار ایران', 'معامله', 'دارایی من', 'ابزارها', 'خرید']);
    expect(NAV_GROUPS.find((g) => g.id === 'trade')!.items.map((i) => i.id)).toEqual(['desk', 'journal', 'boros', 'arcus', 'lighter', 'txflow', 'ondo-perps']);
  });

  it('نشانی‌های قبلی میز معامله همان بخش را فعال می‌کنند', () => {
    expect(navItemForPath('/intel')?.id).toBe('desk');
    expect(navItemForPath('/traders')?.id).toBe('desk');
    expect(navItemForPath('/desk')?.label).toBe('میز معامله');
    expect(navItemForPath('/gold')?.id).toBe('gold');
    expect(navItemForPath('/exchanges')?.id).toBe('exchanges');
  });

  it('نوار پایین موبایل: بازار، داشبورد، میز معامله، کیف پول‌ها', () => {
    expect(PRIMARY_MOBILE.map((i) => i.id)).toEqual(['market', 'dashboard', 'desk', 'wallets']);
    expect(ALL_NAV_ITEMS.find((i) => i.id === 'defi')?.primary).toBeFalsy();
  });
});
