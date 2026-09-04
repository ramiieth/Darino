/**
 * لوگوی اختصاصی دارایی — زنجیره کامل:
 *  نگاشت‌های موجود (کوینگکو ۳۲ سکه/توکن‌ایز/CDN سهام)
 *  ← فالبک آفلاین ۳۲ رمزارز ← ۲۵۰ سکه برتر کوینگکو (کش ۲۴h)
 *  ← جستجوی کوینگکو (صف محدود) ← CDN سهام → آواتار حرفی
 */
import { useEffect, useState } from 'react';
import {
  Coffee,
  Wheat,
  Candy,
  Droplets,
  Flame,
  Sprout,
  Gem,
  CircleDollarSign,
  Sparkles,
  Diamond,
  Fuel,
  Hammer
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { TRADFI_LOGO_FALLBACKS } from '@/shared/hooks/useAssetMeta';
import { useLogoStore, ensureTop250Logos, ensureSymbolLogo, logoUrlForSymbol, TOKENIZED_LOGO_SEED } from '@/shared/store/logoStore';
import { COIN_LOGO_FALLBACK } from '@/features/simulation/data/coinLogoFallback';
import type { AssetKind } from '@/shared/types';

const KIND_GRADIENTS: Record<AssetKind, string> = {
  crypto: 'from-violet-400 to-indigo-600',
  tokenized: 'from-sky-400 to-blue-600',
  tradfi: 'from-emerald-400 to-teal-600'
};

/** لوگوی آیکونی کالاها (کامودیتی) — لوگوی اختصاصی برای همه ۱۶ کالا */
export const COMMODITY_ICONS: Record<string, React.ReactNode> = {
  /* فلزات گرانبها */
  GLD: <Gem className="h-[55%] w-[55%]" />,              // طلا (صندوق GLD)
  XAU: <Gem className="h-[55%] w-[55%]" />,              // طلا (پرفچوال XAUUSDT)
  SLV: <CircleDollarSign className="h-[55%] w-[55%]" />, // نقره (صندوق SLV)
  XAG: <CircleDollarSign className="h-[55%] w-[55%]" />, // نقره (پرفچوال XAGUSDT)
  PPLT: <Sparkles className="h-[55%] w-[55%]" />,        // پلاتین (صندوق PPLT)
  PALL: <Diamond className="h-[55%] w-[55%]" />,         // پالادیوم (صندوق PALL)
  /* انرژی */
  USO: <Droplets className="h-[55%] w-[55%]" />,         // نفت خام (صندوق USO)
  WTI: <Fuel className="h-[55%] w-[55%]" />,             // نفت وست تگزاس
  BRENT: <Fuel className="h-[55%] w-[55%]" />,           // نفت برنت
  NG: <Flame className="h-[55%] w-[55%]" />,             // گاز طبیعی
  UNG: <Flame className="h-[55%] w-[55%]" />,            // گاز طبیعی (صندوق UNG)
  /* صنعتی */
  CPER: <Hammer className="h-[55%] w-[55%]" />,          // مس (صندوق CPER)
  COPPER: <Hammer className="h-[55%] w-[55%]" />,        // مس
  /* کشاورزی */
  CORN: <Sprout className="h-[55%] w-[55%]" />,          // ذرت
  WHEAT: <Wheat className="h-[55%] w-[55%]" />,          // گندم
  COFFEE: <Coffee className="h-[55%] w-[55%]" />,        // قهوه
  SUGAR: <Candy className="h-[55%] w-[55%]" />,          // شکر
  DBA: <Sprout className="h-[55%] w-[55%]" />            // کشاورزی (صندوق DBA)
};

export function LetterAvatar({
  symbol,
  kind,
  size
}: {
  symbol: string;
  kind: AssetKind;
  size: number;
}) {
  const letters = symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || symbol.slice(0, 1);
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-black text-white shadow-sm',
        KIND_GRADIENTS[kind]
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
    >
      {letters}
    </span>
  );
}

export function AssetLogo({
  symbol,
  kind,
  size = 32,
  className
}: {
  symbol: string;
  kind: AssetKind;
  size?: number;
  className?: string;
}) {
  // فقط لوگو از logoStore (سبک — بدون sync قیمت توکنایز در لود عمومی)
  const logos = useLogoStore((s) => s.bySymbol);
  const top250 = useLogoStore((s) => s.top250);
  const [failed, setFailed] = useState<number[]>([]);

  // واکنش‌پذیری به استور لوگو (۲۵۰ سکه برتر + نتایج جستجو)
  const logoStoreUrl = top250[symbol]?.img ?? null;
  const seedUrl = TOKENIZED_LOGO_SEED[symbol] ?? null;

  useEffect(() => {
    void ensureTop250Logos();
  }, []);

  // جستجوی لوگو برای نمادهای ناشناخته (صف محدود — یک بار در ۷ روز)
  useEffect(() => {
    const url = logos[symbol] ?? logoUrlForSymbol(symbol);
    if (!url && !TRADFI_LOGO_FALLBACKS[symbol]) {
      ensureSymbolLogo(symbol);
    }
  }, [symbol, logos]);

  // نامزدها به ترتیب اولویت (async-safe: همیشه اولین نامزد سالم)
  // CDN لوگوی سهام (FMP) برای هر نماد TradFi — عمومی
  const fmpUrl =
    kind === 'tradfi' ? `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png` : null;

  /** لوگوهای CoinGecko با نسخه کوچک (small ≈ ۶۴px) — سبک‌تر از large */
  const smallize = (u: string): string =>
    u.includes('coin-images.coingecko.com') && u.includes('/large/')
      ? u.replace('/large/', '/small/')
      : u;

  const candidates: (string | null | undefined)[] = [
    logos[symbol] ? smallize(logos[symbol]) : undefined,
    seedUrl ? smallize(seedUrl) : undefined,
    logoStoreUrl ? smallize(logoStoreUrl) : undefined,
    COIN_LOGO_FALLBACK[symbol],
    logoUrlForSymbol(symbol) ? smallize(logoUrlForSymbol(symbol)!) : undefined,
    fmpUrl,
    TRADFI_LOGO_FALLBACKS[symbol]
  ];
  const currentIdx = candidates.findIndex((c, i) => !!c && !failed.includes(i));
  const url = currentIdx >= 0 ? candidates[currentIdx] : null;

  // لوگوی آیکونی کالاها — قبل از آواتار حرفی
  if (!url && COMMODITY_ICONS[symbol]) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm',
          KIND_GRADIENTS[kind]
        )}
        style={{ width: size, height: size }}
        aria-label={symbol}
      >
        {COMMODITY_ICONS[symbol]}
      </span>
    );
  }

  if (!url) {
    return <LetterAvatar symbol={symbol} kind={kind} size={size} />;
  }

  return (
    <img
      src={url}
      alt={symbol}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed((f) => (f.includes(currentIdx) ? f : [...f, currentIdx]))}
      className={cn(
        'shrink-0 rounded-full bg-card object-contain shadow-sm ring-1 ring-line/10',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
