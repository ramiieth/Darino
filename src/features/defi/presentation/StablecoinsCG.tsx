/**
 * Top 30 استیبل‌کوین — CoinGecko (دسته stablecoins)
 * نماد + لوگو + نام فارسی + قیمت + تغییر ۲۴h + مارکت‌کپ
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { ErrorState, DeFiListSkeleton } from '@/shared/components/ui/StateViews';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { useLogoStore } from '@/shared/store/logoStore';
import { fmtUSD, fmtPct, fmtInt, pnlClass } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const CACHE_MS = 60_000;

interface CgStable {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  current_price?: number | null;
  market_cap?: number | null;
  total_volume?: number | null;
  price_change_percentage_24h?: number | null;
}

/** نام فارسی استیبل‌کوین‌های معروف */
const FA_NAMES: Record<string, string> = {
  USDT: 'تتر',
  USDC: 'یواس‌دی کوین',
  DAI: 'دای',
  FDUSD: 'اف‌دی‌یواس‌دی',
  PYUSD: 'پی‌پال یواس‌دی',
  USDE: 'ای‌تنا یواس‌دی (USDe)',
  TUSD: 'ترو یواس‌دی',
  USDD: 'یواس‌دی‌دی',
  GUSD: 'جمینی یواس‌دی',
  LUSD: 'لیرا یواس‌دی',
  FRAX: 'فرکس',
  CRVUSD: 'کرو یواس‌دی',
  USDS: 'یواس‌دی‌اس (Sky)',
  USDP: 'پکس یواس‌دی',
  USD1: 'یواس‌دی‌وان',
  EURC: 'یورو کوین',
  USDR: 'یواس‌دی‌آر',
  SUSDE: 'sUSDe',
  USDY: 'یواس‌دی‌وای',
  RLUSD: 'ریپل یواس‌دی'
};

export function faName(sym: string, fallback: string): string {
  return FA_NAMES[sym.toUpperCase()] ?? fallback;
}

/** نمادهای استیبل‌کوین شناخته‌شده — فقط برای فالبک آفلاین (رتبه/لوگو از کش CoinGecko) */
const KNOWN_STABLES = ['USDT', 'USDC', 'DAI', 'FDUSD', 'PYUSD', 'USDE', 'TUSD', 'USDD', 'GUSD', 'LUSD', 'FRAX', 'CRVUSD', 'USDS', 'USDP', 'USD1', 'EURC', 'RLUSD', 'USDR', 'USDY', 'SUSDE'];

export function StablecoinsCG() {
  const top250 = useLogoStore((s) => s.top250);
  const [coins, setCoins] = useState<CgStable[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(false);
      try {
        const ck = 'cg:stablecoins:top30';
        try {
          const rec = await cacheBulkGetPrice([ck]);
          const r = rec.get(ck);
          if (r && Date.now() - r.fetchedAt < CACHE_MS) {
            if (!cancelled) setCoins(r.price as unknown as CgStable[]);
            return;
          }
        } catch { /* ادامه */ }
        const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=30&page=1&price_change_percentage=24h`;
        const res = await fetchWithRetry(url, { retries: 0, timeoutMs: 10_000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as CgStable[];
        if (!cancelled) setCoins(list);
        try { await cachePutPrice(ck, { price: list as unknown as number, source: 'live', fetchedAt: Date.now() }); } catch { /* خاموش */ }
      } catch {
        // فالبک: کش CoinGecko (۲۵۰ سکه برتر) — فقط استیبل‌کوین‌های شناخته‌شده
        const fallback: CgStable[] = KNOWN_STABLES.map((sym) => ({
          id: sym.toLowerCase(),
          symbol: sym,
          name: faName(sym, sym),
          image: top250[sym]?.img ?? null,
          current_price: null,
          market_cap: top250[sym]?.marketCap ?? null,
          price_change_percentage_24h: null
        }));
        if (!cancelled) setCoins(fallback);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (loading && !coins) return <DeFiListSkeleton rows={8} />;
  if (error && !coins) return <ErrorState message="ارتباط با CoinGecko برقرار نشد" onRetry={() => setTick((t) => t + 1)} />;

  return (
    <div className="space-y-3">
      <GlassCard variant="soft" className="flex items-center justify-between px-4 py-2.5">
        <p className="text-[10px] font-bold text-muted">
          {coins ? `${fmtInt(coins.length)} استیبل‌کوین برتر` : ''} · منبع: CoinGecko (دسته Stablecoins)
        </p>
        <button onClick={() => setTick((t) => t + 1)} className="flex items-center gap-1 text-[10px] font-bold text-accent">
          <RefreshCw className="h-3 w-3" /> همگام‌سازی
        </button>
      </GlassCard>

      <div className="space-y-2">
        {coins?.map((c, i) => {
          const sym = c.symbol.toUpperCase();
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i < 15 ? i * 0.01 : 0, duration: 0.2 }}
              className="glass flex items-center gap-3 rounded-2xl p-3"
            >
              <span className="num-ltr w-6 shrink-0 text-center text-[10px] font-black text-muted">{i + 1}</span>
              <AssetLogo symbol={sym} kind="crypto" size={32} />
              <div className="min-w-0 flex-1">
                <p className="tnum text-[13px] font-extrabold text-ink">{sym}</p>
                <p className="truncate text-[10px] font-medium text-muted">{faName(sym, c.name)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="num-ltr text-[13px] font-black text-ink">{fmtUSD(c.current_price)}</span>
                <span className={cn('num-ltr text-[10px] font-bold', c.price_change_percentage_24h !== null && c.price_change_percentage_24h !== undefined && c.price_change_percentage_24h !== 0 ? pnlClass(c.price_change_percentage_24h) : 'text-muted')}>
                  {c.price_change_percentage_24h !== null && c.price_change_percentage_24h !== undefined ? fmtPct(c.price_change_percentage_24h) : '—'}
                </span>
              </div>
              <div className="hidden w-24 shrink-0 text-end sm:block">
                <p className="text-[8px] font-bold text-muted">مارکت‌کپ</p>
                <p className="num-ltr text-[10px] font-black text-ink">{c.market_cap ? fmtUSD(c.market_cap, true) : '—'}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export { Coins as _Coins };
