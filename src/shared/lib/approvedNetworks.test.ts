import { expect,it } from 'vitest';
import { APPROVED_NETWORKS,approvedNetwork } from './approvedNetworks';
import { safeLogoSrc } from './logoSources';
it('offers precisely the requested networks with distinct Persian identities and trusted logos',()=>{
 expect(APPROVED_NETWORKS.map(n=>n.id)).toEqual(['ethereum','base','arbitrum','polygon','binance-smart-chain','optimism','hyperevm','robinhood','arc','monad','plasma','solana','bitcoin','avalanche','hyperliquid']);
 for(const n of APPROVED_NETWORKS){expect(n.name).toMatch(/[آ-ی]/);expect(safeLogoSrc(n.logo)).toBeTruthy();}
 expect(approvedNetwork('Blast')).toBeUndefined();expect(approvedNetwork('Solana')?.id).toBe('solana');expect(approvedNetwork('hyperliquid')?.id).toBe('hyperliquid');expect(approvedNetwork('Hyperliquid L1')?.id).toBe('hyperliquid');expect(approvedNetwork('Hyperliquid')?.id).toBe('hyperevm');
});
