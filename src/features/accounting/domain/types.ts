/** ============================================================
 * حسابداری — انواع پایه (Single Source of Truth دامنه)
 * ثبت دوطرفه (Double-Entry) + دفتر کل + FIFO + ممیزی
 * ============================================================ */

/** نوع حساب — سمت عادی مانده را تعیین می‌کند */
export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

/** نمودار حساب‌ها */
export interface Account {
  key: string;
  nameFa: string;
  type: AccountType;
}

/** یک طرف از سند حسابداری */
export interface JournalLine {
  account: string;
  /** بدهکار (واحد دلار) */
  debit: number;
  /** بستانکار (واحد دلار) */
  credit: number;
}

/** سند حسابداری — غیرقابل تغییر (Immutable) */
export interface JournalEntry {
  /** شناسه ترتیبی (افزایشی) */
  id: number;
  /** تاریخ سند (timestamp — ساعت ۱۲ محلی) */
  date: number;
  /** شرح */
  memo: string;
  lines: JournalLine[];
  /** زمان ثبت */
  createdAt: number;
  /** منبع: deposit | withdraw | expense | buy | sell | manual | reversal */
  source: string;
  /** اگر سند معکوس است: شناسه سند اصلی */
  reversesId?: number;
}

/** لات FIFO — باقیمانده هر خرید */
export interface FifoLot {
  id: number;
  /** نماد دارایی (مثل BTC) */
  asset: string;
  qty: number;
  /** قیمت واحد (دلار) — مبنای بهای تمام‌شده */
  unitCost: number;
  /** تاریخ باز شدن لات */
  openedAt: number;
  /** تاریخ بسته شدن کامل لات (پس از فروش) */
  closedAt?: number;
}

/** رویداد ممیزی — فقط‌افزودنی (Append-Only) */
export interface LedgerEvent {
  id: number;
  at: number;
  kind: string;
  refId: number;
  detail: string;
}

/** مانده هر حساب در دفتر کل */
export interface AccountBalance {
  account: Account;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

/** نگهداری (پوزیشن) یک رمزارز */
export interface Holding {
  symbol: string;
  qty: number;
  avgCost: number;
  costBasis: number;
}

/** استیبل‌کوینی که معادل موجودی نقد است (نگهداری نمادین از Cash Balance) */
export const CASH_STABLECOIN_SYMBOL = 'USDT';
export const CASH_STABLECOINS = ['USDT', 'USDC', 'DAI'] as const;

/** آیا نماد یک استیبل‌کوین نقدی است؟ */
export function isCashStablecoin(symbol: string): boolean {
  const up = symbol.toUpperCase();
  return (CASH_STABLECOINS as readonly string[]).includes(up);
}

/** مقصدهای مجاز انتقال وجه (خروج سرمایه از پرتفوی) */
export type CashDestination = 'expense' | 'bank';

/** کلید حساب هر مقصد */
export const DESTINATION_ACCOUNT: Record<CashDestination, string> = {
  expense: 'expense:living',
  bank: 'bank:checking'
};

/** نام فارسی هر مقصد */
export const DESTINATION_NAME_FA: Record<CashDestination, string> = {
  expense: 'صندوق مخارج (هزینه‌های زندگی)',
  bank: 'حساب بانکی'
};

/** حساب‌های پیش‌فرض نمودار حساب‌ها */
export const DEFAULT_ACCOUNTS: Account[] = [
  { key: 'cash:usd', nameFa: 'نقد (دلار / USDT-USDC)', type: 'asset' },
  { key: 'bank:checking', nameFa: 'حساب بانکی', type: 'asset' },
  { key: 'equity:capital', nameFa: 'سرمایه', type: 'equity' },
  { key: 'income:trade', nameFa: 'سود/زیان معاملات', type: 'income' },
  { key: 'expense:living', nameFa: 'صندوق مخارج (هزینه‌های زندگی)', type: 'expense' },
  { key: 'expense:fee', nameFa: 'کارمزد', type: 'expense' },
  { key: 'expense:misc', nameFa: 'سایر هزینه‌ها', type: 'expense' }
];

/** نام فارسی حساب رمزارز */
export const cryptoAccountKey = (symbol: string) => `crypto:${symbol.toUpperCase()}`;
export const cryptoAccountName = (symbol: string) => `رمزارز ${symbol.toUpperCase()}`;

/** نام فارسی هر حساب (از نمودار یا داینامیک) */
export function accountNameFa(key: string, accounts: Account[]): string {
  const a = accounts.find((x) => x.key === key);
  if (a) return a.nameFa;
  const m = key.match(/^crypto:(.+)$/);
  if (m) return cryptoAccountName(m[1]);
  return key;
}
