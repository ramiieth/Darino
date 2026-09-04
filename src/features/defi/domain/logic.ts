/**
 * لایه دامنه دیفای — انواع DefiLlama و منطق خالص (بدون React)
 */

/* ---------- انواع ---------- */

/** پاسخ /overview/derivatives — صرافی‌های مشتقه */
export interface PerpDex {
  name: string;
  displayName?: string;
  chains?: string[];
  /** حجم ۲۴ ساعته (دلار) — یا TVL وقتی overview پولی است */
  total24h?: number;
  tokenSymbol?: string;
  tokenPrice?: number | null;
  /** true یعنی از فالبک (پروتکل‌های دسته Derivatives به‌جای overview) استفاده شده */
  isTvlFallback?: boolean;
}

export interface PerpOverviewResponse {
  protocols?: PerpDex[];
}

/** پاسخ /protocol/{slug} — اطلاعات تکمیلی صرافی */
export interface ProtocolDetail {
  name?: string;
  slug?: string;
  description?: string;
  url?: string;
  logo?: string;
  chains?: string[];
  /** توزیع TVL بین شبکه‌ها */
  currentChainTvls?: Record<string, number>;
  /** روند TVL روزانه */
  tvl?: { date: number; totalLiquidityUSD: number }[];
}

/** پاسخ /yields/llama.fi/pools */
export interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase?: number | null;
  apyReward?: number | null;
  ilRisk?: string;
  audited?: boolean;
}

export interface YieldPoolsResponse {
  data?: YieldPool[];
}

/** پاسخ /yields/llama.fi/chart/{pool} */
export interface YieldChartPoint {
  timestamp: number;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
}

export interface YieldChartResponse {
  status: string;
  data?: YieldChartPoint[];
}

/** پاسخ /stablecoins */
export interface StablecoinEntry {
  id: string;
  name: string;
  symbol: string;
  price?: number | null;
  pegType?: string;
  chains?: { chain: string; circulating: number }[];
  /** عرضه در گردش به تفکیک واحد — ما peggedUSD را می‌گیریم */
  circulating?: { peggedUSD?: number };
}

export interface StablecoinsResponse {
  peggedAssets?: StablecoinEntry[];
}

/** پاسخ /stablecoin/{id} — ساختار واقعی: currentChainBalances (نقشه) + price تکی */
export interface StablecoinDetail {
  id?: string;
  name?: string;
  symbol?: string;
  /** نقشه زنجیره → مقدار در گردش */
  currentChainBalances?: Record<string, { peggedUSD?: number; bridgedTo?: number }>;
  price?: number | null;
  pegType?: string;
  pegMechanism?: string;
  url?: string;
}

/** پاسخ /v2/chains — آرایه مستقیم */
export interface ChainInfo {
  name: string;
  tvl?: number;
  tokenSymbol?: string;
}

export type ChainsResponse = ChainInfo[];

/** پاسخ /protocols */
export interface ProtocolRow {
  name: string;
  slug: string;
  tvl?: number;
  category?: string;
  chains?: string[];
  logo?: string;
}

/* ---------- منطق خالص (قابل تست واحد) ---------- */

/** ۱۵ صرافی مشتقه برتر بر اساس حجم ۲۴ ساعته */
export function topPerps(list: PerpDex[], n = 15): PerpDex[] {
  return [...list]
    .filter((p) => typeof p.total24h === 'number')
    .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))
    .slice(0, n);
}

/**
 * فیلترهای سیستمیک رادار بازدهی (قوانین سخت):
 *  - حسابرسی‌شده: audited == true (اگر فیلد در پاسخ موجود باشد)
 *  - بدون زیان ناپایدار: ilRisk == "no"
 *  - حداقل سرمایه: tvlUsd >= 5,000,000
 *  - حداقل نرخ: apy >= 2.0
 *  - تمامی شبکه‌ها (بدون محدودیت)
 *
 * ⚠️ تنزل کارکردی: API فعلی DefiLlama دیگر فیلد `audited` را برنمی‌گرداند
 * (تأییدشده: ۰ از ۱۵٬۶۶۰ استخر). وقتی فیلد غایب باشد، `requireAudit=false`
 * می‌شود و شرط حسابرسی اعمال نمی‌شود (با اطلاع‌رسانی در UI).
 */
export function filterYieldPools(
  pools: YieldPool[],
  requireAudit = true
): YieldPool[] {
  return pools.filter(
    (p) =>
      (!requireAudit || p.audited === true) &&
      (p.ilRisk ?? '').toLowerCase() === 'no' &&
      (p.tvlUsd ?? 0) >= 5_000_000 &&
      (p.apy ?? 0) >= 2.0
  );
}

/** آیا API داده حسابرسی ارائه می‌دهد؟ (تشخیص حضور فیلد در مجموعه) */
export function auditFieldAvailable(pools: YieldPool[]): boolean {
  return pools.some((p) => 'audited' in p);
}

/** ۲۰ استیبل‌کوین برتر بر اساس ارزش بازار (peggedUSD) */
export function topStablecoins(list: StablecoinEntry[], n = 20): StablecoinEntry[] {
  return [...list]
    .filter((s) => (s.circulating?.peggedUSD ?? 0) > 0)
    .sort((a, b) => (b.circulating?.peggedUSD ?? 0) - (a.circulating?.peggedUSD ?? 0))
    .slice(0, n);
}

/** TVL کل دیفای = مجموع TVL شبکه‌ها */
export function totalTvl(chains: ChainInfo[]): number {
  return chains.reduce((acc, c) => acc + (c.tvl ?? 0), 0);
}

/** ۱۵ شبکه برتر بر اساس TVL */
export function topChains(chains: ChainInfo[], n = 15): ChainInfo[] {
  return [...chains].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, n);
}

/** برترین پروتکل‌ها (برای نمای کلی) */
export function topProtocols(protocols: ProtocolRow[], n = 10): ProtocolRow[] {
  return [...protocols].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, n);
}

/** نام خوانا برای شناسه زنجیره (مثل 'ethereum' → 'اتریوم') */
export const CHAIN_NAMES_FA: Record<string, string> = {
  ethereum: 'اتریوم',
  bsc: 'BSC',
  polygon: 'پالیگان',
  arbitrum: 'آربیتروم',
  optimism: 'اپتیمیزم',
  base: 'بیس',
  solana: 'سولانا',
  avalanche: 'آوالانچ',
  fantom: 'فانتوم',
  cronos: 'کرونوس',
  tron: 'ترون',
  bitcoin: 'بیت‌کوین',
  aptos: 'آپتوس',
  sui: 'سویی',
  celo: 'سلو',
  linea: 'لاینا',
  blast: 'بلاست',
  scroll: 'اسکرول',
  zksync: 'زی‌کی‌سینک',
  'polygon-zkevm': 'پالیگان zkEVM',
  gnosis: 'گنوسیس',
  osmosis: 'اسموسیس',
  'binance': 'بایننس'
};

export function chainNameFa(chain: string): string {
  return CHAIN_NAMES_FA[chain.toLowerCase()] ?? chain;
}
