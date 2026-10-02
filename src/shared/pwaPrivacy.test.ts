/**
 * نگهبان حریم خصوصی PWA — پاسخ حساب‌ها هرگز در cache سرویس‌ورکر نباشد
 * (بررسی متنی پیکربندی Workbox، مثل responsiveGuards)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8');
const runtime = config.slice(config.indexOf('runtimeCaching:'), config.indexOf('resolve:'));

describe('PWA — نبود cache خصوصی', () => {
  it('هیچ قاعدهٔ runtimeCaching برای Arcus یا APIهای مالی وجود ندارد', () => {
    for (const pattern of ['arcus', '/api/accounting', '/api/portfolio', '/api/dashboard', '/api/health', 'urlPattern: /.*/']) {
      expect(runtime.toLowerCase()).not.toContain(pattern.toLowerCase());
    }
  });

  it('فقط دادهٔ عمومی بازار کش می‌شود', () => {
    const patterns = runtime.match(/urlPattern:/g) ?? [];
    expect(patterns).toHaveLength(1);
    expect(runtime).toContain("startsWith('/api/cg')");
  });

  it('مسیرهای /api از navigateFallback مستثنی‌اند', () => {
    expect(config).toContain('navigateFallbackDenylist: [/^\\/api\\//]');
  });

  it('کلاینت Arcus با cache: no-store و بدون کوکی درخواست می‌دهد', () => {
    const client = readFileSync(path.resolve(__dirname, '../features/arcus/api/client.ts'), 'utf8');
    expect(client).toContain("cache: 'no-store'");
    expect(client).toContain("credentials: 'omit'");
  });

  it('دادهٔ دارایی چندشبکه‌ای به سرور ارسال نمی‌شود', () => {
    const repo = readFileSync(path.resolve(__dirname, '../features/custody/data/repository.ts'), 'utf8');
    expect(repo).not.toMatch(/fetch\(|apiUrl|fetchJson/);
  });
});
