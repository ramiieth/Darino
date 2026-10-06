/** App-designed receipt marks; the network badge is supplied by the actual position. */
export function yieldTokenIdentity(symbol: string) {
  const match = /^(YT|PT)(?:$|[-\s]+(.+))/i.exec(symbol.trim());
  if (!match) return null;
  const kind = match[1].toUpperCase() as 'YT' | 'PT';
  const underlying = (match[2] ?? '').replace(/[-\s]+(?:\d{1,2}[A-Z]{3}\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{8})$/i, '') || kind;
  let hash = 0;
  for (const char of symbol.toUpperCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { kind, underlying, rotation: hash % 360 };
}

export function YieldTokenMark({ symbol, size }: { symbol: string; size: number }) {
  const identity = yieldTokenIdentity(symbol);
  if (!identity) return null;
  const { kind, underlying, rotation } = identity;
  const color = kind === 'YT' ? '#6D28D9' : '#0F766E';
  const background = kind === 'YT' ? '#F5F3FF' : '#F0FDFA';
  const dimension = Math.round(size * .96);
  // React escapes provider symbols; no remote image or raw SVG markup is used.
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={dimension} height={dimension}
    aria-hidden="true" focusable="false" data-yield-token={kind} data-yield-symbol={symbol} className="shrink-0">
    <circle cx="24" cy="24" r="23" fill={background} stroke={color} strokeWidth="1.5" />
    <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeOpacity=".35" strokeWidth="2"
      strokeDasharray="7 4 2 4" transform={`rotate(${rotation} 24 24)`} />
    <path d={kind === 'YT' ? 'M21 6L24 3L27 6' : 'M21 4H27M22 6H26'} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <text x="24" y="23" textAnchor="middle" fill={color} fontFamily="Arial, sans-serif" fontWeight="800" fontSize="16" direction="ltr">{kind}</text>
    {underlying !== kind && <text x="24" y="32" textAnchor="middle" fill={color} fontFamily="Arial, sans-serif" fontWeight="700"
      fontSize={underlying.length > 6 ? '6' : '7.5'} textLength={underlying.length > 8 ? 31 : undefined} lengthAdjust="spacingAndGlyphs" direction="ltr">{underlying.length > 10 ? underlying.slice(0,9) + '…' : underlying}</text>}
  </svg>;
}
