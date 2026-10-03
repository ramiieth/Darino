import Decimal from 'decimal.js';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { ActivityLink } from '@/features/connected/domain/activity';
import { visiblePositions, trustedToken, tokenLogo } from '@/features/connected/domain/visibility';
import { assetKey, costAsset, decimalPositive, replayCost, valueCost, verifiedCash, type CostBook } from './book';
export function costSummary(portfolio: ConnectedPortfolio, book: CostBook | undefined, links: ActivityLink[] = []) {
 const result = book ? replayCost(book, portfolio.wallets.flatMap(w => w.state?.history ?? []), links, portfolio.wallets.map(w => w.holding.address!)) : null;
 const walletCovered = (w: ConnectedPortfolio['wallets'][number]) => !!book && !!w.state?.historyLoaded && !w.state.historyError && (!w.state.next || w.state.history.some(tx => Date.parse(tx.minedAt) <= book.asOf));
 const grouped = new Map<string, { asset: ReturnType<typeof costAsset>; quantity: Decimal; value: Decimal; priced: boolean; chains: Set<string>; sources: Set<number> }>();
 portfolio.wallets.forEach((wallet, index) => visiblePositions(wallet.state?.data?.positions ?? []).forEach(pos => {
  if (pos.type !== 'wallet' || (!pos.tokenId && !pos.contract) || !pos.quantity || !decimalPositive(pos.quantity) || verifiedCash(pos.chain, pos.contract, pos)) return;
  const key = assetKey(pos), old = grouped.get(key);
  if (old) { old.quantity = old.quantity.plus(pos.quantity); old.chains.add(pos.chain); old.sources.add(index); if (pos.value === null) old.priced = false; else old.value = old.value.plus(pos.value); }
  else grouped.set(key, { asset: { ...costAsset(pos), icon: tokenLogo(pos) }, quantity: new Decimal(pos.quantity), value: new Decimal(pos.value ?? 0), priced: pos.value !== null, chains: new Set([pos.chain]), sources: new Set([index]) });
 }));
 const rows = [...grouped.values()].map(a => {
  const sources = portfolio.wallets.filter((w, index) => a.sources.has(index) || w.state?.history.some(tx => tx.transfers.some(t => t.tokenId && `fungible:${t.tokenId}` === a.asset.key)));
  const ready = !!book && sources.length > 0 && sources.every(w => !!w.state?.data?.complete && walletCovered(w));
  const stale = sources.some(w => w.stale);
  const price = a.priced ? a.value.div(a.quantity).toNumber() : null;
  const allQuantity = portfolio.wallets.flatMap(w => w.state?.data?.positions ?? []).filter(pos => pos.type === 'wallet' && trustedToken(pos) && assetKey(pos) === a.asset.key && pos.quantity && decimalPositive(pos.quantity)).reduce((sum, pos) => sum.plus(pos.quantity!), new Decimal(0)).toString();
  const valuation = valueCost(result?.lots.filter(l => l.asset.key === a.asset.key) ?? [], a.quantity.toString(), price, allQuantity);
  const issues = result?.issues.filter(i => (!i.assetKeys || i.assetKeys.includes(a.asset.key)) && (!i.key.startsWith('opening-fees:') || result.lots.some(l => `opening-fees:${l.id}` === i.key && decimalPositive(l.quantity)))) ?? [];
  const known = valuation.covered !== '0';
  const pnl = ready && !stale && !issues.length ? valuation.pnl ?? valuation.partialPnl : null;
  const basis = known ? valuation.basis : null;
  const status = !known ? 'missing' : valuation.excess !== '0' ? 'mismatch' : issues.length ? 'review' : !ready ? 'history' : stale ? 'stale' : valuation.unknown !== '0' ? 'partial' : 'ready';
  return { ...a, price, sources, ready, stale, issues, valuation, basis, pnl, status, avgCost: basis !== null ? new Decimal(basis).div(valuation.covered).toNumber() : null, pnlPct: pnl !== null && basis !== null && basis > 0 ? pnl / basis * 100 : null, share: !portfolio.partial && !portfolio.stale && portfolio.total != null && portfolio.total > 0 && a.priced ? a.value.toNumber() / portfolio.total * 100 : null };
 });
 return { rows, result, walletCovered };
}
export const COST_STATUS = { missing: 'بهای خرید ثبت نشده', mismatch: 'خرید و موجودی نیازمند تطبیق', review: 'نیازمند بررسی', history: 'تاریخچه ناقص', stale: 'در انتظار همگام‌سازی', partial: 'بهای خرید ناقص', ready: 'تطبیق‌شده' };
