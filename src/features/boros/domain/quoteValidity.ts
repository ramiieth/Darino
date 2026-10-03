import type { OfficialPreview } from '@/shared/boros/account';
export const QUOTE_TTL_MS = 60_000;
/** Bind execution previews to the current account, market, side and size. */
export function quoteUsable(quote: OfficialPreview | null, scopeMatches: boolean, accountAvailable: boolean, marketId: number, side: 'long' | 'short', size: number, maturity: number, now = Date.now()) {
 return !!quote && scopeMatches && accountAvailable && quote.success && quote.marketId === marketId && quote.side === side && quote.matchedSize === size && quote.matchedApr !== null && Number.isFinite(quote.matchedApr) && now >= quote.fetchedAt && now - quote.fetchedAt < QUOTE_TTL_MS && maturity * 1000 > now;
}
