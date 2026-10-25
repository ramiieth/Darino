/**
 * انتخاب «برترین‌ها» از لیدربورد عمومی هایپرلیکوئید (~۳۰ هزار حساب، ~۴۰ مگابایت)
 *
 * لیدربورد خام پر از مارکت‌میکر، والت و برندهٔ شانسی یک ماه است. فیلترها:
 *  - حساب معنادار (ارزش ≥ MIN_ACCOUNT)
 *  - سودده در کل سابقه و در ماه اخیر (نه فقط یک پنجره)
 *  - گردش ماهانه (حجم ÷ ارزش حساب) ≤ MAX_TURNOVER ← مارکت‌میکر و ربات پرتکرار حذف می‌شوند
 * خروجی کوچک است و روی سرور کش می‌شود؛ کلاینت هرگز فایل کامل را دانلود نمی‌کند.
 * Pure — مشترک بین سرور (api/_tradersRoute.ts) و تست‌ها.
 */

export type WindowName = 'day' | 'week' | 'month' | 'allTime';
export interface LeaderWindow {
  pnl: number;
  roi: number;
  vlm: number;
}
export interface LeaderRow {
  address: string;
  displayName: string | null;
  accountValue: number;
  windows: Record<WindowName, LeaderWindow>;
}
export interface Candidate extends LeaderRow {
  /** حجم ماه ÷ ارزش حساب */
  turnover: number;
}

export const MIN_ACCOUNT = 100_000;
export const MAX_TURNOVER = 150;
export const MAX_CANDIDATES = 100;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const WINDOWS: WindowName[] = ['day', 'week', 'month', 'allTime'];

export function isHlAddress(v: string): boolean {
  return ADDRESS_RE.test(v.trim());
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** ردیف‌های نامعتبر بی‌صدا کنار می‌روند */
export function parseLeaderboard(raw: unknown): LeaderRow[] {
  const rows = (raw as { leaderboardRows?: unknown })?.leaderboardRows;
  if (!Array.isArray(rows)) return [];
  const out: LeaderRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const address = typeof r?.ethAddress === 'string' ? r.ethAddress.toLowerCase() : '';
    const accountValue = n(r?.accountValue);
    if (!ADDRESS_RE.test(address) || accountValue === null) continue;
    const perf = new Map(Array.isArray(r.windowPerformances) ? (r.windowPerformances as [string, Record<string, unknown>][]) : []);
    const windows = {} as Record<WindowName, LeaderWindow>;
    let ok = true;
    for (const w of WINDOWS) {
      const p = perf.get(w);
      const pnl = n(p?.pnl), roi = n(p?.roi), vlm = n(p?.vlm);
      if (pnl === null || roi === null || vlm === null) { ok = false; break; }
      windows[w] = { pnl, roi, vlm };
    }
    if (!ok) continue;
    const name = typeof r.displayName === 'string' && r.displayName.trim() ? r.displayName.trim().slice(0, 40) : null;
    out.push({ address, displayName: name, accountValue, windows });
  }
  return out;
}

export function selectCandidates(rows: LeaderRow[], limit = MAX_CANDIDATES): Candidate[] {
  return rows
    .map((r) => ({ ...r, turnover: r.accountValue > 0 ? r.windows.month.vlm / r.accountValue : Infinity }))
    .filter(
      (r) =>
        r.accountValue >= MIN_ACCOUNT &&
        r.windows.allTime.pnl > 0 &&
        r.windows.allTime.roi > 0 &&
        r.windows.month.pnl > 0 &&
        r.windows.month.vlm > 0 &&
        r.turnover <= MAX_TURNOVER
    )
    .sort((a, b) => b.windows.allTime.pnl - a.windows.allTime.pnl)
    .slice(0, limit);
}
