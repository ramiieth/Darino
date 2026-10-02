/** ============================================================
 * ارزش‌گذاری و تطبیق موجودی دفتر با snapshot همگام‌شده
 *
 *  • برای هر محل فقط یک منبع حقیقت جمع زده می‌شود:
 *      حساب Arcus با snapshot معتبر  → equity طبق تعریف رسمی API
 *      سایر محل‌ها / Arcus بدون snapshot → موجودی محاسبه‌شده از دفتر
 *    موجودی دفتر و snapshot هرگز با هم جمع نمی‌شوند؛ دفتر فقط برای تطبیق نشان داده می‌شود.
 *  • equity آرکوس = netQuoteBalance + Σ(size × oracle) — PnL و وثیقه داخل آن است؛
 *    ارزش اسمی پوزیشن‌ها به‌عنوان دارایی مستقل اضافه نمی‌شود.
 *  • قیمت ناموجود → «نامشخص»؛ ارزش نامعلوم صفر نیست و از مجموع کنار گذاشته می‌شود.
 *  • هیچ استیبل‌کوینی بی‌قید ۱ دلار فرض نمی‌شود؛ قیمت باید از منبع (با زمان) بیاید.
 * ============================================================ */
import { add, mul } from './decimal';
import type { BalanceRow, InTransitRow } from './ledger';
import type { Asset, Holding } from './types';

export interface PriceInfo {
  usd: number;
  source: string;
  fetchedAt: number;
}

export interface ArcusSnapshotSummary {
  /** شناسهٔ holding مرتبط */
  holdingId: string;
  equity: string;
  fetchedAt: number;
  stale: boolean;
}

export interface ValuedRow extends BalanceRow {
  usdValue: string | null;
  price: PriceInfo | null;
  /** این ردیف در مجموع لحاظ نمی‌شود (چون snapshot همگام‌شده جایگزین آن است) */
  supersededBySync: boolean;
}

export interface PortfolioValuation {
  rows: ValuedRow[];
  /** مجموع ارزش‌های معلوم (رشتهٔ دقیق) */
  knownTotalUsd: string;
  /** ردیف‌های بدون قیمت (از مجموع حذف شده‌اند) */
  unpricedCount: number;
  arcus: ArcusSnapshotSummary[];
  inTransitUsd: string;
  inTransitUnpriced: number;
}

function priceOf(asset: Asset | undefined, prices: Map<string, PriceInfo>): PriceInfo | null {
  if (!asset?.coingeckoId) return null;
  return prices.get(asset.coingeckoId) ?? null;
}

export function valuePortfolio(
  balances: BalanceRow[],
  inTransit: InTransitRow[],
  assets: Map<string, Asset>,
  holdings: Map<string, Holding>,
  prices: Map<string, PriceInfo>,
  arcusSnapshots: ArcusSnapshotSummary[]
): PortfolioValuation {
  const synced = new Set(arcusSnapshots.map((s) => s.holdingId));
  let total = '0';
  let unpriced = 0;

  const rows: ValuedRow[] = balances.map((b) => {
    const holding = holdings.get(b.holdingId);
    const superseded = holding?.kind === 'arcus' && synced.has(b.holdingId);
    const asset = assets.get(b.assetId);
    const price = priceOf(asset, prices);
    const usdValue = price ? mul(b.quantity, price.usd) : null;
    if (!superseded) {
      if (usdValue !== null) total = add(total, usdValue);
      else unpriced++;
    }
    return { ...b, usdValue, price, supersededBySync: superseded };
  });

  for (const s of arcusSnapshots) total = add(total, s.equity);

  let transitTotal = '0';
  let transitUnpriced = 0;
  for (const t of inTransit) {
    const price = priceOf(assets.get(t.assetId), prices);
    if (price) transitTotal = add(transitTotal, mul(t.quantity, price.usd));
    else transitUnpriced++;
  }
  // در حال انتقال یک‌بار و فقط این‌جا شمرده می‌شود (مبدا قبلاً کم شده، مقصد هنوز اعتبار نگرفته)
  total = add(total, transitTotal);

  return {
    rows,
    knownTotalUsd: total,
    unpricedCount: unpriced,
    arcus: arcusSnapshots,
    inTransitUsd: transitTotal,
    inTransitUnpriced: transitUnpriced
  };
}
