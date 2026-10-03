import { describe, it, expect } from 'vitest';
import { costSummary } from './summary';
import type { CostBook } from './book';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
const asset = { key: 'fungible:ethereum', tokenId: 'ethereum', symbol: 'ETH', name: 'اتریوم', chain: 'ethereum', contract: null, icon: '/logos/token-eth.svg' };
const book: CostBook = { version: 1, asOf: 1000, migrationConfirmed: true, legacyRetired: true, lots: [{ id: 'buy', asset, quantity: '.65', unitCost: '2500', fee: '0', at: 1000, source: 'user-confirmed' }] };
const position = { ...asset, id: 'eth', quantity: '.65', price: 3000, value: 1950, type: 'wallet', verified: true, spam: false, displayable: true };
const wallet = (positions: unknown[], loaded = true, stale = false) => ({ holding: { address: '0x' + '11'.repeat(20) }, state: { data: { complete: true, positions }, history: [], historyLoaded: loaded, historyError: null, next: null }, stale });
const portfolio = (wallets: unknown[], partial = false) => ({ wallets, arcus: [], total: 3000, partial, stale: false }) as unknown as ConnectedPortfolio;
describe('shared dashboard cost valuation', () => {
 it('shows the matched purchase immediately and computes remaining-position USD PnL and share', () => {
  const row = costSummary(portfolio([wallet([position])]), book).rows[0];
  expect(row.basis).toBe(1625); expect(row.avgCost).toBe(2500); expect(row.pnl).toBe(325); expect(row.pnlPct).toBe(20); expect(row.share).toBe(65); expect(row.status).toBe('ready');
 });
 it('keeps entered basis visible but suppresses PnL when history or prices are unavailable', () => {
  const row = costSummary(portfolio([wallet([position], false)]), book).rows[0];
  expect(row.basis).toBe(1625); expect(row.pnl).toBeNull(); expect(row.status).toBe('history');
  expect(costSummary(portfolio([wallet([{ ...position, value: null }])]), book).rows).toHaveLength(0);
 });
 it('does not let an unrelated EVM wallet block matched asset results', () => {
  expect(costSummary(portfolio([wallet([position]), wallet([], false)]), book).rows[0].pnl).toBe(325);
 });
 it('marks stale/partial snapshots and mismatched cost quantity honestly', () => {
  expect(costSummary(portfolio([wallet([position], true, true)]), book).rows[0].pnl).toBeNull();
  const excess = { ...book, lots: [{ ...book.lots[0], quantity: '2' }] };
  expect(costSummary(portfolio([wallet([position])]), excess).rows[0].status).toBe('mismatch');
  expect(costSummary(portfolio([wallet([position])], true), book).rows[0].share).toBeNull();
 });
 it('labels partial coverage and never reports full PnL for unknown purchased quantity', () => {
  const row = costSummary(portfolio([wallet([{ ...position, quantity: '1', value: 3000 }])]), book).rows[0];
  expect(row.pnl).toBe(325); expect(row.status).toBe('partial'); expect(row.valuation.unknown).toBe('0.35'); expect(row.valuation.pnl).toBeNull();
 });
 it('aggregates the same verified fungible across networks without duplicate costs', () => {
  const row = costSummary(portfolio([wallet([{ ...position, quantity: '.3', value: 900 }, { ...position, id: 'base-eth', chain: 'base', quantity: '.35', value: 1050 }])]), book).rows[0];
  expect(row.quantity.toString()).toBe('0.65'); expect(row.pnl).toBe(325); expect(row.chains.size).toBe(2);
 });
 it('excludes spam, dust, protocol positions and verified cash', () => {
  const rows = costSummary(portfolio([wallet([position, { ...position, id: 'spam', tokenId: 'fake', spam: true }, { ...position, id: 'dust', tokenId: 'dust', value: .01 }, { ...position, id: 'defi', type: 'deposit' }, { ...position, id: 'cash', tokenId: 'usd-coin', symbol: 'USDC' }])]), book).rows;
  expect(rows).toHaveLength(1);
 });
});
