/**
 * انتخاب و ساخت استراتژی آپشن از زنجیرهٔ واقعی Derive — جدول قواعد دستیار آپشن دارینو
 *
 *   صعودی + IV ارزان   Long Call · Bull Call Spread       صعودی + IV گران   Bull Put Spread · Cash-Secured Put
 *   نزولی + IV ارزان   Long Put · Bear Put Spread         نزولی + IV گران   Bear Call Spread
 *   خنثی + IV گران     Iron Condor · Iron Butterfly · (Short Strangle فقط سرمایهٔ بالا و جسور، ⚠️)
 *   نامطمئن/حرکت شدید  Long Straddle / Strangle (IV ارزان) · Iron Condor (IV گران)
 *   دارندهٔ دارایی     Covered Call (درآمد) · Protective Put / Collar (محافظت)
 *
 * Strikeها با Delta هدف از همان زنجیره انتخاب می‌شوند؛ قیمت ورود Mid (یا Mark اگر یک طرف دفتر خالی است).
 * تعداد = بیشترین مضرب گام Derive که حداکثر ضرر از سقف ریسک بیشتر نشود.
 */
import { positionStats, sizeByRisk, valueAt, payoffAt, type IvRegime, type Leg, type OptionLeg, type OptionType, type PositionStats, type RiskProfile } from './options';

export interface ChainOption {
  name: string;
  strike: number;
  type: OptionType;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  oi: number | null;
  volume: number | null;
}

export type View = 'bull' | 'bear' | 'neutral' | 'unsure';

export type StrategyId =
  | 'long_call'
  | 'bull_call_spread'
  | 'bull_put_spread'
  | 'cash_secured_put'
  | 'long_put'
  | 'bear_put_spread'
  | 'bear_call_spread'
  | 'iron_condor'
  | 'iron_butterfly'
  | 'short_strangle'
  | 'long_straddle'
  | 'long_strangle'
  | 'covered_call'
  | 'protective_put'
  | 'collar';

export const STRATEGY_FA: Record<StrategyId, string> = {
  long_call: 'خرید Call (Long Call)',
  bull_call_spread: 'اسپرد صعودی Call (Bull Call Spread)',
  bull_put_spread: 'اسپرد صعودی Put (Bull Put Spread)',
  cash_secured_put: 'فروش Put با پوشش نقدی (Cash-Secured Put)',
  long_put: 'خرید Put (Long Put)',
  bear_put_spread: 'اسپرد نزولی Put (Bear Put Spread)',
  bear_call_spread: 'اسپرد نزولی Call (Bear Call Spread)',
  iron_condor: 'آیرون کاندور (Iron Condor)',
  iron_butterfly: 'آیرون باترفلای (Iron Butterfly)',
  short_strangle: 'فروش استرنگل (Short Strangle)',
  long_straddle: 'خرید استرادل (Long Straddle)',
  long_strangle: 'خرید استرنگل (Long Strangle)',
  covered_call: 'Call پوشش‌دار (Covered Call)',
  protective_put: 'Put محافظ (Protective Put)',
  collar: 'کالر (Collar)'
};

/** فروشندهٔ پرمیوم (Theta مثبت) یا خریدار */
export const PREMIUM_SELLER: ReadonlySet<StrategyId> = new Set(['bull_put_spread', 'cash_secured_put', 'bear_call_spread', 'iron_condor', 'iron_butterfly', 'short_strangle', 'covered_call']);

/** انتخاب طبق جدول: اولی اصلی، بقیه جایگزین (حداکثر ۳) */
export function chooseStrategies(view: View, regime: IvRegime | null, hasHoldings: boolean, capitalUsd: number, risk: RiskProfile): StrategyId[] {
  const rich = regime === 'rich';
  const cheap = regime === 'cheap';
  const large = capitalUsd > 10_000;
  const small = capitalUsd < 1_000;
  let list: StrategyId[];
  if (view === 'bull') list = rich ? ['bull_put_spread', 'cash_secured_put', 'bull_call_spread'] : ['bull_call_spread', 'long_call', 'bull_put_spread'];
  else if (view === 'bear') list = rich ? ['bear_call_spread', 'bear_put_spread', 'long_put'] : ['bear_put_spread', 'long_put', 'bear_call_spread'];
  else if (view === 'neutral') list = rich || !cheap ? ['iron_condor', 'iron_butterfly', ...(large && risk === 'aggressive' ? (['short_strangle'] as StrategyId[]) : [])] : ['iron_condor', 'iron_butterfly'];
  else list = cheap ? ['long_strangle', 'long_straddle', 'iron_condor'] : ['iron_condor', 'long_strangle', 'long_straddle'];
  if (hasHoldings) list = view === 'bear' ? ['protective_put', 'collar', ...list] : view === 'neutral' ? ['covered_call', 'collar', ...list] : [...list.slice(0, 2), 'covered_call'];
  // سرمایهٔ کم: فقط ریسک‌محدود
  if (small) list = list.filter((s) => s !== 'cash_secured_put' && s !== 'short_strangle');
  return [...new Set(list)].slice(0, 3);
}

/* ---------------- ساخت پوزیشن ---------------- */

const mid = (o: ChainOption): number | null => (o.bid !== null && o.ask !== null ? (o.bid + o.ask) / 2 : o.mark);

/** نزدیک‌ترین گزینه به Delta هدف (قدر مطلق) که قیمت دارد */
export function pickByDelta(chain: readonly ChainOption[], type: OptionType, target: number): ChainOption | null {
  let best: ChainOption | null = null;
  for (const o of chain) {
    if (o.type !== type || o.delta === null || mid(o) === null || !(mid(o)! > 0)) continue;
    if (!best || Math.abs(Math.abs(o.delta) - target) < Math.abs(Math.abs(best.delta!) - target)) best = o;
  }
  return best;
}

/** Strike نزدیک قیمت Forward برای هر نوع */
export function pickAtm(chain: readonly ChainOption[], type: OptionType, forward: number): ChainOption | null {
  let best: ChainOption | null = null;
  for (const o of chain) if (o.type === type && mid(o) !== null && (!best || Math.abs(o.strike - forward) < Math.abs(best.strike - forward))) best = o;
  return best;
}

const legOf = (o: ChainOption, side: 'buy' | 'sell', qty = 1): OptionLeg => ({
  kind: 'option',
  type: o.type,
  side,
  strike: o.strike,
  qty,
  premium: mid(o)!,
  iv: o.iv,
  name: o.name,
  delta: o.delta,
  gamma: o.gamma,
  theta: o.theta,
  vega: o.vega
});

/** پاها برای ۱ واحد (Covered/Protective/Collar با واحد دارایی) — null = Strike مناسب در زنجیره نیست */
export function buildLegs(id: StrategyId, chain: readonly ChainOption[], forward: number, spot: number): Leg[] | null {
  const c = (d: number) => pickByDelta(chain, 'C', d);
  const p = (d: number) => pickByDelta(chain, 'P', d);
  const pair = (a: ChainOption | null, b: ChainOption | null, needDistinct = true) => (a && b && (!needDistinct || a.strike !== b.strike) ? [a, b] : null);
  const spotLeg: Leg = { kind: 'spot', side: 'buy', qty: 1, entry: spot };
  switch (id) {
    case 'long_call': {
      const o = c(0.4);
      return o ? [legOf(o, 'buy')] : null;
    }
    case 'long_put': {
      const o = p(0.4);
      return o ? [legOf(o, 'buy')] : null;
    }
    case 'bull_call_spread': {
      const x = pair(c(0.4), c(0.2));
      return x ? [legOf(x[0], 'buy'), legOf(x[1], 'sell')] : null;
    }
    case 'bear_put_spread': {
      const x = pair(p(0.4), p(0.2));
      return x ? [legOf(x[0], 'buy'), legOf(x[1], 'sell')] : null;
    }
    case 'bull_put_spread': {
      const x = pair(p(0.25), p(0.12));
      return x ? [legOf(x[0], 'sell'), legOf(x[1], 'buy')] : null;
    }
    case 'bear_call_spread': {
      const x = pair(c(0.25), c(0.12));
      return x ? [legOf(x[0], 'sell'), legOf(x[1], 'buy')] : null;
    }
    case 'cash_secured_put': {
      const o = p(0.2);
      return o ? [legOf(o, 'sell')] : null;
    }
    case 'iron_condor': {
      const puts = pair(p(0.2), p(0.1));
      const calls = pair(c(0.2), c(0.1));
      return puts && calls ? [legOf(puts[0], 'sell'), legOf(puts[1], 'buy'), legOf(calls[0], 'sell'), legOf(calls[1], 'buy')] : null;
    }
    case 'iron_butterfly': {
      const ap = pickAtm(chain, 'P', forward);
      const ac = pickAtm(chain, 'C', forward);
      const wp = p(0.12);
      const wc = c(0.12);
      return ap && ac && wp && wc && wp.strike < ap.strike && wc.strike > ac.strike ? [legOf(ap, 'sell'), legOf(ac, 'sell'), legOf(wp, 'buy'), legOf(wc, 'buy')] : null;
    }
    case 'short_strangle': {
      const x = pair(p(0.16), c(0.16));
      return x ? [legOf(x[0], 'sell'), legOf(x[1], 'sell')] : null;
    }
    case 'long_straddle': {
      const ap = pickAtm(chain, 'P', forward);
      const ac = ap ? chain.find((o) => o.type === 'C' && o.strike === ap.strike && mid(o) !== null) ?? null : null;
      return ap && ac ? [legOf(ac, 'buy'), legOf(ap, 'buy')] : null;
    }
    case 'long_strangle': {
      const x = pair(p(0.25), c(0.25));
      return x ? [legOf(x[1], 'buy'), legOf(x[0], 'buy')] : null;
    }
    case 'covered_call': {
      const o = c(0.2);
      return o ? [spotLeg, legOf(o, 'sell')] : null;
    }
    case 'protective_put': {
      const o = p(0.25);
      return o ? [spotLeg, legOf(o, 'buy')] : null;
    }
    case 'collar': {
      const x = pair(p(0.25), c(0.2));
      return x ? [spotLeg, legOf(x[0], 'buy'), legOf(x[1], 'sell')] : null;
    }
  }
}

const scale = (legs: Leg[], q: number): Leg[] => legs.map((l) => ({ ...l, qty: l.qty * q }));
const optionNotional = (legs: Leg[]) => legs.reduce((s, l) => (l.kind === 'option' && l.side === 'sell' ? s + l.strike * l.qty : s), 0);

export interface MarketInputs {
  forward: number;
  spot: number;
  /** سال تا سررسید */
  T: number;
  /** IV در پول برای احتمال سود */
  atmIv: number | null;
  minAmount: number;
  amountStep: number;
  /** کارمزد Derive: base_fee + rate × spot، با سقف rate_cap × قیمت آپشن */
  takerFeeRate: number | null;
  baseFee: number | null;
  feeCapRate: number | null;
}

export interface BuiltStrategy {
  id: StrategyId;
  legs: Leg[];
  qty: number;
  /** حداقل اندازه از سقف ریسک بیشتر بود؛ اندازهٔ حداقلی نشان داده می‌شود */
  belowMinimum: boolean;
  stats: PositionStats;
  /** وثیقهٔ تقریبی: ریسک‌محدود = حداکثر ضرر؛ CSP = Strike × مقدار − پرمیوم؛ پوشش‌دار = خود دارایی */
  collateral: number | null;
  /** کارمزد تقریبی باز کردن همهٔ پاها */
  fees: number | null;
  unlimitedLoss: boolean;
  /** بیشترین اختلاف Bid/Ask پاها نسبت به Mid (٪) */
  worstSpreadPct: number | null;
  /** کمترین Open Interest پاها */
  minOi: number | null;
}

export function feePerContract(m: MarketInputs, optionPrice: number): number | null {
  if (m.takerFeeRate === null || m.baseFee === null) return null;
  const raw = m.baseFee + m.takerFeeRate * m.spot;
  return m.feeCapRate === null ? raw : Math.min(raw, Math.max(0, m.feeCapRate * optionPrice) + m.baseFee);
}

export function buildStrategy(
  id: StrategyId,
  chain: readonly ChainOption[],
  m: MarketInputs,
  riskCapUsd: number,
  holdingsQty: number
): BuiltStrategy | null {
  const unit = buildLegs(id, chain, m.forward, m.spot);
  if (!unit) return null;
  const covered = id === 'covered_call' || id === 'protective_put' || id === 'collar';
  const unitStats = positionStats(unit, m.forward, m.T, m.atmIv);
  let qty: number | null;
  if (covered) {
    const st = m.amountStep > 0 ? m.amountStep : m.minAmount;
    qty = Math.floor(holdingsQty / st + 1e-9) * st;
    qty = qty >= m.minAmount ? Math.round(qty * 1e8) / 1e8 : null;
  } else {
    // ریسک هر واحد: حداکثر ضرر؛ نامحدود → ضرر در حرکت ۳ برابر IV تا سررسید (فقط برای اندازه، اعلام‌شده)
    const unlimitedProxy = m.atmIv !== null ? Math.max(0, -payoffAt(unit, m.forward * Math.exp(3 * m.atmIv * Math.sqrt(m.T))), -payoffAt(unit, m.forward * Math.exp(-3 * m.atmIv * Math.sqrt(m.T)))) : null;
    const loss = id === 'cash_secured_put' ? unitStats.maxLoss : (unitStats.maxLoss ?? unlimitedProxy);
    qty = loss === null ? null : sizeByRisk(riskCapUsd, loss, m.minAmount, m.amountStep);
  }
  const belowMinimum = qty === null;
  const q = qty ?? m.minAmount;
  const legs = scale(unit, q);
  const stats = positionStats(legs, m.forward, m.T, m.atmIv);
  const opts = legs.filter((l): l is OptionLeg => l.kind === 'option');
  const fees = opts.reduce<number | null>((s, l) => {
    const f = feePerContract(m, l.premium);
    return s === null || f === null ? null : s + f * l.qty;
  }, 0);
  const spreads = opts.map((l) => {
    const o = chain.find((x) => x.name === l.name);
    return o && o.bid !== null && o.ask !== null && l.premium > 0 ? ((o.ask - o.bid) / l.premium) * 100 : null;
  });
  const ois = opts.map((l) => chain.find((x) => x.name === l.name)?.oi ?? null);
  const collateral = covered
    ? m.spot * q + (stats.netPremium < 0 ? -stats.netPremium : 0)
    : id === 'cash_secured_put'
      ? optionNotional(legs) - stats.netPremium
      : stats.maxLoss;
  return {
    id,
    legs,
    qty: q,
    belowMinimum,
    stats,
    collateral,
    fees,
    unlimitedLoss: stats.maxLoss === null,
    worstSpreadPct: spreads.some((s) => s === null) ? null : Math.max(...(spreads as number[])),
    minOi: ois.some((x) => x === null) ? null : Math.min(...(ois as number[]))
  };
}

/* ---------------- سناریوها و خروج ---------------- */

export interface ScenarioRow {
  movePct: number;
  price: number;
  /** سود/زیان در سررسید */
  atExpiry: number;
  /** سود/زیان در نیمهٔ راه (IV ثابت) */
  midway: number;
}

export function scenarios(b: BuiltStrategy, spot: number, T: number, moves: readonly number[] = [20, 5, 0, -5, -20]): ScenarioRow[] {
  return moves.map((movePct) => {
    const price = spot * (1 + movePct / 100);
    return { movePct, price, atExpiry: payoffAt(b.legs, price), midway: valueAt(b.legs, price, T / 2) };
  });
}

/** اثر IV و زمان روی ارزش پوزیشن، قیمت ثابت */
export function sensitivities(b: BuiltStrategy, spot: number, T: number): { ivUp: number; ivDown: number; week: number } {
  const now = valueAt(b.legs, spot, T);
  return {
    ivUp: valueAt(b.legs, spot, T, 0.1) - now,
    ivDown: valueAt(b.legs, spot, T, -0.1) - now,
    week: valueAt(b.legs, spot, Math.max(0, T - 7 / 365)) - now
  };
}

export interface ExitPlan {
  takeProfitUsd: number | null;
  stopLossUsd: number | null;
  /** سطح‌های قیمتی مشخص (Strike فروخته‌شده، Breakeven) */
  priceLevels: { label: string; price: number }[];
  closeOrRollDaysLeft: number;
}

export function exitPlan(b: BuiltStrategy, daysToExpiry: number): ExitPlan {
  const seller = PREMIUM_SELLER.has(b.id);
  const credit = b.stats.netPremium;
  const debit = -credit;
  const shorts = b.legs.filter((l): l is OptionLeg => l.kind === 'option' && l.side === 'sell');
  const levels = [
    ...shorts.map((l) => ({ label: `قیمت توافقی ${l.type === 'C' ? 'اختیار خرید (Call)' : 'اختیار فروش (Put)'} که فروخته‌اید`, price: l.strike })),
    ...b.stats.breakevens.map((p) => ({ label: 'نقطهٔ سربه‌سر (Breakeven)', price: p }))
  ].sort((x, y) => x.price - y.price);
  return {
    // فروش پرمیوم: ۵۰٪ حداکثر سود؛ خرید آپشن: ۱۰۰٪ هزینه
    takeProfitUsd: seller ? (b.stats.maxProfit === null ? null : 0.5 * b.stats.maxProfit) : debit > 0 ? debit : null,
    // فروش پرمیوم: ضرر = ۲ برابر پرمیوم دریافتی؛ خرید آپشن: نصف هزینه
    stopLossUsd: seller ? (credit > 0 ? 2 * credit : null) : debit > 0 ? 0.5 * debit : null,
    priceLevels: levels,
    closeOrRollDaysLeft: daysToExpiry > 21 ? 21 : 7
  };
}
