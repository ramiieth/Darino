/**
 * تست‌ها — موتور حسابداری: سند دوطرفه، دفتر کل، معکوس، FIFO، خرید/فروش
 */
import { describe, expect, it } from 'vitest';
import {
  validateEntry,
  computeLedger,
  accountBalanceOf,
  buildReversal,
  fifoConsume,
  avgCostOf,
  makeBuyEntry,
  makeSellEntry,
  makeCashToDestinationEntry,
  makeSellToDestinationEntry,
  makeStablecoinSellEntry,
  makeDepositAssetEntry,
  makeDepositEntry,
  makeWithdrawEntry,
  makeExpenseEntry,
  entryTotal,
  EPS
} from '@/features/accounting/domain/engine';
import { DESTINATION_ACCOUNT } from '@/features/accounting/domain/types';
import { DEFAULT_ACCOUNTS, type FifoLot, type JournalEntry } from '@/features/accounting/domain/types';

const T = 1_780_000_000_000;

describe('validateEntry — سند دوطرفه', () => {
  it('سند متوازن معتبر است', () => {
    expect(
      validateEntry([
        { account: 'cash:usd', debit: 100, credit: 0 },
        { account: 'equity:capital', debit: 0, credit: 100 }
      ]).ok
    ).toBe(true);
  });

  it('بدهکار ≠ بستانکار → نامعتبر', () => {
    const r = validateEntry([
      { account: 'cash:usd', debit: 100, credit: 0 },
      { account: 'equity:capital', debit: 0, credit: 90 }
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('متوازن');
  });

  it('کمتر از دو طرف → نامعتبر', () => {
    expect(validateEntry([{ account: 'cash:usd', debit: 10, credit: 0 }]).ok).toBe(false);
  });

  it('مبلغ منفی → نامعتبر', () => {
    expect(
      validateEntry([
        { account: 'cash:usd', debit: -5, credit: 0 },
        { account: 'equity:capital', debit: 0, credit: 5 }
      ]).ok
    ).toBe(false);
  });

  it('تلورانس اعشاری پذیرفته است', () => {
    expect(
      validateEntry([
        { account: 'cash:usd', debit: 0.1 + 0.2, credit: 0 },
        { account: 'equity:capital', debit: 0, credit: 0.3 }
      ]).ok
    ).toBe(true);
  });
});

describe('computeLedger — دفتر کل', () => {
  it('مانده نقد، سرمایه و هزینه درست محاسبه می‌شود', () => {
    const entries: JournalEntry[] = [
      makeDepositEntry(1000, T),
      makeExpenseEntry(200, T, 'expense:misc'),
      makeExpenseEntry(50, T, 'expense:fee')
    ];
    const rows = computeLedger(entries, DEFAULT_ACCOUNTS);
    const cash = rows.find((r) => r.account.key === 'cash:usd')!;
    const capital = rows.find((r) => r.account.key === 'equity:capital')!;
    const misc = rows.find((r) => r.account.key === 'expense:misc')!;
    expect(cash.balance).toBeCloseTo(750, 6); // 1000 - 200 - 50
    expect(capital.balance).toBeCloseTo(1000, 6);
    expect(misc.balance).toBeCloseTo(200, 6);
  });

  it('سند معکوس مانده را برمی‌گرداند', () => {
    const deposit = makeDepositEntry(500, T);
    const reversal = buildReversal(deposit, T + 1);
    const rows = computeLedger([deposit, reversal], DEFAULT_ACCOUNTS);
    const cash = rows.find((r) => r.account.key === 'cash:usd')!;
    expect(cash.balance).toBeCloseTo(0, 6);
  });

  it('accountBalanceOf مانده یک حساب را می‌دهد', () => {
    const entries = [makeDepositEntry(300, T)];
    expect(accountBalanceOf(entries, DEFAULT_ACCOUNTS, 'cash:usd')).toBeCloseTo(300, 6);
    expect(accountBalanceOf([], DEFAULT_ACCOUNTS, 'cash:usd')).toBe(0);
  });
});

describe('buildReversal — سند معکوس (بدون تغییر سند تاریخی)', () => {
  it('خطوط منفی معکوس می‌شوند و به سند اصلی ارجاع دارد', () => {
    const e = makeDepositEntry(100, T, 'واریز');
    const r = buildReversal(e, T + 1);
    expect(r.reversesId).toBe(e.id);
    expect(r.source).toBe('reversal');
    expect(r.lines[0]).toEqual({ account: 'cash:usd', debit: 0, credit: 100 });
    expect(r.lines[1]).toEqual({ account: 'equity:capital', debit: 100, credit: 0 });
    expect(validateEntry(r.lines).ok).toBe(true);
  });

  it('سند اصلی دست نمی‌خورد', () => {
    const e = makeDepositEntry(100, T);
    const before = JSON.stringify(e);
    buildReversal(e, T + 1);
    expect(JSON.stringify(e)).toBe(before);
  });
});

describe('FIFO Cost Basis', () => {
  const lots: FifoLot[] = [
    { id: 1, asset: 'BTC', qty: 1, unitCost: 60_000, openedAt: T },
    { id: 2, asset: 'BTC', qty: 2, unitCost: 70_000, openedAt: T + 1 }
  ];

  it('فروش از قدیمی‌ترین لات مصرف می‌کند', () => {
    const r = fifoConsume(lots, 1.5);
    expect(r.consumed).toHaveLength(2);
    expect(r.consumed[0]).toEqual({ lotId: 1, qty: 1, cost: 60_000 });
    expect(r.consumed[1].qty).toBeCloseTo(0.5, 6);
    expect(r.costBasis).toBeCloseTo(95_000, 6); // 60000 + 0.5*70000
    // لات اول بسته، لات دوم ۱.۵ باقی
    expect(r.remaining[0].qty).toBeCloseTo(1.5, 6);
  });

  it('موجودی کافی نباشد → خطا', () => {
    expect(() => fifoConsume(lots, 3.5)).toThrow('موجودی کافی نیست');
  });

  it('avgCostOf میانگین وزنی می‌دهد', () => {
    const a = avgCostOf(lots, 'BTC');
    expect(a.qty).toBeCloseTo(3, 6);
    expect(a.avg).toBeCloseTo((60_000 + 140_000) / 3, 6);
    expect(a.basis).toBeCloseTo(200_000, 6);
  });

  it('لات‌های بسته در مصرف لحاظ نمی‌شوند', () => {
    const closed: FifoLot[] = [{ id: 9, asset: 'BTC', qty: 5, unitCost: 1, openedAt: 0, closedAt: T }];
    expect(() => fifoConsume(closed, 1)).toThrow('موجودی کافی نیست');
  });
});

describe('سازنده‌های سند خرید/فروش', () => {
  it('خرید: دارایی بدهکار، نقد بستانکار، کارمزد هزینه — متوازن', () => {
    const e = makeBuyEntry({ symbol: 'ETH', qty: 2, unitPrice: 3000, fee: 10, date: T });
    expect(e.source).toBe('buy');
    expect(entryTotal(e)).toBeCloseTo(6010, 6);
    expect(validateEntry(e.lines).ok).toBe(true);
    expect(e.lines.find((l) => l.account === 'crypto:ETH')!.debit).toBeCloseTo(6000, 6);
    expect(e.lines.find((l) => l.account === 'cash:usd')!.credit).toBeCloseTo(6010, 6);
  });

  it('فروش سودده: سود به حساب درآمد می‌رود', () => {
    const lots: FifoLot[] = [{ id: 1, asset: 'ETH', qty: 2, unitCost: 3000, openedAt: T }];
    const r = makeSellEntry({ symbol: 'ETH', qty: 1, unitPrice: 4000, fee: 5, date: T + 1, lots });
    expect(r.realized).toBeCloseTo(1000, 6);
    const income = r.entry.lines.find((l) => l.account === 'income:trade')!;
    expect(income.credit).toBeCloseTo(1000, 6);
    expect(validateEntry(r.entry.lines).ok).toBe(true);
  });

  it('فروش فقط لات‌های همان دارایی را مصرف می‌کند (لات ETH دخالت نمی‌کند)', () => {
    // لات‌های چند دارایی — FIFO نباید بین دارایی‌ها مخلوط شود
    const lots: FifoLot[] = [
      { id: 1, asset: 'ETH', qty: 3.33, unitCost: 2820, openedAt: T }, // قدیمی‌تر
      { id: 2, asset: 'SOL', qty: 2, unitCost: 150, openedAt: T + 10 }
    ];
    const r = makeSellEntry({ symbol: 'SOL', qty: 1, unitPrice: 200, fee: 0, date: T + 20, lots });
    expect(r.fifo.costBasis).toBeCloseTo(150, 6); // بهای تمام‌شده لات SOL، نه ETH
    expect(r.realized).toBeCloseTo(50, 6);
    const solLine = r.entry.lines.find((l) => l.account === 'crypto:SOL')!;
    expect(solLine.credit).toBeCloseTo(150, 6);
  });

  it('خرید بدون کارمزد، خط صفر ایجاد نمی‌کند', () => {
    const e = makeBuyEntry({ symbol: 'BTC', qty: 1, unitPrice: 60_000, fee: 0, date: T });
    expect(e.lines).toHaveLength(2);
    expect(validateEntry(e.lines).ok).toBe(true);
  });

  it('فروش زیان‌ده: زیان به بدهکار درآمد می‌رود', () => {
    const lots: FifoLot[] = [{ id: 1, asset: 'ETH', qty: 1, unitCost: 4000, openedAt: T }];
    const r = makeSellEntry({ symbol: 'ETH', qty: 1, unitPrice: 3000, fee: 0, date: T + 1, lots });
    expect(r.realized).toBeCloseTo(-1000, 6);
    const income = r.entry.lines.find((l) => l.account === 'income:trade')!;
    expect(income.debit).toBeCloseTo(1000, 6);
    expect(validateEntry(r.entry.lines).ok).toBe(true);
  });

  it('برداشت با موجودی کم در موتور اعتبارسنجی نمی‌شود (فقط در لایه داده)', () => {
    const e = makeWithdrawEntry(100, T);
    expect(validateEntry(e.lines).ok).toBe(true); // سند متوازن است؛ مانده در لایه هوک بررسی می‌شود
  });

  it('دقت اعشاری: EPS کوچک‌تر از خطای شناور است', () => {
    expect(0.1 + 0.2 - 0.3).toBeLessThan(EPS);
  });
});

describe('انتقال وجه به مقصد (خروج سرمایه از پرتفوی)', () => {
  const EXP = DESTINATION_ACCOUNT.expense; // صندوق مخارج
  const BANK = DESTINATION_ACCOUNT.bank; // حساب بانکی

  it('برداشت از نقد به صندوق مخارج: مقصد بدهکار، نقد بستانکار — متوازن', () => {
    const e = makeCashToDestinationEntry(EXP, 5000, T, 'هزینه زندگی');
    expect(e.source).toBe('cash-out');
    expect(e.lines.find((l) => l.account === EXP)!.debit).toBeCloseTo(5000, 6);
    expect(e.lines.find((l) => l.account === 'cash:usd')!.credit).toBeCloseTo(5000, 6);
    expect(validateEntry(e.lines).ok).toBe(true);
  });

  it('برداشت به حساب بانکی: انتقال بین دو دارایی (نقد کم می‌شود)', () => {
    const e = makeCashToDestinationEntry(BANK, 1000, T);
    expect(e.lines.find((l) => l.account === BANK)!.debit).toBeCloseTo(1000, 6);
    expect(validateEntry(e.lines).ok).toBe(true);
  });

  it('فروش سودده به مقصد: عواید به نقد برنمی‌گردد — مستقیم به مقصد می‌رود', () => {
    const lots: FifoLot[] = [{ id: 1, asset: 'ETH', qty: 2, unitCost: 3000, openedAt: T }];
    const r = makeSellToDestinationEntry({
      symbol: 'ETH',
      qty: 1,
      unitPrice: 4000,
      fee: 5,
      date: T + 1,
      lots,
      destKey: EXP
    });
    expect(r.entry.source).toBe('sell-out');
    expect(r.realized).toBeCloseTo(1000, 6);
    // مقصد: عواید − کارمزد
    expect(r.entry.lines.find((l) => l.account === EXP)!.debit).toBeCloseTo(3995, 6);
    expect(r.entry.lines.find((l) => l.account === 'crypto:ETH')!.credit).toBeCloseTo(3000, 6);
    expect(r.entry.lines.find((l) => l.account === 'income:trade')!.credit).toBeCloseTo(1000, 6);
    expect(r.entry.lines.find((l) => l.account === 'expense:fee')!.debit).toBeCloseTo(5, 6);
    expect(validateEntry(r.entry.lines).ok).toBe(true);
    // هیچ خط نقدی وجود ندارد
    expect(r.entry.lines.some((l) => l.account === 'cash:usd')).toBe(false);
  });

  it('فروش زیان‌ده به مقصد: زیان به بدهکار درآمد می‌رود — متوازن', () => {
    const lots: FifoLot[] = [{ id: 1, asset: 'BTC', qty: 1, unitCost: 100_000, openedAt: T }];
    const r = makeSellToDestinationEntry({
      symbol: 'BTC',
      qty: 0.5,
      unitPrice: 80_000,
      fee: 0,
      date: T + 1,
      lots,
      destKey: BANK
    });
    expect(r.realized).toBeCloseTo(-10_000, 6);
    expect(r.entry.lines.find((l) => l.account === BANK)!.debit).toBeCloseTo(40_000, 6);
    expect(r.entry.lines.find((l) => l.account === 'income:trade')!.debit).toBeCloseTo(10_000, 6);
    expect(validateEntry(r.entry.lines).ok).toBe(true);
  });

  it('فروش فقط لات همان دارایی را مصرف می‌کند', () => {
    const lots: FifoLot[] = [
      { id: 1, asset: 'ETH', qty: 3, unitCost: 2800, openedAt: T },
      { id: 2, asset: 'SOL', qty: 2, unitCost: 150, openedAt: T + 1 }
    ];
    const r = makeSellToDestinationEntry({
      symbol: 'SOL',
      qty: 1,
      unitPrice: 200,
      fee: 0,
      date: T + 2,
      lots,
      destKey: EXP
    });
    expect(r.fifo.costBasis).toBeCloseTo(150, 6);
    expect(r.realized).toBeCloseTo(50, 6);
  });
});

describe('سند واریز دارایی (Deposit Asset)', () => {
  it('واریز ۲ ETH @ ۳٬۰۰۰: دارایی بدهکار ۶٬۰۰۰، سرمایه بستانکار ۶٬۰۰۰ — متوازن', () => {
    const e = makeDepositAssetEntry('ETH', 6000, T, 'واریز ETH');
    expect(e.source).toBe('deposit');
    expect(validateEntry(e.lines).ok).toBe(true);
    expect(e.lines.find((l) => l.account === 'crypto:ETH')!.debit).toBeCloseTo(6000, 6);
    expect(e.lines.find((l) => l.account === 'equity:capital')!.credit).toBeCloseTo(6000, 6);
    // بدون خط FIFO / درآمد / نقد
    expect(e.lines.some((l) => l.account === 'income:trade')).toBe(false);
    expect(e.lines.some((l) => l.account === 'cash:usd')).toBe(false);
  });

  it('واریز فقط دارایی را افزایش می‌دهد — سرمایه هم افزایش می‌یابد (خنثی در تراز)', () => {
    const e = makeDepositAssetEntry('BTC', 50_000, T);
    const rows = computeLedger([e], DEFAULT_ACCOUNTS);
    const btc = rows.find((r) => r.account.key === 'crypto:BTC')!;
    const capital = rows.find((r) => r.account.key === 'equity:capital')!;
    expect(btc.balance).toBeCloseTo(50_000, 6);
    expect(capital.balance).toBeCloseTo(50_000, 6);
  });
});

describe('سند فروش استیبل‌کوین (USDT = معادل نقد)', () => {
  it('فروش ۵۰۰۰ USDT @ ۱.۰۰: مقصد ۵۰۰۰، نقد بستانکار ۵۰۰۰، بدون سود/زیان — متوازن', () => {
    const e = makeStablecoinSellEntry({
      destKey: DESTINATION_ACCOUNT.expense,
      qty: 5000,
      unitPrice: 1,
      fee: 0,
      date: T
    });
    expect(e.source).toBe('sell-out');
    expect(validateEntry(e.lines).ok).toBe(true);
    expect(e.lines.find((l) => l.account === DESTINATION_ACCOUNT.expense)!.debit).toBeCloseTo(5000, 6);
    expect(e.lines.find((l) => l.account === 'cash:usd')!.credit).toBeCloseTo(5000, 6);
    // سود/زیان صفر → خط درآمد وجود ندارد (سند فقط ۲ طرف دارد)
    const income = e.lines.find((l) => l.account === 'income:trade');
    expect(income).toBeUndefined();
  });

  it('فروش با قیمت ≠ ۱: سود/زیان تحقق‌یافته ثبت می‌شود — متوازن', () => {
    const e = makeStablecoinSellEntry({
      destKey: DESTINATION_ACCOUNT.bank,
      qty: 1000,
      unitPrice: 1.005,
      fee: 0,
      date: T
    });
    expect(validateEntry(e.lines).ok).toBe(true);
    expect(e.lines.find((l) => l.account === 'income:trade')!.credit).toBeCloseTo(5, 6);
    // قیمت زیر ۱ → زیان
    const e2 = makeStablecoinSellEntry({
      destKey: DESTINATION_ACCOUNT.bank,
      qty: 1000,
      unitPrice: 0.995,
      fee: 0,
      date: T
    });
    expect(validateEntry(e2.lines).ok).toBe(true);
    expect(e2.lines.find((l) => l.account === 'income:trade')!.debit).toBeCloseTo(5, 6);
  });

  it('با کارمزد: مقصد = عواید − کارمزد و خط کارمزد — متوازن', () => {
    const e = makeStablecoinSellEntry({
      destKey: DESTINATION_ACCOUNT.expense,
      qty: 1000,
      unitPrice: 1,
      fee: 5,
      date: T
    });
    expect(validateEntry(e.lines).ok).toBe(true);
    expect(e.lines.find((l) => l.account === DESTINATION_ACCOUNT.expense)!.debit).toBeCloseTo(995, 6);
    expect(e.lines.find((l) => l.account === 'expense:fee')!.debit).toBeCloseTo(5, 6);
    expect(e.lines.find((l) => l.account === 'cash:usd')!.credit).toBeCloseTo(1000, 6);
  });
});
