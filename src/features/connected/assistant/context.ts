import { costSummary } from '@/features/cost-basis/domain/summary';
import { useBorosAccount, accountIsStale } from '@/features/boros/data/useBorosAccount';
import { accountTotals } from '@/shared/boros/account';
import Decimal from 'decimal.js';
import { usToMsNumber } from '@/features/arcus/api/types';
import type { AppContext, AssistantSection, InsightRow } from '@/shared/assistant/schema';
import { useAssistantInsights } from '@/shared/assistant/insights';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import { visiblePositions, visibleTransaction, visibleTransfer } from '../domain/visibility';
import { verifiedCash, COST_PREF, type CostBook } from '@/features/cost-basis/domain/book';
import { getPref } from '@/features/custody/data/repository';
import { ACTIVITY_LINKS } from '../data/useActivity';
import type { ActivityLink } from '../domain/activity';
import { usePerfStore, type PerfCoin, type PerfPeriod } from '@/features/cryptomarkets/data/useTopPerformers';
import { useMarketsStore } from '@/features/markets/pipeline/store';
import { useBorosStore } from '@/features/boros/data/useBoros';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import { borosAssetName, borosVenueName } from '@/features/boros/presentation/borosLabels';
import { useTvlFlowStore } from '@/features/defi/data/useTvlFlow';
import { useVehicleStore } from '@/features/vehicle/data/useVehicles';
import { usePropertyMarketStore } from '@/features/propertyMarket/data/store';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useUsdtStore, usdtIsStale } from '@/shared/store/usdtStore';
import { useMarketStore } from '@/shared/store/marketStore';
import { buildTimeline } from '@/features/simulation/domain/engine';
import { tokenName, chainIdentity } from '../presentation/identity';
const periods: PerfPeriod[] = ['1d', '7d', '30d', '60d', '90d'];
const number = (v: unknown): number | null => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const text = (v: string) => v.slice(0, 160);
const ageStatus = (at: number | null, now: number, maxAge: number): InsightRow['status'] => at === null ? 'unavailable' : now - at > maxAge ? 'stale' : 'ready';
export function insight(name: string, kind: string, metrics: Record<string, number | null>, source: InsightRow['source'], status: InsightRow['status'], asOf: number | null, symbol?: string): InsightRow {
    return { name: text(name), kind: kind.slice(0, 80), metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, number(v)])), source, status, asOf, ...(symbol ? { symbol: symbol.slice(0, 40) } : {}) };
}
function section(key: AssistantSection['key'], name: string, rows: InsightRow[], fetchedAt: number | null, status: AssistantSection['status'], note = '', cap = 400): AssistantSection {
    return { key, name, rows: rows.slice(0, cap), fetchedAt, status, totalRows: rows.length, truncated: rows.length > cap, note };
}
/** Rank observed price returns, never hypothetical future profit; zero is neither gain nor loss. */
export function performanceRankings(coins: PerfCoin[], maps: Record<PerfPeriod, Record<string, number | null>>): AppContext['rankings'] {
    const counts = new Map<string, number>();
    coins.forEach(c => counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + 1));
    return periods.flatMap(period => (['all', 'crypto', 'tokenized', 'tradfi'] as const).map(universe => {
        const selected = coins.filter(c => universe === 'all' || c.kind === universe);
        const rows = selected.filter(c => counts.get(c.symbol) === 1).flatMap(c => {
            const pct = maps[period][c.symbol];
            return typeof pct === 'number' && Number.isFinite(pct) ? [{ name: text(c.nameFa), symbol: c.symbol.slice(0, 40), kind: c.kind, returnPct: pct }] : [];
        });
        const positive = rows.filter(r => r.returnPct > 0).sort((a, b) => b.returnPct - a.returnPct);
        const negative = rows.filter(r => r.returnPct < 0).sort((a, b) => a.returnPct - b.returnPct);
        return { period, universe, available: rows.length, total: selected.length, mostProfit: positive.slice(0, 3), leastProfit: [...positive].reverse().slice(0, 3), mostLoss: negative.slice(0, 3), leastLoss: [...negative].reverse().slice(0, 3) };
    }));
}
export function buildAppContext(p: ConnectedPortfolio, now = Date.now(), activityLinks = getPref<ActivityLink[]>(ACTIVITY_LINKS)?.value ?? []): AppContext {
    const rows = p.wallets.flatMap(w => visiblePositions(w.state?.data?.positions ?? []));
    const cashRows = rows.filter(x => x.type === 'wallet' && verifiedCash(x.chain, x.contract, x));
    const realArcus = p.arcus.filter(a => a.holding.arcus?.env === 'mainnet');
    const free = realArcus.map(a => number(a.state?.account.data?.freeCollateral));
    const walletPartial = p.wallets.some(w => w.stale || !w.state?.data?.complete) || cashRows.some(r => r.value === null);
    const arcusPartial = realArcus.some(a => a.stale || !a.state?.account.fetchedAt || !a.state?.positions.fetchedAt || !!a.state?.positions.error) || free.some(x => x === null);
    const cash = { walletStableUsd: p.wallets.some(w => w.state?.data) ? cashRows.reduce((s, r) => s.plus(r.value ?? 0), new Decimal(0)).toNumber() : null, walletPartial,
        arcusFreeCollateralUsd: free.length && free.some(x => x !== null) ? free.reduce<number>((s, n) => s + (n ?? 0), 0) : null, arcusPartial };
    const sections: AssistantSection[] = [];
    sections.push(section('dashboard', 'داشبورد', [insight('پرتفولیوی واقعی', 'خلاصه', { totalUsd: p.total, walletStableUsd: cash.walletStableUsd, arcusFreeCollateralUsd: cash.arcusFreeCollateralUsd }, 'api', p.stale ? 'stale' : p.partial ? 'partial' : p.total === null ? 'unavailable' : 'ready', null)], null, p.stale ? 'stale' : p.partial ? 'partial' : p.total === null ? 'unavailable' : 'ready', 'ارزش آرکوس در مجموع پرتفولیو وجود دارد؛ ارزش اسمی پوزیشن‌ها دوباره جمع نشود. نقد کیف پول و وثیقه آزاد آرکوس جدا هستند؛ دارایی قفل‌شده نقد خرید نیست.'));
    sections.push(section('wallets', 'مدیریت کیف پول‌ها', p.wallets.map((w, i) => insight(`کیف پول ${i + 1}`, 'حساب', { valueUsd: w.value, assetCount: visiblePositions(w.state?.data?.positions ?? []).length }, 'api', w.stale ? 'stale' : !w.state?.data ? 'unavailable' : w.state.data.complete ? 'ready' : 'partial', w.state?.data?.fetchedAt ?? null)), null, p.partial ? 'partial' : p.stale ? 'stale' : p.wallets.length ? 'ready' : 'empty', 'آدرس و نام خصوصی حساب ارسال نمی‌شود.'));
    const transactions = p.wallets.flatMap(w => (w.state?.history ?? []).filter(visibleTransaction).flatMap(tx => tx.transfers.filter(t => visibleTransfer(t, tx.chain)).map(t => insight(tokenName(t.symbol, t.name ?? t.symbol), `${tx.type} · ${t.direction} · ${chainIdentity(tx.chain).name}${tx.protocol ? ' · ' + tx.protocol : ''}`, { quantity: number(t.quantity), historicalValueUsd: t.value, networkFeeUsd: tx.fee }, 'api', w.stale ? 'stale' : tx.status === 'confirmed' ? 'ready' : 'partial', number(Date.parse(tx.minedAt)), t.symbol)))).sort((a, b) => (b.asOf ?? 0) - (a.asOf ?? 0));
    sections.push(section('transactions', 'تراکنش‌ها', transactions, null, p.wallets.some(w => !w.state?.historyLoaded || w.state.next || w.state.historyError) ? 'partial' : p.stale ? 'stale' : transactions.length ? 'ready' : 'empty', 'آخرین تراکنش‌های موجود؛ تاریخچه ممکن است کامل نباشد. ارزش تاریخی هر انتقال با قیمت امروز فرق دارد؛ کارمزد تکرارشده در ردیف‌های یک تراکنش جمع نشود.', 100));
    const arcusRows = realArcus.flatMap((a, i) => [insight(`آرکوس ${i + 1}`, 'حساب پرپچوال', { equityUsd: a.value, freeCollateralUsd: number(a.state?.account.data?.freeCollateral) }, 'api', a.stale ? 'stale' : a.value === null ? 'unavailable' : 'ready', a.state?.account.fetchedAt ?? null), ...(a.state?.positions.data ?? []).map(x => insight(tokenName(x.marketDisplayName), x.side, { size: number(x.size), entryPrice: number(x.averageEntryPrice), markPrice: number(x.markPx), unrealizedPnlUsd: number(x.unrealizedPnl), marginUsd: number(x.marginUsed), notionalUsd: number(x.positionValueNotional), leverage: number(x.leverage), borrowedUsd: number(x.borrowedCapital) }, 'api', a.state?.positions.error ? 'stale' : ageStatus(a.state?.positions.fetchedAt ?? null, now, 1800000), a.state?.positions.fetchedAt ?? null))]);
    for (const a of realArcus) {
        const state = a.state;
        arcusRows.push(...(state?.openOrders?.data ?? []).slice(0, 30).map(o => insight(tokenName(o.marketDisplayName), `سفارش باز · ${o.side} · ${o.status}`, { price: number(o.price), remainingSize: number(o.remainingSize), filledSize: number(o.filledSize) }, 'api', ageStatus(state?.openOrders?.fetchedAt ?? null, now, 1800000), usToMsNumber(o.updatedAt))));
        arcusRows.push(...(state?.history?.fills.data?.rows ?? []).slice(0, 60).map(f => insight(tokenName(f.marketDisplayName), `اجرای معامله · ${f.side}`, { size: number(f.size), price: number(f.price), feeUsd: number(f.fee), closedPnlUsd: number(f.closedPnl) }, 'api', state?.history.fills.error ? 'stale' : 'ready', usToMsNumber(f.createdAt))));
        arcusRows.push(...(state?.history?.funding.data?.rows ?? []).slice(0, 60).map(f => insight(tokenName(f.marketDisplayName), 'پرداخت تأمین مالی', { fundingRate: number(f.fundingRate), paymentUsd: number(f.payment), size: number(f.size) }, 'api', state?.history.funding.error ? 'stale' : 'ready', usToMsNumber(f.time))));
        arcusRows.push(...(state?.history?.transfers.data?.rows ?? []).slice(0, 30).map(t => insight('آرکوس', `${t.type} · ${t.status}`, { amountUsd: number(t.amount) }, 'api', state?.history.transfers.error ? 'stale' : 'ready', usToMsNumber(t.createdAt))));
        arcusRows.push(insight('پوشش تاریخچه آرکوس', 'وضعیت دریافت', { fillsCount: state?.history?.fills.data?.rows.length ?? null, fillsComplete: state?.history?.fills.data ? Number(state.history.fills.data.complete) : null, fundingCount: state?.history?.funding.data?.rows.length ?? null, fundingComplete: state?.history?.funding.data ? Number(state.history.funding.data.complete) : null }, 'api', 'partial', null));
    }
    // Spot balances already exist in wallet positions; never add them a second time to equity.
    arcusRows.push(...rows.filter(r => r.chain === 'robinhood').map(r => insight(tokenName(r.symbol, r.name), 'دارایی کیف پول رابین‌هود؛ اسپات فقط با تطبیق قرارداد', { quantity: number(r.quantity), valueUsd: r.value, priceUsd: r.price }, 'api', p.stale ? 'stale' : 'ready', null, r.symbol)));
    sections.push(section('arcus', 'آرکوس', arcusRows, null, arcusPartial ? 'partial' : arcusRows.length ? 'ready' : 'empty', 'اکویتی، وثیقه آزاد و پوزیشن‌ها جدا؛ آرکوس تست‌نت حذف شده است. موجودی کیف پول رابین‌هود به‌تنهایی اثبات پوزیشن اسپات آرکوس نیست. تاریخچه فقط ردیف‌های بارگذاری‌شده و محدود به آخرین موارد است؛ بدون پوشش کامل، جمع آن سود کل حساب نیست.'));
    const book = getPref<CostBook>(COST_PREF)?.value;
    let costRows: InsightRow[] = [];
    if (book) {
        const summary = costSummary(p, book, activityLinks);
        const result = summary.result!;
        const historyCovered = p.wallets.length > 0 && p.wallets.every(summary.walletCovered);
        costRows = summary.rows.map(row => insight(tokenName(row.asset.symbol, row.asset.name), 'FIFO', { basisUsd: row.basis, avgCostUsd: row.avgCost, unrealizedPnlUsd: row.pnl, unrealizedPnlPct: row.pnlPct, coveredQuantity: number(row.valuation.covered), unknownQuantity: number(row.valuation.unknown), quantity: row.quantity.toNumber(), valueUsd: row.priced ? row.value.toNumber() : null }, 'saved', row.status === 'ready' && row.pnl !== null ? 'ready' : 'partial', row.current?.at ?? book.asOf, row.asset.symbol));
        costRows.unshift(insight('فروش‌های محاسبه‌شده', 'FIFO', { realizedPnlUsd: historyCovered && !p.stale && !result.issues.length && !Object.keys(book.currentBasis ?? {}).length ? number(result.realized) : null, issueCount: result.issues.length, baselineTs: book.asOf, recordedPurchases: book.lots.length, archivedPurchases: book.archivedPurchases?.length ?? 0 }, 'saved', historyCovered && !result.issues.length && !p.stale ? 'ready' : 'partial', book.asOf));
    }
    if (book)
        costRows.push(...book.lots.map(l => insight(tokenName(l.asset.symbol, l.asset.name), 'خرید ثبت‌شده؛ مبنای هزینه', { quantity: number(l.quantity), unitCostUsd: number(l.unitCost), feeUsd: number(l.fee) }, 'saved', 'reference', l.at, l.asset.symbol)), ...(book.archivedPurchases ?? []).map(l => insight(tokenName(l.symbol), 'خرید بایگانی‌شده؛ موجودی واقعی نیست', { quantity: number(l.quantity), unitCostUsd: number(l.unitCost), feeUsd: number(l.fee) }, 'saved', 'reference', l.at, l.symbol)));
    sections.push(section('costBasis', 'خرید و سود و زیان', costRows, book?.asOf ?? null, !book ? 'unavailable' : costRows.some(r => r.status === 'partial') ? 'partial' : 'ready', 'خریدهای ثبت‌شده مبنای هزینه هستند؛ موجودی واقعی از API است. بهای خرید یا تاریخچه ناقص، سود قطعی تولید نمی‌کند. ردیف‌های خرید اولیه و بایگانی، موجودی فعلی نیستند و با خلاصه FIFO دوباره جمع نشوند.'));
    const perf = usePerfStore.getState();
    const maps: Record<PerfPeriod, Record<string, number | null>> = { '1d': perf.perf1d, '7d': perf.perf7d, '30d': perf.perf30, '60d': perf.perf60, '90d': perf.perf90 };
    const duplicates = new Set(perf.coins.filter((c, i, all) => all.findIndex(x => x.symbol === c.symbol) !== i).map(c => c.symbol));
    const rankMaps = Object.fromEntries(periods.map(d => [d, Object.fromEntries(Object.entries(maps[d]).map(([symbol, value]) => { const at = perf.returnAsOf[d]?.[symbol]; return [symbol, at != null && now - at > 4 * 86400000 ? null : value]; }))])) as typeof maps;
    const perfRows = perf.coins.map(c => insight(tokenName(c.symbol, c.nameFa), c.kind, { ...Object.fromEntries(periods.map(d => [`return${d}Pct`, duplicates.has(c.symbol) ? null : number(maps[d][c.symbol])])), ...Object.fromEntries(periods.map(d => [`return${d}AsOf`, perf.returnAsOf[d]?.[c.symbol] ?? null])) }, 'api', perf.stale ? 'stale' : perf.loading && !perf.historyDone ? 'partial' : 'ready', perf.loadedAt, c.symbol));
    sections.push(section('performance', 'عملکرد بازارها', perfRows, perf.loadedAt, perf.stale ? 'stale' : perf.loading ? 'loading' : perf.loadedAt ? 'ready' : 'unavailable', 'بازده قیمت گذشته است، نه سود آینده یا سود حساب. رتبه‌بندی فقط بین دارایی‌های دارای داده در هر دسته انجام شده؛ نمادهای مشترک مبهم حذف شده‌اند. زمان پایان یا دریافت هر بازده در returnXdAsOf است؛ null یعنی زمان منبع نامشخص. داده بیش از چهار روز قدیمی از رتبه‌بندی حذف می‌شود. کمترین سود و ضرر فقط بر اساس بازده قیمت، نه نوسان یا افت سرمایه است.'));
    const markets = useMarketsStore.getState();
    const marketRows = Object.values(markets.data).flat().map(r => insight(tokenName(r.symbol), r.source, { priceUsd: r.price, marketCapUsd: r.marketCap, return1dPct: r.change24h, return7dPct: r.change7d, return30dPct: r.change30d }, r.snapshot ? 'reference' : 'api', r.snapshot ? 'reference' : ageStatus(markets.lastSyncAt[r.source === 'crypto' ? 'crypto_top_200' : r.source === 'ondo' ? 'ondo_tokenized' : 'xstocks'], now, 300000), markets.lastSyncAt[r.source === 'crypto' ? 'crypto_top_200' : r.source === 'ondo' ? 'ondo_tokenized' : 'xstocks'], r.symbol));
    sections.push(section('markets', 'بازارها', marketRows, null, marketRows.length ? 'partial' : 'unavailable', 'قیمت‌های مرجع و زنده در وضعیت هر ردیف مشخص‌اند؛ برای انتخاب خرید، داده مرجع به‌عنوان قیمت اجرای زنده استفاده نشود.'));
    const boros = useBorosStore.getState();
    const borosRows = boros.markets.flatMap(m => {
        const funding = (m.fundingHistory ?? []).filter(x => Number.isFinite(x.c)).sort((a, b) => a.ts - b.ts);
        return (['long', 'short'] as const).map(direction => {
            const a = BorosCalculationEngine.analyze({ m, size: 1000, direction, nowSec: Math.floor(now / 1000) });
            const metrics: Record<string, number | null> = { marketId: m.marketId, maturityTs: m.maturity * 1000, collateralPriceUsd: m.collateralPriceUsd ?? null, standardNotionalUsd: 1000, fixedApr: m.markApr, floatingApr: m.floatingApr, marginRequiredUsd: a.marginRequired, daysToMaturity: a.daysToMaturity, projectedGrossUsd: direction === 'long' ? a.grossLongPnl : a.grossShortPnl, projectedNetKnownCostsUsd: direction === 'long' ? a.totalLongPnl : a.totalShortPnl, knownFeesUsd: a.fees?.total ?? null, stressAdverseUsd: a.stress.bearNet, stressBaseUsd: a.stress.baseNet, stressFavorableUsd: a.stress.bullNet, meanReversionNetUsd: a.meanReversion.netPnl, fundingPoints: funding.length, confidencePct: a.confidence, rank: direction === 'long' ? a.rankLong : a.rankShort, liquidationApr: null, slippageUsd: null, entranceFeeUsd: null };
            for (const d of [1, 7, 30, 60, 90]) {
                const points = funding.filter(x => x.ts >= now / 1000 - d * 86400 && x.ts <= now / 1000);
                const covered = points.length >= d && points[0].ts <= now / 1000 - (d - 1) * 86400;
                metrics[`floatingMean${d}dApr`] = covered ? points.reduce((s, x) => s + x.c, 0) / points.length : null;
            }
            return insight(`${borosAssetName(m.asset)} · ${borosVenueName(m.venue)}`, `${direction === 'long' ? 'لانگ' : 'شورت'} · ${direction === 'long' ? a.statusLong : a.statusShort} · وثیقه ${tokenName(m.collateralSymbol ?? '')}`, metrics, 'api', boros.stale || a.freshness.stale ? 'stale' : !a.valid || m.status !== 'GOOD' ? 'unavailable' : 'partial', m.snapshotAt ?? boros.loadedAt);
        });
    });
    borosRows.push(...(useAssistantInsights.getState().rows.borosCapitalPlan ?? []).map(r => ({ ...r, status: r.asOf !== null && now - r.asOf > 180000 ? 'stale' as const : r.status })), ...(useAssistantInsights.getState().rows.borosEntry ?? []), ...(useAssistantInsights.getState().rows.borosOfficialPreview ?? []).map(r=>({...r,status:r.asOf!==null&&now-r.asOf>180000?'stale' as const:r.status})));
    const accountState=useBorosAccount.getState(); const account=accountState.data;
    const realRows:InsightRow[]=[];
    if(account){
      const at=account.syncedAt;const status=accountIsStale(accountState,now)?'stale':account.partial?'partial':'ready';
      const prices=new Map(account.assets.map(a=>[a.tokenId,a.priceUsd]));
      const usd=(v:number|null,id:number)=>v!==null&&prices.get(id)!=null&&prices.get(id)!>0?v*prices.get(id)!:null;
      realRows.push(insight('حساب واقعی بوروس','حساب نرخ فاندینگ؛ جدا از مجموع داشبورد',{...accountTotals(account),accountId:account.accountId,positionCount:account.positions.length,historyComplete:Number(account.historyComplete)},'api',status,at));
      realRows.push(...account.positions.map(p=>{const m=boros.markets.find(m=>m.marketId===p.marketId);return insight(m?`${borosAssetName(m.asset)} · ${borosVenueName(m.venue)}`:'بوروس',p.side==='long'?'پوزیشن واقعی لانگ فاندینگ':'پوزیشن واقعی شورت فاندینگ',{marketId:p.marketId,sizeYu:p.size,fixedApr:p.fixedApr,unrealizedPnlUsd:usd(p.unrealized,p.tokenId),allTimeTradePnlUsd:usd(p.realizedTrade,p.tokenId),allTimeSettlementPnlUsd:usd(p.settlement,p.tokenId),liquidationApr:p.liquidationApr,matured:Number(p.matured),remainingGrossSettlementUsd:status==='ready'&&m?.snapshotAt&&now-m.snapshotAt<180000&&p.size!==null&&p.fixedApr!==null&&Number.isFinite(m.floatingApr)?usd((p.side==='long'?1:-1)*p.size*(m.floatingApr-p.fixedApr)*Math.max(0,m.maturity-now/1000)/(365*86400),p.tokenId):null},'api',status,at); }));
      realRows.push(...account.settlements.map(e=>insight('تسویه واقعی بوروس','تسویه خالص؛ هزینه در مبلغ کسر شده',{marketId:e.marketId,netCollateral:e.amount,feeCollateral:e.fee,settlementApr:e.rate,currentEquivalentUsd:usd(e.amount,e.tokenId)},'api',status,e.at)));
      realRows.push(...account.orders.map(o=>insight('سفارش باز بوروس',o.side==='long'?'لانگ فاندینگ':'شورت فاندینگ',{marketId:o.marketId,sizeYu:o.size,apr:o.rate,marginCollateral:o.margin},'api',status,at)));
      realRows.push(...account.transfers.map(e=>insight('انتقال وثیقه بوروس',e.kind,{quantity:e.amount,currentEquivalentUsd:usd(e.amount,e.tokenId)},'api',status,e.at)));
    }else if(accountState.root)realRows.push(insight('حساب واقعی بوروس','حساب ثبت‌شده؛ داده دریافت نشده',{},'api',accountState.loading?'loading':'unavailable',null));
    borosRows.unshift(...realRows);
    sections.push(section('boros', 'بوروس', borosRows, boros.loadedAt, boros.stale ? 'stale' : boros.loading ? 'loading' : borosRows.length ? 'partial' : 'unavailable', 'عمومی: اندازه اسمی ۱۰۰۰ دلار، نه سرمایه کاربر؛ برآورد سررسید و هزینه‌های معلوم، سود اجرای واقعی نیست. واقعی: داده حساب جدا از مجموع داشبورد است؛ هم‌پوشانی زریون بررسی نشده. سود معامله و تسویه از ابتدا برای همان بازار است، نه فقط ورود فعلی یا همه بازارهای بسته‌شده. معادل دلار با قیمت فعلی وثیقه است، نه دلار تاریخی. تسویه خالص شامل هزینه است؛ دوباره کسر نشود. تاریخچه با خلاصه دوباره جمع نشود. تسویه باقی‌مانده فرض ثبات نرخ، پیش از هزینه است. پیش‌نمایش رسمی سفارش اجراشده نیست؛ هزینه کامل و سود آینده را نمی‌دهد.'));
    const defi = useTvlFlowStore.getState();
    const defiRows = [...(useAssistantInsights.getState().rows.stablecoins ?? []), ...defi.chains.map(c => insight(chainIdentity(c.name).name, 'شبکه', { tvlUsd: c.tvl, ...Object.fromEntries(Object.entries(c.changes).map(([d, v]) => [`tvlChange${d}dPct`, v?.pct ?? null])) }, 'api', c.history ? 'ready' : 'partial', defi.loadedAt)), ...defi.protocols.slice().sort((a, b) => b.t - a.t).slice(0, 80).map(c => insight(c.n, `${c.cat} · ${chainIdentity(c.ch).name}`, { tvlUsd: c.t, change1dPct: c.c1, change7dPct: c.c7 }, 'api', ageStatus(defi.loadedAt, now, 3600000), defi.loadedAt))];
    sections.push(section('defi', 'دیفای', defiRows, defi.loadedAt, defi.error ? 'stale' : defi.loading ? 'loading' : defiRows.length ? 'partial' : 'unavailable', 'تغییر TVL سود سرمایه‌گذاری نیست؛ پروتکل‌ها نماینده ۸۰ مورد با بیشترین TVL هستند، نه همه پروتکل‌های جهان.'));
    const settings = useSettingsStore.getState();
    const crypto = Object.fromEntries(perf.coins.filter(c => c.kind === 'crypto' && c.price !== null && !perf.stale && perf.loadedAt !== null && now - perf.loadedAt < 300000).map(c => [c.id, c.price!]));
    const tokenized = Object.fromEntries(marketRows.filter(r => r.kind !== 'crypto' && r.status === 'ready' && r.metrics.priceUsd !== null).map(r => [r.symbol!, r.metrics.priceUsd!]));
    const stocks = Object.fromEntries(Object.values(useMarketStore.getState().quotes).filter(q => q.source === 'live' && now - q.fetchedAt < 86400000).map(q => [q.symbol, q.price]));
    const simulationRows = settings.hydrated ? ([1, 2] as const).flatMap(timeline => { const t = buildTimeline({ timeline, liveCrypto: crypto, liveStocks: stocks, tokenizedPrices: tokenized, ethLivePrice: crypto.ethereum ?? null, overrides: settings.scenario }); return t.rows.map(r => insight(r.nameFa, `سناریوی مستقل ${timeline}`, { baseCapitalUsd: t.baseCapital, buyPrice: r.buyPrice, currentPrice: r.currentPrice, valueUsd: r.valueUsd, profitUsd: r.profitLoss, returnPct: r.changePct }, 'simulation', r.source === 'live' ? 'ready' : 'reference', null, r.symbol)); }) : [];
    sections.push(section('simulation', 'شبیه‌سازی', simulationRows, null, settings.hydrated ? 'reference' : 'unavailable', 'دو بازه مستقل با سرمایه دستی؛ دارایی واقعی نیستند. جمع سود یا ارزش ردیف‌ها به پرتفولیوی واقعی اضافه نشود. قیمت مرجع با قیمت زنده تفکیک شده است.', 500));
    const calcRows = Object.entries(useAssistantInsights.getState().rows).filter(([k]) => k.startsWith('calculator')).flatMap(([, r]) => r).map(r => ({ ...r, status: r.asOf !== null && now - r.asOf > 1800000 ? 'stale' as const : r.status }));
    sections.push(section('calculators', 'ماشین‌حساب', calcRows, null, calcRows.length ? 'ready' : 'empty', 'آخرین نتیجه فرم‌های استفاده‌شده در این نشست؛ محاسبات فرضی هستند. فرم استفاده‌نشده یا نتیجه نامعتبر داده ندارد.'));
    const vehicles = useVehicleStore.getState();
    const vehicleRows = vehicles.snapshots.slice().sort((a, b) => b.dateTs - a.dateTs).slice(0, 3).flatMap(s => s.records.map(r => insight(vehicles.vehicles.find(v => v.id === r.vehicleId)?.name ?? 'خودرو', s.dateLabel, { marketPriceToman: r.marketPriceToman, marketPriceUsd: r.marketPriceUsd, dealerPriceToman: r.dealerPriceToman, usdRateAtSnapshot: s.usdRate }, 'saved', 'reference', s.dateTs)));
    sections.push(section('vehicles', 'خودرو', vehicleRows, null, vehicles.error ? 'unavailable' : vehicleRows.length ? 'reference' : 'empty', 'سه آخرین اسنپ‌شات ثبت‌شده، قیمت زنده خرید نیستند.'));
    const property = usePropertyMarketStore.getState();
    const propertyRows = property.snapshots.slice().sort((a, b) => b.dateTs - a.dateTs).slice(0, 3).flatMap(s => [insight('اهواز', s.dateLabel, { medianTomanPerM2: s.cityStats.medianTomanPerM2, listingCount: s.cityStats.listingCount, medianTotalToman: s.cityStats.medianTotalToman ?? null, usdRateAtSnapshot: s.fxRateAtSnapshotToman }, 'saved', 'reference', s.dateTs), ...s.neighborhoodStats.map(n => insight(n.displayName, s.dateLabel, { medianTomanPerM2: n.stats.medianTomanPerM2, listingCount: n.stats.listingCount, medianTotalToman: n.stats.medianTotalToman ?? null }, 'saved', 'reference', s.dateTs))]);
    sections.push(section('property', 'بازار املاک', propertyRows, null, property.hydrated ? propertyRows.length ? 'reference' : 'empty' : 'unavailable', 'آمار آگهی و اسنپ‌شات بازار، نه قیمت معامله قطعی؛ گردآوری جدید خودکار آغاز نمی‌شود.'));
    sections.push(section('watchlist', 'پیگیری', Object.keys(useWatchlistStore.getState().items).map(s => insight(tokenName(s), 'پیگیری', {}, 'saved', 'ready', useWatchlistStore.getState().items[s], s)), null, useWatchlistStore.getState().hydrated ? 'ready' : 'unavailable'));
    const fx = useUsdtStore.getState();
    sections.push(section('preferences', 'نرخ تتر و تنظیمات تحلیل', fx.quote ? [insight(fx.quote.source === 'wallex' ? 'والکس' : 'بیت‌پین', 'نرخ تتر', { usdtToman: fx.quote.priceToman }, 'api', usdtIsStale(fx.quote, now) || fx.status !== 'live' ? 'stale' : 'ready', fx.quote.fetchedAt)] : [], fx.quote?.fetchedAt ?? null, fx.quote ? usdtIsStale(fx.quote, now) || fx.status !== 'live' ? 'stale' : 'ready' : 'unavailable', 'فقط نرخ تبدیل و شرایط سرمایه‌گذاری؛ هیچ کلید API یا تنظیم امنیتی ارسال نشده است.'));
    sections.push(section('security', 'امنیت', [], null, 'interface', 'این بخش رابط مدیریت امنیت است؛ کلیدها، نشست‌ها و شناسه دستگاه‌ها در دسترس مدل نیستند.'));
    sections.push(section('designSystem', 'سیستم طراحی', [], null, 'interface', 'رابط نمایشی است و داده سرمایه‌گذاری ندارد.'));
    return { version: 1, generatedAt: now, cash, sections, rankings: performanceRankings(perf.coins, rankMaps) };
}
