import { afterEach, describe, expect, it, vi } from 'vitest';
import { prioritize, weighted } from './tradersApi';

afterEach(() => vi.useRealTimers());

describe('صف وزنی', () => {
  it('سقف وزن را رعایت می‌کند، priority کمتر زودتر و کارنامهٔ بازشده جلوی صف می‌رود', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const job = (name: string) => async () => void order.push(name);
    // ظرفیت اولیه ۴۰۰ ← اولی فوری، بقیه منتظر پر شدن سطل
    const all = [
      weighted(300, job('first')),
      weighted(300, job('fills-a'), 1, 'a'),
      weighted(300, job('fills-b'), 1, 'b'),
      weighted(20, job('portfolio-c'), 0, 'c')
    ];
    prioritize('b');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['first']);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await Promise.all(all);
    expect(order).toEqual(['first', 'fills-b', 'portfolio-c', 'fills-a']);
  });
});
