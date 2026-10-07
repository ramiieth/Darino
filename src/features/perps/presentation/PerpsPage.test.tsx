// @vitest-environment jsdom
import { cleanup,render,screen,fireEvent } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,expect,it,vi } from 'vitest';
import PerpsPage from './PerpsPage';
vi.mock('@/features/custody/data/useCustody',()=>({useCustody:()=>({holdings:[],loaded:true})}));
vi.mock('@/repositories/remoteClient',()=>({fetchJson:vi.fn(()=>new Promise(()=>{})),HttpError:class extends Error{}}));
afterEach(cleanup);
it.each(['lighter','ondo'] as const)('renders Persian tickers, currency units and figures on %s',provider=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 client.setQueryData(['perps-markets',provider],[{symbol:'USO',price:145.29,change:12.5},{symbol:'FUTURE2',price:0.000125,change:null},{symbol:'EIGEN',price:1.2,change:null}]);
 const {container}=render(<QueryClientProvider client={client}><PerpsPage provider={provider}/></QueryClientProvider>);
 expect(screen.getByText('یو‌اس‌او')).toBeTruthy();expect(screen.getByText('آیگن')).toBeTruthy();expect(screen.getByText('FUTURE2')).toBeTruthy();
 expect(screen.getByText('قیمت مارک: ۱۴۵.۲۹ '+(provider==='lighter'?'یو‌اس‌دی‌جی':'دلار'))).toBeTruthy();
 expect(container.textContent).not.toMatch(/USDG|USD|\bUSO\b/);
});

it('offers four separate Lighter views and retains Robinhood currency only in its own view',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 client.setQueryData(['perps-markets','lighter-mainnet','perp'],[{symbol:'BTC',price:100,change:null}]);
 client.setQueryData(['perps-markets','lighter-mainnet','spot'],[{symbol:'LIT/USDC',price:3.8,change:null}]);
 client.setQueryData(['perps-markets','lighter'],[{symbol:'USO',price:145.29,change:null}]);
 render(<QueryClientProvider client={client}><PerpsPage provider="lighter" initialTab="perp"/></QueryClientProvider>);
 expect(screen.getAllByRole('tab')).toHaveLength(4);expect(screen.getByText('قیمت مارک: ۱۰۰ یو‌اس‌دی‌سی')).toBeTruthy();expect(screen.queryByText('صندوق نفت آمریکا')).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'بازار اسپات'}));expect(screen.getByText('قیمت: ۳.۸ یو‌اس‌دی‌سی')).toBeTruthy();expect(screen.queryByText('قیمت مارک: ۱۰۰ یو‌اس‌دی‌سی')).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'دارایی‌ها'}));expect(screen.getByRole('heading',{name:'دارایی‌های لایتر'})).toBeTruthy();expect(screen.queryByText('صندوق نفت آمریکا')).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'رابین‌هود'}));expect(screen.getByText('قیمت مارک: ۱۴۵.۲۹ یو‌اس‌دی‌جی')).toBeTruthy();
});
