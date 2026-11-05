import { describe, expect, it } from 'vitest';
import { entryGuide } from './stableGuide';
import type { StableMarket } from './stableYield';

const m = (p: Partial<StableMarket>): StableMarket => ({ pool: 'pool-1', project: 'aave-v3', chain: 'Ethereum', symbol: 'USDC', meta: null, tvlUsd: 1e8, apyNow: 4, rewardNow: 0, kind: 'lending', restricted: false, lockup: null, direct: 'USDC', ...p });

describe('entryGuide', () => {
  it('بازار مستقیم با نشانی رسمی: کیف پول و کارمزد شبکه، Approve و Deposit، بدون مرحلهٔ تبدیل', () => {
    const g = entryGuide(m({}), 'USDC');
    expect(g).toMatchObject({ official: true, url: 'https://app.aave.com', host: 'app.aave.com' });
    expect(g.steps.join(' ')).toContain('متامسک');
    expect(g.steps.join(' ')).toContain('Approve');
    expect(g.steps.join(' ')).not.toContain('تبدیل کنید');
  });

  it('دلار متفاوت با بازار → مرحلهٔ تبدیل؛ سولانا بدون Approve', () => {
    const g = entryGuide(m({ project: 'jupiter-lend', chain: 'Solana' }), 'USDT');
    expect(g.steps.join(' ')).toContain('تتر را به یو اس دی سی تبدیل کنید');
    expect(g.steps.join(' ')).toContain('فانتوم');
    expect(g.steps.join(' ')).not.toContain('Approve');
  });

  it('فقط‌نهادی یا پروژهٔ ناشناخته → صفحهٔ DeFiLlama و هشدار', () => {
    const r = entryGuide(m({ project: 'blackrock-buidl', restricted: true, direct: null, symbol: 'BUIDL', kind: 'treasury' }), 'USDC');
    expect(r).toMatchObject({ official: false, url: 'https://defillama.com/yields/pool/pool-1' });
    expect(r.steps.join(' ')).toContain('KYC');
    const u = entryGuide(m({ project: 'brand-new' }), 'USDC');
    expect(u.official).toBe(false);
    expect(u.warnings.join(' ')).toContain('بررسی نشده');
  });

  it('دورهٔ خروج و هشدارهای ایمنی', () => {
    const g = entryGuide(m({ project: 'ethena-usde', symbol: 'SUSDE', direct: null, lockup: '۷ روز', kind: 'synthetic' }), 'USDT');
    expect(g.exit).toContain('۷ روزه');
    expect(g.warnings.join(' ')).toContain('Seed');
    expect(g.warnings.join(' ')).toContain('مبلغ کم');
  });
});

describe('entryGuide — بازار هم‌خانواده', () => {
  it('اگر همین پروتکل نسخهٔ تتر دارد، به‌جای تبدیل همان پیشنهاد می‌شود', () => {
    const usdc = m({ project: 'maple', meta: 'Syrup USDC', kind: 'credit' });
    const usdt = m({ project: 'maple', meta: 'Syrup USDT', symbol: 'USDT', direct: 'USDT', kind: 'credit' });
    const g = entryGuide(usdc, 'USDT', usdt);
    expect(g.steps.join(' ')).toContain('بازار Syrup USDT را هم دارد');
    expect(entryGuide(usdc, 'USDC').steps.join(' ')).toContain('توکن سهم همین بازار');
  });
});
