/**
 * حساب‌های پرپچوال با کلید API فقط‌خواندنی (آستر، کیوفکس، اوندو پرپس) — نرمال‌سازی پاسخ خام به یک مدل
 *
 *   اوندو:  ارزش = marginBalance · سود کل = totalPnL · بسته‌شده = realizedPnl
 *           دوره‌ای = totalPnL آخر − اول نمودار portfolio/summary/graph (24h/7d/30d)
 *   کیوفکس: ارزش = آخرین نقطهٔ account-equity · سود کل = realised + unrealised + net_funding
 *           دوره‌ای: نامعلوم تا معنای historic-pnl با پاسخ واقعی تأیید شود (حدس زده نمی‌شود)
 *   آستر:   ارزش = totalMarginBalance (فقط USDT) · دوره‌ای = Σ درآمد معاملاتی (سود تحقق‌یافته، فاندینگ،
 *           کارمزد و ریبیت‌ها؛ بدون انتقال‌ها) در بازه از /fapi/v3/income · سود کل: نامعلوم (تاریخچهٔ کامل لازم است)
 * مقدار نامعلوم null می‌ماند؛ هرگز صفر جایگزین نمی‌شود. Pure — مشترک سرور (api/_keyedPerps.ts) و تست.
 */

export type KeyedVenue = 'aster' | 'qfex' | 'ondo';

export interface KeyedPosition {
  symbol: string;
  side: 'long' | 'short';
  size: number | null;
  entry: number | null;
  mark: number | null;
  pnl: number | null;
  liquidation: number | null;
}

export interface KeyedSnapshot {
  venue: KeyedVenue;
  equity: number | null;
  unrealizedPnl: number | null;
  allTimePnl: number | null;
  realizedPnl: number | null;
  periodPnl: { day: number | null; week: number | null; month: number | null };
  positions: KeyedPosition[];
  fetchedAt: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);
const sumAll = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, b) => a + (b as number), 0));
const NO_PERIODS = { day: null, week: null, month: null };
const DAY = 86_400_000;

/* ---------------- اوندو ---------------- */

export function ondoSnapshot(input: { balance: unknown; positions: unknown; graphs: Partial<Record<'24h' | '7d' | '30d', unknown>>; now?: number }): KeyedSnapshot {
  const b = ((input.balance as Raw)?.result ?? {}) as Raw;
  const positions: KeyedPosition[] = rows((input.positions as Raw)?.result)
    .filter((p) => p.direction === 'long' || p.direction === 'short')
    .map((p) => {
      const qty = num(p.netQuantity);
      const liq = num(p.liquidationPrice);
      return {
        symbol: String(p.market ?? '').replace(/-USD\.P$/, ''),
        side: p.direction as 'long' | 'short',
        size: qty === null ? null : Math.abs(qty),
        entry: num(p.averageEntryPrice),
        mark: num(p.markPrice),
        pnl: num(p.unrealizedPnl),
        liquidation: liq && liq > 0 ? liq : null
      };
    });
  const change = (g: unknown) => {
    const pts = rows((g as Raw)?.result).map((p) => num(p.totalPnL));
    return pts.length >= 1 && pts.every((x) => x !== null) ? (pts[pts.length - 1] as number) - (pts[0] as number) : null;
  };
  return {
    venue: 'ondo',
    equity: num(b.marginBalance),
    unrealizedPnl: num(b.unrealizedPnl),
    allTimePnl: num(b.totalPnL),
    realizedPnl: num(b.totalPnL) !== null && num(b.unrealizedPnl) !== null ? num(b.totalPnL)! - num(b.unrealizedPnl)! : null,
    periodPnl: { day: change(input.graphs['24h']), week: change(input.graphs['7d']), month: change(input.graphs['30d']) },
    positions,
    fetchedAt: input.now ?? Date.now()
  };
}

/* ---------------- کیوفکس ---------------- */

export function qfexSnapshot(input: { positions: unknown; equity: unknown; now?: number }): KeyedSnapshot {
  const body = (input.positions ?? {}) as Raw;
  const bal = (body.balance ?? {}) as Raw;
  const positions: KeyedPosition[] = rows(body.positions)
    .filter((p) => (num(p.position) ?? 0) !== 0)
    .map((p) => {
      const q = num(p.position)!;
      return { symbol: String(p.symbol ?? '').replace(/-USD$/, ''), side: q > 0 ? 'long' : 'short', size: Math.abs(q), entry: num(p.average_price), mark: null, pnl: num(p.unrealised_pnl), liquidation: null };
    });
  const eq = rows((input.equity as Raw)?.data);
  const unreal = num(bal.unrealised_pnl);
  const realised = num(bal.realised_pnl);
  const funding = num(bal.net_funding);
  const allTime = sumAll([realised, unreal, funding]);
  return {
    venue: 'qfex',
    equity: eq.length ? num(eq[eq.length - 1].value) : null,
    unrealizedPnl: unreal,
    allTimePnl: allTime,
    realizedPnl: allTime !== null && unreal !== null ? allTime - unreal : null,
    periodPnl: NO_PERIODS,
    positions,
    fetchedAt: input.now ?? Date.now()
  };
}

/* ---------------- آستر ---------------- */

/** درآمدهایی که سود/زیان معاملاتی‌اند (انتقال و تبدیل دارایی نیستند) */
const ASTER_PNL_INCOME = new Set(['REALIZED_PNL', 'FUNDING_FEE', 'COMMISSION', 'INSURANCE_CLEAR', 'COMMISSION_REBATE', 'MARKET_MAKER_REBATE', 'API_REBATE', 'REFERRAL_KICKBACK', 'MARKET_MERCHANT_RETURN_REWARD']);
export const ASTER_INCOME_LIMIT = 1000;

export function asterSnapshot(input: { account: unknown; positions: unknown; incomes: unknown; now?: number }): KeyedSnapshot {
  const now = input.now ?? Date.now();
  const acc = (input.account ?? {}) as Raw;
  const positions: KeyedPosition[] = rows(input.positions)
    .filter((p) => (num(p.positionAmt) ?? 0) !== 0)
    .map((p) => {
      const amt = num(p.positionAmt)!;
      const side = p.positionSide === 'SHORT' || (p.positionSide !== 'LONG' && amt < 0) ? 'short' : 'long';
      const liq = num(p.liquidationPrice);
      return { symbol: String(p.symbol ?? '').replace(/USDT$|USD1$|USDF$/, ''), side, size: Math.abs(amt), entry: num(p.entryPrice), mark: num(p.markPrice), pnl: num(p.unRealizedProfit), liquidation: liq && liq > 0 ? liq : null };
    });
  const incomes = rows(input.incomes);
  // سقف پاسخ پر شده → ابتدای ۳۰ روز ممکن است جا افتاده باشد؛ بازه‌ای که پوشش کامل ندارد نامعلوم است
  const oldest = incomes.length ? Math.min(...incomes.map((i) => num(i.time) ?? now)) : now;
  const truncated = incomes.length >= ASTER_INCOME_LIMIT;
  const windowPnl = (ms: number) => {
    if (truncated && oldest > now - ms) return null;
    return incomes.filter((i) => ASTER_PNL_INCOME.has(String(i.incomeType)) && (num(i.time) ?? 0) >= now - ms).reduce((a, i) => a + (num(i.income) ?? 0), 0);
  };
  return {
    venue: 'aster',
    equity: num(acc.totalMarginBalance),
    unrealizedPnl: num(acc.totalUnrealizedProfit),
    allTimePnl: null,
    realizedPnl: null,
    periodPnl: { day: windowPnl(DAY), week: windowPnl(7 * DAY), month: windowPnl(30 * DAY) },
    positions,
    fetchedAt: now
  };
}
