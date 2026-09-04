/**
 * فاز ۴ تست‌ها — منطق دامنه دیفای (فیلتر بازدهی، مرتب‌سازی Perps/Stablecoins)
 */
import { describe, expect, it } from 'vitest';
import {
  filterYieldPools,
  topPerps,
  topStablecoins,
  totalTvl,
  topChains,
  topProtocols,
  type YieldPool,
  type PerpDex,
  type StablecoinEntry,
  type ChainInfo,
  type ProtocolRow
} from '@/features/defi/domain/logic';

describe('فیلتر رادار بازدهی (قوانین سخت)', () => {
  const base = (over: Partial<YieldPool>): YieldPool => ({
    pool: 'x',
    chain: 'ethereum',
    project: 'p',
    symbol: 'S',
    tvlUsd: 10_000_000,
    apy: 10,
    audited: true,
    ilRisk: 'no',
    ...over
  });

  it('استخر کاملاً واجد شرایط قبول می‌شود', () => {
    const out = filterYieldPools([base({})]);
    expect(out).toHaveLength(1);
  });

  it('حذف استخر غیرحسابرسی‌شده (audited=false)', () => {
    const out = filterYieldPools([base({ audited: false })]);
    expect(out).toHaveLength(0);
  });

  it('وقتی فیلد audited غایب است، requireAudit=false → استخر قبول می‌شود', () => {
    const noAuditPool = base({});
    delete noAuditPool.audited;
    const out = filterYieldPools([noAuditPool], false);
    expect(out).toHaveLength(1);
    // ولی با requireAudit=true حذف می‌شود
    const outStrict = filterYieldPools([noAuditPool], true);
    expect(outStrict).toHaveLength(0);
  });

  it('حذف استخر دارای ریسک ناپایدار (ilRisk=yes)', () => {
    const out = filterYieldPools([base({ ilRisk: 'yes' })]);
    expect(out).toHaveLength(0);
  });

  it('حذف استخر با TVL زیر ۵ میلیون', () => {
    const out = filterYieldPools([base({ tvlUsd: 4_999_999 })]);
    expect(out).toHaveLength(0);
  });

  it('حذف استخر با APY زیر ۲ درصد', () => {
    const out = filterYieldPools([base({ apy: 1.99 })]);
    expect(out).toHaveLength(0);
  });

  it('همه شبکه‌ها پذیرفته می‌شوند (بدون محدودیت زنجیره)', () => {
    const out = filterYieldPools([
      base({ chain: 'ethereum' }),
      base({ chain: 'solana' }),
      base({ chain: 'bsc' })
    ]);
    expect(out).toHaveLength(3);
  });

  it('مرز دقیق: TVL=۵M و APY=۲ قبول می‌شوند', () => {
    const out = filterYieldPools([base({ tvlUsd: 5_000_000, apy: 2.0 })]);
    expect(out).toHaveLength(1);
  });
});

describe('۱۵ صرافی مشتقه برتر بر اساس حجم ۲۴ ساعته', () => {
  it('۲۰ ورودی → ۱۵ خروجی با ترتیب نزولی total24h', () => {
    const list: PerpDex[] = Array.from({ length: 20 }, (_, i) => ({
      name: `dex-${i}`,
      total24h: i * 100
    }));
    const out = topPerps(list, 15);
    expect(out).toHaveLength(15);
    expect(out[0].total24h).toBe(1900);
    expect(out[14].total24h).toBe(500);
    // نزولی
    for (let i = 1; i < out.length; i++) {
      expect((out[i - 1].total24h ?? 0) >= (out[i].total24h ?? 0)).toBe(true);
    }
  });

  it('ورودی بدون total24h فیلتر می‌شود', () => {
    const out = topPerps([{ name: 'no-vol' }, { name: 'v', total24h: 5 }], 15);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('v');
  });
});

describe('۲۰ استیبل‌کوین برتر بر اساس Market Cap (peggedUSD)', () => {
  it('۲۵ ورودی → ۲۰ خروجی نزولی', () => {
    const list: StablecoinEntry[] = Array.from({ length: 25 }, (_, i) => ({
      id: `s-${i}`,
      name: `S${i}`,
      symbol: `S${i}`,
      circulating: { peggedUSD: i * 1_000_000 }
    }));
    const out = topStablecoins(list, 20);
    expect(out).toHaveLength(20);
    expect(out[0].circulating?.peggedUSD).toBe(24_000_000);
  });

  it('استیبل‌کوین بدون عرضه (peggedUSD=0) حذف می‌شود', () => {
    const out = topStablecoins(
      [{ id: 'a', name: 'A', symbol: 'A', circulating: { peggedUSD: 0 } }],
      20
    );
    expect(out).toHaveLength(0);
  });
});

describe('نمای کلی: TVL کل و شبکه‌های برتر', () => {
  const chains: ChainInfo[] = [
    { name: 'ethereum', tvl: 50 },
    { name: 'solana', tvl: 10 },
    { name: 'bsc', tvl: 20 }
  ];

  it('مجموع TVL درست است', () => {
    expect(totalTvl(chains)).toBe(80);
  });

  it('شبکه‌ها نزولی مرتب می‌شوند', () => {
    const out = topChains(chains, 2);
    expect(out.map((c) => c.name)).toEqual(['ethereum', 'bsc']);
  });

  it('پروتکل‌های برتر نزولی', () => {
    const protos: ProtocolRow[] = [
      { name: 'a', slug: 'a', tvl: 1 },
      { name: 'b', slug: 'b', tvl: 99 },
      { name: 'c', slug: 'c', tvl: 50 }
    ];
    expect(topProtocols(protos, 2).map((p) => p.name)).toEqual(['b', 'c']);
  });
});
