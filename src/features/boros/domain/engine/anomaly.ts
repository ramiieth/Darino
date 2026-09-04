/** ============================================================
 * Boros Anomaly Detector + Liquidity Reality + Data Freshness
 *
 *  - Rate Anomaly: |Fixed − Underlying| بسیار بزرگ → Extreme Rate Dislocation
 *    بررسی: اعتبار نرخ، تازگی داده، نقدشوندگی، نزدیکی به سررسید
 *  - Liquidity واقعی: OI + Volume + Spread + قابلیت اجرا (نه فقط OI)
 *  - Data Freshness: timestamp/source/age → confidence
 * ============================================================ */
import type { BorosMarket } from '../types';
import { daysToMaturity } from './pnl';

/* ---------------- Rate Anomaly ---------------- */

export interface AnomalyInfo {
  detected: boolean;
  kind: 'extreme-dislocation' | 'stale-data' | 'thin-liquidity' | 'near-expiry' | 'none';
  reasons: string[];
  /** کاهش اعتماد (۰..۱) */
  confidencePenalty: number;
}

export interface AnomalyInput {
  m: BorosMarket;
  nowSec: number;
  /** آستانه انحراف مطلق (نسبت) — پیش‌فرض ۰.۲۰ (۲۰٪) */
  dislocationThreshold?: number;
  /** آستانه نقدشوندگی (کسر نotional) */
  minLiquidityRatio?: number;
  /** آستانه روزهای تا سررسید برای هشدار */
  nearExpiryDays?: number;
  /** سن داده (ms) — اگر بیشتر → stale */
  staleAfterMs?: number;
}

export const DEFAULT_ANOMALY: Required<Omit<AnomalyInput, 'm' | 'nowSec'>> = {
  dislocationThreshold: 0.2,
  minLiquidityRatio: 0.01,
  nearExpiryDays: 3,
  staleAfterMs: 30 * 60_000
};

/**
 * تشخیص ناهنجاری:
 *  ۱) |Fixed − Underlying| > آستانه → Extreme Rate Dislocation
 *  ۲) حجم نسبت به OI خیلی کم → Thin Liquidity
 *  ۳) نزدیک سررسید → Near Expiry
 *  ۴) داده کهنه (بدون timestamp → فرض کهنه نیست ولی اگر ohlcv خالی و …)
 */
export function detectAnomaly(input: AnomalyInput): AnomalyInfo {
  const cfg = { ...DEFAULT_ANOMALY, ...input };
  const { m, nowSec } = input;
  const reasons: string[] = [];
  let confidencePenalty = 0;
  let kind: AnomalyInfo['kind'] = 'none';

  const spread = Math.abs(m.floatingApr - m.markApr);
  if (spread > cfg.dislocationThreshold) {
    kind = 'extreme-dislocation';
    reasons.push(
      `انحراف شدید نرخ: |Fixed ${(m.markApr * 100).toFixed(2)}٪ − Underlying ${(m.floatingApr * 100).toFixed(2)}٪| = ${(spread * 100).toFixed(2)}٪ (آستانه ${(cfg.dislocationThreshold * 100).toFixed(0)}٪)`
    );
    confidencePenalty += 0.35;
    // بررسی نقدشوندگی هنگام dislocation
    const turnover = m.notionalOI > 0 ? m.volume24h / m.notionalOI : 0;
    if (turnover < cfg.minLiquidityRatio) {
      reasons.push(`نقدشوندگی پایین: حجم ۲۴h ${m.volume24h.toFixed(0)} نسبت به OI ${m.notionalOI.toFixed(0)} (نسبت ${(turnover * 100).toFixed(2)}٪)`);
      confidencePenalty += 0.2;
      kind = 'thin-liquidity';
    }
  }

  // نزدیک سررسید
  const days = daysToMaturity(m, nowSec);
  if (days > 0 && days <= cfg.nearExpiryDays) {
    reasons.push(`نزدیک سررسید (${days} روز) — نرخ ممکن است غیرعادی باشد`);
    confidencePenalty += 0.15;
    if (kind === 'none') kind = 'near-expiry';
  }

  // داده کهنه: ohlcv خالی یا آخرین نقطه قدیمی
  if (m.ohlcv.length === 0) {
    reasons.push('تاریخچه APR در دسترس نیست');
    confidencePenalty += 0.1;
    if (kind === 'none') kind = 'stale-data';
  } else {
    const lastTs = m.ohlcv[m.ohlcv.length - 1].ts;
    const age = nowSec - lastTs;
    if (age > cfg.staleAfterMs / 1000) {
      reasons.push(`آخرین داده تاریخی ${Math.round(age / 3600)} ساعت پیش است`);
      confidencePenalty += 0.15;
      if (kind === 'none') kind = 'stale-data';
    }
  }

  return {
    detected: kind !== 'none' || confidencePenalty > 0,
    kind,
    reasons,
    confidencePenalty: Math.min(0.8, confidencePenalty)
  };
}

/* ---------------- Liquidity Reality ---------------- */

export interface LiquidityReality {
  /** نمره نقدشوندگی ۰..۱ (ترکیبی از OI/حجم/اسپرد) */
  score: number;
  /** آیا Notional موردنظر قابل اجراست؟ */
  executable: boolean;
  /** حداکثر Notional قابل اجرا با داده فعلی (برآورد محافظه‌کارانه) */
  estimatedMaxExecutable: number;
  reasons: string[];
  /** بدون داده کافی → null (N/A) */
  available: boolean;
}

/**
 * نقدشوندگی واقعی — OI به تنهایی کافی نیست:
 *  - حجم ۲۴h نسبت به OI
 *  - اسپرد bid/ask نسبت به mid
 *  - قابلیت اجرای Notional: آیا حجم ۲۴h ≥ Notional است؟
 */
export function assessLiquidity(m: BorosMarket, targetNotional: number): LiquidityReality {
  const reasons: string[] = [];
  const oi = m.notionalOI;
  const vol = m.volume24h;
  const spread =
    m.bestAsk > 0 && m.bestBid > 0 && m.midApr > 0
      ? (m.bestAsk - m.bestBid) / Math.max(0.005, m.midApr)
      : null;

  if (oi <= 0 && vol <= 0) {
    return {
      score: 0,
      executable: false,
      estimatedMaxExecutable: 0,
      reasons: ['داده OI/حجم در دسترس نیست'],
      available: false
    };
  }

  const turnover = oi > 0 ? vol / oi : 0;
  const oiScore = Math.min(1, oi / 20_000);
  const volScore = Math.min(1, vol / 5_000);
  const spreadScore = spread === null ? 0.5 : Math.max(0, Math.min(1, 1 - spread / 0.02));

  const score = Math.max(0, Math.min(1, oiScore * 0.4 + volScore * 0.35 + spreadScore * 0.25));

  // قابلیت اجرا: حجم ۲۴h باید ≥ هدف باشد (برآورد محافظه‌کارانه: ۵٪ حجم روزانه)
  const estimatedMaxExecutable = vol * 0.05;
  const executable = targetNotional <= estimatedMaxExecutable;

  if (turnover < 0.01) reasons.push(`نسبت حجم/OI پایین (${(turnover * 100).toFixed(2)}٪)`);
  if (spread !== null && spread > 0.02) reasons.push(`اسپرد وسیع (${(spread * 100).toFixed(2)}٪ از mid)`);
  if (!executable) {
    reasons.push(`Notional ${targetNotional.toFixed(0)} از ظرفیت اجرای تخمینی (${estimatedMaxExecutable.toFixed(0)}) بیشتر است`);
  }

  return { score, executable, estimatedMaxExecutable, reasons, available: true };
}

/* ---------------- Data Freshness ---------------- */

export interface DataFreshness {
  /** سن داده (ms) — null اگر نامعلوم */
  ageMs: number | null;
  source: string;
  /** کهنه است؟ */
  stale: boolean;
  /** ضریب اعتماد ۰..۱ */
  confidenceFactor: number;
}

/** تازگی داده — timestamp منبع (ohlcv آخرین نقطه یا الآن) */
export function assessFreshness(m: BorosMarket, nowSec: number): DataFreshness {
  let ageMs: number | null = null;
  if (m.ohlcv.length > 0) {
    const lastTs = m.ohlcv[m.ohlcv.length - 1].ts;
    ageMs = (nowSec - lastTs) * 1000;
  }
  const stale = ageMs !== null && ageMs > 30 * 60_000;
  return {
    ageMs,
    source: m.ohlcv.length > 0 ? 'historical-ohlcv' : 'api-snapshot',
    stale,
    confidenceFactor: ageMs === null ? 0.6 : stale ? 0.5 : 0.95
  };
}
