/** ============================================================
 * فهرست کامل شبکه‌ها از دیفای‌لاما (api.llama.fi/v2/chains — عمومی، CORS باز)
 *
 *  • فقط برای «انتخاب سریع» شبکه هنگام افزودن: نام، chainId (برای EVM)، نماد توکن اصلی
 *    و شناسهٔ قیمت CoinGecko.
 *  • explorer و decimals در این منبع نیست → خالی/تأییدنشده می‌ماند (حدس زده نمی‌شود).
 *  • شبکه‌ای که در کاتالوگ تأییدشده هست، از این‌جا دوباره اضافه نمی‌شود.
 *  • کش: حافظه + تنظیمات IndexedDB به مدت ۲۴ ساعت.
 * ============================================================ */
import { retiredChains,identityKey } from '@/features/connected/domain/directory/names';
import { NETWORKS } from '../domain/catalog';

export interface DirectoryChain {
  name: string;
  chainId: number | null;
  tokenSymbol: string | null;
  /** شناسهٔ CoinGecko توکن کارمزد (برای قیمت) */
  gasGeckoId: string | null;
  tvl: number;
  /** نام فارسی (اگر در نگاشت شناخته‌شده باشد) */
  nameFa: string | null;
  logo: string;
  /** در کاتالوگ تأییدشدهٔ دارینو موجود است */
  inCatalog: boolean;
}

/** نام فارسی شبکه‌های پرکاربرد — بقیه با نام لاتین (قابل ویرایش توسط کاربر) */
export const CHAIN_NAME_FA: Record<string, string> = {
  Ethereum: 'اتریوم',
  Bitcoin: 'بیت‌کوین',
  Solana: 'سولانا',
  Tron: 'ترون',
  BSC: 'بی‌ان‌بی چین',
  'BNB Chain': 'بی‌ان‌بی چین',
  Arbitrum: 'آربیتروم',
  Base: 'بیس',
  'OP Mainnet': 'اپتیمیزم',
  Optimism: 'اپتیمیزم',
  Polygon: 'پالیگان',
  Avalanche: 'اولانچ',
  'Hyperliquid L1': 'هایپرلیکوئید',
  Hyperliquid: 'هایپرلیکوئید',
  Sui: 'سویی',
  Aptos: 'آپتوس',
  TON: 'تون',
  Ton: 'تون',
  Sonic: 'سونیک',
  Linea: 'لینیا',
  Scroll: 'اسکرول',
  'zkSync Era': 'زی‌کی‌سینک',
  Mantle: 'منتل',
  Blast: 'بلست',
  Cronos: 'کرونوس',
  'Gnosis': 'نوسیس',
  'xDai': 'نوسیس',
  Celo: 'سلو',
  Fantom: 'فانتوم',
  Near: 'نیر',
  Cardano: 'کاردانو',
  Polkadot: 'پولکادات',
  CosmosHub: 'کازماس',
  Starknet: 'استارک‌نت',
  Sei: 'سی',
  Berachain: 'براچین',
  Unichain: 'یونی‌چین',
  Ink: 'اینک',
  Monad: 'موناد',
  Plasma: 'پلاسما',
  Katana: 'کاتانا',
  'Robinhood Chain': 'زنجیرهٔ رابین‌هود',
  Arc: 'آرک',
  XRPL: 'ایکس‌آر‌پی لجر',
  Stellar: 'استلار',
  Algorand: 'الگوراند',
  Litecoin: 'لایت‌کوین',
  Doge: 'دوج‌کوین',
  Dogecoin: 'دوج‌کوین',
  'Bitcoin Cash': 'بیت‌کوین کش',
  Kava: 'کاوا',
  Moonbeam: 'مون‌بیم',
  Klaytn: 'کلایتن',
  Kaia: 'کایا',
  Mode: 'مود',
  Manta: 'مانتا',
  Taiko: 'تایکو',
  Abstract: 'ابسترکت',
  MegaETH: 'مگا اتریوم',
  Flare: 'فلر',
  Rootstock: 'روت‌استاک',
  Core: 'کور',
  Fraxtal: 'فراکس‌تال',
  'Immutable zkEVM': 'ایمیوتبل',
  Metis: 'متیس',
  Zora: 'زورا',
  World: 'ورلد چین',
  'World Chain': 'ورلد چین',
  Soneium: 'سونیوم',
  Hedera: 'هدرا',
  Tezos: 'تزوس',
  Injective: 'اینجکتیو',
  Osmosis: 'اسموسیس',
  Thorchain: 'تورچین',
  Filecoin: 'فایل‌کوین',
  Stacks: 'استکس',
  Movement: 'موومنت',
  Plume: 'پلوم',
  'Plume Mainnet': 'پلوم',
  Story: 'استوری',
  Bob: 'باب',
  'X Layer': 'ایکس لیر',
  'Conflux': 'کانفلاکس',
  Tempo: 'تمپو'
};

const CACHE_KEY = 'custody.chainDirectory.v1';
const TTL = 24 * 3600_000;
let mem: { at: number; list: DirectoryChain[] } | null = null;

const catalogChainIds = new Set(NETWORKS.map((n) => n.chainId).filter((x): x is number => x !== null));
const catalogNames = new Set(NETWORKS.map((n) => n.nameEn?.toLowerCase()).filter(Boolean));

export function llamaChainLogo(name: string): string {
  if(['monad','plasma'].includes(name.toLowerCase()))return '/logos/chain-'+name.toLowerCase()+'.jpg';
  return `https://icons.llama.fi/${encodeURIComponent(name.toLowerCase())}.jpg`;
}

interface RawChain {
  name?: unknown;
  chainId?: unknown;
  tokenSymbol?: unknown;
  gasTokenGeckoId?: unknown;
  gecko_id?: unknown;
  tvl?: unknown; deadFrom?: unknown; disabled?:unknown; deprecated?:unknown; status?:unknown;
}

export function normalizeDirectory(raw: unknown): DirectoryChain[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectoryChain[] = [];
  for (const r of raw as RawChain[]) {
    if (typeof r?.name !== 'string' || !r.name.trim() || r.name.length > 60) continue;
    const name = r.name.trim();
    if(retiredChains.has(identityKey(name))||r.deadFrom||r.disabled===true||r.deprecated===true||['shutdown','sunset','inactive','discontinued'].includes(String(r.status??'').toLowerCase()))continue;
    const chainId = typeof r.chainId === 'number' && Number.isSafeInteger(r.chainId) && r.chainId > 0 ? r.chainId : null;
    const sym = typeof r.tokenSymbol === 'string' && /^[A-Za-z0-9.$₮-]{1,12}$/.test(r.tokenSymbol) ? r.tokenSymbol : null;
    const gas = typeof r.gasTokenGeckoId === 'string' ? r.gasTokenGeckoId : typeof r.gecko_id === 'string' ? r.gecko_id : null;
    out.push({
      name,
      chainId,
      tokenSymbol: sym ?? (gas === 'ethereum' ? 'ETH' : null),
      gasGeckoId: gas && /^[a-z0-9-]{1,80}$/.test(gas) ? gas : null,
      tvl: typeof r.tvl === 'number' && Number.isFinite(r.tvl) ? r.tvl : 0,
      nameFa: CHAIN_NAME_FA[name] ?? null,
      logo: llamaChainLogo(name),
      inCatalog: (chainId !== null && catalogChainIds.has(chainId)) || catalogNames.has(name.toLowerCase())
    });
  }
  return out.sort((a, b) => b.tvl - a.tvl);
}

export async function loadChainDirectory(fetchImpl: typeof fetch = fetch): Promise<DirectoryChain[]> {
  if (mem && Date.now() - mem.at < TTL) return mem.list;
  const { settingGet, settingSet } = await import('@/shared/lib/db');
  const cached = await settingGet<{ at: number; raw: unknown } | null>(CACHE_KEY, null);
  if (cached && Date.now() - cached.at < TTL) {
    mem = { at: cached.at, list: normalizeDirectory(cached.raw) };
    return mem.list;
  }
  try {
    const res = await fetchImpl('https://api.llama.fi/v2/chains', { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const slim = Array.isArray(raw) ? raw.map((r: RawChain) => ({ name: r.name, chainId: r.chainId, tokenSymbol: r.tokenSymbol, gasTokenGeckoId: r.gasTokenGeckoId, gecko_id: r.gecko_id, tvl: r.tvl,deadFrom:r.deadFrom,disabled:r.disabled,deprecated:r.deprecated,status:r.status })) : [];
    await settingSet(CACHE_KEY, { at: Date.now(), raw: slim });
    mem = { at: Date.now(), list: normalizeDirectory(slim) };
    return mem.list;
  } catch {
    // آفلاین: کش قدیمی بهتر از هیچ
    if (cached) return normalizeDirectory(cached.raw);
    throw new Error('فهرست شبکه‌ها در دسترس نیست');
  }
}
