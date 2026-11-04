/**
 * پوزیشن‌های باز لحظه‌ای صرافی → معاملهٔ باز ژورنال (خالص، بدون شبکه)
 *
 *   چرا لازم است؟ معاملهٔ باز از اجراها ساخته می‌شود؛ اگر اجرای ورود خارج از تاریخچهٔ خوانده‌شده باشد
 *   (پنجرهٔ N روزهٔ حساب نوترال لایتر، سقف ۱۰٬۰۰۰ اجرای هایپرلیکوئید، تاریخچهٔ کوتاه تی‌اکس‌فلو)
 *   معامله «ناقص» است و قیمت ورود ندارد — یا اصلاً ساخته نمی‌شود. خود صرافی ولی پوزیشن باز و میانگین ورود را می‌دهد.
 *
 *   • معاملهٔ باز هم‌حساب، هم‌دارایی و هم‌جهت پیدا شد → قیمت ورود و اندازه از صرافی تکمیل می‌شود (اگر نامعلوم بود).
 *   • پیدا نشد → یک معاملهٔ باز «از پوزیشن صرافی» ساخته می‌شود (شروع نامعلوم = truncated، بدون سود محقق).
 */
import type { Trade, Venue } from './types';
import { baseOf, safeSymbol } from './roundTrips';

export interface LivePosition {
  /** کلید حساب ژورنال (venue:address[:sub]) */
  account: string;
  venue: Venue;
  symbol: string;
  direction: 'long' | 'short';
  size: number;
  entry: number | null;
  mark: number | null;
  pnl: number | null;
}

export const liveTradeId = (p: Pick<LivePosition, 'account' | 'symbol' | 'direction'>) => `${p.account}|live|${safeSymbol(p.symbol)}|${p.direction}`;

export function mergeLivePositions(trades: readonly Trade[], live: readonly LivePosition[], now = Date.now()): Trade[] {
  const out = [...trades];
  const openIdx = new Map<string, number>();
  out.forEach((t, i) => { if (t.open) openIdx.set(`${t.account}|${t.base}|${t.direction}`, i); });
  for (const p of live) {
    if (!(p.size > 0) || !p.symbol) continue;
    const base = baseOf(p.symbol);
    const k = `${p.account}|${base}|${p.direction}`;
    const i = openIdx.get(k);
    const notional = p.entry !== null ? p.size * p.entry : p.mark !== null ? p.size * p.mark : 0;
    if (i !== undefined) {
      const t = out[i];
      if (t.entryPx === null && p.entry !== null) out[i] = { ...t, entryPx: p.entry, maxSize: Math.max(t.maxSize, p.size), maxNotional: Math.max(t.maxNotional, notional) };
      continue;
    }
    out.push({
      id: liveTradeId(p),
      account: p.account,
      venue: p.venue,
      symbol: p.symbol,
      base,
      direction: p.direction,
      openTime: now,
      closeTime: null,
      open: true,
      truncated: true,
      entryPx: p.entry,
      exitPx: null,
      maxSize: p.size,
      maxNotional: notional,
      volume: 0,
      grossPnl: p.pnl ?? 0,
      fees: null,
      funding: null,
      netPnl: p.pnl ?? 0,
      fills: 0,
      liquidated: false
    });
    openIdx.set(k, out.length - 1);
  }
  return out;
}

/** هایپرلیکوئید / تی‌اکس‌فلو clearinghouseState → پوزیشن‌های باز */
export function hlLivePositions(account: string, venue: Venue, state: unknown): LivePosition[] {
  const ap = (state as { assetPositions?: { position?: Record<string, unknown> }[] } | null)?.assetPositions;
  if (!Array.isArray(ap)) return [];
  return ap.flatMap((r): LivePosition[] => {
    const p = r?.position ?? {};
    const szi = Number(p.szi);
    const coin = typeof p.coin === 'string' ? p.coin : '';
    if (!coin || !Number.isFinite(szi) || szi === 0) return [];
    const size = Math.abs(szi);
    const entry = Number(p.entryPx);
    const value = Number(p.positionValue);
    const pnl = Number(p.unrealizedPnl);
    return [{ account, venue, symbol: coin, direction: szi > 0 ? 'long' : 'short', size, entry: entry > 0 ? entry : null, mark: value > 0 ? value / size : null, pnl: Number.isFinite(pnl) ? pnl : null }];
  });
}
