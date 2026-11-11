/**
 * ترکیب همهٔ محاسبات یک بازه: پرتفوی، مقایسه با بازارهای فعال، تورم، بازده با جریان نقدی و رشد سال‌به‌سال
 * + ساخت ورودی ساختاریافتهٔ Gemini (فقط اعداد محاسبه‌شده و منابع؛ هیچ دادهٔ خام شخصی دیگری).
 */
import {
  compareMarket, endpointOf, valueAt, inflationAnalysis, portfolioRow, returnAnalysis, summarize, yearlyRows,
  type CompareRow, type CompareSummary, type InflationAnalysis, type PortfolioRow, type ReturnAnalysis, type YearRow
} from './engine';
import { BASE_MARKETS, CAR_AVG_ID, PROP_AVG_ID, carMarketId, coinMarketId, propertyMarketId, type MarketDef } from './markets';
import type { ExternalFlow, PerfSettings, Series, ValueRecord } from './types';

export interface PeriodAnalysis {
  start: ValueRecord;
  end: ValueRecord;
  portfolio: PortfolioRow;
  rows: CompareRow[];
  summary: CompareSummary;
  inflation: InflationAnalysis;
  returns: ReturnAnalysis | null;
}

/** بازارهای فعال (پایه + محله‌ها + ارزهای منتخب) با نام نهایی */
export function activeMarkets(settings: PerfSettings, names: { neighborhoods: Record<string, string>; cars?: Record<string, string> }): MarketDef[] {
  const out: MarketDef[] = [];
  const carIds = settings.carModelIds ?? [];
  for (const m of BASE_MARKETS) {
    if (!settings.enabledMarkets.includes(m.id)) continue;
    if (m.id === 'car') {
      if (!carIds.length) {
        out.push({ ...m, kind: 'none', seriesId: null, missingReason: 'مدل خودرو انتخاب نشده است' });
        continue;
      }
      // هر مدل یک ردیف (قیمت بازار) + میانگین مدل‌ها
      for (const id of carIds) out.push({ ...m, id: carMarketId(id), name: `خودرو — ${names.cars?.[id] ?? `مدل ${id}`}`, seriesId: carMarketId(id) });
      if (carIds.length >= 2) out.push({ ...m, id: CAR_AVG_ID, name: 'خودرو — میانگین مدل‌های منتخب', seriesId: CAR_AVG_ID });
      continue;
    }
    out.push(m);
  }
  if (settings.enabledMarkets.includes('property')) {
    for (const k of settings.neighborhoods) {
      out.push({ id: propertyMarketId(k), name: `مسکن — ${names.neighborhoods[k] ?? k}`, group: 'iran', kind: 'price', currency: 'toman', seriesId: propertyMarketId(k) });
    }
    if (settings.neighborhoods.length >= 2) out.push({ id: PROP_AVG_ID, name: 'مسکن — میانگین محله‌های منتخب', group: 'iran', kind: 'price', currency: 'toman', seriesId: PROP_AVG_ID });
  }
  for (const sym of settings.extraCoins) {
    out.push({ id: coinMarketId(sym), name: sym, group: 'global', kind: 'price', currency: 'usd', seriesId: coinMarketId(sym) });
  }
  return out;
}

export function analyzePeriod(
  start: ValueRecord,
  end: ValueRecord,
  records: ValueRecord[],
  flows: ExternalFlow[],
  settings: PerfSettings,
  markets: MarketDef[],
  series: Record<string, Series>
): PeriodAnalysis {
  const s = endpointOf(start);
  const e = endpointOf(end);
  const rows = markets.map((m) => withDataRange(compareMarket(m, m.seriesId ? series[m.seriesId] : undefined, s, e), m.seriesId ? series[m.seriesId] : undefined, e.ts));
  return {
    start,
    end,
    portfolio: portfolioRow(s, e),
    rows,
    summary: summarize(rows),
    inflation: inflationAnalysis(s, e, { iranCpi: series.ir_cpi, usCpi: series.us_cpi, usdt: series.ir_usd, gold18: series.ir_gold18 }),
    returns: returnAnalysis(records, start.id, end.id, flows, settings.flowsComplete)
  };
}

/**
 * «از چه تاریخی داده داریم» + اگر داده بعد از شروع دوره آغاز شده، تغییر قیمت از اولین داده تا پایان
 * (برای خودرو و مسکن که اپ از وسط دوره جمع‌آوری را شروع کرده).
 */
function withDataRange(row: CompareRow, s: Series | undefined, endTs: number): CompareRow {
  if (!s?.points.length) return row;
  const first = s.points[0];
  const out: CompareRow = { ...row, dataFrom: first[0] };
  const label =
    /^car[:_]/.test(row.id) ? 'دستگاه' :
    /^prop[:_]/.test(row.id) ? 'مترمربع' :
    /^(nvda|aapl|tsla)$/.test(row.id) ? 'سهم' :
    /^oil_/.test(row.id) ? 'بشکه' :
    row.id === 'ir_sekee' ? 'سکه' :
    row.id === 'ir_gold18' ? 'گرم' :
    row.id === 'gold_global' ? 'اونس' :
    /^(spx|ndx|dow_jones|msci_world)$/.test(row.id) ? 'واحد شاخص' :
    /^(btc|eth|sol|hype|zec|coin:)/.test(row.id) ? 'واحد' : null;

  if (label && row.status === 'ok' && row.priceStart && row.priceEnd && row.priceStart.value > 0) {
    const cap = row.currency === 'usd' ? row.startUsd : row.startToman;
    if (cap && cap > 0) {
      out.units = { count: cap / row.priceStart.value, label, priceStart: row.priceStart.value, priceEnd: row.priceEnd.value };
    }
  }
  if (row.status !== 'ok' && !row.priceStart) {
    const p1 = valueAt(s, endTs);
    if (p1 && p1.at > first[0] && first[1] > 0) out.sinceDataStart = { from: first[0], to: p1.at, change: p1.value / first[1] - 1 };
  }
  return out;
}

export interface YearlyTable {
  id: string;
  name: string;
  unit: string;
  source?: string;
  rows: YearRow[];
}

/** رشد سال‌به‌سال (اول فروردین هر سال از ۱۴۰۲ تا امروز) برای طلا، سکه، دلار، مسکن و خودرو */
export function yearlyTables(series: Record<string, Series>, ids: { id: string; name: string; unit: string }[], years: number[], yearStart: (y: number) => number, now: number): YearlyTable[] {
  return ids.map(({ id, name, unit }) => ({ id, name, unit, source: series[id]?.source, rows: yearlyRows(series[id], years, yearStart, now) }));
}

const r4 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10_000) / 10_000);
const r0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v));
const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** ورودی Gemini: نسبت‌ها به‌صورت کسر (0.12 = ۱۲٪)، مبالغ گرد؛ توضیحات کاربر فقط به‌عنوان متن */
export function geminiPayload(a: PeriodAnalysis, records: ValueRecord[], years: YearlyTable[], jalali: (ts: number) => string, now: number, walletBridge?: unknown) {
  const inf = a.inflation;
  return {
    preparedAt: day(now),
    note: 'ratios are fractions (0.12 = 12%); usd in US dollars; toman in Iranian toman',
    period: { start: day(a.start.dateTs), startJalali: jalali(a.start.dateTs), end: day(a.end.dateTs), endJalali: jalali(a.end.dateTs), days: Math.round((a.end.dateTs - a.start.dateTs) / 86_400_000) },
    history: records.map((r) => ({ date: day(r.dateTs), jalali: jalali(r.dateTs), usd: r0(r.usd), rateToman: r0(r.rateToman), toman: r0(r.toman), origin: r.origin, note: r.note ? r.note.slice(0, 120) : undefined })),
    portfolio: {
      startUsd: r0(a.portfolio.startUsd), endUsd: r0(a.portfolio.endUsd), startToman: r0(a.portfolio.startToman), endToman: r0(a.portfolio.endToman),
      pnlUsd: r0(a.portfolio.pnlUsd), pnlToman: r0(a.portfolio.pnlToman), changeUsd: r4(a.portfolio.returnUsd), changeToman: r4(a.portfolio.returnToman)
    },
    returnQualified: a.returns?.qualified ?? false,
    returns: a.returns && { netExternalFlowsUsd: r0(a.returns.netFlowsUsd), flowsCount: a.returns.flowsCount, twr: r4(a.returns.twr), xirrAnnual: r4(a.returns.xirr), investmentGainUsd: r0(a.returns.investmentGainUsd) },
    inflation: {
      iranOfficial: inf.iran && { cumulative: r4(inf.iran.cumulative), from: day(inf.iran.from.at), to: day(inf.iran.to.at), source: inf.iran.source },
      usOfficial: inf.us && { cumulative: r4(inf.us.cumulative), from: day(inf.us.from.at), to: day(inf.us.to.at), source: inf.us.source },
      realToman: r4(inf.realToman),
      realUsd: r4(inf.realUsd),
      marketProxies: inf.proxies.map((p) => ({ name: p.name, change: r4(p.change), source: p.source })),
      tomanChangeDecomposition: inf.fx && { totalToman: r0(inf.fx.total), fromUsdValueChangeToman: r0(inf.fx.fromUsdValue), fromDollarRateChangeToman: r0(inf.fx.fromRate), dollarRateChange: r4(inf.fx.rateChange) }
    },
    markets: a.rows.map((r) => ({
      name: r.name,
      group: r.group,
      kind: r.kind,
      status: r.status,
      reason: r.status === 'ok' ? undefined : r.reason,
      detail: r.detail,
      priceDates: r.priceStart && r.priceEnd ? [day(r.priceStart.at), day(r.priceEnd.at)] : undefined,
      endUsd: r0(r.endUsd), endToman: r0(r.endToman), returnUsd: r4(r.returnUsd), returnToman: r4(r.returnToman),
      portfolioMinusMarketUsd: r0(r.vsPortfolioUsd), portfolioMinusMarketToman: r0(r.vsPortfolioToman),
      opportunityCostUsd: r0(r.opportunityUsd), opportunityCostToman: r0(r.opportunityToman),
      source: r.source, sourceUpdated: r.updatedAt ? day(r.updatedAt) : undefined,
      dataFrom: r.dataFrom ? day(r.dataFrom) : undefined,
      // خودرو/مسکن: با ارزش تومانی پرتفوی در شروع چند دستگاه یا مترمربع، و قیمت واحد در شروع و پایان (تومان)
      unitsBought: r.units && { count: Math.round(r.units.count * 100) / 100, unit: r.units.label, unitPriceStartToman: r0(r.units.priceStart), unitPriceEndToman: r0(r.units.priceEnd), sellValueEndToman: r0(r.endToman) },
      dataFromJalali: r.dataFrom ? jalali(r.dataFrom) : undefined,
      // فقط وقتی status≠ok: تغییر قیمت از اولین داده تا پایان دوره (بازهٔ کوتاه‌تر از دورهٔ اصلی)
      changeSinceDataStart: r.sinceDataStart && { from: day(r.sinceDataStart.from), fromJalali: jalali(r.sinceDataStart.from), to: day(r.sinceDataStart.to), change: r4(r.sinceDataStart.change) }
    })),
    summary: { bestMarket: a.summary.best?.name ?? null, portfolioBeat: a.summary.beaten.map((r) => r.name), portfolioLagged: a.summary.lagged.map((r) => r.name) },
    yearlyGrowth: years.map((t) => ({
      name: t.name, unit: t.unit, source: t.source,
      rows: t.rows.map((r) => ({ jalaliYearStart: r.year || 'now', date: r.at ? day(r.at) : null, value: r0(r.value), changeFromPrevious: r4(r.change) }))
    })),
    walletCostBasisAndCycles: walletBridge ?? null
  };
}
