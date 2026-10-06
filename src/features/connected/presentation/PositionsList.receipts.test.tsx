// @vitest-environment jsdom
import { render,screen,cleanup } from '@testing-library/react';
import { afterEach,expect,it } from 'vitest';
import { PositionsList } from './PositionsList';
import type { LivePosition, WalletSnapshot } from '../domain/model';
afterEach(cleanup);
const base:LivePosition={id:'x',tokenId:'x',chain:'ethereum',contract:'0x'+'ab'.repeat(20),name:'',symbol:'',icon:'/logos/token-usdc.svg',quantity:'10',value:10,price:1,type:'wallet',protocol:'Pendle',protocolIcon:null,group:null,receipt:null,displayable:true,spam:false};
it('shows generic YT, PT and LP identities, underlying icons and separate maturities in wallet positions',()=>{const data:WalletSnapshot={address:'0x'+'ab'.repeat(20),fetchedAt:Date.now(),total:30,change:null,complete:true,unpriced:0,chains:[],positions:[{...base,id:'yt',symbol:'YT-sUSDx-03DEC2026'},{...base,id:'pt',symbol:'PT-sUSDat-14JAN2027'},{...base,id:'lp',symbol:'LP-NEW-2028-01-01'}]};const {container}=render(<PositionsList data={data}/>);for(const label of ['وای‌تی','پی‌تی','ال‌پی'])expect(screen.getByText(label,{exact:true})).toBeTruthy();expect(screen.getByText('سررسید ۱۲ آذر ۱۴۰۵')).toBeTruthy();expect(screen.getByText('سررسید ۲۴ دی ۱۴۰۵')).toBeTruthy();expect(container.querySelectorAll('[data-yield-label]')).toHaveLength(3);expect(container.querySelectorAll('[data-yield-token] .token-network-badge img')).toHaveLength(3);expect(container.querySelector('svg[data-yield-token]')).toBeNull();});
