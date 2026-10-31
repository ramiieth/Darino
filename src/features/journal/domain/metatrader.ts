/**
 * ورود استیتمنت متاتریدر (MT4 «Detailed Statement» و MT5 «Report → History») — خالص و آزمون‌پذیر
 *
 *   MT4  جدول «Closed Transactions»: Ticket · Open Time · Type · Size · Item · Price · S/L · T/P · Close Time · Price · Commission · Taxes · Swap · Profit
 *   MT5  بخش «Positions»:            Time · Position · Symbol · Type · Volume · Price · S/L · T/P · Time · Price · Commission · Swap · Profit
 *   CSV  همان سرستون‌ها (جداکنندهٔ , ; یا تب)
 * HTML گزارش MT5 معمولاً UTF-16 است؛ decodeStatement از روی BOM و بایت‌های صفر تشخیص می‌دهد.
 *
 * هر ردیف متاتریدر خودش یک معاملهٔ کامل است (پوزیشن جدا، حتی در حساب Hedge)، پس مستقیم Trade می‌شود
 * و از بازسازی اجراها نمی‌گذرد؛ وگرنه دو پوزیشن هم‌زمان یک نماد در هم ادغام می‌شوند.
 *
 * سود: همان Profit گزارش‌شدهٔ بروکر (به ارز حساب). اندازهٔ قرارداد (لات → واحد) از خود ردیف‌ها استنتاج می‌شود:
 *   Profit ÷ (تغییر قیمت × لات) برای نمادی که ارز دوم آن همان ارز حساب است (EURUSD، XAUUSD، UKOUSD با حساب دلاری)
 *   دقیق است و به یکی از ۱، ۱۰، ۱۰۰، … گرد می‌شود؛ اگر نشد null می‌ماند و ارزش اسمی تقریبی است.
 * زمان: ساعت سرور بروکر؛ پیش‌فرض «بستن نیویورک» (UTC+2 زمستان، UTC+3 تابستان آمریکا) که اغلب بروکرها دارند.
 * S/L و T/P استیتمنت آخرین مقدار است (اگر جابه‌جا شده باشد، استاپ اولیه نیست) — فقط نگه‌داری می‌شود، R از آن ساخته نمی‌شود.
 */
import type { Direction, Trade } from './types';
import { accountKey, venueOfKey } from './fills';
import { baseOf } from './roundTrips';

export type ServerTime = 'ny' | number;

export interface MtTrade {
  /** jt:<login>.<ticket> */
  id: string;
  login: string;
  ticket: string;
  symbol: string;
  direction: Direction;
  openTime: number;
  closeTime: number;
  entryPx: number;
  exitPx: number;
  lots: number;
  /** واحد هر لات؛ null = استنتاج نشد */
  contractSize: number | null;
  sl: number | null;
  tp: number | null;
  /** منفی = پرداخت (قرارداد متاتریدر) */
  commission: number;
  swap: number;
  /** سود قیمتی به ارز حساب، بدون کمیسیون و سواپ */
  profit: number;
  currency: string | null;
  deleted?: boolean;
}

export interface MtParseResult {
  format: 'mt4' | 'mt5' | 'csv' | null;
  login: string | null;
  currency: string | null;
  trades: MtTrade[];
  /** ردیف‌های جدول که معامله نبودند یا ناقص بودند (بالانس، سفارش لغوشده، جمع) */
  skipped: number;
  contract: Record<string, number | null>;
  warnings: string[];
}

/* ---------------- رمزگشایی و خواندن جدول ---------------- */

export function decodeStatement(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  let zeros = 0;
  const probe = Math.min(bytes.length, 400);
  for (let i = 1; i < probe; i += 2) if (bytes[i] === 0) zeros++;
  if (probe > 20 && zeros > probe / 4) return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

interface Cell { text: string; hidden: boolean }

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const cleanText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
    .replace(/[\s ]+/g, ' ')
    .trim();

/** ردیف‌های همهٔ جدول‌ها؛ colspan باز می‌شود تا ستون‌ها با سرستون هم‌تراز بمانند */
export function htmlRows(html: string): Cell[][] {
  const out: Cell[][] = [];
  for (const tr of html.split(/<tr\b/i).slice(1)) {
    const body = tr.split(/<\/tr>/i)[0];
    const row: Cell[] = [];
    for (const m of body.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|$)/gi)) {
      const attrs = m[1];
      const span = Math.min(50, Math.max(1, Number(/colspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1] ?? 1)));
      const hidden = /class\s*=\s*["']?[^"'>]*\bhidden\b/i.test(attrs) || /display\s*:\s*none/i.test(attrs);
      const text = cleanText(m[2]);
      for (let i = 0; i < span; i++) row.push({ text: i === 0 ? text : '', hidden });
    }
    if (row.length) out.push(row);
  }
  return out;
}

export function csvRows(text: string): Cell[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0];
  const delim = ['\t', ';', ','].map((d) => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === delim && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => ({ text: c.trim(), hidden: false }));
  });
}

/* ---------------- مقدار‌ها ---------------- */

export function mtNumber(s: string): number | null {
  let t = s.replace(/[\s   ']/g, '');
  if (!t || t === '-') return null;
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/;

/** اختلاف ساعت سرور با UTC در آن لحظه؛ «ny» = ساعت نیویورک + ۷ (۲ یا ۳) */
export function serverOffsetHours(wallMs: number, mode: ServerTime): number {
  if (mode !== 'ny') return mode;
  // ساعت دیواری سرور ≈ UTC + ۲ یا ۳ — برای تشخیص DST آمریکا لحظهٔ تقریبی کافی است
  const approx = new Date(wallMs - 2 * 3_600_000);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(approx).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const ny = Number(/GMT([+-]\d+)/.exec(name)?.[1] ?? -5);
  return ny + 7;
}

export function mtTime(s: string, mode: ServerTime): number | null {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return wall - serverOffsetHours(wall, mode) * 3_600_000;
}

/** EURUSD.m، XAUUSD+، EURUSDm، #UKOUSD → EURUSD، XAUUSD، EURUSD، UKOUSD */
export function normalizeMtSymbol(raw: string): string {
  let s = raw.trim().replace(/^[#.]/, '');
  s = s.replace(/[.#+!_\-].*$/, '');
  s = s.replace(/^([A-Z0-9]{3,})[a-z]+$/, '$1');
  return s.toUpperCase();
}

/* ---------------- نگاشت ستون‌ها ---------------- */

const key = (s: string) => s.toLowerCase().replace(/[\s/._:]/g, '');

interface Columns {
  ticket: number | null;
  open: number;
  close: number;
  type: number;
  symbol: number;
  volume: number;
  openPx: number;
  closePx: number;
  sl: number | null;
  tp: number | null;
  commission: number | null;
  taxes: number | null;
  swap: number | null;
  profit: number;
  format: 'mt4' | 'mt5';
}

function mapHeader(cells: string[]): Columns | null {
  const k = cells.map(key);
  const all = (name: string) => k.flatMap((x, i) => (x === name ? [i] : []));
  const one = (...names: string[]) => { for (const n of names) { const i = k.indexOf(n); if (i >= 0) return i; } return null; };
  const symbol = one('symbol', 'item');
  const type = one('type');
  const profit = one('profit');
  const volume = one('volume', 'size', 'lots');
  const times = all('time');
  const open = one('opentime') ?? times[0] ?? null;
  const close = one('closetime') ?? times[1] ?? null;
  const prices = all('price');
  if (symbol === null || type === null || profit === null || volume === null || open === null || close === null || prices.length < 2) return null;
  const openPx = prices.find((i) => i > open && i < close) ?? prices[0];
  const closePx = prices.find((i) => i > close) ?? prices[1];
  return {
    ticket: one('ticket', 'position', 'deal', 'order'),
    open, close, type, symbol, volume, openPx, closePx,
    sl: one('sl'), tp: one('tp'),
    commission: one('commission', 'commissions'), taxes: one('taxes'), swap: one('swap'),
    profit,
    format: k.includes('item') || k.includes('opentime') ? 'mt4' : 'mt5'
  };
}

interface Draft extends Omit<MtTrade, 'id' | 'login' | 'contractSize' | 'currency'> {}

function rowTrade(cells: string[], c: Columns, mode: ServerTime): Draft | null {
  const at = (i: number | null) => (i === null ? '' : cells[i] ?? '');
  const type = at(c.type).toLowerCase().trim();
  if (type !== 'buy' && type !== 'sell') return null;
  const openTime = mtTime(at(c.open), mode), closeTime = mtTime(at(c.close), mode);
  const entryPx = mtNumber(at(c.openPx)), exitPx = mtNumber(at(c.closePx));
  // «0.1 / 0.1» در برخی گزارش‌های MT5
  const lots = mtNumber(at(c.volume).split('/')[0]);
  const profit = mtNumber(at(c.profit));
  const symbol = normalizeMtSymbol(at(c.symbol));
  if (openTime === null || closeTime === null || closeTime < openTime || !entryPx || !exitPx || !lots || lots <= 0 || profit === null || !symbol) return null;
  const sl = mtNumber(at(c.sl)), tp = mtNumber(at(c.tp));
  return {
    ticket: at(c.ticket).replace(/\D/g, '') || `${symbol}-${openTime}-${type}`,
    symbol,
    direction: type === 'buy' ? 'long' : 'short',
    openTime, closeTime, entryPx, exitPx, lots,
    sl: sl && sl > 0 ? sl : null,
    tp: tp && tp > 0 ? tp : null,
    commission: (mtNumber(at(c.commission)) ?? 0) + (mtNumber(at(c.taxes)) ?? 0),
    swap: mtNumber(at(c.swap)) ?? 0,
    profit
  };
}

/** یک دور خواندن جدول؛ dropHidden برای گزارش‌هایی که سلول پنهان فقط در ردیف داده دارند */
function scan(rows: Cell[][], mode: ServerTime, dropHidden: boolean): { drafts: Draft[]; skipped: number; format: Columns['format'] | null } {
  const drafts: Draft[] = [];
  let skipped = 0, format: Columns['format'] | null = null;
  let cols: Columns | null = null;
  let started = false;
  for (const raw of rows) {
    const cells = (dropHidden ? raw.filter((c) => !c.hidden) : raw).map((c) => c.text);
    const header = mapHeader(cells);
    if (header) { cols = header; format ??= header.format; started = false; continue; }
    if (!cols) continue;
    const t = rowTrade(cells, cols, mode);
    if (t) { drafts.push(t); started = true; continue; }
    const filled = cells.filter(Boolean);
    // تیتر بخش بعد («Orders»، «Open Trades:»، «Working Orders:») جدول معاملات بسته را تمام می‌کند
    if (started && filled.length === 1 && !DATE_RE.test(filled[0])) { cols = null; continue; }
    if (filled.length) skipped++;
  }
  return { drafts, skipped, format };
}

const SNAP = [1, 10, 100, 1000, 10_000, 100_000];

/** اندازهٔ قرارداد هر نماد از نسبت سود به تغییر قیمت × لات (میانه، گرد به نزدیک‌ترین توان ۱۰ با خطای ≤ ۳٪) */
export function inferContractSizes(drafts: readonly Draft[]): Record<string, number | null> {
  const by = new Map<string, number[]>();
  for (const d of drafts) {
    const move = (d.exitPx - d.entryPx) * (d.direction === 'long' ? 1 : -1);
    if (Math.abs(move) < 1e-12 || Math.abs(d.profit) < 0.01) continue;
    const implied = d.profit / (move * d.lots);
    if (implied > 0) (by.get(d.symbol) ?? by.set(d.symbol, []).get(d.symbol)!).push(implied);
  }
  const out: Record<string, number | null> = {};
  for (const sym of new Set(drafts.map((d) => d.symbol))) {
    const v = (by.get(sym) ?? []).sort((a, b) => a - b);
    if (!v.length) { out[sym] = null; continue; }
    const med = v[Math.floor(v.length / 2)];
    out[sym] = SNAP.find((s) => Math.abs(med - s) / s <= 0.03) ?? null;
  }
  return out;
}

export function parseStatement(text: string, opts: { serverTime: ServerTime; login?: string | null }): MtParseResult {
  const isHtml = /<t[dr]\b/i.test(text);
  const rows = isHtml ? htmlRows(text) : csvRows(text);
  const a = scan(rows, opts.serverTime, false);
  const b = isHtml ? scan(rows, opts.serverTime, true) : a;
  const best = b.drafts.length > a.drafts.length ? b : a;
  const plain = isHtml ? cleanText(text.replace(/<\/t[dh]>/gi, ' ')) : text;
  const login = (opts.login?.trim() || /Account:?\s*(\d{3,})/i.exec(plain)?.[1] || null)?.replace(/\D/g, '') || null;
  const currency = /Currency:?\s*([A-Z]{3})\b/.exec(plain)?.[1] ?? /Account:?\s*\d{3,}\s*\(\s*([A-Z]{3})\b/.exec(plain)?.[1] ?? null;
  const contract = inferContractSizes(best.drafts);
  const warnings: string[] = [];
  if (!login) warnings.push('شمارهٔ حساب در فایل پیدا نشد؛ آن را دستی وارد کنید تا ورود دوباره تکراری نسازد.');
  if (currency && currency !== 'USD') warnings.push(`ارز حساب ${currency} است؛ سود و کارمزد به همین ارز می‌آید و با حساب‌های دلاری جمع می‌شود.`);
  const unknown = Object.entries(contract).filter(([, v]) => v === null).map(([s]) => s);
  if (unknown.length) warnings.push(`اندازهٔ قرارداد ${unknown.join('، ')} از فایل معلوم نشد (ارز دوم نماد با ارز حساب فرق دارد یا معامله کم است)؛ ارزش اسمی و ریسک دلاری این نمادها تقریبی است.`);
  const id = login ?? 'unknown';
  const trades: MtTrade[] = best.drafts.map((d) => ({ ...d, id: `jt:${id}.${d.ticket}`.slice(0, 120), login: id, contractSize: contract[d.symbol] ?? null, currency }));
  return { format: isHtml ? best.format : 'csv', login, currency, trades: [...new Map(trades.map((t) => [t.id, t])).values()], skipped: best.skipped, contract, warnings };
}

/* ---------------- تبدیل به معاملهٔ ژورنال ---------------- */

export const mtAccountKey = (login: string) => accountKey('metatrader', login);

export function mtToTrade(m: MtTrade): Trade {
  const account = mtAccountKey(m.login);
  const units = m.lots * (m.contractSize ?? 1);
  return {
    id: `${account}:${m.ticket}`,
    account,
    venue: venueOfKey(account) ?? 'metatrader',
    symbol: m.symbol,
    base: baseOf(m.symbol),
    direction: m.direction,
    openTime: m.openTime,
    closeTime: m.closeTime,
    open: false,
    truncated: false,
    entryPx: m.entryPx,
    exitPx: m.exitPx,
    maxSize: units,
    maxNotional: units * m.entryPx,
    volume: units * (m.entryPx + m.exitPx),
    grossPnl: m.profit,
    fees: -m.commission,
    funding: m.swap,
    netPnl: m.profit + m.commission + m.swap,
    fills: 2,
    liquidated: false
  };
}
