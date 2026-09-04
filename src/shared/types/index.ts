/** قیمت‌ها و وضعیت منبع داده */
export type PriceSource = 'live' | 'snapshot' | 'na';

export type AssetKind = 'crypto' | 'tokenized' | 'tradfi';

export type TradFiKind = 'stock' | 'etf' | 'bond' | 'commodity' | 'index';

/** واحد نمایش قیمت */
export type PriceUnit = 'usd' | 'pct';

/** یک ردیف شبیه‌سازی پس از محاسبات (مقادیر عددی خالص) */
export interface SimAssetRow {
  key: string;
  symbol: string;
  nameFa: string;
  kind: AssetKind;
  tradfiKind?: TradFiKind;
  /** واحد نمایش: درصد (اوراق دولتی) یا دلار */
  unit: PriceUnit;
  /** قیمت مرجع خرید (ابتدای بازه) — ممکن است وجود نداشته باشد */
  buyPrice: number | null;
  /** قیمت لحظه‌ای یا فالبک */
  currentPrice: number | null;
  source: PriceSource;
  /** Value ($) = (Base Capital / Buy Price) * Current Price — برای اوراق (درصد) مقدار ندارد */
  valueUsd: number | null;
  /** Profit/Loss = Value - Base Capital */
  profitLoss: number | null;
  /** Vs ETH ($) = Value - (Base Capital / ETH Ref Price) * ETH Live Price */
  vsEth: number | null;
  /** بازده درصدی = (Current / Buy - 1) * 100 */
  changePct: number | null;
}

/** خروجی موتور محاسباتی برای یک بازه زمانی */
export interface TimelineResult {
  timeline: 1 | 2;
  baseCapital: number;
  ethRefPrice: number;
  ethLivePrice: number | null;
  ethSource: PriceSource;
  rows: SimAssetRow[];
  totals: {
    /** مجموع Value ردیف‌های معتبر (جمع سناریوهای مستقل — معنای پرتفوی ندارد) */
    valueSum: number;
    /** تعداد ردیف‌های قابل محاسبه */
    validCount: number;
    totalRows: number;
    naCount: number;
    liveCount: number;
    snapshotCount: number;
    /**
     * ارزش پرتفوی با توزین برابر:
     * سرمایه پایه به‌طور مساوی بین دارایی‌های معتبر تقسیم می‌شود.
     * معادل: valueSum / validCount
     */
    equalWeightValue: number | null;
    /** سود/زیان پرتفوی توزین برابر = equalWeightValue - baseCapital */
    equalWeightPL: number | null;
    /** مقایسه پرتفوی توزین برابر با معیار اتریوم */
    equalWeightVsEth: number | null;
    /** بهترین و بدترین بر اساس بازده درصدی */
    best: SimAssetRow | null;
    worst: SimAssetRow | null;
  };
}

export interface ScenarioConfig {
  ethAmount: number;
  ethBuyPrice: number;
  ethInitialInvestment: number;
  usdcAllocation2026: number;
  baseCapital2025: number;
  baseCapital2026: number;
  ethRefJuly2026: number;
}

export interface PriceQuote {
  price: number;
  source: PriceSource;
  fetchedAt: number;
}

export type { ScenarioConfig as Scenario };
