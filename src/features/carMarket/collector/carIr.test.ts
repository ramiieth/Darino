import { describe, expect, it, vi } from 'vitest';
import fixture from './__fixtures__/carir-prices.json';
import { CAR_IR_PRICES_URL, canonicalBrand, fetchCarIrPrices, parseCarIrIndex, parsePrice } from './carIr';

describe('car.ir — پارس فهرست قیمت', () => {
  const parsed = parseCarIrIndex(fixture);

  it('مدل تکراری زیر چند برند فقط یک بار می‌آید', () => {
    const ids = parsed.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // آیتو M5 زیر «آیتو» و «ایرس»؛ آریزو زیر «چری» و «ام‌وی‌ام»
    expect(parsed.rows.filter((r) => r.modelId === '1017')).toHaveLength(2);
    expect(parsed.rows.filter((r) => r.modelId === '882')).toHaveLength(3);
  });

  it('برند اصلی از لینک مدل (نه برندی که زیرش فهرست شده)', () => {
    expect(parsed.rows.find((r) => r.modelId === '1017')?.brand).toBe('eres');
    expect(parsed.rows.find((r) => r.modelId === '882')?.brand).toBe('chery');
    expect(parsed.rows.find((r) => r.modelId === '810')?.brand).toBe('iran-khodro'); // هایما — اسلاگ haima در این فیکسچر نیست
  });

  it('قیمت بازار/کارخانه به تومان، زمان و درصد تغییر منبع', () => {
    const aito = parsed.rows.find((r) => r.id === '31')!;
    expect(aito).toMatchObject({ model: 'آیتو M5', year: '2025', market: 12_800_000_000, dealer: 7_449_000_000, srcChangePct: 0 });
    expect(aito.marketUpdatedAt).toBe(Date.parse('2026-10-03T05:30:00Z'));
    expect(parsed.sourceUpdatedAt).toBeGreaterThanOrEqual(aito.marketUpdatedAt!);
    expect(parsed.brandNames.kia).toBe('کیا');
  });

  it('parsePrice: جداکننده/ارقام فارسی و بازه معقول', () => {
    expect(parsePrice('1,234,000,000')).toBe(1_234_000_000);
    expect(parsePrice('۱٬۲۰۰٬۰۰۰٬۰۰۰')).toBe(1_200_000_000);
    expect(parsePrice('0')).toBeNull();
    expect(parsePrice('12000')).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });

  it('canonicalBrand: طولانی‌ترین اسلاگ منطبق؛ نبود → برند فهرست', () => {
    expect(canonicalBrand('/5-great-wall-h6', ['great', 'great-wall'], 'x')).toBe('great-wall');
    expect(canonicalBrand('/5-unknown-car', ['kia'], 'saipa')).toBe('saipa');
  });

  it('پاسخ نامعتبر → فهرست خالی (بدون خطا)', () => {
    expect(parseCarIrIndex(null).rows).toEqual([]);
    expect(parseCarIrIndex({ data: 'x' }).rows).toEqual([]);
  });

  it('fetchCarIrPrices: POST به API و خطا روی فهرست خالی', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    const r = await fetchCarIrPrices(ok);
    expect(ok).toHaveBeenCalledWith(CAR_IR_PRICES_URL, expect.objectContaining({ method: 'POST' }));
    expect(r.rows.length).toBeGreaterThan(10);
    const empty = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(fetchCarIrPrices(empty)).rejects.toThrow('empty');
    const bad = vi.fn(async () => new Response('x', { status: 503 }));
    await expect(fetchCarIrPrices(bad)).rejects.toThrow('HTTP 503');
  });
});
