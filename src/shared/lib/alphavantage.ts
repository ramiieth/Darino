/**
 * آداپتر Alpha Vantage — قیمت لحظه‌ای سهام/ETF/اوراق/کالا/شاخص
 *
 * ⚠️ سیاست فعلی نسخه رایگان (تأییدشده): فقط ۲۵ درخواست در روز برای هر کلید.
 * معماری:
 *  - ۵ کلید پیش‌فرض + کلیدهای کاربر با چرخش round-robin → ۱۱۰+ درخواست/روز.
 *  - سهمیه‌بندی روزانه هر کلید در IndexedDB (avBudgetStore)؛ مصرف امن ۲۲ از ۲۵.
 *  - پاسخ‌های «Information/Note» (مصرف‌شده) → کلید exhaust می‌شود.
 *  - صف محدودکننده ۱۲ ثانیه + مدارشکن 429.
 *  - کش IndexedDB با staleTime ۳۰ دقیقه؛ فالبک: کش کهنه → اسنپ‌شات → N/A.
 *
 * انواع درخواست بر اساس نماد:
 *  - کالاها (WTI/BRENT/NG/COPPER/CORN/WHEAT/COFFEE/SUGAR): function=WTI... → آخرین مقدار سری
 *  - اوراق دولتی (US2Y/US10Y/US30Y): function=TREASURY_YIELD → آخرین بازده (درصد)
 *  - بقیه (سهام/ETF/شاخص نماینده): GLOBAL_QUOTE
 */
import { ALPHA_VANTAGE_BASE, AV_DAILY_BUDGET_PER_KEY } from '@/app/config/apiConfig';
import { RateLimitedQueue, RateLimitError, isRateLimitError } from '@/shared/lib/throttler';
import { cacheBulkGetPrice, cacheGetPrice, cachePutPrice } from '@/shared/lib/db';
import { STOCK_GAP_MS, STOCK_MAX_PER_WINDOW, STOCK_STALE_MS, STOCK_WINDOW_MS } from '@/app/config/apiConfig';
import { toast } from '@/shared/store/toastStore';
import { t } from '@/shared/i18n/fa';
import { useSettingsStore, effectiveApiKeys } from '@/shared/store/settingsStore';
import { useAvBudgetStore } from '@/shared/store/avBudgetStore';
import type { PriceQuote } from '@/shared/types';

/** کالاهایی که اندپوینت اختصاصی دارند */
const AV_COMMODITY_FUNCS: Record<string, string> = {
  WTI: 'WTI',
  BRENT: 'BRENT',
  NG: 'NATURAL_GAS',
  COPPER: 'COPPER',
  CORN: 'CORN',
  WHEAT: 'WHEAT',
  COFFEE: 'COFFEE',
  SUGAR: 'SUGAR'
};

/** اوراق دولتی: نماد → سررسید */
const AV_YIELD_MATURITY: Record<string, string> = {
  US2Y: '2year',
  US10Y: '10year',
  US30Y: '30year'
};

export const avQueue = new RateLimitedQueue(STOCK_GAP_MS, STOCK_MAX_PER_WINDOW, STOCK_WINDOW_MS);

/** جلوگیری از توست تکراری محدودیت نرخ (یک بار در ۵ دقیقه) */
let lastRateToastAt = 0;
/** جلوگیری از توست تکراری اتمام سهمیه روزانه */
let lastBudgetToastAt = 0;

/** انتخاب کلید بعدی با چرخش round-robin — فقط کلیدهایی که سهمیه دارند */
function pickAvailableKey(): string | null {
  const keys = effectiveApiKeys(useSettingsStore.getState().apiKeys);
  if (keys.length === 0) return null;
  for (const key of keys) {
    if (useAvBudgetStore.getState().canUse(key)) return key;
  }
  return null;
}

/** کش تازه از IndexedDB (بدون شبکه) */
export async function getCachedStockPrice(symbol: string): Promise<PriceQuote | null> {
  const rec = await cacheGetPrice(`av:${symbol}`);
  if (!rec) return null;
  return { price: rec.price, source: rec.source, fetchedAt: rec.fetchedAt };
}

/** کش دسته‌ای — یک بار تماس برای همه نمادها */
export async function getCachedStockPricesBulk(
  symbols: string[]
): Promise<Map<string, PriceQuote>> {
  const rows = await cacheBulkGetPrice(symbols.map((s) => `av:${s}`));
  const out = new Map<string, PriceQuote>();
  rows.forEach((rec, key) => {
    out.set(key.replace(/^av:/, ''), {
      price: rec.price,
      source: rec.source,
      fetchedAt: rec.fetchedAt
    });
  });
  return out;
}

/** ساخت URL درخواست بر اساس نوع نماد */
function buildRequestUrl(symbol: string, key: string): string {
  const commodity = AV_COMMODITY_FUNCS[symbol];
  if (commodity) {
    // سری زمانی — آخرین مقدار همان قیمت جاری است
    return `${ALPHA_VANTAGE_BASE}?function=${encodeURIComponent(commodity)}&interval=daily&apikey=${encodeURIComponent(key)}`;
  }
  const maturity = AV_YIELD_MATURITY[symbol];
  if (maturity) {
    return `${ALPHA_VANTAGE_BASE}?function=TREASURY_YIELD&interval=daily&maturity=${maturity}&apikey=${encodeURIComponent(key)}`;
  }
  return (
    `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE` +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`
  );
}

/** استخراج قیمت از پاسخ — بر اساس نوع */
function parsePriceFromResponse(symbol: string, json: Record<string, unknown>): number | null {
  const commodity = AV_COMMODITY_FUNCS[symbol];
  const maturity = AV_YIELD_MATURITY[symbol];

  if (commodity || maturity) {
    // پاسخ سری زمانی: data[0].value
    const data = json['data'];
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0] as { value?: string };
      const value = typeof first?.value === 'string' ? parseFloat(first.value) : NaN;
      return Number.isFinite(value) ? value : null;
    }
    return null;
  }

  const gq = (json['Global Quote'] ?? {}) as Record<string, unknown>;
  const raw = typeof gq['05. price'] === 'string' ? parseFloat(gq['05. price']) : NaN;
  return Number.isFinite(raw) ? raw : null;
}

/** قیمت لحظه‌ای با کش، سهمیه‌بندی و صف محدودکننده */
export async function fetchStockQuote(symbol: string): Promise<PriceQuote> {
  const now = Date.now();

  // ۱) کش تازه؟
  const cached = await cacheGetPrice(`av:${symbol}`);
  if (cached && now - cached.fetchedAt < STOCK_STALE_MS) {
    return { price: cached.price, source: cached.source, fetchedAt: cached.fetchedAt };
  }

  // ۲) کش کهنه → «اسنپ‌شات» (ردیف حذف نمی‌شود)
  const staleFallback: PriceQuote | null = cached
    ? { price: cached.price, source: 'snapshot', fetchedAt: cached.fetchedAt }
    : null;

  // ۳) آفلاین → بدون مصرف سهمیه
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return staleFallback ?? { price: NaN, source: 'na', fetchedAt: now };
  }

  // ۴) اگر هیچ کلیدی سهمیه ندارد، زودتر خروج (بدون مصرف)
  if (!pickAvailableKey()) {
    if (now - lastBudgetToastAt > 10 * 60_000) {
      lastBudgetToastAt = now;
      toast('info', t('avBudgetExhausted'));
    }
    return staleFallback ?? { price: NaN, source: 'na', fetchedAt: now };
  }

  // ۵) شبکه (با صف) — مصرف سهمیه فقط در لحظه اجرای واقعی درخواست
  try {
    const { json: quote, key } = await avQueue.enqueue(async () => {
      const key = pickAvailableKey();
      if (!key) {
        throw new RateLimitError('av budget exhausted');
      }
      // مصرف فقط برای درخواستی که واقعاً ارسال می‌شود
      await useAvBudgetStore.getState().consume(key);

      const url = buildRequestUrl(symbol, key);
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.status === 429) {
        throw Object.assign(new Error('Alpha Vantage 429'), { code: 429 });
      }
      if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
      return { json: (await res.json()) as Record<string, unknown>, key };
    });

    const price = parsePriceFromResponse(symbol, quote);
    if (price !== null && price > 0) {
      const record: PriceQuote = { price, source: 'live', fetchedAt: Date.now() };
      void cachePutPrice(`av:${symbol}`, record);
      return record;
    }

    // پاسخ سهمیه‌مصرف‌شده (Information/Note) → همان کلید درخواست را exhaust کن
    if (typeof quote?.['Information'] === 'string' || typeof quote?.['Note'] === 'string') {
      await useAvBudgetStore.getState().exhaust(key);
      if (now - lastRateToastAt > 5 * 60_000) {
        lastRateToastAt = now;
        toast('info', t('rateLimitNotice'));
      }
      return staleFallback ?? { price: NaN, source: 'na', fetchedAt: now };
    }
    return staleFallback ?? { price: NaN, source: 'na', fetchedAt: now };
  } catch (e) {
    // آفلاین / محدودیت لحظه‌ای / بدون سهمیه → فالبک
    if (isRateLimitError(e)) {
      if (now - lastRateToastAt > 5 * 60_000) {
        lastRateToastAt = now;
        toast('info', t('rateLimitNotice'));
      }
      throw e; // چرخه با این خطا متوقف می‌شود (مدارشکن)
    }
    return staleFallback ?? { price: NaN, source: 'na', fetchedAt: now };
  }
}


/** کلیدهای مؤثر + سهمیه امروز (برای نمایش در UI) */
export function avBudgetInfo(): { used: number; budget: number; keys: number } {
  const keys = effectiveApiKeys(useSettingsStore.getState().apiKeys);
  const budget = useAvBudgetStore.getState();
  const used = keys.reduce((acc, k) => acc + budget.usedToday(k), 0);
  return { used, budget: keys.length * AV_DAILY_BUDGET_PER_KEY, keys: keys.length };
}

