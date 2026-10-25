/**
 * «برترها الان چه دارند» — پوزیشن‌های باز حساب‌های برتر، تجمیع‌شده به تفکیک دارایی
 *
 * زمینه است نه سیگنال: بخشی از پوزیشن‌ها جای دیگری هج شده‌اند. قیمت لیکوئید در مارجین کراس
 * لحظه‌ای است و با هر حرکت جابه‌جا می‌شود. Pure.
 */
import type { HlAccountState } from './types.js';

export interface TraderPosition {
  address: string;
  steady: boolean;
  coin: string;
  side: 'long' | 'short';
  sizeUsd: number;
  entryPx: number | null;
  markPx: number | null;
  liqPx: number | null;
  leverage: number | null;
  upnl: number;
  /** سهم این پوزیشن از ارزش حساب (٪) */
  accountPct: number | null;
}

export interface LiqLevel {
  px: number;
  usd: number;
  side: 'long' | 'short';
  /** فاصله از قیمت فعلی (٪، مثبت = بالاتر) */
  distancePct: number | null;
}

export interface CoinPositioning {
  coin: string;
  markPx: number | null;
  longUsd: number;
  shortUsd: number;
  longCount: number;
  shortCount: number;
  /** خالص لانگ منهای شورت (دلار) */
  netUsd: number;
  upnl: number;
  avgEntryLong: number | null;
  avgEntryShort: number | null;
  liqLevels: LiqLevel[];
  positions: TraderPosition[];
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export function positionsOf(address: string, steady: boolean, state: HlAccountState | null | undefined): TraderPosition[] {
  const accountValue = n(state?.marginSummary?.accountValue);
  const out: TraderPosition[] = [];
  for (const ap of state?.assetPositions ?? []) {
    const p = ap?.position;
    const szi = n(p?.szi);
    const value = Math.abs(n(p?.positionValue) ?? 0);
    if (!p || !szi || !(value > 0)) continue;
    const liq = n(p.liquidationPx);
    out.push({
      address,
      steady,
      coin: String(p.coin),
      side: szi > 0 ? 'long' : 'short',
      sizeUsd: value,
      entryPx: n(p.entryPx),
      markPx: value / Math.abs(szi),
      liqPx: liq !== null && liq > 0 ? liq : null,
      leverage: n(p.leverage?.value),
      upnl: n(p.unrealizedPnl) ?? 0,
      accountPct: accountValue && accountValue > 0 ? (value / accountValue) * 100 : null
    });
  }
  return out;
}

export function aggregatePositions(positions: TraderPosition[]): CoinPositioning[] {
  const byCoin = new Map<string, TraderPosition[]>();
  for (const p of positions) byCoin.set(p.coin, [...(byCoin.get(p.coin) ?? []), p]);
  const out: CoinPositioning[] = [];
  for (const [coin, list] of byCoin) {
    const longs = list.filter((p) => p.side === 'long');
    const shorts = list.filter((p) => p.side === 'short');
    const sum = (xs: TraderPosition[]) => xs.reduce((a, p) => a + p.sizeUsd, 0);
    const avgEntry = (xs: TraderPosition[]) => {
      const w = xs.filter((p) => p.entryPx !== null);
      const total = sum(w);
      return total > 0 ? w.reduce((a, p) => a + p.entryPx! * p.sizeUsd, 0) / total : null;
    };
    const marks = list.map((p) => p.markPx).filter((x): x is number => x !== null);
    const markPx = marks.length ? marks[0] : null;
    out.push({
      coin,
      markPx,
      longUsd: sum(longs),
      shortUsd: sum(shorts),
      longCount: longs.length,
      shortCount: shorts.length,
      netUsd: sum(longs) - sum(shorts),
      upnl: list.reduce((a, p) => a + p.upnl, 0),
      avgEntryLong: avgEntry(longs),
      avgEntryShort: avgEntry(shorts),
      liqLevels: list
        .filter((p) => p.liqPx !== null)
        .map((p) => ({ px: p.liqPx!, usd: p.sizeUsd, side: p.side, distancePct: markPx ? ((p.liqPx! - markPx) / markPx) * 100 : null }))
        .sort((a, b) => Math.abs(a.distancePct ?? Infinity) - Math.abs(b.distancePct ?? Infinity)),
      positions: [...list].sort((a, b) => b.sizeUsd - a.sizeUsd)
    });
  }
  return out.sort((a, b) => b.longUsd + b.shortUsd - (a.longUsd + a.shortUsd));
}

/**
 * «اکثراً لانگ/شورت» فقط وقتی هم دلار و هم سرشماری هم‌جهت‌اند؛ یک نهنگ به‌تنهایی برچسب نمی‌سازد.
 * دلار: خالص ≥ ۴۰٪ کل · سرشماری: دست‌کم ۶۰٪ تریدرها و حداقل ۳ نفر در همان سمت.
 */
export function consensus(c: Pick<CoinPositioning, 'longUsd' | 'shortUsd' | 'longCount' | 'shortCount'>): 'long' | 'short' | null {
  const usd = c.longUsd + c.shortUsd;
  const heads = c.longCount + c.shortCount;
  if (!(usd > 0) || heads === 0) return null;
  const bias = (c.longUsd - c.shortUsd) / usd;
  const side = bias >= 0.4 ? 'long' : bias <= -0.4 ? 'short' : null;
  if (!side) return null;
  const count = side === 'long' ? c.longCount : c.shortCount;
  return count >= 3 && count / heads >= 0.6 ? side : null;
}
