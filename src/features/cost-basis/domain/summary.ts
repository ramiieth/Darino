import { validCurrentBasis } from './currentBasis';
import Decimal from 'decimal.js';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { ActivityLink } from '@/features/connected/domain/activity';
import { visiblePositions, trustedToken, tokenLogo, catalogToken } from '@/features/connected/domain/visibility';
import { assetKey, costAsset, decimalPositive, replayCost, valueCost, verifiedCash, type CostBook } from './book';
export function costSummary(portfolio: ConnectedPortfolio, book: CostBook | undefined, links: ActivityLink[] = [], includeCash = false) {
 const result = book ? replayCost(book, portfolio.wallets.flatMap(w => w.state?.history ?? []), links, portfolio.wallets.map(w => w.holding.address!)) : null;
 const walletCovered = (w: ConnectedPortfolio['wallets'][number]) => !!book && !!w.state?.historyLoaded && !w.state.historyError && (!w.state.next || w.state.history.some(tx => Date.parse(tx.minedAt) <= book.asOf));
 const grouped = new Map<string, { asset: ReturnType<typeof costAsset>; quantity: Decimal; value: Decimal; priced: boolean; chains: Set<string>; sources: Set<number> }>();
 portfolio.wallets.forEach((wallet, index) => visiblePositions(wallet.state?.data?.positions ?? []).forEach(pos => {
  if (pos.type !== 'wallet' || (!pos.tokenId&&!pos.contract&&!catalogToken(pos)) || !pos.quantity || !decimalPositive(pos.quantity) || (!includeCash && verifiedCash(pos.chain, pos.contract, pos))) return;
  const key = assetKey(pos), old = grouped.get(key);
  if (old) { old.quantity = old.quantity.plus(pos.quantity); old.chains.add(pos.chain); old.sources.add(index); if (pos.value === null) old.priced = false; else old.value = old.value.plus(pos.value); }
  else grouped.set(key, { asset: { ...costAsset(pos), icon: tokenLogo(pos) }, quantity: new Decimal(pos.quantity), value: new Decimal(pos.value ?? 0), priced: pos.value !== null, chains: new Set([pos.chain]), sources: new Set([index]) });
 }));
 const rows = [...grouped.values()].map(a => {
  const storedCurrent=book?.currentBasis?.[a.asset.key];
  const current = validCurrentBasis(storedCurrent,a.asset.key) ? storedCurrent : undefined;
  const effectiveBook = current && book ? { ...book, asOf: current.at, lots: [{ id: 'current:'+a.asset.key, asset: current.asset, quantity: current.quantity, unitCost: new Decimal(current.total).div(current.quantity).toString(), fee: '0', at: current.at, source: 'current-balance-confirmed' }, ...book.lots.filter(l => l.asset.key !== a.asset.key)] } : book;
  const localResult = current && effectiveBook ? replayCost(effectiveBook, portfolio.wallets.flatMap(w => w.state?.history ?? []), links, portfolio.wallets.map(w => w.holding.address!)) : result;
  const holdingSources = portfolio.wallets.filter((_,index)=>a.sources.has(index));
  const sources = portfolio.wallets.filter((w, index) => a.sources.has(index) || w.state?.history.some(tx => tx.transfers.some(t => t.tokenId && `fungible:${t.tokenId}` === a.asset.key)));
  const cash = verifiedCash(a.asset.chain,a.asset.contract,{verified:true,tokenId:a.asset.tokenId,symbol:a.asset.symbol});
  const ready = !!book && sources.length > 0 && sources.every(w => !!w.state?.data?.complete && (current ? ((cash || w.state.data.fetchedAt <= current.at) && new Decimal(current.quantity).eq(a.quantity)) || (!!w.state.historyLoaded && !w.state.historyError && (!w.state.next || w.state.history.some(tx => Date.parse(tx.minedAt) <= current.at))) : walletCovered(w)));
  const stale = sources.some(w => w.stale);
  const price = a.priced ? a.value.div(a.quantity).toNumber() : null;
  const allQuantity = portfolio.wallets.flatMap(w => w.state?.data?.positions ?? []).filter(pos => pos.type === 'wallet' && trustedToken(pos) && assetKey(pos) === a.asset.key && pos.quantity && decimalPositive(pos.quantity)).reduce((sum, pos) => sum.plus(pos.quantity!), new Decimal(0)).toString();
  const valuation = valueCost(localResult?.lots.filter(l => l.asset.key === a.asset.key) ?? [], a.quantity.toString(), price, allQuantity);
  const issues = localResult?.issues.filter(i => (!i.assetKeys || i.assetKeys.includes(a.asset.key)) && (!i.key.startsWith('opening-fees:') || localResult.lots.some(l => `opening-fees:${l.id}` === i.key && decimalPositive(l.quantity)))) ?? [];
  if(storedCurrent&&!current)issues.push({key:'invalid-current:'+a.asset.key,reason:'بهای تطبیق‌شده معتبر نیست',assetKeys:[a.asset.key]});
  const known = valuation.covered !== '0';
  const pending = !!current?.pendingBalanceConfirmation;
  const pnl = ready && !stale && !pending && !issues.length ? valuation.pnl ?? valuation.partialPnl : null;
  const matchesPending=pending&&new Decimal(current!.quantity).eq(a.quantity);
  const basis = matchesPending ? Number(current!.total) : known ? valuation.basis : null;
  const status = pending ? (matchesPending?'confirmation':'mismatch') : !known ? 'missing' : valuation.excess !== '0' ? 'mismatch' : issues.length ? 'review' : !ready ? 'history' : stale ? 'stale' : valuation.unknown !== '0' ? 'partial' : 'ready';
  return { ...a, current, price, sources, holdingSources, ready:ready&&!pending, stale, issues, valuation, basis, pnl, status, avgCost: basis !== null ? new Decimal(basis).div(matchesPending?a.quantity:valuation.covered).toNumber() : null, pnlPct: pnl !== null && basis !== null && basis > 0 ? pnl / basis * 100 : null, share: !portfolio.partial && !portfolio.stale && portfolio.total != null && portfolio.total > 0 && a.priced ? a.value.toNumber() / portfolio.total * 100 : null };
 });
 return { rows, result, walletCovered };
}
export const COST_STATUS = { confirmation: 'تأیید موجودی به‌روز لازم است', missing: 'بهای خرید ثبت نشده', mismatch: 'خرید و موجودی نیازمند تطبیق', review: 'نیازمند بررسی', history: 'تاریخچه ناقص', stale: 'در انتظار همگام‌سازی', partial: 'بهای خرید ناقص', ready: 'تطبیق‌شده' };
