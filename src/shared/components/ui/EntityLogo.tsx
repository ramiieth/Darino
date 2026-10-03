/**
 * EntityLogo — لوگوی یکپارچهٔ شبکه، توکن و پلتفرم
 *
 *  • منبع تصویر فقط: مسیر محلی اپ (public/logos/*.png) یا آیکون‌های میزبان‌های معتبر زریون و دیفای‌لاما
 *    (https://icons.llama.fi/<نام>.jpg — همان منبعی که بخش دیفای اپ استفاده می‌کند).
 *    URL دلخواه کاربر هرگز بارگذاری نمی‌شود و SVG inline نمی‌شود.
 *  • پس‌زمینهٔ پیش‌فرض لوگو سفید است؛ رابین‌هود سبز برند است تا لوگوهای شفاف (مثل آرک) در حالت تیره هم دیده شوند.
 *  • هویت لوگو: شبکه ← شناسهٔ شبکه/chainId · توکن ← شناسهٔ دارایی (شبکه+قرارداد) ·
 *    پلتفرم ← شناسهٔ مستقل. نماد به‌تنهایی برای انتخاب لوگو کافی نیست.
 *  • لوگوی توکن همراه نشان کوچک شبکه است؛ لوگوی پلتفرم از شبکه مستقل است.
 *  • خطای بارگذاری یا نبود تصویر → آواتار حرفی هم‌اندازه (رابط خراب نمی‌شود).
 */
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

import { safeLogoSrc } from '@/shared/lib/logoSources';
export { safeLogoSrc } from '@/shared/lib/logoSources';

function Letters({ text, size, square }: { text: string; size: number; square?: boolean }) {
  const letters = text.replace(/[^A-Za-z0-9؀-ۿ]/g, '').slice(0, 2) || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-surface-2 font-bold text-muted ring-1 ring-divider',
        square ? 'rounded-[28%]' : 'rounded-full'
      )}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36) }}
    >
      {letters}
    </span>
  );
}

export function LogoImage({
  src,
  label,
  size = 28,
  square = false,
  className
}: {
  src: string | null | undefined;
  /** متن جایگزین (نام کامل) */
  label: string;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  size = Math.round(size * 0.92);
  const safe = safeLogoSrc(src);
  const [failed, setFailed] = useState<string|null>(null);
  if (!safe || failed===safe) {
    return (
      <span role="img" aria-label={label} className={cn('inline-flex', className)}>
        <Letters text={label} size={size} square={square} />
      </span>
    );
  }
  return <span className={cn('inline-flex shrink-0 items-center justify-center bg-white ring-1 ring-divider',square?'rounded-[28%]':'rounded-full',className)} style={{width:size,height:size,backgroundColor:safe==='/logos/chain-4663.svg'?'#C3F53C':undefined}}><img src={safe} alt={label} width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" title={label} onError={()=>setFailed(safe)} className="max-h-full max-w-full object-contain" style={{width:size,height:size,padding:safe==='/logos/chain-4663.svg'?Math.max(1,Math.round(size*.12)):undefined}}/></span>;

}

/** لوگوی توکن + نشان شبکه در گوشه */
export function TokenLogo({
  logo,
  symbol,
  name,
  networkLogo,
  networkName,
  size = 32
}: {
  logo: string | null | undefined;
  symbol: string;
  name?: string;
  networkLogo?: string | null;
  networkName?: string | null;
  size?: number;
}) {
  const badge = Math.max(12, Math.round(size * 0.44));
  const alt = networkName ? `${name ?? symbol} روی ${networkName}` : name ?? symbol;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: Math.round(size*.92), height: Math.round(size*.92) }} role="img" aria-label={alt}>
      <LogoImage src={logo} label={symbol} size={size} />
      {networkName !== undefined && networkName !== null && (
        <span className="absolute -bottom-0.5 -end-0.5 rounded-full bg-card p-px">
          <LogoImage src={networkLogo} label={networkName} size={badge} square />
        </span>
      )}
    </span>
  );
}
