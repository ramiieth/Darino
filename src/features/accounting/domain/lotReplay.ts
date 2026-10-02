/** ============================================================
 * بازسازی لات‌های FIFO + سندهای مشتق از عملیات دارایی چندشبکه‌ای
 *
 * چرا؟ قبلاً لات‌ها جدا ذخیره و پس از هر فروش روی همان دستگاه بازنویسی می‌شدند؛
 * با دو دستگاه (وب + آیفون) نسخه‌ها از هم فاصله می‌گرفتند. حالا:
 *
 *   لات‌ها = «مبنا» (لات‌های لحظهٔ مهاجرت، همگام در Neon)
 *          + بازپخش سندهای دارای trade (پس از مبنا) به ترتیب زمانی
 *          + بازپخش عملیات تکمیل‌شدهٔ دارایی چندشبکه‌ای
 *
 * همه چیز از داده‌های همگام‌شده محاسبه می‌شود → همهٔ دستگاه‌ها یک نتیجه می‌گیرند.
 *
 * عملیات دارایی چندشبکه‌ای → سند مشتق (ذخیره نمی‌شود؛ با ویرایش/باطل‌کردن عملیات اصلاح می‌شود):
 *   • سواپ / بریج همراه تبدیل: فروش داراییِ داده‌شده (سود/زیان FIFO) + خرید داراییِ گرفته‌شده
 *     با «ارزش دلاری عملیات» (ورود کاربر یا قیمت تاریخی با منبع).
 *   • نقد ↔ نقد (مثل تتر ← یو‌اس‌دی‌سی): سندی ندارد.
 *   • بریج / انتقال / سپرده / برداشت با همان دارایی: فقط جابه‌جایی؛ بهای تمام‌شده منتقل می‌شود،
 *     بدون سود/زیان. (اگر مقدار رسیده کمتر باشد، بهای کل روی مقدار جدید می‌نشیند.)
 *   • کارمزد «جداگانه» با ارزش دلاری: هزینه (و اگر با رمزارز پرداخت شده، واگذاری FIFO).
 *     کارمزد «داخل مقدار» سند جدا ندارد — در ارزش معامله لحاظ شده است (بدون دوباره‌شماری).
 *   • تعدیل موجودی: فقط اگر کاربر صراحتاً «ثبت در حسابداری» را زده باشد (افزایش = واریز).
 *   • بدون ارزش دلاری یا با لات ناکافی → ثبت نمی‌شود و در فهرست «در انتظار حسابداری» می‌آید.
 * ============================================================ */
import type { FifoLot, JournalEntry, JournalLine } from './types';
import { cryptoAccountKey } from './types';
import type { Asset, Fee, Operation } from '@/features/custody/domain/types';

export const EPS = 1e-9;

export interface LotBaseline {
  /** لات‌های باز در لحظهٔ مهاجرت */
  lots: FifoLot[];
  /** سندهای با شناسهٔ کوچک‌تر/مساوی این، اثرشان روی لات‌ها در مبنا هست */
  asOfEntryId: number;
  createdAt: number;
  /** دستگاه سازنده (برچسب) */
  source: string;
}

export type PendingReason = 'needs_value' | 'incomplete' | 'insufficient_lots' | 'fee_needs_value' | 'fee_insufficient_lots' | 'unknown_asset';

export const PENDING_TEXT: Record<PendingReason, string> = {
  needs_value: 'ارزش دلاری عملیات وارد نشده — برای حساب‌کردن در حسابداری لازم است',
  incomplete: 'مقدار یکی از دو سمت نامعلوم است',
  insufficient_lots: 'موجودی این دارایی در حسابداری کافی نیست (قیمت خرید نامعلوم) — ابتدا خرید یا پوزیشن اولیه را ثبت کنید',
  fee_needs_value: 'ارزش دلاری کارمزد جداگانه ثبت نشده',
  fee_insufficient_lots: 'موجودی داراییِ پرداخت کارمزد در حسابداری کافی نیست',
  unknown_asset: 'دارایی ناشناخته است'
};

export interface PendingOp {
  operationId: string;
  reason: PendingReason;
}

export interface ReplayResult {
  lots: FifoLot[];
  derived: JournalEntry[];
  pending: PendingOp[];
  /** عملیاتی که با موفقیت سند گرفتند */
  posted: string[];
}

/** استیبل‌کوین‌های دلاری = حساب نقد (cash:usd) — هم‌راستا با منطق موجود حسابداری */
const USD_CASH_SYMBOLS = new Set(['USDT', 'USD₮0', 'USDT0', 'USDC', 'USDG', 'DAI']);

export type LedgerSide = { cash: true } | { cash: false; symbol: string };

export function ledgerSideOf(asset: Asset | undefined): LedgerSide | null {
  if (!asset) return null;
  // وثیقهٔ داخل پلتفرم (آرکوس) دلاری است → نقد
  if (asset.platformId) return { cash: true };
  const sym = asset.symbol.toUpperCase();
  if (USD_CASH_SYMBOLS.has(asset.symbol) || USD_CASH_SYMBOLS.has(sym)) return { cash: true };
  return { cash: false, symbol: sym };
}

/* ---------------- دفتر لات (قابل‌تغییر فقط داخل بازپخش) ---------------- */

class LotBook {
  private lots: FifoLot[];
  private seq = 0;
  constructor(base: FifoLot[]) {
    this.lots = base.filter((l) => !l.closedAt && l.qty > EPS).map((l) => ({ ...l }));
  }
  available(symbol: string): number {
    return this.lots.filter((l) => l.asset === symbol && !l.closedAt).reduce((s, l) => s + l.qty, 0);
  }
  add(symbol: string, qty: number, unitCost: number, at: number): void {
    if (!(qty > EPS)) return;
    // شناسهٔ قطعی (نه تصادفی) تا همهٔ دستگاه‌ها لات یکسان بسازند
    this.lots.push({ id: -(++this.seq), asset: symbol, qty, unitCost, openedAt: at });
  }
  /** مصرف FIFO — null اگر موجودی کافی نیست (چیزی تغییر نمی‌کند) */
  consume(symbol: string, qty: number, at: number): number | null {
    if (!(qty > EPS)) return 0;
    if (qty > this.available(symbol) + 1e-6) return null;
    let left = qty;
    let basis = 0;
    const open = this.lots.filter((l) => l.asset === symbol && !l.closedAt).sort((a, b) => a.openedAt - b.openedAt || a.id - b.id);
    for (const lot of open) {
      if (left <= EPS) break;
      const take = Math.min(lot.qty, left);
      basis += take * lot.unitCost;
      lot.qty -= take;
      left -= take;
      if (lot.qty <= EPS) {
        lot.qty = 0;
        lot.closedAt = at;
      }
    }
    return basis;
  }
  snapshot(): FifoLot[] {
    return this.lots.map((l) => ({ ...l }));
  }
}

/* ---------------- رویدادهای بازپخش ---------------- */

type ReplayItem = { at: number; order: string; entry?: JournalEntry; op?: Operation };

/** شناسهٔ منفی و قطعی برای سند مشتق (برای کلید React و جلوگیری از تداخل با سندهای واقعی) */
function derivedId(opId: string, n: number): number {
  let h = 0;
  for (let i = 0; i < opId.length; i++) h = (h * 31 + opId.charCodeAt(i)) >>> 0;
  return -((h % 1_000_000_000) * 10 + n + 1);
}

const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function feeValue(fee: Fee): number | null {
  return num((fee as Fee & { usdValue?: string | null }).usdValue ?? null);
}

export function replayLedger(input: {
  baseline: LotBaseline | null;
  entries: JournalEntry[];
  ops?: Operation[];
  assets?: Map<string, Asset>;
  /** نام فارسی دارایی برای شرح سند */
  nameOf?: (assetId: string) => string;
}): ReplayResult {
  const asOf = input.baseline?.asOfEntryId ?? 0;
  const book = new LotBook(input.baseline?.lots ?? []);
  const derived: JournalEntry[] = [];
  const pending: PendingOp[] = [];
  const posted: string[] = [];
  const nameOf = input.nameOf ?? ((id: string) => input.assets?.get(id)?.name ?? id);

  const reversed = new Set(input.entries.filter((e) => e.reversesId !== undefined).map((e) => e.reversesId!));
  const items: ReplayItem[] = [];
  for (const e of input.entries) {
    if (!e.trade || e.id <= asOf || reversed.has(e.id) || e.derivedFrom) continue;
    items.push({ at: e.date, order: `e:${String(e.id).padStart(20, '0')}`, entry: e });
  }
  for (const op of input.ops ?? []) {
    if (op.voidedAt) continue;
    if (op.status !== 'completed' && !(op.status === 'failed' && op.fees.some((f) => f.treatment === 'separate'))) continue;
    items.push({ at: op.occurredAt ?? op.createdAt, order: `o:${op.id}`, op });
  }
  items.sort((a, b) => a.at - b.at || (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  for (const it of items) {
    if (it.entry) {
      const t = it.entry.trade!;
      const sym = t.symbol.toUpperCase();
      if (t.kind === 'buy' || t.kind === 'deposit_asset') book.add(sym, t.qty, t.unitPrice, it.at);
      else book.consume(sym, t.qty, it.at);
      continue;
    }
    const op = it.op!;
    const lines: JournalLine[] = [];
    let memo = '';
    let opPending: PendingReason | null = null;

    if (op.status === 'completed') {
      const fa = op.from.assetId ? input.assets?.get(op.from.assetId) : undefined;
      const ta = op.to.assetId ? input.assets?.get(op.to.assetId) : undefined;
      const from = ledgerSideOf(fa);
      const to = ledgerSideOf(ta);
      const qa = num(op.from.amount);
      const qb = num(op.to.amount);
      const value = num(op.valuation?.usdValue ?? null);

      if (op.kind === 'balance_adjustment') {
        const posting = (op as Operation & { ledgerPosting?: 'none' | 'opening' }).ledgerPosting;
        if (posting === 'opening' && op.to.assetId) {
          if (!to) opPending = 'unknown_asset';
          else if (value === null) opPending = 'needs_value';
          else if (qb === null) opPending = 'incomplete';
          else {
            memo = `موجودی اولیهٔ ${nameOf(op.to.assetId)} (از دارایی چندشبکه‌ای)`;
            lines.push({ account: to.cash ? 'cash:usd' : cryptoAccountKey(to.symbol), debit: value, credit: 0 }, { account: 'equity:capital', debit: 0, credit: value });
            if (!to.cash) book.add(to.symbol, qb, value / qb, it.at);
          }
        }
      } else if (op.kind === 'swap' || op.kind === 'bridge_swap' || (from && to && from.cash !== to.cash)) {
        // تبدیل: یک سمت نقد و سمت دیگر رمزارز، یا دو رمزارز متفاوت
        if (!from || !to) opPending = 'unknown_asset';
        else if (from.cash && to.cash) {
          /* نقد ← نقد: بدون سند */
        } else if (qa === null || qb === null) opPending = 'incomplete';
        else if (!from.cash && !to.cash && from.symbol === to.symbol) {
          // همان دارایی (مثلاً اتریوم ← اتریوم روی شبکهٔ دیگر): انتقال بهای تمام‌شده
          const basis = book.consume(from.symbol, qa, it.at);
          if (basis === null) opPending = 'insufficient_lots';
          else book.add(to.symbol, qb, basis / qb, it.at);
        } else if (value === null) opPending = 'needs_value';
        else {
          let basis = 0;
          if (!from.cash) {
            const b = book.consume(from.symbol, qa, it.at);
            if (b === null) opPending = 'insufficient_lots';
            else basis = b;
          }
          if (!opPending) {
            memo = `${op.kind === 'bridge_swap' ? 'بریج و تبدیل' : 'سواپ'} ${nameOf(op.from.assetId!)} ← ${nameOf(op.to.assetId!)} (از دارایی چندشبکه‌ای)`;
            lines.push({ account: to.cash ? 'cash:usd' : cryptoAccountKey(to.symbol), debit: value, credit: 0 });
            if (from.cash) {
              lines.push({ account: 'cash:usd', debit: 0, credit: value });
            } else {
              lines.push({ account: cryptoAccountKey(from.symbol), debit: 0, credit: basis });
              const pnl = value - basis;
              if (Math.abs(pnl) > EPS) lines.push({ account: 'income:trade', debit: pnl < 0 ? -pnl : 0, credit: pnl > 0 ? pnl : 0 });
            }
            if (!to.cash) book.add(to.symbol, qb, value / qb, it.at);
          }
        }
      } else if (from && to && !from.cash && !to.cash && from.symbol === to.symbol && qa !== null) {
        // جابه‌جایی همان دارایی (بریج، انتقال داخلی، سپرده، برداشت): انتقال بهای تمام‌شده
        const qIn = qb ?? qa;
        if (Math.abs(qIn - qa) > EPS) {
          const basis = book.consume(from.symbol, qa, it.at);
          if (basis === null) opPending = 'insufficient_lots';
          else book.add(to.symbol, qIn, basis / qIn, it.at);
        }
      }
    }

    // کارمزدهای جداگانه — فقط یک‌بار
    for (const fee of op.fees) {
      if (fee.treatment !== 'separate' || !fee.assetId || !fee.amount) continue;
      if (op.status === 'failed' && fee.kind !== 'network') continue;
      const side = ledgerSideOf(input.assets?.get(fee.assetId));
      const fv = feeValue(fee);
      const fq = num(fee.amount);
      if (!side || fq === null) continue;
      if (fv === null) {
        pending.push({ operationId: op.id, reason: 'fee_needs_value' });
        continue;
      }
      if (side.cash) {
        lines.push({ account: 'expense:fee', debit: fv, credit: 0 }, { account: 'cash:usd', debit: 0, credit: fv });
      } else {
        const basis = book.consume(side.symbol, fq, it.at);
        if (basis === null) {
          pending.push({ operationId: op.id, reason: 'fee_insufficient_lots' });
          continue;
        }
        lines.push({ account: 'expense:fee', debit: fv, credit: 0 }, { account: cryptoAccountKey(side.symbol), debit: 0, credit: basis });
        const pnl = fv - basis;
        if (Math.abs(pnl) > EPS) lines.push({ account: 'income:trade', debit: pnl < 0 ? -pnl : 0, credit: pnl > 0 ? pnl : 0 });
      }
      if (!memo) memo = `کارمزد ${nameOf(fee.assetId)} (از دارایی چندشبکه‌ای)`;
    }

    if (opPending) pending.push({ operationId: op.id, reason: opPending });
    if (lines.length > 0) {
      derived.push({
        id: derivedId(op.id, derived.length),
        date: it.at,
        memo,
        lines,
        createdAt: op.updatedAt,
        source: 'custody',
        derivedFrom: { kind: 'custody', operationId: op.id }
      });
      posted.push(op.id);
    }
  }

  return { lots: book.snapshot(), derived, pending, posted };
}

/** هزینهٔ تمام‌شدهٔ لات‌های باز هر نماد — برای تطبیق با ماندهٔ حساب رمزارز در دفتر کل */
export function lotBasisBySymbol(lots: FifoLot[]): Map<string, { qty: number; basis: number }> {
  const m = new Map<string, { qty: number; basis: number }>();
  for (const l of lots) {
    if (l.closedAt || l.qty <= EPS) continue;
    const r = m.get(l.asset) ?? { qty: 0, basis: 0 };
    r.qty += l.qty;
    r.basis += l.qty * l.unitCost;
    m.set(l.asset, r);
  }
  return m;
}
