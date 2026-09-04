/**
 * محاسبات خلاصه پورتفولیوی اتریوم (لایه دامنه)
 *
 *   ETH Amount:              3.33
 *   ETH Buy Price:           $2,820.00
 *   Initial ETH Investment:  $9,390.60
 *   ETH Current Price:       [زنده از CoinGecko]
 *   Current ETH Value:       [3.33 × قیمت فعلی]
 *   Profit/Loss:             [ارزش فعلی − $9,390.60]
 */
import { ETH_POSITION } from '@/features/simulation/domain/constants';
import { PRICE_SNAPSHOT_FALLBACK } from '@/features/simulation/domain/constants';
import type { PriceSource } from '@/shared/types';

export interface EthSummaryComputed {
  amount: number;
  buyPrice: number;
  initialInvestment: number;
  currentPrice: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPct: number | null;
  source: PriceSource;
  usdcAllocation: number;
}

export function computeEthSummary(
  livePrice: number | null,
  overrides?: { amount?: number; buyPrice?: number; initialInvestment?: number; usdcAllocation?: number }
): EthSummaryComputed {
  const amount = overrides?.amount ?? ETH_POSITION.AMOUNT;
  const buyPrice = overrides?.buyPrice ?? ETH_POSITION.BUY_PRICE;
  const initial = overrides?.initialInvestment ?? ETH_POSITION.INITIAL_INVESTMENT;
  const usdc = overrides?.usdcAllocation ?? ETH_POSITION.USDC_ALLOCATION_2026;

  let currentPrice = livePrice;
  let source: PriceSource = 'live';
  if (currentPrice === null || currentPrice === undefined || !Number.isFinite(currentPrice)) {
    const snap = PRICE_SNAPSHOT_FALLBACK.ethereum;
    if (typeof snap === 'number' && Number.isFinite(snap)) {
      currentPrice = snap;
      source = 'snapshot';
    } else {
      currentPrice = null;
      source = 'na';
    }
  }

  const currentValue = currentPrice !== null ? amount * currentPrice : null;
  const profitLoss = currentValue !== null ? currentValue - initial : null;
  const profitLossPct =
    profitLoss !== null && initial > 0 ? (profitLoss / initial) * 100 : null;

  return {
    amount,
    buyPrice,
    initialInvestment: initial,
    currentPrice,
    currentValue,
    profitLoss,
    profitLossPct,
    source,
    usdcAllocation: usdc
  };
}
