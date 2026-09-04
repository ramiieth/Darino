/**
 * چرخه به‌روزرسانی سهام — صف محدودکننده + سهمیه روزانه آلفا وانتج (۲۵/روز/کلید)
 *
 * استراتژی:
 *  ۱) همه قیمت‌های کش‌شده IndexedDB خوانده می‌شوند (فوری، بدون شبکه).
 *  ۲) نمادهای بدون کش تازه با **اولویت** (شاخص/ETF/کالا → سهام) از صف عبور می‌کنند.
 *  ۳) تا وقتی سهمیه روزانه کلیدها باقی مانده باشد ادامه می‌یابد؛ بعد از اتمام،
 *     بقیه با اسنپ‌شات می‌مانند و چرخه بعدی (۳۰ دقیقه بعد / فردا) ادامه می‌دهد.
 *  ۴) هر قیمت موفق بلافاصله در marketStore و IndexedDB ثبت می‌شود → UI زنده.
 */
import { useEffect, useMemo } from 'react';
import { useMarketStore } from '@/shared/store/marketStore';
import { fetchStockQuote, getCachedStockPricesBulk, avQueue } from '@/shared/lib/alphavantage';
import { isRateLimitError } from '@/shared/lib/throttler';
import { STOCK_STALE_MS } from '@/app/config/apiConfig';
import { TRADFI_PRIORITY } from '@/features/simulation/domain/constants';
import { useSettingsStore, effectiveApiKeys } from '@/shared/store/settingsStore';
import { useAvBudgetStore } from '@/shared/store/avBudgetStore';

let runningCycle: Promise<void> | null = null;

async function runStockCycle(symbols: string[]): Promise<void> {
  const store = useMarketStore.getState();
  store.refreshStart();
  const total = symbols.length;
  store.refreshProgress(0, total);
  let done = 0;
  let errors = 0;

  // ۱) کش دسته‌ای فوری از IndexedDB
  const cached = await getCachedStockPricesBulk(symbols);
  const now = Date.now();
  for (const [sym, quote] of cached) {
    if (now - quote.fetchedAt < STOCK_STALE_MS) {
      store.setQuote({ symbol: sym, ...quote });
    }
  }

  // ۲) نمادهای نیازمند شبکه (بدون کش تازه) — به ترتیب اولویت
  const needRefresh = symbols.filter((s) => {
    const q = cached.get(s);
    return !q || now - q.fetchedAt >= STOCK_STALE_MS;
  });

  const cycleId = useMarketStore.getState().cycleId;
  let consecutiveRateLimit = 0;

  for (const sym of needRefresh) {
    // ۳) چک سهمیه — اگر تمام شد، چرخه متوقف می‌شود (بقیه اسنپ‌شات)
    const keys = effectiveApiKeys(useSettingsStore.getState().apiKeys);
    if (useAvBudgetStore.getState().totalRemaining(keys) <= 0) {
      break;
    }
    try {
      const quote = await fetchStockQuote(sym);
      if (Number.isFinite(quote.price) && quote.price > 0) {
        store.setQuote({ symbol: sym, ...quote });
        consecutiveRateLimit = 0;
      } else {
        errors++;
      }
    } catch (e) {
      errors++;
      if (isRateLimitError(e)) {
        consecutiveRateLimit++;
        // مدارشکن باز است → ادامه فقط سهمیه می‌سوزاند؛ چرخه را متوقف کن
        if (consecutiveRateLimit >= 1) break;
      }
    }
    done++;
    store.refreshProgress(Math.min(done, total), total);
  }

  store.refreshEnd(cycleId, errors);
}

/** شروع چرخه (سینگلتون) — با اولویت‌بندی */
export function startStockCycle(symbols: string[] = TRADFI_PRIORITY): Promise<void> {
  const store = useMarketStore.getState();
  if (store.refreshing && runningCycle) return runningCycle;
  runningCycle = runStockCycle(symbols).finally(() => {
    runningCycle = null;
  });
  return runningCycle;
}

/** فاصله زمانی صف تا اسلات بعدی (برای نمایش UI) */
export function queueWaitMs(): number {
  const stats = avQueue.getStats();
  const last = stats.lastRunAt;
  if (last === null) return 0;
  return Math.max(0, 12_000 - (Date.now() - last));
}

/** هوک: اجرای چرخه + وضعیت زنده + اطلاعات سهمیه */
export function useStockPrices(refresh = true) {
  const quotes = useMarketStore((s) => s.quotes);
  const refreshing = useMarketStore((s) => s.refreshing);
  const done = useMarketStore((s) => s.done);
  const total = useMarketStore((s) => s.total);
  const lastCycleAt = useMarketStore((s) => s.lastCycleAt);
  const errorCount = useMarketStore((s) => s.errorCount);

  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const usage = useAvBudgetStore((s) => s.usage);
  const today = useAvBudgetStore((s) => s.today);

  useEffect(() => {
    const run = () => {
      if (!useMarketStore.getState().refreshing) void startStockCycle(TRADFI_PRIORITY);
    };
    run();
    // چرخه هر ۳۰ دقیقه تکرار (در صورت باقی‌ماندن سهمیه)
    const iv = setInterval(run, 30 * 60_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const liveMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [sym, q] of Object.entries(quotes)) {
      if (Number.isFinite(q.price) && q.price > 0) map[sym] = q.price;
    }
    return map;
  }, [quotes]);

  // اطلاعات سهمیه
  const budgetInfo = useMemo(() => {
    const keys = effectiveApiKeys(apiKeys);
    const todayKey = today;
    const used = keys.reduce(
      (acc, k) => acc + (todayKey === today ? usage[k] ?? 0 : 0),
      0
    );
    return { used, total: keys.length * 22, keys: keys.length };
  }, [apiKeys, usage, today]);

  return { liveMap, refreshing, done, total, lastCycleAt, errorCount, budgetInfo };
}
