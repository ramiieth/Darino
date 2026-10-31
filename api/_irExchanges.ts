/** ============================================================
 * «صرافی‌های ایران» — بهترین خرید و فروش یک ارز در ۱۱ صرافی (کش ۳۰ ثانیه برای هر ارز)
 *
 *  هر صرافی جدا و موازی؛ صرافی‌ای که خطا بدهد یا ارز را نداشته باشد فقط در missing می‌آید.
 *  فقط GET به نشانی‌های عمومی همان صرافی‌ها؛ بدون کلید، کوکی یا امضا.
 * ============================================================ */
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import {
  IR_EXCHANGES, irxRows, irxUrl, ompDepthUrl, parseIrx, parseOmpMarketId,
  type IrExchange, type IrxCoin, type IrxPayload, type IrxQuote
} from '../src/features/intel/domain/irExchanges.js';

const LIVE_MS = 30_000;

async function getJson(url: string, timeoutMs = 9_000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchQuote(ex: IrExchange, coin: IrxCoin): Promise<IrxQuote | null> {
  if (ex === 'ompfinex') {
    const id = parseOmpMarketId(await getJson(irxUrl(ex, coin)), coin);
    return id === null ? null : parseIrx(ex, coin, await getJson(ompDepthUrl(id)));
  }
  return parseIrx(ex, coin, await getJson(irxUrl(ex, coin)));
}

async function build(coin: IrxCoin, now: number): Promise<IrxPayload> {
  const results = await Promise.all(IR_EXCHANGES.map((ex) => fetchQuote(ex, coin).catch(() => null)));
  const quotes: Partial<Record<IrExchange, IrxQuote>> = {};
  IR_EXCHANGES.forEach((ex, i) => { if (results[i]) quotes[ex] = results[i]!; });
  const rows = irxRows(quotes);
  const shown = new Set(rows.map((r) => r.exchange));
  return { coin, fetchedAt: now, rows, missing: IR_EXCHANGES.filter((ex) => !shown.has(ex)) };
}

export async function getIrExchanges(coin: IrxCoin, now = Date.now()): Promise<IrxPayload> {
  const key = providerCacheKey(`irx-v1:${coin}`);
  const cached = await readProviderCache<IrxPayload>(key);
  if (cached) return cached;
  const payload = await build(coin, now);
  if (payload.rows.length) await writeProviderCache(key, payload, LIVE_MS);
  return payload;
}
