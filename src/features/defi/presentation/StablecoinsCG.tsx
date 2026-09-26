/**
 * Top 30 استیبل‌کوین — CoinGecko (دسته stablecoins)
 * نماد + لوگو + نام فارسی + قیمت + تغییر ۲۴h + مارکت‌کپ
 */
import { useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { Button } from '@/shared/components/ui/Button';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { useLogoStore } from '@/shared/store/logoStore';
import { fmtInt } from '@/shared/utils/formatters';
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
  const [fallback, setFallback] = useState(false);

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
        if (!cancelled) {
          setCoins(list);
          setFallback(false);
        }
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
        if (!cancelled) {
          setCoins(fallback);
          setFallback(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (loading && !coins) return <ListSkeleton rows={8} />;
  if (error && !coins) return <ErrorState message="ارتباط با CoinGecko برقرار نشد" onRetry={() => setTick((t) => t + 1)} />;

  const pegDev = (p: number | null | undefined) =>
    typeof p === 'number' && Number.isFinite(p) ? Math.abs(p - 1) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {coins ? `${fmtInt(coins.length)} استیبل‌کوین برتر بر اساس ارزش بازار` : ''} · منبع: CoinGecko
        </p>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => setTick((t) => t + 1)} className="text-accent">
          همگام‌سازی
        </Button>
      </div>
      {fallback && (
        <Notice tone="stale" title="داده زنده در دسترس نیست">
          فهرست از کش محلی ساخته شده است؛ قیمت و تغییر ۲۴ ساعته تا اتصال دوباره «—» نمایش داده می‌شوند.
        </Notice>
      )}

      <Surface className="overflow-hidden">
        <table className="data-table">
          <caption className="sr-only">استیبل‌کوین‌ها</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10 !ps-4 md:!ps-5">#</th>
              <th scope="col">استیبل‌کوین</th>
              <th scope="col" className="col-num">قیمت</th>
              <th scope="col" className="col-num hidden sm:table-cell">انحراف از ۱ دلار</th>
              <th scope="col" className="col-num hidden sm:table-cell">۲۴ ساعت</th>
              <th scope="col" className="col-num !pe-4 md:!pe-5">ارزش بازار</th>
            </tr>
          </thead>
          <tbody>
            {coins?.map((c, i) => {
              const sym = c.symbol.toUpperCase();
              const dev = pegDev(c.current_price);
              return (
                <tr key={c.id}>
                  <td className="num-ltr !ps-4 text-xs text-subtle md:!ps-5">{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <AssetLogo symbol={sym} kind="crypto" size={28} />
                      <div className="min-w-0">
                        <p className="max-w-[9rem] truncate font-semibold text-ink sm:max-w-none">{faName(sym, c.name)}</p>
                        <p className="text-2xs font-semibold text-muted"><bdi dir="ltr">{sym}</bdi></p>
                      </div>
                    </div>
                  </td>
                  <td className="col-num font-semibold text-ink">
                    <MoneyValue value={c.current_price ?? null} />
                    <span className="block text-2xs font-normal sm:hidden">
                      <PercentValue value={c.price_change_percentage_24h ?? null} />
                    </span>
                  </td>
                  <td className="col-num hidden sm:table-cell">
                    {dev === null ? (
                      <span className="text-subtle">—</span>
                    ) : (
                      <span className={cn('num-ltr', dev > 0.5 ? 'font-semibold text-warn' : 'text-muted')}>
                        {dev.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="col-num hidden sm:table-cell">
                    <PercentValue value={c.price_change_percentage_24h ?? null} />
                  </td>
                  <td className="col-num !pe-4 text-muted md:!pe-5">
                    <MoneyValue value={c.market_cap ?? null} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Surface>
      <p className="text-xs text-muted">انحراف بیش از ۰٫۵٪ از ۱ دلار برجسته می‌شود. این فهرست توصیه سرمایه‌گذاری نیست.</p>
    </div>
  );
}

export { Coins as _Coins };
