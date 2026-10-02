/**
 * EntityLogo — لوگوی یکپارچهٔ شبکه، توکن و پلتفرم
 *
 *  • منبع تصویر فقط: مسیر محلی اپ (public/logos/*.png) یا آیکون‌های میزبان‌های معتبر زریون و دیفای‌لاما
 *    (https://icons.llama.fi/<نام>.jpg — همان منبعی که بخش دیفای اپ استفاده می‌کند).
 *    URL دلخواه کاربر هرگز بارگذاری نمی‌شود و SVG inline نمی‌شود.
 *  • پس‌زمینهٔ لوگو همیشه سفید است تا لوگوهای شفاف (مثل آرک) در حالت تیره هم دیده شوند.
 *  • هویت لوگو: شبکه ← شناسهٔ شبکه/chainId · توکن ← شناسهٔ دارایی (شبکه+قرارداد) ·
 *    پلتفرم ← شناسهٔ مستقل. نماد به‌تنهایی برای انتخاب لوگو کافی نیست.
 *  • لوگوی توکن همراه نشان کوچک شبکه است؛ لوگوی پلتفرم از شبکه مستقل است.
 *  • خطای بارگذاری یا نبود تصویر → آواتار حرفی هم‌اندازه (رابط خراب نمی‌شود).
 */
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

const SAFE_LOCAL = /^\/logos\/[a-z0-9-]+\.png$/;
const SAFE_ZERION = /^https:\/\/(?:token-icons\.s3\.amazonaws\.com|chain-icons\.s3\.amazonaws\.com|protocol-icons\.s3\.amazonaws\.com|cdn\.zerion\.io|assets\.zerion\.io)\/[a-zA-Z0-9%._/+-]{1,300}\.(?:png|jpg|jpeg|webp|svg)$/;
const SAFE_LLAMA = /^https:\/\/icons\.llama\.fi\/[a-z0-9%._-]{1,80}\.jpg$/;

export function safeLogoSrc(src: string | null | undefined): string | null {
  return src && (SAFE_LOCAL.test(src) || SAFE_LLAMA.test(src) || SAFE_ZERION.test(src)) && !src.includes('..') ? src : null;
}

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
  const safe = safeLogoSrc(src);
  const [failed, setFailed] = useState(false);
  if (!safe || failed) {
    return (
      <span role="img" aria-label={label} className={cn('inline-flex', className)}>
        <Letters text={label} size={size} square={square} />
      </span>
    );
  }
  return (
    <img
      src={safe}
      alt={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      title={label}
      onError={() => setFailed(true)}
      className={cn('shrink-0 bg-white object-cover ring-1 ring-divider', square ? 'rounded-[28%]' : 'rounded-full', className)}
      style={{ width: size, height: size }}
    />
  );
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
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="img" aria-label={alt}>
      <LogoImage src={logo} label={symbol} size={size} />
      {networkName !== undefined && networkName !== null && (
        <span className="absolute -bottom-0.5 -end-0.5 rounded-full bg-card p-px">
          <LogoImage src={networkLogo} label={networkName} size={badge} square />
        </span>
      )}
    </span>
  );
}
