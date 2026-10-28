/**
 * Navigation — single source of truth for every destination.
 * Sidebar (≥ lg), NavRail (md–lg), BottomNav (< md), the "More" sheet,
 * the top bar title and the command palette all read from here.
 *
 * Grouping follows user goals, not data providers:
 *   بازارها      what the global market is doing (home route `/`)
 *   بازار ایران  Iranian gold, cars and real estate
 *   معامله       decide before a trade (desk), then the venues: Boros, Arcus, Lighter, Ondo Perps
 *   دارایی من    what I own, its record, alerts and security
 *   ابزارها      what-if tools
 *   خرید         Iranian shops, food, travel, doctors (read-only)
 */
import { Activity, Bell, BookOpenCheck, Boxes, Calculator, CandlestickChart, Car, Coins, Home, LayoutDashboard, LineChart, Palette, Radar, ShieldCheck, ShoppingBag, Sparkles, Telescope, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  /** Header title when different from label */
  title?: string;
  description: string;
  icon: LucideIcon;
  /** exact match for NavLink */
  end?: boolean;
  /** Shown in the mobile bottom bar */
  primary?: boolean;
  /** Additional path prefixes that activate this item */
  match?: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'markets',
    label: 'بازارها',
    items: [
      {
        id: 'market',
        to: '/',
        label: 'بازار',
        title: 'بازارها',
        description: 'رمزارز، دارایی توکن‌ایز و بازار سنتی',
        icon: CandlestickChart,
        end: true,
        primary: true,
        match: ['/market']
      },
      { id: 'market-performance', to: '/market-performance', label: 'بازده بازار', description: 'بازده بازار در ۱، ۷، ۳۰، ۶۰ و ۹۰ روز گذشته', icon: Activity },
      { id: 'defi', to: '/defi', label: 'دیفای', description: 'جریان سرمایه، ارزش قفل‌شده و استیبل‌کوین‌ها', icon: Boxes }
    ]
  },
  {
    id: 'iran',
    label: 'بازار ایران',
    items: [
      {
        id: 'gold',
        to: '/gold',
        label: 'طلای ایران',
        description: 'طلای ۱۸ عیار و سکه در چهار پلتفرم و بازار، و حباب نسبت به انس و دلار آزاد',
        icon: Coins
      },
      {
        id: 'vehicle',
        to: '/vehicle',
        label: 'خودرو',
        title: 'بازار خودرو',
        description: 'قیمت روز و رشد خودروهای داخلی، مونتاژی و وارداتی',
        icon: Car
      },
      {
        id: 'realestate',
        to: '/realestate',
        label: 'بازار املاک',
        title: 'بازار املاک اهواز',
        description: 'قیمت، محله‌ها و سناریوی دلاری',
        icon: Home,
        match: ['/property-market']
      }
    ]
  },
  {
    id: 'trade',
    label: 'معامله',
    items: [
      {
        id: 'desk',
        to: '/desk',
        label: 'میز معامله',
        description: 'چک قبل از ورود، سوینگ، تریدرهای برتر، پوزیشن‌ها، مشتقات، میم‌کوین و امنیت توکن',
        icon: Telescope,
        primary: true,
        match: ['/intel', '/traders']
      },
      {
        id: 'journal',
        to: '/journal',
        label: 'ژورنال معاملاتی',
        description: 'برنامهٔ قبل از معامله، حسابرسی خودکار، تگ «چرا»، مرور هفتگی و دفتر دلتا نوترال',
        icon: BookOpenCheck
      },
      {
        id: 'boros',
        to: '/boros',
        label: 'بوروس',
        title: 'تحلیل بوروس',
        description: 'بازارهای نرخ تأمین مالی',
        icon: Radar
      },
      {
        id: 'arcus',
        to: '/arcus',
        label: 'آرکوس',
        title: 'آرکوس — پرپچوال و اسپات',
        description: 'موجودی، پوزیشن‌ها و تاریخچه (فقط‌خواندنی)',
        icon: Activity
      },
      { id: 'lighter', to: '/lighter', label: 'لایتر', description: 'پرپچوال، اسپات، دارایی‌ها و رابین‌هود', icon: Activity },
      { id: 'txflow', to: '/txflow', label: 'تی‌اکس‌فلو', description: 'موجودی، سود/زیان، پوزیشن‌ها و بازارهای تی‌اکس‌فلو', icon: Activity },
      { id: 'ondo-perps', to: '/ondo-perps', label: 'اوندو پرپس', description: 'بازارهای قرارداد دائمی Ondo', icon: Activity }
    ]
  },
  {
    id: 'mine',
    label: 'دارایی من',
    items: [
      {
        id: 'dashboard',
        to: '/dashboard',
        label: 'داشبورد',
        description: 'ارزش خالص، تخصیص و تغییرات امروز',
        icon: LayoutDashboard,
        primary: true
      },
      { id: 'wallets', to: '/wallets', label: 'کیف پول‌ها', title: 'مدیریت کیف پول‌ها', description: 'آدرس‌ها و حساب‌های متصل', icon: Wallet },
      { id: 'assistant', to: '/assistant', label: 'دستیار پرتفولیو', description: 'تحلیل پرتفولیو، بوروس و بازارهای دارینو', icon: Sparkles },
      { id: 'alerts', to: '/alerts', label: 'اعلان‌ها', description: 'برعکس شدن اسپرد فاندینگ و نزدیک لیکویید، حتی وقتی اپ بسته است', icon: Bell },
      {
        id: 'security',
        to: '/security',
        label: 'امنیت',
        title: 'امنیت و دستگاه‌ها',
        description: 'کلید عبور، نشست‌های دستگاه‌ها و خروج',
        icon: ShieldCheck
      }
    ]
  },
  {
    id: 'tools',
    label: 'ابزارها',
    items: [
      {
        id: 'calculators',
        to: '/calculators',
        label: 'ماشین‌حساب',
        title: 'ماشین‌حساب سرمایه‌گذاری',
        description: 'سود و زیان، خرید دوره‌ای، رشد سالانه و بازده واقعی',
        icon: Calculator
      },
      {
        id: 'simulation',
        to: '/simulation',
        label: 'شبیه‌سازی',
        title: 'شبیه‌سازی سرمایه‌گذاری',
        description: 'سناریوهای «اگر سرمایه‌گذاری کرده بودم»',
        icon: LineChart
      }
    ]
  },
  {
    id: 'shopping',
    label: 'خرید',
    items: [
      {
        id: 'shopping',
        to: '/shopping',
        label: 'دستیار خرید',
        title: 'دستیار و راهنمای خرید',
        description: 'کالا، غذا، سفر، پزشک و کتاب از چند سایت ایرانی — مقایسه و پیشنهاد برتر',
        icon: ShoppingBag,
        match: ['/digikala']
      }
    ]
  }
];

/** Utility destination (footer of the sidebar / end of "More") */
export const DESIGN_SYSTEM_ITEM: NavItem = {
  id: 'design-system',
  to: '/design-system',
  label: 'سیستم طراحی',
  description: 'اجزا، توکن‌ها و الگوهای دارینو',
  icon: Palette
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), DESIGN_SYSTEM_ITEM];

/** Bottom bar order — home first, then the portfolio, the trading desk and wallets */
export const PRIMARY_MOBILE: NavItem[] = ['market', 'dashboard', 'desk', 'wallets']
  .map((id) => ALL_NAV_ITEMS.find((i) => i.id === id))
  .filter((i): i is NavItem => !!i);

export const SECONDARY_MOBILE: NavItem[] = ALL_NAV_ITEMS.filter((i) => !i.primary);

/** Resolve the active destination for a pathname */
export function navItemForPath(pathname: string): NavItem | undefined {
  const p = pathname || '/';
  if (p === '/') return ALL_NAV_ITEMS.find((i) => i.id === 'market');
  let best: NavItem | undefined;
  let bestLen = 0;
  for (const item of ALL_NAV_ITEMS) {
    for (const prefix of [item.to, ...(item.match ?? [])]) {
      if (prefix === '/') continue;
      if ((p === prefix || p.startsWith(prefix + '/')) && prefix.length > bestLen) {
        best = item;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  return navItemForPath(pathname)?.id === item.id;
}
