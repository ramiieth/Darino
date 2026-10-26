/**
 * «پوزیشن برترها» به زبان تصمیم — برای هر دارایی سه جواب:
 *   ۱) برترها کدام طرف‌اند (اجماع دلار + سرشماری، از consensus)
 *   ۲) ثابت‌قدم‌ها هم همان را می‌گویند یا نه
 *   ۳) طرف غالب الان در سود است یا زیان (فاصلهٔ میانگین ورود از قیمت)
 * زمینه است نه سیگنال؛ بخشی از پوزیشن‌ها جای دیگری هج شده‌اند. Pure.
 */
import { aggregatePositions, consensus, type CoinPositioning, type TraderPosition } from '../../traders/domain/positions.js';

export type Side = 'long' | 'short';

export interface CrowdRow extends CoinPositioning {
  side: Side | null;
  /** طرف بزرگ‌تر دلاری، وقتی اجماع نیست */
  heavier: Side;
  steadySide: Side | null;
  steadyCount: number;
  /** ٪ سود/زیان قیمتی طرف غالب از میانگین ورودش (مثبت = در سود) */
  entryGapPct: number | null;
  traders: number;
}

export function entryGap(side: Side, entry: number | null, mark: number | null): number | null {
  if (!entry || !mark) return null;
  return side === 'long' ? ((mark - entry) / entry) * 100 : ((entry - mark) / entry) * 100;
}

export function crowdRows(positions: TraderPosition[]): CrowdRow[] {
  const steadyBy = new Map(aggregatePositions(positions.filter((p) => p.steady)).map((c) => [c.coin, c]));
  return aggregatePositions(positions).map((c) => {
    const side = consensus(c);
    const heavier: Side = c.longUsd >= c.shortUsd ? 'long' : 'short';
    const lead = side ?? heavier;
    const st = steadyBy.get(c.coin);
    return {
      ...c,
      side,
      heavier,
      steadySide: st ? consensus(st) : null,
      steadyCount: st ? st.longCount + st.shortCount : 0,
      entryGapPct: entryGap(lead, lead === 'long' ? c.avgEntryLong : c.avgEntryShort, c.markPx),
      traders: new Set(c.positions.map((p) => p.address)).size
    };
  });
}

export interface CrowdTotals {
  longUsd: number;
  shortUsd: number;
  traders: number;
  coins: number;
}

export function crowdTotals(positions: TraderPosition[]): CrowdTotals {
  return {
    longUsd: positions.filter((p) => p.side === 'long').reduce((a, p) => a + p.sizeUsd, 0),
    shortUsd: positions.filter((p) => p.side === 'short').reduce((a, p) => a + p.sizeUsd, 0),
    traders: new Set(positions.map((p) => p.address)).size,
    coins: new Set(positions.map((p) => p.coin)).size
  };
}

/** خلاصهٔ یک‌خطی رابطهٔ ثابت‌قدم‌ها با کل برترها */
export function steadyAgreement(r: Pick<CrowdRow, 'side' | 'steadySide' | 'steadyCount'>): 'agree' | 'disagree' | 'split' | 'none' {
  if (r.steadyCount === 0) return 'none';
  if (!r.steadySide) return 'split';
  if (!r.side) return 'split';
  return r.side === r.steadySide ? 'agree' : 'disagree';
}

/** سهم طرف غالب کل که از آن به بعد «جریان کل» یک‌طرفه حساب می‌شود */
export const ONE_SIDED = 0.6;
/** بالای این سهم، بخش بزرگی از پوزیشن‌ها احتمالاً هج دارایی اسپات است، نه شرط جهت‌دار */
export const HEDGE_HEAVY = 0.8;

/** طرف غالب کل برترها (null اگر متعادل) و سهمش */
export function flowOf(t: Pick<CrowdTotals, 'longUsd' | 'shortUsd'>): { side: Side | null; share: number } {
  const total = t.longUsd + t.shortUsd;
  if (!(total > 0)) return { side: null, share: 0 };
  const side: Side = t.longUsd >= t.shortUsd ? 'long' : 'short';
  const share = Math.max(t.longUsd, t.shortUsd) / total;
  return { side: share >= ONE_SIDED ? side : null, share };
}

/**
 * بازارهایی که برترها برخلاف جریان کل هم‌نظرند — وقتی کل برترها یک‌طرفه‌اند (مثلاً ۹۵٪ شورت به‌خاطر هج)،
 * اجماع هم‌جهت با جریان چیز تازه‌ای نمی‌گوید؛ اجماع خلاف جریان شرط آگاهانه است.
 */
export function againstFlow(rows: CrowdRow[], flow: Side | null): CrowdRow[] {
  return flow ? rows.filter((r) => r.side && r.side !== flow) : [];
}
