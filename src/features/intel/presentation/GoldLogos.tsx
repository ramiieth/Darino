/**
 * مجموعه لوگوهای یکپارچه با سیستم دیزاین دارینو (سرمه‌ای، آبی برند #2E5BFF و طلایی ملایم شامپاینی)
 *  - GoldBullionEmblem: نشان مینیمال شمش ۱۸ عیار روی پس‌زمینهٔ سرمه‌ای-آبی دارینو
 *  - GoldPlatformLogo: لوگوی اختصاصی پلتفرم‌های طلای آنلاین (ملی‌گلد، میلی، وال‌گلد، دریک و سفارشی)
 *  - IranCoinLogo: مدالیون مینیمال سکه با حلقهٔ طلایی ظریف روی زمینهٔ سرمه‌ای دارینو
 *  - GoldEtfLogo: لوگوی اختصاصی ۶ صندوق طلای بورسی با پالت فین‌تک دارینو
 */
import { Gem, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/** نشان مینیمال شمش طلای ۱۸ عیار هم‌رنگ سیستم دیزاین دارینو */
export function GoldBullionEmblem({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims =
    size === 'sm' ? 'h-9 w-9 rounded-xl' : size === 'lg' ? 'h-13 w-13 rounded-2xl' : 'h-11 w-11 rounded-2xl';
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#0B1B5C] via-[#1F47E0] to-[#2E5BFF] shadow-sm ring-1 ring-inset ring-white/20',
        dims,
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20" />
      <svg viewBox="0 0 40 40" className="relative z-10 h-[68%] w-[68%]">
        <defs>
          <linearGradient id="darinoChampagneGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F3E2B8" />
            <stop offset="55%" stopColor="#D4AF5A" />
            <stop offset="100%" stopColor="#A67C24" />
          </linearGradient>
        </defs>
        <polygon
          points="6,28 11,19 29,19 34,28"
          fill="url(#darinoChampagneGold)"
          fillOpacity="0.92"
          stroke="#F8EED3"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points="11,19 14,13 26,13 29,19"
          fill="#F8EED3"
          fillOpacity="0.95"
          stroke="#D4AF5A"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <text x="20" y="25.6" textAnchor="middle" fill="#0B1B5C" fontSize="6.2" fontWeight="800" fontFamily="sans-serif">
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
    gradient: 'from-slate-800 via-teal-800 to-emerald-900',
    ring: 'ring-white/20',
    monogram: 'ملی',
    accentSvg: 'crown'
  },
  milli: {
    gradient: 'from-[#1837B0] via-[#2E5BFF] to-indigo-700',
    ring: 'ring-white/25',
    monogram: 'میلی',
    accentSvg: 'm'
  },
  wallgold: {
    gradient: 'from-[#0B1B5C] via-indigo-800 to-slate-900',
    ring: 'ring-white/20',
    monogram: 'وال',
    accentSvg: 'shield'
  },
  daric: {
    gradient: 'from-slate-700 via-indigo-700 to-violet-900',
    ring: 'ring-white/20',
    monogram: 'دریک',
    accentSvg: 'coin'
  }
};

/** لوگوی اختصاصی هر پلتفرم طلای آنلاین با پالت سرمه‌ای-آبی دارینو */
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
    gradient: 'from-[#0B1B5C] via-slate-700 to-[#1F47E0]',
    ring: 'ring-white/20',
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
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-gradient-to-br font-extrabold text-white shadow-xs ring-1 ring-inset',
        vis.gradient,
        vis.ring,
        dims,
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20" />
      <svg viewBox="0 0 36 36" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]">
        {vis.accentSvg === 'crown' && (
          <path d="M6 25 L9 12 L18 19 L27 12 L30 25 Z" fill="none" stroke="#F3E2B8" strokeWidth="1.6" strokeLinejoin="round" />
        )}
        {vis.accentSvg === 'm' && (
          <polygon points="18,4 32,18 18,32 4,18" fill="none" stroke="white" strokeWidth="1.4" />
        )}
        {vis.accentSvg === 'shield' && (
          <path d="M18 4 L30 9 V19 C30 26 24 30 18 33 C12 30 6 26 6 19 V9 Z" fill="none" stroke="#F3E2B8" strokeWidth="1.4" />
        )}
        {vis.accentSvg === 'coin' && (
          <>
            <circle cx="18" cy="18" r="13" fill="none" stroke="white" strokeWidth="1.3" />
            <circle cx="18" cy="18" r="9" fill="none" stroke="white" strokeWidth="0.9" strokeDasharray="2 2" />
          </>
        )}
        {vis.accentSvg === 'spark' && (
          <circle cx="18" cy="18" r="12" fill="none" stroke="white" strokeWidth="1.2" />
        )}
      </svg>
      <span className="relative z-10 leading-none tracking-tight">{vis.monogram}</span>
    </span>
  );
}

/** مدالیون مینیمال سکه‌های طلا با رنگ‌بندی سرمه‌ای دارینو و حاشیهٔ شامپاینی ظریف */
export function IranCoinLogo({ coin, className }: { coin: string; className?: string }) {
  const c = coin.toLowerCase();
  const isFull = c.includes('sekee') || c.includes('emami') || c.includes('bahar') || c === 'sekeb';
  const isHalf = c.includes('nim');
  const isQuarter = c.includes('rob');
  const badgeText = isFull ? '۱' : isHalf ? '½' : isQuarter ? '¼' : '۱g';
  const gradient = isFull
    ? 'from-[#0B1B5C] via-[#1837B0] to-slate-900'
    : isHalf
      ? 'from-slate-800 via-[#1F47E0] to-slate-900'
      : isQuarter
        ? 'from-slate-700 via-indigo-800 to-slate-900'
        : 'from-slate-700 via-slate-800 to-slate-950';

  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br shadow-xs ring-2 ring-inset ring-gold/55',
        gradient,
        className
      )}
    >
      <span className="pointer-events-none absolute inset-[3px] rounded-full border border-dashed border-[#E6C77E]/45" />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/20 via-transparent to-black/20" />
      <span className="relative z-10 text-xs font-black text-[#F3E2B8]">{badgeText}</span>
    </span>
  );
}

const ETF_PALETTES: Record<string, { gradient: string; ring: string; tag: string }> = {
  ayar: {
    gradient: 'from-[#0B1B5C] via-[#1F47E0] to-[#2E5BFF]',
    ring: 'ring-white/25',
    tag: 'عیار'
  },
  mesghal: {
    gradient: 'from-slate-700 via-slate-800 to-[#0B1B5C]',
    ring: 'ring-gold/40',
    tag: 'مثقال'
  },
  tala: {
    gradient: 'from-[#1837B0] via-indigo-700 to-slate-900',
    ring: 'ring-gold/45',
    tag: 'طلا'
  },
  kahroba: {
    gradient: 'from-sky-700 via-[#1F47E0] to-[#0B1B5C]',
    ring: 'ring-white/20',
    tag: 'کهربا'
  },
  ghirat: {
    gradient: 'from-teal-700 via-emerald-800 to-slate-900',
    ring: 'ring-white/20',
    tag: 'قیراط'
  },
  gohar: {
    gradient: 'from-indigo-700 via-violet-800 to-slate-900',
    ring: 'ring-white/20',
    tag: 'گوهر'
  }
};

/** لوگوی اختصاصی هر صندوق طلای بورسی هماهنگ با سیستم دیزاین دارینو */
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
    gradient: 'from-[#0B1B5C] via-[#1F47E0] to-[#2E5BFF]',
    ring: 'ring-white/20',
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
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-gradient-to-br font-extrabold text-white shadow-xs ring-1 ring-inset',
        pal.gradient,
        pal.ring,
        dims,
        className
      )}
    >
      <svg viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]">
        <polygon points="20,3 36,20 20,37 4,20" fill="none" stroke="#F3E2B8" strokeWidth="1.4" />
        <polygon points="20,9 31,20 20,31 9,20" fill="none" stroke="white" strokeWidth="0.8" />
      </svg>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20" />
      <span className="relative z-10 leading-none tracking-tight">{pal.tag}</span>
    </span>
  );
}

/** نشان طلای زینتی هماهنگ با پالت آبی-سرمه‌ای دارینو */
export function JewelryEmblem({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#1F47E0] via-indigo-600 to-[#0B1B5C] text-[#F3E2B8] shadow-xs ring-1 ring-inset ring-white/20',
        size === 'sm' ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-xl',
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/15" />
      <Gem className={cn('relative z-10', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} />
    </span>
  );
}

/** آیکون ظریف تیترها با رنگ برند دارینو */
export function GoldSparkIcon({ className }: { className?: string }) {
  return <Sparkles aria-hidden className={cn('h-4 w-4 text-accent', className)} />;
}
