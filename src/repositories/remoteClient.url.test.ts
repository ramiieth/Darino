/**
 * رگرسیون: «/api/api/…» — ریشه خطای «سرور در دسترس نیست»
 * (health و همه همگام‌سازی‌ها به مسیر اشتباه ۴۰۴ می‌خوردند)
 */
import { describe, it, expect } from 'vitest';
import { apiUrl } from './remoteClient';

describe('apiUrl', () => {
  it('مسیر با /api/ دوباره پیشوند نمی‌گیرد', () => {
    expect(apiUrl('/api/health')).toBe('/api/health');
    expect(apiUrl('/api/propertyMarket')).toBe('/api/propertyMarket');
    expect(apiUrl('/api/accounting?x=1')).toBe('/api/accounting?x=1');
  });
  it('مسیر نسبی پیشوند می‌گیرد', () => {
    expect(apiUrl('/health')).toBe('/api/health');
    expect(apiUrl('health')).toBe('/api/health');
  });
  it('مسیرهای شبیه ولی متفاوت', () => {
    expect(apiUrl('/apix')).toBe('/api/apix');
  });
});
