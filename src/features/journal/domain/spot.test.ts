import { describe, expect, it } from 'vitest';
import type { TransactionTransfer, WalletTransaction } from '@/features/connected/domain/model';
import { spotBook, toSwaps } from './spot';

const leg = (direction: 'in' | 'out', symbol: string, quantity: number, value: number | null, p: Partial<TransactionTransfer> = {}): TransactionTransfer =>
  ({ direction, symbol, quantity: String(quantity), value, address: null, icon: null, verified: true, tokenId: symbol.toLowerCase(), ...p });
let n = 0;
const tx = (day: number, transfers: TransactionTransfer[], p: Partial<WalletTransaction> = {}): WalletTransaction =>
  ({ id: `t${++n}`, hash: `0x${n}`, chain: 'base', type: 'trade', status: 'confirmed', minedAt: new Date(Date.UTC(2026, 0, day)).toISOString(), fee: 0.5, transfers, protocol: 'Uniswap', ...p });

describe('ژورنال اسپات', () => {
  it('سواپ‌ها: فقط trade تأییدشده؛ WETH همان ETH؛ هزینهٔ سواپ', () => {
    const s = toSwaps('0xw', [
      tx(1, [leg('out', 'USDC', 1000, 1000), leg('in', 'WETH', 0.5, 990)]),
      tx(2, [leg('out', 'ETH', 1, 2000), leg('in', 'WETH', 1, 2000)]),
      tx(3, [leg('out', 'USDC', 5, 5)], {}),
      tx(4, [leg('out', 'USDC', 10, 10), leg('in', 'X', 1, 10)], { type: 'send' })
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].bought[0]).toMatchObject({ asset: 'ETH', symbol: 'ETH', stable: false });
    expect(s[0].cost).toBe(10);
  });

  it('میانگین بها، سود محقق و باز، بهای نامعلوم', () => {
    const swaps = toSwaps('0xw', [
      tx(1, [leg('out', 'USDC', 1000, 1000), leg('in', 'SOL', 10, 1000)]),
      tx(2, [leg('out', 'USDC', 1500, 1500), leg('in', 'SOL', 10, 1500)]),
      // فروش ۱۰ از ۲۰ با میانگین بهای ۱۲۵ → بها ۱۲۵۰، فروش ۱۶۰۰ → سود ۳۵۰
      tx(3, [leg('out', 'SOL', 10, 1600), leg('in', 'USDC', 1600, 1600)]),
      // SOL → JUP: ۵ SOL به ارزش ۹۰۰ (بها ۶۲۵ → سود ۲۷۵)، JUP با بهای ۹۰۰
      tx(4, [leg('out', 'SOL', 5, 900), leg('in', 'JUP', 1000, 900)]),
      // فروش JUP بیشتر از خرید سواپی (۵۰۰ از ایردراپ): نیمی بهای نامعلوم
      tx(5, [leg('out', 'JUP', 2000, 1000), leg('in', 'USDC', 1000, 1000)])
    ]);
    const b = spotBook(swaps, new Map([['SOL', 200]]));
    const sol = b.assets.find((a) => a.asset === 'SOL')!;
    expect(sol.realized).toBeCloseTo(625);
    expect(sol.qty).toBeCloseTo(5);
    expect(sol.avgCost).toBeCloseTo(125);
    expect(sol.unrealized).toBeCloseTo(375);
    const jup = b.assets.find((a) => a.asset === 'JUP')!;
    expect(jup.realized).toBeCloseTo(-400); // ۵۰۰ (نیمِ معلوم) − ۹۰۰
    expect(jup.unknownProceeds).toBeCloseTo(500);
    expect(b.sales.find((x) => x.asset === 'JUP')!.pnl).toBeNull();
    expect(b.totals).toMatchObject({ swaps: 5, wins: 2, losses: 0 });
    expect(b.totals.gas).toBeCloseTo(2.5);
    expect(b.totals.unrealized).toBeCloseTo(375); // JUP موجودی ندارد؛ USDC نقد است → فقط SOL
  });

  it('اسپم، تأییدنشده و بی‌قیمت کامل حذف می‌شوند', () => {
    const swaps = toSwaps('0xw', [
      tx(1, [leg('out', 'USDC', 100, 100), leg('in', 'SCAM', 1e6, 100, { verified: false })]),
      tx(2, [leg('out', 'USDC', 100, 100), leg('in', 'JUNK', 5, 100, { spam: true })]),
      tx(3, [leg('out', 'USDC', 100, 100), leg('in', 'TINY', 5, null)]),
      tx(4, [leg('out', 'USDC', 100, 100), leg('in', 'PEPE', 1e6, 100)]),
      tx(5, [leg('out', 'USDC', 300, 300), leg('in', 'SOL', 2, 300)])
    ]);
    expect(swaps.map((x) => x.bought[0].asset)).toEqual(['PEPE', 'SOL']);
    // PEPE موجودی دارد ولی الان قیمت ندارد → نه در دارایی‌ها، نه در سواپ‌ها، نه در جمع
    const b = spotBook(swaps, new Map([['SOL', 160]]));
    expect(b.assets.map((a) => a.asset)).toEqual(['SOL']);
    expect(b.totals.swaps).toBe(1);
    expect(b.totals.unrealized).toBeCloseTo(20);
  });

  it('موجودی واقعی کیف پول: خروج غیر سواپی بها را کم می‌کند، ورود غیر سواپی بهای نامعلوم است، خرد و تسویه‌شده جدا', () => {
    const swaps = toSwaps('0xw', [
      // ۱۰ اتر به میانگین ۳۴۰۰ خریده شد
      tx(1, [leg('out', 'USDC', 34000, 34000), leg('in', 'WETH', 10, 34000)]),
      // DRV کامل خرید و فروش شد
      tx(2, [leg('out', 'USDC', 100, 100), leg('in', 'DRV', 50, 100)]),
      tx(3, [leg('out', 'DRV', 50, 80), leg('in', 'USDC', 80, 80)]),
      // ARB خریده شد ولی الان فقط خرد مانده
      tx(4, [leg('out', 'USDC', 50, 50), leg('in', 'ARB', 50, 50)])
    ]);
    // در کیف پول: فقط ۲ اتر (۸ اتر به صرافی رفت)، ۰٫۰۱ بیت‌کوین از پل (بدون سواپ)، ۰٫۰۶ ARB
    const price = new Map([['ETH', 2400], ['BTC', 80000], ['ARB', 0.5]]);
    const held = new Map([['ETH', 2], ['BTC', 0.01], ['ARB', 0.06]]);
    const b = spotBook(swaps, price, Date.UTC(2026, 0, 2), held);
    const eth = b.open.find((a) => a.asset === 'ETH')!;
    expect(eth.qty).toBe(2);
    expect(eth.avgCost).toBeCloseTo(3400);
    expect(eth.unrealized).toBeCloseTo(2 * (2400 - 3400));
    expect(eth).toMatchObject({ buysAll: 1, buys: 0 });
    expect(b.open.map((a) => a.asset)).toEqual(['ETH']);
    expect(b.closed.map((a) => a.asset).sort()).toEqual(['ARB', 'DRV']);
    expect(b.closed.find((a) => a.asset === 'ARB')!.dust).toBe(true);
    expect(b.totals.unrealized).toBeCloseTo(-2000);
    expect(b.totals.realized).toBeCloseTo(-20);
  });

  it('توکنی که فقط از پل آمده و هم سواپ شده: مازاد بهای نامعلوم، سود باز فقط بخش معلوم', () => {
    const swaps = toSwaps('0xw', [tx(1, [leg('out', 'USDC', 1000, 1000), leg('in', 'SOL', 10, 1000)])]);
    const b = spotBook(swaps, new Map([['SOL', 150]]), 0, new Map([['SOL', 30]]));
    const sol = b.open[0];
    expect(sol).toMatchObject({ qty: 30, basisQty: 10, unknownQty: 20 });
    expect(sol.unrealized).toBeCloseTo(500);
    expect(sol.value).toBeCloseTo(4500);
  });

  it('حسابرسی خودکار اسپات: حذف توکن‌های ناموجود و زیر ۳ دلار به جز YT، PT و ETH روی رابین‌هود و هایپرلیکویید', async () => {
    const { isSpotAuditExemptPosition, SPOT_AUDIT_MIN_USD } = await import('./spot');
    expect(SPOT_AUDIT_MIN_USD).toBe(3);
    expect(isSpotAuditExemptPosition({ symbol: 'YT-USDe', chain: 'ethereum' })).toBe(true);
    expect(isSpotAuditExemptPosition({ symbol: 'PT-sUSDe', chain: 'arbitrum' })).toBe(true);
    expect(isSpotAuditExemptPosition({ symbol: 'ETH', chain: 'robinhood' })).toBe(true);
    expect(isSpotAuditExemptPosition({ symbol: 'WETH', chain: 'hyperliquid' })).toBe(true);
    expect(isSpotAuditExemptPosition({ symbol: 'ETH', chain: 'hyperevm' })).toBe(true);
    expect(isSpotAuditExemptPosition({ symbol: 'ETH', chain: 'ethereum' })).toBe(false);
    expect(isSpotAuditExemptPosition({ symbol: 'ARB', chain: 'arbitrum' })).toBe(false);

    const swaps = toSwaps('0xw', [
      // فروخته‌شده / دیگر در کیف نیست → باید کامل حذف شود
      tx(1, [leg('out', 'USDC', 100, 100), leg('in', 'GONE', 10, 100)]),
      // در کیف هست ولی کمتر از ۳ دلار ($1.5) → باید کامل حذف شود
      tx(2, [leg('out', 'USDC', 50, 50), leg('in', 'ARB', 50, 50)]),
      // در کیف هست و بیش از ۳ دلار ($20) → باید بماند
      tx(3, [leg('out', 'USDC', 20, 20), leg('in', 'SOL', 0.2, 20)]),
      // YT زیر ۳ دلار ($1) → استثنا، باید بماند
      tx(4, [leg('out', 'USDC', 2, 2), leg('in', 'YT-USDE', 2, 2)]),
      // ETH روی رابین‌هود/هایپرلیکویید زیر ۳ دلار ($1.2) → استثنا، باید بماند
      tx(5, [leg('out', 'USDC', 1.2, 1.2), leg('in', 'ETH', 0.0005, 1.2)])
    ]);
    const price = new Map([['ARB', 0.5], ['SOL', 100], ['YT-USDE', 0.5], ['ETH', 2400]]);
    const held = new Map([['ARB', 3], ['SOL', 0.2], ['YT-USDE', 2], ['ETH', 0.0005]]);
    const exemptAssets = new Set(['YT-USDE', 'ETH']);
    const b = spotBook(swaps, price, 0, held, SPOT_AUDIT_MIN_USD, { onlyHeld: true, exemptAssets });
    expect(b.assets.map((a) => a.asset).sort()).toEqual(['ETH', 'SOL', 'YT-USDE']);
    expect(b.open.map((a) => a.asset).sort()).toEqual(['ETH', 'SOL', 'YT-USDE']);
    expect(b.closed).toHaveLength(0);
    expect(b.totals.swaps).toBe(3);
  });
});
