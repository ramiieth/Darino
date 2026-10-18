/**
 * Derive proxy — trimming of real-shaped responses (no network)
 */
import { describe, expect, it } from 'vitest';
import { pickExpiry30, trimCurrencies, trimHistory, trimInstruments, trimPerp, trimTickers } from '../../api/_derive';

describe('trimCurrencies', () => {
  it('only currencies with an options market; OI summed across risk universes', () => {
    const r = trimCurrencies([
      { currency: 'ETH', spot_price: '2389.6', spot_price_24h: '2410', option: { name: 'ETH-OPTION', universes: [{ oi: { current_open_interest: '300000' } }, { oi: { current_open_interest: '18676.7' } }] } },
      { currency: 'AAVE', spot_price: '100', option: null },
      { currency: 'bad name!', option: { name: 'x' } }
    ]);
    expect(r).toEqual([{ currency: 'ETH', spot: 2389.6, spot24h: 2410, optionOi: 318676.7 }]);
  });
});

describe('trimInstruments', () => {
  it('active, unexpired expiries as YYYYMMDD, sorted and unique; fees and min size', () => {
    const now = Date.UTC(2026, 9, 18) / 1000;
    const inst = (expiry: number, is_active = true) => ({
      is_active,
      minimum_amount: '0.1',
      amount_step: '0.01',
      maker_fee_rate: '0.0001',
      taker_fee_rate: '0.0003',
      base_fee: '0.5',
      mark_price_fee_rate_cap: '0.125',
      option_details: { expiry, strike: '3000', option_type: 'C' }
    });
    const nov = Date.UTC(2026, 10, 27, 8) / 1000;
    const oct = Date.UTC(2026, 9, 23, 8) / 1000;
    const r = trimInstruments({ instruments: [inst(nov), inst(oct), inst(oct), inst(Date.UTC(2027, 0, 1) / 1000, false), inst(now - 10)] }, now);
    expect(r.expiries).toEqual(['20261023', '20261127']);
    expect(r).toMatchObject({ minAmount: 0.1, amountStep: 0.01, makerFeeRate: 0.0001, takerFeeRate: 0.0003, baseFee: 0.5, feeCapRate: 0.125 });
  });
});

describe('trimTickers', () => {
  it('maps Derive short keys; zero bid/ask = none; sorted by strike', () => {
    const r = trimTickers({
      tickers: {
        'ETH-20261127-3000-C': {
          A: '125.57', a: '23.7', B: '213.54', b: '20.7', I: '2389.6', M: '21.6',
          option_pricing: { d: '0.11509', t: '-1.01764', g: '0.00046645', v: '1.53779', i: '0.52587', f: '2399.7', m: '21.6', bi: '0.51956', ai: '0.53894' },
          stats: { v: '82644.122', oi: '793.6' }
        },
        'ETH-20261127-2000-P': { a: '0', b: '0', M: '15', option_pricing: { d: '-0.1', i: '0.6' }, stats: {} },
        'garbage': {}
      }
    });
    expect(r.index).toBe(2389.6);
    expect(r.forward).toBe(2399.7);
    expect(r.options.map((o) => o.name)).toEqual(['ETH-20261127-2000-P', 'ETH-20261127-3000-C']);
    expect(r.options[1]).toMatchObject({ strike: 3000, type: 'C', bid: 20.7, ask: 23.7, mark: 21.6, iv: 0.52587, delta: 0.11509, theta: -1.01764, oi: 793.6 });
    expect(r.options[0]).toMatchObject({ bid: null, ask: null, oi: null });
  });
});

describe('trimPerp / trimHistory', () => {
  it('perp mark and hourly funding; daily closes ascending in ms', () => {
    expect(trimPerp({ tickers: { 'ETH-PERP': { M: '2386.08', I: '2387.02', f: '0.0000125' } } }, 'ETH')).toEqual({ mark: 2386.08, index: 2387.02, fundingHourly: 0.0000125 });
    expect(trimPerp(null, 'ETH')).toEqual({ mark: null, index: null, fundingHourly: null });
    expect(trimHistory([{ timestamp: 200, close_price: '2' }, { timestamp: 100, price: '1' }, { timestamp: 300, close_price: '0' }])).toEqual([
      { t: 100_000, close: 1 },
      { t: 200_000, close: 2 }
    ]);
  });
});

describe('pickExpiry30', () => {
  it('۱۴ تا ۴۵ روز، نزدیک‌ترین به ۳۰؛ در نبود آن ≥ ۷ روز', () => {
    const now = Date.UTC(2026, 9, 1, 8);
    expect(pickExpiry30(['20261003', '20261016', '20261030', '20261127'], now)).toBe('20261030');
    expect(pickExpiry30(['20261003', '20261010'], now)).toBe('20261010');
    expect(pickExpiry30(['20261002'], now)).toBe('20261002');
  });
});
