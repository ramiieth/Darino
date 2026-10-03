import { persianAssetName } from '@/shared/i18n/assetDisplayName';
export const borosAssetName = (value: string) => value === 'همه' ? value : value === 'BRENTOIL' ? 'نفت برنت' : persianAssetName(value);
const venues: Record<string, string> = { Hyperliquid: 'هایپرلیکوئید', Binance: 'بایننس', Bybit: 'بای‌بیت', OKX: 'اوکی‌ایکس', Gate: 'گیت', 'Gate.io': 'گیت', Aster: 'استر', Lighter: 'لایتر', KuCoin: 'کوکوین' };
export const borosVenueName = (value: string) => venues[value] ?? value;
