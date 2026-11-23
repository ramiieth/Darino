import type { IranFundSubtype, IranMarketSegment } from '../src/features/markets/data/iranMarketCatalog.js';

export interface LiveIranInstrument {
  id: string;
  symbol: string;
  nameFa: string;
  segment: IranMarketSegment;
  sectorFa: string;
  fundSubtype?: IranFundSubtype;
  tradeMode: 'exchange' | 'issuance';
  lastPriceRial: number | null;
  closePriceRial: number | null;
  changePct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  change60dPct: number | null;
  change90dPct: number | null;
  change365dPct: number | null;
  openPriceRial: number | null;
  highPriceRial: number | null;
  lowPriceRial: number | null;
  yesterdayPriceRial: number | null;
  volume: number | null;
  realBuyVolume: number | null;
  realSellVolume: number | null;
  realBuyCount: number | null;
  realSellCount: number | null;
  legalBuyVolume: number | null;
  legalSellVolume: number | null;
  pe: number | null;
  eps: number | null;
  tradeValueBillionToman: number | null;
  noteFa: string;
  officialUrl: string;
  live: true;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; items: LiveIranInstrument[] } | null = null;

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function detectFundSubtype(txt: string): IranFundSubtype {
  if (/بازنشست|آتیه|آتيه/.test(txt)) return 'pension';
  if (/طلا|سکه|شمش|عیار|لوتوس|کهربا|گنج|مثقال|زرفام|گوهر/.test(txt)) return 'gold';
  if (/اهرم|شتاب|موج|توان|نارنج|بیدار|جهش/.test(txt)) return 'leveraged';
  if (/درآمد\s*ثابت|ثابت|آوند|کارا|کمند|یاقوت|لبخند|کیان/.test(txt)) return 'fixed_income';
  if (/شاخص|همسنگ|هم[\s‌]*وزن/.test(txt)) return 'index';
  if (/بخشی|استیل|اکتان|خودران|سیمانو|دارونو|پالایش/.test(txt)) return 'sector';
  return 'equity';
}

function mapRow(raw: Record<string, unknown>, idx: number, defaultSeg?: IranMarketSegment): LiveIranInstrument | null {
  const symbol = clean(raw.l18 ?? raw.symbol ?? raw.namad);
  if (!symbol) return null;
  const nameFa = clean(raw.l30 ?? raw.name ?? raw.title) || symbol;
  const sectorFa = clean(raw.cs ?? raw.sector ?? raw.industry) || (defaultSeg === 'ime' ? 'بورس کالا' : 'بازار سرمایه');
  const marketRaw = clean(raw.market ?? raw.flow ?? raw.bourse);
  const txt = `${symbol} ${nameFa} ${sectorFa}`;

  let segment: IranMarketSegment = defaultSeg ?? 'tse';
  let fundSubtype: IranFundSubtype | undefined;
  if (defaultSeg === 'ime' || /گواهی\s*سپرده|سلف\s*موازی|زعفران|پسته|شمش\s*نقره/.test(txt)) {
    segment = 'ime';
  } else if (/بازنشست/.test(txt)) {
    segment = 'pension';
    fundSubtype = 'pension';
  } else if (/صندوق/.test(sectorFa) || /صندوق/.test(nameFa) || marketRaw.includes('صندوق')) {
    segment = 'funds';
    fundSubtype = detectFundSubtype(txt);
  } else if (marketRaw.includes('فرابورس') || marketRaw === '2' || marketRaw === '4') {
    segment = 'ifb';
  }

  const lastPriceRial = numOrNull(raw.pl ?? raw.last_price ?? raw.price);
  const closePriceRial = numOrNull(raw.pc ?? raw.close_price ?? raw.final_price);
  const changePct = numOrNull(raw.plp ?? raw.pcp ?? raw.change_percent ?? raw.percent);
  const change7dPct = numOrNull(raw.r7 ?? raw.return_7d ?? raw.change_7d ?? raw.week_change);
  const change30dPct = numOrNull(raw.r30 ?? raw.return_30d ?? raw.change_30d ?? raw.month_change);
  const change60dPct = numOrNull(raw.r60 ?? raw.return_60d ?? raw.change_60d ?? raw.two_month_change);
  const change90dPct = numOrNull(raw.r90 ?? raw.return_90d ?? raw.change_90d ?? raw.quarter_change);
  const change365dPct = numOrNull(raw.r365 ?? raw.return_365d ?? raw.change_365d ?? raw.year_change);
  const openPriceRial = numOrNull(raw.pf ?? raw.open ?? raw.first_price);
  const highPriceRial = numOrNull(raw.pmax ?? raw.high ?? raw.max_price);
  const lowPriceRial = numOrNull(raw.pmin ?? raw.low ?? raw.min_price);
  const yesterdayPriceRial = numOrNull(raw.py ?? raw.yesterday_price ?? raw.prev_close);
  const volume = numOrNull(raw.tvol ?? raw.vol ?? raw.volume);
  const realBuyVolume = numOrNull(raw.Buy_I_Volume ?? raw.buy_i_volume ?? raw.real_buy_vol);
  const realSellVolume = numOrNull(raw.Sell_I_Volume ?? raw.sell_i_volume ?? raw.real_sell_vol);
  const realBuyCount = numOrNull(raw.Buy_CountI ?? raw.buy_count_i ?? raw.real_buy_count);
  const realSellCount = numOrNull(raw.Sell_CountI ?? raw.sell_count_i ?? raw.real_sell_count);
  const legalBuyVolume = numOrNull(raw.Buy_N_Volume ?? raw.buy_n_volume ?? raw.legal_buy_vol);
  const legalSellVolume = numOrNull(raw.Sell_N_Volume ?? raw.sell_n_volume ?? raw.legal_sell_vol);
  const pe = numOrNull(raw.pe);
  const eps = numOrNull(raw.eps);
  const tval = numOrNull(raw.tval ?? raw.trade_value ?? raw.value);
  const tradeValueBillionToman = tval && tval > 0 ? Number((tval / 10_000_000_000).toFixed(2)) : null;
  const ins = clean(raw.isin ?? raw.id ?? raw.ins_code ?? raw.tsetmc_id);

  return {
    id: `brs-${segment}-${ins || symbol}-${idx}`,
    symbol,
    nameFa,
    segment,
    sectorFa,
    fundSubtype,
    tradeMode: segment === 'pension' ? 'issuance' : 'exchange',
    lastPriceRial,
    closePriceRial,
    changePct,
    change7dPct,
    change30dPct,
    change60dPct,
    change90dPct,
    change365dPct,
    openPriceRial,
    highPriceRial,
    lowPriceRial,
    yesterdayPriceRial,
    volume,
    realBuyVolume,
    realSellVolume,
    realBuyCount,
    realSellCount,
    legalBuyVolume,
    legalSellVolume,
    pe,
    eps,
    tradeValueBillionToman,
    noteFa: [pe && pe > 0 && segment !== 'funds' ? `P/E: ${pe.toFixed(1)}` : null, tradeValueBillionToman ? `ارزش: ${tradeValueBillionToman} م.ت` : null].filter(Boolean).join(' · ') || sectorFa,
    officialUrl: segment === 'ime' ? 'https://www.ime.co.ir/' : /^\d{10,20}$/.test(ins) ? `https://www.tsetmc.com/instInfo/${ins}` : 'https://www.tsetmc.com/',
    live: true
  };
}

async function fetchList(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const d = (await res.json()) as unknown;
  if (Array.isArray(d)) return d as Record<string, unknown>[];
  if (d && typeof d === 'object') {
    for (const k of ['data', 'symbols', 'result', 'items']) {
      if (Array.isArray((d as Record<string, unknown>)[k])) return (d as Record<string, unknown>)[k] as Record<string, unknown>[];
    }
  }
  return [];
}

export async function getIranMarketSnapshot() {
  const key = (process.env.BRSAPI_KEY ?? '').trim();
  if (!key) return { items: [], updatedAt: null, configured: false };
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return { items: cache.items, updatedAt: cache.at, configured: true };

  const k = encodeURIComponent(key);
  const [tse, imeCert, imeFund] = await Promise.all([
    fetchList(`https://BrsApi.ir/Api/Tsetmc/AllSymbols.php?key=${k}&type=1`).catch(() => []),
    fetchList(`https://BrsApi.ir/Api/IME/Certificate.php?key=${k}`).catch(() => []),
    fetchList(`https://BrsApi.ir/Api/IME/Fund.php?key=${k}`).catch(() => [])
  ]);

  const seen = new Set<string>();
  const items: LiveIranInstrument[] = [];
  const push = (rows: Record<string, unknown>[], seg?: IranMarketSegment) => {
    rows.forEach((r, i) => {
      const m = mapRow(r, i, seg);
      if (m && !seen.has(`${m.segment}:${m.symbol}`)) {
        seen.add(`${m.segment}:${m.symbol}`);
        items.push(m);
      }
    });
  };
  push(tse);
  push(imeCert, 'ime');
  push(imeFund, 'funds');
  items.sort((a, b) => (b.tradeValueBillionToman ?? 0) - (a.tradeValueBillionToman ?? 0));

  const now = Date.now();
  if (items.length) cache = { at: now, items };
  return { items, updatedAt: items.length ? now : null, configured: true };
}
