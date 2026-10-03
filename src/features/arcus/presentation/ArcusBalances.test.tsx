// @vitest-environment jsdom
import { afterEach,it,expect } from 'vitest';
import { render,screen,cleanup } from '@testing-library/react';
import { ArcusBalanceCard } from './ArcusBalanceCard';
import { ArcusSpotAssets } from './ArcusSpotAssets';
import type { ArcusAccount } from '../api/types';
afterEach(cleanup);
it('shows quote credit independently from account equity and retains token/network identities',()=>{
 render(<ArcusBalanceCard account={{netQuoteBalance:'143.9',equity:'180.25'} as ArcusAccount}/>);
 expect(screen.getByText('۱۴۳.۹')).toBeTruthy();expect(screen.getByText('ارزش کل حساب')).toBeTruthy();expect(screen.getByText('دلار جهانی')).toBeTruthy();expect(screen.getByText('رابین‌هود')).toBeTruthy();expect(document.querySelector('img[src="/logos/token-usdg.png"]')).toBeTruthy();
});
it('uses stock names and quantities without reviving spam or sub-$2 balances',()=>{
 const p={id:'tsla',chain:'robinhood',tokenId:'tsla',symbol:'TSLA',name:'Tesla',contract:'0x'+'ab'.repeat(20),icon:'/logos/token-usdg.png',verified:true,spam:false,displayable:true,quantity:'3.5',value:500,price:142,type:'wallet'};
 render(<ArcusSpotAssets positions={[p,{...p,id:'dust',symbol:'OLD',value:1},{...p,id:'spam',symbol:'SPAM',spam:true}] as any}/>);
 expect(screen.getByText('تسلا')).toBeTruthy();expect(screen.getByText(/۳.۵/)).toBeTruthy();expect(screen.queryByText('اسپات · OLD')).toBeNull();expect(screen.queryByText('اسپات · SPAM')).toBeNull();
});
