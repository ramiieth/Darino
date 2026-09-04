/**
 * کاتالوگ دارایی‌ها برای ماشین‌حساب‌ها — ۶ کلاس:
 * ارز دیجیتال / سهام / ETF / توکن‌ایز / کالا / قراردادهای Perpetual
 */
import { COINS, COIN_NAMES_FA, TRADFI_ASSETS, TRADFI_NAMES, TOKENIZED_STOCK_PRICES, TOKENIZED_NAMES } from '@/features/simulation/domain/constants';

export type CalculatorAssetClass = 'crypto' | 'stock' | 'etf' | 'tokenized' | 'commodity';

export interface CalculatorAsset {
  /** نماد نمایشی */
  symbol: string;
  /** نام فارسی */
  nameFa: string;
  /** شناسه CoinGecko (برای قیمت/تاریخچه رمزارز) */
  coinId?: string;
  kind: CalculatorAssetClass;
}

export const ASSET_CLASS_LABELS: Record<CalculatorAssetClass, string> = {
  crypto: 'ارز دیجیتال',
  stock: 'سهام',
  etf: 'ETF',
  tokenized: 'دارایی توکن‌ایز',
  commodity: 'کالا'
};

/** توکن‌های صرافی‌های Perpetual (با شناسه CoinGecko) */
export const PERP_TOKENS: { symbol: string; nameFa: string; coinId: string }[] = [
  { symbol: 'HYPE', nameFa: 'هایپرلیکوئید (Hyperliquid)', coinId: 'hyperliquid' },
  { symbol: 'GMX', nameFa: 'GMX', coinId: 'gmx' },
  { symbol: 'DYDX', nameFa: 'dYdX', coinId: 'dydx' },
  { symbol: 'JUP', nameFa: 'جیوپیتر (Jupiter)', coinId: 'jupiter-exchange-solana' },
  { symbol: 'GNS', nameFa: 'گینز نتورک', coinId: 'gains-network' },
  { symbol: 'VRTX', nameFa: 'ورتکس پروتکل', coinId: 'vertex-protocol' },
  { symbol: 'KWENTA', nameFa: 'کوئنتا', coinId: 'kwenta' },
  { symbol: 'PERP', nameFa: 'پرپچوال پروتکل', coinId: 'perpetual-protocol' },
  { symbol: 'SNX', nameFa: 'سینتتیکس', coinId: 'synthetix' },
  { symbol: 'MUX', nameFa: 'MUX پروتکل', coinId: 'mux-protocol' }
];

/** کاتالوگ کامل بر اساس کلاس */
export function assetsOfClass(cls: CalculatorAssetClass): CalculatorAsset[] {
  switch (cls) {
    case 'crypto':
      return Object.entries(COINS).map(([id, sym]) => ({
        symbol: sym,
        nameFa: COIN_NAMES_FA[id] ?? sym,
        coinId: id,
        kind: cls
      }));
    case 'stock':
      return TRADFI_ASSETS.filter((a) => a.kind === 'stock').map((a) => ({
        symbol: a.symbol,
        nameFa: a.nameFa,
        kind: cls
      }));
    case 'etf':
      return TRADFI_ASSETS.filter((a) => a.kind === 'etf' || a.kind === 'index').map((a) => ({
        symbol: a.symbol,
        nameFa: a.nameFa,
        kind: cls
      }));
    case 'tokenized':
      return Object.keys(TOKENIZED_STOCK_PRICES).map((sym) => ({
        symbol: sym,
        nameFa: TOKENIZED_NAMES[sym] ?? sym,
        kind: cls
      }));
    case 'commodity':
      return TRADFI_ASSETS.filter((a) => a.kind === 'commodity').map((a) => ({
        symbol: a.symbol,
        nameFa: a.nameFa,
        kind: cls
      }));
    default:
      return [];
  }
}

/** نماد سهام سنتی → نام فارسی */
export function tradfiName(symbol: string): string {
  return TRADFI_NAMES[symbol] ?? TRADFI_ASSETS.find((a) => a.symbol === symbol)?.nameFa ?? symbol;
}
