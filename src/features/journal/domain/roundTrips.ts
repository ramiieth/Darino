/**
 * بازسازی معاملهٔ رفت‌وبرگشت از اجراها (Fill) — برای هر (حساب، نماد) جدا
 *
 *   • معامله وقتی شروع می‌شود که پوزیشن از صفر خارج شود و وقتی تمام می‌شود که به صفر برگردد.
 *   • چرخش جهت (لانگ → شورت در یک اجرا) اجرا را دو تکه می‌کند: بستن قبلی + باز کردن جدید؛ کارمزد به نسبت حجم تقسیم می‌شود.
 *   • اگر اولین اجرای دیده‌شده پوزیشنی را کم کند که شروعش در تاریخچه نیست، معامله «ناقص» (truncated) علامت می‌خورد:
 *     قیمت ورود و سود کامل معلوم نیست، پس در آمار عملکرد شمرده نمی‌شود و فقط در پنل اعتماد داده می‌آید.
 *   • سود قیمتی از قیمت‌ها محاسبه می‌شود (قطعی و یکسان برای همهٔ پلتفرم‌ها)؛ برای معاملهٔ ناقص سود گزارش‌شدهٔ صرافی.
 *   • فاندینگ هر رویداد به معاملهٔ همان (حساب، نماد) که در آن زمان باز بوده نسبت داده می‌شود.
 */
import type { Fill, FundingEvent, Trade } from './types';

const EPS = 1e-9;

/** نام پایهٔ قابل‌مقایسه بین پلتفرم‌ها: BTC-USD، BTC-PERP، kPEPE، 1000PEPE، xyz:TSLA → BTC، PEPE، TSLA */
export function baseOf(symbol: string): string {
  let s = symbol.toUpperCase().trim();
  s = s.replace(/^[A-Z0-9]+:/, '');
  s = s.replace(/[-_/ ]?(USDC|USDT|USDE|USDG|USD|PERP|P)$/, '');
  s = s.replace(/[-_/.]?P$/, '');
  s = s.replace(/^(1000000|100000|10000|1000|K)(?=[A-Z]{2,})/, '');
  return s || symbol.toUpperCase();
}

/** نماد امن برای شناسهٔ همگام‌سازی (فقط [\w.-]) */
export function safeSymbol(symbol: string): string {
  return symbol.replace(/[^\w.-]/g, '_').slice(0, 24);
}

interface Building {
  account: string;
  venue: Fill['venue'];
  symbol: string;
  direction: 'long' | 'short';
  openTime: number;
  truncated: boolean;
  entryQty: number;
  entryCost: number;
  exitQty: number;
  exitCost: number;
  pos: number;
  maxSize: number;
  volume: number;
  gross: number;
  venueRealized: number;
  venueRealizedKnown: boolean;
  fees: number;
  feesKnown: boolean;
  fills: number;
  liquidated: boolean;
}

function start(f: Fill, direction: 'long' | 'short', time: number, truncated: boolean): Building {
  return {
    account: f.account,
    venue: f.venue,
    symbol: f.symbol,
    direction,
    openTime: time,
    truncated,
    entryQty: 0,
    entryCost: 0,
    exitQty: 0,
    exitCost: 0,
    pos: 0,
    maxSize: 0,
    volume: 0,
    gross: 0,
    venueRealized: 0,
    venueRealizedKnown: true,
    fees: 0,
    feesKnown: true,
    fills: 0,
    liquidated: false
  };
}

function finish(b: Building, closeTime: number | null): Trade {
  const entryPx = !b.truncated && b.entryQty > EPS ? b.entryCost / b.entryQty : null;
  const exitPx = b.exitQty > EPS ? b.exitCost / b.exitQty : null;
  const gross = b.truncated && b.venueRealizedKnown ? b.venueRealized : b.gross;
  const fees = b.feesKnown ? b.fees : null;
  const refPx = entryPx ?? exitPx ?? 0;
  return {
    id: `${b.account}:${safeSymbol(b.symbol)}:${b.openTime}`,
    account: b.account,
    venue: b.venue,
    symbol: b.symbol,
    base: baseOf(b.symbol),
    direction: b.direction,
    openTime: b.openTime,
    closeTime,
    open: closeTime === null,
    truncated: b.truncated,
    entryPx,
    exitPx,
    maxSize: b.maxSize,
    maxNotional: b.maxSize * refPx,
    volume: b.volume,
    grossPnl: gross,
    fees,
    funding: null,
    netPnl: gross - (fees ?? 0),
    fills: b.fills,
    liquidated: b.liquidated
  };
}

/** یک گروه (حساب، نماد) با اجراهای مرتب‌شده بر حسب زمان */
function buildGroup(fills: Fill[]): Trade[] {
  const out: Trade[] = [];
  let cur: Building | null = null;
  for (let i = 0; i < fills.length; i++) {
    const f = fills[i];
    const signed = f.side === 'buy' ? f.sz : -f.sz;
    if (!(f.sz > EPS) || !(f.px > 0)) continue;

    if (!cur) {
      const before = f.posBefore ?? 0;
      if (Math.abs(before) > EPS) {
        // اولین اجرای دیده‌شده روی پوزیشنی است که شروعش در تاریخچه نیست
        cur = start(f, before > 0 ? 'long' : 'short', f.time, true);
        cur.pos = before;
        cur.maxSize = Math.abs(before);
      } else {
        cur = start(f, signed > 0 ? 'long' : 'short', f.time, false);
      }
    }

    const dirSign = cur.direction === 'long' ? 1 : -1;
    const qty = Math.abs(signed);
    const increasing = Math.sign(signed) === dirSign;
    cur.fills++;
    if (f.liquidation) cur.liquidated = true;

    if (increasing) {
      cur.entryQty += qty;
      cur.entryCost += qty * f.px;
      cur.pos += signed;
      cur.volume += qty * f.px;
      cur.maxSize = Math.max(cur.maxSize, Math.abs(cur.pos));
      if (f.fee === null) cur.feesKnown = false;
      else cur.fees += f.fee;
      continue;
    }

    // کاهش (و شاید چرخش)
    const closeQty = Math.min(qty, Math.abs(cur.pos));
    const share = qty > 0 ? closeQty / qty : 1;
    const avgEntry = cur.entryQty > EPS ? cur.entryCost / cur.entryQty : null;
    if (avgEntry !== null) cur.gross += dirSign * (f.px - avgEntry) * closeQty;
    cur.exitQty += closeQty;
    cur.exitCost += closeQty * f.px;
    cur.volume += closeQty * f.px;
    if (f.realized === null) cur.venueRealizedKnown = false;
    else cur.venueRealized += f.realized * share;
    if (f.fee === null) cur.feesKnown = false;
    else cur.fees += f.fee * share;
    cur.pos += dirSign * -closeQty;

    if (Math.abs(cur.pos) <= EPS * Math.max(1, cur.maxSize)) {
      out.push(finish(cur, f.time));
      cur = null;
      const rest = qty - closeQty;
      if (rest > EPS) {
        // چرخش: باقی‌مانده یک معاملهٔ تازه در جهت مخالف
        const next = start(f, signed > 0 ? 'long' : 'short', f.time, false);
        next.entryQty = rest;
        next.entryCost = rest * f.px;
        next.pos = Math.sign(signed) * rest;
        next.maxSize = rest;
        next.volume = rest * f.px;
        next.fills = 1;
        if (f.fee === null) next.feesKnown = false;
        else next.fees = f.fee * (1 - share);
        cur = next;
      }
    }
  }
  if (cur) out.push(finish(cur, null));
  return out;
}

/** همهٔ معاملات از همهٔ اجراها؛ فاندینگ به معاملهٔ باز همان زمان نسبت داده می‌شود */
export function buildTrades(fills: readonly Fill[], funding: readonly FundingEvent[] = [], fundingAccounts: ReadonlySet<string> = new Set()): Trade[] {
  const groups = new Map<string, Fill[]>();
  for (const f of fills) {
    const k = `${f.account}|${f.symbol}`;
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }
  const trades: Trade[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    trades.push(...buildGroup(g));
  }

  // فاندینگ: فقط برای حساب‌هایی که پلتفرمشان فاندینگ می‌دهد؛ برای بقیه null می‌ماند (نه صفر)
  const byKey = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = `${t.account}|${t.symbol}`;
    const arr = byKey.get(k);
    if (arr) arr.push(t);
    else byKey.set(k, [t]);
    if (fundingAccounts.has(t.account)) t.funding = 0;
  }
  for (const e of funding) {
    const arr = byKey.get(`${e.account}|${e.symbol}`);
    if (!arr) continue;
    const t = arr.find((x) => x.openTime <= e.time && (x.closeTime === null || e.time <= x.closeTime + 1000));
    if (!t) continue;
    t.funding = (t.funding ?? 0) + e.amount;
  }
  for (const t of trades) t.netPnl = t.grossPnl - (t.fees ?? 0) + (t.funding ?? 0);
  return trades.sort((a, b) => b.openTime - a.openTime);
}
