/**
 * لوگوی اختصاصی و حرفه‌ای برای تمام نمادها و صندوق‌های بازار سرمایه ایران
 * ویژگی‌ها:
 *  - پالت رنگی اختصاصی برای نمادهای شاخص (فولاد، فملی، شپنا، فارس، وبملت، خودرو، عیار، اهرم، آتیه مفید و…)
 *  - الگوی هندسی SVG بسیار ظریف متناسب با صنعت + درخشش شیشه‌ای بالا (Specular Sheen)
 *  - خوانایی بالا در تمام اندازه‌ها (xs برای چیپ‌های ۱۲ فیلتر و ۶ اندیکاتور، sm/md/lg برای جدول و هدر)
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
import {
  IRAN_MARKET_CATALOG,
  type IranFundSubtype,
  type IranMarketInstrument,
  type IranMarketSegment
} from '../data/iranMarketCatalog';

export interface IranLogoInput {
  symbol: string;
  nameFa?: string;
  sectorFa?: string;
  segment?: IranMarketSegment;
  fundSubtype?: IranFundSubtype;
  managerFa?: string;
}

type MotifKind = 'hex' | 'flame' | 'diamond' | 'shield' | 'bolt' | 'bank' | 'leaf' | 'circuit' | 'rings';

interface BrandVisual {
  gradient: string;
  ring: string;
  motif: MotifKind;
  cornerIcon?: React.ReactNode;
}

const CATALOG_BY_SYMBOL = new Map<string, IranMarketInstrument>(
  IRAN_MARKET_CATALOG.map((item) => [item.symbol, item])
);

/** پالت‌های اختصاصی برای نمادها و صندوق‌های شناخته‌شده بازار سرمایه ایران */
const BRAND_OVERRIDES: Record<string, { gradient: string; ring: string; motif: MotifKind }> = {
  فولاد: { gradient: 'from-slate-700 via-blue-800 to-indigo-950', ring: 'ring-blue-400/35', motif: 'hex' },
  فملی: { gradient: 'from-orange-500 via-amber-600 to-red-800', ring: 'ring-amber-300/40', motif: 'hex' },
  فارس: { gradient: 'from-cyan-500 via-teal-600 to-emerald-800', ring: 'ring-cyan-300/40', motif: 'flame' },
  شپنا: { gradient: 'from-sky-500 via-cyan-600 to-teal-800', ring: 'ring-sky-300/40', motif: 'flame' },
  شبندر: { gradient: 'from-teal-500 via-cyan-700 to-slate-900', ring: 'ring-teal-300/40', motif: 'flame' },
  شتران: { gradient: 'from-blue-600 via-cyan-600 to-teal-800', ring: 'ring-cyan-300/40', motif: 'flame' },
  شستا: { gradient: 'from-indigo-600 via-blue-700 to-slate-900', ring: 'ring-indigo-300/40', motif: 'rings' },
  وبملت: { gradient: 'from-rose-600 via-red-700 to-amber-800', ring: 'ring-rose-300/40', motif: 'bank' },
  وتجارت: { gradient: 'from-blue-600 via-indigo-700 to-violet-900', ring: 'ring-blue-300/40', motif: 'bank' },
  وبصادر: { gradient: 'from-indigo-500 via-blue-700 to-slate-900', ring: 'ring-indigo-300/40', motif: 'bank' },
  خودرو: { gradient: 'from-blue-600 via-sky-600 to-indigo-800', ring: 'ring-sky-300/40', motif: 'rings' },
  خساپا: { gradient: 'from-orange-500 via-red-600 to-rose-800', ring: 'ring-orange-300/40', motif: 'rings' },
  کگل: { gradient: 'from-slate-600 via-zinc-700 to-blue-900', ring: 'ring-slate-300/35', motif: 'hex' },
  کچاد: { gradient: 'from-zinc-600 via-slate-700 to-indigo-900', ring: 'ring-slate-300/35', motif: 'hex' },
  همراه: { gradient: 'from-sky-400 via-cyan-500 to-blue-700', ring: 'ring-sky-200/45', motif: 'circuit' },
  اخابر: { gradient: 'from-blue-500 via-indigo-600 to-cyan-800', ring: 'ring-blue-300/40', motif: 'circuit' },
  عیار: { gradient: 'from-amber-400 via-yellow-500 to-amber-700', ring: 'ring-yellow-200/50', motif: 'diamond' },
  لوتوس: { gradient: 'from-yellow-400 via-amber-500 to-orange-700', ring: 'ring-yellow-200/50', motif: 'diamond' },
  کهربا: { gradient: 'from-amber-500 via-orange-500 to-yellow-700', ring: 'ring-amber-200/50', motif: 'diamond' },
  اهرم: { gradient: 'from-rose-500 via-red-600 to-orange-600', ring: 'ring-rose-300/45', motif: 'bolt' },
  شتاب: { gradient: 'from-fuchsia-500 via-rose-600 to-orange-600', ring: 'ring-fuchsia-300/45', motif: 'bolt' },
  آوند: { gradient: 'from-emerald-400 via-teal-500 to-cyan-700', ring: 'ring-emerald-200/45', motif: 'shield' }
};

const FALLBACK_PALETTES: readonly { gradient: string; ring: string; motif: MotifKind }[] = [
  { gradient: 'from-blue-500 via-indigo-600 to-violet-700', ring: 'ring-indigo-300/35', motif: 'rings' },
  { gradient: 'from-teal-500 via-emerald-600 to-cyan-800', ring: 'ring-teal-300/35', motif: 'hex' },
  { gradient: 'from-violet-500 via-purple-600 to-fuchsia-800', ring: 'ring-purple-300/35', motif: 'diamond' },
  { gradient: 'from-sky-500 via-blue-600 to-indigo-800', ring: 'ring-sky-300/35', motif: 'circuit' },
  { gradient: 'from-amber-500 via-orange-600 to-rose-700', ring: 'ring-amber-300/35', motif: 'flame' },
  { gradient: 'from-rose-500 via-pink-600 to-purple-800', ring: 'ring-rose-300/35', motif: 'bolt' },
  { gradient: 'from-emerald-500 via-green-600 to-teal-800', ring: 'ring-emerald-300/35', motif: 'shield' },
  { gradient: 'from-cyan-500 via-sky-600 to-blue-800', ring: 'ring-cyan-300/35', motif: 'rings' }
];

function hashSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 33 + symbol.charCodeAt(i)) >>> 0;
  }
  return h;
}

function MotifWatermark({ motif }: { motif: MotifKind }) {
  switch (motif) {
    case 'hex':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" aria-hidden>
          <polygon points="20,4 34,12 34,28 20,36 6,28 6,12" fill="none" stroke="white" strokeWidth="1.5" />
          <polygon points="20,10 29,15 29,25 20,30 11,25 11,15" fill="none" stroke="white" strokeWidth="1" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.2]" aria-hidden>
          <polygon points="20,3 36,20 20,37 4,20" fill="none" stroke="white" strokeWidth="1.4" />
          <line x1="20" y1="3" x2="20" y2="37" stroke="white" strokeWidth="0.8" />
        </svg>
      );
    case 'flame':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.17]" aria-hidden>
          <path d="M8 30 Q20 12 32 30" fill="none" stroke="white" strokeWidth="1.6" />
          <path d="M12 24 Q20 8 28 24" fill="none" stroke="white" strokeWidth="1.2" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          <path d="M20 5 L33 10 V21 C33 28 27 33 20 36 C13 33 7 28 7 21 V10 Z" fill="none" stroke="white" strokeWidth="1.4" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.2]" aria-hidden>
          <polyline points="23,4 11,22 20,22 17,36 29,18 20,18" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'bank':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" aria-hidden>
          <path d="M7 15 L20 7 L33 15 M11 18 V30 M20 18 V30 M29 18 V30 M7 32 H33" fill="none" stroke="white" strokeWidth="1.4" />
        </svg>
      );
    case 'leaf':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          <path d="M10 31 C10 16 20 8 32 8 C32 20 24 31 10 31 Z" fill="none" stroke="white" strokeWidth="1.4" />
          <line x1="10" y1="31" x2="26" y2="14" stroke="white" strokeWidth="1" />
        </svg>
      );
    case 'circuit':
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          <circle cx="12" cy="12" r="2.5" fill="none" stroke="white" strokeWidth="1.2" />
          <circle cx="28" cy="28" r="2.5" fill="none" stroke="white" strokeWidth="1.2" />
          <path d="M14.5 12 H24 V25.5" fill="none" stroke="white" strokeWidth="1.2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.15]" aria-hidden>
          <circle cx="20" cy="20" r="14" fill="none" stroke="white" strokeWidth="1.3" />
          <circle cx="20" cy="20" r="8" fill="none" stroke="white" strokeWidth="0.9" />
        </svg>
      );
  }
}

export function resolveIranLogoMeta(input: IranLogoInput): BrandVisual {
  const catalogMatch = CATALOG_BY_SYMBOL.get(input.symbol);
  const symbol = input.symbol;
  const nameFa = input.nameFa ?? catalogMatch?.nameFa ?? '';
  const sectorFa = input.sectorFa ?? catalogMatch?.sectorFa ?? '';
  const segment = input.segment ?? catalogMatch?.segment;
  const fundSubtype = input.fundSubtype ?? catalogMatch?.fundSubtype;
  const managerFa = input.managerFa ?? catalogMatch?.managerFa ?? '';

  const txt = `${symbol} ${nameFa} ${sectorFa} ${managerFa}`;

  // ۱) نشان اختصاصی نمادهای شاخص
  const override = BRAND_OVERRIDES[symbol.trim()];
  if (override) {
    let cornerIcon: React.ReactNode = null;
    if (override.motif === 'diamond') {
      cornerIcon = <Coins className="h-2.5 w-2.5 text-amber-600 dark:text-amber-300" aria-hidden />;
    } else if (override.motif === 'bolt') {
      cornerIcon = <Zap className="h-2.5 w-2.5 text-rose-600 dark:text-rose-300" aria-hidden />;
    } else if (override.motif === 'shield') {
      cornerIcon = <ShieldCheck className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />;
    } else if (override.motif === 'flame') {
      cornerIcon = <Flame className="h-2.5 w-2.5 text-cyan-600 dark:text-cyan-300" aria-hidden />;
    } else if (override.motif === 'bank') {
      cornerIcon = <Landmark className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-300" aria-hidden />;
    } else if (override.motif === 'hex') {
      cornerIcon = <Factory className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" aria-hidden />;
    } else if (override.motif === 'circuit') {
      cornerIcon = <Cpu className="h-2.5 w-2.5 text-sky-600 dark:text-sky-300" aria-hidden />;
    }
    return { ...override, cornerIcon };
  }

  // ۲) دسته‌بندی هوشمند بر اساس صنعت و نوع صندوق
  if (segment === 'pension' || /آتیه|آتيه|بازنشست/.test(txt)) {
    const gradient = /مفید/.test(txt)
      ? 'from-teal-500 via-emerald-600 to-teal-800'
      : /آگاه/.test(txt)
        ? 'from-blue-600 via-indigo-700 to-slate-900'
        : /کاریز/.test(txt)
          ? 'from-violet-600 via-purple-700 to-indigo-900'
          : 'from-emerald-500 via-teal-600 to-cyan-800';
    return {
      gradient,
      ring: 'ring-emerald-300/40',
      motif: 'shield',
      cornerIcon: <PiggyBank className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />
    };
  }
  if (fundSubtype === 'gold' || /طلا|سکه|شمش|عیار|لوتوس|کهربا|فزر|مثقال|گنج|جواهر|گوهر|نفیس|آلتون/.test(txt)) {
    return {
      gradient: 'from-amber-400 via-yellow-500 to-amber-700',
      ring: 'ring-yellow-200/50',
      motif: 'diamond',
      cornerIcon: <Coins className="h-2.5 w-2.5 text-amber-600 dark:text-amber-300" aria-hidden />
    };
  }
  if (fundSubtype === 'leveraged' || /اهرم|شتاب|توان|موج|بیدار|نارنج|جهش/.test(txt)) {
    return {
      gradient: 'from-rose-500 via-red-600 to-orange-600',
      ring: 'ring-rose-300/45',
      motif: 'bolt',
      cornerIcon: <Zap className="h-2.5 w-2.5 text-rose-600 dark:text-rose-300" aria-hidden />
    };
  }
  if (fundSubtype === 'fixed_income' || /درآمد\s*ثابت|آوند|کارا|کمند|یاقوت|اعتماد|سپهر|کیان|لبخند|همای|فیروزا/.test(txt)) {
    return {
      gradient: 'from-emerald-500 via-teal-600 to-cyan-700',
      ring: 'ring-emerald-300/40',
      motif: 'shield',
      cornerIcon: <ShieldCheck className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />
    };
  }
  if (/نقره|سیمین/.test(txt)) {
    return {
      gradient: 'from-slate-400 via-zinc-500 to-slate-700',
      ring: 'ring-slate-200/45',
      motif: 'diamond',
      cornerIcon: <Coins className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" aria-hidden />
    };
  }
  if (/زعفران|سحرخیز|نهال/.test(txt)) {
    return {
      gradient: 'from-fuchsia-600 via-rose-600 to-purple-800',
      ring: 'ring-fuchsia-300/40',
      motif: 'leaf',
      cornerIcon: <Leaf className="h-2.5 w-2.5 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden />
    };
  }
  if (/پسته|غذایی|لبنیات|غصینو|غسالم|غپینو|غمارگ|غویتا|غشصفا|تبرک|به‌پاک|دام|کشاورزی/.test(txt)) {
    return {
      gradient: 'from-lime-500 via-emerald-600 to-green-800',
      ring: 'ring-lime-300/40',
      motif: 'leaf',
      cornerIcon: <Leaf className="h-2.5 w-2.5 text-lime-600 dark:text-lime-300" aria-hidden />
    };
  }
  if (/فولاد|معدن|کگل|کچاد|هرمز|ذوب|ارفع|کاوه|فخوز|فخاس|فاسمین|کروی|کبافق|فلزات/.test(txt)) {
    return {
      gradient: 'from-slate-600 via-blue-700 to-indigo-900',
      ring: 'ring-blue-300/35',
      motif: 'hex',
      cornerIcon: <Factory className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" aria-hidden />
    };
  }
  if (/مس|فملی|فباهنر/.test(txt)) {
    return {
      gradient: 'from-orange-500 via-amber-600 to-red-800',
      ring: 'ring-amber-300/40',
      motif: 'hex',
      cornerIcon: <Factory className="h-2.5 w-2.5 text-orange-600 dark:text-orange-300" aria-hidden />
    };
  }
  if (/پتروشیمی|شیمیایی|پالایش|نفت|فارس|آریا|زاگرس|شپنا|شبندر|شتبریز|شتران|شبریز|نوری|پارس|جم|مارون|بوعلی|شگویا|شفن|شخارک|شپدیس|کرماشا/.test(txt)) {
    return {
      gradient: 'from-cyan-500 via-teal-600 to-emerald-800',
      ring: 'ring-cyan-300/40',
      motif: 'flame',
      cornerIcon: <Flame className="h-2.5 w-2.5 text-cyan-600 dark:text-cyan-300" aria-hidden />
    };
  }
  if (/بانک|بیمه|وبملت|وتجارت|وبصادر|وپارس|وکار|وسینا|دی|دارا|بپاس|آسیا|البرز|دانا|سامان|میهن/.test(txt)) {
    return {
      gradient: 'from-indigo-600 via-blue-700 to-slate-900',
      ring: 'ring-indigo-300/40',
      motif: 'bank',
      cornerIcon: <Landmark className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-300" aria-hidden />
    };
  }
  if (/دارو|دعبید|دالبر|دکوثر|دسینا|دیران|دپارس|ددام|دزهراوی|برکت|تیپیکو|دکپسول|دفارا|درآور/.test(txt)) {
    return {
      gradient: 'from-teal-500 via-sky-600 to-blue-800',
      ring: 'ring-teal-300/40',
      motif: 'shield',
      cornerIcon: <Pill className="h-2.5 w-2.5 text-teal-600 dark:text-teal-300" aria-hidden />
    };
  }
  if (/خودرو|خساپا|خگستر|خپارس|خزامیا|خدیزل|خشرق|خکاوه|خاور|خکرمان|خمهر|خریخت|قطعه/.test(txt)) {
    return {
      gradient: 'from-red-500 via-rose-600 to-red-800',
      ring: 'ring-rose-300/40',
      motif: 'rings'
    };
  }
  if (/مخابرات|همراه|آسیاتک|های‌وب|اخابر|فناپ|رانفور|آپ|پرداخت|رکیش|سپ|تاپکیش|رایانه|نرم‌افزار/.test(txt)) {
    return {
      gradient: 'from-sky-500 via-blue-600 to-indigo-700',
      ring: 'ring-sky-300/40',
      motif: 'circuit',
      cornerIcon: <Cpu className="h-2.5 w-2.5 text-sky-600 dark:text-sky-300" aria-hidden />
    };
  }
  if (/سیمان|سفارس|ستران|سشرق|سخوز|سشمال|ساراب|سکرد|سمازن|کاشی|سرامیک|ساختمان|ثشاهد|ثباغ|ثنوسا|ثمسکن|وساخت/.test(txt)) {
    return {
      gradient: 'from-stone-500 via-amber-700 to-stone-800',
      ring: 'ring-amber-300/35',
      motif: 'hex',
      cornerIcon: <Building2 className="h-2.5 w-2.5 text-stone-600 dark:text-stone-300" aria-hidden />
    };
  }
  if (segment === 'ifb') {
    return {
      gradient: 'from-violet-500 via-indigo-600 to-purple-800',
      ring: 'ring-violet-300/40',
      motif: 'diamond'
    };
  }

  return FALLBACK_PALETTES[hashSymbol(symbol) % FALLBACK_PALETTES.length];
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
  const { gradient, ring, motif, cornerIcon } = resolveIranLogoMeta(item);
  const cleanSymbol = item.symbol.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || item.symbol;
  // در سایز xs (داخل چیپ‌های ۱۲ فیلتر و ۶ اندیکاتور) حداکثر ۲ حرف اول خوانا نمایش داده می‌شود
  const shortLabel = size === 'xs' ? cleanSymbol.slice(0, 2) : cleanSymbol.slice(0, 5);

  const shapeClass =
    size === 'xs'
      ? 'h-[22px] w-[22px] rounded-full text-[9px]'
      : size === 'sm'
        ? 'h-8 w-8 rounded-[10px] text-[10px]'
        : size === 'lg'
          ? 'h-12 w-12 rounded-2xl text-[13px]'
          : 'h-10 w-10 rounded-xl text-[11px]';

  const innerRadius =
    size === 'xs'
      ? 'rounded-full'
      : size === 'sm'
        ? 'rounded-[10px]'
        : size === 'lg'
          ? 'rounded-2xl'
          : 'rounded-xl';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center font-black text-white shadow-sm ring-1 ring-inset',
        ring,
        shapeClass,
        className
      )}
      aria-hidden
    >
      {/* گرادیان ۳ مرحله‌ای */}
      <span className={cn('absolute inset-0 bg-gradient-to-br', gradient, innerRadius)} />
      {/* الگوی هندسی ظریف متناسب با صنعت */}
      {size !== 'xs' && (
        <span className={cn('absolute inset-0 overflow-hidden', innerRadius)}>
          <MotifWatermark motif={motif} />
        </span>
      )}
      {/* درخشش شیشه‌ای بالا (Specular Sheen) */}
      <span
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/[0.04] to-black/15',
          innerRadius
        )}
      />
      {/* مونوگرام خوانا */}
      <span className="relative z-10 leading-none tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
        {shortLabel}
      </span>
      {/* نشانک صنعت در گوشه */}
      {showCornerIcon && size !== 'xs' && cornerIcon && (
        <span className="absolute -bottom-1 -end-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-card shadow-xs ring-1 ring-divider">
          {cornerIcon}
        </span>
      )}
    </span>
  );
}
