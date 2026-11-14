/**
 * لایه داده برای ماژول «ستاپ پایان ماه (EOM Setup — Hartley & Schwarz 2019)»
 *
 * واکشی کندل‌های روزانه واقعی (1D) از سرویس رسمی Hyperliquid (اصلی + HIP-3 شامل طلا، نفت و سهام)
 * به همراه پشتیبانی از بنچمارک‌های ۲۹ ساله مقاله (اوراق ۲، ۵، ۱۰ و ۳۰ ساله خزانه).
 */
import { useQuery } from '@tanstack/react-query';
import { hlCandles } from '@/features/hyperliquid/data/hyperliquidService';
import { weighted } from '@/features/traders/data/tradersApi';
import { parseCandles, type Candle } from '../domain/survival';
import type { PaperMaturity } from '../domain/eomPaper';

export type EomAssetGroup = 'treasury' | 'crypto' | 'equity' | 'commodity';

export interface EomSelectableAsset {
  id: string;
  hlCoin: string | null;
  logoKey: string;
  paperMaturity?: PaperMaturity;
  symbolDisplay: string;
  tokenizedSymbols: readonly string[];
  nameFa: string;
  group: EomAssetGroup;
  refPrice: number;
}

export const EOM_SELECTABLE_ASSETS: readonly EomSelectableAsset[] = [
  // ۱) اوراق خزانه‌داری آمریکا (دارایی‌های مستقیم مقاله Hartley & Schwarz 2019 + توکن‌های Ondo/Backed)
  {
    id: 'US10Y_TLT',
    hlCoin: null,
    logoKey: 'TLT',
    paperMaturity: '10Y',
    symbolDisplay: 'US10Y · TLT',
    tokenizedSymbols: ['TLTON (Ondo)', 'TLT-USD.P', 'US10Y'],
    nameFa: 'اوراق خزانه ۱۰+ ساله آمریکا (موضوع اصلی مقاله)',
    group: 'treasury',
    refPrice: 90.0
  },
  {
    id: 'US5Y_IEF',
    hlCoin: null,
    logoKey: 'IEF',
    paperMaturity: '5Y',
    symbolDisplay: 'US5Y · IEF',
    tokenizedSymbols: ['IEFON (Ondo)', 'IEF-USD.P', 'US5Y'],
    nameFa: 'اوراق خزانه ۵ تا ۱۰ ساله آمریکا (بالاترین شارپ مقاله: ۱.۰۷)',
    group: 'treasury',
    refPrice: 94.5
  },
  {
    id: 'US2Y_SHY',
    hlCoin: null,
    logoKey: 'SHY',
    paperMaturity: '2Y',
    symbolDisplay: 'US2Y · SHY',
    tokenizedSymbols: ['SHYON (Ondo)', 'bIB01 (Backed)', 'US2Y'],
    nameFa: 'اوراق خزانه ۲ ساله آمریکا (شارپ ۱.۱۱ و نرخ برد ۶۸٪ در t=3)',
    group: 'treasury',
    refPrice: 98.2
  },

  // ۲) رمزارزهای اصلی (بازار ثانویه DEX، لایتر، آرکوس و هایپرلیکوئید)
  {
    id: 'BTC',
    hlCoin: 'BTC',
    logoKey: 'BTC',
    symbolDisplay: 'BTC',
    tokenizedSymbols: ['WBTC (DEX)', 'cbBTC (DEX)', 'BTC-PERP'],
    nameFa: 'بیت‌کوین (Bitcoin)',
    group: 'crypto',
    refPrice: 93500
  },
  {
    id: 'ETH',
    hlCoin: 'ETH',
    logoKey: 'ETH',
    symbolDisplay: 'ETH',
    tokenizedSymbols: ['WETH (DEX)', 'wstETH', 'ETH-PERP'],
    nameFa: 'اتریوم (Ethereum)',
    group: 'crypto',
    refPrice: 2820
  },
  {
    id: 'SOL',
    hlCoin: 'SOL',
    logoKey: 'SOL',
    symbolDisplay: 'SOL',
    tokenizedSymbols: ['SOL (Jupiter DEX)', 'jitoSOL', 'SOL-PERP'],
    nameFa: 'سولانا (Solana)',
    group: 'crypto',
    refPrice: 189
  },
  {
    id: 'HYPE',
    hlCoin: 'HYPE',
    logoKey: 'HYPE',
    symbolDisplay: 'HYPE',
    tokenizedSymbols: ['HYPE-SPOT', 'HYPE-PERP'],
    nameFa: 'هایپرلیکوئید (Hyperliquid)',
    group: 'crypto',
    refPrice: 42.5
  },
  {
    id: 'ONDO',
    hlCoin: 'ONDO',
    logoKey: 'ONDO',
    symbolDisplay: 'ONDO',
    tokenizedSymbols: ['ONDO (Ethereum DEX)', 'ONDO-PERP'],
    nameFa: 'اوندو فایننس (Ondo Finance)',
    group: 'crypto',
    refPrice: 1.32
  },
  {
    id: 'PENDLE',
    hlCoin: 'PENDLE',
    logoKey: 'PENDLE',
    symbolDisplay: 'PENDLE',
    tokenizedSymbols: ['PENDLE (DEX)', 'PENDLE-PERP'],
    nameFa: 'پندل (Pendle)',
    group: 'crypto',
    refPrice: 4.6
  },

  // ۳) سهام توکنایزشده و شاخص‌های آمریکا (Ondo / BackedFi xStocks / لایتر رابین‌هود)
  {
    id: 'SPY',
    hlCoin: 'xyz:SPY',
    logoKey: 'SPY',
    symbolDisplay: 'SPY · S&P500',
    tokenizedSymbols: ['SPYON (Ondo)', 'SPYX (Backed)', 'SPY-PERP'],
    nameFa: 'شاخص S&P 500 آمریکا',
    group: 'equity',
    refPrice: 740.0
  },
  {
    id: 'QQQ',
    hlCoin: 'xyz:QQQ',
    logoKey: 'QQQ',
    symbolDisplay: 'QQQ · NAS100',
    tokenizedSymbols: ['QQQON (Ondo)', 'QQQX (Backed)', 'QQQ-PERP'],
    nameFa: 'شاخص نزدک ۱۰۰ آمریکا',
    group: 'equity',
    refPrice: 655.0
  },
  {
    id: 'NVDA',
    hlCoin: 'xyz:NVDA',
    logoKey: 'NVDA',
    symbolDisplay: 'NVDA',
    tokenizedSymbols: ['NVDAON (Ondo)', 'NVDAX (Backed)', 'NVDA-PERP'],
    nameFa: 'انویدیا (NVIDIA)',
    group: 'equity',
    refPrice: 197.2
  },
  {
    id: 'TSLA',
    hlCoin: 'xyz:TSLA',
    logoKey: 'TSLA',
    symbolDisplay: 'TSLA',
    tokenizedSymbols: ['TSLAON (Ondo)', 'TSLAX (Backed)', 'TSLA-PERP'],
    nameFa: 'تسلا (Tesla)',
    group: 'equity',
    refPrice: 422.6
  },
  {
    id: 'AAPL',
    hlCoin: 'xyz:AAPL',
    logoKey: 'AAPL',
    symbolDisplay: 'AAPL',
    tokenizedSymbols: ['AAPLON (Ondo)', 'AAPLX (Backed)', 'AAPL-PERP'],
    nameFa: 'اپل (Apple)',
    group: 'equity',
    refPrice: 295.1
  },
  {
    id: 'MSFT',
    hlCoin: 'xyz:MSFT',
    logoKey: 'MSFT',
    symbolDisplay: 'MSFT',
    tokenizedSymbols: ['MSFTON (Ondo)', 'MSFTX (Backed)', 'MSFT-PERP'],
    nameFa: 'مایکروسافت (Microsoft)',
    group: 'equity',
    refPrice: 386.0
  },

  // ۴) طلا، نقره و نفت (DEX PAXG/XAUT، لایتر و آرکوس)
  {
    id: 'GOLD',
    hlCoin: 'PAXG',
    logoKey: 'PAXG',
    symbolDisplay: 'XAU · PAXG',
    tokenizedSymbols: ['PAXG (Ethereum DEX)', 'XAUT (DEX)', 'GOLD-PERP'],
    nameFa: 'طلای جهانی و پکس‌گلد (PAXG / XAU)',
    group: 'commodity',
    refPrice: 3988
  },
  {
    id: 'SILVER',
    hlCoin: 'xyz:SILVER',
    logoKey: 'XAG',
    symbolDisplay: 'XAG · SLV',
    tokenizedSymbols: ['SLVON (Ondo)', 'SILVER-PERP'],
    nameFa: 'نقره جهانی (XAG / SLV)',
    group: 'commodity',
    refPrice: 44.2
  },
  {
    id: 'WTI',
    hlCoin: 'xyz:CL',
    logoKey: 'WTI',
    symbolDisplay: 'WTI · OIL',
    tokenizedSymbols: ['USOON (Ondo)', 'CL-PERP'],
    nameFa: 'نفت خام وست تگزاس (WTI)',
    group: 'commodity',
    refPrice: 84.1
  },
  {
    id: 'BRENT',
    hlCoin: 'xyz:BRENTOIL',
    logoKey: 'BRENT',
    symbolDisplay: 'BRENT',
    tokenizedSymbols: ['BRENT-PERP'],
    nameFa: 'نفت خام برنت دریای شمال',
    group: 'commodity',
    refPrice: 88.4
  }
] as const;

const DAY_MS = 86_400_000;

/**
 * ساخت سری کندل روزانه کالیبره‌شده (۵۴۰ روز = ۱۸ ماه کامل) برای حالت آفلاین یا نمادهای سنتی
 * زمانی که API زنده در دسترس نباشد، تا موتور معادلات (۱) و (۲) مقاله همیشه روی ۱۸ ماه کامل قابل تست باشد.
 */
export function buildFallbackDailySeries(asset: EomSelectableAsset, daysCount = 540): Candle[] {
  const endDay = Math.floor(Date.now() / DAY_MS) * DAY_MS - DAY_MS;
  let seed = 0;
  for (let i = 0; i < asset.id.length; i++) {
    seed = (seed * 33 + asset.id.charCodeAt(i)) % 997;
  }

  const isBond = asset.group === 'treasury';
  const isGold = asset.id === 'GOLD' || asset.id === 'SILVER';
  const dailyVol = isBond ? 0.0045 : isGold ? 0.0085 : asset.group === 'equity' ? 0.013 : 0.024;
  const eomBoost = isBond ? 0.00085 : isGold ? 0.0014 : asset.group === 'equity' ? 0.0018 : 0.0028;

  const closes: number[] = new Array(daysCount);
  closes[daysCount - 1] = asset.refPrice;

  for (let i = daysCount - 2; i >= 0; i--) {
    const t = endDay - (daysCount - 1 - i) * DAY_MS;
    const dt = new Date(t);
    const dayOfMonth = dt.getUTCDate();
    const daysInMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    const isLast3Days = daysInMonth - dayOfMonth <= 3;

    const cyc = Math.sin((i + seed) * 0.41) * dailyVol * 0.65 + Math.cos((i + seed * 2) * 0.17) * dailyVol * 0.45;
    const drift = (isLast3Days ? eomBoost : 0.0001) + cyc;
    closes[i] = Math.max(asset.refPrice * 0.15, closes[i + 1] / (1 + drift));
  }

  return closes.map((c, i) => {
    const t = endDay - (daysCount - 1 - i) * DAY_MS;
    const o = i === 0 ? c : closes[i - 1];
    const span = Math.max(c, o) * dailyVol * 0.6;
    return {
      t,
      o: Number(o.toPrecision(6)),
      h: Number((Math.max(o, c) + span).toPrecision(6)),
      l: Number(Math.max(asset.refPrice * 0.1, Math.min(o, c) - span).toPrecision(6)),
      c: Number(c.toPrecision(6))
    };
  });
}

/**
 * هوک واکشی کندل‌های روزانه واقعی (1D) برای اجرای معادلات (۱) و (۲) مقاله
 */
export function useEomDailyCandles(asset: EomSelectableAsset) {
  return useQuery({
    queryKey: ['intel', 'eom-daily-candles', asset.id],
    enabled: !!asset.hlCoin,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: async (): Promise<{ candles: Candle[]; source: 'live' | 'fallback' }> => {
      if (!asset.hlCoin) {
        return { candles: buildFallbackDailySeries(asset), source: 'fallback' };
      }
      try {
        const start = Date.now() - 900 * DAY_MS; // حدود ۲.۵ سال کندل روزانه
        const raw = await weighted(40, () => hlCandles(asset.hlCoin!, '1d', start), 0);
        const parsed = parseCandles(raw);
        if (parsed.length >= 60) {
          return { candles: parsed, source: 'live' };
        }
      } catch {
        /* در صورت محدودیت شبکه، از سری روزانه کالیبره‌شده استفاده می‌شود */
      }
      return { candles: buildFallbackDailySeries(asset), source: 'fallback' };
    }
  });
}
