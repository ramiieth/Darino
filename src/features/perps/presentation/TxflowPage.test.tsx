// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import TxflowPage from './TxflowPage';

const ADDR = '0x' + '1'.repeat(40);
vi.mock('@/features/custody/data/useCustody', () => ({ useCustody: () => ({ holdings: [{ id: 'tx', kind: 'platform', platformId: 'txflow', address: ADDR, label: 'تی‌اکس من', archivedAt: null }], loaded: true }) }));
vi.mock('@/repositories/remoteClient', () => ({ fetchJson: vi.fn(() => new Promise(() => {})), HttpError: class extends Error {} }));
afterEach(cleanup);

it('حساب تی‌اکس‌فلو با ارزش، سود/زیان و پوزیشن، و بازارها', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['perp-keyed'], { venues: [], addresses: {} });
  client.setQueryData(['perp-account', 'txflow', ADDR], { state: { marginSummary: { accountValue: '1000' }, assetPositions: [{ position: { coin: 'BTC', szi: '0.1', entryPx: '60000', unrealizedPnl: '25', liquidationPx: '40000' } }] }, portfolio: null, ledger: [{ time: 1, delta: { type: 'deposit', usdc: '900' } }] });
  client.setQueryData(['calc-perp-markets', 'txflow'], [{ venue: 'txflow', id: '1', base: 'ETH', display: 'ETH-USD', nameFa: 'اتریوم', category: 'crypto', markPrice: 2000, fundingHourly: 0.0001, maxLeverage: 20, maintenanceMarginFraction: null, takerFeePct: null, makerFeePct: null, volume24hUsd: 1, change24hPct: 1 }]);
  render(<QueryClientProvider client={client}><MemoryRouter><TxflowPage /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByText('تی‌اکس من')).toBeTruthy();
  expect(screen.getByText('لانگ')).toBeTruthy();
  expect(screen.getByText('حذف اتصال')).toBeTruthy();
  expect(screen.getByText(/فاندینگ:/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'ژورنال معاملاتی' }).getAttribute('href')).toBe('/journal?tab=neutral');
});
