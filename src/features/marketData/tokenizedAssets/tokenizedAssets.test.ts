/** ============================================================
 * Tokenized Assets Registry — تست‌ها (بخش ۳۰)
 *
 *  1. Pagination تمام صفحات را می‌خواند
 *  2. Asset جدید شناسایی می‌شود (INSERT)
 *  3. Asset حذف‌شده inactive می‌شود
 *  4. Asset حذف‌شده Hard Delete نمی‌شود
 *  5. تغییر Rank Asset جدید نمی‌سازد
 *  6. AAPLX و AAPLON دو Token مستقل‌اند
 *  7. AAPLX و AAPLON به Underlying واحد AAPL متصل می‌شوند
 *  8. Sync Failure دیتابیس قبلی را پاک نمی‌کند
 *  9. Duplicate Token ایجاد نمی‌شود
 *  10. Accounting هیچ تغییری نمی‌کند (هیچ وابستگی)
 * ============================================================ */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// دروازه نرخ سراسری را در تست‌ها mock می‌کنیم (بدون درخواست واقعی)
vi.mock('@/shared/lib/coingeckoGate', () => ({
  cgFetch: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    constructor(m = '429') {
      super(m);
      this.name = 'RateLimitError';
    }
  }
}));

import { cgFetch } from '@/shared/lib/coingeckoGate';
import { parseCategoryAssets } from './parser';
import { resolveUnderlying, resolveAssetType, extractCompanyName } from './resolver';
import { normalizeAsset, registryKey, hashMetadata } from './normalizer';
import { syncProvider } from './sync';
import { fetchCategoryPages } from './sources/coingeckoCategory';
import {
  registryAll,
  registryBulkGet,
  registryResetForTests,
  syncRunsAll
} from './db';
import {
  filterRegistry,
  groupByUnderlyingAssets,
  registryStats,
  DEFAULT_FILTERS
} from './useTokenizedRegistry';
import { CATEGORY_PAGE_SIZE } from './constants';
import type { CoingeckoCategoryRow, TokenizedAssetRecord } from './types';

const mockCgFetch = cgFetch as ReturnType<typeof vi.fn>;

/** ساخت ردیف خام API */
function row(id: string, symbol: string, name: string): CoingeckoCategoryRow {
  return { id, symbol, name, market_cap_rank: 1 };
}

/** ساخت رکورد Registry کامل (برای تست) */
function record(over: Partial<TokenizedAssetRecord>): TokenizedAssetRecord {
  return {
    key: 'backedfi:AAPLX',
    provider: 'backedfi',
    sourceCategory: 'xstocks-ecosystem',
    sourceUrl: 'https://www.coingecko.com/en/categories/xstocks-ecosystem',
    coingeckoId: 'apple-xstock',
    tokenSymbol: 'AAPLX',
    tokenName: 'Apple xStock',
    underlyingSymbol: 'AAPL',
    underlyingName: 'Apple',
    assetType: 'STOCK',
    status: 'active',
    sourceRank: 1,
    firstSeenAt: 1000,
    lastSeenAt: 1000,
    lastSyncedAt: 1000,
    metadataHash: 'abc123',
    createdAt: 1000,
    updatedAt: 1000,
    ...over
  };
}

beforeEach(() => {
  mockCgFetch.mockReset();
  registryResetForTests();
});

/* ================= 1) Pagination ================= */
describe('Pagination — تمام صفحات خوانده می‌شود', () => {
  it('وقتی صفحه پر است، صفحه بعدی هم خوانده می‌شود؛ صفحه ناقص = توقف', async () => {
    const fullPage = Array.from({ length: CATEGORY_PAGE_SIZE }, (_, i) =>
      row(`id-${i}`, `SYM${i}`, `Name ${i}`)
    );
    const lastPage = Array.from({ length: 10 }, (_, i) =>
      row(`last-${i}`, `LS${i}`, `Last ${i}`)
    );
    mockCgFetch.mockResolvedValueOnce({ ok: true, json: async () => fullPage });
    mockCgFetch.mockResolvedValueOnce({ ok: true, json: async () => lastPage });

    const rows = await fetchCategoryPages('xstocks-ecosystem');
    expect(rows).toHaveLength(CATEGORY_PAGE_SIZE + 10);
    expect(mockCgFetch).toHaveBeenCalledTimes(2);
  });

  it('صفحه اول ناقص → فقط یک صفحه خوانده می‌شود', async () => {
    mockCgFetch.mockResolvedValueOnce({ ok: true, json: async () => [row('a', 'A', 'A'), row('b', 'B', 'B')] });
    const rows = await fetchCategoryPages('ondo-tokenized-assets');
    expect(rows).toHaveLength(2);
    expect(mockCgFetch).toHaveBeenCalledTimes(1);
  });

  it('ترتیب ردیف‌ها حفظ می‌شود (منبع → parse → rank)', () => {
    const parsed = parseCategoryAssets([row('b', 'B', 'B'), row('a', 'A', 'A'), row('c', 'C', 'C')]);
    expect(parsed.map((p) => p.tokenSymbol)).toEqual(['B', 'A', 'C']);
    expect(parsed[0].sourceRank).toBe(1);
    expect(parsed[2].sourceRank).toBe(3);
  });

  it('ردیف‌های نامعتبر (بدون id/symbol/name) حذف می‌شوند', () => {
    const parsed = parseCategoryAssets([
      row('ok', 'OK', 'OK'),
      { id: '', symbol: 'X', name: 'X' },
      { id: 'y', symbol: '', name: 'Y' },
      { id: 'z', symbol: 'Z', name: '' },
      null as unknown as CoingeckoCategoryRow
    ]);
    expect(parsed).toHaveLength(1);
  });
});

/* ================= 6) دو Token مستقل ================= */
describe('Master Identity — AAPLX و AAPLON', () => {
  it('AAPLX و AAPLON دو کلید مستقل‌اند (provider + token_symbol)', () => {
    expect(registryKey('backedfi', 'AAPLX')).toBe('backedfi:AAPLX');
    expect(registryKey('ondo', 'AAPLON')).toBe('ondo:AAPLON');
    expect(registryKey('backedfi', 'AAPLX')).not.toBe(registryKey('ondo', 'AAPLON'));
  });

  it('هر دو به Underlying واحد AAPL متصل می‌شوند', () => {
    const backed = resolveUnderlying('AAPLX', 'Apple xStock', 'backedfi');
    const ondo = resolveUnderlying('AAPLON', 'Apple (Ondo Tokenized Stock)', 'ondo');
    expect(backed.underlyingSymbol).toBe('AAPL');
    expect(ondo.underlyingSymbol).toBe('AAPL');
    expect(backed.underlyingName).toBe('Apple');
  });

  it('گروه‌بندی: دو توکن زیر یک گروه قرار می‌گیرند', () => {
    const a = record({ key: 'backedfi:AAPLX', provider: 'backedfi', tokenSymbol: 'AAPLX' });
    const b = record({
      key: 'ondo:AAPLON',
      provider: 'ondo',
      tokenSymbol: 'AAPLON',
      tokenName: 'Apple (Ondo Tokenized Stock)'
    });
    const groups = groupByUnderlyingAssets([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].underlyingSymbol).toBe('AAPL');
    expect(groups[0].tokens.map((t) => t.tokenSymbol).sort()).toEqual(['AAPLON', 'AAPLX']);
  });
});

/* ================= Resolver ================= */
describe('Resolver — تشخیص دارایی پایه و نوع', () => {
  it('نام شرکت شناخته‌شده → HIGH (Tesla xStock → TSLA)', () => {
    const r = resolveUnderlying('TSLAx', 'Tesla xStock', 'backedfi');
    expect(r.underlyingSymbol).toBe('TSLA');
    expect(r.underlyingName).toBe('Tesla');
  });

  it('Override استثنا: BRK.BX → BRK.B', () => {
    const r = resolveUnderlying('BRK.BX', 'Berkshire Hathaway xStock', 'backedfi');
    expect(r.underlyingSymbol).toBe('BRK.B');
  });

  it('نماد تک‌حرفی: Visa xStock («VX») → V و Citigroup («CON») → C', () => {
    expect(resolveUnderlying('vx', 'Visa xStock', 'backedfi').underlyingSymbol).toBe('V');
    expect(resolveUnderlying('con', 'Citigroup (Ondo Tokenized Stock)', 'ondo').underlyingSymbol).toBe('C');
  });

  it('بدون تشخیص قابل‌اعتماد → نماد پایه null (حدس خطرناک ممنوع)', () => {
    const r = resolveUnderlying('XYZ123', 'Mystery Product Tokenized', 'ondo');
    expect(r.underlyingSymbol).toBeNull();
    expect(r.underlyingName).toBe('Mystery Product');
  });

  it('نوع: ETF از نام صریح', () => {
    expect(resolveAssetType('SPDR S&P 500 ETF (Ondo Tokenized ETF)')).toBe('ETF');
  });
  it('نوع: STOCK از xStock', () => {
    expect(resolveAssetType('Tesla xStock')).toBe('STOCK');
  });
  it('نوع: بدون علامت صریح → OTHER (نه حدس)', () => {
    expect(resolveAssetType('iShares Bitcoin Trust (Ondo Tokenized)')).toBe('OTHER');
  });
  it('استخراج نام شرکت از نام توکن', () => {
    expect(extractCompanyName('Circle Internet Group (Ondo Tokenized Stock)')).toBe('Circle Internet Group');
    expect(extractCompanyName('Tesla xStock')).toBe('Tesla');
  });
});

/* ================= Normalizer ================= */
describe('Normalizer — هش و ساختار', () => {
  it('hash پایدار است و با تغییر متادیتا عوض می‌شود', () => {
    const h1 = hashMetadata({ a: 1, b: 'x' });
    const h2 = hashMetadata({ a: 1, b: 'x' });
    const h3 = hashMetadata({ a: 1, b: 'y' });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('رکورد نرمال‌شده فیلدهای کامل دارد', () => {
    const n = normalizeAsset(
      { coingeckoId: 'apple-xstock', tokenSymbol: 'AAPLX', tokenName: 'Apple xStock', sourceRank: 3 },
      { provider: 'backedfi', category: 'xstocks-ecosystem', url: 'u', labelFa: 'l' },
      5000
    );
    expect(n.key).toBe('backedfi:AAPLX');
    expect(n.underlyingSymbol).toBe('AAPL');
    expect(n.assetType).toBe('STOCK');
    expect(n.status).toBe('active');
    expect(n.sourceRank).toBe(3);
    expect(n.metadataHash).toMatch(/^[0-9a-f]{8}$/);
  });
});

/* ================= 2/3/4/5/8/9) Sync Engine ================= */
describe('Sync Engine — تشخیص جدید/حذف/تغییر + پایداری', () => {
  const mkResponse = (rows: unknown[]) => ({ ok: true, json: async () => rows });

  it('2) Asset جدید → INSERT با firstSeenAt', async () => {
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    const out = await syncProvider('backedfi');
    expect(out.assetsFound).toBe(1);
    expect(out.assetsAdded).toBe(1);
    const all = await registryAll();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('active');
    expect(all[0].firstSeenAt).toBeGreaterThan(0);
  });

  it('3/4) حذف از منبع → inactive (نه Hard Delete)', async () => {
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    await syncProvider('backedfi');

    // Sync دوم: منبع خالی است
    mockCgFetch.mockResolvedValueOnce(mkResponse([]));
    const out2 = await syncProvider('backedfi');
    expect(out2.assetsRemoved).toBe(1);

    const all = await registryAll();
    expect(all).toHaveLength(1); // هنوز در دیتابیس است (حذف نشده)
    expect(all[0].status).toBe('inactive');
  });

  it('5) تغییر Rank → Asset جدید ساخته نمی‌شود؛ فقط متادیتا به‌روز می‌شود', async () => {
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    const first = await syncProvider('backedfi');
    const firstSeen = (await registryAll())[0].firstSeenAt;

    // رتبه از ۱ به ۵ تغییر کرد
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    // rank در پاسخ API مشخص نیست؛ پس منبعRank از ایندکس می‌آید — یک دارایی دیگر قبلش اضافه می‌کنیم
    mockCgFetch.mockReset();
    mockCgFetch.mockResolvedValueOnce(
      mkResponse([row('tesla-xstock', 'tslax', 'Tesla xStock'), row('apple-xstock', 'aaplx', 'Apple xStock')])
    );
    const out2 = await syncProvider('backedfi');
    expect(out2.assetsAdded).toBe(1); // فقط تسلا جدید است
    const all = await registryAll();
    expect(all).toHaveLength(2); // اپل همان رکورد است، نه رکورد جدید
    const apple = all.find((r) => r.key === 'backedfi:AAPLX')!;
    expect(apple.firstSeenAt).toBe(firstSeen); // firstSeen ثابت می‌ماند
    expect(apple.sourceRank).toBe(2); // رتبه جدید حفظ شد
    expect(first.assetsAdded).toBe(1);
  });

  it('8) شکست Sync → دیتابیس قبلی دست‌نخورده + لاگ failed', async () => {
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    await syncProvider('backedfi');

    // Sync دوم: خطای شبکه
    mockCgFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(syncProvider('backedfi')).rejects.toThrow();

    const all = await registryAll();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('active'); // پاک نشده

    const runs = await syncRunsAll();
    const failed = runs.find((r) => r.status === 'failed');
    expect(failed).toBeDefined();
    expect(failed?.errorMessage).toContain('network down');
  });

  it('9) Sync تکراری → بدون Duplicate', async () => {
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    await syncProvider('backedfi');
    mockCgFetch.mockResolvedValueOnce(mkResponse([row('apple-xstock', 'aaplx', 'Apple xStock')]));
    const out2 = await syncProvider('backedfi');
    expect(out2.assetsAdded).toBe(0);
    expect(out2.assetsUpdated).toBe(0);
    const all = await registryAll();
    expect(all).toHaveLength(1);
  });
});

/* ================= Store helpers ================= */
describe('جستجو/فیلتر/آمار', () => {
  const a = record({ key: 'backedfi:AAPLX', provider: 'backedfi', tokenSymbol: 'AAPLX', underlyingSymbol: 'AAPL', underlyingName: 'Apple', assetType: 'STOCK' });
  const b = record({ key: 'ondo:AAPLON', provider: 'ondo', tokenSymbol: 'AAPLON', underlyingSymbol: 'AAPL', underlyingName: 'Apple', assetType: 'STOCK' });
  const c = record({ key: 'ondo:SPYON', provider: 'ondo', tokenSymbol: 'SPYON', tokenName: 'SPDR S&P 500 ETF (Ondo Tokenized ETF)', underlyingSymbol: 'SPY', underlyingName: 'S&P 500', assetType: 'ETF', status: 'inactive' });

  it('جستجو: نام پایه / نماد پایه / نماد توکن / Provider', () => {
    const all = { ...DEFAULT_FILTERS, status: 'all' as const };
    expect(filterRegistry([a, b, c], { ...all, query: 'apple' })).toHaveLength(2);
    expect(filterRegistry([a, b, c], { ...all, query: 'aapl' })).toHaveLength(2);
    expect(filterRegistry([a, b, c], { ...all, query: 'aaplx' })).toHaveLength(1);
    expect(filterRegistry([a, b, c], { ...all, query: 'ondo' })).toHaveLength(2);
  });

  it('فیلتر provider / نوع / وضعیت', () => {
    const all = { ...DEFAULT_FILTERS, status: 'all' as const };
    expect(filterRegistry([a, b, c], { ...DEFAULT_FILTERS, provider: 'backedfi' })).toHaveLength(1);
    expect(filterRegistry([a, b, c], { ...all, assetType: 'ETF' })).toHaveLength(1);
    expect(filterRegistry([a, b, c], { ...all })).toHaveLength(3);
    expect(filterRegistry([a, b, c], { ...all, status: 'inactive' })).toHaveLength(1);
  });

  it('آمار: تعداد یکتا و تفکیک', () => {
    const s = registryStats([a, b, c]);
    expect(s.total).toBe(3);
    expect(s.active).toBe(2);
    expect(s.inactive).toBe(1);
    // فقط دارایی‌های فعال شمرده می‌شوند (هر دو AAPL هستند)
    expect(s.uniqueUnderlying).toBe(1);
    expect(s.byProvider.ondo).toBe(1);
    expect(s.byProvider.backedfi).toBe(1);
  });
});

/* ================= 10) Accounting دست‌نخورده ================= */
describe('Accounting — هیچ تغییری (بخش ۳۲)', () => {
  it('هیچ فایل Registry به ماژول‌های حسابداری وابسته نیست', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = ['sync.ts', 'db.ts', 'normalizer.ts', 'resolver.ts', 'parser.ts', 'sources/coingeckoCategory.ts', 'useTokenizedRegistry.ts'];
    for (const f of files) {
      const src = readFileSync(resolve(here, f), 'utf8');
      expect(src).not.toMatch(/accounting/);
      expect(src).not.toMatch(/journal|postings|accEntries|accLots|accAccounts/);
      expect(src).not.toMatch(/fifo|cost.?basis|realized/i);
    }
  });

  it('کلیدهای جدول Registry با جداول حسابداری تداخل ندارند', () => {
    expect(registryKey('ondo', 'AAPLON')).not.toMatch(/acc|journal|lot/i);
    const g = groupByUnderlyingAssets([record({}), record({ key: 'ondo:AAPLON', provider: 'ondo' })]);
    expect(g.length).toBeGreaterThan(0);
  });
});
