/**
 * مجموعه لوگوهای اختصاصی، فلزی و باکیفیت برای بخش «طلای ایران»
 *  - GoldBullionEmblem: شمش طلای ۱۸ عیار (۷۵۰) برای هدر اصلی
 *  - GoldPlatformLogo: لوگوی اختصاصی پلتفرم‌های طلای آنلاین (ملی‌گلد، میلی، وال‌گلد، دریک و پلتفرم‌های سفارشی)
 *  - IranCoinLogo: مدالیون سکه طلا (امامی، بهار آزادی، نیم‌سکه، ربع‌سکه، گرمی)
 *  - GoldEtfLogo: لوگوی اختصاصی ۶ صندوق طلای بورسی (عیار، مثقال، لوتوس، کهربا، قیراط، گوهر)
 */
import { Gem, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/** شمش طلای ۱۸ عیار برای هدر و کارت‌های کانونی */
export function GoldBullionEmblem({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims =
    size === 'sm' ? 'h-9 w-9 rounded-xl' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-2xl';
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-md ring-1 ring-inset ring-yellow-200/70',
        dims,
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-black/20" />
      <svg viewBox="0 0 40 40" className="relative z-10 h-[72%] w-[72%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        <defs>
          <linearGradient id="darinoGoldBarTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="55%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>
          <linearGradient id="darinoGoldBarSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#854D0E" />
          </linearGradient>
        </defs>
        {/* شمش پایینی */}
        <polygon points="5,29 10,20 30,20 35,29" fill="url(#darinoGoldBarSide)" stroke="#FEF9C3" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="10,20 13,13 27,13 30,20" fill="url(#darinoGoldBarTop)" stroke="#FEF9C3" strokeWidth="1" strokeLinejoin="round" />
        {/* درخشش بالا */}
        <path d="M20 4 L21.4 8.2 L25.5 9.5 L21.4 10.8 L20 15 L18.6 10.8 L14.5 9.5 L18.6 8.2 Z" fill="#FEF9C3" opacity="0.95" />
        <text x="20" y="26.5" textAnchor="middle" fill="#FEF9C3" fontSize="6.5" fontWeight="900" fontFamily="sans-serif">
          750
        </text>
      </svg>
    </span>
  );
}

interface PlatformVisual {
  gradient: string;
  ring: string;
  monogram: string;
  accentSvg: 'crown' | 'm' | 'shield' | 'coin' | 'spark';
}

const PLATFORM_VISUALS: Record<string, PlatformVisual> = {
  melligold: {
    gradient: 'from-emerald-600 via-teal-700 to-emerald-950',
    ring: 'ring-amber-300/60',
    monogram: 'ملی',
    accentSvg: 'crown'
  },
  milli: {
    gradient: 'from-amber-400 via-amber-500 to-orange-700',
    ring: 'ring-yellow-200/70',
    monogram: 'میلی',
    accentSvg: 'm'
  },
  wallgold: {
    gradient: 'from-indigo-600 via-blue-700 to-slate-900',
    ring: 'ring-amber-300/55',
    monogram: 'وال',
    accentSvg: 'shield'
  },
  daric: {
    gradient: 'from-rose-600 via-amber-600 to-yellow-700',
    ring: 'ring-amber-200/65',
    monogram: 'دریک',
    accentSvg: 'coin'
  }
};

/** لوگوی اختصاصی هر پلتفرم طلای آنلاین */
export function GoldPlatformLogo({
  platformId,
  name,
  size = 'md',
  className
}: {
  platformId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const key = platformId.toLowerCase().trim();
  const vis: PlatformVisual = PLATFORM_VISUALS[key] ?? {
    gradient: 'from-amber-500 via-yellow-600 to-amber-800',
    ring: 'ring-amber-200/50',
    monogram: name.trim().slice(0, 3) || 'طلا',
    accentSvg: 'spark'
  };

  const dims =
    size === 'sm'
      ? 'h-7 w-7 rounded-lg text-[9px]'
      : size === 'lg'
        ? 'h-11 w-11 rounded-2xl text-[12px]'
        : 'h-9 w-9 rounded-xl text-[10px]';

  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-gradient-to-br font-black text-white shadow-sm ring-1 ring-inset',
        vis.gradient,
        vis.ring,
        dims,
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/25" />
      <svg viewBox="0 0 36 36" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]">
        {vis.accentSvg === 'crown' && (
          <path d="M6 25 L9 12 L18 19 L27 12 L30 25 Z" fill="none" stroke="#FDE047" strokeWidth="1.8" strokeLinejoin="round" />
        )}
        {vis.accentSvg === 'm' && (
          <polygon points="18,4 32,18 18,32 4,18" fill="none" stroke="#FEF9C3" strokeWidth="1.6" />
        )}
        {vis.accentSvg === 'shield' && (
          <path d="M18 4 L30 9 V19 C30 26 24 30 18 33 C12 30 6 26 6 19 V9 Z" fill="none" stroke="#FDE047" strokeWidth="1.6" />
        )}
        {vis.accentSvg === 'coin' && (
          <>
            <circle cx="18" cy="18" r="13" fill="none" stroke="#FEF08A" strokeWidth="1.5" />
            <circle cx="18" cy="18" r="9" fill="none" stroke="#FEF08A" strokeWidth="1" strokeDasharray="2 2" />
          </>
        )}
        {vis.accentSvg === 'spark' && (
          <circle cx="18" cy="18" r="12" fill="none" stroke="#FEF08A" strokeWidth="1.4" />
        )}
      </svg>
      <span className="relative z-10 leading-none tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
        {vis.monogram}
      </span>
    </span>
  );
}

/** مدالیون فلزی سکه‌های طلای ایران */
export function IranCoinLogo({ coin, className }: { coin: string; className?: string }) {
  const c = coin.toLowerCase();
  const isFull = c.includes('sekee') || c.includes('emami') || c.includes('bahar') || c === 'sekeb';
  const isHalf = c.includes('nim');
  const isQuarter = c.includes('rob');
  const badgeText = isFull ? '۱' : isHalf ? '½' : isQuarter ? '¼' : '۱g';
  const gradient = isFull
    ? 'from-yellow-300 via-amber-400 to-amber-700'
    : isHalf
      ? 'from-amber-300 via-yellow-500 to-orange-700'
      : isQuarter
        ? 'from-yellow-200 via-amber-400 to-yellow-700'
        : 'from-amber-200 via-yellow-400 to-amber-600';

  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br shadow-md ring-2 ring-inset ring-yellow-100/70',
        gradient,
        className
      )}
    >
      <span className="pointer-events-none absolute inset-[3px] rounded-full border border-dashed border-amber-950/35" />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/45 via-transparent to-black/20" />
      <span className="relative z-10 text-xs font-black text-amber-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
        {badgeText}
      </span>
    </span>
  );
}

const ETF_PALETTES: Record<string, { gradient: string; ring: string; tag: string }> = {
  ayar: {
    gradient: 'from-amber-400 via-yellow-500 to-amber-700',
    ring: 'ring-yellow-200/70',
    tag: 'عیار'
  },
  mesghal: {
    gradient: 'from-yellow-500 via-amber-600 to-orange-800',
    ring: 'ring-amber-200/60',
    tag: 'مثقال'
  },
  tala: {
    gradient: 'from-amber-300 via-yellow-500 to-yellow-800',
    ring: 'ring-yellow-100/75',
    tag: 'طلا'
  },
  kahroba: {
    gradient: 'from-orange-400 via-amber-500 to-rose-700',
    ring: 'ring-orange-200/65',
    tag: 'کهربا'
  },
  ghirat: {
    gradient: 'from-emerald-500 via-teal-600 to-amber-700',
    ring: 'ring-emerald-200/60',
    tag: 'قیراط'
  },
  gohar: {
    gradient: 'from-indigo-500 via-violet-600 to-amber-600',
    ring: 'ring-amber-200/60',
    tag: 'گوهر'
  }
};

/** لوگوی اختصاصی هر صندوق طلای بورسی */
export function GoldEtfLogo({
  etfId,
  tickerFa,
  size = 'md',
  className
}: {
  etfId: string;
  tickerFa: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const pal = ETF_PALETTES[etfId] ?? {
    gradient: 'from-amber-400 via-yellow-500 to-amber-700',
    ring: 'ring-yellow-200/60',
    tag: tickerFa.slice(0, 4)
  };
  const dims =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg text-[9px]'
      : size === 'lg'
        ? 'h-12 w-12 rounded-2xl text-[12px]'
        : 'h-10 w-10 rounded-xl text-[10px]';

  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-gradient-to-br font-black text-white shadow-sm ring-1 ring-inset',
        pal.gradient,
        pal.ring,
        dims,
        className
      )}
    >
      <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]">
        <polygon points="20,3 36,20 20,37 4,20" fill="none" stroke="white" strokeWidth="1.5" />
        <polygon points="20,9 31,20 20,31 9,20" fill="none" stroke="white" strokeWidth="0.9" />
      </svg>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-black/20" />
      <span className="relative z-10 leading-none tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
        {pal.tag}
      </span>
    </span>
  );
}

/** نشان طلای زینتی و جواهرات */
export function JewelryEmblem({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-rose-400 via-amber-400 to-yellow-600 text-white shadow-sm ring-1 ring-inset ring-amber-100/70',
        size === 'sm' ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-xl',
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-black/15" />
      <Gem className={cn('relative z-10 drop-shadow-xs', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} />
    </span>
  );
}

/** نشان کوچک درخشش طلایی برای تیترها */
export function GoldSparkIcon({ className }: { className?: string }) {
  return <Sparkles aria-hidden className={cn('h-4 w-4 text-amber-500', className)} />;
}
