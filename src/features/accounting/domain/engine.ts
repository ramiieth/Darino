/** ============================================================
 * موتور حسابداری — توابع خالص (تست‌پذیر)
 *  - اعتبارسنجی سند دوطرفه (بدهکار = بستانکار)
 *  - محاسبه دفتر کل (مانده هر حساب)
 *  - ساخت سند معکوس (Reversal) — بدون تغییر سند تاریخی
 *  - FIFO Cost Basis (مصرف لات‌ها هنگام فروش)
 *  - سازنده‌های سند خرید/فروش/واریز
 * ============================================================ */
import type {
  Account,
  AccountBalance,
  FifoLot,
  JournalEntry,
  JournalLine
} from './types';
import { cryptoAccountKey } from './types';

/** تلورانس اعشاری برای مقایسه بدهکار/بستانکار */
export const EPS = 1e-6;

/** اعتبارسنجی سند دوطرفه */
export function validateEntry(lines: JournalLine[]): { ok: boolean; error?: string } {
  if (lines.length < 2) return { ok: false, error: 'سند باید حداقل دو طرف داشته باشد' };
  for (const l of lines) {
    if (!l.account) return { ok: false, error: 'حساب نامعتبر است' };
    if (l.debit < 0 || l.credit < 0) return { ok: false, error: 'مبالغ نمی‌توانند منفی باشند' };
    if (l.debit === 0 && l.credit === 0) return { ok: false, error: 'مبلغ صفر مجاز نیست' };
  }
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(d - c) > EPS) {
    return {
      ok: false,
      error: `بدهکار و بستانکار متوازن نیستند (${d.toFixed(2)} ≠ ${c.toFixed(2)})`
    };
  }
  return { ok: true };
}

/** جمع بدهکار یک سند */
export function entryTotal(entry: JournalEntry): number {
  return entry.lines.reduce((s, l) => s + l.debit, 0);
}

/** سمت عادی هر نوع حساب: دارایی/هزینه → بدهکار؛ بقیه → بستانکار */
export function normalSide(type: Account['type']): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

/**
 * محاسبه دفتر کل: برای هر حساب مجموع بدهکار، بستانکار و مانده.
 * مانده = بدهکار − بستانکار (برای دارایی/هزینه) و برعکس برای بقیه.
 * سند معکوس در محاسبه لحاظ می‌شود (مانند هر سند عادی).
 */
export function computeLedger(
  entries: JournalEntry[],
  accounts: Account[]
): AccountBalance[] {
  const totals = new Map<string, { d: number; c: number }>();
  for (const e of entries) {
    for (const l of e.lines) {
      const t = totals.get(l.account) ?? { d: 0, c: 0 };
      t.d += l.debit;
      t.c += l.credit;
      totals.set(l.account, t);
    }
  }
  const out: AccountBalance[] = [];
  for (const a of accounts) {
    const t = totals.get(a.key) ?? { d: 0, c: 0 };
    const balance =
      normalSide(a.type) === 'debit' ? t.d - t.c : t.c - t.d;
    out.push({ account: a, debitTotal: t.d, creditTotal: t.c, balance });
  }
  // حساب‌های داینامیک (رمزارزها) که در نمودار نیستند
  for (const [key, t] of totals) {
    if (accounts.some((a) => a.key === key)) continue;
    out.push({
      account: { key, nameFa: key, type: 'asset' },
      debitTotal: t.d,
      creditTotal: t.c,
      balance: t.d - t.c
    });
  }
  return out;
}

/** مانده یک حساب مشخص */
export function accountBalanceOf(
  entries: JournalEntry[],
  accounts: Account[],
  key: string
): number {
  const row = computeLedger(entries, accounts).find((r) => r.account.key === key);
  return row?.balance ?? 0;
}

/** ساخت سند معکوس — سند تاریخی دست نمی‌خورد؛ سند جدید با خطوط منفی */
export function buildReversal(
  entry: JournalEntry,
  date: number,
  memo?: string
): JournalEntry {
  return {
    id: -1, // پس از ذخیره جایگزین می‌شود
    date,
    memo: memo ?? `معکوس سند #${entry.id} — ${entry.memo}`,
    lines: entry.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })),
    createdAt: Date.now(),
    source: 'reversal',
    reversesId: entry.id
  };
}

/* ---------------- FIFO Cost Basis ---------------- */

export interface FifoConsumption {
  consumed: { lotId: number; qty: number; cost: number }[];
  costBasis: number;
  remaining: FifoLot[];
}

/**
 * مصرف لات‌ها به روش FIFO (اولین خرید، اولین فروش).
 * اگر موجودی کافی نباشد خطا می‌دهد.
 */
export function fifoConsume(lots: FifoLot[], sellQty: number): FifoConsumption {
  if (sellQty <= 0) throw new Error('مقدار فروش باید مثبت باشد');
  const open = lots.filter((l) => !l.closedAt).sort((a, b) => a.openedAt - b.openedAt);
  const available = open.reduce((s, l) => s + l.qty, 0);
  if (sellQty > available + EPS) {
    throw new Error(
      `موجودی کافی نیست (موجودی: ${available.toFixed(6)}، درخواست: ${sellQty.toFixed(6)})`
    );
  }
  let remainingQty = sellQty;
  const consumed: FifoConsumption['consumed'] = [];
  const remaining: FifoLot[] = [];
  for (const lot of open) {
    if (remainingQty <= EPS) {
      remaining.push(lot);
      continue;
    }
    const take = Math.min(lot.qty, remainingQty);
    consumed.push({ lotId: lot.id, qty: take, cost: take * lot.unitCost });
    remainingQty -= take;
    if (lot.qty - take > EPS) {
      remaining.push({ ...lot, qty: lot.qty - take });
    }
  }
  const costBasis = consumed.reduce((s, c) => s + c.cost, 0);
  return { consumed, costBasis, remaining };
}

/** لات‌های باز یک دارایی */
export function openLotsOf(lots: FifoLot[], asset: string): FifoLot[] {
  return lots.filter((l) => l.asset === asset && !l.closedAt);
}

/** میانگین بهای تمام‌شده یک دارایی (لات‌های باز) */
export function avgCostOf(lots: FifoLot[], asset: string): { qty: number; avg: number; basis: number } {
  const open = openLotsOf(lots, asset);
  const qty = open.reduce((s, l) => s + l.qty, 0);
  const basis = open.reduce((s, l) => s + l.qty * l.unitCost, 0);
  return { qty, avg: qty > 0 ? basis / qty : 0, basis };
}

/* ---------------- سازنده‌های سند ---------------- */

export interface BuyInput {
  symbol: string;
  qty: number;
  unitPrice: number;
  fee: number;
  date: number;
  memo?: string;
}

/** سند خرید رمزارز: دارایی رمزارز بدهکار، نقد بستانکار، کارمزد هزینه */
export function makeBuyEntry(input: BuyInput): JournalEntry {
  const sym = input.symbol.toUpperCase();
  const gross = input.qty * input.unitPrice;
  return {
    id: -1,
    date: input.date,
    memo: input.memo ?? `خرید ${sym}`,
    lines: [
      { account: cryptoAccountKey(sym), debit: gross, credit: 0 },
      { account: 'cash:usd', debit: 0, credit: gross + input.fee },
      ...(input.fee > 0 ? [{ account: 'expense:fee', debit: input.fee, credit: 0 }] : [])
    ],
    createdAt: Date.now(),
    source: 'buy'
  };
}

export interface SellInput extends BuyInput {
  lots: FifoLot[];
}

export interface SellResult {
  entry: JournalEntry;
  fifo: FifoConsumption;
  realized: number;
}

/** سند فروش رمزارز (FIFO): نقد بدهکار، دارایی بستانکار (بهای تمام‌شده)، سود/زیان تحقق‌یافته */
export function makeSellEntry(input: SellInput): SellResult {
  const sym = input.symbol.toUpperCase();
  const proceeds = input.qty * input.unitPrice;
  // فقط لات‌های همین دارایی (باز) — FIFO بین دارایی‌های مختلف مصرف نمی‌شود
  const assetLots = input.lots.filter((l) => l.asset === sym && !l.closedAt);
  const fifoResult = fifoConsume(assetLots, input.qty);
  const costBasis = fifoResult.costBasis;
  const realized = proceeds - costBasis;
  const lines: JournalLine[] = [
    { account: 'cash:usd', debit: proceeds, credit: 0 },
    { account: cryptoAccountKey(sym), debit: 0, credit: costBasis },
    {
      account: 'income:trade',
      debit: realized < 0 ? -realized : 0,
      credit: realized >= 0 ? realized : 0
    }
  ];
  if (input.fee > 0) {
    lines.push({ account: 'expense:fee', debit: input.fee, credit: 0 });
    lines.push({ account: 'cash:usd', debit: 0, credit: input.fee });
  }
  return {
    entry: {
      id: -1,
      date: input.date,
      memo: input.memo ?? `فروش ${sym}`,
      lines,
      createdAt: Date.now(),
      source: 'sell'
    },
    fifo: fifoResult,
    realized
  };
}

/** سند واریز دارایی رمزارز (Deposit Asset):
 *  فقط ورود موجودی — بدون FIFO، بدون سود/زیان، بدون تغییر Cost Basis قبلی
 *  افزایش دارایی (بدهکار) در برابر افزایش سرمایه (بستانکار)
 */
export function makeDepositAssetEntry(
  symbol: string,
  valueUsd: number,
  date: number,
  memo?: string
): JournalEntry {
  const sym = symbol.toUpperCase();
  return {
    id: -1,
    date,
    memo: memo ?? `واریز ${sym}`,
    lines: [
      { account: cryptoAccountKey(sym), debit: valueUsd, credit: 0 },
      { account: 'equity:capital', debit: 0, credit: valueUsd }
    ],
    createdAt: Date.now(),
    source: 'deposit'
  };
}

/** سند واریز نقدی: نقد بدهکار، سرمایه بستانکار */
export function makeDepositEntry(usd: number, date: number, memo?: string): JournalEntry {
  return {
    id: -1,
    date,
    memo: memo ?? 'واریز وجه نقد',
    lines: [
      { account: 'cash:usd', debit: usd, credit: 0 },
      { account: 'equity:capital', debit: 0, credit: usd }
    ],
    createdAt: Date.now(),
    source: 'deposit'
  };
}

/** سند انتقال نقد به مقصد (صندوق مخارج / حساب بانکی):
 *  خروج سرمایه از پرتفوی — مقصد بدهکار، نقد بستانکار
 */
export function makeCashToDestinationEntry(
  destKey: string,
  usd: number,
  date: number,
  memo?: string
): JournalEntry {
  return {
    id: -1,
    date,
    memo: memo ?? 'انتقال وجه به مقصد (خروج سرمایه از پرتفوی)',
    lines: [
      { account: destKey, debit: usd, credit: 0 },
      { account: 'cash:usd', debit: 0, credit: usd }
    ],
    createdAt: Date.now(),
    source: 'cash-out'
  };
}

/**
 * سند فروش رمزارز به مقصد (صندوق مخارج / حساب بانکی):
 *  عواید مستقیماً از پرتفوی خارج می‌شود (به نقد برنمی‌گردد)
 *  - مقصد بدهکار (عواید − کارمزد)، رمزارز بستانکار (بهای تمام‌شده FIFO)
 *  - سود/زیان تحقق‌یافته → حساب درآمد
 */
export function makeSellToDestinationEntry(
  input: BuyInput & { lots: FifoLot[]; destKey: string }
): SellResult {
  const sym = input.symbol.toUpperCase();
  const proceeds = input.qty * input.unitPrice;
  const assetLots = input.lots.filter((l) => l.asset === sym && !l.closedAt);
  const fifoResult = fifoConsume(assetLots, input.qty);
  const costBasis = fifoResult.costBasis;
  const realized = proceeds - costBasis;
  const lines: JournalLine[] = [
    { account: input.destKey, debit: Math.max(0, proceeds - (input.fee ?? 0)), credit: 0 },
    { account: cryptoAccountKey(sym), debit: 0, credit: costBasis },
    {
      account: 'income:trade',
      debit: realized < 0 ? -realized : 0,
      credit: realized >= 0 ? realized : 0
    }
  ];
  if (input.fee > 0) {
    lines.push({ account: 'expense:fee', debit: input.fee, credit: 0 });
  }
  return {
    entry: {
      id: -1,
      date: input.date,
      memo: input.memo ?? `فروش ${sym} برای مخارج`,
      lines,
      createdAt: Date.now(),
      source: 'sell-out'
    },
    fifo: fifoResult,
    realized
  };
}

/** سند فروش استیبل‌کوین (USDT/USDC = معادل نقد) به مقصد مخارج:
 *  - نقد (استیبل‌کوین) بستانکار = بهای تمام‌شده (تعداد × ۱ دلار)
 *  - مقصد بدهکار = عواید − کارمزد
 *  - سود/زیان تحقق‌یافته نسبت به بهای ۱ دلار → حساب درآمد
 */
export function makeStablecoinSellEntry(input: {
  destKey: string;
  qty: number;
  unitPrice: number;
  fee: number;
  date: number;
  memo?: string;
}): JournalEntry {
  const proceeds = input.qty * input.unitPrice;
  const costBasis = input.qty; // بهای تمام‌شده = ۱ دلار به ازای هر واحد
  const realized = proceeds - costBasis;
  const lines: JournalLine[] = [
    { account: input.destKey, debit: Math.max(0, proceeds - input.fee), credit: 0 },
    { account: 'cash:usd', debit: 0, credit: costBasis }
  ];
  // خط درآمد فقط وقتی سود/زیان غیرصفر است (قیمت ≠ ۱)
  if (Math.abs(realized) > EPS) {
    lines.push({
      account: 'income:trade',
      debit: realized < 0 ? -realized : 0,
      credit: realized >= 0 ? realized : 0
    });
  }
  if (input.fee > 0) {
    lines.push({ account: 'expense:fee', debit: input.fee, credit: 0 });
  }
  return {
    id: -1,
    date: input.date,
    memo: input.memo ?? 'فروش استیبل‌کوین برای مخارج',
    lines,
    createdAt: Date.now(),
    source: 'sell-out'
  };
}

/** سند برداشت نقدی: سرمایه بدهکار، نقد بستانکار */
export function makeWithdrawEntry(usd: number, date: number, memo?: string): JournalEntry {
  return {
    id: -1,
    date,
    memo: memo ?? 'برداشت وجه نقد',
    lines: [
      { account: 'equity:capital', debit: usd, credit: 0 },
      { account: 'cash:usd', debit: 0, credit: usd }
    ],
    createdAt: Date.now(),
    source: 'withdraw'
  };
}

/** سند هزینه: حساب هزینه بدهکار، نقد بستانکار */
export function makeExpenseEntry(
  usd: number,
  date: number,
  account = 'expense:misc',
  memo?: string
): JournalEntry {
  return {
    id: -1,
    date,
    memo: memo ?? 'ثبت هزینه',
    lines: [
      { account, debit: usd, credit: 0 },
      { account: 'cash:usd', debit: 0, credit: usd }
    ],
    createdAt: Date.now(),
    source: 'expense'
  };
}
