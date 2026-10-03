// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {ZerionQuotaStatus} from './ZerionQuotaStatus';
import {fetchJson} from '@/repositories/remoteClient';
vi.mock('@/repositories/remoteClient',()=>({fetchJson:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('shows 44 of 300 as approaching the cap, not exhausted, using only our status endpoint',async()=>{
 vi.mocked(fetchJson).mockResolvedValue({quota:{at:Date.now(),dayLimit:300,dayRemaining:44,dayResetSeconds:3600,monthRemaining:null,monthResetSeconds:null}});
 render(<ZerionQuotaStatus refreshKey={false}/>);
 await screen.findByText(/۴۴ درخواست باقی‌مانده از ۳۰۰/);
 expect(screen.queryByText(/تمام شده/)).toBeNull();expect(fetchJson).toHaveBeenCalledWith('/api/integrations?op=status');
});
it('does not present yesterday’s quota as current after its reported reset',async()=>{
 vi.mocked(fetchJson).mockResolvedValue({quota:{at:Date.now()-20000,dayLimit:300,dayRemaining:0,dayResetSeconds:10,monthRemaining:null,monthResetSeconds:null}});
 render(<ZerionQuotaStatus refreshKey={false}/>);await screen.findByText(/در انتظار آمار جدید/);expect(screen.queryByText(/تمام شده/)).toBeNull();
});
