/** ============================================================
 * api/_neshanMcp.ts — کلاینت سمت سرور MCP رسمی نشان + حلقه فراخوانی ابزار دستیار هوش مصنوعی
 *
 * مستندات مرجع:
 *  - پلتفرم نشان: https://platform.neshan.org/mcp
 *  - مارکت‌پلیس mcpfarsi: https://mcpfarsi.ir/servers/neshan/
 *
 * اصول امنیتی و معماری:
 *  ۱) کلید API نشان (NESHAN_API_KEY) صرفاً در محیط امن سمت سرور نگهداری می‌شود
 *     و هرگز به مرورگر یا فرانت‌اند افشا نمی‌شود.
 *  ۲) اتصال اولیه به سرور رسمی MCP نشان از طریق پروتکل استاندارد JSON-RPC 2.0 روی HTTP
 *     انجام می‌شود و در صورت استفاده از کلید وب‌سرویس استاندارد (قبل از فعال‌سازی تیکت MCP)،
 *     به‌طور خودکار از وب‌سرویس‌های رسمی نشان به عنوان پشتیبان استفاده می‌کند.
 *  ۳) هیچ داده مکانی، آدرس یا ترافیک ساختگی تولید نمی‌شود؛ در صورت نبود کلید یا خطای سرویس،
 *     وضعیت به‌طور شفاف به کاربر اعلام شده و لینک مستقیم نشان (Deep Link) ارائه می‌گردد.
 * ============================================================ */

import { z } from 'zod';
import { geminiKeys, hasGeminiKey } from './_assistant.js';
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import {
  ACTIVE_NESHAN_TOOL_NAMES,
  MCPFARSI_NESHAN_URL,
  NESHAN_MCP_TOOLS_CATALOG,
  NESHAN_PLATFORM_MCP_URL,
  analyzeSpatialQuery,
  buildNeshanDeeplink,
  type NeshanAskResponse,
  type NeshanDeeplinkResult,
  type NeshanIsochroneSummary,
  type NeshanPlaceItem,
  type NeshanRouteSummary,
  type NeshanStatusResponse,
  type NeshanToolTrace
} from '../src/features/intel/domain/neshanTools.js';

const DEFAULT_NESHAN_API_ORIGIN = NESHAN_PLATFORM_MCP_URL.replace('platform.', 'api.').replace(/\/mcp\/?$/, '');
const DEFAULT_NESHAN_MCP_ENDPOINT = `${DEFAULT_NESHAN_API_ORIGIN}/mcp`;

export function neshanMcpUrl(): string {
  return process.env.NESHAN_MCP_URL?.trim() || DEFAULT_NESHAN_MCP_ENDPOINT;
}

export function neshanApiKey(service?: 'SEARCH' | 'ROUTING' | 'GEOCODING' | 'STATIC'): string | null {
  if (service) {
    const specific = process.env[`NESHAN_KEY_${service}`]?.trim();
    if (specific) return specific;
  }
  const main = process.env.NESHAN_API_KEY?.trim();
  return main || null;
}

export function hasNeshanKey(): boolean {
  return !!(
    neshanApiKey() ||
    neshanApiKey('SEARCH') ||
    neshanApiKey('ROUTING') ||
    neshanApiKey('GEOCODING')
  );
}

/** تنظیمات سهمیه و کش سمت سرور */
export const NESHAN_QUOTA_CONFIG = {
  perMinuteLimit: 20,
  cacheTtlSearchSec: 600, // ۱۰ دقیقه برای جستجوی مکان و تبدیل آدرس
  cacheTtlRoutingSec: 60  // ۶۰ ثانیه برای ترافیک لحظه‌ای و مسیریابی
} as const;

export function getNeshanStatus(): NeshanStatusResponse {
  return {
    neshanKeyConfigured: hasNeshanKey(),
    geminiKeyConfigured: hasGeminiKey(),
    mcpServerUrl: neshanMcpUrl(),
    docsUrl: NESHAN_PLATFORM_MCP_URL,
    mcpfarsiUrl: MCPFARSI_NESHAN_URL,
    activeToolsCount: ACTIVE_NESHAN_TOOL_NAMES.length,
    totalCatalogToolsCount: NESHAN_MCP_TOOLS_CATALOG.length,
    quota: NESHAN_QUOTA_CONFIG,
    tools: NESHAN_MCP_TOOLS_CATALOG
  };
}

export const neshanAskSchema = z.object({
  query: z.string().trim().min(2).max(600),
  citySlug: z.string().trim().max(40).optional().default('ahvaz'),
  userLocation: z
    .object({
      lat: z.number().min(24).max(40),
      lng: z.number().min(44).max(64),
      label: z.string().max(80).optional()
    })
    .nullable()
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(4000)
      })
    )
    .max(6)
    .optional()
    .default([])
});

export type NeshanAskInput = z.infer<typeof neshanAskSchema>;

/* ---------------- تعریف Function Declarations برای Gemini Tool Calling ---------------- */

export const NESHAN_GEMINI_DECLARATIONS = [
  {
    name: 'neshan_search',
    description:
      'جستجوی مکان، صرافی، بانک، خودپرداز، پمپ بنزین، داروخانه، فروشگاه و کسب‌وکار در اطراف یک نقطه جغرافیایی در نقشه نشان.',
    parameters: {
      type: 'OBJECT',
      properties: {
        term: { type: 'STRING', description: 'عبارت جستجو به فارسی، مانند صرافی، بانک ملت، داروخانه شبانه‌روزی، پمپ بنزین' },
        lat: { type: 'NUMBER', description: 'عرض جغرافیایی نقطه مرجع جستجو (مثلاً اهواز 31.3203 یا تهران 35.7016)' },
        lng: { type: 'NUMBER', description: 'طول جغرافیایی نقطه مرجع جستجو (مثلاً اهواز 48.6842 یا تهران 51.4193)' }
      },
      required: ['term', 'lat', 'lng']
    }
  },
  {
    name: 'neshan_reverse_geocode',
    description: 'تبدیل مختصات جغرافیایی (عرض و طول جغرافیایی GPS) به آدرس دقیق فارسی، نام خیابان، محله و شهر.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lat: { type: 'NUMBER', description: 'عرض جغرافیایی (latitude)' },
        lng: { type: 'NUMBER', description: 'طول جغرافیایی (longitude)' }
      },
      required: ['lat', 'lng']
    }
  },
  {
    name: 'neshan_geocode',
    description: 'تبدیل آدرس متنی فارسی به مختصات جغرافیایی (lat, lng).',
    parameters: {
      type: 'OBJECT',
      properties: {
        address: { type: 'STRING', description: 'آدرس فارسی کامل یا نام خیابان و شهر' }
      },
      required: ['address']
    }
  },
  {
    name: 'neshan_geocode_plus',
    description: 'تبدیل آدرس دارای پلاک یا مکان شاخص به مختصات جغرافیایی با امکان تعیین شهر و استان.',
    parameters: {
      type: 'OBJECT',
      properties: {
        address: { type: 'STRING', description: 'آدرس یا نام مکان شاخص' },
        city: { type: 'STRING', description: 'نام شهر (مثلاً اهواز، تهران)' },
        province: { type: 'STRING', description: 'نام استان (مثلاً خوزستان، تهران)' },
        bias_lat: { type: 'NUMBER', description: 'عرض جغرافیایی نقطه مرجع اختیاری' },
        bias_lng: { type: 'NUMBER', description: 'طول جغرافیایی نقطه مرجع اختیاری' }
      },
      required: ['address']
    }
  },
  {
    name: 'neshan_get_point_by_hash',
    description:
      'دریافت جزئیات کامل یک مکان شاخص (ساعت کاری و تلفن) با استفاده از poiHash؛ فقط برای مکان‌هایی که verified_details_available آنها true است.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hash: { type: 'STRING', description: 'مقدار poiHash دریافت‌شده از neshan_search' }
      },
      required: ['hash']
    }
  },
  {
    name: 'neshan_direction',
    description:
      'محاسبه مسیر، زمان سفر و مسافت بین مبدأ و مقصد برای خودرو (car)، موتورسیکلت (motorcycle) یا پیاده (pedestrian) با ترافیک لحظه‌ای (live)، بدون ترافیک (no_traffic) یا معمول (typical).',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin_lat: { type: 'NUMBER', description: 'عرض جغرافیایی مبدأ' },
        origin_lng: { type: 'NUMBER', description: 'طول جغرافیایی مبدأ' },
        dest_lat: { type: 'NUMBER', description: 'عرض جغرافیایی مقصد' },
        dest_lng: { type: 'NUMBER', description: 'طول جغرافیایی مقصد' },
        vehicle: { type: 'STRING', enum: ['car', 'motorcycle', 'pedestrian'], description: 'نوع وسیله نقلیه (پیش‌فرض car)' },
        traffic_mode: { type: 'STRING', enum: ['live', 'no_traffic', 'typical'], description: 'حالت ترافیک (پیش‌فرض live)' },
        avoid_traffic_zone: { type: 'BOOLEAN', description: 'پرهیز از طرح ترافیک' },
        avoid_odd_even_zone: { type: 'BOOLEAN', description: 'پرهیز از طرح زوج و فرد' }
      },
      required: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng']
    }
  },
  {
    name: 'neshan_distance_matrix',
    description: 'محاسبه ماتریس فاصله و زمان سفر هم‌زمان بین چند نقطه مبدأ و چند نقطه مقصد.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origins: {
          type: 'ARRAY',
          description: 'فهرست نقاط مبدأ به صورت [[lat, lng], ...]',
          items: { type: 'ARRAY', items: { type: 'NUMBER' } }
        },
        destinations: {
          type: 'ARRAY',
          description: 'فهرست نقاط مقصد به صورت [[lat, lng], ...]',
          items: { type: 'ARRAY', items: { type: 'NUMBER' } }
        }
      },
      required: ['origins', 'destinations']
    }
  },
  {
    name: 'neshan_tsp',
    description: 'بهینه‌سازی ترتیب بازدید از چند مقصد مختلف (مسئله فروشنده دوره‌گرد TSP). نقطه اول، نقطه شروع مسیر است.',
    parameters: {
      type: 'OBJECT',
      properties: {
        waypoints: {
          type: 'ARRAY',
          description: 'فهرست مختصات نقاط به صورت [[lat, lng], ...]',
          items: { type: 'ARRAY', items: { type: 'NUMBER' } }
        },
        round_trip: { type: 'BOOLEAN', description: 'آیا در پایان به نقطه شروع بازگردد؟' }
      },
      required: ['waypoints']
    }
  },
  {
    name: 'neshan_isochrone',
    description: 'محاسبه محدوده قابل دسترس (Isochrone) از یک نقطه در زمان مشخص (دقیقه) یا مسافت مشخص (کیلومتر).',
    parameters: {
      type: 'OBJECT',
      properties: {
        lat: { type: 'NUMBER', description: 'عرض جغرافیایی نقطه مرکز' },
        lng: { type: 'NUMBER', description: 'طول جغرافیایی نقطه مرکز' },
        time: { type: 'NUMBER', description: 'حداکثر زمان رانندگی به دقیقه (مثلاً 15)' },
        distance: { type: 'NUMBER', description: 'حداکثر مسافت به کیلومتر (اختیاری)' }
      },
      required: ['lat', 'lng']
    }
  },
  {
    name: 'neshan_traffic_analytics',
    description: 'تحلیل الگوی ترافیک اطراف یک نقطه در ۲۴ ساعت گذشته شامل شاخص کلی ترافیک (KPI) و نمودار ساعتی.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lat: { type: 'NUMBER', description: 'عرض جغرافیایی نقطه' },
        lng: { type: 'NUMBER', description: 'طول جغرافیایی نقطه' }
      },
      required: ['lat', 'lng']
    }
  },
  {
    name: 'neshan_deeplink',
    description: 'ساخت لینک باز کردن مستقیم یک نقطه یا مسیریابی در اپلیکیشن و وب نشان.',
    parameters: {
      type: 'OBJECT',
      properties: {
        link_type: { type: 'STRING', enum: ['point', 'routing'], description: 'نوع لینک: point یا routing' },
        lat: { type: 'NUMBER', description: 'عرض جغرافیایی نقطه (برای point)' },
        lng: { type: 'NUMBER', description: 'طول جغرافیایی نقطه (برای point)' },
        origin_lat: { type: 'NUMBER', description: 'عرض جغرافیایی مبدأ (برای routing)' },
        origin_lng: { type: 'NUMBER', description: 'طول جغرافیایی مبدأ (برای routing)' },
        dest_lat: { type: 'NUMBER', description: 'عرض جغرافیایی مقصد (برای routing)' },
        dest_lng: { type: 'NUMBER', description: 'طول جغرافیایی مقصد (برای routing)' },
        vehicle: { type: 'STRING', enum: ['car', 'motorcycle', 'pedestrian'], description: 'وسیله نقلیه' }
      },
      required: ['link_type']
    }
  }
] as const;

/* ---------------- اجرای ابزار روی سرور MCP رسمی نشان یا وب‌سرویس پشتیبان ---------------- */

interface ToolExecutionResult {
  ok: boolean;
  transport: 'neshan-mcp' | 'neshan-rest' | 'local-deeplink';
  data: Record<string, unknown> | null;
  error?: string;
  durationMs: number;
}

/** پارس پاسخ JSON یا SSE از سرور Streamable HTTP MCP */
function parseMcpResponseText(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  // در صورتی که سرور پاسخ را در قالب Server-Sent Events (event: message / data: {...}) برگرداند
  const dataLines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]);
    } catch {
      /* ادامه */
    }
  }
  return null;
}

/** فراخوانی مستقیم سرور رسمی MCP نشان از طریق پروتکل JSON-RPC 2.0 */
async function callOfficialMcpHttp(
  toolName: string,
  args: Record<string, unknown>,
  apiKey: string
): Promise<{ ok: boolean; data: Record<string, unknown> | null; error?: string; status?: number }> {
  try {
    const res = await fetch(neshanMcpUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Api-Key': apiKey,
        'Neshan-Api-Key': apiKey
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `darino-${Date.now()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }),
      signal: AbortSignal.timeout(12_000)
    });

    const rawText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        status: res.status,
        error: `خطای سرور MCP نشان (HTTP ${res.status})`
      };
    }

    const parsed = parseMcpResponseText(rawText) as {
      result?: { content?: { type?: string; text?: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
      error?: { code?: number; message?: string };
    } | null;

    if (!parsed) {
      return { ok: false, data: null, error: 'پاسخ سرور MCP نشان قابل خواندن نبود' };
    }
    if (parsed.error) {
      return { ok: false, data: null, error: parsed.error.message || 'خطای JSON-RPC در سرور MCP نشان' };
    }
    if (parsed.result?.isError) {
      const errText = parsed.result.content?.map((c) => c.text ?? '').join(' ').trim();
      return { ok: false, data: null, error: errText || 'ابزار MCP نشان خطا برگرداند' };
    }
    if (parsed.result?.structuredContent && typeof parsed.result.structuredContent === 'object') {
      return { ok: true, data: parsed.result.structuredContent };
    }
    const textContent = parsed.result?.content?.find((c) => c.type === 'text' && c.text)?.text;
    if (textContent) {
      try {
        const inner = JSON.parse(textContent);
        if (inner && typeof inner === 'object') return { ok: true, data: inner as Record<string, unknown> };
      } catch {
        return { ok: true, data: { text: textContent } };
      }
    }
    return { ok: true, data: (parsed.result as unknown as Record<string, unknown>) ?? {} };
  } catch (e) {
    return {
      ok: false,
      data: null,
      error: e instanceof Error ? e.message : 'خطای ارتباط با سرور MCP نشان'
    };
  }
}

/**
 * پشتیبان مستقیم وب‌سرویس‌های REST نشان (برای کلیدهایی که دسترسی سرویس‌های نقشه را دارند
 * اما تیکت MCP روی آن‌ها هنوز فعال نشده است)
 */
async function callNeshanRestFallback(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown> | null; error?: string }> {
  const base = DEFAULT_NESHAN_API_ORIGIN;
  try {
    if (toolName === 'neshan_search') {
      const key = neshanApiKey('SEARCH');
      if (!key) return { ok: false, data: null, error: 'کلید جستجوی نشان تنظیم نشده است' };
      const u = new URL(`${base}/v1/search`);
      u.searchParams.set('term', String(args.term ?? ''));
      u.searchParams.set('lat', String(args.lat ?? 31.3203));
      u.searchParams.set('lng', String(args.lng ?? 48.6842));
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس جستجوی نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    if (toolName === 'neshan_reverse_geocode') {
      const key = neshanApiKey('GEOCODING');
      if (!key) return { ok: false, data: null, error: 'کلید تبدیل مختصات نشان تنظیم نشده است' };
      const u = new URL(`${base}/v5/reverse`);
      u.searchParams.set('lat', String(args.lat ?? 31.3203));
      u.searchParams.set('lng', String(args.lng ?? 48.6842));
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس تبدیل مختصات نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    if (toolName === 'neshan_geocode' || toolName === 'neshan_geocode_plus') {
      const key = neshanApiKey('GEOCODING');
      if (!key) return { ok: false, data: null, error: 'کلید Geocoding نشان تنظیم نشده است' };
      const u = new URL(`${base}/v6/geocoding`);
      const addr = [args.province, args.city, args.address].filter(Boolean).join('، ');
      u.searchParams.set('address', addr);
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس تبدیل آدرس نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    if (toolName === 'neshan_direction') {
      const key = neshanApiKey('ROUTING');
      if (!key) return { ok: false, data: null, error: 'کلید مسیریابی نشان تنظیم نشده است' };
      const trafficMode = String(args.traffic_mode ?? 'live');
      const vehicle = String(args.vehicle ?? 'car');
      const endpoint = trafficMode === 'no_traffic' ? '/v4/direction/no-traffic' : '/v4/direction';
      const u = new URL(`${base}${endpoint}`);
      u.searchParams.set('type', vehicle === 'pedestrian' ? 'pedestrian' : vehicle === 'motorcycle' ? 'motorcycle' : 'car');
      u.searchParams.set('origin', `${args.origin_lat},${args.origin_lng}`);
      u.searchParams.set('destination', `${args.dest_lat},${args.dest_lng}`);
      if (args.avoid_traffic_zone) u.searchParams.set('avoidTrafficZone', 'true');
      if (args.avoid_odd_even_zone) u.searchParams.set('avoidOddEvenZone', 'true');
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس مسیریابی نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    if (toolName === 'neshan_distance_matrix') {
      const key = neshanApiKey('ROUTING');
      if (!key) return { ok: false, data: null, error: 'کلید ماتریس فاصله نشان تنظیم نشده است' };
      const origins = Array.isArray(args.origins)
        ? (args.origins as number[][]).map((p) => `${p[0]},${p[1]}`).join('|')
        : '';
      const destinations = Array.isArray(args.destinations)
        ? (args.destinations as number[][]).map((p) => `${p[0]},${p[1]}`).join('|')
        : '';
      const u = new URL(`${base}/v1/distance-matrix`);
      u.searchParams.set('type', 'car');
      u.searchParams.set('origins', origins);
      u.searchParams.set('destinations', destinations);
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس ماتریس فاصله نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    if (toolName === 'neshan_tsp') {
      const key = neshanApiKey('ROUTING');
      if (!key) return { ok: false, data: null, error: 'کلید بهینه‌سازی مسیر (TSP) نشان تنظیم نشده است' };
      const waypoints = Array.isArray(args.waypoints)
        ? (args.waypoints as number[][]).map((p) => `${p[0]},${p[1]}`).join('|')
        : '';
      const u = new URL(`${base}/v3/tsp`);
      u.searchParams.set('waypoints', waypoints);
      if (typeof args.round_trip === 'boolean') u.searchParams.set('roundTrip', String(args.round_trip));
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس TSP نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    if (toolName === 'neshan_isochrone') {
      const key = neshanApiKey('ROUTING');
      if (!key) return { ok: false, data: null, error: 'کلید ایزوکرون نشان تنظیم نشده است' };
      const u = new URL(`${base}/v1/isochrone`);
      u.searchParams.set('location', `${args.lat},${args.lng}`);
      if (args.time != null) u.searchParams.set('time', String(args.time));
      if (args.distance != null) u.searchParams.set('distance', String(args.distance));
      const r = await fetch(u, { headers: { 'Api-Key': key }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return { ok: false, data: null, error: `خطای وب‌سرویس ایزوکرون نشان (${r.status})` };
      return { ok: true, data: (await r.json()) as Record<string, unknown> };
    }

    return { ok: false, data: null, error: `ابزار ${toolName} نیازمند اتصال مستقیم به سرور MCP نشان است` };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : 'خطای ارتباط با وب‌سرویس نشان' };
  }
}

/** اجرای یک ابزار نشان با مدیریت کش، سرور MCP رسمی و پشتیبان REST */
export async function executeNeshanTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const started = Date.now();

  if (toolName === 'neshan_deeplink') {
    const link = buildNeshanDeeplink({
      linkType: args.link_type === 'routing' ? 'routing' : 'point',
      lat: typeof args.lat === 'number' ? args.lat : undefined,
      lng: typeof args.lng === 'number' ? args.lng : undefined,
      originLat: typeof args.origin_lat === 'number' ? args.origin_lat : undefined,
      originLng: typeof args.origin_lng === 'number' ? args.origin_lng : undefined,
      destLat: typeof args.dest_lat === 'number' ? args.dest_lat : undefined,
      destLng: typeof args.dest_lng === 'number' ? args.dest_lng : undefined,
      vehicle:
        args.vehicle === 'motorcycle' || args.vehicle === 'pedestrian' ? args.vehicle : 'car'
    });
    return {
      ok: true,
      transport: 'local-deeplink',
      data: link as unknown as Record<string, unknown>,
      durationMs: Date.now() - started
    };
  }

  const key = neshanApiKey();
  if (!hasNeshanKey()) {
    return {
      ok: false,
      transport: 'neshan-mcp',
      data: null,
      error: 'کلید API نشان (NESHAN_API_KEY) در محیط سرور تنظیم نشده است',
      durationMs: Date.now() - started
    };
  }

  // بررسی کش سمت سرور
  const isLiveTraffic =
    toolName === 'neshan_direction' ||
    toolName === 'neshan_distance_matrix' ||
    toolName === 'neshan_traffic_analytics';
  const ttlMs = (isLiveTraffic ? NESHAN_QUOTA_CONFIG.cacheTtlRoutingSec : NESHAN_QUOTA_CONFIG.cacheTtlSearchSec) * 1000;
  const cacheKey = providerCacheKey(`neshan-v1:${toolName}:${JSON.stringify(args)}`);
  const cached = await readProviderCache<{ transport: 'neshan-mcp' | 'neshan-rest'; data: Record<string, unknown> }>(cacheKey);
  if (cached) {
    return {
      ok: true,
      transport: cached.transport,
      data: cached.data,
      durationMs: Date.now() - started
    };
  }

  // ۱. تلاش اول: سرور رسمی MCP نشان (https://api.neshan.org/mcp)
  if (key) {
    const mcpRes = await callOfficialMcpHttp(toolName, args, key);
    if (mcpRes.ok && mcpRes.data) {
      await writeProviderCache(cacheKey, { transport: 'neshan-mcp', data: mcpRes.data }, ttlMs);
      return {
        ok: true,
        transport: 'neshan-mcp',
        data: mcpRes.data,
        durationMs: Date.now() - started
      };
    }
  }

  // ۲. تلاش دوم: وب‌سرویس REST رسمی نشان (اگر کلید دسترسی سرویس دارد ولی MCP روی آن فعال نشده)
  const restRes = await callNeshanRestFallback(toolName, args);
  if (restRes.ok && restRes.data) {
    await writeProviderCache(cacheKey, { transport: 'neshan-rest', data: restRes.data }, ttlMs);
    return {
      ok: true,
      transport: 'neshan-rest',
      data: restRes.data,
      durationMs: Date.now() - started
    };
  }

  return {
    ok: false,
    transport: 'neshan-mcp',
    data: null,
    error: restRes.error || 'خطا در دریافت داده از سرور MCP نشان؛ دسترسی کلید API خود را بررسی کنید',
    durationMs: Date.now() - started
  };
}

/* ---------------- استخراج ساختاریافته مکان‌ها و مسیرها از خروجی ابزارهای نشان ---------------- */

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function extractPlacesFromNeshanRaw(
  raw: Record<string, unknown>,
  refLat?: number,
  refLng?: number
): NeshanPlaceItem[] {
  const items = Array.isArray(raw.items)
    ? (raw.items as Record<string, unknown>[])
    : Array.isArray(raw.results)
      ? (raw.results as Record<string, unknown>[])
      : [];

  const out: NeshanPlaceItem[] = [];
  for (const item of items.slice(0, 12)) {
    const loc = (item.location ?? item.point ?? {}) as { x?: number; y?: number; lat?: number; lng?: number; latitude?: number; longitude?: number };
    const lat = Number(loc.y ?? loc.lat ?? loc.latitude ?? item.lat);
    const lng = Number(loc.x ?? loc.lng ?? loc.longitude ?? item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const title = String(item.title ?? item.name ?? 'مکان بی‌نام').trim();
    const address = String(item.address ?? item.region ?? item.neighbourhood ?? '').trim();
    const distanceMeters =
      typeof item.distance === 'number'
        ? Math.round(item.distance)
        : typeof refLat === 'number' && typeof refLng === 'number'
          ? haversineMeters(refLat, refLng, lat, lng)
          : null;

    out.push({
      title,
      address: address || 'آدرس در نقشه نشان',
      neighbourhood: typeof item.neighbourhood === 'string' ? item.neighbourhood : null,
      region: typeof item.region === 'string' ? item.region : null,
      category: typeof item.category === 'string' ? item.category : null,
      type: typeof item.type === 'string' ? item.type : null,
      lat,
      lng,
      distanceMeters,
      durationMinutes: distanceMeters != null ? Math.max(1, Math.round(distanceMeters / 450)) : null,
      poiHash: typeof item.poiHash === 'string' ? item.poiHash : typeof item.hash === 'string' ? item.hash : null,
      verifiedDetailsAvailable: Boolean(item.verified_details_available ?? item.verifiedDetailsAvailable),
      phone: typeof item.phone === 'string' ? item.phone : null,
      openingHours: typeof item.opening_hours === 'string' ? item.opening_hours : null,
      deeplink: buildNeshanDeeplink({
        linkType: 'point',
        lat,
        lng,
        queryText: title
      })
    });
  }
  return out;
}

export function extractRouteFromNeshanRaw(
  raw: Record<string, unknown>,
  args: Record<string, unknown>,
  originTitle = 'مبدأ',
  destTitle = 'مقصد'
): NeshanRouteSummary | null {
  const routes = Array.isArray(raw.routes) ? (raw.routes as Record<string, unknown>[]) : [];
  const firstRoute = routes[0] ?? raw;
  const legs = Array.isArray(firstRoute.legs) ? (firstRoute.legs as Record<string, unknown>[]) : [];
  const leg = legs[0] ?? firstRoute;

  const distObj = (leg.distance ?? firstRoute.distance) as { value?: number; text?: string } | number | undefined;
  const durObj = (leg.duration ?? firstRoute.duration) as { value?: number; text?: string } | number | undefined;

  const distanceMeters =
    typeof distObj === 'number' ? distObj : typeof distObj?.value === 'number' ? distObj.value : 0;
  const durationSeconds =
    typeof durObj === 'number' ? durObj : typeof durObj?.value === 'number' ? durObj.value : 0;

  if (!distanceMeters && !durationSeconds) return null;

  const distanceText =
    typeof distObj === 'object' && distObj?.text
      ? distObj.text
      : distanceMeters >= 1000
        ? `${(distanceMeters / 1000).toFixed(1)} کیلومتر`
        : `${Math.round(distanceMeters)} متر`;

  const durationText =
    typeof durObj === 'object' && durObj?.text
      ? durObj.text
      : `${Math.max(1, Math.round(durationSeconds / 60))} دقیقه`;

  const rawSteps = Array.isArray(leg.steps) ? (leg.steps as Record<string, unknown>[]) : [];
  const steps = rawSteps.slice(0, 8).map((s) => {
    const sDist = (s.distance ?? {}) as { text?: string };
    const sDur = (s.duration ?? {}) as { text?: string };
    return {
      instruction: String(s.instruction ?? s.name ?? 'ادامه مسیر').trim(),
      distanceText: String(sDist.text ?? ''),
      durationText: String(sDur.text ?? '')
    };
  });

  const originLat = Number(args.origin_lat ?? 31.3203);
  const originLng = Number(args.origin_lng ?? 48.6842);
  const destLat = Number(args.dest_lat ?? 31.3489);
  const destLng = Number(args.dest_lng ?? 48.6881);
  const vehicle =
    args.vehicle === 'motorcycle' || args.vehicle === 'pedestrian' ? args.vehicle : 'car';
  const trafficMode =
    args.traffic_mode === 'no_traffic' || args.traffic_mode === 'typical' || args.traffic_mode === 'historical'
      ? args.traffic_mode
      : 'live';

  const polyObj = (firstRoute.overview_polyline ?? firstRoute.overviewPolyline) as { points?: string } | string | undefined;
  const overviewPolyline = typeof polyObj === 'string' ? polyObj : polyObj?.points ?? null;

  return {
    originTitle,
    originLat,
    originLng,
    destTitle,
    destLat,
    destLng,
    vehicle,
    trafficMode,
    distanceText,
    distanceMeters,
    durationText,
    durationSeconds,
    summaryText: String(leg.summary ?? firstRoute.summary ?? `${originTitle} به ${destTitle}`),
    steps,
    overviewPolyline,
    deeplink: buildNeshanDeeplink({
      linkType: 'routing',
      originLat,
      originLng,
      destLat,
      destLng,
      vehicle
    })
  };
}

/* ---------------- حلقه هوشمند دستیار مکانی دارینو (Agentic Loop) ---------------- */

const NESHAN_AGENT_SYSTEM_PROMPT = [
  'تو «دستیار هوشمند جست‌وجوی مکانی و مسیریابی دارینو» در بخش «بازار ایران» هستی که به سرور رسمی MCP نقشه نشان متصل است.',
  'وظیفه تو دریافت پرسش‌های مکانی و مالی-مکانی کاربر به زبان طبیعی فارسی، فراخوانی ابزارهای واقعی نشان (neshan_search، neshan_direction، neshan_reverse_geocode، neshan_geocode، neshan_isochrone، neshan_tsp، neshan_distance_matrix) و ارائه پاسخ دقیق، مستند و کاربردی است.',
  'قوانین قطعی و غیرقابل نقض:',
  '۱. هرگز هیچ نام مکان، آدرس، شماره تماس، مسافت یا زمان ترافیکی را از حافظه خودت نساز و حدس نزن. فقط و فقط اطلاعاتی را نمایش بده که از خروجی ابزارهای نشان در همین نشست دریافت کرده‌ای.',
  '۲. اگر ابزار نشان نتیجه‌ای برنگرداند یا با خطا مواجه شد، صریح و شفاف به کاربر اعلام کن که داده زنده‌ای از سرویس نشان دریافت نشد.',
  '۳. در پاسخ خود تا حد امکان نام مکان، آدرس دقیق، محله، فاصله تقریبی یا زمان رسیدن و پیشنهاد مسیر را به فارسی روان و ساختاریافته (با بولت‌پوینت یا جدول کوتاه) بنویس.',
  '۴. اگر درخواست کاربر مرتبط با امور مالی است (مانند صرافی، بانک، خودپرداز، کارگزاری بورس، بازار طلا و سکه، یا دفتر اسناد رسمی برای معامله ملک/خودرو)، علاوه بر نمایش مکان‌ها، یک نکته کوتاه کاربردی مرتبط با بخش‌های بازار ایران دارینو (مثل بررسی نرخ لحظه‌ای تتر و اسپرد صرافی‌ها در بخش «صرافی‌های ایران» یا بررسی حباب طلا در بخش «طلای ایران») یادآوری کن.'
].join('\n');

export async function askNeshanAgent(rawInput: NeshanAskInput): Promise<NeshanAskResponse> {
  const input = neshanAskSchema.parse(rawInput);
  const analysis = analyzeSpatialQuery(input.query, input.citySlug);
  const fetchedAt = Date.now();
  const neshanConfigured = hasNeshanKey();
  const geminiConfigured = hasGeminiKey();

  const primaryAnchor = input.userLocation
    ? {
        id: 'user-gps',
        nameFa: input.userLocation.label || 'موقعیت فعلی شما',
        cityFa: '',
        lat: input.userLocation.lat,
        lng: input.userLocation.lng,
        keywords: []
      }
    : analysis.anchors[0];

  const secondaryAnchor = analysis.anchors[1] ?? analysis.anchors[0];

  const places: NeshanPlaceItem[] = [];
  let route: NeshanRouteSummary | null = null;
  let reverseAddress: NeshanAskResponse['reverseAddress'] = null;
  let isochrone: NeshanIsochroneSummary | null = null;
  let tspOrder: NeshanAskResponse['tspOrder'] = null;
  const deeplinks: NeshanDeeplinkResult[] = [];
  const toolTraces: NeshanToolTrace[] = [];

  // ساخت لینک مستقیم اولیه بر اساس نیت کاربر
  if (analysis.intent === 'routing' && (analysis.explicitCoords.length >= 2 || analysis.anchors.length >= 2)) {
    const oLat = analysis.explicitCoords[0]?.lat ?? primaryAnchor.lat;
    const oLng = analysis.explicitCoords[0]?.lng ?? primaryAnchor.lng;
    const dLat = analysis.explicitCoords[1]?.lat ?? secondaryAnchor.lat;
    const dLng = analysis.explicitCoords[1]?.lng ?? secondaryAnchor.lng;
    deeplinks.push(
      buildNeshanDeeplink({
        linkType: 'routing',
        originLat: oLat,
        originLng: oLng,
        destLat: dLat,
        destLng: dLng,
        vehicle: analysis.vehicle
      })
    );
  } else if (primaryAnchor) {
    deeplinks.push(
      buildNeshanDeeplink({
        linkType: 'point',
        lat: analysis.explicitCoords[0]?.lat ?? primaryAnchor.lat,
        lng: analysis.explicitCoords[0]?.lng ?? primaryAnchor.lng,
        queryText: analysis.searchTerm
      })
    );
  }

  // حالت ۱: کلید API نشان در سرور تنظیم نشده است → عدم تولید داده ساختگی و اعلام شفاف
  if (!neshanConfigured) {
    const plannedTool =
      analysis.intent === 'routing'
        ? 'neshan_direction'
        : analysis.intent === 'reverse_geocode'
          ? 'neshan_reverse_geocode'
          : analysis.intent === 'geocode'
            ? 'neshan_geocode'
            : analysis.intent === 'isochrone'
              ? 'neshan_isochrone'
              : analysis.intent === 'tsp'
                ? 'neshan_tsp'
                : analysis.intent === 'traffic'
                  ? 'neshan_traffic_analytics'
                  : 'neshan_search';

    toolTraces.push({
      tool: plannedTool,
      status: 'unconfigured',
      transport: 'neshan-mcp',
      durationMs: 0,
      note: 'کلید NESHAN_API_KEY در متغیرهای محیطی سرور تنظیم نشده است'
    });

    const answer = [
      `درخواست شما برای **«${input.query}»** تحلیل شد و ابزار استاندارد **\`${plannedTool}\`** در سرور MCP نشان انتخاب گردید.`,
      '',
      '⚠️ **وضعیت اتصال داده زنده:** در حال حاضر متغیر محیطی `NESHAN_API_KEY` در سرور دارینو تنظیم نشده است. طبق سیاست دقت داده‌های دارینو، هیچ آدرس، مکان یا زمان ترافیکی به‌صورت ساختگی نمایش داده نمی‌شود.',
      '',
      '**تنظیمات تشخیص‌داده‌شده از درخواست شما:**',
      `- **ابزار هدف در سرور MCP نشان:** \`${plannedTool}\``,
      `- **نقطه مرجع شناسایی‌شده:** ${primaryAnchor?.nameFa ?? 'ایران'} (${(analysis.explicitCoords[0]?.lat ?? primaryAnchor?.lat ?? 31.3203).toFixed(4)}, ${(analysis.explicitCoords[0]?.lng ?? primaryAnchor?.lng ?? 48.6842).toFixed(4)})`,
      analysis.searchTerm ? `- **عبارت/موضوع کاوش:** ${analysis.searchTerm}` : '',
      analysis.intent === 'routing' ? `- **وسیله نقلیه و حالت ترافیک:** ${analysis.vehicle === 'car' ? 'خودرو' : analysis.vehicle === 'motorcycle' ? 'موتورسیکلت' : 'پیاده'} · ترافیک لحظه‌ای (${analysis.trafficMode})` : '',
      '',
      'تا زمان افزودن کلید `NESHAN_API_KEY` در سرور، می‌توانید با دکمه‌های **«مشاهده و مسیریابی مستقیم در نقشه نشان»** در پایین همین کارت، نتیجه دقیق همین درخواست را مستقیماً در وب‌اپلیکیشن یا اپ نشان باز کنید.'
    ]
      .filter(Boolean)
      .join('\n');

    return {
      query: input.query,
      analysis,
      answer,
      places,
      route,
      reverseAddress,
      isochrone,
      tspOrder,
      staticMapProxyUrl: null,
      deeplinks,
      toolTraces,
      sourceMeta: {
        provider: 'Neshan Official MCP Server',
        mcpServerUrl: neshanMcpUrl(),
        mcpfarsiUrl: MCPFARSI_NESHAN_URL,
        docsUrl: NESHAN_PLATFORM_MCP_URL,
        neshanKeyConfigured: false,
        geminiKeyConfigured: geminiConfigured,
        liveDataVerified: false,
        fetchedAt
      }
    };
  }

  // ثبت خروجی ابزارها در ساختارهای کارت فرانت‌اند
  const recordToolOutput = (toolName: string, args: Record<string, unknown>, res: ToolExecutionResult) => {
    toolTraces.push({
      tool: toolName,
      status: res.ok ? 'ok' : 'error',
      transport: res.transport,
      durationMs: res.durationMs,
      note: res.error
    });
    if (!res.ok || !res.data) return;

    if (toolName === 'neshan_search') {
      const extracted = extractPlacesFromNeshanRaw(
        res.data,
        typeof args.lat === 'number' ? args.lat : primaryAnchor?.lat,
        typeof args.lng === 'number' ? args.lng : primaryAnchor?.lng
      );
      for (const p of extracted) {
        if (!places.some((x) => x.title === p.title && Math.abs(x.lat - p.lat) < 0.0002)) {
          places.push(p);
        }
      }
    } else if (toolName === 'neshan_direction') {
      const r = extractRouteFromNeshanRaw(
        res.data,
        args,
        primaryAnchor?.nameFa ?? 'مبدأ',
        secondaryAnchor?.nameFa ?? 'مقصد'
      );
      if (r) route = r;
    } else if (toolName === 'neshan_reverse_geocode') {
      const lat = Number(args.lat ?? primaryAnchor?.lat ?? 31.3203);
      const lng = Number(args.lng ?? primaryAnchor?.lng ?? 48.6842);
      const formattedAddress = String(
        res.data.formatted_address ?? res.data.address ?? res.data.route_name ?? ''
      ).trim();
      if (formattedAddress) {
        reverseAddress = {
          formattedAddress,
          routeName: typeof res.data.route_name === 'string' ? res.data.route_name : null,
          neighbourhood: typeof res.data.neighbourhood === 'string' ? res.data.neighbourhood : null,
          city: typeof res.data.city === 'string' ? res.data.city : null,
          state: typeof res.data.state === 'string' ? res.data.state : null,
          lat,
          lng,
          deeplink: buildNeshanDeeplink({ linkType: 'point', lat, lng })
        };
      }
    } else if (toolName === 'neshan_isochrone') {
      const lat = Number(args.lat ?? primaryAnchor?.lat ?? 31.3203);
      const lng = Number(args.lng ?? primaryAnchor?.lng ?? 48.6842);
      const features = Array.isArray(res.data.features) ? (res.data.features as Record<string, unknown>[]) : [];
      const geom = (features[0]?.geometry ?? res.data.geometry ?? {}) as { coordinates?: number[][][] };
      const ring = Array.isArray(geom.coordinates?.[0]) ? geom.coordinates![0] : [];
      let boundingBox: NeshanIsochroneSummary['boundingBox'] = null;
      if (ring.length > 0) {
        const lats = ring.map((c) => Number(c[1])).filter(Number.isFinite);
        const lngs = ring.map((c) => Number(c[0])).filter(Number.isFinite);
        if (lats.length && lngs.length) {
          boundingBox = {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLng: Math.min(...lngs),
            maxLng: Math.max(...lngs)
          };
        }
      }
      isochrone = {
        centerTitle: primaryAnchor?.nameFa ?? 'نقطه مرکز',
        lat,
        lng,
        timeMinutes: typeof args.time === 'number' ? args.time : analysis.isochroneMinutes,
        distanceKm: typeof args.distance === 'number' ? args.distance : analysis.isochroneKm,
        polygonCoordinatesCount: ring.length,
        boundingBox
      };
    } else if (toolName === 'neshan_tsp') {
      const pts = Array.isArray(res.data.points) ? (res.data.points as Record<string, unknown>[]) : [];
      if (pts.length) {
        tspOrder = pts.map((p, idx) => {
          const loc = Array.isArray(p.location) ? (p.location as number[]) : [0, 0];
          return {
            index: typeof p.index === 'number' ? p.index : idx,
            name: String(p.name ?? `ایستگاه ${idx + 1}`),
            lat: Number(loc[1] ?? loc[0] ?? 0),
            lng: Number(loc[0] ?? loc[1] ?? 0)
          };
        });
      }
    }
  };

  // حالت ۲: اجرای حلقه Function Calling با Gemini (در صورت وجود کلید Gemini)
  let aiAnswerText = '';
  if (geminiConfigured) {
    const keys = geminiKeys('tools');
    const key = keys[0];
    if (key) {
      try {
        const contents: Record<string, unknown>[] = [
          ...input.history.map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.text }]
          })),
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  userQuery: input.query,
                  referenceLocation: primaryAnchor
                    ? { name: primaryAnchor.nameFa, lat: primaryAnchor.lat, lng: primaryAnchor.lng }
                    : null,
                  secondaryLocation:
                    analysis.anchors.length > 1
                      ? { name: secondaryAnchor.nameFa, lat: secondaryAnchor.lat, lng: secondaryAnchor.lng }
                      : null,
                  explicitCoords: analysis.explicitCoords
                })
              }
            ]
          }
        ];

        for (let step = 0; step < 3; step++) {
          const r = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: NESHAN_AGENT_SYSTEM_PROMPT }] },
                contents,
                tools: [{ functionDeclarations: NESHAN_GEMINI_DECLARATIONS }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 2500 }
              }),
              signal: AbortSignal.timeout(20_000)
            }
          );

          if (!r.ok) break;
          const body = (await r.json()) as {
            candidates?: {
              content?: {
                role?: string;
                parts?: {
                  text?: string;
                  functionCall?: { name: string; args?: Record<string, unknown> };
                }[];
              };
            }[];
          };
          const cand = body.candidates?.[0]?.content;
          const parts = cand?.parts ?? [];
          const fnCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

          if (!fnCalls.length) {
            aiAnswerText = parts.map((p) => p.text ?? '').join('').trim();
            break;
          }

          contents.push({ role: 'model', parts });
          const responseParts: Record<string, unknown>[] = [];
          for (const fc of fnCalls.slice(0, 4)) {
            const args = fc.args ?? {};
            const execRes = await executeNeshanTool(fc.name, args);
            recordToolOutput(fc.name, args, execRes);
            responseParts.push({
              functionResponse: {
                name: fc.name,
                response: execRes.ok
                  ? { ok: true, result: execRes.data }
                  : { ok: false, error: execRes.error ?? 'خطا در فراخوانی ابزار نشان' }
              }
            });
          }
          contents.push({ role: 'user', parts: responseParts });
        }
      } catch {
        /* در صورت خطای شبکه Gemini، اجرای مستقیم ابزار نشان در مرحله بعد انجام می‌شود */
      }
    }
  }

  // حالت ۳: اگر هنوز ابزاری فراخوانی نشده (مثلاً Gemini در دسترس نبود)، فراخوانی مستقیم ابزار MCP نشان بر اساس تحلیل نیت
  if (toolTraces.length === 0) {
    const refLat = analysis.explicitCoords[0]?.lat ?? primaryAnchor?.lat ?? 31.3203;
    const refLng = analysis.explicitCoords[0]?.lng ?? primaryAnchor?.lng ?? 48.6842;

    if (analysis.intent === 'reverse_geocode') {
      const res = await executeNeshanTool('neshan_reverse_geocode', { lat: refLat, lng: refLng });
      recordToolOutput('neshan_reverse_geocode', { lat: refLat, lng: refLng }, res);
    } else if (analysis.intent === 'routing') {
      const dLat = analysis.explicitCoords[1]?.lat ?? secondaryAnchor?.lat ?? 31.3489;
      const dLng = analysis.explicitCoords[1]?.lng ?? secondaryAnchor?.lng ?? 48.6881;
      const routeArgs = {
        origin_lat: refLat,
        origin_lng: refLng,
        dest_lat: dLat,
        dest_lng: dLng,
        vehicle: analysis.vehicle,
        traffic_mode: analysis.trafficMode
      };
      const res = await executeNeshanTool('neshan_direction', routeArgs);
      recordToolOutput('neshan_direction', routeArgs, res);
    } else if (analysis.intent === 'isochrone') {
      const isoArgs: Record<string, unknown> = {
        lat: refLat,
        lng: refLng,
        ...(analysis.isochroneMinutes ? { time: analysis.isochroneMinutes } : { time: 15 }),
        ...(analysis.isochroneKm ? { distance: analysis.isochroneKm } : {})
      };
      const res = await executeNeshanTool('neshan_isochrone', isoArgs);
      recordToolOutput('neshan_isochrone', isoArgs, res);
      if (analysis.searchTerm) {
        const sArgs = { term: analysis.searchTerm, lat: refLat, lng: refLng };
        const sRes = await executeNeshanTool('neshan_search', sArgs);
        recordToolOutput('neshan_search', sArgs, sRes);
      }
    } else if (analysis.intent === 'geocode') {
      const gArgs = { address: analysis.searchTerm };
      const res = await executeNeshanTool('neshan_geocode', gArgs);
      recordToolOutput('neshan_geocode', gArgs, res);
    } else {
      const sArgs = { term: analysis.searchTerm, lat: refLat, lng: refLng };
      const res = await executeNeshanTool('neshan_search', sArgs);
      recordToolOutput('neshan_search', sArgs, res);
    }
  }

  // ساخت پاسخ متنی استاندارد اگر پاسخ Gemini خالی بود
  const finalRoute = route as NeshanRouteSummary | null;
  const finalRev = reverseAddress as NeshanAskResponse['reverseAddress'];
  if (!aiAnswerText) {
    const anyOk = toolTraces.some((t) => t.status === 'ok');
    if (!anyOk) {
      const firstErr = toolTraces.find((t) => t.note)?.note ?? 'پاسخی از سرور نشان دریافت نشد';
      aiAnswerText = [
        `درخواست شما برای **«${input.query}»** به سرور نشان ارسال شد، اما داده زنده‌ای دریافت نگردید (${firstErr}).`,
        'هیچ داده مکانی یا ترافیکی ساختگی نمایش داده نمی‌شود. لطفاً دسترسی کلید `NESHAN_API_KEY` خود به سرویس MCP نشان را بررسی کنید یا از لینک مستقیم نقشه نشان در پایین استفاده نمایید.'
      ].join('\n\n');
    } else if (finalRoute) {
      aiAnswerText = [
        `بر اساس داده ترافیک لحظه‌ای نشان، مسیر **${finalRoute.originTitle}** به **${finalRoute.destTitle}** بررسی شد:`,
        `- **مسافت کل:** ${finalRoute.distanceText}`,
        `- **زمان تقریبی سفر (${finalRoute.vehicle === 'car' ? 'خودرو' : finalRoute.vehicle === 'motorcycle' ? 'موتورسیکلت' : 'پیاده'}):** ${finalRoute.durationText}`,
        `- **مسیر پیشنهادی:** ${finalRoute.summaryText}`
      ].join('\n');
    } else if (finalRev) {
      aiAnswerText = `نشانی دقیق مختصات موردنظر در نقشه نشان:\n**${finalRev.formattedAddress}**${finalRev.neighbourhood ? ` (محله: ${finalRev.neighbourhood})` : ''}`;
    } else if (places.length > 0) {
      aiAnswerText = [
        `نتایج دریافت‌شده از سرویس جست‌وجوی مکانی نشان برای **«${analysis.searchTerm}»** در اطراف **${primaryAnchor?.nameFa ?? 'نقطه انتخابی'}**:`,
        ...places.slice(0, 6).map(
          (p, i) =>
            `${i + 1}. **${p.title}** — ${p.address}${p.distanceMeters != null ? ` (فاصله خطی: حدود ${p.distanceMeters} متر)` : ''}`
        )
      ].join('\n');
    } else {
      aiAnswerText = `جست‌وجو در سرور نشان انجام شد اما نتیجه‌ای منطبق با «${input.query}» در این محدوده یافت نشد.`;
    }
  }

  const mapCenterLat = finalRoute?.originLat ?? places[0]?.lat ?? finalRev?.lat ?? primaryAnchor?.lat ?? 31.3203;
  const mapCenterLng = finalRoute?.originLng ?? places[0]?.lng ?? finalRev?.lng ?? primaryAnchor?.lng ?? 48.6842;
  const staticMapProxyUrl =
    neshanApiKey('STATIC') || neshanApiKey()
      ? `/api/intel?op=neshan-static-map&lat=${mapCenterLat.toFixed(6)}&lng=${mapCenterLng.toFixed(6)}&zoom=14`
      : null;

  return {
    query: input.query,
    analysis,
    answer: aiAnswerText,
    places,
    route,
    reverseAddress,
    isochrone,
    tspOrder,
    staticMapProxyUrl,
    deeplinks,
    toolTraces,
    sourceMeta: {
      provider: 'Neshan Official MCP Server',
      mcpServerUrl: neshanMcpUrl(),
      mcpfarsiUrl: MCPFARSI_NESHAN_URL,
      docsUrl: NESHAN_PLATFORM_MCP_URL,
      neshanKeyConfigured: true,
      geminiKeyConfigured: geminiConfigured,
      liveDataVerified: toolTraces.some((t) => t.status === 'ok'),
      fetchedAt
    }
  };
}

/** پروکسی امن تصویر نقشه استاتیک نشان (کلید API در سرور می‌ماند) */
export async function fetchNeshanStaticMap(params: {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
}): Promise<{ ok: boolean; contentType: string; body: Buffer } | null> {
  const key = neshanApiKey('STATIC') ?? neshanApiKey();
  if (!key) return null;
  const lat = Number.isFinite(params.lat) ? params.lat : 31.3203;
  const lng = Number.isFinite(params.lng) ? params.lng : 48.6842;
  const zoom = Math.min(19, Math.max(5, Math.round(params.zoom ?? 14)));
  const width = Math.min(800, Math.max(200, Math.round(params.width ?? 640)));
  const height = Math.min(600, Math.max(180, Math.round(params.height ?? 320)));

  try {
    const u = new URL(`${DEFAULT_NESHAN_API_ORIGIN}/v2/static`);
    u.searchParams.set('key', key);
    u.searchParams.set('type', 'neshan');
    u.searchParams.set('width', String(width));
    u.searchParams.set('height', String(height));
    u.searchParams.set('zoom', String(zoom));
    u.searchParams.set('center', `${lat},${lng}`);
    u.searchParams.set('markerToken', 'red');

    const res = await fetch(u, {
      headers: { 'Api-Key': key },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? 'image/png';
    if (!ct.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    return { ok: true, contentType: ct, body: Buffer.from(ab) };
  } catch {
    return null;
  }
}
