/**
 * ژورنال اسپات — سواپ‌های کیف پول‌ها در DEXهای مختلف (زریون: operation_type = trade)، بدون تایپ (خالص و آزمون‌پذیر)
 *
 *   هر سواپ: آنچه رفت (out) و آنچه آمد (in) با ارزش دلاری همان لحظه (قیمت زریون)، کارمزد گاز، پروتکل و شبکه.
 *   استیبل‌کوین‌ها نقد حساب می‌شوند (سود/زیان ندارند). WETH = ETH، WBTC/cbBTC = BTC، WSOL = SOL.
 *   بهای تمام‌شده: میانگین موزون. فروش = ارزش آنچه رفت؛ سود محقق = فروش − بهای سهم فروخته‌شده.
 *   توکنی که از راهی جز سواپ آمده (واریز، ایردراپ) بهای معلوم ندارد → آن بخش از فروش «بهای نامعلوم» است، نه سود.
 *   «هزینهٔ سواپ» = ارزش رفته − ارزش آمده (لغزش + کارمزد استخر)، فقط وقتی هر دو قیمت دارند.
 *   موجودی واقعی (held، از موجودی کیف پول) بر دفتر سواپ مقدم است:
 *     • کمتر از دفتر (توکن به صرافی/کیف دیگر رفت یا گاز شد) → بهای تمام‌شده به همان نسبت کم می‌شود (میانگین ثابت می‌ماند).
 *     • بیشتر از دفتر (واریز، ایردراپ، پل) → مازاد «بهای نامعلوم» است: ارزشش دیده می‌شود ولی در سود باز نمی‌آید.
 *   پوزیشن باز = موجودی واقعی با ارزش ≥ DUST_USD؛ کامل فروخته‌شده یا خرد در «تسویه‌شده» (سود محقق‌شان در جمع می‌ماند).
 *   حذف کامل (نه نمایش، نه محاسبه): توکن اسپم/مخفی (is_trash)، تأییدنشده (احتمال اسکم)، و توکنی که زریون برایش قیمت ندارد —
 *   هم در لحظهٔ سواپ (بدون ارزش دلاری) و هم الان (موجودی دارد ولی قیمت لحظه‌ای ندارد).
 */
import type { WalletTransaction, TransactionTransfer } from '@/features/connected/domain/model';

const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDE', 'USDS', 'FDUSD', 'PYUSD', 'USDC.E', 'USDBC', 'USDT0', 'USD1', 'FRAX', 'LUSD', 'GHO', 'CRVUSD', 'TUSD', 'USDB', 'USDG', 'RLUSD', 'SUSD', 'USD₮0', 'USDT.E', 'AUSD', 'USDH', 'USDXL', 'USDX']);
const WRAPPED: Record<string, string> = { WETH: 'ETH', WBTC: 'BTC', CBBTC: 'BTC', WSOL: 'SOL', WBNB: 'BNB', WAVAX: 'AVAX', WPOL: 'POL', WMATIC: 'POL', WHYPE: 'HYPE', WS: 'S' };

export const isStable = (symbol: string) => STABLES.has(symbol.toUpperCase());

/** زیر این ارزش دلاری = خرد (Dust) → جزو پوزیشن‌های باز نیست */
export const DUST_USD = 10;

export interface SpotLeg {
  /** کلید دارایی (نماد تأییدشده یا شناسهٔ زریون) */
  asset: string;
  symbol: string;
  icon: string | null;
  qty: number;
  usd: number | null;
  stable: boolean;
}

export interface SpotSwap {
  id: string;
  wallet: string;
  time: number;
  chain: string;
  protocol: string;
  hash: string;
  sold: SpotLeg[];
  bought: SpotLeg[];
  /** ارزش معامله (بزرگ‌ترِ دو طرف) */
  usd: number | null;
  gas: number | null;
  /** ارزش رفته − ارزش آمده */
  cost: number | null;
}

const toNum = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function assetKey(t: Pick<TransactionTransfer, 'symbol' | 'tokenId' | 'verified'>): string {
  const sym = t.symbol.toUpperCase();
  const base = WRAPPED[sym] ?? sym;
  return t.verified !== false || isStable(base) ? base : `${base}#${t.tokenId ?? ''}`;
}

/** اسپم، مخفی یا تأییدنشده (احتمال اسکم) — استیبل‌های شناخته‌شده فقط اگر اسپم باشند حذف می‌شوند */
export function isJunk(t: Pick<TransactionTransfer, 'symbol' | 'spam' | 'verified'>): boolean {
  if (t.spam) return true;
  const sym = t.symbol.toUpperCase();
  return t.verified === false && !isStable(WRAPPED[sym] ?? sym);
}

function legs(ts: readonly TransactionTransfer[]): SpotLeg[] {
  const by = new Map<string, SpotLeg>();
  for (const t of ts) {
    const qty = toNum(t.quantity);
    // بدون ارزش دلاری = زریون قیمتش را ندارد → کنار گذاشته می‌شود (مثل اسپم)
    if (!qty || qty <= 0 || isJunk(t) || toNum(t.value) === null) continue;
    const asset = assetKey(t);
    const prev = by.get(asset);
    const usd = toNum(t.value);
    if (prev) { prev.qty += qty; prev.usd = prev.usd === null || usd === null ? null : prev.usd + usd; }
    else by.set(asset, { asset, symbol: WRAPPED[t.symbol.toUpperCase()] ?? t.symbol.toUpperCase(), icon: t.icon, qty, usd, stable: isStable(asset) });
  }
  return [...by.values()];
}

const sum = (ls: readonly SpotLeg[]) => (ls.every((l) => l.usd !== null) ? ls.reduce((s, l) => s + (l.usd ?? 0), 0) : null);

/** تراکنش‌های زریون → سواپ‌ها (فقط تأییدشده و غیر اسپم؛ هر دو طرف لازم) */
export function toSwaps(wallet: string, txs: readonly WalletTransaction[]): SpotSwap[] {
  const out: SpotSwap[] = [];
  for (const tx of txs) {
    if (tx.type !== 'trade' || tx.spam || (tx.status && tx.status !== 'confirmed')) continue;
    const time = Date.parse(tx.minedAt);
    if (!Number.isFinite(time)) continue;
    const sold = legs(tx.transfers.filter((t) => t.direction === 'out'));
    const bought = legs(tx.transfers.filter((t) => t.direction === 'in'));
    // بعد از حذف توکن‌های بی‌قیمت/اسپم، اگر هیچ طرفِ غیر استیبلی نماند سواپ معنایی ندارد
    if (!sold.length && !bought.length) continue;
    if (![...sold, ...bought].some((l) => !l.stable)) continue;
    // دارایی هم‌نام در دو طرف (مثلاً ETH → WETH) سواپ واقعی نیست
    if (sold.length === 1 && bought.length === 1 && sold[0].asset === bought[0].asset) continue;
    const s = sum(sold), b = sum(bought);
    out.push({
      id: `${wallet.toLowerCase()}|${tx.id}`,
      wallet,
      time,
      chain: tx.chain,
      protocol: tx.protocol || tx.acts?.find((a) => a.protocol)?.protocol || '',
      hash: tx.hash,
      sold,
      bought,
      usd: s === null && b === null ? null : Math.max(s ?? 0, b ?? 0),
      gas: tx.fee,
      // هزینهٔ سواپ فقط وقتی هر دو طرف کامل مانده‌اند
      cost: sold.length && bought.length && s !== null && b !== null ? s - b : null
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/* ---------------- دفتر هر دارایی ---------------- */

export interface SpotSale {
  swapId: string;
  asset: string;
  time: number;
  proceeds: number;
  /** null = بهای بخشی یا همه نامعلوم */
  pnl: number | null;
  /** بخش فروش بدون بهای معلوم (توکن از راهی جز سواپ آمده) */
  unknownQty: number;
}

export interface SpotAsset {
  asset: string;
  symbol: string;
  icon: string | null;
  /** خرید/فروش در بازهٔ انتخابی */
  buys: number;
  sells: number;
  /** خرید/فروش در کل تاریخچهٔ خوانده‌شده (میانگین بها از همین‌ها ساخته می‌شود) */
  buysAll: number;
  sellsAll: number;
  boughtUsd: number;
  soldUsd: number;
  realized: number;
  /** فروش بدون بهای معلوم (دلار) */
  unknownProceeds: number;
  /** موجودی فعلی (واقعی کیف پول اگر داده شود؛ وگرنه باقیماندهٔ دفتر سواپ) */
  qty: number;
  /** بخشی از موجودی که بهایش از سواپ معلوم است */
  basisQty: number;
  /** بخشی از موجودی بدون بهای معلوم (واریز، ایردراپ، پل) */
  unknownQty: number;
  cost: number;
  avgCost: number | null;
  /** پوزیشن باز: موجودی با ارزش ≥ DUST_USD */
  open: boolean;
  /** موجودی دارد ولی ارزشش خرد است */
  dust: boolean;
  firstTime: number;
  lastTime: number;
  /** ارزش فعلی (اگر قیمت لحظه‌ای داده شود) */
  value: number | null;
  unrealized: number | null;
}

export interface SpotBook {
  swaps: SpotSwap[];
  /** همه (باز و تسویه‌شده) */
  assets: SpotAsset[];
  /** پوزیشن‌های باز (غیر خرد) */
  open: SpotAsset[];
  /** کامل فروخته‌شده یا خرد */
  closed: SpotAsset[];
  sales: SpotSale[];
  totals: {
    swaps: number;
    volume: number;
    realized: number;
    unrealized: number | null;
    gas: number;
    swapCost: number;
    wins: number;
    losses: number;
    unknownProceeds: number;
    chains: string[];
    protocols: { name: string; n: number; volume: number }[];
  };
}

/**
 * price: کلید دارایی → قیمت لحظه‌ای دلاری (از موجودی کیف پول)
 * held:  کلید دارایی → موجودی واقعی فعلی (جمع کیف پول‌ها). بدون آن موجودی از دفتر سواپ است.
 */
export function spotBook(swaps: readonly SpotSwap[], price: ReadonlyMap<string, number> = new Map(), from = 0, held?: ReadonlyMap<string, number>, dustUsd = DUST_USD): SpotBook {
  const assets = new Map<string, SpotAsset>();
  const sales: SpotSale[] = [];
  const get = (l: SpotLeg, t: number) => {
    let a = assets.get(l.asset);
    if (!a) assets.set(l.asset, (a = { asset: l.asset, symbol: l.symbol, icon: l.icon, buys: 0, sells: 0, buysAll: 0, sellsAll: 0, boughtUsd: 0, soldUsd: 0, realized: 0, unknownProceeds: 0, qty: 0, basisQty: 0, unknownQty: 0, cost: 0, avgCost: null, open: false, dust: false, firstTime: t, lastTime: t, value: null, unrealized: null }));
    a.icon ??= l.icon;
    a.lastTime = t;
    return a;
  };
  const sorted = [...swaps].sort((a, b) => a.time - b.time);
  for (const s of sorted) {
    const soldTotal = sum(s.sold), boughtTotal = sum(s.bought);
    // فروش هر دارایی غیر استیبل (قبل از خرید همین سواپ)
    for (const l of s.sold) {
      if (l.stable) continue;
      const a = get(l, s.time);
      // ارزش نامعلوم → از ارزش طرف دیگر (سهم برابر)
      const proceeds = l.usd ?? (boughtTotal !== null ? boughtTotal / s.sold.length : null);
      if (proceeds === null) continue;
      const known = Math.min(a.qty, l.qty);
      const costOut = a.qty > 0 ? (a.cost * known) / a.qty : 0;
      const knownProceeds = (proceeds * known) / l.qty;
      const unknownQty = l.qty - known;
      a.sellsAll++;
      a.qty -= known;
      a.cost -= costOut;
      if (a.qty < 1e-12) { a.qty = 0; a.cost = 0; }
      if (s.time >= from) {
        a.sells++;
        a.soldUsd += proceeds;
        const pnl = knownProceeds - costOut;
        if (known > 0) a.realized += pnl;
        a.unknownProceeds += proceeds - knownProceeds;
        sales.push({ swapId: s.id, asset: l.asset, time: s.time, proceeds, pnl: unknownQty > l.qty * 0.02 ? null : pnl, unknownQty });
      }
    }
    for (const l of s.bought) {
      if (l.stable) continue;
      const a = get(l, s.time);
      const usd = l.usd ?? (soldTotal !== null ? soldTotal / s.bought.length : null);
      if (usd === null) continue;
      a.qty += l.qty;
      a.cost += usd;
      a.buysAll++;
      if (s.time >= from) { a.buys++; a.boughtUsd += usd; }
    }
  }
  let unrealized: number | null = price.size ? 0 : null;
  const gone = new Set<string>();
  for (const a of [...assets.values()]) {
    const ledgerQty = a.qty;
    const actual = held ? Math.max(0, held.get(a.asset) ?? 0) : ledgerQty;
    // بهای معلوم فقط برای min(دفتر، موجودی واقعی)؛ خروج غیر سواپی به میانگین بها کم می‌شود
    const basisQty = Math.min(ledgerQty, actual);
    a.cost = ledgerQty > 0 ? (a.cost * basisQty) / ledgerQty : 0;
    a.basisQty = basisQty;
    a.unknownQty = Math.max(0, actual - ledgerQty);
    a.qty = actual;
    a.avgCost = basisQty > 1e-12 ? a.cost / basisQty : null;
    const px = price.get(a.asset);
    if (a.qty > 0 && price.size) {
      // موجودی دارد ولی زریون الان قیمتش را ندارد → کامل حذف (نه نمایش، نه محاسبه)
      if (px === undefined) { assets.delete(a.asset); gone.add(a.asset); continue; }
      a.value = a.qty * px;
      a.dust = a.value < dustUsd;
      a.open = !a.dust;
      // سود باز فقط بخش با بهای معلوم؛ خرد در سود باز نمی‌آید
      a.unrealized = a.open && basisQty > 0 ? basisQty * px - a.cost : a.open ? null : 0;
      if (unrealized !== null && a.open && a.unrealized !== null) unrealized += a.unrealized;
    } else if (a.qty > 0 && !price.size) {
      a.open = true;
    }
  }
  if (gone.size) for (let i = sales.length - 1; i >= 0; i--) if (gone.has(sales[i].asset)) sales.splice(i, 1);
  // سواپی که همهٔ دارایی‌های غیر استیبلش حذف شده‌اند هم نمایش داده و شمرده نمی‌شود
  const inRange = sorted.filter((s) => s.time >= from && [...s.sold, ...s.bought].some((l) => !l.stable && !gone.has(l.asset)));
  const protos = new Map<string, { name: string; n: number; volume: number }>();
  for (const s of inRange) {
    const k = s.protocol || 'نامشخص';
    const p = protos.get(k) ?? { name: k, n: 0, volume: 0 };
    p.n++; p.volume += s.usd ?? 0;
    protos.set(k, p);
  }
  const list = [...assets.values()].filter((a) => a.buys || a.sells || a.open).sort((x, y) => Math.abs(y.realized) + (y.value ?? 0) - (Math.abs(x.realized) + (x.value ?? 0)));
  return {
    swaps: inRange.slice().reverse(),
    assets: list,
    open: list.filter((a) => a.open).sort((x, y) => (y.value ?? 0) - (x.value ?? 0)),
    closed: list.filter((a) => !a.open),
    sales,
    totals: {
      swaps: inRange.length,
      volume: inRange.reduce((s, x) => s + (x.usd ?? 0), 0),
      realized: list.reduce((s, a) => s + a.realized, 0),
      unrealized,
      gas: inRange.reduce((s, x) => s + (x.gas ?? 0), 0),
      swapCost: inRange.reduce((s, x) => s + (x.cost !== null && x.cost > 0 ? x.cost : 0), 0),
      wins: sales.filter((x) => x.pnl !== null && x.pnl > 0).length,
      losses: sales.filter((x) => x.pnl !== null && x.pnl <= 0).length,
      unknownProceeds: list.reduce((s, a) => s + a.unknownProceeds, 0),
      chains: [...new Set(inRange.map((s) => s.chain).filter(Boolean))],
      protocols: [...protos.values()].sort((a, b) => b.volume - a.volume)
    }
  };
}
