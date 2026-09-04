/**
 * لوگوی اختصاصی DefiLlama با زنجیره فالبک:
 *  - زنجیره‌ها: https://icons.llama.fi/{chain}.jpg
 *  - پروتکل‌ها/استخرها/استیبل‌کوین‌ها: https://icons.llamao.fi/icons/protocols/{slug}
 *  - فالبک: آواتار حرفی شیشه‌ای
 */
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

export function chainLogoUrl(chain: string): string {
  return `https://icons.llama.fi/${encodeURIComponent(chain.toLowerCase())}.jpg`;
}

export function protocolLogoUrl(slug: string): string {
  return `https://icons.llamao.fi/icons/protocols/${encodeURIComponent(slug.toLowerCase())}`;
}

const GRADIENTS = [
  'from-teal-400 to-emerald-600',
  'from-indigo-400 to-violet-600',
  'from-sky-400 to-blue-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600'
];

export function LlamaLogo({
  src,
  fallbackText,
  size = 32,
  className
}: {
  src: string | null | undefined;
  /** متن آواتار در صورت نبود لوگو */
  fallbackText: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const g = GRADIENTS[(fallbackText.charCodeAt(0) || 0) % GRADIENTS.length];
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-black text-white',
          g,
          className
        )}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.3) }}
      >
        {fallbackText.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={fallbackText}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 rounded-full bg-card object-contain ring-1 ring-line/10',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
