/**
 * کاتالوگ اهواز — نرمال‌سازی و تطبیق محله‌ها (بدون حدس/انتساب جعلی)
 */
import { describe, it, expect } from 'vitest';
import { normalizeFaText, resolveNeighborhood, neighborhoodDisplayName, keyFromUnknownName } from './catalog';

describe('normalizeFaText', () => {
  it('ی/ک عربی و نیم‌فاصله نرمال می‌شوند', () => {
    expect(normalizeFaText('كيان‌پارس')).toBe('کیانپارس');
    expect(normalizeFaText('زیتون  کارمندی')).toBe('زیتون کارمندی');
  });
});

describe('resolveNeighborhood', () => {
  it('نام رسمی → کلید کاتالوگ', () => {
    expect(resolveNeighborhood('کیانپارس').key).toBe('kianpars');
    expect(resolveNeighborhood('زیتون کارمندی').key).toBe('zeytoon-karmandi');
    expect(resolveNeighborhood('پادادشهر').key).toBe('padad');
  });
  it('نیم‌فاصله/یای عربی هم تطبیق می‌شود', () => {
    expect(resolveNeighborhood('كيان پارس').key).toBe('kianpars');
    expect(resolveNeighborhood('گلستان').key).toBe('golestan');
  });
  it('نام ناشناخته → کلید خام مکانیکی (هرگز حدس)', () => {
    const r = resolveNeighborhood('محله ناشناخته ایکس');
    expect(r.key).toBe(keyFromUnknownName('محله ناشناخته ایکس'));
    expect(r.key!.startsWith('raw:')).toBe(true);
    expect(r.displayName).toBe('محله ناشناخته ایکس');
  });
  it('خالی → تهی', () => {
    expect(resolveNeighborhood(null).key).toBeNull();
    expect(resolveNeighborhood('   ').key).toBeNull();
  });
  it('نام ترکیبی با کلمه کامل → محله پایه', () => {
    expect(resolveNeighborhood('کیانپارس، فاز ۲').key).toBe('kianpars');
  });
});

describe('neighborhoodDisplayName', () => {
  it('کلید کاتالوگ → نام فارسی', () => {
    expect(neighborhoodDisplayName('kianpars')).toBe('کیانپارس');
  });
  it('کلید خام → خود نام', () => {
    expect(neighborhoodDisplayName('raw:محله جدید')).toBe('محله جدید');
  });
  it('تهی → نامشخص', () => {
    expect(neighborhoodDisplayName(null)).toBe('نامشخص');
  });
});
