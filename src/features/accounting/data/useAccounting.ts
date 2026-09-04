/** ============================================================
 * هوک حسابداری — لایه orchestration بین UI و موتور/دیتابیس
 * اقدامات: واریز، برداشت، هزینه، خرید/فروش رمزارز، سند دستی، معکوس
 * همه اقدامات فقط‌افزودنی هستند (Immutability) و رویداد ممیزی ثبت می‌کنند
 * ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// همگام‌سازی پس‌زمینه با Neon (فقط وقتی سرور متصل است؛ در تست/آفلاین بی‌اثر)
import {
  pushAccountingToRemote,
  syncAccountingWithRemote
} from '@/repositories/accountingRepository';
import {
  accountEnsure,
  accountLoadAll,
  entryAppend,
  entryAppendMany,
  entryLoadAll,
  eventAppend,
  eventLoadAll,
  lotAppend,
  lotLoadAll,
  lotReplaceAll
} from '@/features/accounting/data/db';
import { settingGet, settingSet } from '@/shared/lib/db';
import {
  accountBalanceOf,
  avgCostOf,
  buildReversal,
  computeLedger,
  makeBuyEntry,
  makeCashToDestinationEntry,
  makeDepositAssetEntry,
  makeDepositEntry,
  makeExpenseEntry,
  makeSellEntry,
  makeWithdrawEntry,
  validateEntry,
  type BuyInput
} from '@/features/accounting/domain/engine';
import {
  DEFAULT_ACCOUNTS,
  DESTINATION_ACCOUNT,
  DESTINATION_NAME_FA,
  CASH_STABLECOIN_SYMBOL,
  isCashStablecoin,
  cryptoAccountKey,
  cryptoAccountName,
  type Account,
  type AccountBalance,
  type CashDestination,
  type FifoLot,
  type Holding,
  type JournalEntry,
  type JournalLine,
  type LedgerEvent
} from '@/features/accounting/domain/types';
import { ETH_POSITION } from '@/features/simulation/domain/constants';
import { toast } from '@/shared/store/toastStore';

/** seed سینگلتون — همه نمونه‌ها منتظر همان عملیات واقعی می‌مانند
 *  (رفع race در StrictMode: قبلاً نمونه دوم قبل از اتمام seed، خالی reload می‌کرد)
 */
let seedPromise: Promise<void> | null = null;

const SEED_KEY = 'acc:seeded';

/** ثبت افتتاحیه: نقد ۲۳٬۱۲۶ (USDC) + لات اولیه ETH (۳.۳۳ @ ۲٬۸۲۰) */
/** seed سینگلتون — همه نمونه‌ها منتظر همان عملیات واقعی می‌مانند
 *  (رفع race در StrictMode: قبلاً نمونه دوم قبل از اتمام seed، خالی reload می‌کرد)
 */
function seedOpening(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        // خودترمیمی: اگر سندها موجودند، seed لازم نیست (حتی اگر پرچم باشد)
        const existing = await entryLoadAll();
        if (existing.length > 0) return;
        // پرچم هست ولی سندها نیستند → از دست رفتن داده → بازسازی افتتاحیه
        const now = Date.now();
        // ۱) نقد (تخصیص USDC کاربر)
        const cashEntry = makeDepositEntry(ETH_POSITION.USDC_ALLOCATION_2026, now, 'افتتاحیه — موجودی نقد (USDC)');
        cashEntry.source = 'opening';
        // ۲) لات اولیه ETH با قیمت خرید
        const ethEntry: JournalEntry = {
          id: -1,
          date: now,
          memo: 'افتتاحیه — پوزیشن اولیه ETH',
          lines: [
            { account: cryptoAccountKey('ETH'), debit: ETH_POSITION.INITIAL_INVESTMENT, credit: 0 },
            { account: 'equity:capital', debit: 0, credit: ETH_POSITION.INITIAL_INVESTMENT }
          ],
          createdAt: now,
          source: 'opening'
        };
        const saved = await entryAppendMany([cashEntry, ethEntry]);
        await lotAppend({
          id: -1,
          asset: 'ETH',
          qty: ETH_POSITION.AMOUNT,
          unitCost: ETH_POSITION.BUY_PRICE,
          openedAt: now
        });
        await accountEnsure({ key: cryptoAccountKey('ETH'), nameFa: cryptoAccountName('ETH'), type: 'asset' });
        for (const e of saved) {
          await eventAppend('opening', e.id, `${e.memo} — $${e.lines[0].debit.toFixed(2)}`);
        }
        await settingSet(SEED_KEY, true);
      } catch {
        /* seed در دسترس نبود — کاربر از صفر شروع می‌کند */
      }
    })().finally(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

export interface AccountingState {
  entries: JournalEntry[];
  accounts: Account[];
  lots: FifoLot[];
  events: LedgerEvent[];
  loading: boolean;
  /** مانده نقد */
  cashBalance: number;
  ledger: AccountBalance[];
  /** نگهداری‌های رمزارز */
  holdings: Holding[];
  /** سود/زیان تحقق‌یافته کل */
  realizedPnl: number;
}

export interface AccountingActions {
  refresh: () => Promise<void>;
  deposit: (usd: number, date: number, memo?: string) => Promise<boolean>;
  withdraw: (usd: number, date: number, memo?: string) => Promise<boolean>;
  expense: (usd: number, date: number, account: string, memo?: string) => Promise<boolean>;
  buyCrypto: (input: BuyInput) => Promise<boolean>;
  sellCrypto: (
    input: BuyInput & { lots: FifoLot[] }
  ) => Promise<boolean>;
  addManual: (lines: JournalLine[], date: number, memo: string) => Promise<boolean>;
  reverse: (entry: JournalEntry, date?: number) => Promise<boolean>;
  /** برداشت از موجودی نقد به مقصد (صندوق مخارج / حساب بانکی) — خروج سرمایه از پرتفوی
   *  فقط انتقال نقدی؛ بدون FIFO، بدون Realized P&L، بدون فروش دارایی */
  withdrawCashTo: (dest: CashDestination, usd: number, date: number, memo?: string) => Promise<boolean>;
  /** واریز دارایی (Deposit Asset) — فقط ورود موجودی:
   *  بدون FIFO/سود/زیان؛ افزایش دارایی + ثبت سند استاندارد + لات بهای تمام‌شده طبق منطق موجود */
  depositAsset: (input: {
    symbol: string;
    qty: number;
    unitPrice: number;
    date: number;
    memo?: string;
  }) => Promise<boolean>;
}

export function useAccounting(): AccountingState & AccountingActions {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [lots, setLots] = useState<FifoLot[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [es, as, ls, evs] = await Promise.all([
      entryLoadAll(),
      accountLoadAll(),
      lotLoadAll(),
      eventLoadAll()
    ]);
    setEntries(es);
    setAccounts(as);
    setLots(ls);
    setEvents(evs);
    setLoading(false);
  }, []);

  // هر نمونه هوک مستقل بارگذاری می‌کند (seed آیدم‌پوتنت است؛ چند نمونه هم‌زمان امن است)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await seedOpening();
      if (cancelled) return;
      await reload();
      // Neon (SSOT): Record-Level Merge — اول Push محلی→Neon (سرور فقط missing را
      // insert می‌کند؛ هرگز overwrite) سپس Pull رکوردهای missing از Neon→محلی.
      // اگر رکوردی Pull شد → reload تا UI داده سرور را نشان دهد.
      void (async () => {
        const report = await syncAccountingWithRemote();
        const pulledAny = (report?.pulled.entries ?? 0) + (report?.pulled.lots ?? 0) + (report?.pulled.events ?? 0) > 0;
        if (pulledAny && !cancelled) await reload();
      })();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // push خودکار پس از هر تغییر (debounce — سرور فقط missing را insert می‌کند؛ بدون Duplicate)
  const firstDataRef = useRef(true);
  useEffect(() => {
    if (firstDataRef.current) {
      firstDataRef.current = false;
      return;
    }
    if (loading) return;
    if (entries.length === 0 && lots.length === 0 && events.length === 0) return;
    const t = setTimeout(() => {
      void pushAccountingToRemote();
    }, 3000);
    return () => clearTimeout(t);
  }, [entries, lots, events, loading]);

  const cashBalance = useMemo(
    () => accountBalanceOf(entries, accounts, 'cash:usd'),
    [entries, accounts]
  );

  const ledger = useMemo(() => computeLedger(entries, accounts), [entries, accounts]);

  const holdings = useMemo(() => {
    // لات‌های واقعی (استیبل‌کوین‌ها در لات نمی‌آیند — معادل نقدند)
    const symbols = [
      ...new Set(lots.filter((l) => !l.closedAt).map((l) => l.asset))
    ].filter((sym) => !isCashStablecoin(sym));
    const rows = symbols
      .map((sym) => {
        const { qty, avg, basis } = avgCostOf(lots, sym);
        return { symbol: sym, qty, avgCost: avg, costBasis: basis };
      })
      .filter((h) => h.qty > 0);
    // نگهداری نمادین استیبل‌کوین (USDT) = موجودی نقد — قانون: هر دارایی موجود نمایش داده شود
    if (cashBalance > 1e-6) {
      rows.unshift({
        symbol: CASH_STABLECOIN_SYMBOL,
        qty: cashBalance,
        avgCost: 1,
        costBasis: cashBalance
      });
    }
    return rows.sort((a, b) => b.costBasis - a.costBasis);
  }, [lots, cashBalance]);

  const realizedPnl = useMemo(() => {
    const row = ledger.find((r) => r.account.key === 'income:trade');
    return row?.balance ?? 0;
  }, [ledger]);

  /* ---------------- اقدامات ---------------- */

  const deposit = useCallback(
    async (usd: number, date: number, memo?: string) => {
      if (!Number.isFinite(usd) || usd <= 0) {
        toast('error', 'مبلغ واریز معتبر نیست');
        return false;
      }
      const e = makeDepositEntry(usd, date, memo);
      const saved = await entryAppend(e);
      await eventAppend('deposit', saved.id, `${saved.memo} — $${usd.toFixed(2)}`);
      await reload();
      toast('success', 'واریز ثبت شد');
      return true;
    },
    [reload]
  );

  const withdraw = useCallback(
    async (usd: number, date: number, memo?: string) => {
      if (!Number.isFinite(usd) || usd <= 0) {
        toast('error', 'مبلغ برداشت معتبر نیست');
        return false;
      }
      if (usd > cashBalance + 1e-6) {
        toast('error', `موجودی نقد کافی نیست (موجودی: $${cashBalance.toFixed(2)})`);
        return false;
      }
      const e = makeWithdrawEntry(usd, date, memo);
      const saved = await entryAppend(e);
      await eventAppend('withdraw', saved.id, `${saved.memo} — $${usd.toFixed(2)}`);
      await reload();
      toast('success', 'برداشت ثبت شد');
      return true;
    },
    [cashBalance, reload]
  );

  const expense = useCallback(
    async (usd: number, date: number, account: string, memo?: string) => {
      if (!Number.isFinite(usd) || usd <= 0) {
        toast('error', 'مبلغ هزینه معتبر نیست');
        return false;
      }
      if (usd > cashBalance + 1e-6) {
        toast('error', `موجودی نقد کافی نیست (موجودی: $${cashBalance.toFixed(2)})`);
        return false;
      }
      const e = makeExpenseEntry(usd, date, account, memo);
      const saved = await entryAppend(e);
      await eventAppend('expense', saved.id, `${saved.memo} — $${usd.toFixed(2)}`);
      await reload();
      toast('success', 'هزینه ثبت شد');
      return true;
    },
    [cashBalance, reload]
  );

  const buyCrypto = useCallback(
    async (input: BuyInput) => {
      if (
        !Number.isFinite(input.qty) ||
        input.qty <= 0 ||
        !Number.isFinite(input.unitPrice) ||
        input.unitPrice <= 0
      ) {
        toast('error', 'مقدار/قیمت خرید معتبر نیست');
        return false;
      }
      const total = input.qty * input.unitPrice + (input.fee ?? 0);
      if (total > cashBalance + 1e-6) {
        toast('error', `موجودی نقد کافی نیست (موجودی: $${cashBalance.toFixed(2)})`);
        return false;
      }
      const e = makeBuyEntry(input);
      const sym = input.symbol.toUpperCase();
      await accountEnsure({ key: cryptoAccountKey(sym), nameFa: cryptoAccountName(sym), type: 'asset' });
      const saved = await entryAppend(e);
      await lotAppend({
        id: -1,
        asset: sym,
        qty: input.qty,
        unitCost: input.unitPrice,
        openedAt: input.date
      });
      await eventAppend('buy', saved.id, `خرید ${sym} — ${input.qty} @ $${input.unitPrice}`);
      await reload();
      toast('success', `خرید ${sym} ثبت شد`);
      return true;
    },
    [cashBalance, reload]
  );

  const sellCrypto = useCallback(
    async (input: BuyInput & { lots: FifoLot[] }) => {
      if (
        !Number.isFinite(input.qty) ||
        input.qty <= 0 ||
        !Number.isFinite(input.unitPrice) ||
        input.unitPrice <= 0
      ) {
        toast('error', 'مقدار/قیمت فروش معتبر نیست');
        return false;
      }
      const open = input.lots.filter((l) => l.asset === input.symbol.toUpperCase() && !l.closedAt);
      const available = open.reduce((s, l) => s + l.qty, 0);
      if (input.qty > available + 1e-6) {
        toast('error', `موجودی ${input.symbol.toUpperCase()} کافی نیست`);
        return false;
      }
      const { entry, fifo, realized } = makeSellEntry(input);
      const saved = await entryAppend(entry);
      // بستن لات‌های مصرف‌شده
      const consumedIds = new Set(fifo.consumed.map((c) => c.lotId));
      const nextLots = input.lots.map((l) =>
        consumedIds.has(l.id) && !l.closedAt
          ? { ...l, qty: l.qty - (fifo.consumed.find((c) => c.lotId === l.id)?.qty ?? 0), closedAt: Date.now() }
          : l
      );
      await lotReplaceAll(nextLots);
      await eventAppend(
        'sell',
        saved.id,
        `فروش ${input.symbol.toUpperCase()} — ${input.qty} @ $${input.unitPrice} (سود/زیان: $${realized.toFixed(2)})`
      );
      await reload();
      toast('success', `فروش ثبت شد — سود/زیان تحقق‌یافته: $${realized.toFixed(2)}`);
      return true;
    },
    [reload]
  );

  const addManual = useCallback(
    async (lines: JournalLine[], date: number, memo: string) => {
      const v = validateEntry(lines);
      if (!v.ok) {
        toast('error', v.error ?? 'سند نامعتبر است');
        return false;
      }
      const e: JournalEntry = {
        id: -1,
        date,
        memo,
        lines,
        createdAt: Date.now(),
        source: 'manual'
      };
      const saved = await entryAppend(e);
      await eventAppend('manual', saved.id, `${memo} — ${lines.length} طرف`);
      await reload();
      toast('success', 'سند دستی ثبت شد');
      return true;
    },
    [reload]
  );

  const reverse = useCallback(
    async (entry: JournalEntry, date?: number) => {
      const r = buildReversal(entry, date ?? Date.now());
      const saved = await entryAppend(r);
      await eventAppend('reversal', saved.id, `معکوس سند #${entry.id} — ${entry.memo}`);
      await reload();
      toast('success', 'سند معکوس ثبت شد (سند اصلی دست‌نخورده ماند)');
      return true;
    },
    [reload]
  );

  /* ---------------- خروج سرمایه از پرتفوی (مخارج زندگی) ---------------- */

  const withdrawCashTo = useCallback(
    async (dest: CashDestination, usd: number, date: number, memo?: string) => {
      if (!Number.isFinite(usd) || usd <= 0) {
        toast('error', 'مبلغ برداشت معتبر نیست');
        return false;
      }
      if (usd > cashBalance + 1e-6) {
        toast('error', `موجودی نقد کافی نیست (موجودی: $${cashBalance.toFixed(2)})`);
        return false;
      }
      const destKey = DESTINATION_ACCOUNT[dest];
      const e = makeCashToDestinationEntry(
        destKey,
        usd,
        date,
        memo ?? `انتقال به ${DESTINATION_NAME_FA[dest]}`
      );
      const saved = await entryAppend(e);
      await eventAppend(
        'cash-out',
        saved.id,
        `${saved.memo} — $${usd.toFixed(2)} (خروج سرمایه از پرتفوی)`
      );
      await reload();
      toast('success', `برداشت به ${DESTINATION_NAME_FA[dest]} ثبت شد`);
      return true;
    },
    [cashBalance, reload]
  );

  /* ---------------- واریز دارایی (Deposit Asset) ---------------- */

  const depositAsset = useCallback(
    async (input: { symbol: string; qty: number; unitPrice: number; date: number; memo?: string }) => {
      const sym = input.symbol.toUpperCase();
      if (
        !Number.isFinite(input.qty) ||
        input.qty <= 0 ||
        !Number.isFinite(input.unitPrice) ||
        input.unitPrice <= 0
      ) {
        toast('error', 'مقدار/قیمت دارایی معتبر نیست');
        return false;
      }
      const value = input.qty * input.unitPrice;
      try {
        if (isCashStablecoin(sym)) {
          // استیبل‌کوین = نقد → واریز نقدی استاندارد
          const entry = makeDepositEntry(value, input.date, input.memo ?? `واریز ${sym}`);
          const saved = await entryAppend(entry);
          await eventAppend(
            'deposit',
            saved.id,
            `واریز ${sym} — ${input.qty} @ $${input.unitPrice.toFixed(4)} = $${value.toFixed(2)}`
          );
        } else {
          // رمزارز → سند استاندارد واریز دارایی + لات بهای تمام‌شده (منطق موجود پروژه)
          await accountEnsure({
            key: cryptoAccountKey(sym),
            nameFa: cryptoAccountName(sym),
            type: 'asset'
          });
          const entry = makeDepositAssetEntry(sym, value, input.date, input.memo ?? `واریز ${sym}`);
          const saved = await entryAppend(entry);
          await lotAppend({
            id: -1,
            asset: sym,
            qty: input.qty,
            unitCost: input.unitPrice,
            openedAt: input.date
          });
          await eventAppend(
            'deposit',
            saved.id,
            `واریز ${sym} — ${input.qty} @ $${input.unitPrice.toFixed(4)} = $${value.toFixed(2)}`
          );
        }
        await reload();
        toast('success', `واریز ${sym} ثبت شد`);
        return true;
      } catch {
        toast('error', 'خطا در ثبت واریز');
        return false;
      }
    },
    [reload]
  );

  return {
    entries,
    accounts,
    lots,
    events,
    loading,
    cashBalance,
    ledger,
    holdings,
    realizedPnl,
    refresh: reload,
    deposit,
    withdraw,
    expense,
    buyCrypto,
    sellCrypto,
    addManual,
    reverse,
    withdrawCashTo,
    depositAsset
  };
}
