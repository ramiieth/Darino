// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import VariationalPage from './VariationalPage';

const ADDR = '0x' + '2'.repeat(40);
vi.mock('@/features/custody/data/useCustody', () => ({
  useCustody: () => ({
    holdings: [{ id: 'var1', kind: 'platform', platformId: 'variational', address: ADDR, label: 'حساب وریشنال من', archivedAt: null }],
    loaded: true
  })
}));
vi.mock('@/repositories/remoteClient', () => ({ fetchJson: vi.fn(() => new Promise(() => {})), HttpError: class extends Error {} }));
afterEach(cleanup);

it('صفحهٔ وریشنال: حساب با موجودی، سود/زیان و پوزیشن، کارمزد صفر، و بازارهای شاخص', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['perp-keyed'], { venues: [], addresses: {} });
  client.setQueryData(['perp-account', 'variational', ADDR], {
    equity: 2500,
    unrealizedPnl: 120,
    allTimePnl: 450,
    realizedPnl: 330,
    positions: [
      { symbol: 'BTC-USDC', side: 'long', size: 0.15, entryPrice: 85000, markPrice: 85800, unrealizedPnl: 120, liquidationPrice: 62000 }
    ]
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VariationalPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

  expect(screen.getByText('وریشنال (Variational)')).toBeTruthy();
  expect(screen.getByText('حساب وریشنال من')).toBeTruthy();
  expect(screen.getByText('کارمزد معامله‌گر ۰٪')).toBeTruthy();
  expect(screen.getByText('لانگ')).toBeTruthy();
  expect(screen.getByText('حذف اتصال')).toBeTruthy();
  expect(screen.getByRole('link', { name: /سایت پروتکل/ }).getAttribute('href')).toBe('https://www.variational.io/en');
  expect(screen.getByRole('link', { name: /پلتفرم معاملاتی Omni/ }).getAttribute('href')).toBe('https://omni.variational.io/');
});
