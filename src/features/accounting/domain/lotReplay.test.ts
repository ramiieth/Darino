/** بازسازی لات‌ها و سندهای مشتق — دادهٔ مصنوعی */
import { describe, expect, it } from 'vitest';
import { ASSETS, arcusCollateralAsset } from '@/features/custody/domain/catalog';
import { emptyOperation } from '@/features/custody/domain/ledger';
import type { Fee, Operation } from '@/features/custody/domain/types';
import { computeLedger, makeBuyEntry, makeSellEntry } from './engine';
import { lotBasisBySymbol, replayLedger, type LotBaseline } from './lotReplay';
import { DEFAULT_ACCOUNTS, type FifoLot, type JournalEntry } from './types';

const T = 1_800_000_000_000;
const assets = new Map([...ASSETS, arcusCollateralAsset('mainnet')].map((a) => [a.id, a]));
const ETH_ARB = 'arbitrum:native';
const ETH_BASE = 'base:native';
const USDC_ARB = 'arbitrum:0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const USDT_ETH = 'ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7';
const POL = 'polygon:native';

const baseline = (lots: Partial<FifoLot>[], asOf = 100): LotBaseline => ({
  lots: lots.map((l, i) => ({ id: i + 1, asset: 'ETH', qty: 1, unitCost: 1000, openedAt: T - 1e6 + i, ...l })),
  asOfEntryId: asOf,
  createdAt: T,
  source: 'test'
});

function op(p: Partial<Operation> & Pick<Operation, 'kind'>, at = T): Operation {
  return { ...emptyOperation(p.kind, at), occurredAt: at, ...p };
}
const fee = (f: Partial<Fee>): Fee => ({ id: 'f', kind: 'network', amount: null, assetId: null, holdingId: 'w', treatment: 'separate', verification: 'user_reported', ...f });
const bal = (entries: JournalEntry[], key: string) => computeLedger(entries, DEFAULT_ACCOUNTS).find((r) => r.account.key === key)?.balance ?? 0;

describe('بازپخش سندها (چنددستگاهی)', () => {
  it('لات‌ها از مبنا + سندهای دارای trade ساخته می‌شوند؛ سندهای قبل از مبنا دوباره اعمال نمی‌شوند', () => {
    const old = { ...makeBuyEntry({ symbol: 'ETH', qty: 5, unitPrice: 1, fee: 0, date: T - 10 }), id: 50 };
    const buy = { ...makeBuyEntry({ symbol: 'ETH', qty: 2, unitPrice: 2000, fee: 0, date: T + 1 }), id: 200 };
    const r = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1000 }]), entries: [old, buy] });
    expect(lotBasisBySymbol(r.lots).get('ETH')).toEqual({ qty: 3, basis: 5000 });
  });

  it('فروش FIFO از قدیمی‌ترین لات و نتیجهٔ مستقل از ترتیب ورود داده', () => {
    const sell = { ...makeSellEntry({ symbol: 'ETH', qty: 1.5, unitPrice: 3000, fee: 0, date: T + 2, lots: [{ id: 1, asset: 'ETH', qty: 3, unitCost: 1000, openedAt: T }] }).entry, id: 300 };
    const buy = { ...makeBuyEntry({ symbol: 'ETH', qty: 2, unitPrice: 2000, fee: 0, date: T + 1 }), id: 200 };
    const a = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1000 }]), entries: [buy, sell] });
    const b = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1000 }]), entries: [sell, buy] });
    expect(lotBasisBySymbol(a.lots).get('ETH')).toEqual({ qty: 1.5, basis: 3000 });
    expect(a.lots).toEqual(b.lots);
  });

  it('سند معکوس‌شده در لات‌ها اثری ندارد', () => {
    const buy = { ...makeBuyEntry({ symbol: 'ETH', qty: 2, unitPrice: 2000, fee: 0, date: T + 1 }), id: 200 };
    const rev: JournalEntry = { id: 201, date: T + 2, memo: 'r', lines: [], createdAt: T, source: 'reversal', reversesId: 200 };
    const r = replayLedger({ baseline: baseline([]), entries: [buy, rev] });
    expect(r.lots.filter((l) => !l.closedAt)).toHaveLength(0);
  });
});

describe('سواپ و بریج ← دفتر کل', () => {
  it('سواپ اتریوم ← یو‌اس‌دی‌سی: فروش FIFO با سود تحقق‌یافته؛ نقد به ارزش دلاری عملیات', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '2995' }, valuation: { usdValue: '3000', source: 'کاربر', at: T } });
    const r = replayLedger({ baseline: baseline([{ qty: 2, unitCost: 1000 }]), entries: [], ops: [o], assets });
    expect(r.posted).toEqual([o.id]);
    expect(bal(r.derived, 'cash:usd')).toBe(3000);
    expect(bal(r.derived, 'income:trade')).toBe(2000);
    expect(bal(r.derived, 'crypto:ETH')).toBe(-1000);
    expect(lotBasisBySymbol(r.lots).get('ETH')).toEqual({ qty: 1, basis: 1000 });
    expect(r.derived[0].derivedFrom?.operationId).toBe(o.id);
    expect(r.derived[0].id).toBeLessThan(0);
  });

  it('سواپ تتر ← اتریوم: خرید با ارزش عملیات و لات جدید', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w', assetId: USDT_ETH, amount: '500' }, to: { holdingId: 'w', assetId: 'ethereum:native', amount: '0.25' }, valuation: { usdValue: '500', source: 'کاربر', at: T } });
    const r = replayLedger({ baseline: null, entries: [], ops: [o], assets });
    expect(bal(r.derived, 'cash:usd')).toBe(-500);
    expect(lotBasisBySymbol(r.lots).get('ETH')).toEqual({ qty: 0.25, basis: 500 });
    expect(r.lots[0].unitCost).toBe(2000);
  });

  it('تتر ← یو‌اس‌دی‌سی (نقد به نقد): بدون سند', () => {
    const o = op({ kind: 'bridge_swap', from: { holdingId: 'w', assetId: USDT_ETH, amount: '100' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '99.9' } });
    const r = replayLedger({ baseline: null, entries: [], ops: [o], assets });
    expect(r.derived).toHaveLength(0);
    expect(r.pending).toHaveLength(0);
  });

  it('بریج اتریوم آربیتروم ← بیس: بدون سود/زیان؛ بهای تمام‌شده منتقل می‌شود', () => {
    const o = op({ kind: 'bridge', from: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, to: { holdingId: 'w', assetId: ETH_BASE, amount: '0.998' } });
    const r = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1500 }]), entries: [], ops: [o], assets });
    expect(r.derived).toHaveLength(0);
    const eth = lotBasisBySymbol(r.lots).get('ETH')!;
    expect(eth.qty).toBeCloseTo(0.998, 12);
    expect(eth.basis).toBeCloseTo(1500, 9);
  });

  it('اتریوم ← پالیگان (دو رمزارز): واگذاری FIFO + خرید با یک ارزش', () => {
    const o = op({ kind: 'bridge_swap', from: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, to: { holdingId: 'w', assetId: POL, amount: '10000' }, valuation: { usdValue: '2500', source: 'کاربر', at: T } });
    const r = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 2000 }]), entries: [], ops: [o], assets });
    expect(bal(r.derived, 'income:trade')).toBe(500);
    expect(lotBasisBySymbol(r.lots).get('POL')).toEqual({ qty: 10000, basis: 2500 });
  });

  it('کارمزد جداگانه با اتریوم: هزینه به ارزش بازار و واگذاری FIFO (یک‌بار)', () => {
    const o = op({ kind: 'bridge', from: { holdingId: 'w', assetId: USDC_ARB, amount: '50' }, to: { holdingId: 'w', assetId: 'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', amount: '50' }, fees: [fee({ assetId: ETH_ARB, amount: '0.001', usdValue: '3' })] });
    const r = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1000 }]), entries: [], ops: [o], assets });
    expect(bal(r.derived, 'expense:fee')).toBe(3);
    expect(bal(r.derived, 'income:trade')).toBeCloseTo(2, 9);
    expect(lotBasisBySymbol(r.lots).get('ETH')!.qty).toBeCloseTo(0.999, 12);
  });

  it('کارمزد داخل مقدار دریافتی سند جدا ندارد (بدون دوباره‌شماری)', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '2990' }, valuation: { usdValue: '2990', source: 'کاربر', at: T }, fees: [fee({ assetId: USDC_ARB, amount: '10', usdValue: '10', treatment: 'netted_in_received' })] });
    const r = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1000 }]), entries: [], ops: [o], assets });
    expect(bal(r.derived, 'expense:fee')).toBe(0);
    expect(bal(r.derived, 'cash:usd')).toBe(2990);
  });

  it('سپرده در آرکوس (نقد ← وثیقه): بدون سند', () => {
    const o = op({ kind: 'platform_deposit', from: { holdingId: 'w', assetId: 'robinhood:0x5fc5360d0400a0fd4f2af552add042d716f1d168', amount: '100' }, to: { holdingId: 'a', assetId: 'platform:arcus:mainnet:collateral', amount: '99.5' } });
    const r = replayLedger({ baseline: null, entries: [], ops: [o], assets });
    expect(r.derived).toHaveLength(0);
    expect(r.pending).toHaveLength(0);
  });
});

describe('در انتظار حسابداری — هیچ عددی حدس زده نمی‌شود', () => {
  it('بدون ارزش دلاری → ثبت نمی‌شود', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '3000' } });
    const r = replayLedger({ baseline: baseline([{ qty: 1 }]), entries: [], ops: [o], assets });
    expect(r.derived).toHaveLength(0);
    expect(r.pending).toEqual([{ operationId: o.id, reason: 'needs_value' }]);
    expect(lotBasisBySymbol(r.lots).get('ETH')!.qty).toBe(1);
  });

  it('لات ناکافی → ثبت نمی‌شود و لات‌ها دست نمی‌خورند', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w', assetId: ETH_ARB, amount: '5' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '15000' }, valuation: { usdValue: '15000', source: 'کاربر', at: T } });
    const r = replayLedger({ baseline: baseline([{ qty: 1 }]), entries: [], ops: [o], assets });
    expect(r.pending[0].reason).toBe('insufficient_lots');
    expect(lotBasisBySymbol(r.lots).get('ETH')!.qty).toBe(1);
  });

  it('عملیات در جریان، باطل‌شده یا ناموفق سند اصلی نمی‌سازد', () => {
    const v = { usdValue: '3000', source: 'کاربر', at: T };
    const base = { from: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '3000' }, valuation: v };
    const r = replayLedger({
      baseline: baseline([{ qty: 1 }]),
      entries: [],
      ops: [op({ kind: 'swap', status: 'pending', ...base }), op({ kind: 'swap', status: 'failed', ...base }), op({ kind: 'swap', voidedAt: T, ...base })],
      assets
    });
    expect(r.derived).toHaveLength(0);
  });

  it('تعدیل موجودی فقط با انتخاب صریح «ثبت در حسابداری» سند می‌گیرد', () => {
    const plain = op({ kind: 'balance_adjustment', to: { holdingId: 'w', assetId: ETH_ARB, amount: '1' }, valuation: { usdValue: '2000', source: 'کاربر', at: T } });
    const posted = { ...plain, id: 'p2', ledgerPosting: 'opening' as const };
    const r = replayLedger({ baseline: null, entries: [], ops: [plain, posted], assets });
    expect(r.derived).toHaveLength(1);
    expect(bal(r.derived, 'equity:capital')).toBe(2000);
    expect(lotBasisBySymbol(r.lots).get('ETH')).toEqual({ qty: 1, basis: 2000 });
  });

  it('سندهای مشتق متوازن‌اند (بدهکار = بستانکار)', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w', assetId: ETH_ARB, amount: '0.4' }, to: { holdingId: 'w', assetId: USDC_ARB, amount: '1234.5' }, valuation: { usdValue: '1234.5', source: 'کاربر', at: T }, fees: [fee({ assetId: ETH_ARB, amount: '0.0002', usdValue: '0.61' })] });
    const r = replayLedger({ baseline: baseline([{ qty: 1, unitCost: 1777.77 }]), entries: [], ops: [o], assets });
    for (const e of r.derived) {
      const d = e.lines.reduce((s, l) => s + l.debit, 0);
      const c = e.lines.reduce((s, l) => s + l.credit, 0);
      expect(d).toBeCloseTo(c, 9);
    }
  });
});

import { buildBaseline, mayAutoSeed } from '../data/lotBaseline';
import { newLedgerId } from './types';

describe('مهاجرت چنددستگاهی', () => {
  it('افتتاحیهٔ خودکار فقط وقتی سرور قطعاً خالی است یا حالت محلی', () => {
    expect(mayAutoSeed(0, 'empty')).toBe(true);
    expect(mayAutoSeed(0, 'local_only')).toBe(true);
    expect(mayAutoSeed(0, 'has_data')).toBe(false);
    expect(mayAutoSeed(0, 'unknown')).toBe(false);
    expect(mayAutoSeed(3, 'empty')).toBe(false);
  });

  it('شناسه‌های جدید یکتا، صعودی و در محدودهٔ عدد صحیح امن', () => {
    const ids = Array.from({ length: 2000 }, () => newLedgerId(T));
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    expect(Number.isSafeInteger(newLedgerId(Date.UTC(2200, 0, 1)))).toBe(true);
  });

  it('مبنا: فقط لات‌های باز + بزرگ‌ترین شناسهٔ سند قدیمی (بدون trade)', () => {
    const legacy: JournalEntry = { id: 7, date: T, memo: 'x', lines: [], createdAt: T, source: 'manual' };
    const modern = { ...makeBuyEntry({ symbol: 'ETH', qty: 1, unitPrice: 1, fee: 0, date: T }), id: newLedgerId(T) };
    const b = buildBaseline(
      [
        { id: 1, asset: 'ETH', qty: 2, unitCost: 10, openedAt: T },
        { id: 2, asset: 'ETH', qty: 0, unitCost: 10, openedAt: T, closedAt: T }
      ],
      [legacy, modern],
      'test'
    );
    expect(b.lots).toHaveLength(1);
    expect(b.asOfEntryId).toBe(7);
  });

  it('سند جدیدِ ساخته‌شده روی دستگاه دیگر پس از مبنا، روی هر دو دستگاه همان لات را می‌سازد', () => {
    const base = baseline([{ qty: 1, unitCost: 1000 }], 7);
    const fromPhone = { ...makeBuyEntry({ symbol: 'ETH', qty: 0.5, unitPrice: 3000, fee: 0, date: T + 5 }), id: newLedgerId(T + 5) };
    const fromDesktop = { ...makeBuyEntry({ symbol: 'ETH', qty: 0.25, unitPrice: 3200, fee: 0, date: T + 6 }), id: newLedgerId(T + 6) };
    const phone = replayLedger({ baseline: base, entries: [fromPhone, fromDesktop] });
    const desktop = replayLedger({ baseline: base, entries: [fromDesktop, fromPhone] });
    expect(phone.lots).toEqual(desktop.lots);
    expect(lotBasisBySymbol(phone.lots).get('ETH')).toEqual({ qty: 1.75, basis: 3300 });
  });
});
