/** ============================================================
 * پارسرهای منابع دادهٔ تاریخی بازارها (خالص؛ سرور و تست)
 *   tgju summary-table · Hyperliquid candleSnapshot · Yahoo chart · BLS CPI · World Bank
 *  خروجی همه: نقاط صعودی [شروع روز UTC (ms)، مقدار]؛ ردیف نامعتبر حذف می‌شود (هرگز ساخته نمی‌شود).
 * ⚠️ بدون alias «@/» — در فانکشن سرور import می‌شود.
 * ============================================================ */
import type { Pt } from './types.js';

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const dayStart = (ms: number) => Math.floor(ms / 86_400_000) * 86_400_000;
const clean = (pts: Pt[]): Pt[] => {
  const m = new Map<number, number>();
  for (const [t, v] of pts) if (Number.isFinite(t) && Number.isFinite(v) && v > 0) m.set(t, v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};

/** tgju: data = [[باز، کمینه، بیشینه، بسته، تغییر، ٪، 'YYYY/MM/DD' میلادی، شمسی], …] — ریال → تومان */
export function parseTgju(body: unknown, rialToToman = true): Pt[] {
  const rows = (body as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  const out: Pt[] = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const [y, m, d] = String(r[6] ?? '').split('/').map(Number);
    const close = num(String(r[3] ?? '').replace(/<[^>]*>/g, ''));
    if (!y || !m || !d || close === null) continue;
    out.push([Date.UTC(y, m - 1, d), rialToToman ? close / 10 : close]);
  }
  return clean(out);
}

/** Hyperliquid candleSnapshot: [{ t: ms, c: "close" }] */
export function parseHlCandles(body: unknown): Pt[] {
  if (!Array.isArray(body)) return [];
  const out: Pt[] = [];
  for (const c of body as Record<string, unknown>[]) {
    const t = num(c?.t);
    const v = num(c?.c);
    if (t !== null && v !== null) out.push([dayStart(t), v]);
  }
  return clean(out);
}

/** Yahoo chart v8: chart.result[0].timestamp[] (s) + indicators.quote[0].close[] */
export function parseYahooChart(body: unknown): Pt[] {
  const r = (body as { chart?: { result?: { timestamp?: unknown[]; indicators?: { quote?: { close?: unknown[] }[] } }[] } })?.chart?.result?.[0];
  const ts = r?.timestamp;
  const close = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(close)) return [];
  const out: Pt[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = num(ts[i]);
    const v = num(close[i]);
    if (t !== null && v !== null) out.push([dayStart(t * 1000), v]);
  }
  return clean(out);
}

/** BLS v1: Results.series[0].data[{ year, period: 'M01'…'M12', value }] — هر ماه در روز ۱۵ (میانهٔ ماه) */
export function parseBlsCpi(body: unknown): Pt[] {
  const data = (body as { Results?: { series?: { data?: unknown[] }[] } })?.Results?.series?.[0]?.data;
  if (!Array.isArray(data)) return [];
  const out: Pt[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const y = num(r?.year);
    const p = String(r?.period ?? '');
    const v = num(r?.value);
    if (y === null || v === null || !/^M(0[1-9]|1[0-2])$/.test(p)) continue;
    out.push([Date.UTC(y, Number(p.slice(1)) - 1, 15), v]);
  }
  return clean(out);
}

/** World Bank: [meta, [{ date: '2025', value }]] — میانگین سالانه در ۱ ژوئیه (میانهٔ سال) */
export function parseWorldBank(body: unknown): Pt[] {
  const rows = Array.isArray(body) ? body[1] : null;
  if (!Array.isArray(rows)) return [];
  const out: Pt[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const y = num(r?.date);
    const v = num(r?.value);
    if (y !== null && v !== null) out.push([Date.UTC(y, 6, 1), v]);
  }
  return clean(out);
}
