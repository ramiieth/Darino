/**
 * پروتکل پل مرورگر — ورودی نامطمئن (پیام/فایل) باید سخت‌گیرانه اعتبارسنجی شود
 */
import { describe, it, expect } from 'vitest';
import {
  BRIDGE_KIND,
  MAX_SEEDS_PER_PAYLOAD,
  detectSource,
  isBridgeLaunch,
  isAllowedBridgeOrigin,
  makeSeedPayload,
  parseSeedPayload,
  sanitizeSeed
} from './protocol';
import { emptySeed } from '../collector/parse';

function goodSeed(token = 'gagCBuEm') {
  const s = emptySeed(token);
  s.areaSqm = 90;
  s.totalPriceToman = 3_100_000_000;
  s.neighborhood = 'گلستان';
  return s;
}

describe('parseSeedPayload', () => {
  it('payload سالم (ساخته makeSeedPayload) پذیرفته می‌شود', () => {
    const p = makeSeedPayload({ source: 'divar', cityId: '7', seeds: [goodSeed()], via: 'bridge', collectedAt: 1 });
    const r = parseSeedPayload(JSON.parse(JSON.stringify(p)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.seeds[0].areaSqm).toBe(90);
      expect(r.payload.cityId).toBe('7');
      expect(r.payload.collectedAt).toBe(1);
    }
  });

  it('ساختار نادرست → خطای فارسی قابل فهم', () => {
    expect(parseSeedPayload(null)).toMatchObject({ ok: false });
    expect(parseSeedPayload({ kind: 'other' })).toMatchObject({ ok: false, error: expect.stringContaining('دارینو') });
    expect(parseSeedPayload({ kind: BRIDGE_KIND, version: 99, source: 'divar', seeds: [] })).toMatchObject({ ok: false });
    expect(parseSeedPayload({ kind: BRIDGE_KIND, version: 1, source: 'evil', seeds: [] })).toMatchObject({ ok: false });
    expect(parseSeedPayload({ kind: BRIDGE_KIND, version: 1, source: 'divar', seeds: 'x' })).toMatchObject({ ok: false });
    expect(parseSeedPayload({ kind: BRIDGE_KIND, version: 1, source: 'divar', seeds: [{ token: '' }] })).toMatchObject({ ok: false });
  });

  it('سقف تعداد seed', () => {
    const seeds = Array.from({ length: MAX_SEEDS_PER_PAYLOAD + 1 }, (_, i) => goodSeed(`t${i}`));
    expect(parseSeedPayload({ kind: BRIDGE_KIND, version: 1, source: 'divar', seeds })).toMatchObject({ ok: false });
  });

  it('cityId نامعتبر → null', () => {
    const r = parseSeedPayload({ kind: BRIDGE_KIND, version: 1, source: 'divar', cityId: '<script>', seeds: [goodSeed()] });
    expect(r.ok && r.payload.cityId).toBeNull();
  });
});

describe('sanitizeSeed', () => {
  it('فقط فیلدهای شناخته‌شده با نوع درست کپی می‌شوند', () => {
    const s = sanitizeSeed(
      {
        token: 'abc_1-2',
        areaSqm: '90', // رشته → null (نوع اشتباه)
        totalPriceToman: 5e9,
        parking: 'yes', // → null
        elevator: false,
        propertyKind: 'castle', // → unknown
        evil: '<img onerror>',
        url: 'javascript:alert(1)' // → لینک پیش‌فرض دیوار
      },
      'divar'
    )!;
    expect(s.areaSqm).toBeNull();
    expect(s.totalPriceToman).toBe(5e9);
    expect(s.parking).toBeNull();
    expect(s.elevator).toBe(false);
    expect(s.propertyKind).toBe('unknown');
    expect((s as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect(s.url).toBe('https://divar.ir/v/abc_1-2');
  });

  it('توکن با کاراکتر غیرمجاز → رد', () => {
    expect(sanitizeSeed({ token: '../../x' }, 'divar')).toBeNull();
    expect(sanitizeSeed({ token: 'a b' }, 'divar')).toBeNull();
    expect(sanitizeSeed('str', 'divar')).toBeNull();
  });

  it('لینک شیپور/دیوار معتبر حفظ می‌شود', () => {
    expect(sanitizeSeed({ token: 'sh-1', url: 'https://www.sheypoor.com/v/x-1.html' }, 'sheypoor')!.url).toBe(
      'https://www.sheypoor.com/v/x-1.html'
    );
    expect(sanitizeSeed({ token: 'sh-1', url: 'https://evil.com/v/x' }, 'sheypoor')!.url).not.toContain('evil');
  });
});

describe('origin و منبع', () => {
  it('فقط originهای دیوار/شیپور مجازند', () => {
    expect(isAllowedBridgeOrigin('https://divar.ir')).toBe(true);
    expect(isAllowedBridgeOrigin('https://www.sheypoor.com')).toBe(true);
    expect(isAllowedBridgeOrigin('https://divar.ir.evil.com')).toBe(false);
    expect(isAllowedBridgeOrigin('http://divar.ir')).toBe(false);
    expect(isAllowedBridgeOrigin('null')).toBe(false);
  });

  it('detectSource از hostname', () => {
    expect(detectSource('divar.ir')).toBe('divar');
    expect(detectSource('www.divar.ir')).toBe('divar');
    expect(detectSource('www.sheypoor.com')).toBe('sheypoor');
    expect(detectSource('divar.ir.evil.com')).toBeNull();
    expect(detectSource('localhost')).toBeNull();
  });
});

describe('isBridgeLaunch (HashRouter)', () => {
  it('پرچم در hash یا query', () => {
    expect(isBridgeLaunch('', '#/property-market?bridge=1')).toBe(true);
    expect(isBridgeLaunch('?bridge=1', '')).toBe(true);
    expect(isBridgeLaunch('', '#/property-market')).toBe(false);
    expect(isBridgeLaunch('', '')).toBe(false);
  });
});
