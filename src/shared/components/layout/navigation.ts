/**
 * Navigation — single source of truth for every destination.
 * Sidebar (≥ lg), NavRail (md–lg), BottomNav (< md), the "More" sheet,
 * the top bar title and the command palette all read from here.
 *
 * Grouping follows user goals, not data providers (most-used first):
 *   دارایی من        what I own and how it performed (dashboard incl. per-network view, performance, assistant)
 *   معامله           decide (desk), earn funding (one hub: opportunities → execute → ledger, Boros, backtest),
 *                    journal, and one entry for all exchange accounts
 *   ابزارها          calculators and "what if I had bought"
 *   بازارها          global market prices and returns, DeFi
 *   بازار ایران      Iranian gold, crypto exchanges, cars and real estate
 *   خرید             Iranian shops, food, travel, doctors (read-only)
 *   تنظیمات و اتصال‌ها wallets, alerts and security (setup, not daily destinations)
 * Pages inside one section share a SectionTabs bar; old URLs keep working.
 */
import { ArrowLeftRight, Bell, BookOpenCheck, Boxes, Calculator, CandlestickChart, Car, Coins, Home, Landmark, LayoutDashboard, LineChart, Palette, Percent, ShieldCheck, ShoppingBag, Sparkles, Telescope, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';

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
    id: 'mine',
    label: 'دارایی من',
    items: [
      {
        id: 'dashboard',
        to: '/dashboard',
        label: 'داشبورد',
        description: 'ارزش خالص، تخصیص، تغییرات امروز و دارایی‌ها به تفکیک شبکه',
        icon: LayoutDashboard,
        primary: true,
        match: ['/holdings']
      },
      {
        id: 'performance',
        to: '/performance',
        label: 'عملکرد سرمایه',
        title: 'عملکرد و مقایسه سرمایه',
        description: 'تاریخچهٔ ارزش دارایی، مقایسه با تورم، طلا، مسکن، خودرو و بازارهای جهانی، و گزارش Gemini',
        icon: TrendingUp
      },
      { id: 'assistant', to: '/assistant', label: 'دستیار پرتفولیو', description: 'تحلیل پرتفولیو، بوروس و بازارهای دارینو', icon: Sparkles }
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
        description: 'چک قبل از ورود، سوینگ، تریدرهای برتر، بازار مشتقات و میم‌کوین',
        icon: Telescope,
        primary: true,
        match: ['/intel', '/traders']
      },
      {
        id: 'funding',
        to: '/funding',
        label: 'درآمد فاندینگ',
        title: 'درآمد فاندینگ (دلتا نوترال)',
        description: 'فرصت‌ها، سود خالص، اجرا و پایش جفت‌ها، دفتر جفت‌ها، نرخ ثابت بوروس، بک‌تست و بات کاغذی',
        icon: Percent,
        primary: true,
        match: ['/boros', '/carry-lab']
      },
      {
        id: 'journal',
        to: '/journal',
        label: 'ژورنال معاملاتی',
        description: 'حسابرسی خودکار، معاملات پرپ و اسپات، برنامهٔ قبل از معامله و مرور هفتگی',
        icon: BookOpenCheck
      },
      {
        id: 'venues',
        to: '/venues',
        label: 'حساب‌های صرافی',
        description: 'موجودی، پوزیشن‌ها و تاریخچهٔ لایتر، رابین‌هود، آرکوس، تی‌اکس‌فلو و اوندو (فقط‌خواندنی)',
        icon: Landmark,
        match: ['/lighter', '/lighter-robinhood', '/arcus', '/txflow', '/ondo-perps']
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
        description: 'سود و زیان، خرید دوره‌ای، رشد سالانه، بازده واقعی، پوشش ریسک، آپشن، پرپ و کسب‌وکار',
        icon: Calculator
      },
      {
        id: 'simulation',
        to: '/simulation',
        label: 'اگر خریده بودم',
        title: 'اگر خریده بودم (شبیه‌سازی)',
        description: 'سناریوی «اگر سرمایه‌گذاری کرده بودم» و مقایسهٔ سرمایهٔ یکسان در چند دارایی',
        icon: LineChart
      }
    ]
  },
  {
    id: 'markets',
    label: 'بازارها',
    items: [
      {
        id: 'market',
        to: '/',
        label: 'بازار',
        title: 'بازارها',
        description: 'قیمت رمزارز، دارایی توکن‌ایز و بازار سنتی، و بازده ۱ تا ۹۰ روز گذشته',
        icon: CandlestickChart,
        end: true,
        primary: true,
        match: ['/market', '/market-performance']
      },
      { id: 'defi', to: '/defi', label: 'دیفای', description: 'جریان سرمایه، ارزش قفل‌شده، استیبل‌کوین‌ها و درآمد استیبل', icon: Boxes }
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
        id: 'exchanges',
        to: '/exchanges',
        label: 'صرافی‌های ایران',
        description: 'تتر و بیت‌کوین کجا ارزان‌تر است: بهترین خرید و فروش و اسپرد در ۱۱ صرافی',
        icon: ArrowLeftRight
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
  },
  {
    id: 'settings',
    label: 'تنظیمات و اتصال‌ها',
    items: [
      { id: 'wallets', to: '/wallets', label: 'کیف پول‌ها', title: 'مدیریت کیف پول‌ها', description: 'آدرس‌ها و حساب‌های متصل', icon: Wallet },
      { id: 'alerts', to: '/alerts', label: 'اعلان‌ها', description: 'برعکس شدن اسپرد فاندینگ و نزدیک لیکویید، حتی وقتی اپ بسته است', icon: Bell },
      {
        id: 'security',
        to: '/security',
        label: 'امنیت',
        title: 'امنیت و دستگاه‌ها',
        description: 'ورود، نشست‌های دستگاه‌ها و خروج',
        icon: ShieldCheck
      }
    ]
  }
];

/** Developer page — reachable by URL and the command palette only, not in the user menu */
export const DESIGN_SYSTEM_ITEM: NavItem = {
  id: 'design-system',
  to: '/design-system',
  label: 'سیستم طراحی',
  description: 'اجزا، توکن‌ها و الگوهای دارینو',
  icon: Palette
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), DESIGN_SYSTEM_ITEM];

/** Bottom bar order — same priority as the menu: portfolio, trading desk, funding income, markets */
export const PRIMARY_MOBILE: NavItem[] = ['dashboard', 'desk', 'funding', 'market']
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
