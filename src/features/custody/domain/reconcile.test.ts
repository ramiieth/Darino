/** تطبیق رکورد Arcus با ثبت دستی — دادهٔ مصنوعی */
import { describe, expect, it } from 'vitest';
import { arcusCollateralAssetId } from './catalog';
import { computeLedger, emptyOperation } from './ledger';
import { arcusTransferKey, linkTransfer, operationFromTransfer, reconcileTransfers, usToMs, type ExternalTransfer } from './reconcile';
import type { Holding, Operation } from './types';

const T0 = 1_800_000_000_000;
const ADDR = '0x4444444444444444444444444444444444444444';
const ARC: Holding = { id: 'arc', kind: 'arcus', label: 'arc', createdAt: T0, updatedAt: T0, arcus: { env: 'testnet', address: ADDR, accountIndex: 1 } };
const COLL = arcusCollateralAssetId('testnet');

const transfer = (p: Partial<ExternalTransfer>): ExternalTransfer => ({
  env: 'testnet',
  address: ADDR,
  accountIndex: 1,
  id: 'dep-test-1',
  type: 'DEPOSIT',
  status: 'APPLIED',
  amount: '12.5',
  createdAtUs: String(T0 * 1000 + 123),
  ...p
});

const manualDeposit = (amount: string, at: number | null): Operation => ({
  ...emptyOperation('platform_deposit', T0),
  occurredAt: at,
  note: 'یادداشت دستی',
  from: { holdingId: 'w', assetId: 'robinhood:0x5fc5360d0400a0fd4f2af552add042d716f1d168', amount: '12.6' },
  to: { holdingId: 'arc', assetId: COLL, amount }
});

describe('reconcile', () => {
  it('میکروثانیه به میلی‌ثانیه بدون گرد شدن به بالا', () => {
    expect(usToMs('1800000000000999')).toBe(1_800_000_000_000);
  });

  it('پیشنهاد قوی برای مقدار برابر و زمان نزدیک — بدون ربط خودکار', () => {
    const m = manualDeposit('12.5', T0 + 30 * 60_000);
    const [item] = reconcileTransfers([transfer({})], [m], [ARC]);
    expect(item.linkedOperationId).toBeNull();
    expect(item.suggestions[0]).toMatchObject({ operationId: m.id, confidence: 'strong' });
    expect(m.externalRefs).toHaveLength(0);
  });

  it('ربط‌دادن یادداشت و فیلدهای دستی را حفظ می‌کند و دوباره ربط نمی‌خورد', () => {
    const m = manualDeposit('12.5', T0);
    const linked = linkTransfer(m, transfer({}), T0 + 5);
    expect(linked.note).toBe('یادداشت دستی');
    expect(linked.from.amount).toBe('12.6');
    expect(linked.verification).toBe('api_matched');
    expect(linkTransfer(linked, transfer({}), T0 + 6)).toBe(linked);
    const [item] = reconcileTransfers([transfer({})], [linked], [ARC]);
    expect(item.linkedOperationId).toBe(m.id);
    expect(item.importable).toBe(false);
  });

  it('import همان رکورد پس از ربط دوباره ممکن نیست (بدون تراکنش دوم)', () => {
    const imported = operationFromTransfer(transfer({}), ARC, T0)!;
    const [item] = reconcileTransfers([transfer({})], [imported], [ARC]);
    expect(item.importable).toBe(false);
    expect(item.linkedOperationId).toBe(imported.id);
    expect(imported.externalRefs[0].key).toBe(arcusTransferKey(transfer({})));
  });

  it('عملیات import‌شده سمت کیف پول را نامعلوم نگه می‌دارد (بدون حدس)', () => {
    const imported = operationFromTransfer(transfer({}), ARC, T0)!;
    expect(imported.from).toEqual({ holdingId: null, assetId: null, amount: null });
    expect(imported.to.amount).toBe('12.5');
    const l = computeLedger([imported]);
    expect(l.balances.find((b) => b.holdingId === 'arc')?.quantity).toBe('12.5');
  });

  it('رکورد ردشده یا زیرحساب/محیط دیگر قابل import نیست', () => {
    const rejected = reconcileTransfers([transfer({ status: 'REJECTED_INSUFFICIENT_COLLATERAL' })], [], [ARC])[0];
    expect(rejected.importable).toBe(false);
    const otherIndex = reconcileTransfers([transfer({ accountIndex: 2 })], [], [ARC])[0];
    expect(otherIndex.importable).toBe(false);
    const mainnet = reconcileTransfers([transfer({ env: 'mainnet' })], [], [ARC])[0];
    expect(mainnet.importable).toBe(false);
    expect(operationFromTransfer(transfer({ status: 'REJECTED_INVALID_AMOUNT' }), ARC)).toBeNull();
  });

  it('کلید رکورد به محیط و زیرحساب حساس است', () => {
    expect(arcusTransferKey(transfer({}))).not.toBe(arcusTransferKey(transfer({ env: 'mainnet' })));
    expect(arcusTransferKey(transfer({}))).not.toBe(arcusTransferKey(transfer({ accountIndex: 0 })));
  });
});
