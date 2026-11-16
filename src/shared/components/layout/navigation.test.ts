import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, NAV_GROUPS, PRIMARY_MOBILE, navItemForPath } from './navigation';
import { FUNDING_TABS, isSectionTabActive, VENUE_TABS } from './SectionTabs';

describe('منو پس از ساده‌سازی (آبان ۱۴۰۵)', () => {
  it('ترتیب گروه‌ها: دارایی من، معامله، ابزارها، بازارها، بازار ایران، خرید، تنظیمات', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['دارایی من', 'معامله', 'ابزارها', 'بازارها', 'بازار ایران', 'خرید', 'تنظیمات و اتصال‌ها']);
    expect(NAV_GROUPS.find((g) => g.id === 'trade')!.items.map((i) => i.id)).toEqual(['desk', 'funding', 'journal', 'venues']);
  });

  it('۱۶ آیتم اصلی + ۳ تنظیم در انتهای منو، بدون تکرار؛ سیستم طراحی فقط در جست‌وجو', () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(NAV_GROUPS.filter((g) => g.id !== 'settings').flatMap((g) => g.items)).toHaveLength(16);
    expect(NAV_GROUPS.find((g) => g.id === 'settings')!.items.map((i) => i.id)).toEqual(['wallets', 'alerts', 'security']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('design-system');
    expect(ALL_NAV_ITEMS.some((i) => i.id === 'design-system')).toBe(true);
  });

  it('هیچ صفحه‌ای بی‌صاحب نمانده: هر مسیر قبلی هنوز یک آیتم منو را فعال می‌کند', () => {
    const expected: Record<string, string> = {
      '/': 'market', '/market-performance': 'market', '/defi': 'defi',
      '/desk': 'desk', '/intel': 'desk', '/traders': 'desk',
      '/funding': 'funding', '/boros': 'funding', '/carry-lab': 'funding',
      '/journal': 'journal',
      '/lighter': 'venues', '/lighter-robinhood': 'venues', '/arcus': 'venues', '/txflow': 'venues', '/variational': 'venues', '/ondo-perps': 'venues',
      '/dashboard': 'dashboard', '/holdings': 'dashboard', '/performance': 'performance', '/assistant': 'assistant',
      '/calculators': 'calculators', '/simulation': 'simulation', '/simulation/compare': 'simulation',
      '/gold': 'gold', '/exchanges': 'exchanges', '/vehicle': 'vehicle', '/realestate': 'realestate', '/property-market': 'realestate',
      '/shopping': 'shopping', '/digikala': 'shopping', '/wallets': 'wallets', '/alerts': 'alerts', '/security': 'security'
    };
    for (const [path, id] of Object.entries(expected)) expect(navItemForPath(path)?.id, path).toBe(id);
  });

  it('نوار پایین موبایل: داشبورد، میز معامله، درآمد فاندینگ، بازار', () => {
    expect(PRIMARY_MOBILE.map((i) => i.id)).toEqual(['dashboard', 'desk', 'funding', 'market']);
  });

  it('نوار بخش‌ها: گزینهٔ فعال با مسیر و tab', () => {
    const at = (path: string, search = '') => FUNDING_TABS.filter((t) => isSectionTabActive(t, path, search, FUNDING_TABS)).map((t) => t.to);
    expect(at('/funding')).toEqual(['/funding']);
    expect(at('/funding', '?view=arb')).toEqual(['/funding']);
    expect(at('/funding', '?tab=run&pv=lighter,arcus')).toEqual(['/funding?tab=run']);
    expect(at('/boros')).toEqual(['/boros']);
    expect(VENUE_TABS.filter((t) => isSectionTabActive(t, '/lighter-robinhood', '', VENUE_TABS)).map((t) => t.to)).toEqual(['/lighter-robinhood']);
  });
});
