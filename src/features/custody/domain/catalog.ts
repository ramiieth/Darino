/** ============================================================
 * کاتالوگ تأییدشدهٔ شبکه‌ها، توکن‌ها، ارائه‌دهنده‌ها و پلتفرم‌ها
 *
 * ⚠️ هیچ مقداری حدسی نیست. منابع (بررسی ۲۰۲۶-۱۰):
 *   - chainId همهٔ شبکه‌ها با eth_chainId روی RPC رسمی هر شبکه تأیید شد.
 *   - decimals/symbol همهٔ توکن‌ها با eth_call (decimals/symbol/name) روی همان شبکه تأیید شد.
 *   - USDC: developers.circle.com/stablecoins/usdc-contract-addresses (+ تطابق با CoinGecko)
 *   - USD₮0: docs.usdt0.to/technical-documentation/deployments · USDT اتریوم: قرارداد رسمی تتر
 *   - USDG: docs.paxos.com/guides/stablecoin/usdg/mainnet · docs.robinhood.com/chain/contracts
 *   - اتریوم: ethereum.org (Etherscan) · بیس: docs.base.org · اپتیمیزم: docs.optimism.io
 *   - پالیگان: docs.polygon.technology · هایپر ای‌وی‌ام: hyperliquid.gitbook.io (explorer رسمی ندارد)
 *   - رابین‌هود: docs.robinhood.com/chain/connecting · آرک: docs.arc.io (connect / contract-addresses)
 *   - آرک: USDC توکن اصلی و کارمزد است؛ موجودی native (۱۸ رقم) و رابط ERC-20 در
 *     0x3600… (۶ رقم) «یک موجودی واحد»اند → فقط یک دارایی ثبت شده تا دوبار شمرده نشود.
 * شبکه/توکن دیگر را کاربر از «محل‌ها» اضافه می‌کند (فهرست کامل شبکه‌ها از دیفای‌لاما).
 * ============================================================ */
import type { ArcusEnv, Asset, Network } from './types';

interface NetDef {
  id: string;
  name: string;
  nameEn: string;
  chainId: number;
  explorer: string | null;
  native: { symbol: string; name: string; nameEn: string; decimals: number; logo: string; coingeckoId?: string };
  reference: string;
}

const NET_DEFS: NetDef[] = [
  {
    id: 'ethereum',
    name: 'اتریوم',
    nameEn: 'Ethereum',
    chainId: 1,
    explorer: 'https://etherscan.io',
    native: { symbol: 'ETH', name: 'اتریوم', nameEn: 'Ether', decimals: 18, logo: '/logos/token-eth.svg', coingeckoId: 'ethereum' },
    reference: 'eth_chainId=1 · ethereum.org/developers/docs/data-and-analytics/block-explorers'
  },
  {
    id: 'arbitrum',
    name: 'آربیتروم',
    nameEn: 'Arbitrum One',
    chainId: 42161,
    explorer: 'https://arbiscan.io',
    native: { symbol: 'ETH', name: 'اتریوم', nameEn: 'Ether', decimals: 18, logo: '/logos/token-eth.svg', coingeckoId: 'ethereum' },
    reference: 'eth_chainId=42161 · docs.usdt0.to (Arbitrum One Chain ID 42161)'
  },
  {
    id: 'base',
    name: 'بیس',
    nameEn: 'Base',
    chainId: 8453,
    explorer: 'https://basescan.org',
    native: { symbol: 'ETH', name: 'اتریوم', nameEn: 'Ether', decimals: 18, logo: '/logos/token-eth.svg', coingeckoId: 'ethereum' },
    reference: 'eth_chainId=8453 · docs.base.org/base-chain/quickstart/connecting-to-base'
  },
  {
    id: 'optimism',
    name: 'اپتیمیزم',
    nameEn: 'OP Mainnet',
    chainId: 10,
    explorer: 'https://explorer.optimism.io',
    native: { symbol: 'ETH', name: 'اتریوم', nameEn: 'Ether', decimals: 18, logo: '/logos/token-eth.svg', coingeckoId: 'ethereum' },
    reference: 'eth_chainId=10 · docs.optimism.io/superchain/networks'
  },
  {
    id: 'polygon',
    name: 'پالیگان',
    nameEn: 'Polygon PoS',
    chainId: 137,
    explorer: 'https://polygonscan.com',
    native: { symbol: 'POL', name: 'پالیگان', nameEn: 'POL', decimals: 18, logo: '/logos/token-pol.png', coingeckoId: 'polygon-ecosystem-token' },
    reference: 'eth_chainId=137 · docs.polygon.technology/pos/reference/rpc-endpoints (Gas token POL)'
  },
  {
    id: 'hyperevm',
    name: 'هایپر ای‌وی‌ام',
    nameEn: 'HyperEVM',
    chainId: 999,
    // مستندات رسمی هایپرلیکوئید explorer رسمی معرفی نمی‌کند — حدس زده نمی‌شود
    explorer: null,
    native: { symbol: 'HYPE', name: 'هایپرلیکوئید', nameEn: 'HYPE', decimals: 18, logo: '/logos/token-hype.png', coingeckoId: 'hyperliquid' },
    reference: 'eth_chainId=999 · hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm (HYPE 18 decimals)'
  },
  {
    id: 'robinhood',
    name: 'زنجیرهٔ رابین‌هود',
    nameEn: 'Robinhood Chain',
    chainId: 4663,
    explorer: 'https://robinhoodchain.blockscout.com',
    native: { symbol: 'ETH', name: 'اتریوم', nameEn: 'Ether', decimals: 18, logo: '/logos/token-eth.svg', coingeckoId: 'ethereum' },
    reference: 'eth_chainId=4663 · docs.robinhood.com/chain/connecting'
  },
  {
    id: 'arc',
    name: 'آرک',
    nameEn: 'Arc',
    chainId: 5042,
    explorer: 'https://explorer.arc.io',
    // USDC توکن اصلی و کارمزد آرک است (دقت native: ۱۸ رقم)
    native: { symbol: 'USDC', name: 'یو‌اس‌دی‌سی', nameEn: 'USD Coin', decimals: 18, logo: '/logos/token-usdc.svg', coingeckoId: 'usd-coin' },
    reference: 'eth_chainId=5042 · docs.arc.io/arc/references/rpc-endpoints · contract-addresses'
  }
];

export const NETWORKS: Network[] = NET_DEFS.map((n) => ({
  id: n.id,
  name: n.name,
  nameEn: n.nameEn,
  kind: 'evm',
  chainId: n.chainId,
  isTestnet: false,
  explorerUrl: n.explorer,
  logo: `/logos/chain-${n.chainId}.png`,
  nativeAssetId: `${n.id}:native`,
  origin: 'catalog',
  reference: n.reference
}));

const T = {
  USDC: { symbol: 'USDC', name: 'یو‌اس‌دی‌سی', nameEn: 'USD Coin', logo: '/logos/token-usdc.svg', coingeckoId: 'usd-coin', ref: 'developers.circle.com/stablecoins/usdc-contract-addresses' },
  USDT: { symbol: 'USDT', name: 'تتر', nameEn: 'Tether USD', logo: '/logos/token-usdt.svg', coingeckoId: 'tether', ref: 'قرارداد رسمی تتر روی اتریوم' },
  USDT0: { symbol: 'USD₮0', name: 'تتر', nameEn: 'USDT0', logo: '/logos/token-usdt0.svg', coingeckoId: 'usdt0', ref: 'docs.usdt0.to/technical-documentation/deployments' },
  USDG: { symbol: 'USDG', name: 'دلار جهانی', nameEn: 'Global Dollar', logo: '/logos/token-usdg.png', coingeckoId: 'global-dollar', ref: 'docs.paxos.com/guides/stablecoin/usdg/mainnet' },
  EURC: { symbol: 'EURC', name: 'یورو کوین', nameEn: 'Euro Coin', logo: '/logos/token-eurc.svg', coingeckoId: 'euro-coin', ref: 'docs.arc.io/arc/references/contract-addresses' }
};

/** [شبکه، توکن، قرارداد، نماد روی زنجیره (eth_call symbol)] — همه decimals=6 تأییدشده */
const ERC20: [string, keyof typeof T, string, string?][] = [
  ['ethereum', 'USDT', '0xdac17f958d2ee523a2206206994597c13d831ec7'],
  ['ethereum', 'USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
  ['ethereum', 'USDG', '0xe343167631d89b6ffc58b88d6b7fb0228795491d'],
  ['arbitrum', 'USDT0', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'],
  ['arbitrum', 'USDC', '0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
  ['arbitrum', 'USDG', '0x004b506865409877c9fa29bfb1eba929984b9bbc'],
  ['base', 'USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
  ['optimism', 'USDC', '0x0b2c639c533813f4aa9d7837caf62653d097ff85'],
  ['optimism', 'USDT0', '0x01bff41798a0bcf287b996046ca68b395dbc1071'],
  ['polygon', 'USDC', '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'],
  // روی پالیگان نماد قرارداد «USDT0» است (نه USD₮0) — همان نمایش داده می‌شود
  ['polygon', 'USDT0', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 'USDT0'],
  ['hyperevm', 'USDC', '0xb88339cb7199b77e23db6e890353e22632ba630f'],
  ['hyperevm', 'USDT0', '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'],
  ['robinhood', 'USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168'],
  ['arc', 'EURC', '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1']
];

export const ASSETS: Asset[] = [
  ...NET_DEFS.map((n) => ({
    id: `${n.id}:native`,
    symbol: n.native.symbol,
    name: n.native.name,
    nameEn: n.native.nameEn,
    networkId: n.id,
    contract: null,
    decimals: n.native.decimals,
    isNative: true,
    logo: n.native.logo,
    coingeckoId: n.native.coingeckoId,
    origin: 'catalog' as const,
    reference: n.reference
  })),
  ...ERC20.map(([net, key, contract, onchainSymbol]) => {
    const t = T[key];
    return {
      id: `${net}:${contract}`,
      symbol: onchainSymbol ?? t.symbol,
      name: t.name,
      nameEn: t.nameEn,
      networkId: net,
      contract,
      decimals: 6,
      isNative: false,
      logo: t.logo,
      coingeckoId: t.coingeckoId,
      origin: 'catalog' as const,
      reference: `${t.ref} · eth_call decimals()=6`
    };
  })
];

/* ---------------- پلتفرم‌ها و ارائه‌دهنده‌ها ---------------- */

export interface Platform {
  id: string;
  /** نام فارسی */
  name: string;
  nameEn: string;
  url: string;
  logo: string | null;
  /** نقش: bridge = ارائه‌دهندهٔ انتقال · venue = محل نگهداری (حساب پلتفرم) */
  roles: ('bridge' | 'swap' | 'venue')[];
}

export const PLATFORMS: Platform[] = [
  { id: 'relay', name: 'ریلی', nameEn: 'Relay', url: 'https://relay.link/', logo: '/logos/platform-relay.png', roles: ['bridge', 'swap'] },
  { id: 'arcus', name: 'آرکوس', nameEn: 'Arcus', url: 'https://arcus.xyz/', logo: '/logos/platform-arcus.png', roles: ['venue'] }
];

/** ارائه‌دهندهٔ «سایر» — نام آزاد */
export const OTHER_PROVIDER_ID = 'other';

/**
 * وثیقهٔ حساب Perpetuals در Arcus — جدا از توکن USDG در کیف پول.
 * طبق docs.arcus.xyz (Onboarding): واریزها به USDG تبدیل و به حساب اعتبار می‌شوند؛
 * API مقادیر را «رشتهٔ اعشاری به واحد quote» برمی‌گرداند (نه مقدار خام توکن).
 * بنابراین decimals برای این دارایی null است: واحد خام/decimals در API عمومی منتشر نشده.
 */
export function arcusCollateralAssetId(env: ArcusEnv): string {
  return `platform:arcus:${env}:collateral`;
}

export function arcusCollateralAsset(env: ArcusEnv): Asset {
  return {
    id: arcusCollateralAssetId(env),
    symbol: 'USDG',
    name: env === 'mainnet' ? 'وثیقهٔ آرکوس' : 'وثیقهٔ آرکوس (آزمایشی)',
    nameEn: 'Arcus perps collateral',
    networkId: null,
    contract: null,
    decimals: null,
    isNative: false,
    platformId: 'arcus',
    logo: '/logos/token-usdg.png',
    origin: 'catalog',
    reference: 'docs.arcus.xyz/concepts/onboarding · api-reference (amount: human-readable decimal string)'
  };
}

export const ARCUS_ASSETS: Asset[] = [arcusCollateralAsset('mainnet'), arcusCollateralAsset('testnet')];

/* ---------------- جست‌وجو ---------------- */

export function nativeAssetId(networkId: string): string {
  return `${networkId}:native`;
}

export function tokenAssetId(networkId: string, contract: string): string {
  return `${networkId}:${contract.toLowerCase()}`;
}

export function findPlatform(id: string | null | undefined): Platform | undefined {
  return id ? PLATFORMS.find((p) => p.id === id) : undefined;
}
