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
});
