/**
 * دریافت تاریخچه از هر پلتفرم (فقط‌خواندنی، با آدرس عمومی) + به‌روزرسانی افزایشی کش
 *
 *   هایپرلیکوئید   info userFillsByTime / userFunding (مستقیم از مرورگر؛ فقط ۱۰٬۰۰۰ اجرای اخیر را می‌دهد)
 *   تی‌اکس‌فلو     rpc.txflow.com فقط userFills (اجراهای اخیر) را مجاز می‌داند؛ userFillsByTime و userFunding «not allowed» است
 *   لایتر          /api/integrations?op=lighter-trades (سرور؛ صفحه‌بندی cursor)
 *   آرکوس          /v1/fills و /v1/funding (مستقیم؛ صفحه‌بندی موجود ماژول آرکوس)
 * هم‌پوشانی ۲ روزه با آخرین دریافت تا اجرای دیر ثبت‌شده جا نیفتد؛ تکراری‌ها با شناسه حذف می‌شوند.
 */
import { fetchJson } from '@/repositories/remoteClient';
import { txflowInfo } from '@/features/calculators/data/perpMarkets';
import { fetchHistory } from '@/features/arcus/api/paginate';
import type { Fill, FundingEvent, JournalAccount } from '../domain/types';
import { dedupeById, fromArcusFills, fromArcusFunding, fromHlFills, fromHlFunding, fromLighterTrades, type LighterTradeLite } from '../domain/fills';
import { readAccount, writeAccount } from './historyCache';
import type { DailyAccountPoint } from '../domain/neutral';

const HL_INFO = 'https://api.hyperliquid.xyz/info';
const OVERLAP = 2 * 86_400_000;

export interface AccountHistory {
  key: string;
  fills: Fill[];
  funding: FundingEvent[];
  fundingFetched: boolean;
  complete: boolean;
  limitation: string | null;
  syncedAt: number;
}

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(HL_INFO, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** صفحه‌بندی زمانی سبک هایپرلیکوئید: هر پاسخ حداکثر ۲۰۰۰ (فاندینگ ۵۰۰)؛ startTime بعدی = بیشترین زمان + ۱ */
async function hlPaged(call: (start: number) => Promise<unknown[]>, start: number, cap: number, timeOf: (r: unknown) => number): Promise<{ rows: unknown[]; complete: boolean }> {
  const rows: unknown[] = [];
  let from = start;
  for (let page = 0; page < 10; page++) {
    const batch = await call(from);
    rows.push(...batch);
    if (batch.length < cap) return { rows, complete: true };
    const maxT = Math.max(...batch.map(timeOf));
    if (!(maxT >= from)) break;
    from = maxT + 1;
  }
  return { rows, complete: false };
}

const tOf = (r: unknown) => Number((r as { time?: unknown }).time) || 0;

async function loadHlLike(acc: JournalAccount, since: number): Promise<{ fills: Fill[]; funding: FundingEvent[]; fundingFetched: boolean; complete: boolean; limitation: string | null }> {
  const user = acc.address;
  if (acc.venue === 'txflow') {
    // بدون صفحه‌بندی زمانی: فقط آخرین اجراها؛ کش افزایشی تاریخچهٔ قدیمی‌تر را روی دستگاه نگه می‌دارد
    const raw = await txflowInfo<unknown[]>({ type: 'userFills', user }).then((r) => (Array.isArray(r) ? r : []));
    const fills = fromHlFills(acc, raw).filter((f) => f.time >= since);
    return { fills, funding: [], fundingFetched: false, complete: raw.length < 2000, limitation: 'تی‌اکس‌فلو فقط اجراهای اخیر و بدون فاندینگ را عمومی می‌دهد؛ تاریخچهٔ قدیمی‌تر از اولین باز کردن ژورنال در دسترس نیست.' };
  }
  const call = hlInfo;
  const fills = await hlPaged((s) => call<unknown[]>({ type: 'userFillsByTime', user, startTime: s, aggregateByTime: false }).then((r) => (Array.isArray(r) ? r : [])), since, 2000, tOf);
  let funding: unknown[] = [];
  let fundingFetched = true;
  try {
    funding = (await hlPaged((s) => call<unknown[]>({ type: 'userFunding', user, startTime: s }).then((r) => (Array.isArray(r) ? r : [])), since, 500, tOf)).rows;
  } catch {
    fundingFetched = false;
  }
  return {
    fills: fromHlFills(acc, fills.rows),
    funding: fromHlFunding(acc, funding),
    fundingFetched,
    complete: fills.complete,
    limitation: fills.complete ? (acc.venue === 'hyperliquid' ? 'هایپرلیکوئید فقط ۱۰٬۰۰۰ اجرای اخیر را می‌دهد.' : null) : 'تاریخچه طولانی‌تر از سقف هر دریافت بود؛ نوبت بعد ادامه می‌یابد.'
  };
}

async function loadLighter(acc: JournalAccount, since: number): Promise<{ fills: Fill[]; complete: boolean; limitation: string | null }> {
  const op = acc.venue === 'lighter-mainnet' ? 'lighter-mainnet-trades' : 'lighter-trades';
  const all: LighterTradeLite[] = [];
  let cursor = '';
  // هر درخواست حداکثر ۲۰ صفحه؛ ۸ درخواست ≈ ۱۶٬۰۰۰ معامله در هر نوبت (زیر سهمیهٔ دقیقه‌ای سرور)
  for (let i = 0; i < 8; i++) {
    const q = new URLSearchParams({ op, index: String(acc.sub ?? ''), since: String(since) });
    if (cursor) q.set('cursor', cursor);
    const r = await fetchJson<{ trades: LighterTradeLite[]; next: string | null; complete: boolean }>(`/api/integrations?${q}`, { timeoutMs: 15_000 });
    all.push(...r.trades);
    if (r.complete || !r.next) return { fills: fromLighterTrades(acc, all), complete: true, limitation: null };
    cursor = r.next;
  }
  return { fills: fromLighterTrades(acc, all), complete: false, limitation: 'حجم معاملات این حساب بیش از سقف یک نوبت بود؛ قدیمی‌ترها خوانده نشد.' };
}

async function loadArcus(acc: JournalAccount, since: number | null): Promise<{ fills: Fill[]; funding: FundingEvent[]; complete: boolean; limitation: string | null }> {
  const base = { env: 'mainnet' as const, address: acc.address, accountIndex: acc.sub ?? 0, limit: 1000 };
  const fromUs = since === null ? null : String(BigInt(since) * 1000n);
  const [f, fu] = await Promise.all([fetchHistory('fills', { ...base, fromUs }), fetchHistory('funding', { ...base, fromUs })]);
  return { fills: fromArcusFills(acc, f.rows), funding: fromArcusFunding(acc, fu.rows), complete: f.complete, limitation: f.limitation };
}

/**
 * تاریخچهٔ یک حساب: کش + بخش تازه. `windowFrom` برای حساب‌های نوترال پرحجم (فقط N روز اخیر).
 * اولین اجرای آرکوس از کل تاریخچه است، پس پوزیشن قبل از آن صفر است.
 */
export async function loadAccountHistory(acc: JournalAccount, windowFrom: number, now = Date.now()): Promise<AccountHistory> {
  const cached = await readAccount(acc.key);
  const coversWindow = cached.mark && cached.mark.from <= windowFrom;
  const since = coversWindow ? Math.max(windowFrom, cached.mark!.lastTime - OVERLAP) : windowFrom;
  let fresh: { fills: Fill[]; funding?: FundingEvent[]; fundingFetched?: boolean; complete: boolean; limitation: string | null };
  if (acc.venue === 'hyperliquid' || acc.venue === 'txflow') fresh = await loadHlLike(acc, since);
  else if (acc.venue === 'lighter-mainnet' || acc.venue === 'lighter-robinhood') fresh = await loadLighter(acc, since);
  else if (acc.venue === 'arcus') {
    const r = await loadArcus(acc, windowFrom > 0 || coversWindow ? since : null);
    if (!coversWindow && windowFrom <= 0 && r.complete) {
      // از ابتدای حساب خوانده‌ایم: اولین اجرای هر نماد از پوزیشن صفر شروع می‌شود
      const firsts = new Map<string, Fill>();
      for (const f of [...r.fills].sort((a, b) => a.time - b.time)) if (!firsts.has(f.symbol)) firsts.set(f.symbol, f);
      r.fills = r.fills.map((f) => (firsts.get(f.symbol) === f ? { ...f, posBefore: 0 } : f));
    }
    fresh = r;
  } else fresh = { fills: [], complete: true, limitation: null };

  const fills = dedupeById([...(coversWindow ? cached.fills : []), ...fresh.fills]).filter((f) => f.time >= windowFrom);
  const funding = dedupeById([...(coversWindow ? cached.funding : []), ...(fresh.funding ?? [])]).filter((f) => f.time >= windowFrom);
  const lastTime = Math.max(cached.mark?.lastTime ?? 0, ...fresh.fills.map((f) => f.time), since);
  // ناقص‌بودن چسبنده است: اگر دریافت اول به کل تاریخچه نرسید، دریافت‌های افزایشی بعدی آن را «کامل» نمی‌کنند
  const complete = coversWindow ? cached.mark!.complete && fresh.complete : fresh.complete;
  const limitation = fresh.limitation ?? (coversWindow && !cached.mark!.complete ? cached.mark!.limitation : null);
  const mark = { key: acc.key, lastTime, from: coversWindow ? Math.min(cached.mark!.from, windowFrom) : windowFrom, complete, limitation, syncedAt: now };
  await writeAccount(acc.key, fresh.fills, fresh.funding ?? [], mark);
  return { key: acc.key, fills, funding, fundingFetched: fresh.fundingFetched ?? acc.venue === 'arcus', complete, limitation, syncedAt: now };
}

/** سری روزانهٔ لایتر (۱۸۰ روز) برای دفتر نوترال */
export async function loadLighterDaily(acc: JournalAccount): Promise<DailyAccountPoint[]> {
  const op = acc.venue === 'lighter-mainnet' ? 'lighter-mainnet-daily' : 'lighter-daily';
  const r = await fetchJson<{ daily: [number, number, number][] }>(`/api/integrations?op=${op}&index=${acc.sub ?? ''}&days=180`, { timeoutMs: 15_000 });
  return r.daily.map(([t, pnl, volume]) => ({ t, pnl, volume }));
}
