import { describe, expect, it } from 'vitest';
import { persianAssetName } from './assetDisplayName';
describe('Persian quantity labels',()=>{
 it('preserves already-localized collateral and yield units without spelling each character',()=>{
  expect(persianAssetName('بیت کوین رپ شده')).toBe('بیت کوین رپ شده');
  expect(persianAssetName('واحد بازده')).toBe('واحد بازده');
  expect(persianAssetName('تتر')).toBe('تتر');
 });
 it('still localizes provider tickers',()=>{expect(persianAssetName('WBTC')).toMatch(/بیت/);});
});
