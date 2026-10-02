// @vitest-environment jsdom
import {afterEach,it,expect} from 'vitest';
import {render,screen,cleanup,act} from '@testing-library/react';
import {AssetValue} from './AssetValue';
import {useUsdtStore} from '@/shared/store/usdtStore';
afterEach(()=>{cleanup();useUsdtStore.setState({quote:null,status:'idle'});});
it('converts asset values using the shared live rate and follows rate updates',()=>{
 useUsdtStore.setState({quote:{source:'wallex',priceToman:150000,fetchedAt:Date.now(),tradedAt:null},status:'live'});
 render(<AssetValue value={1300.8}/>);expect(screen.getByText('≈ ۱۹۵.۱۲ میلیون تومان')).toBeTruthy();
 act(()=>useUsdtStore.setState({quote:{source:'bitpin',priceToman:160000,fetchedAt:Date.now(),tradedAt:null},status:'live'}));
 expect(screen.getByText('≈ ۲۰۸.۱۳ میلیون تومان')).toBeTruthy();
});
it('labels cached conversions stale and never invents a rate or a zero asset value',()=>{
 useUsdtStore.setState({quote:null,status:'unavailable'});const view=render(<AssetValue value={100}/>);expect(screen.getByText('— تومان')).toBeTruthy();
 act(()=>useUsdtStore.setState({quote:{source:'wallex',priceToman:150000,fetchedAt:Date.now()-3600000,tradedAt:null},status:'stale'}));
 expect(screen.getByText(/قدیمی/)).toBeTruthy();view.rerender(<AssetValue value={null}/>);expect(screen.getByText('— تومان')).toBeTruthy();
});
