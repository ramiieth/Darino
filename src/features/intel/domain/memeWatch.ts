/**
 * فهرست انتظار میم‌کوین — اعلان فقط وقتی کوینی همهٔ فیلترها را رد کند و رژیم بازار هم روشن باشد
 * (یک بار در هر گذر از «نه» به «بله»؛ تا دوباره نیفتد اعلان تکراری نمی‌رود). Pure.
 */
import type { CoinScreen, Regime } from './memeScreen.js';

export const MAX_WATCH = 30;
const ID_RE = /^[a-z0-9-]{1,80}$/;

export interface MemeWatchState {
  ids: string[];
  /** آخرین وضعیت «آمادهٔ خرید» هر کوین */
  last: Record<string, boolean>;
}

export function sanitizeWatch(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, MAX_WATCH);
}

export function watchEvents(ids: string[], screen: { regime: Regime; coins: CoinScreen[] }, last: Record<string, boolean>) {
  const byId = new Map(screen.coins.map((c) => [c.id, c]));
  const next: Record<string, boolean> = {};
  const alerts: CoinScreen[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    // کوینی که داده ندارد وضعیت قبلی‌اش را نگه می‌دارد (اعلان کاذب بعد از برگشت داده نمی‌رود)
    if (!c) { next[id] = last[id] ?? false; continue; }
    const ready = screen.regime.state === 'on' && c.passes;
    if (ready && !last[id]) alerts.push(c);
    next[id] = ready;
  }
  return { alerts, next };
}

export function watchMessage(c: CoinScreen): { title: string; body: string } {
  return {
    title: `${c.symbol}: همهٔ فیلترها رد شد`,
    body: `بازار میم صعودی است و ${c.symbol} از فیلتر بقا، روند، نقدینگی خروج و امنیت گذشت. برنامهٔ خروج را قبل از خرید ببینید؛ توصیهٔ مالی نیست.`
  };
}
