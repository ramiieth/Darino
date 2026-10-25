// @vitest-environment node
/**
 * نگهبان ادغام فانکشن‌ها: هر مسیر عمومی /api/* باید
 *  ۱) در vercel.json به فانکشن گروهی خودش rewrite شود
 *  ۲) در فانکشن گروهی loader داشته باشد و هندلر اصلی را با req.url اصلی صدا بزند
 * تا ادغام هیچ endpointی را حذف یا جابه‌جا نکند.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { API_GROUPS, ROUTE_PARAM, groupOf, type ApiGroup } from '../../api/_routes';
import { groupHandler } from '../../api/_dispatch';

const root = path.resolve(__dirname, '../..');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8')) as {
  functions: Record<string, unknown>;
  rewrites: { source: string; destination: string }[];
  crons: { path: string }[];
};
const groups = Object.keys(API_GROUPS) as ApiGroup[];
const routes = groups.flatMap((g) => API_GROUPS[g].map((r) => [g, r] as const));

describe('نقشهٔ مسیرهای API', () => {
  it('همهٔ ۱۲ مسیر عمومی قبل از ادغام هنوز وجود دارند', () => {
    expect(routes.map(([, r]) => r)).toEqual(
      expect.arrayContaining(['accounting', 'auth', 'boros', 'borosAccount', 'cg', 'custody', 'dashboard', 'health', 'integrations', 'portfolio', 'propertyMarket', 'usdt'])
    );
  });

  it.each(routes)('%s/%s: rewrite در vercel.json و ماژول هندلر وجود دارد', (group, route) => {
    expect(vercel.rewrites).toContainEqual({ source: `/api/${route}`, destination: `/api/${group}?${ROUTE_PARAM}=${route}` });
    expect(existsSync(path.join(root, 'api', `_${route}Route.ts`))).toBe(true);
    expect(existsSync(path.join(root, 'api', `${route}.ts`))).toBe(false);
    expect(groupOf(route)).toBe(group);
  });

  it.each(groups)('فانکشن گروهی %s فایل، پیکربندی و loader کامل دارد', (group) => {
    const file = path.join(root, 'api', `${group}.ts`);
    expect(existsSync(file)).toBe(true);
    expect(vercel.functions[`api/${group}.ts`]).toBeDefined();
    const src = readFileSync(file, 'utf8');
    for (const route of API_GROUPS[group]) expect(src).toContain(`import('./_${route}Route.js')`);
  });

  it('همهٔ rewriteها و کرون‌ها به فانکشن موجود و مسیر شناخته‌شده می‌رسند', () => {
    for (const target of [...vercel.rewrites.map((r) => r.destination), ...vercel.crons.map((c) => c.path)]) {
      const url = new URL(target, 'http://x');
      const group = url.pathname.replace('/api/', '') as ApiGroup;
      expect(groups).toContain(group);
      expect(groupOf(url.searchParams.get(ROUTE_PARAM) ?? '')).toBe(group);
    }
    expect(Object.keys(vercel.functions).every((f) => existsSync(path.join(root, f)))).toBe(true);
  });

  it('فانکشن services پیکربندی bodyParser:false وب‌هوک را حفظ کرده', () => {
    expect(readFileSync(path.join(root, 'api/services.ts'), 'utf8')).toContain('bodyParser: false');
  });
});

describe('dispatcher فانکشن گروهی', () => {
  function setup() {
    const seen: string[] = [];
    const handler = groupHandler<'markets'>({
      cg: async () => ({ default: async (req) => void seen.push(`cg ${req.url}`) }),
      usdt: async () => ({ default: async (req) => void seen.push(`usdt ${req.url}`) }),
      boros: async () => ({ default: async (req) => void seen.push(`boros ${req.url}`) }),
      propertyMarket: async () => ({ default: async (req) => void seen.push(`pm ${req.url}`) })
    });
    const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
    const call = (url: string) => handler({ url } as IncomingMessage, res as unknown as ServerResponse);
    return { seen, res, call };
  }

  it('rewrite ورسل: __fn حذف و req.url اصلی بازسازی می‌شود', async () => {
    const { seen, call } = setup();
    await call('/api/markets?__fn=usdt&source=bitpin&history=1');
    expect(seen).toEqual(['usdt /api/usdt?source=bitpin&history=1']);
  });

  it('پروکسی: __p برای resolveProxyTarget دست‌نخورده می‌ماند', async () => {
    const { seen, call } = setup();
    await call('/api/markets?__fn=cg&__p=/coins/markets&vs_currency=usd');
    expect(seen).toEqual(['cg /api/cg?__p=%2Fcoins%2Fmarkets&vs_currency=usd']);
  });

  it('بدون __fn (مسیر اصلی یا زیرمسیر) هم کار می‌کند', async () => {
    const { seen, call } = setup();
    await call('/api/boros/v1/markets?x=1');
    expect(seen).toEqual(['boros /api/boros/v1/markets?x=1']);
  });

  it('مسیر ناشناخته یا متعلق به گروه دیگر → ۴۰۴', async () => {
    for (const url of ['/api/markets?__fn=auth', '/api/markets', '/api/markets?__fn=__proto__']) {
      const { seen, res, call } = setup();
      await call(url);
      expect(seen).toEqual([]);
      expect(res.statusCode).toBe(404);
    }
  });
});
