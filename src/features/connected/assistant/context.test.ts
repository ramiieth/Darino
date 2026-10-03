// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { useBorosAccount } from '@/features/boros/data/useBorosAccount';
import { packAccount, CROSS } from '@/shared/boros/account';
import { buildAppContext, performanceRankings } from './context';
import { appContextSchema, sectionKeys } from '@/shared/assistant/schema';
import { useBorosStore } from '@/features/boros/data/useBoros';
import { usePerfStore, applyReturns, type PerfCoin } from '@/features/cryptomarkets/data/useTopPerformers';
import { useAssistantInsights } from '@/shared/assistant/insights';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { useMarketsStore } from '@/features/markets/pipeline/store';
import { useTvlFlowStore } from '@/features/defi/data/useTvlFlow';
import { useVehicleStore } from '@/features/vehicle/data/useVehicles';
import { usePropertyMarketStore } from '@/features/propertyMarket/data/store';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useUsdtStore } from '@/shared/store/usdtStore';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import { mapMarket } from '@/features/boros/data/borosService';
import { borosRaw } from '../../../../tests/fixtures/boros';
const NOW = 1800000000000;
const empty = () => ({ wallets: [], arcus: [], total: null, partial: false, stale: false }) as unknown as ConnectedPortfolio;
const coin = (symbol: string): PerfCoin => ({ symbol, id: symbol, nameFa: symbol, kind: 'crypto', price: 10, marketCap: 100 });
beforeEach(() => {
    useBorosAccount.setState({root:'',accountId:0,data:null,loading:false,error:null});
    useBorosStore.setState({ markets: [], loadedAt: null, loading: false, stale: false });
    usePerfStore.setState({ coins: [], perf1d: {}, perf7d: {}, perf30: {}, perf60: {}, perf90: {}, returnAsOf: {}, loadedAt: null, loading: false, historyDone: false, stale: false });
    useAssistantInsights.setState({ rows: {} });
    useSettingsStore.setState({ hydrated: false, apiKeys: ['do-not-send-api-key'] });
    useMarketsStore.setState({ data: { crypto_top_200: [], ondo_tokenized: [], xstocks: [] } });
    useTvlFlowStore.setState({ chains: [], protocols: [], loadedAt: null, loading: false, error: false });
    useVehicleStore.setState({ vehicles: [], snapshots: [] });
    usePropertyMarketStore.setState({ snapshots: [], hydrated: false });
    useWatchlistStore.setState({ items: {}, hydrated: false });
    useUsdtStore.setState({ quote: null });
});
describe('all-app financial context', () => {
    it('includes an explicit status for every section even without a wallet, and excludes credentials', () => {
        const context = appContextSchema.parse(buildAppContext(empty(), NOW));
        expect(context.sections.map(s => s.key).sort()).toEqual([...sectionKeys].sort());
        expect(context.cash.walletStableUsd).toBeNull();
        expect(context.sections.find(s => s.key === 'boros')?.status).toBe('unavailable');
        expect(JSON.stringify(context)).not.toContain('do-not-send-api-key');
    });
    it('validates hydrated simulation and vehicle data without mixing it into real cash', () => {
        useSettingsStore.setState({ hydrated: true });
        const context = appContextSchema.parse(buildAppContext(empty(), NOW));
        expect(context.sections.find(s => s.key === 'simulation')!.rows.length).toBeGreaterThan(0);
        expect(context.cash.walletStableUsd).toBeNull();
    });
    it('delivers real Boros data, both directions, dollar scenario outputs and missing execution costs', () => {
        const m = { ...mapMarket(borosRaw, NOW), maturity: NOW / 1000 + 19 * 86400, markApr: .08, floatingApr: .1, collateralPriceUsd: 3000, status: 'GOOD' as const };
        useBorosStore.setState({ markets: [m], loadedAt: NOW });
        const context = appContextSchema.parse(buildAppContext(empty(), NOW));
        const rows = context.sections.find(s => s.key === 'boros')!.rows;
        expect(rows).toHaveLength(2);
        expect(rows[0].metrics.projectedGrossUsd).toBeCloseTo(1000 * .02 * 19 / 365);
        expect(rows[1].metrics.projectedGrossUsd).toBeCloseTo(-rows[0].metrics.projectedGrossUsd!);
        expect(rows[0].metrics.liquidationApr).toBeNull();
        expect(rows[0].metrics.slippageUsd).toBeNull();
        expect(rows[0].status).toBe('partial');
    });
    it('separates four return ranks and all five periods, excluding zero, missing and ambiguous symbols', () => {
        const coins = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(coin);
        const map = { A: 20, B: 2, C: -1, D: -30, E: 0, F: null, G: 10 };
        const ranks = performanceRankings([...coins, { ...coin('G'), kind: 'tradfi' }], { '1d': map, '7d': map, '30d': map, '60d': map, '90d': map });
        expect(ranks).toHaveLength(20);
        for (const r of ranks.filter(r => r.universe === 'all')) {
            expect(r.available).toBe(5);
            expect(r.mostProfit[0].symbol).toBe('A');
            expect(r.leastProfit[0].symbol).toBe('B');
            expect(r.leastLoss[0].symbol).toBe('C');
            expect(r.mostLoss[0].symbol).toBe('D');
        }
    });
    it('does not reuse expired history as a current ranking', () => {
        usePerfStore.setState({ coins: [coin('A')], perf60: { A: 40 }, loadedAt: NOW, returnAsOf: { '60d': { A: NOW - 5 * 86400000 } } });
        const context = buildAppContext(empty(), NOW);
        expect(context.rankings.find(r => r.period === '60d' && r.universe === 'all')!.available).toBe(0);
        const row = context.sections.find(s => s.key === 'performance')!.rows[0];
        expect(row.metrics.return60dAsOf).toBe(NOW - 5 * 86400000);
    });
    it('refreshes 60/90-day returns and retains their original series timestamp', () => {
        usePerfStore.setState({ perf60: { A: 1 }, perf90: { A: 2 } });
        applyReturns('A', { ret1: null, ret7: null, ret30: null, ret60: 3, ret90: 4 }, NOW - 86400000);
        expect(usePerfStore.getState().perf60.A).toBe(3);
        expect(usePerfStore.getState().perf90.A).toBe(4);
        expect(usePerfStore.getState().returnAsOf['90d']?.A).toBe(NOW - 86400000);
    });
    it('keeps a manual calculator result separate from real balances and strips unknown fields', () => {
        useAssistantInsights.getState().put('calculatorPnl', [{ name: 'محاسبه', kind: 'فرضی', source: 'simulation', status: 'ready', asOf: NOW, metrics: { profit: 100 } }]);
        const raw = buildAppContext(empty(), NOW);
        const parsed = appContextSchema.parse({ ...raw, apiKey: 'never-send', sections: raw.sections.map(s => ({ ...s, address: 'never-send' })) });
        expect(parsed.sections.find(s => s.key === 'calculators')!.rows[0].metrics.profit).toBe(100);
        expect(parsed.cash.walletStableUsd).toBeNull();
        expect(JSON.stringify(parsed)).not.toContain('never-send');
    });
    it('uses API stablecoin balances for cash and keeps Arcus collateral separate', () => {
        const position = { id: 'usdc', tokenId: 'usdc', symbol: 'USDC', name: 'یو اس دی سی', chain: 'base', contract: '0x' + '12'.repeat(20), icon: '/logos/token-usdc.svg', verified: true, spam: false, displayable: true, type: 'wallet', value: 250, quantity: '250', price: 1 };
        const p = { ...empty(), total: 750, wallets: [{ holding: { address: 'private-wallet' }, state: { data: { positions: [position], complete: true, fetchedAt: NOW } }, value: 250, stale: false }], arcus: [{ holding: { arcus: { env: 'mainnet', address: 'private-arcus', accountIndex: 0 } }, value: 500, stale: false, state: { account: { fetchedAt: NOW, data: { freeCollateral: '125' } }, positions: { fetchedAt: NOW, data: [] } } }] } as unknown as ConnectedPortfolio;
        const c = appContextSchema.parse(buildAppContext(p, NOW));
        expect(c.cash).toEqual({ walletStableUsd: 250, walletPartial: false, arcusFreeCollateralUsd: 125, arcusPartial: false });
        expect(c.sections.find(s => s.key === 'dashboard')!.rows[0].metrics.totalUsd).toBe(750);
        expect(JSON.stringify(c)).not.toContain('private-');
    });
    it('does not turn missing wallet balances into zero cash and never exports wallet identifiers', () => {
        const p = { ...empty(), wallets: [{ holding: { address: 'private-wallet-address', label: 'private-account-name' }, value: null, stale: false }] } as unknown as ConnectedPortfolio;
        const c = buildAppContext(p, NOW);
        expect(c.cash.walletStableUsd).toBeNull();
        expect(c.cash.walletPartial).toBe(true);
        const json = JSON.stringify(c);
        expect(json).not.toContain('private-wallet-address');
        expect(json).not.toContain('private-account-name');
    });
});

it('sends actual Boros PnL and preview without identifiers or double-counting dashboard',()=>{
 const root='0x1111111111111111111111111111111111111111';const handle=packAccount(root,0,2,CROSS);
 useBorosAccount.setState({root,data:{root,accountId:0,fetchedAt:NOW,syncedAt:NOW,assets:[{tokenId:2,symbol:'WETH',priceUsd:2000,logo:null}],balances:[{handle,tokenId:2,marketId:CROSS,cash:1,equity:1.1,margin:.2,freeMargin:.9,maintenanceBuffer:1}],positions:[{handle,marketId:1,tokenId:2,side:'long',size:2,fixedApr:.05,unrealized:.02,realizedTrade:.01,settlement:.03,liquidationApr:.15,matured:false}],settlements:[],transfers:[],orders:[],historyComplete:true,partial:false,errors:[]}});
 useAssistantInsights.setState({rows:{borosOfficialPreview:[{name:'پیش‌نمایش رسمی بوروس',kind:'borosOfficialPreview',source:'simulation',status:'partial',asOf:NOW,metrics:{marginCollateral:.02,matchedApr:.08}}]}});
 const context=appContextSchema.parse(buildAppContext(empty(),NOW));const rows=context.sections.find(s=>s.key==='boros')!.rows;
 expect(rows.find(r=>r.name==='حساب واقعی بوروس')!.metrics.equityUsd).toBe(2200);
 expect(rows.find(r=>r.kind==='پوزیشن واقعی لانگ فاندینگ')!.metrics).toMatchObject({unrealizedPnlUsd:40,allTimeTradePnlUsd:20,allTimeSettlementPnlUsd:60});
 expect(rows.some(r=>r.kind==='borosOfficialPreview'&&r.source==='simulation')).toBe(true);
 expect(context.sections.find(s=>s.key==='dashboard')!.rows[0].metrics.totalUsd).toBeNull();
 expect(JSON.stringify(context)).not.toContain(root);expect(JSON.stringify(context)).not.toContain(handle);
});
