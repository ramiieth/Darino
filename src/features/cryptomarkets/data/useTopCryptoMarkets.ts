/** ============================================================
 * Crypto Markets — منبع: CoinGecko (سریع و مستقیم)
 * ⚠️ هیچ لیست Hardcode نیست؛ همه از API (همگام‌سازی خودکار)
 *  - Top 200 توکن برتر بر اساس مارکت‌کپ (رتبه‌بندی CoinGecko)
 *  - قیمت/مارکت‌کپ/FDV/حجم/تغییرات 24h/7d/30d: همه از CoinGecko
 *  - فالبک مقاوم: اسنپ‌شات آخرین پاسخ موفق (IndexedDB، ۷ روز)
 *    → هیچ‌وقت قیمت صفر/نامعتبر نمایش داده نمی‌شود؛ فقط برچسب «کش»
 *  - فالبک نهایی: کش لوگوها + قیمت جایگزین Llama برای ~۷۰ سکه برتر
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { cgFetch } from '@/shared/lib/coingeckoGate';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { COINGECKO_BASE, CRYPTO_REFETCH_MS } from '@/app/config/apiConfig';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import { useLogoStore, ensureTop250Logos, ensureSymbolLogo } from '@/shared/store/logoStore';
import {
  useLlamaFallbackStore,
  fetchMissingLlamaPrices,
  COIN_LLAMA_KEYS_VALID,
  COIN_LLAMA_CG_KEYS_VALID
} from '@/shared/hooks/useLlamaPriceFallback';
import { COIN_NAMES_FA } from '@/features/simulation/domain/constants';

export interface CryptoMarket {
  symbol: string;
  name: string;
  nameFa: string;
  price: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  change60d: number | null;
  /** زنجیره اصلی (از آدرس DefiLlama یا '—') */
  chain: string | null;
  /** منبع قیمت: llama | coingecko | stale */
  source: 'llama' | 'coingecko' | 'stale';
}

interface CgMarket {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  current_price?: number | null;
  market_cap?: number | null;
  fully_diluted_valuation?: number | null;
  total_volume?: number | null;
  price_change_percentage_24h?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_60d_in_currency?: number | null;
}

/** کش تازه (۶۰ ثانیه) — برای جلوگیری از درخواست تکراری */
const CACHE_MS = 60_000;
/** اسنپ‌شات آخرین پاسخ موفق (۷ روز) — فالبک هنگام Rate Limit/آفلاین */
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRESH_KEY = 'crypto:top200';
const SNAPSHOT_KEY = 'crypto:top200:last';

export interface TopMarketsResult {
  data: CgMarket[];
  /** داده از اسنپ‌شات کش است (نه زنده) */
  stale: boolean;
  fetchedAt: number;
}

/**
 * اعتبارسنجی شکل پاسخ Provider.
 *
 * ⚠️ حیاتی: اگر پروکسی/CDN به‌جای آرایه بازار چیز دیگری برگرداند
 * (مثلاً پاسخ ریشه `{"gecko_says":...}` یا صفحه خطای HTML با کد ۲۰۰)،
 * نباید آن را «موفق» بدانیم و در کش بنویسیم — وگرنه کش برای ۷ روز
 * مسموم می‌شود و بازار برای همیشه روی «اسنپ‌شات» می‌ماند.
 */
function isCgMarketArray(v: unknown): v is CgMarket[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((r) => r !== null && typeof r === 'object' && typeof (r as CgMarket).symbol === 'string')
  );
}

/** گرفتن ۱۵۰ توکن برتر از CoinGecko (یک درخواست — از دروازه نرخ سراسری) */
async function fetchTop150Live(): Promise<CgMarket[]> {
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&price_change_percentage=24h,7d,30d`;
  const res = await cgFetch(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json: unknown = await res.json();
  if (!isCgMarketArray(json)) {
    // پاسخ ۲۰۰ ولی بی‌معنا → خطای صریح (نه کش‌کردن داده خراب)
    throw new Error('CoinGecko invalid payload (not a market array)');
  }
  return json;
}

let inFlight: Promise<TopMarketsResult> | null = null;

/** پاک‌سازی صف درون‌حافظه‌ای (برای تست) */
export function resetTopMarketsInFlight(): void {
  inFlight = null;
}

/**
 * یک درخواست مشترک برای همه مصرف‌کننده‌ها (اکسپلورر + عملکرد برتر):
 *  کش تازه ← درخواست زنده ← اسنپ‌شات ۲۴ ساعته ← خطا
 */
export async function fetchTopMarketsOnce(): Promise<TopMarketsResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // ۱) کش تازه (۶۰ ثانیه) — بدون درخواست شبکه
    try {
      const rec = await cacheBulkGetPrice([FRESH_KEY]);
      const r = rec.get(FRESH_KEY);
      const fresh = r?.price as unknown;
      // کش فقط وقتی معتبر است که واقعاً آرایه بازار باشد (ضد کش مسموم)
      if (r && Date.now() - r.fetchedAt < CACHE_MS && isCgMarketArray(fresh)) {
        return { data: fresh, stale: false, fetchedAt: r.fetchedAt };
      }
    } catch {
      /* ادامه */
    }

    try {
      // ۲) درخواست زنده
      const data = await fetchTop150Live();
      const fetchedAt = Date.now();
      try {
        await cachePutPrice(FRESH_KEY, { price: data as unknown as number, source: 'live', fetchedAt });
        await cachePutPrice(SNAPSHOT_KEY, { price: data as unknown as number, source: 'live', fetchedAt });
      } catch {
        /* خاموش */
      }
      return { data, stale: false, fetchedAt };
    } catch {
      // ۳) فالبک: آخرین اسنپ‌شات موفق (تا ۲۴ ساعت) — قیمت‌های واقعی، نه صفر
      try {
        const rec = await cacheBulkGetPrice([SNAPSHOT_KEY]);
        const r = rec.get(SNAPSHOT_KEY);
        const snapshot = r?.price as unknown;
        if (r && isCgMarketArray(snapshot) && Date.now() - r.fetchedAt < SNAPSHOT_TTL_MS) {
          return { data: snapshot, stale: true, fetchedAt: r.fetchedAt };
        }
      } catch {
        /* ادامه */
      }
      throw new Error('no market data available');
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** هوک ۲۰۰ توکن کریپتو (CoinGecko با فالبک اسنپ‌شات) */
export function useTopCryptoMarkets(): {
  markets: CryptoMarket[];
  loading: boolean;
  error: boolean;
  /** داده از کش/اسنپ‌شات است */
  stale: boolean;
  /** زمان آخرین دریافت موفق (میلی‌ثانیه) */
  fetchedAt: number | null;
  refresh: () => void;
} {
  const [markets, setMarkets] = useState<CryptoMarket[] | null>(null);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void ensureTop250Logos();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(false);
      try {
        const { data, stale: isStale, fetchedAt: ts } = await fetchTopMarketsOnce();
        const out: CryptoMarket[] = data.map((c) => ({
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          nameFa: COIN_NAMES_FA[c.id] ?? c.name,
          price: c.current_price ?? null,
          marketCap: c.market_cap ?? null,
          fdv: c.fully_diluted_valuation ?? null,
          volume24h: c.total_volume ?? null,
          change24h: c.price_change_percentage_24h ?? null,
          change7d: c.price_change_percentage_7d_in_currency ?? null,
          change30d: c.price_change_percentage_30d_in_currency ?? null,
          change60d: c.price_change_percentage_60d_in_currency ?? null,
          chain: null,
          source: isStale ? ('stale' as const) : ('coingecko' as const)
        }));
        if (cancelled) return;
        setMarkets(out);
        setStale(isStale);
        setFetchedAt(ts);
        // لوگوها
        out.slice(0, 80).forEach((m) => ensureSymbolLogo(m.symbol));
      } catch {
        // آخرین سنگر: کش لوگوهای ۲۵۰ سکه (بدون قیمت زنده) + فالبک قیمت Llama
        const top250 = useLogoStore.getState().top250;
        const entries = Object.entries(top250).slice(0, 150);
        let symToId = new Map(entries.map(([sym, v]) => [sym, v.id]));
        let out: CryptoMarket[] = entries.map(([sym, v]) => ({
          symbol: sym,
          name: v.name,
          nameFa: COIN_NAMES_FA[v.id] ?? COIN_NAMES_FA[sym] ?? v.name,
          price: null,
          marketCap: v.marketCap ?? null,
          fdv: null,
          volume24h: null,
          change24h: null,
          change7d: null,
          change30d: null,
          change60d: null,
          chain: null,
          source: 'stale'
        }));
        // اولین بازدید بدون هیچ کش → فالبک ساختاری (~۷۰ سکه برتر با قیمت‌های Llama)
        if (out.length === 0) {
          const seed = buildSeedMarkets();
          out = seed.out;
          symToId = seed.symToId;
        }
        if (out.length > 0) {
          setMarkets(out);
          setStale(true);
          // قیمت‌های جایگزین Llama (دسته‌ای + تکتک بومی)
          // زمان همگام‌سازی فقط وقتی ثبت می‌شود که قیمت جایگزین واقعاً دریافت شده باشد (صداقت داده)
          void fetchMissingLlamaPrices({}).then(() => {
            if (cancelled) return;
            const lp = useLlamaFallbackStore.getState().prices;
            if (Object.keys(lp).length === 0) return;
            setFetchedAt(Date.now());
            setMarkets((prev) =>
              (prev ?? []).map((m) => {
                const id = symToId.get(m.symbol);
                const p = id ? lp[id] : undefined;
                return p ? { ...m, price: p, source: 'llama' as const } : m;
              })
            );
          });
        } else {
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  // همگام‌سازی خودکار زنده: هر ۲ دقیقه + هنگام فوکوس (کلید مشترک → یک تایمر برای همه مصرف‌کننده‌ها)
  useAutoSync('crypto-top150', refresh, { intervalMs: CRYPTO_REFETCH_MS, minAgeMs: 60_000 });

  return { markets: markets ?? [], loading: markets === null, error, stale, fetchedAt, refresh };
}

/** نماد بازار برای شناسه‌های نقشه Llama (فالبک ساختاری — اولین بازدید بدون کش) */
const SEED_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC', ripple: 'XRP', dogecoin: 'DOGE', litecoin: 'LTC', cardano: 'ADA',
  polkadot: 'DOT', tron: 'TRX', cosmos: 'ATOM', algorand: 'ALGO', monero: 'XMR',
  filecoin: 'FIL', stellar: 'XLM', zcash: 'ZEC', tezos: 'XTZ', dash: 'DASH',
  flow: 'FLOW', fantom: 'FTM', celo: 'CELO', kusama: 'KSM', decred: 'DCR',
  eos: 'EOS', 'internet-computer': 'ICP', near: 'NEAR', kaspa: 'KAS',
  ethereum: 'ETH', tether: 'USDT', 'usd-coin': 'USDC', dai: 'DAI',
  'wrapped-bitcoin': 'WBTC', 'staked-ether': 'STETH', 'wrapped-steth': 'WSTETH',
  'rocket-pool-eth': 'RETH', weeth: 'WEETH', ondo: 'ONDO', ethena: 'ENA',
  pendle: 'PENDLE', uniswap: 'UNI', aave: 'AAVE', chainlink: 'LINK',
  'lido-dao': 'LDO', maker: 'MKR', 'curve-dao-token': 'CRV', compound: 'COMP',
  synthetix: 'SNX', 'yearn-finance': 'YFI', 'the-graph': 'GRT', '1inch': '1INCH',
  ens: 'ENS', quant: 'QNT', pepe: 'PEPE', 'shiba-inu': 'SHIB', 'tether-gold': 'XAUT',
  'pax-gold': 'PAXG', 'ether-fi': 'ETHFI', 'fetch-ai': 'FET', 'render-token': 'RENDER',
  apecoin: 'APE', 'axie-infinity': 'AXS', gala: 'GALA', 'the-sandbox': 'SAND',
  mantle: 'MANTLE', arbitrum: 'ARB', toncoin: 'TON', binancecoin: 'BNB',
  'binance-usd': 'BUSD', pancakeswap: 'CAKE', solana: 'SOL', avalanche: 'AVAX',
  sui: 'SUI', aptos: 'APT'
};

/** فالبک ساختاری اولین بازدید (بدون هیچ کش): ~۷۰ سکه برتر با قیمت‌های Llama */
export function buildSeedMarkets(): { out: CryptoMarket[]; symToId: Map<string, string> } {
  const ids = [...Object.keys(COIN_LLAMA_KEYS_VALID), ...COIN_LLAMA_CG_KEYS_VALID];
  const symToId = new Map<string, string>();
  const out: CryptoMarket[] = ids.map((id) => {
    const symbol = SEED_SYMBOL[id] ?? id.toUpperCase();
    symToId.set(symbol, id);
    return {
      symbol,
      name: id,
      nameFa: COIN_NAMES_FA[id] ?? symbol,
      price: null,
      marketCap: null,
      fdv: null,
      volume24h: null,
      change24h: null,
      change7d: null,
      change30d: null,
      change60d: null,
      chain: null,
      source: 'stale'
    };
  });
  return { out, symToId };
}

/** رتبه‌بندی مارکت‌کپ — ترتیب همیشه با آخرین داده همگام */
export function useCryptoRanked(): CryptoMarket[] {
  const { markets } = useTopCryptoMarkets();
  return useMemo(() => [...markets].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)), [markets]);
}
