/**
 * تست‌ها — Stable Carry (جفت‌سازی بازار + اهرم Multiply + قدرت خرید)
 * فیکسچر از شکل واقعی DeFiLlama /pools و /lendBorrow (۳۱ اکتبر ۲۰۲۶)
 */
import { describe, expect, it } from 'vitest';
import {
  buildCarryMarkets,
  buyingPower,
  computeCarry,
  daysToMaturity,
  normalizePtSymbol,
  periodReturnPct,
  ptMaturity,
  type CarryPoolInput,
  type LendBorrowRow
} from '@/features/defi-loop/domain/carry';
import { calculateLoopLeverage, multiplyLeverage } from '@/features/defi-loop/domain/reference/leverage';

const WYLDS_MINT = '8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NOW = Date.UTC(2026, 9, 31);

const pool = (p: Partial<CarryPoolInput> & Pick<CarryPoolInput, 'pool' | 'project' | 'chain' | 'symbol'>): CarryPoolInput => ({
  tvlUsd: 10_000_000,
  apy: 0,
  stablecoin: false,
  poolMeta: null,
  exposure: 'single',
  underlyingTokens: null,
  ...p
});
const row = (r: Partial<LendBorrowRow> & Pick<LendBorrowRow, 'pool'>): LendBorrowRow => ({
  apyBaseBorrow: null,
  apyRewardBorrow: null,
  totalSupplyUsd: null,
  totalBorrowUsd: null,
  ltv: 0,
  borrowable: false,
  mintedCoin: null,
  ...r
});

const POOLS: CarryPoolInput[] = [
  // Kamino AUTO Market (بازار مشترک)
  pool({ pool: 'k-auto', project: 'kamino-lend', chain: 'Solana', symbol: 'AUTO', poolMeta: 'AUTO Market', tvlUsd: 98_000_000 }),
  pool({ pool: 'k-wylds', project: 'kamino-lend', chain: 'Solana', symbol: 'WYLDS', poolMeta: 'AUTO Market', apy: 5.15, stablecoin: true, underlyingTokens: [WYLDS_MINT] }),
  pool({ pool: 'k-sol', project: 'kamino-lend', chain: 'Solana', symbol: 'SOL', poolMeta: 'AUTO Market', apy: 3 }),
  // صادرکنندهٔ AUTO: خزانهٔ تک‌دارایی روی wYLDS
  pool({ pool: 'h-auto', project: 'hastra', chain: 'Solana', symbol: 'AUTO', apy: 9.45, underlyingTokens: [WYLDS_MINT] }),
  // Morpho PT (بازار ایزوله) + پول پندل
  pool({ pool: 'm-pt', project: 'morpho-blue', chain: 'Ethereum', symbol: 'PT-REUSD-10DEC2026' }),
  pool({ pool: 'p-pt', project: 'pendle-v2', chain: 'Ethereum', symbol: 'REUSD', apy: 12.45, stablecoin: true, poolMeta: 'For buying PT-reUSD-10DEC2026' }),
  pool({ pool: 'm-old', project: 'morpho-blue', chain: 'Ethereum', symbol: 'PT-REUSD-1OCT2026' }),
  pool({ pool: 'p-old', project: 'pendle-v2', chain: 'Ethereum', symbol: 'REUSD', apy: 9, stablecoin: true, poolMeta: 'For buying PT-reUSD-01OCT2026' }),
  // وثیقهٔ بی‌ثبات روی Morpho — نباید بیاید
  pool({ pool: 'm-weth', project: 'morpho-blue', chain: 'Ethereum', symbol: 'WETH' }),
  pool({ pool: 'usdc', project: 'aave-v3', chain: 'Ethereum', symbol: 'USDC', apy: 4, stablecoin: true, underlyingTokens: [USDC_ETH] })
];
const ROWS: LendBorrowRow[] = [
  row({ pool: 'k-auto', ltv: 0.78, totalSupplyUsd: 98_000_000, totalBorrowUsd: 0 }),
  row({ pool: 'k-wylds', borrowable: true, apyBaseBorrow: 5.75, totalSupplyUsd: 25_000_000, totalBorrowUsd: 24_980_000 }),
  row({ pool: 'k-sol', borrowable: true, apyBaseBorrow: 4, totalSupplyUsd: 5_000_000, totalBorrowUsd: 1_000_000 }),
  row({ pool: 'm-pt', ltv: 0.915, borrowable: true, mintedCoin: 'USDC', apyBaseBorrow: 9.12, totalSupplyUsd: 40_000_000, totalBorrowUsd: 8_500_000 }),
  row({ pool: 'm-old', ltv: 0.915, borrowable: true, mintedCoin: 'USDC', apyBaseBorrow: 5, totalSupplyUsd: 1_000_000, totalBorrowUsd: 0 }),
  row({ pool: 'm-weth', ltv: 0.86, borrowable: true, mintedCoin: 'USDC', apyBaseBorrow: 5, totalSupplyUsd: 9_000_000, totalBorrowUsd: 1 }),
  row({ pool: 'usdc', borrowable: true, apyBaseBorrow: 4.7, totalSupplyUsd: 100, totalBorrowUsd: 50 })
];

describe('اهرم Multiply در برابر Reference', () => {
  it('LTV ۷۶٪: Multiply ≈ 4.17x و Reference ۵ گام ≈ 3.36x', () => {
    expect(multiplyLeverage(0.76)).toBeCloseTo(4.1667, 4);
    expect(calculateLoopLeverage(0.76, 5)).toBeCloseTo(3.3638, 4);
  });
  it('LTV نامعتبر یا ≥ ۱ → null', () => {
    expect(multiplyLeverage(1)).toBeNull();
    expect(multiplyLeverage(-0.1)).toBeNull();
    expect(multiplyLeverage(Number.NaN)).toBeNull();
    expect(multiplyLeverage(0)).toBe(1);
  });
});

describe('نماد PT', () => {
  it('صفر پیشوند روز و حروف کوچک یکسان می‌شوند', () => {
    expect(normalizePtSymbol('PT-siUSD-07JAN2027')).toBe('PT-SIUSD-7JAN2027');
    expect(normalizePtSymbol('PT-SIUSD-7JAN2027')).toBe('PT-SIUSD-7JAN2027');
    expect(normalizePtSymbol('USDC')).toBeNull();
  });
  it('سررسید و روزهای مانده', () => {
    expect(ptMaturity('PT-REUSD-10DEC2026')).toBe(Date.UTC(2026, 11, 10));
    expect(daysToMaturity(Date.UTC(2026, 11, 10), NOW)).toBe(40);
    expect(daysToMaturity(null, NOW)).toBeNull();
  });
});

describe('buildCarryMarkets', () => {
  const ms = buildCarryMarkets(POOLS, ROWS, NOW);
  const byId = new Map(ms.map((m) => [m.id, m]));

  it('Kamino: وثیقه با وام استیبل همان بازار جفت می‌شود؛ SOL (غیر استیبل) نه', () => {
    const m = byId.get('k-auto:k-wylds')!;
    expect(m).toBeDefined();
    expect(m.debt).toBe('WYLDS');
    expect(m.borrowRate).toBe(5.75);
    expect(m.maxLtv).toBe(0.78);
    expect(m.liquidationLtv).toBeNull(); // Kamino: فقط حداکثر LTV در داده
    expect(m.liquidityUsd).toBe(20_000);
    expect(m.utilization).toBeCloseTo(99.92, 2);
    expect(byId.has('k-auto:k-sol')).toBe(false);
  });

  it('AUTO دلاری شناخته می‌شود چون خزانهٔ صادرکننده‌اش روی استیبل‌کوین است؛ بازده از صادرکننده', () => {
    const m = byId.get('k-auto:k-wylds')!;
    expect(m.collateralYield).toBe(9.45);
    expect(m.collateralYieldSource).toBe('issuer');
  });

  it('Morpho PT: بازده از پندل، LLTV = آستانهٔ لیکوییدیشن، نقدینگی از ردیف', () => {
    const m = byId.get('m-pt:USDC')!;
    expect(m.collateralYield).toBe(12.45);
    expect(m.collateralYieldSource).toBe('pendle-pt');
    expect(m.liquidationLtv).toBe(0.915);
    expect(m.liquidityUsd).toBe(31_500_000);
    expect(m.maturity).toBe(Date.UTC(2026, 11, 10));
  });

  it('PT سررسیدشده و وثیقهٔ بی‌ثبات حذف می‌شوند', () => {
    expect(ms.some((m) => m.poolId === 'm-old')).toBe(false);
    expect(ms.some((m) => m.collateral === 'WETH')).toBe(false);
  });

  it('وثیقهٔ دلاری با APY صفر و بدون صادرکننده → بازده null (حدس نمی‌زنیم)', () => {
    const out = buildCarryMarkets(POOLS.filter((p) => p.pool !== 'h-auto'), ROWS, NOW);
    expect(out.some((m) => m.collateral === 'AUTO')).toBe(false); // بدون صادرکننده، دلاری بودن هم معلوم نیست
    const pools = POOLS.map((p) => (p.pool === 'h-auto' ? { ...p, apy: 0 } : p));
    const m = buildCarryMarkets(pools, ROWS, NOW).find((x) => x.id === 'k-auto:k-wylds')!;
    expect(m.collateralYield).toBeNull();
    expect(computeCarry(m, 1).netApy).toBeNull();
  });
});

describe('computeCarry', () => {
  const auto = { collateralYield: 10.8, borrowRate: 5.75, maxLtv: 0.78, liquidationLtv: null };

  it('پوزیشن دوست: LTV ≈ ۷۶٪ → اهرم ≈ 4.17x و Net APY ≈ ۲۶٪', () => {
    const r = computeCarry(auto, 0.76 / 0.78);
    expect(r.targetLtv).toBeCloseTo(0.76, 10);
    expect(r.leverage).toBeCloseTo(4.1667, 4);
    expect(r.netApy).toBeCloseTo(4.1667 * 10.8 - 3.1667 * 5.75, 2);
    expect(r.rateSensitivity).toBeCloseTo(3.1667, 4);
    expect(r.spread).toBeCloseTo(5.05, 10);
  });

  it('نرخ وام سربه‌سر Net APY را صفر می‌کند', () => {
    const r = computeCarry(auto, 0.9);
    const atBe = computeCarry({ ...auto, borrowRate: r.breakEvenBorrow! }, 0.9);
    expect(atBe.netApy).toBeCloseTo(0, 10);
  });

  it('شوک نرخ وام: هر ۱٪ ≈ (اهرم − ۱) از Net APY کم می‌کند', () => {
    const base = computeCarry(auto, 0.9);
    const shocked = computeCarry(auto, 0.9, 1);
    expect(base.netApy! - shocked.netApy!).toBeCloseTo(base.rateSensitivity!, 10);
  });

  it('فاصلهٔ لیکوییدیشن: با LLTV دقیق، بدون آن حداقل (با حداکثر LTV)', () => {
    const exact = computeCarry({ ...auto, maxLtv: 0.915, liquidationLtv: 0.915 }, 0.8 / 0.915);
    expect(exact.liquidationDropPct).toBeCloseTo((1 - 0.8 / 0.915) * 100, 10);
    expect(exact.liquidationIsLowerBound).toBe(false);
    const bound = computeCarry(auto, 0.5);
    expect(bound.liquidationDropPct).toBeCloseTo(50, 10);
    expect(bound.liquidationIsLowerBound).toBe(true);
  });

  it('سهم LTV به [0,1] محدود می‌شود', () => {
    expect(computeCarry(auto, 2).targetLtv).toBe(0.78);
    expect(computeCarry(auto, -1).leverage).toBe(1);
  });
});

describe('قدرت خرید (نقد در برابر دارایی)', () => {
  it('مثال پست: نقد +۲٪، SOL −۲۱٪ → حدود ۲۹٪ SOL بیشتر', () => {
    const r = buyingPower(95_000, 2, -21);
    expect(r.extraUnitsPct).toBeCloseTo((1.02 / 0.79 - 1) * 100, 10);
    expect(r.extraUnitsPct).toBeCloseTo(29.11, 2);
    expect(r.differenceUsd).toBeCloseTo(95_000 * 0.23, 6);
  });
  it('دارایی صفر شده → ٪ بی‌معنی (null)', () => {
    expect(buyingPower(1000, 2, -100).extraUnitsPct).toBeNull();
  });
  it('بازده دوره مرکب: ۲۶٪ سالانه در ۳۰ روز ≈ ۱.۹۲٪', () => {
    expect(periodReturnPct(26, 30)).toBeCloseTo((Math.pow(1.26, 30 / 365) - 1) * 100, 10);
    expect(periodReturnPct(26, 365)).toBeCloseTo(26, 10);
  });
});
