// @vitest-environment jsdom
import { cleanup,render,screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,expect,it,vi } from 'vitest';
import { PerpPortfolioSection } from './PerpPortfolioSection';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
const ADDR='0x00000000000000000000000000000000000000aa';
const holdings=vi.hoisted(()=>({list:[] as unknown[]}));
vi.mock('@/features/custody/data/useCustody',()=>({useCustody:()=>({holdings:holdings.list,loaded:true})}));
vi.mock('@/repositories/remoteClient',()=>({fetchJson:vi.fn(()=>new Promise(()=>{})),HttpError:class extends Error{}}));
afterEach(()=>{cleanup();holdings.list=[];});
const res=<T,>(data:T)=>({data,fetchedAt:1,error:null,loading:false});
const arcus=[{holding:{id:'a1',label:'آرکوس من',arcus:{env:'mainnet',address:ADDR,accountIndex:0}},stale:false,value:1200,state:{account:res({equity:'1200',netDeposits:'1000'}),positions:res([{marketDisplayName:'BTC-USD',side:'LONG',size:'0.1',averageEntryPrice:'100000',unrealizedPnl:'30',markPx:'100300'}])}}] as unknown as ConnectedPortfolio['arcus'];
const renderWith=(client:QueryClient,a=arcus)=>render(<MemoryRouter><QueryClientProvider client={client}><PerpPortfolioSection arcus={a}/></QueryClientProvider></MemoryRouter>);

it('closed, open and all-time PnL across Arcus + Lighter Robinhood, one card per platform',()=>{
 holdings.list=[{id:'h1',kind:'platform',platformId:'lighter-robinhood',address:ADDR,label:'لایتر من',archivedAt:null}];
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 client.setQueryData(['lighter-robinhood-account',ADDR],{accounts:[{account_index:7,l1_address:ADDR,total_asset_value:'500',positions:[{symbol:'USO',sign:-1,position:'3',avg_entry_price:'145',unrealized_pnl:'-10',liquidation_price:'190'}]}]});
 const now=Math.floor(Date.now()/1000);
 client.setQueryData(['lighter-pnl','robinhood',7],{hourly:[[now,-60]],daily:[[now,-60]]});
 const {container}=renderWith(client);
 expect(screen.getByRole('heading',{name:'سود/زیان پرپچوال'})).toBeTruthy();
 expect(screen.getByText('آرکوس من')).toBeTruthy();expect(screen.getByText('لایتر من')).toBeTruthy();
 expect(screen.getAllByText('۱ پوزیشن باز')).toHaveLength(2);
 const text=container.textContent!;
 expect(text).toContain('+۱۴۰');      // از ابتدا: ۲۰۰ + (−۶۰)
 expect(text).toContain('+۱۲۰');      // بسته‌شده: (۲۰۰ − ۳۰) + (−۶۰ + ۱۰)
 expect(text).toContain('-۵۰');       // بسته‌شدهٔ لایتر
 expect(text).toContain('+۲۰');       // باز: ۳۰ − ۱۰
 expect(text).toContain('۱,۷۰۰');     // ۱۲۰۰ + ۵۰۰
});

it('renders nothing without perp accounts; testnet Arcus is excluded',()=>{
 const testnet=[{...arcus[0],holding:{...arcus[0].holding,arcus:{env:'testnet',address:ADDR,accountIndex:0}}}] as unknown as ConnectedPortfolio['arcus'];
 expect(renderWith(new QueryClient(),testnet).container.textContent).toBe('');
});

it('Hyperliquid and TxFlow accounts get their own cards; Hyperliquid links to its trader report',()=>{
 holdings.list=[
  {id:'hl',kind:'platform',platformId:'hyperliquid',address:ADDR,label:'هایپر من',archivedAt:null},
  {id:'tx',kind:'platform',platformId:'txflow',address:ADDR,label:'تی‌اکس من',archivedAt:null}
 ];
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const state={marginSummary:{accountValue:'3000'},assetPositions:[{position:{coin:'ETH',szi:'1',entryPx:'2300',positionValue:'2400',unrealizedPnl:'100',liquidationPx:'1500'}}]};
 client.setQueryData(['perp-account','hyperliquid',ADDR],{state,portfolio:[['perpAllTime',{pnlHistory:[[1,'0'],[2,'400']]}]],ledger:null});
 client.setQueryData(['perp-account','txflow',ADDR],{state:{marginSummary:{accountValue:'1000'},assetPositions:[]},portfolio:null,ledger:[{time:1,delta:{type:'deposit',usdc:'900'}}]});
 const {container}=renderWith(client,[] as unknown as ConnectedPortfolio['arcus']);
 expect(screen.getByText('هایپر من')).toBeTruthy();expect(screen.getByText('تی‌اکس من')).toBeTruthy();
 expect(screen.getByRole('link',{name:/کارنامه و تاریخچهٔ معاملات/}).getAttribute('href')).toBe(`/intel?a=${ADDR}`);
 expect(screen.getByRole('link',{name:/باز کردن تی‌اکس‌فلو/}).getAttribute('href')).toBe('https://app.txflow.com/');
 const text=container.textContent!;
 expect(text).toContain('+۵۰۰');   // از ابتدا: ۴۰۰ + (۱۰۰۰ − ۹۰۰)
 expect(text).toContain('۴,۰۰۰');  // ارزش کل: ۳۰۰۰ + ۱۰۰۰
});
