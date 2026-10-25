/**
 * «آدرس‌های من» و دنبال کردن تریدرها — مشترک بین مرورگر و سرور
 *  - فهرست ذخیره‌شده در حساب کاربر همگام می‌شود (گوشی ↔ کامپیوتر)
 *  - تیک اعلان‌ها fillهای تازهٔ تریدرهای دنبال‌شده را به رویداد پوزیشن تبدیل می‌کند:
 *    باز کردن، بستن، بزرگ/کوچک کردن، برگشت جهت — با اندازهٔ دلاری و قیمت
 * Pure.
 */
import { chainOrder, isPerpCoin } from './roundTrips.js';
import type { Fill } from './types.js';

export interface SavedTrader {
  address: string;
  label: string | null;
  addedAt: number;
  /** اعلان پوش برای تغییر پوزیشن‌ها */
  follow: boolean;
}

export const MAX_SAVED = 50;
export const MAX_FOLLOW = 20;
/** بزرگ/کوچک کردن کمتر از این ارزش دلاری اعلان نمی‌شود (باز و بستن همیشه) */
export const MIN_EVENT_USD = 5_000;

const ADDRESS = /^0x[0-9a-f]{40}$/;

export function sanitizeSaved(raw: unknown): SavedTrader[] {
  const out: SavedTrader[] = [];
  let follows = 0;
  for (const r of Array.isArray(raw) ? raw : []) {
    const x = (r ?? {}) as Partial<SavedTrader>;
    const address = typeof x.address === 'string' ? x.address.trim().toLowerCase() : '';
    if (!ADDRESS.test(address) || out.some((s) => s.address === address)) continue;
    const label = typeof x.label === 'string' ? x.label.replace(/[<>]/g, '').trim().slice(0, 40) || null : null;
    const follow = x.follow === true && follows < MAX_FOLLOW;
    if (follow) follows++;
    out.push({ address, label, addedAt: Number.isFinite(x.addedAt) ? Number(x.addedAt) : Date.now(), follow });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

/** ادغام فهرست محلی (قبل از ورود) با فهرست حساب؛ حساب مرجع است، آدرس‌های تازهٔ محلی اضافه می‌شوند */
export function mergeSaved(server: SavedTrader[], local: SavedTrader[]): SavedTrader[] {
  const extra = local.filter((l) => !server.some((s) => s.address === l.address));
  return sanitizeSaved([...server, ...extra]);
}

export type EventKind = 'open' | 'close' | 'increase' | 'reduce' | 'flip';
export interface PositionEvent {
  coin: string;
  kind: EventKind;
  /** جهت بعد از رویداد (برای بستن: جهتی که بسته شد) */
  side: 'long' | 'short';
  usd: number;
  px: number;
  /** سود تحقق‌یافته در این رویداد */
  pnl: number;
  time: number;
}

const num = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** fillهای تازهٔ یک آدرس → یک رویداد خالص برای هر نماد */
export function positionEvents(fills: Fill[], minUsd = MIN_EVENT_USD): PositionEvent[] {
  const byCoin = new Map<string, Fill[]>();
  for (const f of fills) if (isPerpCoin(f.coin)) byCoin.set(f.coin, [...(byCoin.get(f.coin) ?? []), f]);
  const out: PositionEvent[] = [];
  for (const [coin, list] of byCoin) {
    const ordered = chainOrder(list);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const before = num(first.startPosition);
    const after = num(last.startPosition) + (last.side === 'B' ? 1 : -1) * Math.abs(num(last.sz));
    const px = num(last.px);
    const pnl = ordered.reduce((a, f) => a + num(f.closedPnl), 0);
    const eps = 1e-9 * Math.max(1, Math.abs(before), Math.abs(after));
    const flat = (v: number) => Math.abs(v) <= eps;
    let kind: EventKind;
    let side: PositionEvent['side'];
    let qty: number;
    if (flat(before) && flat(after)) continue;
    if (flat(before)) [kind, side, qty] = ['open', after > 0 ? 'long' : 'short', Math.abs(after)];
    else if (flat(after)) [kind, side, qty] = ['close', before > 0 ? 'long' : 'short', Math.abs(before)];
    else if (Math.sign(before) !== Math.sign(after)) [kind, side, qty] = ['flip', after > 0 ? 'long' : 'short', Math.abs(after)];
    else if (Math.abs(after) > Math.abs(before)) [kind, side, qty] = ['increase', after > 0 ? 'long' : 'short', Math.abs(after) - Math.abs(before)];
    else [kind, side, qty] = ['reduce', after > 0 ? 'long' : 'short', Math.abs(before) - Math.abs(after)];
    const usd = qty * px;
    if ((kind === 'increase' || kind === 'reduce') && usd < minUsd) continue;
    out.push({ coin, kind, side, usd, px, pnl, time: last.time });
  }
  return out.sort((a, b) => b.usd - a.usd);
}

const SIDE_FA = { long: 'لانگ', short: 'شورت' } as const;
const usdText = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}k` : `$${v.toFixed(0)}`);
const pxText = (v: number) => (v >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toPrecision(4));

export function eventText(e: PositionEvent): string {
  const side = SIDE_FA[e.side];
  const pnl = e.pnl ? ` · سود ${e.pnl > 0 ? '+' : '-'}${usdText(Math.abs(e.pnl))}` : '';
  switch (e.kind) {
    case 'open': return `${side} ${e.coin} باز کرد ${usdText(e.usd)} @ ${pxText(e.px)}`;
    case 'close': return `${side} ${e.coin} را بست @ ${pxText(e.px)}${pnl}`;
    case 'flip': return `جهت ${e.coin} را برگرداند → ${side} ${usdText(e.usd)} @ ${pxText(e.px)}${pnl}`;
    case 'increase': return `${side} ${e.coin} را بزرگ کرد +${usdText(e.usd)} @ ${pxText(e.px)}`;
    case 'reduce': return `${side} ${e.coin} را کوچک کرد −${usdText(e.usd)} @ ${pxText(e.px)}${pnl}`;
  }
}

export function followMessage(name: string, events: PositionEvent[]): { title: string; body: string } {
  const shown = events.slice(0, 3).map(eventText);
  const more = events.length > 3 ? ` (+${events.length - 3} مورد دیگر)` : '';
  return { title: `تریدر دنبال‌شده: ${name}`, body: shown.join(' · ') + more };
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
