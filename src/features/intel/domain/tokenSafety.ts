/**
 * امنیت توکن — ترکیب GoPlus (EVM و سولانا)، RugCheck (سولانا) و DexScreener (نقدینگی و بازار)
 *
 *  - هر پرچم «بحرانی» (هانی‌پات، فروش‌ناپذیر، مالیات فروش بالای ۵۰٪، فریز، تغییر موجودی)
 *    حکم را مستقیم «خطر» می‌کند؛ میانگین‌گیری ندارد.
 *  - اختیارات وابسته به مالک (مینت، توقف، لیست سیاه) وقتی مالکیت واقعاً رها شده فقط «اطلاع» است.
 *  - حکم مثبت هرگز «امن» نیست: «خطر شناخته‌شده‌ای پیدا نشد».
 * Pure — ورودی پاسخ خام منابع، خروجی حکم قابل نمایش.
 */
import { rugRiskFa } from './rugRisks.js';

export type Chain = 'solana' | 'ethereum' | 'base' | 'bsc' | 'arbitrum';
export const EVM_CHAIN_ID: Record<Exclude<Chain, 'solana'>, string> = { ethereum: '1', base: '8453', bsc: '56', arbitrum: '42161' };
export const CHAIN_FA: Record<Chain, string> = { solana: 'سولانا', ethereum: 'اتریوم', base: 'بیس', bsc: 'بی‌ان‌بی', arbitrum: 'آربیتروم' };

export type FlagLevel = 'critical' | 'warn' | 'info' | 'ok';
export interface SafetyFlag {
  level: FlagLevel;
  label: string;
  detail?: string;
}

export interface MarketInfo {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  fdv: number | null;
  marketCap: number | null;
  change24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  createdAt: number | null;
  dex: string | null;
  url: string | null;
}

export interface TokenSafety {
  chain: Chain;
  address: string;
  name: string | null;
  symbol: string | null;
  verdict: 'danger' | 'caution' | 'clear' | 'unknown';
  score: number;
  flags: SafetyFlag[];
  holderCount: number | null;
  top10Pct: number | null;
  lpLockedPct: number | null;
  market: MarketInfo | null;
  sources: string[];
  checkedAt: number;
}

type Raw = Record<string, unknown>;
const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};
const on = (v: unknown) => v === '1' || v === 1 || v === true;
const ZERO = /^0x0{40}$|^0x0{36}dead$/i;

export function isTokenAddress(chain: Chain, address: string): boolean {
  return chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) : /^0x[0-9a-fA-F]{40}$/.test(address);
}

function evmFlags(g: Raw, flags: SafetyFlag[]): { top10: number | null; lpLocked: number | null; holders: number | null } {
  const owner = String(g.owner_address ?? '');
  const renounced = (!owner || ZERO.test(owner)) && !on(g.hidden_owner) && !on(g.can_take_back_ownership);
  const ownerPower = (label: string, detail: string) =>
    flags.push(renounced ? { level: 'info', label, detail: 'مالکیت رها شده؛ این اختیار عملاً غیرفعال است.' } : { level: 'warn', label, detail });

  if (on(g.is_honeypot)) flags.push({ level: 'critical', label: 'هانی‌پات', detail: 'خرید ممکن است اما فروش نه.' });
  if (on(g.cannot_sell_all)) flags.push({ level: 'critical', label: 'فروش کامل ممکن نیست', detail: 'نمی‌توانید همهٔ موجودی را بفروشید.' });
  if (on(g.owner_change_balance)) flags.push({ level: 'critical', label: 'مالک می‌تواند موجودی را تغییر دهد' });
  if (on(g.selfdestruct)) flags.push({ level: 'critical', label: 'قرارداد قابل نابودی است' });
  const buyTax = n(g.buy_tax), sellTax = n(g.sell_tax);
  for (const [label, tax] of [['مالیات فروش', sellTax], ['مالیات خرید', buyTax]] as const) {
    if (tax === null) continue;
    if (tax >= 0.5) flags.push({ level: 'critical', label: `${label} ${Math.round(tax * 100)}٪` });
    else if (tax >= 0.1) flags.push({ level: 'warn', label: `${label} ${Math.round(tax * 100)}٪` });
  }
  if (g.is_open_source !== undefined && !on(g.is_open_source)) flags.push({ level: 'warn', label: 'کد قرارداد منتشر نشده' });
  if (on(g.is_proxy)) flags.push({ level: 'warn', label: 'قرارداد قابل ارتقا (Proxy)', detail: 'منطق قرارداد بعداً قابل تغییر است.' });
  if (on(g.hidden_owner)) flags.push({ level: 'warn', label: 'مالک پنهان' });
  if (on(g.can_take_back_ownership)) flags.push({ level: 'warn', label: 'مالکیت قابل بازپس‌گیری' });
  if (on(g.is_mintable)) ownerPower('قابل مینت', 'عرضه می‌تواند افزایش یابد.');
  if (on(g.transfer_pausable)) ownerPower('قابل توقف معاملات', 'انتقال توکن می‌تواند متوقف شود.');
  if (on(g.is_blacklisted)) ownerPower('لیست سیاه', 'آدرس‌ها می‌توانند از معامله منع شوند.');
  if (on(g.slippage_modifiable)) ownerPower('مالیات قابل تغییر', 'مالیات خرید/فروش می‌تواند بالا برود.');
  if (renounced) flags.push({ level: 'ok', label: 'مالکیت رها شده' });

  const holders = Array.isArray(g.holders) ? (g.holders as Raw[]) : [];
  const top10 = holders.length ? holders.slice(0, 10).reduce((a, h) => a + (n(h.percent) ?? 0), 0) * 100 : null;
  const lp = Array.isArray(g.lp_holders) ? (g.lp_holders as Raw[]) : [];
  const lpLocked = lp.length ? lp.filter((h) => on(h.is_locked) || ZERO.test(String(h.address ?? ''))).reduce((a, h) => a + (n(h.percent) ?? 0), 0) * 100 : null;
  return { top10, lpLocked, holders: n(g.holder_count) };
}

function solFlags(g: Raw, flags: SafetyFlag[]): { top10: number | null; holders: number | null } {
  const status = (k: string) => on((g[k] as Raw | undefined)?.status);
  if (status('freezable')) flags.push({ level: 'critical', label: 'قابل فریز', detail: 'صادرکننده می‌تواند حساب شما را فریز کند و فروش ممکن نشود.' });
  if (status('balance_mutable_authority')) flags.push({ level: 'critical', label: 'موجودی قابل تغییر توسط صادرکننده' });
  if (on(g.non_transferable)) flags.push({ level: 'critical', label: 'غیرقابل انتقال' });
  if (status('mintable')) flags.push({ level: 'warn', label: 'قابل مینت', detail: 'عرضه می‌تواند افزایش یابد.' });
  else flags.push({ level: 'ok', label: 'مینت بسته است' });
  if (status('closable')) flags.push({ level: 'warn', label: 'حساب توکن قابل بستن' });
  const fee = g.transfer_fee as Raw | undefined;
  if (fee && Object.keys(fee).length && (n((fee.current_fee_rate as Raw | undefined)?.fee_rate) ?? n(fee.fee_rate) ?? 0) > 0) flags.push({ level: 'warn', label: 'کارمزد انتقال' });
  if (Array.isArray(g.transfer_hook) && g.transfer_hook.length) flags.push({ level: 'warn', label: 'هوک انتقال', detail: 'کد دلخواه هنگام هر انتقال اجرا می‌شود.' });
  if (status('metadata_mutable')) flags.push({ level: 'info', label: 'متادیتا قابل تغییر' });
  const holders = Array.isArray(g.holders) ? (g.holders as Raw[]) : [];
  const top10 = holders.length ? holders.slice(0, 10).reduce((a, h) => a + (n(h.percent) ?? 0), 0) * 100 : null;
  return { top10, holders: n(g.holder_count) };
}

/** بهترین جفت DexScreener (بیشترین نقدینگی) → اطلاعات بازار */
export function marketFrom(pairs: unknown): MarketInfo | null {
  const list = (Array.isArray(pairs) ? pairs : []) as Raw[];
  const best = [...list].sort((a, b) => (n((b.liquidity as Raw)?.usd) ?? 0) - (n((a.liquidity as Raw)?.usd) ?? 0))[0];
  if (!best) return null;
  const tx = ((best.txns as Raw)?.h24 ?? {}) as Raw;
  return {
    priceUsd: n(best.priceUsd),
    liquidityUsd: n((best.liquidity as Raw)?.usd),
    volume24h: n((best.volume as Raw)?.h24),
    fdv: n(best.fdv),
    marketCap: n(best.marketCap),
    change24h: n((best.priceChange as Raw)?.h24),
    buys24h: n(tx.buys),
    sells24h: n(tx.sells),
    createdAt: n(best.pairCreatedAt),
    dex: typeof best.dexId === 'string' ? best.dexId : null,
    url: typeof best.url === 'string' && best.url.startsWith('https://dexscreener.com/') ? best.url : null
  };
}

export function assessToken(input: {
  chain: Chain;
  address: string;
  goplus?: Raw | null;
  rug?: Raw | null;
  pairs?: unknown;
  now?: number;
}): TokenSafety {
  const { chain, address, goplus, rug } = input;
  const now = input.now ?? Date.now();
  const flags: SafetyFlag[] = [];
  const sources: string[] = [];
  let top10: number | null = null;
  let holders: number | null = null;
  let lpLocked: number | null = null;

  if (goplus && Object.keys(goplus).length) {
    sources.push('GoPlus');
    if (chain === 'solana') ({ top10, holders } = solFlags(goplus, flags));
    else ({ top10, lpLocked, holders } = evmFlags(goplus, flags));
  }
  if (rug && typeof rug === 'object') {
    sources.push('RugCheck');
    for (const r of (Array.isArray(rug.risks) ? rug.risks : []) as Raw[]) {
      const label = rugRiskFa(String(r.name ?? '')).slice(0, 80);
      if (!label || flags.some((f) => f.label === label)) continue;
      flags.push({ level: r.level === 'danger' ? 'critical' : 'warn', label, detail: typeof r.description === 'string' ? r.description.slice(0, 160) : undefined });
    }
    lpLocked = n(rug.lpLockedPct) ?? lpLocked;
  }
  const market = marketFrom(input.pairs);
  if (market) {
    sources.push('DexScreener');
    const liq = market.liquidityUsd;
    if (liq !== null && liq < 10_000) flags.push({ level: 'critical', label: 'نقدینگی خیلی کم', detail: 'کمتر از ۱۰ هزار دلار؛ فروش حتی مقدار کم قیمت را می‌شکند.' });
    else if (liq !== null && liq < 50_000) flags.push({ level: 'warn', label: 'نقدینگی کم' });
    if (market.createdAt && now - market.createdAt < 86_400_000) flags.push({ level: 'warn', label: 'کمتر از ۲۴ ساعت عمر' });
  }
  if (top10 !== null && top10 >= 50) flags.push({ level: 'warn', label: `۱۰ هولدر برتر ${Math.round(top10)}٪ عرضه`, detail: 'تمرکز بالا؛ چند کیف پول می‌توانند قیمت را بشکنند.' });
  if (lpLocked !== null && lpLocked < 50 && chain === 'solana') flags.push({ level: 'warn', label: `فقط ${Math.round(lpLocked)}٪ نقدینگی قفل است` });

  const critical = flags.filter((f) => f.level === 'critical').length;
  const warns = flags.filter((f) => f.level === 'warn').length;
  const secured = sources.includes('GoPlus') || sources.includes('RugCheck');
  const score = critical ? Math.min(15, 100 - warns * 10) : Math.max(0, 100 - warns * 12);
  const verdict: TokenSafety['verdict'] = !secured ? 'unknown' : critical ? 'danger' : warns ? 'caution' : 'clear';
  const order: Record<FlagLevel, number> = { critical: 0, warn: 1, info: 2, ok: 3 };
  const name = typeof goplus?.token_name === 'string' ? goplus.token_name : typeof (goplus?.metadata as Raw | undefined)?.name === 'string' ? String((goplus!.metadata as Raw).name) : null;
  const symbol = typeof goplus?.token_symbol === 'string' ? goplus.token_symbol : typeof (goplus?.metadata as Raw | undefined)?.symbol === 'string' ? String((goplus!.metadata as Raw).symbol) : null;
  return {
    chain, address, name, symbol, verdict, score,
    flags: flags.sort((a, b) => order[a.level] - order[b.level]),
    holderCount: holders, top10Pct: top10, lpLockedPct: lpLocked, market, sources, checkedAt: now
  };
}

/** حکم سریع فهرست از خلاصهٔ RugCheck (یک درخواست کوچک برای هر توکن) */
export function quickVerdict(rug: Raw | null | undefined): { verdict: TokenSafety['verdict']; dangers: number; warns: number } {
  if (!rug || typeof rug !== 'object') return { verdict: 'unknown', dangers: 0, warns: 0 };
  const risks = (Array.isArray(rug.risks) ? rug.risks : []) as Raw[];
  const dangers = risks.filter((r) => r.level === 'danger').length;
  const warns = risks.filter((r) => r.level !== 'danger').length;
  return { verdict: dangers ? 'danger' : warns ? 'caution' : 'clear', dangers, warns };
}

/**
 * حکم فهرست میم‌کوین: ریسک‌های RugCheck + علامت‌های بازار که در فهرست داریم
 * (توکن زیر ۲۴ ساعت = هشدار، نقدینگی زیر ۵۰ هزار = هشدار، زیر ۱۰ هزار = خطر).
 * بدون RugCheck حکم سبز داده نمی‌شود (حداکثر «نامشخص»).
 */
export function listVerdict(rug: Raw | null | undefined, market: { liquidityUsd: number | null; createdAt: number | null }, now = Date.now()) {
  const q = quickVerdict(rug);
  let { dangers, warns } = q;
  if (market.liquidityUsd !== null && market.liquidityUsd < 10_000) dangers++;
  else if (market.liquidityUsd !== null && market.liquidityUsd < 50_000) warns++;
  if (market.createdAt && now - market.createdAt < 86_400_000) warns++;
  const verdict: TokenSafety['verdict'] = dangers ? 'danger' : q.verdict === 'unknown' ? 'unknown' : warns ? 'caution' : 'clear';
  return { verdict, dangers, warns };
}
