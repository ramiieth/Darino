/** ============================================================
 * _routes — نقشهٔ واحد مسیرهای عمومی API به فانکشن‌های گروهی ورسل
 *
 * چرا؟ پلن Hobby ورسل حداکثر ۱۲ فانکشن می‌پذیرد. به‌جای یک فانکشن برای هر مسیر،
 * مسیرها بر اساس دامنه در چند فانکشن گروهی بسته‌بندی می‌شوند و URLهای عمومی
 * (/api/auth ، /api/usdt ، …) بدون تغییر می‌مانند:
 *
 *   Production:  vercel.json rewrite  /api/usdt → /api/markets?__fn=usdt
 *   Dev/Preview: پلاگین local-serverless-api در vite.config.ts همین جدول را می‌خواند
 *
 * فقط داده — بدون import — تا vite.config.ts هم بتواند آن را بخواند.
 * هماهنگی با vercel.json را tests/api/routes.test.ts تضمین می‌کند.
 * ============================================================ */

/** پارامتر داخلی حامل نام مسیر (قبل از رسیدن به هندلر حذف می‌شود) */
export const ROUTE_PARAM = '__fn';

export const API_GROUPS = {
  /** دادهٔ کاربر روی Neon — سبک و احراز هویت‌شده */
  data: ['auth', 'accounting', 'portfolio', 'dashboard', 'custody', 'health'],
  /** بازار عمومی و پروکسی‌ها — قابل کش، کرون‌های بازار */
  markets: ['cg', 'usdt', 'boros', 'propertyMarket', 'traders', 'intel'],
  /** سرویس‌های ثالث (Zerion، Gemini، پرپ‌ها، اعلان‌ها) — طولانی‌تر */
  services: ['integrations', 'borosAccount']
} as const;

export type ApiGroup = keyof typeof API_GROUPS;
export type ApiRoute = (typeof API_GROUPS)[ApiGroup][number];
export type GroupRoute<G extends ApiGroup> = (typeof API_GROUPS)[G][number];

/** گروه هر مسیر عمومی؛ undefined یعنی مسیر ناشناخته */
export function groupOf(route: string): ApiGroup | undefined {
  for (const group of Object.keys(API_GROUPS) as ApiGroup[]) {
    if ((API_GROUPS[group] as readonly string[]).includes(route)) return group;
  }
  return undefined;
}
