/**
 * لوگوی اختصاصی، رنگ‌بندی‌شده و قابل‌استفاده در تمام بخش‌های بازار ایران و میز تحلیل هوشمند
 * برای هر نماد (حتی نمادهای زندهٔ خارج از کاتالوگ اولیه) رنگ و نشان اختصاصی و پایدار تولید می‌کند.
 */
import {
  Building2,
  Coins,
  Cpu,
  Factory,
  Flame,
  Landmark,
  Leaf,
  PiggyBank,
  Pill,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { IRAN_MARKET_CATALOG, type IranFundSubtype, type IranMarketInstrument, type IranMarketSegment } from '../data/iranMarketCatalog';

export interface IranLogoInput {
  symbol: string;
  nameFa?: string;
  sectorFa?: string;
  segment?: IranMarketSegment;
  fundSubtype?: IranFundSubtype;
  managerFa?: string;
}

const CATALOG_BY_SYMBOL = new Map<string, IranMarketInstrument>(
  IRAN_MARKET_CATALOG.map((item) => [item.symbol, item])
);

const FALLBACK_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-teal-500 to-emerald-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-emerald-500 to-teal-700',
  'from-indigo-500 to-blue-700',
  'from-fuchsia-500 to-purple-700',
  'from-cyan-500 to-sky-700'
] as const;

function hashSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function resolveIranLogoMeta(input: IranLogoInput) {
  const catalogMatch = CATALOG_BY_SYMBOL.get(input.symbol);
  const symbol = input.symbol;
  const nameFa = input.nameFa ?? catalogMatch?.nameFa ?? '';
  const sectorFa = input.sectorFa ?? catalogMatch?.sectorFa ?? '';
  const segment = input.segment ?? catalogMatch?.segment;
  const fundSubtype = input.fundSubtype ?? catalogMatch?.fundSubtype;
  const managerFa = input.managerFa ?? catalogMatch?.managerFa ?? '';

  const txt = `${symbol} ${nameFa} ${sectorFa} ${managerFa}`;

  let gradient: string = FALLBACK_GRADIENTS[hashSymbol(symbol) % FALLBACK_GRADIENTS.length];
  let cornerIcon: React.ReactNode = null;

  if (segment === 'pension' || /آتیه|آتيه|بازنشست/.test(txt)) {
    gradient = /مفید/.test(txt)
      ? 'from-teal-500 to-emerald-600'
      : /آگاه/.test(txt)
        ? 'from-blue-600 to-indigo-700'
        : /کاریز/.test(txt)
          ? 'from-violet-600 to-purple-700'
          : 'from-emerald-500 to-teal-700';
    cornerIcon = <PiggyBank className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />;
  } else if (fundSubtype === 'gold' || /طلا|سکه|شمش|عیار|لوتوس|کهربا|فزر|مثقال|گنج|جواهر|گوهر|نفیس|آلتون/.test(txt)) {
    gradient = 'from-amber-400 via-yellow-500 to-amber-600';
    cornerIcon = <Coins className="h-2.5 w-2.5 text-amber-600 dark:text-amber-300" aria-hidden />;
  } else if (fundSubtype === 'leveraged' || /اهرم|شتاب|توان|موج|بیدار|نارنج|جهش/.test(txt)) {
    gradient = 'from-rose-500 via-red-500 to-orange-600';
    cornerIcon = <Zap className="h-2.5 w-2.5 text-rose-600 dark:text-rose-300" aria-hidden />;
  } else if (fundSubtype === 'fixed_income' || /درآمد\s*ثابت|آوند|کارا|کمند|یاقوت|اعتماد|سپهر|کیان|لبخند|همای|فیروزا/.test(txt)) {
    gradient = 'from-emerald-500 to-cyan-600';
    cornerIcon = <ShieldCheck className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />;
  } else if (/نقره|سیمین/.test(txt)) {
    gradient = 'from-slate-400 to-zinc-600';
    cornerIcon = <Coins className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" aria-hidden />;
  } else if (/زعفران|سحرخیز|نهال/.test(txt)) {
    gradient = 'from-fuchsia-600 to-rose-600';
    cornerIcon = <Leaf className="h-2.5 w-2.5 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden />;
  } else if (/پسته|غذایی|لبنیات|غصینو|غسالم|غپینو|غمارگ|غویتا|غشصفا|تبرک|به‌پاک|دام|کشاورزی/.test(txt)) {
    gradient = 'from-lime-500 to-emerald-600';
    cornerIcon = <Leaf className="h-2.5 w-2.5 text-lime-600 dark:text-lime-300" aria-hidden />;
  } else if (/فولاد|معدن|کگل|کچاد|هرمز|ذوب|ارفع|کاوه|فخوز|فخاس|فاسمین|کروی|کبافق|فلزات/.test(txt)) {
    gradient = 'from-slate-600 via-blue-700 to-indigo-800';
    cornerIcon = <Factory className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" aria-hidden />;
  } else if (/مس|فملی|فباهنر/.test(txt)) {
    gradient = 'from-orange-500 to-amber-700';
    cornerIcon = <Factory className="h-2.5 w-2.5 text-orange-600 dark:text-orange-300" aria-hidden />;
  } else if (/پتروشیمی|شیمیایی|پالایش|نفت|فارس|آریا|زاگرس|شپنا|شبندر|شتبریز|شتران|شبریز|نوری|پارس|جم|مارون|بوعلی|شگویا|شفن|شخارک|شپدیس|کرماشا/.test(txt)) {
    gradient = 'from-cyan-500 to-teal-700';
    cornerIcon = <Flame className="h-2.5 w-2.5 text-cyan-600 dark:text-cyan-300" aria-hidden />;
  } else if (/بانک|بیمه|وبملت|وتجارت|وبصادر|وپارس|وکار|وسینا|دی|دارا|بپاس|آسیا|البرز|دانا|سامان|میهن/.test(txt)) {
    gradient = 'from-indigo-600 to-blue-800';
    cornerIcon = <Landmark className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-300" aria-hidden />;
  } else if (/دارو|دعبید|دالبر|دکوثر|دسینا|دیران|دپارس|ددام|دزهراوی|برکت|تیپیکو|دکپسول|دفارا|درآور/.test(txt)) {
    gradient = 'from-teal-500 to-sky-600';
    cornerIcon = <Pill className="h-2.5 w-2.5 text-teal-600 dark:text-teal-300" aria-hidden />;
  } else if (/خودرو|خساپا|خگستر|خپارس|خزامیا|خدیزل|خشرق|خکاوه|خاور|خکرمان|خمهر|خریخت|قطعه/.test(txt)) {
    gradient = 'from-red-500 to-rose-700';
  } else if (/مخابرات|همراه|آسیاتک|های‌وب|اخابر|فناپ|رانفور|آپ|پرداخت|رکیش|سپ|تاپکیش|رایانه|نرم‌افزار/.test(txt)) {
    gradient = 'from-sky-500 to-blue-600';
    cornerIcon = <Cpu className="h-2.5 w-2.5 text-sky-600 dark:text-sky-300" aria-hidden />;
  } else if (/سیمان|سفارس|ستران|سشرق|سخوز|سشمال|ساراب|سکرد|سمازن|کاشی|سرامیک|ساختمان|ثشاهد|ثباغ|ثنوسا|ثمسکن|وساخت/.test(txt)) {
    gradient = 'from-stone-500 to-amber-700';
    cornerIcon = <Building2 className="h-2.5 w-2.5 text-stone-600 dark:text-stone-300" aria-hidden />;
  } else if (segment === 'ifb') {
    gradient = 'from-violet-500 to-indigo-600';
  }

  return { gradient, cornerIcon };
}

export function IranInstrumentLogo({
  item,
  size = 'md',
  showCornerIcon = true,
  className
}: {
  item: IranLogoInput;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showCornerIcon?: boolean;
  className?: string;
}) {
  const { gradient, cornerIcon } = resolveIranLogoMeta(item);
  const cleanSymbol = item.symbol.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || item.symbol;
  const shortLabel = size === 'xs' ? cleanSymbol.slice(0, 3) : cleanSymbol.slice(0, 5);

  const dim =
    size === 'xs'
      ? 'h-5 w-5 rounded-md text-[8px]'
      : size === 'sm'
        ? 'h-7 w-7 rounded-lg text-[9px]'
        : size === 'lg'
          ? 'h-11 w-11 rounded-2xl text-xs'
          : 'h-9 w-9 rounded-xl text-[11px]';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center font-black text-white shadow-xs ring-1 ring-black/10 dark:ring-white/15',
        dim,
        className
      )}
      aria-hidden
    >
      <span className={cn('absolute inset-0 bg-gradient-to-br', gradient, size === 'xs' ? 'rounded-md' : size === 'sm' ? 'rounded-lg' : size === 'lg' ? 'rounded-2xl' : 'rounded-xl')} />
      <span className="relative z-10 leading-none tracking-tight">{shortLabel}</span>
      {showCornerIcon && size !== 'xs' && cornerIcon && (
        <span className="absolute -bottom-1 -end-1 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card shadow-xs ring-1 ring-divider">
          {cornerIcon}
        </span>
      )}
    </span>
  );
}
