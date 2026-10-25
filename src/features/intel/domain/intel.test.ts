import { describe, expect, it } from 'vitest';
import { assessToken, isTokenAddress, listVerdict, quickVerdict } from './tokenSafety';
import { fundingStats, hourlyToApr } from './funding';
import { parsePools } from './memes';

const NOW = Date.parse('2026-10-25T00:00:00Z');

describe('امنیت توکن', () => {
  it('هانی‌پات EVM حکم «خطر» را بدون میانگین‌گیری می‌دهد', () => {
    const r = assessToken({ chain: 'ethereum', address: '0x' + '1'.repeat(40), goplus: { is_honeypot: '1', sell_tax: '0.99', owner_address: '0x' + '2'.repeat(40), is_open_source: '1' }, now: NOW });
    expect(r.verdict).toBe('danger');
    expect(r.score).toBeLessThanOrEqual(15);
    expect(r.flags[0]).toMatchObject({ level: 'critical', label: 'هانی‌پات' });
    expect(r.flags.some((f) => f.label === 'مالیات فروش 99٪')).toBe(true);
  });

  it('مالکیت رهاشده اختیارات مالک را به «اطلاع» تبدیل می‌کند (مثل PEPE واقعی)', () => {
    const r = assessToken({
      chain: 'ethereum', address: '0x' + '1'.repeat(40), now: NOW,
      goplus: { is_honeypot: '0', buy_tax: '0', sell_tax: '0', is_open_source: '1', is_proxy: '0', owner_address: '0x0000000000000000000000000000000000000000', transfer_pausable: '1', is_blacklisted: '1', holder_count: '601437', token_symbol: 'PEPE',
        holders: [{ percent: '0.109' }, { percent: '0.05' }], lp_holders: [{ address: '0x000000000000000000000000000000000000dead', percent: '0.99', is_locked: 0 }] },
      pairs: [{ liquidity: { usd: 5_000_000 }, priceUsd: '0.00001', pairCreatedAt: NOW - 400 * 86_400_000, url: 'https://dexscreener.com/ethereum/x' }]
    });
    expect(r.verdict).toBe('clear');
    expect(r.symbol).toBe('PEPE');
    expect(r.flags.filter((f) => f.level === 'info').map((f) => f.label)).toEqual(['قابل توقف معاملات', 'لیست سیاه']);
    expect(r.top10Pct).toBeCloseTo(15.9);
    expect(r.lpLockedPct).toBeCloseTo(99);
    expect(r.market?.url).toBe('https://dexscreener.com/ethereum/x');
  });

  it('سولانا: فریز بحرانی، ریسک‌های RugCheck، نقدینگی کم و توکن تازه', () => {
    const r = assessToken({
      chain: 'solana', address: 'So11111111111111111111111111111111111111112', now: NOW,
      goplus: { freezable: { status: '1' }, mintable: { status: '0' }, holders: [{ percent: '0.6' }] },
      rug: { risks: [{ name: 'Mutable metadata', level: 'warn', description: 'x' }, { name: 'Top holder', level: 'danger' }], lpLockedPct: 10 },
      pairs: [{ liquidity: { usd: 8000 }, pairCreatedAt: NOW - 3_600_000 }]
    });
    expect(r.verdict).toBe('danger');
    const labels = r.flags.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['قابل فریز', 'Top holder', 'Mutable metadata', 'نقدینگی خیلی کم', 'کمتر از ۲۴ ساعت عمر', '۱۰ هولدر برتر 60٪ عرضه', 'فقط 10٪ نقدینگی قفل است']));
    expect(r.sources).toEqual(['GoPlus', 'RugCheck', 'DexScreener']);
  });

  it('بدون منبع امنیتی حکم «نامشخص»، نه «بدون خطر»', () => {
    expect(assessToken({ chain: 'solana', address: 'x', pairs: [{ liquidity: { usd: 1e6 } }] }).verdict).toBe('unknown');
    expect(quickVerdict({ risks: [{ level: 'warn' }] })).toEqual({ verdict: 'caution', dangers: 0, warns: 1 });
    expect(quickVerdict(null).verdict).toBe('unknown');
  });

  it('حکم فهرست میم: توکن تازه یا کم‌نقدینگی هرگز «بدون خطر» نیست', () => {
    const fresh = { liquidityUsd: 136_000, createdAt: NOW - 14 * 3_600_000 };
    expect(listVerdict({ risks: [] }, fresh, NOW)).toEqual({ verdict: 'caution', dangers: 0, warns: 1 });
    expect(listVerdict({ risks: [] }, { liquidityUsd: 5_000, createdAt: null }, NOW).verdict).toBe('danger');
    expect(listVerdict({ risks: [] }, { liquidityUsd: 2e6, createdAt: NOW - 90 * 86_400_000 }, NOW).verdict).toBe('clear');
    expect(listVerdict(null, { liquidityUsd: 2e6, createdAt: null }, NOW).verdict).toBe('unknown');
  });

  it('اعتبارسنجی آدرس بر اساس زنجیره', () => {
    expect(isTokenAddress('solana', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm')).toBe(true);
    expect(isTokenAddress('solana', '0x' + '1'.repeat(40))).toBe(false);
    expect(isTokenAddress('base', '0x' + 'a'.repeat(40))).toBe(true);
  });
});

describe('رژیم فاندینگ', () => {
  const hist = (rates: number[]) => rates.map((r, i) => ({ time: NOW - (rates.length - i) * 3_600_000, fundingRate: String(r) }));

  it('صدک نرخ فعلی در ۳۰ روز و رژیم داغ', () => {
    const base = Array.from({ length: 24 * 20 }, (_, i) => 0.00001 + (i % 10) * 0.000001);
    const s = fundingStats(hist(base), 0.00005, NOW);
    expect(s.percentile).toBe(100);
    expect(s.regime).toBe('hot');
    expect(s.aprNow).toBeCloseTo(hourlyToApr(0.00005));
    expect(s.daily.length).toBeGreaterThanOrEqual(20);
  });

  it('کمتر از ۷ روز داده → نامشخص؛ نرخ منفی → منفی', () => {
    expect(fundingStats(hist([0.00001, 0.00002]), 0.00001, NOW).regime).toBe('unknown');
    expect(fundingStats(hist(Array(24 * 8).fill(0.00001)), -0.00001, NOW).regime).toBe('negative');
  });
});

describe('میم‌کوین‌های داغ', () => {
  it('JSON:API GeckoTerminal → یک ردیف برای هر توکن، بدون SOL', () => {
    const tokens = parsePools({
      data: [
        { attributes: { address: 'pool1', base_token_price_usd: '0.0034', market_cap_usd: '3379546', reserve_in_usd: '242337', pool_created_at: '2026-10-11T13:33:08Z', price_change_percentage: { h1: '-1.1', h24: '9.7' }, volume_usd: { h1: '11516', h24: '892253' }, transactions: { h24: { buys: 27740, sells: 15157, buyers: 14249, sellers: 6494 } } }, relationships: { base_token: { data: { id: 'solana_33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump' } } } },
        { attributes: { address: 'pool2' }, relationships: { base_token: { data: { id: 'solana_33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump' } } } },
        { attributes: { address: 'pool3' }, relationships: { base_token: { data: { id: 'solana_So11111111111111111111111111111111111111112' } } } }
      ],
      included: [
        { id: 'solana_33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump', type: 'token', attributes: { address: '33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump', symbol: 'DOPE', name: 'Doge Pepe', image_url: 'https://coin-images.coingecko.com/x.png' } },
        { id: 'solana_So11111111111111111111111111111111111111112', type: 'token', attributes: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL' } }
      ]
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ symbol: 'DOPE', marketCap: 3379546, liquidityUsd: 242337, buys24h: 27740, buyers24h: 14249, change24h: 9.7, createdAt: Date.parse('2026-10-11T13:33:08Z') });
  });
});
