/**
 * «وضعیت امروز» دلتا نوترال — چک‌لیست ورود و خروج، فقط از اعداد واقعی
 *
 *  سبز (وارد شوید): همهٔ شرط‌ها برقرار
 *  قرمز (وارد نشوید / اگر موقعیت دارید خارج شوید): اختلاف فاندینگ ۷ روزه یا سود خالص بدون پوینت منفی،
 *        یا فاصله تا بسته شدن اجباری خیلی کم
 *  زرد (صبر کنید): بقیهٔ حالت‌ها، یا دادهٔ ناکافی
 *  تصمیم همین‌جاست؛ دستیار AI فقط توضیح می‌دهد و خلافش نمی‌گوید.
 */

/** کمترین میانگین اختلاف فاندینگ ۷ روزه (٪ سالانه) که ارزش ورود دارد */
export const MIN_SPREAD_APR_7D = 5;
/** کمترین سهم ساعت‌های سودده در ۲۴ ساعت اخیر */
export const MIN_PROFITABLE_SHARE_24H = 0.8;
/** کمترین فاصلهٔ امن تا بسته شدن اجباری (٪ حرکت قیمت) */
export const MIN_LIQ_DISTANCE_PCT = 20;
/** زیر این فاصله: خطر جدی → قرمز */
export const DANGER_LIQ_DISTANCE_PCT = 10;
/** بیشترین اختلاف قیمت دو صرافی برای ورود و خروج ارزان (٪) */
export const MAX_BASIS_PCT = 0.3;

export type CheckState = 'ok' | 'bad' | 'unknown';
export type Verdict = 'enter' | 'wait' | 'avoid';

export interface ChecklistInput {
  /** میانگین اختلاف فاندینگ پرداخت‌شده در ۷ روز اخیر (٪ سالانه، به نفع همین جهت) */
  spreadApr7d: number | null;
  /** سهم ساعت‌های سودده در ۲۴ ساعت اخیر (۰ تا ۱) */
  profitableShare24h: number | null;
  /** سود خالص تخمینی دورهٔ نگهداری، بدون پوینت */
  netWithoutPoints: number;
  liquidationDistancePct: number | null;
  basisPct: number | null;
  lowLiquidity: boolean;
}

export interface CheckItem {
  key: 'spread7d' | 'stable24h' | 'net' | 'liquidation' | 'basis' | 'liquidity';
  state: CheckState;
}

export interface Checklist {
  verdict: Verdict;
  items: CheckItem[];
}

const st = (v: number | null, ok: (x: number) => boolean): CheckState => (v === null ? 'unknown' : ok(v) ? 'ok' : 'bad');

export function deltaChecklist(i: ChecklistInput): Checklist {
  const items: CheckItem[] = [
    { key: 'spread7d', state: st(i.spreadApr7d, (x) => x >= MIN_SPREAD_APR_7D) },
    { key: 'stable24h', state: st(i.profitableShare24h, (x) => x >= MIN_PROFITABLE_SHARE_24H) },
    { key: 'net', state: i.netWithoutPoints > 0 ? 'ok' : 'bad' },
    { key: 'liquidation', state: st(i.liquidationDistancePct, (x) => x >= MIN_LIQ_DISTANCE_PCT) },
    { key: 'basis', state: st(i.basisPct, (x) => Math.abs(x) <= MAX_BASIS_PCT) },
    { key: 'liquidity', state: i.lowLiquidity ? 'bad' : 'ok' }
  ];
  const avoid =
    (i.spreadApr7d !== null && i.spreadApr7d < 0) ||
    i.netWithoutPoints < 0 ||
    (i.liquidationDistancePct !== null && i.liquidationDistancePct < DANGER_LIQ_DISTANCE_PCT);
  const verdict: Verdict = avoid ? 'avoid' : items.every((x) => x.state === 'ok') ? 'enter' : 'wait';
  return { verdict, items };
}
