import { describe, expect, it } from 'vitest';
import { csvRows, decodeStatement, inferContractSizes, mtNumber, mtTime, mtToTrade, normalizeMtSymbol, parseStatement } from './metatrader';
import { classifyTrades } from './classify';
import { DEFAULT_SETTINGS } from './defaults';

const MT4 = `<html><body><table>
<tr align=left><td colspan=2><b>Account: 12345678</b></td><td colspan=5><b>Name: Test</b></td><td colspan=2><b>Currency: USD</b></td></tr>
<tr align=left><td colspan=13><b>Closed Transactions:</b></td></tr>
<tr align=center bgcolor="#C0C0C0"><td>Ticket</td><td nowrap>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S&nbsp;/&nbsp;L</td><td>T&nbsp;/&nbsp;P</td><td nowrap>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
<tr align=right><td>1000</td><td class=msdate nowrap>2026.03.01 09:00:00</td><td>balance</td><td colspan=10 align=left>Deposit</td><td>10&nbsp;000.00</td></tr>
<tr align=right><td title="#1001">1001</td><td class=msdate nowrap>2026.03.02 10:00:00</td><td>buy</td><td class=mspt>0.50</td><td>xauusd</td><td>2900.00</td><td>2890.00</td><td>2920.00</td><td class=msdate nowrap>2026.03.02 14:00:00</td><td>2910.00</td><td>-3.50</td><td>0.00</td><td>0.00</td><td>500.00</td></tr>
<tr align=right><td>1002</td><td class=msdate nowrap>2026.03.03 08:30:00</td><td>sell</td><td class=mspt>1.00</td><td>eurusd.m</td><td>1.08500</td><td>1.09000</td><td>0.00000</td><td class=msdate nowrap>2026.03.04 16:00:00</td><td>1.08000</td><td>-7.00</td><td>0.00</td><td>-2.10</td><td>500.00</td></tr>
<tr align=right><td>1003</td><td class=msdate nowrap>2026.03.05 11:00:00</td><td>buy limit</td><td class=mspt>0.10</td><td>xauusd</td><td>2850.00</td><td>0.00</td><td>0.00</td><td class=msdate nowrap>2026.03.05 12:00:00</td><td colspan=5 align=center>cancelled</td></tr>
<tr align=right><td colspan=10>&nbsp;</td><td>-10.50</td><td>0.00</td><td>-2.10</td><td>1&nbsp;000.00</td></tr>
<tr align=left><td colspan=13><b>Open Trades:</b></td></tr>
<tr align=center bgcolor="#C0C0C0"><td>Ticket</td><td nowrap>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td></td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
<tr align=right><td>1004</td><td>2026.03.06 10:00:00</td><td>buy</td><td>0.20</td><td>xauusd</td><td>2950.00</td><td>0.00</td><td>0.00</td><td></td><td>2955.00</td><td>0.00</td><td>0.00</td><td>0.00</td><td>100.00</td></tr>
</table></body></html>`;

// MT5: سلول پنهان فقط در ردیف داده (نه در سرستون) — مسیر جایگزین dropHidden باید آن را بخواند
const MT5 = `<html><body><table>
<tr><th colspan="4">Trade History Report</th></tr>
<tr><th>Account:</th><td colspan="3"><b>87654321 (USD, Broker-Server, real, Hedge)</b></td></tr>
<tr><th colspan="13"><div><b>Positions</b></div></th></tr>
<tr bgcolor="#E5F0FC"><td><b>Time</b></td><td><b>Position</b></td><td><b>Symbol</b></td><td><b>Type</b></td><td><b>Volume</b></td><td><b>Price</b></td><td><b>S / L</b></td><td><b>T / P</b></td><td><b>Time</b></td><td><b>Price</b></td><td><b>Commission</b></td><td><b>Swap</b></td><td><b>Profit</b></td></tr>
<tr bgcolor="#FFFFFF"><td>2026.07.01 10:00:00</td><td>5001</td><td>UKOUSD</td><td>buy</td><td class="hidden" colspan="2"></td><td>1</td><td>80.00</td><td>79.00</td><td>82.00</td><td>2026.07.01 18:00:00</td><td>81.50</td><td>-5.00</td><td>0.00</td><td>150.00</td></tr>
<tr bgcolor="#F7F7F7"><td>2026.07.01 12:00:00</td><td>5002</td><td>UKOUSD</td><td>sell</td><td class="hidden" colspan="2"></td><td>0.5</td><td>80.50</td><td></td><td></td><td>2026.07.02 09:00:00</td><td>80.00</td><td>-2.50</td><td>-1.00</td><td>25.00</td></tr>
<tr><th colspan="13"><div><b>Orders</b></div></th></tr>
<tr bgcolor="#E5F0FC"><td>Open Time</td><td>Order</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>State</td><td>Comment</td></tr>
<tr><td>2026.07.01 10:00:00</td><td>9001</td><td>UKOUSD</td><td>buy</td><td>1 / 1</td><td>market</td><td></td><td></td><td>2026.07.01 10:00:00</td><td>filled</td><td></td></tr>
</table></body></html>`;

const utf16 = (s: string) => {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { out[2 + i * 2] = s.charCodeAt(i) & 0xff; out[3 + i * 2] = s.charCodeAt(i) >> 8; }
  return out;
};

describe('metatrader statement', () => {
  it('parses MT4 detailed statement, skipping balance, cancelled, totals and open trades', () => {
    const r = parseStatement(MT4, { serverTime: 2 });
    expect(r.format).toBe('mt4');
    expect(r.login).toBe('12345678');
    expect(r.currency).toBe('USD');
    expect(r.trades.map((t) => t.ticket)).toEqual(['1001', '1002']);
    const [xau, eur] = r.trades;
    expect(xau).toMatchObject({ id: 'jt:12345678.1001', symbol: 'XAUUSD', direction: 'long', lots: 0.5, entryPx: 2900, exitPx: 2910, sl: 2890, tp: 2920, commission: -3.5, swap: 0, profit: 500, contractSize: 100 });
    expect(eur).toMatchObject({ symbol: 'EURUSD', direction: 'short', tp: null, commission: -7, swap: -2.1, contractSize: 100_000 });
    expect(xau.openTime).toBe(Date.UTC(2026, 2, 2, 8, 0, 0));
    expect(r.skipped).toBeGreaterThanOrEqual(2);
  });

  it('parses UTF-16 MT5 report with hidden cells only in data rows', () => {
    const r = parseStatement(decodeStatement(utf16(MT5)), { serverTime: 'ny' });
    expect(r.format).toBe('mt5');
    expect(r.login).toBe('87654321');
    expect(r.currency).toBe('USD');
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0]).toMatchObject({ ticket: '5001', symbol: 'UKOUSD', lots: 1, entryPx: 80, exitPx: 81.5, profit: 150, contractSize: 100 });
    // تابستان آمریکا: سرور UTC+3
    expect(r.trades[0].openTime).toBe(Date.UTC(2026, 6, 1, 7, 0, 0));
  });

  it('keeps overlapping hedge-account positions as separate directional trades', () => {
    const r = parseStatement(MT5, { serverTime: 3 });
    const trades = r.trades.map(mtToTrade);
    expect(new Set(trades.map((t) => t.id)).size).toBe(2);
    expect(trades[0]).toMatchObject({ venue: 'metatrader', base: 'UKO', grossPnl: 150, fees: 5, funding: 0, netPnl: 145, maxSize: 100, maxNotional: 8000 });
    expect(trades[1].netPnl).toBeCloseTo(21.5);
    const classified = classifyTrades(trades, DEFAULT_SETTINGS, new Map(), Date.UTC(2026, 7, 1));
    expect(classified.every((t) => t.book === 'directional')).toBe(true);
  });

  it('reads CSV with the same headers and asks for login when missing', () => {
    const csv = 'Time;Position;Symbol;Type;Volume;Price;S / L;T / P;Time;Price;Commission;Swap;Profit\n2026.01.15 10:00:00;7;EURUSD;buy;0,10;1,0400;;;2026.01.15 12:00:00;1,0450;-0,70;0;50';
    expect(csvRows(csv)[1]).toHaveLength(13);
    const r = parseStatement(csv, { serverTime: 'ny' });
    expect(r.format).toBe('csv');
    expect(r.login).toBeNull();
    expect(r.warnings[0]).toContain('شمارهٔ حساب');
    expect(r.trades[0]).toMatchObject({ lots: 0.1, entryPx: 1.04, contractSize: 100_000 });
    // زمستان آمریکا: سرور UTC+2
    expect(r.trades[0].openTime).toBe(Date.UTC(2026, 0, 15, 8, 0, 0));
    expect(parseStatement(csv, { serverTime: 'ny', login: '555' }).trades[0].id).toBe('jt:555.7');
  });

  it('helpers', () => {
    expect(normalizeMtSymbol('EURUSDm')).toBe('EURUSD');
    expect(normalizeMtSymbol('XAUUSD+')).toBe('XAUUSD');
    expect(normalizeMtSymbol('#UKOUSD')).toBe('UKOUSD');
    expect(mtNumber('10 000.50')).toBe(10000.5);
    expect(mtNumber('1,25')).toBe(1.25);
    expect(mtNumber('')).toBeNull();
    expect(mtTime('2026.03.08 23:59', 0)).toBe(Date.UTC(2026, 2, 8, 23, 59));
    expect(mtTime('garbage', 0)).toBeNull();
    // نماد با ارز دوم غیردلاری: اندازهٔ قرارداد گرد نمی‌شود
    expect(inferContractSizes([{ ticket: '1', symbol: 'USDJPY', direction: 'long', openTime: 0, closeTime: 1, entryPx: 150, exitPx: 151, lots: 1, sl: null, tp: null, commission: 0, swap: 0, profit: 662.25 }]).USDJPY).toBeNull();
  });
});
