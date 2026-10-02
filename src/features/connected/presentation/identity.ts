import Decimal from 'decimal.js';
import { toFaDigits } from '@/shared/utils/formatters';
import { NETWORKS } from '@/features/custody/domain/catalog';
import { COIN_NAMES_FA, COINS } from '@/features/simulation/domain/constants';
import type { ChainInfo } from '../domain/model';
const names: Record<string,string> = { 'binance-smart-chain':'بی‌ان‌بی چین', xdai:'گنوسیس', 'zksync-era':'زی‌کی‌سینک', 'robinhood':'رابین‌هود', 'solana':'سولانا', 'ethereum':'اتریوم', 'arbitrum':'آربیتروم', 'optimism':'آپتیمیزم', 'base':'بیس', 'polygon':'پالیگان', 'avalanche':'آوالانچ', 'hyperevm':'هایپر ای‌وی‌ام', 'linea':'لینیا', 'scroll':'اسکرول', 'unichain':'یونی‌چین', 'monad':'موناد', 'blast':'بلست', 'berachain':'براچین', 'mantle':'منتل', 'fantom':'فانتوم', 'celo':'سلو', 'sonic':'سونیک', 'plasma':'پلاسما', 'ink':'اینک', 'tempo':'تمپو', 'world':'ورلد چین', 'zora':'زورا' };
export function chainIdentity(id: string, chains: ChainInfo[] = []) { const local = NETWORKS.find(n => n.id === id), remote = chains.find(c => c.id === id); return { name:local?.name ?? names[id] ?? remote?.name ?? id, logo:local?.logo ?? remote?.icon ?? null }; }
const tokenNames:Record<string,string>={ETH:'اتریوم',BTC:'بیت کوین',SOL:'سولانا',BNB:'بی‌ان‌بی',ARB:'آربیتروم',OP:'آپتیمیزم',LINK:'چین‌لینک',AAVE:'آوه',UNI:'یونی‌سواپ',HYPE:'هایپرلیکویید',SUI:'سویی',ENA:'اتنا',USDE:'دلار اتنا',sUSDe:'دلار استیک‌شدهٔ اتنا',SUSDE:'دلار استیک‌شدهٔ اتنا',EURC:'یورو کوین','USD₮0':'تتر',WETH:'اتر رپ شده',WBTC:'بیت کوین رپ شده',USDT:'تتر',USDT0:'تتر',USDC:'یو‌اس‌دی‌سی',USDG:'دلار جهانی',DAI:'دای'};
export function tokenName(symbol: string, fallback: string) { if(tokenNames[symbol.toUpperCase()])return tokenNames[symbol.toUpperCase()]; const id = Object.entries(COINS).find(([,s]) => s === symbol)?.[0]; return id && COIN_NAMES_FA[id] ? COIN_NAMES_FA[id] : fallback || symbol; }
export const positionNames: Record<string,string> = { wallet:'موجودی کیف پول', deposit:'سپرده', loan:'بدهی', locked:'قفل‌شده', staked:'استیک‌شده', reward:'پاداش', investment:'سرمایه‌گذاری' };
export const operationNames: Record<string,string> = { approve:'مجوز قرارداد', revoke:'لغو مجوز', receive:'دریافت', send:'ارسال', trade:'مبادله', deposit:'سپرده', withdraw:'برداشت', claim:'دریافت پاداش', mint:'ایجاد توکن', burn:'سوزاندن', execute:'اجرای قرارداد', deploy:'استقرار قرارداد', delegate:'واگذاری', revoke_delegation:'لغو واگذاری', bid:'پیشنهاد خرید' };

export function tokenQuantity(value:string|null|undefined):string {
 try { if(value==null)return '—';const n=new Decimal(value);if(!n.isFinite())return '—';return toFaDigits(n.toSignificantDigits(8).toFixed()); } catch{return '—';}
}
