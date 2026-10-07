/**
 * EntityLogo — لوگوی یکپارچهٔ شبکه، توکن و پلتفرم
 *
 *  • منبع تصویر فقط: مسیر محلی اپ (public/logos/*.png) یا آیکون‌های میزبان‌های معتبر زریون و دیفای‌لاما
 *    (https://icons.llama.fi/<نام>.jpg — همان منبعی که بخش دیفای اپ استفاده می‌کند).
 *    URL دلخواه کاربر هرگز بارگذاری نمی‌شود؛ توکن‌های YT/PT/LP از لوگوی دارایی و نشان شبکه استفاده می‌کنند.
 *  • پس‌زمینهٔ پیش‌فرض لوگو سفید است؛ رابین‌هود سبز برند است تا لوگوهای شفاف (مثل آرک) در حالت تیره هم دیده شوند.
 *  • هویت لوگو: شبکه ← شناسهٔ شبکه/chainId · توکن ← شناسهٔ دارایی (شبکه+قرارداد) ·
 *    پلتفرم ← شناسهٔ مستقل. نماد به‌تنهایی برای انتخاب لوگو کافی نیست.
 *  • لوگوی توکن همراه نشان کوچک شبکه است؛ لوگوی پلتفرم از شبکه مستقل است.
 *  • خطای بارگذاری یا نبود تصویر → آواتار حرفی هم‌اندازه (رابط خراب نمی‌شود).
 */
import { usePendleLogo } from './usePendleLogo';
import { useState } from 'react';
import { yieldTokenIdentity } from './YieldTokenMark';
import { cn } from '@/shared/lib/cn';

import { safeLogoSrc } from '@/shared/lib/logoSources';
export { safeLogoSrc } from '@/shared/lib/logoSources';

function Letters({ text, size, square }: { text: string; size: number; square?: boolean }) {
  const letters = text.replace(/[^A-Za-z0-9؀-ۿ]/g, '').slice(0, 2) || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-surface-2 font-bold text-muted',
        'rounded-full overflow-hidden'
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
  square: _square = false,
  className
}: {
  src: string | null | undefined;
  /** متن جایگزین (نام کامل) */
  label: string;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  size = Math.round(size * 0.96);
  const safe = safeLogoSrc(src);
  const [failed, setFailed] = useState<string|null>(null);
  if (!safe || failed===safe) {
    return (
      <span role="img" aria-label={label} className={cn('inline-flex', className)}>
        <Letters text={label} size={size} square={_square} />
      </span>
    );
  }
  return <span className={cn('entity-logo inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white',className)} style={{width:size,height:size,backgroundColor:safe==='/logos/chain-4663.svg'?'#C3F53C':undefined}}><img src={safe} alt={label} width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" title={label} onError={()=>setFailed(safe)} className="max-h-full max-w-full rounded-full object-contain" style={{width:size,height:size,padding:safe==='/logos/chain-4663.svg'?Math.max(1,Math.round(size*.12)):undefined}}/></span>;

}

/** لوگوی توکن + نشان شبکه در گوشه */
export function TokenLogo({
  logo,
  chain,
  contract,
  symbol,
  name,
  networkLogo,
  networkName,
  size = 32
}: {
  logo: string | null | undefined;
  chain?: string;
  contract?: string | null;
  symbol: string;
  name?: string;
  networkLogo?: string | null;
  networkName?: string | null;
  size?: number;
}) {
  const yieldIdentity = yieldTokenIdentity(symbol);
  const official = usePendleLogo(!!yieldIdentity,chain,contract);
  const badge = yieldIdentity ? Math.max(16, Math.round(size * 0.42)) : Math.max(18, Math.round(size * 0.54));
  const alt = networkName ? `${name ?? symbol} روی ${networkName}` : name ?? symbol;
  return (
    <span className="relative inline-flex shrink-0" style={{ height: Math.round(size*.96), position: 'relative' }} role="img" aria-label={alt} data-yield-token={yieldIdentity?.kind} data-yield-symbol={yieldIdentity?symbol:undefined}>
      <span className="relative inline-flex shrink-0" style={{width:Math.round(size*.96),height:Math.round(size*.96)}}><LogoImage src={official?.logo ?? logo} label={yieldIdentity?.underlyingFa || name || symbol} size={size} />
      {networkName !== undefined && networkName !== null && (
        <span className="token-network-badge rounded-full bg-card p-px" style={{position:'absolute',bottom:-5,right:-4,lineHeight:0}}>
          <LogoImage src={networkLogo} label={networkName} size={badge} square />
        </span>
      )}</span>
      {yieldIdentity&&<span dir="ltr" data-yield-logo-badge={yieldIdentity.kind} className="ms-1 self-center rounded bg-surface-2 px-1 py-0.5 text-[9px] font-bold leading-none text-muted">{yieldIdentity.kind}</span>}
    </span>
  );
}
