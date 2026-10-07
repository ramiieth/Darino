import { expect,it } from 'vitest';
import { pendleMarketLogos } from './pendleLogos';
import { safeLogoSrc } from '../lib/logoSources';
const contract='0x'+'ab'.repeat(20),icon='https://storage.googleapis.com/prod-pendle-bucket-a/images/uploads/new-token.svg';
it('maps future receipts by chain and contract, independently of ticker and expiry',()=>{
 const logos=pendleMarketLogos([{chainId:1,name:'FUTURE',icon,address:contract,yt:'1-'+contract,pt:'1-'+contract},{chainId:42161,name:'OTHER',icon,address:contract,yt:'42161-'+contract,pt:'42161-'+contract}]);
 expect(logos).toHaveLength(6);expect(logos.filter(l=>l.chainId===42161).every(l=>l.logo===icon)).toBe(true);
 expect(pendleMarketLogos([{chainId:1,icon,address:contract,yt:'42161-'+contract}])).toHaveLength(1);
});
it('accepts only the Pendle image bucket, rejects traversal and unrelated hosts',()=>{
 expect(safeLogoSrc(icon)).toBe(icon);for(const url of ['https://evil.example/token.svg','https://storage.googleapis.com/other-bucket/token.svg','https://storage.googleapis.com/prod-pendle-bucket-a/images/../token.svg'])expect(safeLogoSrc(url)).toBeNull();
 expect(pendleMarketLogos([{chainId:1,icon:'https://evil.example/token.svg',address:contract}])).toEqual([]);
});
