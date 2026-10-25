/** ============================================================
 * _dispatch — هندلر فانکشن گروهی: درخواست را به هندلر مسیر اصلی می‌سپارد
 *
 *  ۱) نام مسیر از `__fn` (rewrite ورسل) یا در نبودش از خود مسیر (/api/usdt) خوانده می‌شود
 *  ۲) req.url به شکل اصلی (/api/usdt?…) بازگردانده می‌شود تا هندلرها دقیقاً
 *     همان ورودی قبل از ادغام را ببینند (`__p` پروکسی‌ها دست‌نخورده می‌ماند)
 *  ۳) ماژول مسیر با import پویا بار می‌شود — Cold start فقط هزینهٔ همان مسیر را دارد
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_neon.js';
import { ROUTE_PARAM, type ApiGroup, type GroupRoute } from './_routes.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export type RouteLoaders<G extends ApiGroup> = Record<GroupRoute<G>, () => Promise<{ default: Handler }>>;

export function groupHandler<G extends ApiGroup>(loaders: RouteLoaders<G>): Handler {
  const table = loaders as Record<string, () => Promise<{ default: Handler }>>;
  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://internal');
    const fromPath = url.pathname.replace(/^\/api\//, '').split('/')[0];
    const name = url.searchParams.get(ROUTE_PARAM) ?? fromPath;
    if (!Object.hasOwn(table, name)) {
      json(res, 404, { ok: false, error: 'not found' });
      return;
    }
    url.searchParams.delete(ROUTE_PARAM);
    const rest = name === fromPath ? url.pathname : `/api/${name}`;
    req.url = rest + url.search;
    const { default: route } = await table[name]();
    await route(req, res);
  };
}
