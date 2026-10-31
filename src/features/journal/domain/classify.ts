/**
 * تفکیک دفترها: «جهت‌دار» در برابر «دلتا نوترال»
 *
 * ترتیب تصمیم (اولی که جواب بدهد برنده است):
 *   ۱. انتخاب دستی کاربر روی همان معامله
 *   ۲. نقش حساب در تنظیمات (مثلاً لایتر رابین‌هود و آرکوس = نوترال)
 *   ۳. تشخیص خودکار پوشش: پای مخالف روی حساب دیگر، همان دارایی پایه، هم‌پوشانی زمانی کافی
 *      و اندازهٔ اسمی نزدیک → هر دو پا نوترال
 *   ۴. در غیر این صورت جهت‌دار
 * چرا مهم است؟ پای پوششی که ضرر داده «معاملهٔ بازنده» نیست؛ اگر قاطی شود حسابرسی جهت‌دار حکم غلط می‌دهد.
 */
import type { AccountRole, BookKind, ClassifiedTrade, JournalSettings, Trade, TradeNote } from './types';

export const DEFAULT_ROLE_BY_VENUE: Partial<Record<Trade['venue'], AccountRole>> = {
  'lighter-robinhood': 'neutral',
  arcus: 'neutral',
  // حساب فارکس با پرپ هم‌نام (XAU) پوشش حساب نشود
  metatrader: 'directional'
};

export function roleOf(account: string, venue: Trade['venue'], roles: JournalSettings['roles']): AccountRole {
  return roles[account] ?? DEFAULT_ROLE_BY_VENUE[venue] ?? 'auto';
}

/** نسبت هم‌پوشانی زمانی دو بازه به کوتاه‌ترشان */
export function overlapRatio(a: Trade, b: Trade, now: number): number {
  const aEnd = a.closeTime ?? now, bEnd = b.closeTime ?? now;
  const inter = Math.min(aEnd, bEnd) - Math.max(a.openTime, b.openTime);
  const shorter = Math.min(aEnd - a.openTime, bEnd - b.openTime);
  if (inter <= 0) return 0;
  return shorter <= 0 ? 1 : Math.min(1, inter / shorter);
}

function sizeRatio(a: Trade, b: Trade): number {
  const x = a.maxNotional, y = b.maxNotional;
  if (!(x > 0) || !(y > 0)) return Infinity;
  return Math.max(x, y) / Math.min(x, y);
}

/** جفت‌های پوشش: پای مخالف، دارایی یکسان، حساب متفاوت */
export function findHedgePairs(trades: readonly Trade[], hedge: JournalSettings['hedge'], now: number): [number, number][] {
  const pairs: [number, number][] = [];
  const byBase = new Map<string, number[]>();
  trades.forEach((t, i) => {
    const arr = byBase.get(t.base);
    if (arr) arr.push(i);
    else byBase.set(t.base, [i]);
  });
  for (const idx of byBase.values()) {
    // مرتب بر حسب شروع؛ فقط بازه‌هایی که هم‌پوشانی دارند مقایسه می‌شوند (نه همه با همه)
    idx.sort((p, q) => trades[p].openTime - trades[q].openTime);
    for (let x = 0; x < idx.length; x++) {
      const end = trades[idx[x]].closeTime ?? now;
      for (let y = x + 1; y < idx.length && trades[idx[y]].openTime <= end; y++) {
        const a = trades[idx[x]], b = trades[idx[y]];
        if (a.account === b.account || a.direction === b.direction || a.venue === 'metatrader' || b.venue === 'metatrader') continue;
        if (overlapRatio(a, b, now) < hedge.minOverlap) continue;
        if (sizeRatio(a, b) > hedge.maxSizeRatio) continue;
        pairs.push([idx[x], idx[y]]);
      }
    }
  }
  return pairs;
}

/** گروه‌های پوشش با Union-Find روی جفت‌ها */
function groups(n: number, pairs: [number, number][]): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b] of pairs) parent[find(a)] = find(b);
  return parent.map((_, i) => find(i));
}

export function classifyTrades(
  trades: readonly Trade[],
  settings: Pick<JournalSettings, 'roles' | 'hedge'>,
  notes: ReadonlyMap<string, TradeNote>,
  now = Date.now()
): ClassifiedTrade[] {
  const pairs = findHedgePairs(trades, settings.hedge, now);
  const paired = new Set(pairs.flat());
  const root = groups(trades.length, pairs);
  return trades.map((t, i) => {
    const manual = notes.get(t.id)?.book;
    const role = roleOf(t.account, t.venue, settings.roles);
    const group = paired.has(i) ? `h:${trades[root[i]].id}` : null;
    let book: BookKind;
    let reason: string;
    if (manual) {
      book = manual;
      reason = 'انتخاب دستی شما';
    } else if (role === 'neutral') {
      book = 'neutral';
      reason = 'حساب در تنظیمات «دلتا نوترال» است';
    } else if (role === 'directional') {
      book = 'directional';
      reason = 'حساب در تنظیمات «جهت‌دار» است';
    } else if (group) {
      book = 'neutral';
      reason = 'پای مخالف هم‌زمان روی حساب دیگر پیدا شد (پوشش)';
    } else {
      book = 'directional';
      reason = 'پوشش مخالفی پیدا نشد';
    }
    return { ...t, book, bookReason: reason, hedgeGroup: book === 'neutral' ? group : null };
  });
}
