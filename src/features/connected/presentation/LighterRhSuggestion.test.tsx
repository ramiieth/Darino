// @vitest-environment jsdom
import { cleanup,render,screen,fireEvent,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { LighterRhSuggestion,LIGHTER_RH_DISMISSED_PREF } from './LighterRhSuggestion';
const address='0x1111111111111111111111111111111111111111';
const custody=vi.hoisted(()=>({holdings:[] as Record<string,unknown>[],prefs:{} as Record<string,unknown>}));
const repo=vi.hoisted(()=>({saveHolding:vi.fn(async(_h:Record<string,unknown>)=>{}),savePref:vi.fn(async(_id:string,_v:unknown)=>{})}));
vi.mock('@/features/custody/data/useCustody',()=>({useCustody:()=>({holdings:custody.holdings,loaded:true})}));
vi.mock('@/features/custody/data/repository',()=>({...repo,getPref:(id:string)=>id in custody.prefs?{value:custody.prefs[id]}:undefined,getCustodySnapshot:()=>({holdings:custody.holdings})}));
const fetchJson=vi.hoisted(()=>vi.fn());
vi.mock('@/repositories/remoteClient',()=>({fetchJson,HttpError:class extends Error{}}));
const account=(positions:unknown[])=>({accounts:[{account_index:3,l1_address:address,total_asset_value:'500',available_balance:'200',positions}]});
beforeEach(()=>{custody.holdings=[];custody.prefs={};repo.saveHolding.mockClear();repo.savePref.mockClear();fetchJson.mockReset();});
afterEach(cleanup);
const view=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LighterRhSuggestion address={address} label="کیف پول اصلی"/></QueryClientProvider>);

it('offers to add a wallet that has a Lighter Robinhood account and saves only the public address',async()=>{
 fetchJson.mockResolvedValue(account([{symbol:'SLV',position:'10',sign:1,avg_entry_price:'57'}]));
 view();
 expect(await screen.findByText('حساب لایتر رابین‌هود پیدا شد')).toBeTruthy();
 expect(screen.getByText(/۱ حساب و ۱ پوزیشن باز/)).toBeTruthy();
 expect(fetchJson.mock.calls[0][0]).toBe(`/api/integrations?op=lighter-account&address=${address}`);
 fireEvent.click(screen.getByRole('button',{name:'افزودن حساب'}));
 await waitFor(()=>expect(repo.saveHolding).toHaveBeenCalledOnce());
 expect(repo.saveHolding.mock.calls[0][0]).toMatchObject({kind:'platform',platformId:'lighter-robinhood',address,label:'کیف پول اصلی · لایتر رابین‌هود',archivedAt:null});
});

it('stays hidden when the wallet has no account',async()=>{
 fetchJson.mockResolvedValue({accounts:[]});
 const {container}=view();
 await waitFor(()=>expect(fetchJson).toHaveBeenCalled());
 expect(container.textContent).toBe('');
});

it('does not even look up wallets already linked or dismissed',()=>{
 custody.holdings=[{id:'h',kind:'platform',platformId:'lighter-robinhood',address:address.toUpperCase().replace('0X','0x'),archivedAt:null}];
 view();cleanup();
 custody.holdings=[];custody.prefs={[LIGHTER_RH_DISMISSED_PREF]:[address]};
 view();
 expect(fetchJson).not.toHaveBeenCalled();
});

it('remembers a dismissal per address',async()=>{
 fetchJson.mockResolvedValue(account([]));
 view();
 fireEvent.click(await screen.findByRole('button',{name:'نه، ممنون'}));
 await waitFor(()=>expect(repo.savePref).toHaveBeenCalledWith(LIGHTER_RH_DISMISSED_PREF,[address]));
});
