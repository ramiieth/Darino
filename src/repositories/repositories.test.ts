/** ============================================================
 * Repositories — تست‌ها (بخش Persistence/سریال‌سازی)
 *
 *  - serialize/deserialize: تبدیل دامین ↔ شبکه با حفظ ID (بدون Data Loss)
 *  - در حالت تست (vitest) Remote کاملاً غیرفعال است → همه‌چیز محلی
 *  - هیچ وابستگی به Market Analysis / Simulation ندارد
 * ============================================================ */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  serializeAccounting,
  deserializeEntries,
  deserializeLots,
  deserializeEvents
} from './accountingRepository';
import { isRemoteAllowed } from './remoteClient';
import type { Account, FifoLot, JournalEntry, LedgerEvent } from '@/features/accounting/domain/types';

const account: Account = { key: 'cash:usd', nameFa: 'نقد دلار', type: 'asset' };

const entry: JournalEntry = {
  id: 42,
  date: 1_700_000_000_000,
  memo: 'خرید ETH',
  lines: [
    { account: 'asset:ETH', debit: 10_000, credit: 0 },
    { account: 'cash:usd', debit: 0, credit: 10_000 }
  ],
  createdAt: 1_700_000_001_000,
  source: 'buy'
};

const lot: FifoLot = {
  id: 7,
  asset: 'ETH',
  qty: 3.33,
  unitCost: 2_820,
  openedAt: 1_700_000_000_000
};

const ev: LedgerEvent = {
  id: 99,
  at: 1_700_000_001_000,
  kind: 'buy',
  refId: 42,
  detail: 'خرید ETH'
};

describe('serialize/deserialize — بدون Data Loss و با حفظ ID', () => {
  it('سریال: دامین → payload شبکه (IDها حفظ می‌شوند)', () => {
    const p = serializeAccounting([account], [entry], [lot], [ev]);
    expect(p.accounts[0].key).toBe('cash:usd');
    expect(p.entries[0].id).toBe(42); // ID حفظ شد
    expect(p.entries[0].payload).toEqual({ memo: 'خرید ETH', lines: entry.lines, source: 'buy' });
    expect(p.lots[0].id).toBe(7);
    expect(p.lots[0].payload).toEqual({ qty: 3.33, unitCost: 2_820, closedAt: undefined });
    expect(p.events[0].id).toBe(99);
  });

  it('دی‌سریال: شبکه → دامین (دقیقاً معادل ورودی)', () => {
    const p = serializeAccounting([account], [entry], [lot], [ev]);
    const es = deserializeEntries(p.entries);
    const ls = deserializeLots(p.lots);
    const evs = deserializeEvents(p.events);
    expect(es).toEqual([entry]); // round-trip یکسان
    expect(ls).toEqual([lot]);
    expect(evs).toEqual([ev]);
  });

  it('سریال خالی → دی‌سریال خالی (بدون خطا)', () => {
    const p = serializeAccounting([], [], [], []);
    expect(p.entries).toHaveLength(0);
    expect(deserializeEntries(p.entries)).toHaveLength(0);
  });
});

describe('Remote در حالت تست غیرفعال است (تست‌ها محلی می‌مانند)', () => {
  it('isRemoteAllowed در vitest = false', () => {
    expect(isRemoteAllowed()).toBe(false);
  });
});

describe('جدایی از Market/Simulation', () => {
  it('Repositories هیچ وابستگی به فایل‌های Market یا Simulation ندارند', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    const files = [
      'src/repositories/accountingRepository.ts',
      'src/repositories/portfolioRepository.ts',
      'src/repositories/dashboardRepository.ts',
      'src/repositories/remoteClient.ts',
      'src/repositories/types.ts'
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/features\/markets|features\/simulation/);
    }
  });
});
