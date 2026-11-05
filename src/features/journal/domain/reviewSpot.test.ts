/** مرور هفتگی: اسپات همان هفته از دفتر سواپ‌ها، بدون تگ و یادداشت */
import { describe, expect, it } from 'vitest';
import type { TransactionTransfer, WalletTransaction } from '@/features/connected/domain/model';
import { spotBook, toSwaps } from './spot';
import { reviewPayload, spotWeek } from './reviewAssist';
import { DEFAULT_SETTINGS } from './defaults';
import { weekStats } from './review';

const leg = (direction: 'in' | 'out', symbol: string, quantity: number, value: number | null): TransactionTransfer =>
  ({ direction, symbol, quantity: String(quantity), value, address: null, icon: null, verified: true, tokenId: symbol.toLowerCase() });
let n = 0;
const tx = (day: number, transfers: TransactionTransfer[]): WalletTransaction =>
  ({ id: `t${++n}`, hash: `0x${n}`, chain: 'base', type: 'trade', status: 'confirmed', minedAt: new Date(Date.UTC(2026, 10, day, 12)).toISOString(), fee: 0.5, transfers, protocol: 'Uniswap' });

// هفتهٔ ISO 2026-W45: دوشنبه ۲ نوامبر تا یکشنبه ۸ نوامبر
const START = Date.UTC(2026, 10, 2);
const END = START + 7 * 86_400_000;

describe('spotWeek', () => {
  const book = spotBook(toSwaps('0xw', [
    tx(1, [leg('out', 'USDC', 1000, 1000), leg('in', 'SOL', 10, 1000)]), // هفتهٔ قبل
    tx(3, [leg('out', 'SOL', 5, 600), leg('in', 'USDC', 600, 600)]), // سود ۱۰۰
    tx(4, [leg('out', 'USDC', 300, 300), leg('in', 'JUP', 100, 300)])
  ]));

  it('فقط سواپ‌های همین هفته؛ سود فروش با بهای هفتهٔ قبل', () => {
    const s = spotWeek(book, START, END)!;
    expect(s).toMatchObject({ swaps: 2, sales: 1, realizedPnlUsd: 100, winningSales: 1, losingSales: 0, salesWithUnknownCost: 0 });
    expect((s.assets as { symbol: string }[]).map((a) => a.symbol).sort()).toEqual(['JUP', 'SOL']);
    expect(JSON.stringify(s)).not.toContain('0x');
  });

  it('هفتهٔ بدون سواپ یا بدون کیف پول → null', () => {
    expect(spotWeek(book, END, END + 7 * 86_400_000)).toBeNull();
    expect(spotWeek(null, START, END)).toBeNull();
  });

  it('ورودی دستیار بدون هیچ تگ و یادداشتی ساخته می‌شود و اسپات را دارد', () => {
    const p = reviewPayload({ week: '2026-W45', stats: weekStats('2026-W45', [], new Map(), new Map()), trades: [], notes: new Map(), plans: new Map(), checks: [], settings: DEFAULT_SETTINGS, accountSize: null, tz: 'UTC', spot: spotWeek(book, START, END) });
    expect(p.trades).toEqual([]);
    expect(p.spot).toMatchObject({ swaps: 2 });
  });
});
