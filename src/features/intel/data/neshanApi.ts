/** ============================================================
 * کلاینت داده فرانت‌اند برای سرویس جست‌وجوی مکانی و مسیریابی نشان (Neshan MCP)
 * ============================================================ */
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import {
  ACTIVE_NESHAN_TOOL_NAMES,
  MCPFARSI_NESHAN_URL,
  NESHAN_MCP_TOOLS_CATALOG,
  NESHAN_PLATFORM_MCP_URL,
  analyzeSpatialQuery,
  buildNeshanDeeplink,
  type NeshanAskResponse,
  type NeshanStatusResponse
} from '../domain/neshanTools';

export function fallbackNeshanStatus(): NeshanStatusResponse {
  return {
    neshanKeyConfigured: false,
    geminiKeyConfigured: false,
    mcpServerUrl: NESHAN_PLATFORM_MCP_URL.replace('platform.', 'api.'),
    docsUrl: NESHAN_PLATFORM_MCP_URL,
    mcpfarsiUrl: MCPFARSI_NESHAN_URL,
    activeToolsCount: ACTIVE_NESHAN_TOOL_NAMES.length,
    totalCatalogToolsCount: NESHAN_MCP_TOOLS_CATALOG.length,
    quota: {
      perMinuteLimit: 20,
      cacheTtlSearchSec: 600,
      cacheTtlRoutingSec: 60
    },
    tools: NESHAN_MCP_TOOLS_CATALOG
  };
}

export function useNeshanStatus() {
  return useQuery<NeshanStatusResponse>({
    queryKey: ['intel', 'neshan-status'],
    queryFn: async () => {
      try {
        return await fetchJson<NeshanStatusResponse>('/api/intel?op=neshan-status', { timeoutMs: 6_000 });
      } catch {
        return fallbackNeshanStatus();
      }
    },
    staleTime: 60_000
  });
}

export async function askNeshanSpatial(params: {
  query: string;
  citySlug?: string;
  userLocation?: { lat: number; lng: number; label?: string } | null;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<NeshanAskResponse> {
  try {
    return await fetchJson<NeshanAskResponse>('/api/intel?op=neshan-ask', {
      method: 'POST',
      body: params,
      timeoutMs: 35_000
    });
  } catch (err) {
    // اگر سرور در حالت آفلاین بود، بدون تولید داده ساختگی، تحلیل محلی و دیپ‌لینک واقعی نشان را برمی‌گردانیم
    const analysis = analyzeSpatialQuery(params.query, params.citySlug ?? 'ahvaz');
    const primary = params.userLocation
      ? { lat: params.userLocation.lat, lng: params.userLocation.lng, nameFa: params.userLocation.label ?? 'موقعیت شما' }
      : analysis.anchors[0];
    const secondary = analysis.anchors[1] ?? analysis.anchors[0];
    const deeplinks =
      analysis.intent === 'routing' && secondary
        ? [
            buildNeshanDeeplink({
              linkType: 'routing',
              originLat: primary?.lat ?? 31.3203,
              originLng: primary?.lng ?? 48.6842,
              destLat: secondary.lat,
              destLng: secondary.lng,
              vehicle: analysis.vehicle
            })
          ]
        : [
            buildNeshanDeeplink({
              linkType: 'point',
              lat: primary?.lat ?? 31.3203,
              lng: primary?.lng ?? 48.6842,
              queryText: analysis.searchTerm
            })
          ];

    const reason = err instanceof Error ? err.message : 'ارتباط با سرور برقرار نشد';
    return {
      query: params.query,
      analysis,
      answer: `⚠️ ارتباط با سرور MCP نشان برقرار نشد (${reason}). طبق سیاست دقت داده‌های دارینو، هیچ اطلاعات مکانی یا ترافیکی به‌صورت ساختگی نمایش داده نمی‌شود. از لینک مستقیم زیر می‌توانید همین درخواست را در نقشه نشان باز کنید.`,
      places: [],
      route: null,
      reverseAddress: null,
      isochrone: null,
      tspOrder: null,
      staticMapProxyUrl: null,
      deeplinks,
      toolTraces: [
        {
          tool: analysis.intent === 'routing' ? 'neshan_direction' : 'neshan_search',
          status: 'error',
          transport: 'neshan-mcp',
          durationMs: 0,
          note: reason
        }
      ],
      sourceMeta: {
        provider: 'Neshan Official MCP Server',
        mcpServerUrl: NESHAN_PLATFORM_MCP_URL.replace('platform.', 'api.'),
        mcpfarsiUrl: MCPFARSI_NESHAN_URL,
        docsUrl: NESHAN_PLATFORM_MCP_URL,
        neshanKeyConfigured: false,
        geminiKeyConfigured: false,
        liveDataVerified: false,
        fetchedAt: Date.now()
      }
    };
  }
}
