/** همگام‌سازی فهرست پایش با سرور: حذف‌شده‌ها زنده نمی‌شوند؛ زنگ‌های بیرون از حساب اضافه می‌شوند */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ funding: [] as unknown[], saved: [] as unknown[] }));
vi.mock('@/features/alerts/data/alertsApi', () => ({
  getAlertsStatus: async () => ({ rules: { funding: server.funding, liquidation: { enabled: true, thresholdPct: 15 } } }),
  saveAlertRules: async (rules: unknown) => { server.saved.push(rules); return { rules }; }
}));
vi.mock('@/shared/lib/db', () => ({ settingGet: async (_k: string, f: unknown) => f, settingSet: async () => undefined }));

import { useAuth } from '@/features/auth/authClient';
import { syncWithServer, toggleWatch, useSpreadWatch } from './spreadAlerts';

const pair = (base: string) => ({ key: `${base}:arcus>lighter`, base, shortVenue: 'arcus' as const, shortRef: `${base}-USD`, longVenue: 'lighter' as const, longRef: '1' });

describe('spreadAlerts ↔ سرور', () => {
  beforeEach(() => { server.funding = []; server.saved = []; useSpreadWatch.setState({ hydrated: true, entries: [] }); });

  it('جفتی که روی سرور حذف شده از فهرست محلی برنمی‌گردد', async () => {
    useAuth.setState({ status: 'authenticated' });
    useSpreadWatch.setState({ entries: [{ ...pair('BTC'), lastSign: 1 }] });
    await syncWithServer();
    expect(useSpreadWatch.getState().entries).toEqual([]);
    expect(server.saved).toEqual([]);
  });

  it('زنگ بیرون از حساب، بعد از ورود به سرور اضافه می‌شود', async () => {
    useAuth.setState({ status: 'unauthenticated' });
    toggleWatch(pair('ETH'));
    expect(useSpreadWatch.getState().entries[0].localOnly).toBe(true);
    useAuth.setState({ status: 'authenticated' });
    await syncWithServer();
    expect(useSpreadWatch.getState().entries.map((e) => e.key)).toEqual(['ETH:arcus>lighter']);
    expect(useSpreadWatch.getState().entries[0].localOnly).toBeUndefined();
    expect((server.saved[0] as { funding: { key: string }[] }).funding.map((w) => w.key)).toEqual(['ETH:arcus>lighter']);
  });
});
