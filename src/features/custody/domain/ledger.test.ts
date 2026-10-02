/**
 * تست‌های دفتر مقداری — فقط دادهٔ مصنوعی (آدرس/هش/مبلغ ساختگی و مستقل)
 */
import { describe, expect, it } from 'vitest';
import { ASSETS, arcusCollateralAsset, arcusCollateralAssetId } from './catalog';
import {
  applyEdit,
  availableBalance,
  computeEffects,
  computeLedger,
  dedupeKeys,
  emptyOperation,
  findDuplicates,
  isIncomplete,
  restoreOperation,
  validateOperation,
  voidOperation,
  type LedgerContext
} from './ledger';
import { valuePortfolio, type PriceInfo } from './valuation';
import type { Fee, Holding, Operation } from './types';

const T0 = 1_800_000_000_000;
const ARB_USDT = 'arbitrum:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
const ARB_USDG = 'arbitrum:0x004b506865409877c9fa29bfb1eba929984b9bbc';
const ARB_ETH = 'arbitrum:native';
const RH_USDG = 'robinhood:0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const RH_ETH = 'robinhood:native';
const ARCUS_COLL = arcusCollateralAssetId('testnet');

const holding = (id: string, kind: Holding['kind'], extra: Partial<Holding> = {}): Holding => ({
  id,
  kind,
  label: id,
  createdAt: T0,
  updatedAt: T0,
  ...extra
});

const W1 = holding('w1', 'wallet', { address: '0x1111111111111111111111111111111111111111' });
const W2 = holding('w2', 'wallet', { address: '0x2222222222222222222222222222222222222222' });
const ARC = holding('arc', 'arcus', { arcus: { env: 'testnet', address: '0x3333333333333333333333333333333333333333', accountIndex: 2 } });

const ctx: LedgerContext = {
  assets: new Map([...ASSETS, arcusCollateralAsset('testnet')].map((a) => [a.id, a])),
  holdings: new Map([W1, W2, ARC].map((h) => [h.id, h]))
};

function op(partial: Partial<Operation> & Pick<Operation, 'kind'>): Operation {
  const base = emptyOperation(partial.kind, T0);
  return { ...base, ...partial };
}

const seed = (holdingId: string, assetId: string, amount: string) =>
  op({ kind: 'balance_adjustment', to: { holdingId, assetId, amount } });

const fee = (f: Partial<Fee>): Fee => ({
  id: Math.random().toString(36),
  kind: 'network',
  amount: null,
  assetId: null,
  holdingId: null,
  treatment: 'separate',
  verification: 'user_reported',
  ...f
});

const qty = (ops: Operation[], h: string, a: string) =>
  computeLedger(ops).balances.find((b) => b.holdingId === h && b.assetId === a)?.quantity ?? '0';

describe('Swap / Bridge / Bridge+تبدیل', () => {
  it('Swap: خروج از مبدا و ورود به مقصد در یک شبکه', () => {
    const ops = [
      seed('w1', ARB_USDT, '100'),
      op({ kind: 'swap', from: { holdingId: 'w1', assetId: ARB_USDT, amount: '40' }, to: { holdingId: 'w1', assetId: ARB_USDG, amount: '39.98' } })
    ];
    expect(qty(ops, 'w1', ARB_USDT)).toBe('60');
    expect(qty(ops, 'w1', ARB_USDG)).toBe('39.98');
  });

  it('Swap با دو شبکهٔ متفاوت رد می‌شود', () => {
    const o = op({ kind: 'swap', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' }, to: { holdingId: 'w1', assetId: RH_USDG, amount: '1' } });
    expect(validateOperation(o, ctx).errors['to.assetId']).toBeTruthy();
  });

  it('Bridge: شبکهٔ هم‌سان رد می‌شود و توکن هم‌نام دو شبکه ادغام نمی‌شود', () => {
    const bad = op({ kind: 'bridge', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' }, to: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' } });
    expect(validateOperation(bad, ctx).errors['to.assetId']).toBeTruthy();
    const ops = [
      seed('w1', ARB_USDG, '50'),
      op({ kind: 'bridge', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '50' }, to: { holdingId: 'w1', assetId: RH_USDG, amount: '49.9' } })
    ];
    expect(qty(ops, 'w1', ARB_USDG)).toBe('0');
    expect(qty(ops, 'w1', RH_USDG)).toBe('49.9');
  });

  it('Bridge همراه تبدیل: هر دو شبکه و توکن تغییر می‌کنند؛ اختلاف تعداد کارمزد فرض نمی‌شود', () => {
    const o = op({
      kind: 'bridge_swap',
      from: { holdingId: 'w1', assetId: ARB_USDT, amount: '10' },
      to: { holdingId: 'w2', assetId: RH_USDG, amount: '9.7' }
    });
    expect(validateOperation(o, ctx).errors).toEqual({});
    const effects = computeEffects(o);
    expect(effects.map((e) => e.role).sort()).toEqual(['in', 'out']);
    expect(effects.some((e) => e.role === 'fee')).toBe(false);
  });
});

describe('کارمزد', () => {
  it('کارمزد داخل مقدار دریافتی دوباره کم نمی‌شود', () => {
    const ops = [
      seed('w1', ARB_USDG, '100'),
      op({
        kind: 'bridge',
        from: { holdingId: 'w1', assetId: ARB_USDG, amount: '100' },
        to: { holdingId: 'w1', assetId: RH_USDG, amount: '99.5' },
        fees: [fee({ kind: 'bridge_and_platform', amount: '0.5', assetId: RH_USDG, treatment: 'netted_in_received' })]
      })
    ];
    expect(qty(ops, 'w1', RH_USDG)).toBe('99.5');
  });

  it('کارمزد داخل مقدار خروجی اثر جداگانه ندارد', () => {
    const o = op({
      kind: 'bridge',
      from: { holdingId: 'w1', assetId: ARB_USDG, amount: '20' },
      to: { holdingId: 'w1', assetId: RH_USDG, amount: '19.8' },
      fees: [fee({ kind: 'bridge', amount: '0.2', assetId: ARB_USDG, treatment: 'included_in_source' })]
    });
    expect(computeEffects(o).filter((e) => e.role === 'fee')).toHaveLength(0);
  });

  it('gas با توکن دیگر فقط روی همان موجودی اثر دارد', () => {
    const ops = [
      seed('w1', ARB_USDG, '30'),
      seed('w1', ARB_ETH, '0.01'),
      op({
        kind: 'bridge',
        from: { holdingId: 'w1', assetId: ARB_USDG, amount: '30' },
        to: { holdingId: 'w1', assetId: RH_USDG, amount: '30' },
        fees: [fee({ kind: 'network', amount: '0.000123456789012345', assetId: ARB_ETH, holdingId: 'w1', treatment: 'separate' })]
      })
    ];
    expect(qty(ops, 'w1', ARB_ETH)).toBe('0.009876543210987655');
    expect(qty(ops, 'w1', RH_USDG)).toBe('30');
  });

  it('کارمزد تجمیعی «بریج و Relay» بین اجزا تقسیم نمی‌شود', () => {
    const o = op({
      kind: 'bridge',
      from: { holdingId: 'w1', assetId: ARB_USDG, amount: '5' },
      to: { holdingId: 'w1', assetId: RH_USDG, amount: '4.9' },
      fees: [fee({ kind: 'bridge_and_platform', amount: '0.1', assetId: ARB_USDG, treatment: 'included_in_source' })]
    });
    expect(o.fees).toHaveLength(1);
    expect(o.fees[0].kind).toBe('bridge_and_platform');
  });

  it('کارمزد جداگانه بدون محل پرداخت رد می‌شود', () => {
    const o = op({
      kind: 'swap',
      from: { holdingId: 'w1', assetId: ARB_USDT, amount: '1' },
      to: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' },
      fees: [fee({ amount: '0.1', assetId: ARB_ETH, treatment: 'separate' })]
    });
    expect(validateOperation(o, ctx).errors['fees.0.holdingId']).toBeTruthy();
  });
});

describe('وضعیت‌ها', () => {
  const bridge = (status: Operation['status']) =>
    op({
      kind: 'bridge',
      status,
      from: { holdingId: 'w1', assetId: ARB_USDG, amount: '10' },
      to: { holdingId: 'w1', assetId: RH_USDG, amount: '10' },
      fees: [fee({ kind: 'network', amount: '0.001', assetId: ARB_ETH, holdingId: 'w1' })]
    });

  it('pending: مقصد اعتبار نمی‌گیرد و «در حال انتقال» جدا شمرده می‌شود', () => {
    const ops = [seed('w1', ARB_USDG, '10'), seed('w1', ARB_ETH, '1'), bridge('pending')];
    const l = computeLedger(ops);
    expect(qty(ops, 'w1', RH_USDG)).toBe('0');
    expect(qty(ops, 'w1', ARB_USDG)).toBe('0');
    expect(l.inTransit).toHaveLength(1);
    expect(l.inTransit[0].quantity).toBe('10');
  });

  it('failed: فقط gas جداگانه اثر دارد', () => {
    const ops = [seed('w1', ARB_USDG, '10'), seed('w1', ARB_ETH, '1'), bridge('failed')];
    expect(qty(ops, 'w1', ARB_USDG)).toBe('10');
    expect(qty(ops, 'w1', RH_USDG)).toBe('0');
    expect(qty(ops, 'w1', ARB_ETH)).toBe('0.999');
    expect(computeLedger(ops).inTransit).toHaveLength(0);
  });

  it('completed: ورود قطعی و بدون «در حال انتقال»', () => {
    const ops = [seed('w1', ARB_USDG, '10'), seed('w1', ARB_ETH, '1'), bridge('completed')];
    expect(qty(ops, 'w1', RH_USDG)).toBe('10');
    expect(computeLedger(ops).inTransit).toHaveLength(0);
  });

  it('مقدار نامعلوم صفر نیست: ردیف «ناقص» علامت می‌خورد', () => {
    const o = op({ kind: 'bridge', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '3' }, to: { holdingId: 'w1', assetId: RH_USDG, amount: null } });
    expect(isIncomplete(o)).toBe(true);
    const row = computeLedger([o]).balances.find((b) => b.assetId === RH_USDG);
    expect(row?.incomplete).toBe(true);
    expect(validateOperation(o, ctx).warnings.length).toBeGreaterThan(0);
  });
});

describe('ویرایش، باطل‌کردن و سابقه', () => {
  it('ویرایش اثر قبلی را اصلاح می‌کند، انباشته نمی‌کند', () => {
    const s = seed('w1', ARB_USDT, '100');
    const v1 = op({ kind: 'swap', from: { holdingId: 'w1', assetId: ARB_USDT, amount: '10' }, to: { holdingId: 'w1', assetId: ARB_USDG, amount: '10' } });
    const v2 = applyEdit(v1, { ...v1, from: { ...v1.from, amount: '25' }, to: { ...v1.to, amount: '24.9' } }, T0 + 1);
    const ops = [s, v2];
    expect(qty(ops, 'w1', ARB_USDT)).toBe('75');
    expect(qty(ops, 'w1', ARB_USDG)).toBe('24.9');
    expect(v2.revision).toBe(2);
    expect(v2.history.at(-1)?.summary).toContain('مبدا');
  });

  it('باطل‌کردن اثر را برمی‌دارد ولی رکورد و سابقه می‌ماند؛ بازگردانی دوباره اعمال می‌کند', () => {
    const s = seed('w1', ARB_USDT, '5');
    const voided = voidOperation(s, 'ثبت اشتباه', T0 + 1);
    expect(qty([voided], 'w1', ARB_USDT)).toBe('0');
    expect(voided.history.at(-1)?.action).toBe('voided');
    expect(qty([restoreOperation(voided, T0 + 2)], 'w1', ARB_USDT)).toBe('5');
  });

  it('موجودی در دسترس هنگام ویرایش، خود عملیات را حساب نمی‌کند', () => {
    const s = seed('w1', ARB_USDG, '10');
    const o = op({ kind: 'internal_transfer', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '10' }, to: { holdingId: 'w2', assetId: ARB_USDG, amount: '10' } });
    expect(availableBalance([s, o], 'w1', ARB_USDG, o.id)).toBe('10');
    expect(availableBalance([s, o], 'w1', ARB_USDG)).toBe('0');
  });
});

describe('انتقال داخلی و پلتفرم — جابه‌جایی، نه درآمد', () => {
  it('انتقال داخلی مجموع کل را تغییر نمی‌دهد', () => {
    const ops = [
      seed('w1', ARB_USDG, '8'),
      op({ kind: 'internal_transfer', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '8' }, to: { holdingId: 'w2', assetId: ARB_USDG, amount: '8' } })
    ];
    const prices = new Map<string, PriceInfo>([['global-dollar', { usd: 0.9995, source: 'test', fetchedAt: T0 }]]);
    const l = computeLedger(ops);
    const v = valuePortfolio(l.balances, l.inTransit, ctx.assets, ctx.holdings, prices, []);
    expect(v.knownTotalUsd).toBe('7.996');
  });

  it('انتقال داخلی با دارایی متفاوت رد می‌شود', () => {
    const o = op({ kind: 'internal_transfer', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' }, to: { holdingId: 'w2', assetId: ARB_USDT, amount: '1' } });
    expect(Object.keys(validateOperation(o, ctx).errors).length).toBeGreaterThan(0);
  });

  it('سپرده در Arcus: مقدار ارسالی و اعتبارگرفته جدا؛ با snapshot همگام دوباره‌شماری نمی‌شود', () => {
    const ops = [
      seed('w1', RH_USDG, '20'),
      op({ kind: 'platform_deposit', from: { holdingId: 'w1', assetId: RH_USDG, amount: '20' }, to: { holdingId: 'arc', assetId: ARCUS_COLL, amount: '19.9' } })
    ];
    const l = computeLedger(ops);
    expect(qty(ops, 'arc', ARCUS_COLL)).toBe('19.9');
    const prices = new Map<string, PriceInfo>([['global-dollar', { usd: 1.0001, source: 'test', fetchedAt: T0 }]]);
    // equity همگام‌شده جایگزین موجودی دفتر Arcus می‌شود — نه جمع با آن
    const v = valuePortfolio(l.balances, l.inTransit, ctx.assets, ctx.holdings, prices, [
      { holdingId: 'arc', equity: '21.5', fetchedAt: T0, stale: false }
    ]);
    expect(v.rows.find((r) => r.holdingId === 'arc')?.supersededBySync).toBe(true);
    expect(v.knownTotalUsd).toBe('21.5');
  });

  it('سپرده با مقصد غیرپلتفرمی رد می‌شود', () => {
    const o = op({ kind: 'platform_deposit', from: { holdingId: 'w1', assetId: RH_USDG, amount: '1' }, to: { holdingId: 'w2', assetId: RH_USDG, amount: '1' } });
    expect(validateOperation(o, ctx).errors['to.holdingId']).toBeTruthy();
  });

  it('قیمت ناموجود «نامشخص» است و صفر جمع نمی‌شود؛ استیبل‌کوین ۱ دلار فرض نمی‌شود', () => {
    const l = computeLedger([seed('w1', RH_USDG, '50'), seed('w1', RH_ETH, '2')]);
    const v = valuePortfolio(l.balances, l.inTransit, ctx.assets, ctx.holdings, new Map(), []);
    expect(v.knownTotalUsd).toBe('0');
    expect(v.unpricedCount).toBe(2);
    expect(v.rows.every((r) => r.usdValue === null)).toBe(true);
  });
});

describe('جلوگیری از ثبت تکراری', () => {
  it('شناسهٔ یکسان Relay مسدود می‌شود؛ مبلغ و تاریخ برابر به‌تنهایی تکرار نیست', () => {
    const a = op({ kind: 'bridge', providerId: 'relay', providerRef: 'REQ-TEST-0001', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' }, to: { holdingId: 'w1', assetId: RH_USDG, amount: '1' } });
    const b = { ...a, id: 'other', providerRef: 'req-test-0001 ' };
    const c = { ...a, id: 'third', providerRef: null };
    const hits = findDuplicates(b, [a], ctx);
    expect(hits[0]?.key.strength).toBe('blocking');
    expect(findDuplicates(c, [a], ctx)).toHaveLength(0);
  });

  it('هش یکسان روی یک شبکه هشدار می‌دهد؛ روی شبکهٔ دیگر کلید متفاوت است', () => {
    const h = '0x' + 'ab'.repeat(32);
    const a = op({ kind: 'swap', sourceTxHash: h, from: { holdingId: 'w1', assetId: ARB_USDT, amount: '1' }, to: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' } });
    const b = { ...a, id: 'b' };
    expect(findDuplicates(b, [a], ctx)[0]?.key.strength).toBe('warning');
    const k1 = dedupeKeys(a, ctx)[0].key;
    const other = op({ kind: 'swap', sourceTxHash: h, from: { holdingId: 'w1', assetId: RH_ETH, amount: '1' }, to: { holdingId: 'w1', assetId: RH_USDG, amount: '1' } });
    expect(dedupeKeys(other, ctx)[0].key).not.toBe(k1);
  });

  it('عملیات باطل‌شده در بررسی تکرار لحاظ نمی‌شود', () => {
    const a = voidOperation(op({ kind: 'bridge', providerId: 'relay', providerRef: 'R-9', from: { holdingId: 'w1', assetId: ARB_USDG, amount: '1' }, to: { holdingId: 'w1', assetId: RH_USDG, amount: '1' } }), '');
    const b = { ...a, id: 'b', voidedAt: null };
    expect(findDuplicates(b, [a], ctx)).toHaveLength(0);
  });
});

describe('دقت', () => {
  it('جمع مقادیر ۱۸ رقمی بدون خطای float', () => {
    const ops = [seed('w1', ARB_ETH, '0.1'), seed('w1', ARB_ETH, '0.2')];
    expect(qty(ops, 'w1', ARB_ETH)).toBe('0.3');
  });

  it('دقت بیش از decimals توکن رد می‌شود', () => {
    const o = seed('w1', ARB_USDG, '1.1234567');
    expect(validateOperation(o, ctx).errors['to.amount']).toContain('6');
  });
});
