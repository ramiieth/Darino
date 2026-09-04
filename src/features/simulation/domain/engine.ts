/**
 * ============================================================
 *  موتور محاسبات شبیه‌سازی (لایه دامنه — بدون وابستگی به UI)
 * ============================================================
 *
 * ستون‌های استاندارد هر جدول:
 *   Asset | Buy/Reference Price | Current Price | Value ($) | Profit/Loss | Vs ETH ($)
 *
 * فرمول‌ها:
 *   Value ($)      = (Base Capital / Buy Price) * Current Price
 *   Profit/Loss    = Value ($) - Base Capital
 *   Vs ETH ($)     = Value ($) - ((Base Capital / ETH Ref Price) * ETH Live Price)
 *
 * قواعد حیاتی:
 *   - هیچ ردیفی به‌دلیل نبود قیمت حذف نمی‌شود؛ سلول‌ها "N/A" می‌شوند.
 *   - زنجیره فالبک: Live → SNAPSHOT_PRICES → N/A
 */
import type {
  AssetKind,
  PriceSource,
  SimAssetRow,
  TimelineResult,
  TradFiKind
} from '@/shared/types';
import { computeChangePct, computeEthBenchmark, computeProfitLoss, computeValue, computeVsEth } from '@/shared/utils/math';
import {
  BASE_CAPITAL_2025,
  BASE_CAPITAL_2026,
  COINS,
  COIN_NAMES_FA,
  JAN_1_2025_PRICES,
  JULY_1_2026_PRICES,
  PRICE_SNAPSHOT_FALLBACK,
  TOKENIZED_STOCK_PRICES,
  TOKENIZED_NAMES,
  TRADFI_ASSETS,
  TRADFI_JAN_2025,
  TRADFI_JUL_2026,
  TRADFI_NAMES,
  ETH_POSITION
} from './constants';

/* ---------------- ورودی موتور ---------------- */

export interface EngineInputs {
  timeline: 1 | 2;
  /** قیمت زنده رمزارزها: شناسه CoinGecko → قیمت (خالی در آفلاین) */
  liveCrypto: Record<string, number> | null;
  /** قیمت زنده سهام: نماد → قیمت (از استور بازار) */
  liveStocks: Record<string, number> | null;
  /** قیمت زنده سهام توکن‌ایز (دسته Tokenized Products کوین‌گکو): نماد → قیمت */
  tokenizedPrices: Record<string, number> | null;
  /** قیمت زنده اتریوم — اگر null از اسنپ‌شات استفاده می‌شود */
  ethLivePrice: number | null;
  /** نادیده‌گرفتن سناریوی سفارشی؟ */
  overrides?: { baseCapital2025?: number; baseCapital2026?: number; ethRefJuly2026?: number };
}

interface AssetSpec {
  key: string;
  symbol: string;
  nameFa: string;
  kind: AssetKind;
  tradfiKind?: TradFiKind;
  /** واحد نمایش (اوراق دولتی: درصد) */
  unit: 'usd' | 'pct';
  buyPrice: number | null;
  /** کلید قیمت زنده: شناسه CoinGecko یا نماد سهام */
  liveKey: string;
}

/* ---------------- ساخت فهرست دارایی‌های هر بازه ---------------- */

function buildAssetList(timeline: 1 | 2): AssetSpec[] {
  const refPrices = timeline === 1 ? JAN_1_2025_PRICES : JULY_1_2026_PRICES;
  const list: AssetSpec[] = [];

  // ۱) رمزارزها — همیشه (۳۲ سکه)
  for (const [id, symbol] of Object.entries(COINS)) {
    list.push({
      key: `crypto:${id}`,
      symbol,
      nameFa: COIN_NAMES_FA[id] ?? symbol,
      kind: 'crypto',
      unit: 'usd',
      buyPrice: refPrices[id] ?? null,
      liveKey: id
    });
  }

  // ۲) سهام توکن‌ایز — فقط بازه ۲ (۱۳۵ نماد از داده مرجع)
  if (timeline === 2) {
    for (const [sym, price] of Object.entries(TOKENIZED_STOCK_PRICES)) {
      list.push({
        key: `tokenized:${sym}`,
        symbol: sym,
        nameFa: TOKENIZED_NAMES[sym] ?? sym,
        kind: 'tokenized',
        unit: 'usd',
        buyPrice: price,
        liveKey: sym
      });
    }
  }

  // ۳) دارایی‌های سنتی آمریکا — هر دو بازه (قیمت مرجع متفاوت)
  const tradfiRef = timeline === 1 ? TRADFI_JAN_2025 : TRADFI_JUL_2026;
  for (const asset of TRADFI_ASSETS) {
    list.push({
      key: `tradfi:${asset.symbol}`,
      symbol: asset.symbol,
      nameFa: asset.nameFa,
      kind: 'tradfi',
      tradfiKind: asset.kind,
      unit: asset.isYield ? 'pct' : 'usd',
      buyPrice: tradfiRef[asset.symbol] ?? null,
      liveKey: asset.symbol
    });
  }

  return list;
}

/* ---------------- حل‌کننده قیمت (Live → Snapshot → N/A) ---------------- */

export function resolvePrice(
  liveKey: string,
  liveMap: Record<string, number> | null
): { price: number | null; source: PriceSource } {
  const live = liveMap?.[liveKey];
  if (typeof live === 'number' && Number.isFinite(live) && live > 0) {
    return { price: live, source: 'live' };
  }
  const snap = PRICE_SNAPSHOT_FALLBACK[liveKey];
  if (typeof snap === 'number' && Number.isFinite(snap) && snap > 0) {
    return { price: snap, source: 'snapshot' };
  }
  return { price: null, source: 'na' };
}

/**
 * نگهبان صحت قیمت توکن‌ایز (جلوگیری از خطای تطبیق نماد مثل BACON→bCSPX):
 * اگر قیمت زنده نسبت به مرجع ۱ ژوئیه ۲۰۲۶ خارج از بازه [0.25x, 4x] باشد،
 * به‌عنوان قیمت مشکوک رد و اسنپ‌شات جایگزین می‌شود.
 */
export function isPlausibleTokenizedPrice(symbol: string, livePrice: number): boolean {
  const ref = TOKENIZED_STOCK_PRICES[symbol];
  if (!ref || ref <= 0) return true; // بدون مرجع → پذیرش
  const ratio = livePrice / ref;
  return ratio <= 4 && ratio >= 0.25;
}

/**
 * حل‌کننده قیمت سهام توکن‌ایز:
 *  - قیمت زنده از CoinGecko (دسته Tokenized Products) + نگهبان صحت
 *  - اسنپ‌شات: فقط و فقط قیمت مرجع ۱ ژوئیه ۲۰۲۶ (TOKENIZED_STOCK_PRICES)
 *  — هیچ داده کش کهنه دیگری به‌عنوان اسنپ‌شات توکن‌ایز استفاده نمی‌شود.
 */
export function resolveTokenizedPrice(
  symbol: string,
  tokenizedLive: Record<string, number> | null
): { price: number | null; source: PriceSource } {
  const live = tokenizedLive?.[symbol];
  if (
    typeof live === 'number' &&
    Number.isFinite(live) &&
    live > 0 &&
    isPlausibleTokenizedPrice(symbol, live)
  ) {
    return { price: live, source: 'live' };
  }
  const july2026 = TOKENIZED_STOCK_PRICES[symbol];
  if (typeof july2026 === 'number' && Number.isFinite(july2026) && july2026 > 0) {
    return { price: july2026, source: 'snapshot' };
  }
  return { price: null, source: 'na' };
}

/* ---------------- رندر امن ردیف (الگوی الزامی) ---------------- */

export interface RenderedRow {
  asset: string;
  buyPrice: string;
  currentPrice: string;
  value: string;
  profitLoss: string;
  vsEth: string;
}

export function renderRow(
  assetSymbol: string,
  buyPrice: number,
  livePrice: number | null,
  baseCapital: number,
  ethBenchmarkValue: number | null
): RenderedRow {
  const formatVal = (v: number | null): string =>
    v !== null && !Number.isNaN(v)
      ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'N/A';

  if (livePrice === null || livePrice === undefined) {
    return {
      asset: assetSymbol,
      buyPrice: formatVal(buyPrice),
      currentPrice: 'N/A',
      value: 'N/A',
      profitLoss: 'N/A',
      vsEth: 'N/A'
    };
  }

  const units = baseCapital / buyPrice;
  const currentValue = units * livePrice;
  const profitLoss = currentValue - baseCapital;
  const vsEth = ethBenchmarkValue !== null ? currentValue - ethBenchmarkValue : null;

  return {
    asset: assetSymbol,
    buyPrice: formatVal(buyPrice),
    currentPrice: formatVal(livePrice),
    value: formatVal(currentValue),
    profitLoss: formatVal(profitLoss),
    vsEth: formatVal(vsEth)
  };
}

/* ---------------- ساخت بازه کامل ---------------- */

export function buildTimeline(inputs: EngineInputs): TimelineResult {
  const timeline = inputs.timeline;
  const baseCapital =
    inputs.overrides?.baseCapital2025 && timeline === 1
      ? inputs.overrides.baseCapital2025
      : inputs.overrides?.baseCapital2026 && timeline === 2
        ? inputs.overrides.baseCapital2026
        : timeline === 1
          ? BASE_CAPITAL_2025
          : BASE_CAPITAL_2026;

  const ethRefPrice =
    timeline === 1
      ? JAN_1_2025_PRICES.ethereum ?? 3335
      : (inputs.overrides?.ethRefJuly2026 ?? ETH_POSITION.ETH_REF_JULY_2026);

  // ادغام نقشه قیمت‌های زنده: رمزارز (شناسه CoinGecko) + سهام (نماد)
  // (تداخلی وجود ندارد: شناسه‌های سکه lowercase، نمادهای سهام UPPERCASE)
  const liveLookup: Record<string, number> | null =
    inputs.liveCrypto || inputs.liveStocks
      ? { ...(inputs.liveCrypto ?? {}), ...(inputs.liveStocks ?? {}) }
      : null;

  // قیمت زنده اتریوم → فالبک اسنپ‌شات → null
  const ethResolved = resolvePrice('ethereum', liveLookup);
  const ethLivePrice = inputs.ethLivePrice ?? ethResolved.price;
  const ethSource: PriceSource = inputs.ethLivePrice !== null && inputs.ethLivePrice !== undefined
    ? 'live'
    : ethResolved.source;

  const ethBenchmark = computeEthBenchmark(baseCapital, ethRefPrice, ethLivePrice);

  const specs = buildAssetList(timeline);
  const rows: SimAssetRow[] = [];

  for (const spec of specs) {
    // سهام توکن‌ایز: قیمت زنده CoinGecko + اسنپ‌شات فقط ۱ ژوئیه ۲۰۲۶
    const resolved =
      spec.kind === 'tokenized'
        ? resolveTokenizedPrice(spec.symbol, inputs.tokenizedPrices)
        : resolvePrice(spec.liveKey, liveLookup);
    const livePrice = resolved.price;
    const source = resolved.source;

    const value = computeValue(baseCapital, spec.buyPrice, livePrice);
    const profitLoss = computeProfitLoss(value, baseCapital);
    const vsEth = computeVsEth(value, ethBenchmark);
    const changePct = computeChangePct(spec.buyPrice, livePrice);

    // اجرای الگوی الزامی رندر امن (برای اعتبارسنجی/تست)
    if (spec.buyPrice !== null) {
      renderRow(spec.symbol, spec.buyPrice, livePrice, baseCapital, ethBenchmark);
    }

    rows.push({
      key: spec.key,
      symbol: spec.symbol,
      nameFa: spec.nameFa,
      kind: spec.kind,
      tradfiKind: spec.tradfiKind,
      unit: spec.unit,
      buyPrice: spec.buyPrice,
      currentPrice: livePrice,
      source,
      // اوراق دولتی (درصد) ارزش دلاری معنادار ندارند → N/A
      valueUsd: spec.unit === 'pct' ? null : value,
      profitLoss: spec.unit === 'pct' ? null : profitLoss,
      vsEth: spec.unit === 'pct' ? null : vsEth,
      changePct
    });
  }

  // آمار
  let valueSum = 0;
  let validCount = 0;
  let naCount = 0;
  let liveCount = 0;
  let snapshotCount = 0;
  let best: SimAssetRow | null = null;
  let worst: SimAssetRow | null = null;

  for (const r of rows) {
    if (r.valueUsd !== null) {
      valueSum += r.valueUsd;
      validCount++;
    }
    if (r.source === 'na') naCount++;
    if (r.source === 'live') liveCount++;
    if (r.source === 'snapshot') snapshotCount++;
    if (r.changePct !== null) {
      if (!best || r.changePct > (best.changePct ?? -Infinity)) best = r;
      if (!worst || r.changePct < (worst.changePct ?? Infinity)) worst = r;
    }
  }

  /**
   * پرتفوی «توزین برابر»: سرمایه پایه به‌طور مساوی بین دارایی‌های معتبر تقسیم می‌شود.
   * چون Value هر ردیف با سرمایه خطی است، ارزش سهم هر دارایی = valueUsd / validCount
   * و ارزش کل پرتفوی = Σ(valueUsd) / validCount
   */
  const equalWeightValue = validCount > 0 ? valueSum / validCount : null;
  const equalWeightPL =
    equalWeightValue !== null ? equalWeightValue - baseCapital : null;
  const equalWeightVsEth =
    equalWeightValue !== null && ethBenchmark !== null
      ? equalWeightValue - ethBenchmark
      : null;

  return {
    timeline,
    baseCapital,
    ethRefPrice,
    ethLivePrice,
    ethSource,
    rows,
    totals: {
      valueSum,
      validCount,
      totalRows: rows.length,
      naCount,
      liveCount,
      snapshotCount,
      equalWeightValue,
      equalWeightPL,
      equalWeightVsEth,
      best,
      worst
    }
  };
}

/** تبدیل ردیف به نمایش رشتهای با ارقام فارسی */
export function toDisplayRow(row: SimAssetRow, baseCapital: number, ethBenchmark: number | null): RenderedRow {
  return renderRow(row.symbol, row.buyPrice ?? NaN, row.currentPrice, baseCapital, ethBenchmark);
}

/** برچسب دسته برای UI */
export function kindLabel(kind: AssetKind, tradfiKind?: TradFiKind): string {
  if (kind === 'crypto') return 'crypto';
  if (kind === 'tokenized') return 'tokenized';
  return tradfiKind ?? 'tradfi';
}
