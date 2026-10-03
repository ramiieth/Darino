import { approvedNetwork } from '@/shared/lib/approvedNetworks';
import { useDirectoryStore } from '../data/directory';
import { CHAIN_NAME_FA,llamaChainLogo } from '@/features/custody/data/chainDirectory';
import { findProtocol } from '../domain/directory/model';
import { persianAssetName } from '@/shared/i18n/assetDisplayName';
import Decimal from 'decimal.js';
import { toFaDigits } from '@/shared/utils/formatters';
import { NETWORKS } from '@/features/custody/domain/catalog';
import { COIN_NAMES_FA, COINS } from '@/features/simulation/domain/constants';
import type { ChainInfo } from '../domain/model';
const names: Record<string,string> = { 'binance-smart-chain':'بی‌ان‌بی چین', xdai:'گنوسیس', 'zksync-era':'زی‌کی‌سینک', 'robinhood':'رابین‌هود', 'solana':'سولانا', 'ethereum':'اتریوم', 'arbitrum':'آربیتروم', 'optimism':'آپتیمیزم', 'base':'بیس', 'polygon':'پالیگان', 'avalanche':'آوالانچ', 'hyperevm':'هایپر ای‌وی‌ام', 'linea':'لینیا', 'scroll':'اسکرول', 'unichain':'یونی‌چین', 'monad':'موناد', 'blast':'بلست', 'berachain':'براچین', 'mantle':'منتل', 'fantom':'فانتوم', 'celo':'سلو', 'sonic':'سونیک', 'plasma':'پلاسما', 'ink':'اینک', 'tempo':'تمپو', 'world':'ورلد چین', 'zora':'زورا' };
export function chainIdentity(id: string, chains: ChainInfo[] = []) { const approved=approvedNetwork(id), local = NETWORKS.find(n => n.id === id), directory=useDirectoryStore.getState().metadata.chains.find(c=>c.id===id),remote = chains.find(c => c.id === id); return { name:approved?.name ?? local?.name ?? names[id] ?? directory?.name ?? CHAIN_NAME_FA[remote?.name??''] ?? remote?.name ?? id, logo:approved?.logo ?? local?.logo ?? remote?.icon ?? directory?.icon ?? (id==='monad'||id==='plasma'?llamaChainLogo(id):null) }; }
const tokenNames:Record<string,string>={ETH:'اتریوم',BTC:'بیت کوین',SOL:'سولانا',BNB:'بی‌ان‌بی',ARB:'آربیتروم',OP:'آپتیمیزم',LINK:'چین‌لینک',AAVE:'آوه',UNI:'یونی‌سواپ',HYPE:'هایپرلیکویید',SUI:'سویی',ENA:'اتنا',USDE:'دلار اتنا',sUSDe:'دلار استیک‌شدهٔ اتنا',SUSDE:'دلار استیک‌شدهٔ اتنا',EURC:'یورو کوین','USD₮0':'تتر',WETH:'اتر رپ شده',WBTC:'بیت کوین رپ شده',USDT:'تتر',USDT0:'تتر',USDC:'یو‌اس‌دی‌سی',USDG:'یو اس دی جی',DAI:'دای'};
export function tokenName(symbol: string, fallback: string = symbol) { if(tokenNames[symbol.toUpperCase()])return tokenNames[symbol.toUpperCase()]; const id = Object.entries(COINS).find(([,s]) => s === symbol)?.[0]; return id && COIN_NAMES_FA[id] ? COIN_NAMES_FA[id] : persianAssetName(symbol,fallback); }
export const positionNames: Record<string,string> = { wallet:'موجودی کیف پول', deposit:'سپرده', loan:'بدهی', locked:'قفل‌شده', staked:'استیک‌شده', reward:'پاداش', investment:'سرمایه‌گذاری' };
export const operationNames: Record<string,string> = { approve:'مجوز قرارداد', revoke:'لغو مجوز', receive:'دریافت', send:'ارسال', trade:'مبادله', deposit:'سپرده', withdraw:'برداشت', claim:'دریافت پاداش', mint:'ایجاد توکن', burn:'سوزاندن', execute:'اجرای قرارداد', deploy:'استقرار قرارداد', delegate:'واگذاری', revoke_delegation:'لغو واگذاری', bid:'پیشنهاد خرید' };

export function tokenQuantity(value:string|null|undefined):string {
 try { if(value==null)return '—';const n=new Decimal(value);if(!n.isFinite())return '—';return toFaDigits(n.toSignificantDigits(8).toFixed()); } catch{return '—';}
}

export function platformName(value:string):string {
 const names:Record<string,string>={pendle:'پندل',arcus:'آرکوس',relay:'ریلی',lifi:'لای‌فای',uniswap:'یونی‌سواپ',aave:'آوه',ethena:'اتنا',boros:'بوروس',cap:'کپ',zerion:'زریون'};
 const key=value.toLowerCase().replace(/[^a-z0-9]/g,'');
 return findProtocol(value,useDirectoryStore.getState().metadata)?.nameFa??names[key]??value;
}
