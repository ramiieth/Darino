import { describe,it,expect } from 'vitest';
import { normalizeMetadata,findProtocol } from './model';
import { safeLogoSrc } from '@/shared/lib/logoSources';
const logo='https://icons.llamao.fi/icons/protocols/aave-v3';
describe('live identity directory',()=>{
 it('uses official logos and exact identities, including version and parent aliases',()=>{const d=normalizeMetadata([{name:'Aave V3',slug:'aave-v3',parentProtocol:'parent#aave',logo,tvl:100}],[]);expect(findProtocol('Aave V3',d)?.nameFa).toBe('آوه');expect(findProtocol('aave',d)?.logo).toBe(logo);expect(findProtocol('Fake Aave',d)).toBeNull();expect(safeLogoSrc(logo)).toBe(logo);expect(safeLogoSrc('https://icons.llamao.fi.evil.com/icons/protocols/aave')).toBeNull();});
 it('excludes dead protocols even with remaining TVL and does not mark all Synthetix products dead',()=>{const d=normalizeMetadata([{name:'Aave V3',slug:'aave-v3',logo,tvl:100,deadFrom:'2026-09-01'},{name:'SummerFi',slug:'summerfi',logo,tvl:1000},{name:'Synthetix',slug:'synthetix',logo,tvl:2}],[]);expect(d.protocols.map(x=>x.slug)).toEqual(['synthetix']);expect(d.blockedProtocols).toContain('aavev3');expect(findProtocol('Aave V3',d)).toBeNull();});
 it('adds Monad/Plasma with Persian names while omitting known sunsetting networks',()=>{const d=normalizeMetadata([],[{name:'Monad',chainId:143,tvl:10},{name:'Plasma',chainId:9745,tvl:10},{name:'Blast',tvl:100},{name:'Fantom',tvl:30},{name:'Base',tvl:4,deadFrom:'2026-01-01'}]);expect(d.chains.map(c=>c.id)).toEqual(['monad','plasma']);expect(d.chains[0].name).toBe('موناد');expect(d.chains[1].icon).toBe('/logos/chain-plasma.jpg');});
});
