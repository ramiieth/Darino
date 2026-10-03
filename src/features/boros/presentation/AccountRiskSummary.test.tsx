// @vitest-environment jsdom
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect} from 'vitest';
import {AccountRiskSummary} from './AccountRiskSummary';
import {accountSnapshotSchema,packAccount,CROSS} from '@/shared/boros/account';
const root='0x'+'11'.repeat(20),handle=packAccount(root,0,2,CROSS);
const fixture=()=>accountSnapshotSchema.parse({root,accountId:0,fetchedAt:Date.now(),syncedAt:Date.now(),assets:[{tokenId:2,symbol:'WETH',priceUsd:2000,logo:null}],balances:[{handle,tokenId:2,marketId:CROSS,cash:.02,equity:.02,margin:.01,freeMargin:.01,maintenanceBuffer:-.001}],positions:[{handle,marketId:1,tokenId:2,side:'short',size:4,fixedApr:.08,unrealized:0,realizedTrade:0,settlement:0,liquidationApr:.11,matured:false}],orders:[],transfers:[],settlements:[],partial:false,historyComplete:true,errors:[]});
afterEach(cleanup);
describe('account-specific risk evidence',()=>{
 it('warns on a fresh official maintenance shortfall',()=>{render(<AccountRiskSummary account={fixture()} stale={false}/>);expect(screen.getByText(/حاشیهٔ مارجین نگهداری کافی نیست/)).toBeTruthy();});
 it('does not qualify stale or partial data as current risk evidence',()=>{render(<AccountRiskSummary account={{...fixture(),partial:true}} stale={true}/>);expect(screen.getByText(/وضعیت فعلی ریسک قابل تأیید نیست/)).toBeTruthy();expect(screen.queryByText(/حاشیهٔ مارجین نگهداری کافی نیست/)).toBeNull();});
 it('labels missing collateral buffers instead of treating them as zero',()=>{const d=fixture();d.balances[0].maintenanceBuffer=null;render(<AccountRiskSummary account={d} stale={false}/>);expect(screen.getByText('حاشیهٔ نگهداری این وثیقه دریافت نشده است.')).toBeTruthy();expect(screen.queryByText(/حاشیهٔ مارجین نگهداری کافی نیست/)).toBeNull();});
 it('excludes matured positions and does not label absence of alerts as safety',()=>{const d=fixture();d.positions[0].matured=true;render(<AccountRiskSummary account={d} stale={false}/>);expect(screen.getByText('در دادهٔ دریافت‌شده پوزیشن فعال ثبت نشده است.')).toBeTruthy();expect(screen.queryByText('هشدار فعالی وجود ندارد.')).toBeNull();});
});
