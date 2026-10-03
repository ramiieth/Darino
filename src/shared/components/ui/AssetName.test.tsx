/** @vitest-environment jsdom */
import { describe,expect,it } from 'vitest';
import { render,cleanup } from '@testing-library/react';
import { AssetName } from './AssetName';
describe('Persian asset identity',()=>{
 it('shows a Persian name without a repeated Latin ticker',()=>{
  for(const symbol of ['BTC','ETH','USDG','USDT','AVAX','SOL']){const {container}=render(<AssetName symbol={symbol}/>);expect(container.textContent).not.toMatch(/[A-Za-z]/);expect(container.querySelectorAll('p')).toHaveLength(1);expect(container.querySelector('bdi')?.dir).toBe('rtl');cleanup();}
 });
 it('preserves Persian fallback identity and keeps source metadata separate',()=>{
  const {container}=render(<AssetName symbol="UNKNOWN" fallbackName="نام فارسی دارایی" meta="منبع بازار"/>);expect(container.textContent).toBe('نام فارسی داراییمنبع بازار');expect(container.querySelectorAll('p')).toHaveLength(2);expect(container.querySelector('p')?.className).toContain('truncate');
 });
 it('spells an unmapped identifier in Persian without inventing a token name',()=>{const {container}=render(<AssetName symbol="XYZ"/>);expect(container.textContent).toBe('ایکس وای زد');});
});
