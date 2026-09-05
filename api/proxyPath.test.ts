// @vitest-environment node
/**
 * رگرسیون: زیرمسیر پروکسی نباید گم شود.
 *
 * باگ اصلی: rewrite «/api/cg/(.*) → /api/cg» زیرمسیر را حذف می‌کرد،
 * پس handler به ریشه CoinGecko درخواست می‌داد، پاسخ نامعتبر بود و
 * بازار کریپتو همیشه روی «اسنپ‌شات آفلاین» می‌ماند.
 */
import { describe, expect, it } from 'vitest';
import { resolveProxyTarget, PATH_PARAM } from './_proxyPath.js';

describe('resolveProxyTarget — حفظ زیرمسیر پروکسی', () => {
  it('حالت Vercel: زیرمسیر از __p بازسازی می‌شود', () => {
    const { path, search } = resolveProxyTarget(
      `/api/cg?${PATH_PARAM}=/coins/markets&vs_currency=usd&per_page=200`,
      '/api/cg'
    );
    expect(path).toBe('/coins/markets');
    expect(search.get('vs_currency')).toBe('usd');
    expect(search.get('per_page')).toBe('200');
    // پارامتر داخلی هرگز به upstream نمی‌رود
    expect(search.get(PATH_PARAM)).toBeNull();
  });

  it('حالت مستقیم: زیرمسیر داخل خود URL', () => {
    const { path, search } = resolveProxyTarget('/api/cg/coins/markets?vs_currency=usd', '/api/cg');
    expect(path).toBe('/coins/markets');
    expect(search.get('vs_currency')).toBe('usd');
  });

  it('مسیر تودرتو کامل حفظ می‌شود', () => {
    expect(resolveProxyTarget('/api/cg/coins/bitcoin/market_chart', '/api/cg').path).toBe(
      '/coins/bitcoin/market_chart'
    );
    expect(
      resolveProxyTarget(`/api/cg?${PATH_PARAM}=/coins/bitcoin/market_chart`, '/api/cg').path
    ).toBe('/coins/bitcoin/market_chart');
  });

  it('بدون زیرمسیر → ریشه', () => {
    expect(resolveProxyTarget('/api/cg', '/api/cg').path).toBe('/');
  });

  it('برای Boros هم کار می‌کند', () => {
    expect(resolveProxyTarget(`/api/boros?${PATH_PARAM}=/markets`, '/api/boros').path).toBe('/markets');
    expect(resolveProxyTarget('/api/boros/markets', '/api/boros').path).toBe('/markets');
  });

  it('URL نهایی CoinGecko شامل مسیر واقعی است (نه ریشه)', () => {
    const { path, search } = resolveProxyTarget(
      `/api/cg?${PATH_PARAM}=/coins/markets&vs_currency=usd`,
      '/api/cg'
    );
    const upstream = new URL(`https://api.coingecko.com/api/v3${path}`);
    search.forEach((v: string, k: string) => upstream.searchParams.set(k, v));
    expect(upstream.pathname).toBe('/api/v3/coins/markets');
    expect(upstream.toString()).toContain('vs_currency=usd');
  });
});
