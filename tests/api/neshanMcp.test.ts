// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_NESHAN_TOOL_NAMES,
  NESHAN_MCP_TOOLS_CATALOG,
  analyzeSpatialQuery,
  buildNeshanDeeplink,
  extractCoordinatesFromText,
  resolveGeoAnchors
} from '../../src/features/intel/domain/neshanTools';
import {
  askNeshanAgent,
  extractPlacesFromNeshanRaw,
  extractRouteFromNeshanRaw,
  getNeshanStatus
} from '../../api/_neshanMcp';

describe('Neshan MCP Tools Catalog & Spatial Intent Analysis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NESHAN_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('دارای کاتالوگ کامل ۱۹ ابزار MCP نشان با ۱۳ ابزار فعال (۱۱ ضروری + ۲ مشروط) است', () => {
    expect(NESHAN_MCP_TOOLS_CATALOG).toHaveLength(19);
    expect(ACTIVE_NESHAN_TOOL_NAMES).toHaveLength(13);
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_search');
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_direction');
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_reverse_geocode');
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_geocode');
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_isochrone');
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_tsp');
    expect(ACTIVE_NESHAN_TOOL_NAMES).toContain('neshan_distance_matrix');
    expect(ACTIVE_NESHAN_TOOL_NAMES).not.toContain('neshan_vrp_logistic');
  });

  it('درخواست جست‌وجوی صرافی در اهواز را به‌عنوان موجودیت مالی و neshan_search تشخیص می‌دهد', () => {
    const res = analyzeSpatialQuery('نزدیک‌ترین صرافی‌ها به مرکز شهر اهواز را پیدا کن.');
    expect(res.intent).toBe('search_poi');
    expect(res.isFinancialRelated).toBe(true);
    expect(res.searchTerm).toBe('صرافی');
    expect(res.anchors[0]?.id).toBe('ahvaz-center');
  });

  it('درخواست مسیریابی با ترافیک لحظه‌ای بین دو محله اهواز را تشخیص می‌دهد', () => {
    const res = analyzeSpatialQuery('با توجه به ترافیک فعلی، رسیدن از شهرک دانشگاه اهواز به کیانپارس چقدر زمان می‌برد؟');
    expect(res.intent).toBe('routing');
    expect(res.trafficMode).toBe('live');
    expect(res.vehicle).toBe('car');
    expect(res.anchors.map((a) => a.id)).toContain('ahvaz-daneshgah');
    expect(res.anchors.map((a) => a.id)).toContain('ahvaz-kianpars');
  });

  it('درخواست تبدیل مختصات GPS به آدرس (Reverse Geocode) و ایزوکرون ۱۵ دقیقه‌ای را تشخیص می‌دهد', () => {
    const coords = extractCoordinatesFromText('این مختصات 31.3203, 48.6842 مربوط به کدام خیابان است؟');
    expect(coords).toEqual([{ lat: 31.3203, lng: 48.6842 }]);

    const rev = analyzeSpatialQuery('این مختصات GPS مربوط به کدام خیابان یا منطقه است؟ 31.3203, 48.6842');
    expect(rev.intent).toBe('reverse_geocode');

    const iso = analyzeSpatialQuery('در فاصله ۱۵ دقیقه رانندگی از کیانپارس اهواز چه بانک‌هایی قرار دارند؟');
    expect(iso.intent).toBe('isochrone');
    expect(iso.isochroneMinutes).toBe(15);
    expect(iso.isFinancialRelated).toBe(true);
  });

  it('دیپ‌لینک استاندارد وب و اپلیکیشن نشان برای نقطه و مسیر می‌سازد', () => {
    const pt = buildNeshanDeeplink({ linkType: 'point', lat: 31.3203, lng: 48.6842, queryText: 'صرافی' });
    expect(pt.webUrl).toContain('31.320300,48.684200');
    expect(pt.searchWebUrl).toContain(encodeURIComponent('صرافی'));

    const rt = buildNeshanDeeplink({
      linkType: 'routing',
      originLat: 31.3005,
      originLng: 48.6024,
      destLat: 31.3489,
      destLng: 48.6881,
      vehicle: 'car'
    });
    expect(rt.webUrl).toContain('/maps/routing/car/origin/31.300500,48.602400/destination/31.348900,48.688100');
  });

  it('در صورت نبود کلید NESHAN_API_KEY هیچ داده ساختگی تولید نمی‌کند و وضعیت را شفاف اعلام می‌کند', async () => {
    delete process.env.NESHAN_API_KEY;
    const status = getNeshanStatus();
    expect(status.neshanKeyConfigured).toBe(false);

    const out = await askNeshanAgent({
      query: 'نزدیک‌ترین صرافی‌ها به مرکز شهر اهواز را پیدا کن.',
      citySlug: 'ahvaz',
      history: []
    });
    expect(out.places).toEqual([]);
    expect(out.route).toBeNull();
    expect(out.sourceMeta.neshanKeyConfigured).toBe(false);
    expect(out.sourceMeta.liveDataVerified).toBe(false);
    expect(out.toolTraces[0]?.status).toBe('unconfigured');
    expect(out.deeplinks.length).toBeGreaterThan(0);
  });

  it('خروجی خام مکان‌ها و مسیریابی نشان را به ساختار استاندارد دارینو تبدیل می‌کند', () => {
    const places = extractPlacesFromNeshanRaw(
      {
        items: [
          {
            title: 'صرافی اهواز',
            address: 'اهواز، خیابان نادری',
            neighbourhood: 'نادری',
            category: 'financial',
            location: { x: 48.6845, y: 31.3205 }
          }
        ]
      },
      31.3203,
      48.6842
    );
    expect(places).toHaveLength(1);
    expect(places[0].title).toBe('صرافی اهواز');
    expect(places[0].distanceMeters).toBeGreaterThanOrEqual(0);

    const route = extractRouteFromNeshanRaw(
      {
        routes: [
          {
            legs: [
              {
                summary: 'بلوار ساحلی',
                distance: { value: 6400, text: '۶.۴ کیلومتر' },
                duration: { value: 780, text: '۱۳ دقیقه' },
                steps: [{ instruction: 'حرکت در بلوار ساحلی', distance: { text: '۴ کیلومتر' }, duration: { text: '۸ دقیقه' } }]
              }
            ]
          }
        ]
      },
      { origin_lat: 31.3005, origin_lng: 48.6024, dest_lat: 31.3489, dest_lng: 48.6881, vehicle: 'car', traffic_mode: 'live' },
      'شهرک دانشگاه',
      'کیانپارس'
    );
    expect(route).not.toBeNull();
    expect(route?.distanceMeters).toBe(6400);
    expect(route?.durationSeconds).toBe(780);
    expect(route?.steps).toHaveLength(1);
  });

  it('نقاط مرجع اهواز و تهران را به ترتیب ظهور در جمله (مبدأ سپس مقصد) استخراج می‌کند', () => {
    const anchors = resolveGeoAnchors('از کیانپارس تا شهرک دانشگاه اهواز');
    expect(anchors.map((a) => a.id)).toEqual(['ahvaz-kianpars', 'ahvaz-daneshgah']);
  });

  it('صفحه چالش HTML فایروال ArvanCloud روی خطای ۵۰۳ را به‌درستی تشخیص می‌دهد', async () => {
    process.env.NESHAN_API_KEY = 'service.test-key';
    const arvanHtml = ':root{--primary-10:#faf7ff;--primary-20:#e5d6ff;--primary-130:#471882;--primary-150:#33115d}html{height:100%}body{background:#fff}';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(arvanHtml, { status: 503 }));

    const out = await askNeshanAgent({
      query: 'نزدیک‌ترین بانک‌ها و خودپردازها به کیانپارس اهواز کجاست؟',
      citySlug: 'ahvaz',
      history: []
    });
    expect(out.places).toEqual([]);
    expect(out.sourceMeta.liveDataVerified).toBe(false);
    expect(out.answer).toContain('ArvanCloud');
  });

  it('در صورت مسدودشدن Vercel و روشن‌بودن پل مک، درخواست نشان را از طریق پل مک انجام می‌دهد', async () => {
    process.env.NESHAN_API_KEY = 'service.test-key';
    process.env.SHOP_RELAY_KEY = 'a'.repeat(64);
    const { _test, claimJobs, claimNeshanJobs, submitResult } = await import('../../api/_shopRelay');
    const { runNeshanJob } = await import('../../tools/snappfood-bridge/bridge.mjs');
    _test.memory.clear();

    await claimJobs();

    const arvanHtml = ':root{--primary-10:#faf7ff;--primary-20:#e5d6ff;--primary-130:#471882;--primary-150:#33115d}';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.neshan.org/mcp')) {
        const stack = new Error().stack || '';
        if (stack.includes('bridge.mjs')) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      items: [
                        {
                          title: 'بانک ملت شعبه کیانپارس',
                          address: 'اهواز، کیانپارس، خیابان ۲ شرقی',
                          neighbourhood: 'کیانپارس',
                          category: 'bank',
                          location: { x: 48.6885, y: 31.3492 }
                        }
                      ]
                    })
                  }
                ]
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'sess-1' } }
          );
        }
        return new Response(arvanHtml, { status: 503 });
      }
      if (url.startsWith('https://api.neshan.org/v1/search')) {
        return new Response(arvanHtml, { status: 503 });
      }
      return new Response('{}', { status: 404 });
    });

    const agentPromise = askNeshanAgent({
      query: 'نزدیک‌ترین بانک‌ها به کیانپارس اهواز کجاست؟',
      citySlug: 'ahvaz',
      history: []
    });

    let claimed: { id: string; job: { tool: string; args: Record<string, unknown> } }[] = [];
    for (let i = 0; i < 60; i++) {
      claimed = await claimNeshanJobs();
      if (claimed.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(claimed).toHaveLength(1);
    const bridgeRes = await runNeshanJob(claimed[0].job, 'service.test-key');
    expect(bridgeRes.ok).toBe(true);
    await submitResult({ id: claimed[0].id, kind: 'neshan', ...bridgeRes });

    const out = await agentPromise;
    expect(out.sourceMeta.liveDataVerified).toBe(true);
    expect(out.places).toHaveLength(1);
    expect(out.places[0].title).toBe('بانک ملت شعبه کیانپارس');

    delete process.env.SHOP_RELAY_KEY;
    _test.memory.clear();
  });
});
