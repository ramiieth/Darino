/** ============================================================
 * Stable Carry — درآمد اهرمی روی وثیقهٔ دلاری (Kamino Multiply، لوپ PT پندل و …)
 *
 * داده: DeFiLlama /pools (بازده) + /lendBorrow (نرخ وام، LTV، نقدینگی)
 *  - بازار ایزوله (Morpho): یک ردیف = وثیقه + نرخ وام دارایی قرض (mintedCoin) + LLTV
 *  - بازار مشترک (Kamino/Aave/…): ردیف وثیقه (ltv > 0) با ردیف‌های قابل‌قرض همان
 *    project + chain + poolMeta جفت می‌شود
 *
 * واحدها: همهٔ نرخ‌ها «درصد» (5.2 = 5.2٪) مثل DeFiLlama؛ LTV نسبت (0.78).
 * ⚠️ داده ناشناخته → null — هرگز حدس نمی‌زنیم.
 * ============================================================ */
import { multiplyLeverage } from '@/features/defi-loop/domain/reference/leverage';
import { loopedApy } from '@/features/defi-loop/domain/reference/apy';

/* ---------------- ورودی خام ---------------- */

export interface CarryPoolInput {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number | null;
  apy: number | null;
  stablecoin: boolean;
  poolMeta: string | null;
  exposure?: string | null;
  underlyingTokens?: string[] | null;
}

export interface LendBorrowRow {
  pool: string;
  apyBaseBorrow: number | null;
  apyRewardBorrow: number | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
  ltv: number | null;
  borrowable: boolean | null;
  mintedCoin: string | null;
}

/** پروتکل‌هایی که LTV ردیفشان همان آستانهٔ لیکوییدیشن است (LLTV) */
const LTV_IS_LIQUIDATION = new Set(['morpho-blue']);

/** حداقل ارزش وثیقهٔ سپرده‌شده برای نمایش یک بازار */
export const MIN_COLLATERAL_USD = 1_000_000;

/* ---------------- خروجی ---------------- */

export interface CarryMarket {
  /** شناسهٔ پایدار: پول وثیقه + پول وام */
  id: string;
  project: string;
  chain: string;
  market: string | null;
  collateral: string;
  debt: string;
  /** بازده وثیقه (٪) — null = در داده نیست */
  collateralYield: number | null;
  collateralYieldSource: 'pendle-pt' | 'supply' | 'issuer' | null;
  /** سررسید PT (ms) — null برای غیر PT */
  maturity: number | null;
  /** نرخ خالص وام (٪) = پایه − پاداش */
  borrowRate: number;
  maxLtv: number;
  /** null = آستانهٔ لیکوییدیشن در داده نیست (فقط حداکثر LTV) */
  liquidationLtv: number | null;
  /** نقدینگی قابل‌قرض (دلار) */
  liquidityUsd: number | null;
  /** ٪ ظرفیت قرض‌داده‌شده */
  utilization: number | null;
  collateralUsd: number | null;
  /** پول DeFiLlama برای لینک */
  poolId: string;
}

/* ---------------- کمکی‌ها ---------------- */

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const PT_RE = /^PT-(.+)-(\d{1,2})([A-Z]{3})(\d{4})$/;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** «PT-siUSD-07JAN2027» و «PT-SIUSD-7JAN2027» → یک کلید؛ غیر PT → null */
export function normalizePtSymbol(symbol: string): string | null {
  const m = PT_RE.exec(symbol.trim().toUpperCase());
  if (!m) return null;
  return `PT-${m[1]}-${Number(m[2])}${m[3]}${m[4]}`;
}

/** تاریخ سررسید PT (UTC ms) — نامعتبر → null */
export function ptMaturity(symbol: string): number | null {
  const m = PT_RE.exec(symbol.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS.indexOf(m[3]);
  if (month < 0) return null;
  const t = Date.UTC(Number(m[4]), month, Number(m[2]));
  return Number.isFinite(t) ? t : null;
}

const marketKey = (p: CarryPoolInput) => `${p.project}|${p.chain}|${p.poolMeta ?? ''}`;

/* ---------------- ساخت بازارها ---------------- */

/**
 * @param now برای حذف PTهای سررسیدشده
 */
export function buildCarryMarkets(pools: CarryPoolInput[], rows: LendBorrowRow[], now = Date.now()): CarryMarket[] {
  const poolById = new Map(pools.map((p) => [p.pool, p]));
  const lending = rows.filter((r) => poolById.has(r.pool));
  const lendingProjects = new Set(lending.map((r) => poolById.get(r.pool)!.project));

  const stablePools = pools.filter((p) => p.stablecoin && !p.symbol.includes('-'));
  const stableSymbols = new Set(stablePools.map((p) => p.symbol.toUpperCase()));
  // آدرس EVM حساس به حروف نیست؛ mint سولانا هست
  const addr = (a: string) => (a.startsWith('0x') ? a.toLowerCase() : a);
  const stableTokens = new Set(
    stablePools.filter((p) => p.underlyingTokens?.length === 1).map((p) => addr(p.underlyingTokens![0]))
  );

  // بازده ثابت PT از پول‌های «For buying PT-…» پندل (کلید با زنجیره، فالبک بدون زنجیره)
  const ptYield = new Map<string, { apy: number; stable: boolean }>();
  for (const p of pools) {
    if (p.project !== 'pendle-v2' || !p.poolMeta?.startsWith('For buying ')) continue;
    const key = normalizePtSymbol(p.poolMeta.slice('For buying '.length));
    const apy = num(p.apy);
    if (!key || apy === null) continue;
    const v = { apy, stable: p.stablecoin };
    ptYield.set(`${p.chain}|${key}`, v);
    if (!ptYield.has(key)) ptYield.set(key, v);
  }
  const findPt = (chain: string, symbol: string) => {
    const key = normalizePtSymbol(symbol);
    return key ? (ptYield.get(`${chain}|${key}`) ?? ptYield.get(key) ?? null) : null;
  };

  // بازده ذاتی توکن (sUSDe، syrupUSDC، AUTO …): بزرگ‌ترین پول غیر وام‌دهی/غیر پندل با همان نماد و زنجیره
  const issuerYield = new Map<string, { apy: number; tvl: number }>();
  // توکن اعتباری دلاری: خزانهٔ تک‌دارایی که سپرده‌اش استیبل‌کوین است (مثل AUTO هسترا ← wYLDS)
  const dollarVaults = new Set<string>();
  for (const p of pools) {
    if (lendingProjects.has(p.project) || p.project === 'pendle-v2') continue;
    const key = `${p.chain}|${p.symbol.toUpperCase()}`;
    const u = p.underlyingTokens ?? [];
    if (p.exposure === 'single' && u.length > 0 && u.every((t) => stableTokens.has(addr(t)))) dollarVaults.add(key);
    const apy = num(p.apy);
    if (apy === null || apy <= 0) continue;
    const tvl = num(p.tvlUsd) ?? 0;
    const prev = issuerYield.get(key);
    if (!prev || tvl > prev.tvl) issuerYield.set(key, { apy, tvl });
  }

  const isDollarCollateral = (p: CarryPoolInput) => {
    const s = p.symbol.toUpperCase();
    if (stableSymbols.has(s) || dollarVaults.has(`${p.chain}|${s}`)) return true;
    return findPt(p.chain, s)?.stable === true;
  };

  const collateralYieldOf = (p: CarryPoolInput): Pick<CarryMarket, 'collateralYield' | 'collateralYieldSource'> => {
    const pt = findPt(p.chain, p.symbol);
    if (pt) return { collateralYield: pt.apy, collateralYieldSource: 'pendle-pt' };
    const own = num(p.apy);
    // APY صفر روی وثیقهٔ دلاری یعنی بازده در قیمت توکن است، نه «بازده صفر»
    if (own !== null && own > 0) return { collateralYield: own, collateralYieldSource: 'supply' };
    const iss = issuerYield.get(`${p.chain}|${p.symbol.toUpperCase()}`);
    if (iss) return { collateralYield: iss.apy, collateralYieldSource: 'issuer' };
    return { collateralYield: null, collateralYieldSource: null };
  };

  const liquidity = (r: LendBorrowRow) => {
    const s = num(r.totalSupplyUsd);
    const b = num(r.totalBorrowUsd);
    if (s === null || b === null) return { liquidityUsd: null, utilization: null };
    return { liquidityUsd: Math.max(0, s - b), utilization: s > 0 ? (b / s) * 100 : null };
  };
  const netBorrow = (r: LendBorrowRow) => {
    const base = num(r.apyBaseBorrow);
    return base === null ? null : base - (num(r.apyRewardBorrow) ?? 0);
  };

  const out: CarryMarket[] = [];
  const debtsByMarket = new Map<string, { row: LendBorrowRow; pool: CarryPoolInput }[]>();
  for (const row of lending) {
    const pool = poolById.get(row.pool)!;
    if (row.borrowable && !row.mintedCoin && stableSymbols.has(pool.symbol.toUpperCase()) && netBorrow(row) !== null) {
      const k = marketKey(pool);
      debtsByMarket.set(k, [...(debtsByMarket.get(k) ?? []), { row, pool }]);
    }
  }

  for (const row of lending) {
    const pool = poolById.get(row.pool)!;
    const ltv = num(row.ltv);
    if (ltv === null || ltv <= 0 || ltv >= 1 || !isDollarCollateral(pool)) continue;
    const maturity = ptMaturity(pool.symbol);
    if (maturity !== null && maturity <= now) continue;
    const yieldInfo = collateralYieldOf(pool);
    const base = {
      project: pool.project,
      chain: pool.chain,
      market: pool.poolMeta,
      collateral: pool.symbol,
      maturity,
      maxLtv: ltv,
      liquidationLtv: LTV_IS_LIQUIDATION.has(pool.project) ? ltv : null,
      poolId: pool.pool,
      ...yieldInfo
    };

    if (row.mintedCoin) {
      // بازار ایزوله: نقدینگی/ارزش ردیف مربوط به دارایی قرض است
      const debt = row.mintedCoin.toUpperCase();
      const rate = netBorrow(row);
      if (!stableSymbols.has(debt) || rate === null) continue;
      out.push({ ...base, id: `${pool.pool}:${debt}`, debt, borrowRate: rate, collateralUsd: null, ...liquidity(row) });
      continue;
    }

    const collateralUsd = num(row.totalSupplyUsd) ?? num(pool.tvlUsd);
    if (collateralUsd === null || collateralUsd < MIN_COLLATERAL_USD) continue;
    for (const d of debtsByMarket.get(marketKey(pool)) ?? []) {
      if (d.pool.symbol.toUpperCase() === pool.symbol.toUpperCase()) continue;
      out.push({
        ...base,
        id: `${pool.pool}:${d.pool.pool}`,
        debt: d.pool.symbol,
        borrowRate: netBorrow(d.row)!,
        collateralUsd,
        ...liquidity(d.row)
      });
    }
  }
  return out;
}

/* ---------------- محاسبهٔ یک پوزیشن ---------------- */

export interface CarryResult {
  targetLtv: number;
  leverage: number | null;
  /** Net APY (٪) روی سرمایهٔ خود — null اگر بازده وثیقه ناشناخته */
  netApy: number | null;
  /** بازده وثیقه − نرخ وام (٪) */
  spread: number | null;
  /** کاهش Net APY به‌ازای هر ۱٪ افزایش نرخ وام = Leverage − 1 */
  rateSensitivity: number | null;
  /** نرخ وامی که Net APY را صفر می‌کند (٪) */
  breakEvenBorrow: number | null;
  /** ٪ افت ارزش وثیقه تا لیکوییدیشن */
  liquidationDropPct: number | null;
  /** true = آستانه در داده نبود؛ عدد «حداقل» است (با حداکثر LTV) */
  liquidationIsLowerBound: boolean;
}

/**
 * @param ltvShare سهم از حداکثر LTV (0.9 = ۹۰٪ سقف)
 * @param borrowShock افزایش فرضی نرخ وام (واحد ٪)
 */
export function computeCarry(
  m: Pick<CarryMarket, 'collateralYield' | 'borrowRate' | 'maxLtv' | 'liquidationLtv'>,
  ltvShare: number,
  borrowShock = 0
): CarryResult {
  const share = Math.min(1, Math.max(0, ltvShare));
  const targetLtv = m.maxLtv * share;
  const leverage = multiplyLeverage(targetLtv);
  const y = m.collateralYield;
  const b = m.borrowRate + borrowShock;
  const netApy = leverage === null ? null : loopedApy(y, b, leverage);
  const rateSensitivity = leverage === null ? null : leverage - 1;
  const breakEvenBorrow =
    leverage === null || y === null || leverage <= 1 ? null : (leverage * y) / (leverage - 1);
  const liq = m.liquidationLtv ?? m.maxLtv;
  const liquidationDropPct = liq > 0 ? Math.max(0, (1 - targetLtv / liq) * 100) : null;
  return {
    targetLtv,
    leverage,
    netApy,
    spread: y === null ? null : y - b,
    rateSensitivity,
    breakEvenBorrow,
    liquidationDropPct,
    liquidationIsLowerBound: m.liquidationLtv === null
  };
}

/** روزهای مانده تا سررسید — null برای غیر PT */
export function daysToMaturity(maturity: number | null, now = Date.now()): number | null {
  return maturity === null ? null : Math.ceil((maturity - now) / 86_400_000);
}

/* ---------------- قدرت خرید ---------------- */

/** بازده دوره از APY سالانه (مرکب) — ٪ */
export function periodReturnPct(apyPct: number, days: number): number {
  return (Math.pow(1 + apyPct / 100, days / 365) - 1) * 100;
}

export interface BuyingPower {
  cashEnd: number;
  assetEnd: number;
  /** ارزش نقد − ارزش اگر دارایی می‌خرید (دلار) */
  differenceUsd: number;
  /** ٪ دارایی بیشتری که الان می‌شود خرید = (1+r)/(1+a) − 1 */
  extraUnitsPct: number | null;
}

/**
 * @param cashReturnPct بازده نقد در دوره (٪)
 * @param assetChangePct تغییر قیمت دارایی در دوره (٪)
 */
export function buyingPower(capital: number, cashReturnPct: number, assetChangePct: number): BuyingPower {
  const cashEnd = capital * (1 + cashReturnPct / 100);
  const assetEnd = capital * (1 + assetChangePct / 100);
  const assetFactor = 1 + assetChangePct / 100;
  return {
    cashEnd,
    assetEnd,
    differenceUsd: cashEnd - assetEnd,
    extraUnitsPct: assetFactor > 0 ? ((1 + cashReturnPct / 100) / assetFactor - 1) * 100 : null
  };
}
