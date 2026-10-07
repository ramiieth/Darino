import {expect,it} from 'vitest';
import {marketAssetName,marketBase} from './marketNames';
import fixture from '../../../../tests/fixtures/market-names-20261007.json';
it('uses actual Persian asset names for the reviewed public market inventory on all four hosts',()=>{
 for(const [provider,markets] of Object.entries(fixture))for(const m of markets)expect.soft(marketAssetName(m.symbol,m.name),`${provider}: ${m.symbol}`).toMatch(/[\u0600-\u06ff]/);
});
it('uses readable crypto names rather than spelling their tickers',()=>{for(const [symbol,name] of [['EIGEN','آیگن'],['WLD','ورلدکوین'],['TAO','بیت‌تنسور'],['PYTH','پیت نتورک'],['AERO','ایرودروم'],['STRK','استارک‌نت']])expect(marketAssetName(symbol)).toBe(name);});
it('respects full provider names for reused symbols and preserves unknown company names',()=>{expect(marketAssetName('QNT-USD','Quantinuum')).toBe('کوانتینیوم');expect(marketAssetName('QNT','Quant')).toBe('کوانت');expect(marketAssetName('AI','Artificial Inu')).toBe('آرتیفیشال اینو');expect(marketAssetName('NEW-USD.P','New Corporation')).toBe('New Corporation');expect(marketAssetName('NEW')).toBe('NEW');});
it('resolves both quote separators, receipt-sized market multipliers and Robinhood wrappers',()=>{expect(marketBase('EIGEN_USDC')).toBe('EIGEN');expect(marketAssetName('EIGEN_USDC')).toBe('آیگن');expect(marketAssetName('1000PEPE')).toBe('۱۰۰۰ پپه');expect(marketAssetName('rhQQQ/USDC')).toBe('نزدک ۱۰۰');});
