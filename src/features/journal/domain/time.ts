/**
 * زمان محلی برای سطل‌بندی روز، ساعت، روز هفته و هفتهٔ ISO (با سال — هفتهٔ ۱ سال بعد روی هفتهٔ ۱ امسال نمی‌نشیند)
 * منطقهٔ زمانی از مرورگر خوانده می‌شود؛ در آزمون‌ها صریح داده می‌شود.
 */

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const cache = new Map<string, Intl.DateTimeFormat>();
function parts(ts: number, tz: string): { y: number; m: number; d: number; h: number; wd: number } {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
    cache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, wd };
}

/** YYYY-MM-DD به وقت محلی */
export function dayKey(ts: number, tz: string): string {
  const { y, m, d } = parts(ts, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function hourOf(ts: number, tz: string): number {
  return parts(ts, tz).h;
}

/** ۰ = یکشنبه … ۶ = شنبه */
export function weekdayOf(ts: number, tz: string): number {
  return parts(ts, tz).wd;
}

export const WEEKDAY_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

/** هفتهٔ ISO-8601 به وقت محلی: «2026-W44» */
export function isoWeekKey(ts: number, tz: string): string {
  const { y, m, d } = parts(ts, tz);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** بازهٔ میلی‌ثانیه‌ای تقریبی یک هفتهٔ ISO (دوشنبه ۰۰:۰۰ UTC تا دوشنبهٔ بعد) — برای برچسب و ناوبری */
export function isoWeekStartUtc(week: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const y = Number(m[1]), w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = Date.UTC(y, 0, 4) - (day - 1) * 86_400_000;
  return monday + (w - 1) * 7 * 86_400_000;
}

export function shiftWeek(week: string, delta: number): string {
  const start = isoWeekStartUtc(week);
  if (start === null) return week;
  return isoWeekKey(start + delta * 7 * 86_400_000 + 3 * 86_400_000, 'UTC');
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function stdev(values: readonly number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}
