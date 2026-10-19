/**
 * ترکیب چندبازاری آپشن و تحلیل عمیق سناریو — همه از دادهٔ واقعی Derive
 *
 *   ۱ ترکیب‌ها با قاعدهٔ ثابت: نوسان را جایی بفروش که IV نسبت به HV گران است و جایی بخر که ارزان است؛
 *     بیمهٔ ریزش روی بازار با بیشترین Beta. فقط استراتژی‌های ریسک‌محدود.
 *   ۲ سناریوها: حرکت کل بازار (هر دارایی به اندازهٔ Beta خودش نسبت به BTC)، واگرایی، شوک IV، ترکیب ریزش + جهش IV، گذر زمان.
 *   ۳ تجزیهٔ سود/زیان هر سناریو به اثر قیمت (Delta/Gamma)، اثر IV (Vega) و اثر زمان (Theta).
 *   ۴ شبیه‌سازی مونت‌کارلو با بذر ثابت (تکرارپذیر): یک‌بار با نوسان = IV فعلی، یک‌بار با نوسان = HV ۳۰ روز.
 */
import { normCdf, payoffAt, positionStats, probAbove, valueAt, type IvRegime, type Leg } from './options';
import { buildStrategy, type BuiltStrategy, type ChainOption, type MarketInputs, type StrategyId } from './optionStrategies';

/* ---------------- همبستگی با BTC ---------------- */

export interface Candle {
  t: number;
  close: number;
}

/** Beta و همبستگی بازده لگاریتمی روزانه نسبت به بازار پایه (هم‌تراز با زمان) */
export function betaCorr(base: readonly Candle[], asset: readonly Candle[]): { beta: number; corr: number } | null {
  const day = (t: number) => Math.floor(t / 86_400_000);
  const b = new Map(base.map((c) => [day(c.t), c.close]));
  const pts = asset.filter((c) => b.has(day(c.t))).sort((x, y) => x.t - y.t);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const b0 = b.get(day(pts[i - 1].t))!;
    const b1 = b.get(day(pts[i].t))!;
    if (b0 > 0 && b1 > 0 && pts[i - 1].close > 0 && pts[i].close > 0) {
      x.push(Math.log(b1 / b0));
      y.push(Math.log(pts[i].close / pts[i - 1].close));
    }
  }
  if (x.length < 10) return null;
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < x.length; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  if (!(vx > 0) || !(vy > 0)) return null;
  return { beta: cov / vx, corr: cov / Math.sqrt(vx * vy) };
}

/* ---------------- ترکیب‌ها ---------------- */

export interface MarketSnap {
  currency: string;
  spot: number;
  /** روز تا سررسید انتخاب‌شده (۱۴ تا ۴۵، نزدیک ۳۰) */
  days: number;
  expiry: string;
  atmIv: number | null;
  hv: number | null;
  regime: IvRegime | null;
  chain: readonly ChainOption[];
  m: MarketInputs;
  /** نسبت به BTC؛ برای خود BTC = ۱ */
  beta: number | null;
  corr: number | null;
  oiUsd: number | null;
}

export type ComboId = 'calm' | 'vol_pair' | 'hedged_bull' | 'breakout';

export const COMBO_FA: Record<ComboId, { title: string; idea: string; wins: string; loses: string }> = {
  calm: {
    title: 'درآمد در بازار آرام',
    idea: 'آیرون کاندور (Iron Condor) روی دو بازاری که آپشن‌هایشان نسبت به نوسان واقعی اخیر گران‌تر است؛ آپشن گران فروخته می‌شود و زیان هر طرف سقف دارد.',
    wins: 'قیمت‌ها بین دو قیمت توافقیِ فروخته‌شده بمانند، زمان بگذرد یا نوسان مورد انتظار بازار (IV) پایین بیاید.',
    loses: 'حرکت شدید کل بازار، به‌خصوص ریزشی که آپشن‌ها را ناگهان گران کند؛ چون دو بازار با هم حرکت می‌کنند، هر دو با هم زیان می‌دهند.'
  },
  vol_pair: {
    title: 'معاملهٔ نسبی نوسان (دوطرفه)',
    idea: 'فروش آپشن (آیرون کاندور) در بازاری که آپشن‌هایش گران است و خرید آپشن (خرید استرنگل) در بازاری که آپشن‌هایش ارزان است؛ در حرکت کل بازار این دو بخش تا حدی همدیگر را پوشش می‌دهند.',
    wins: 'بازار گران آرام بماند و بازار ارزان حرکت بزرگ کند، یا گرانی آپشن‌های دو بازار به هم نزدیک شود.',
    loses: 'برعکس: بازار گران حرکت کند و بازار ارزان آرام بماند؛ گذر زمان از ارزش استرنگلِ خریداری‌شده کم می‌کند.'
  },
  hedged_bull: {
    title: 'صعودی با بیمهٔ ریزش',
    idea: 'اسپرد صعودی Put روی بازاری که آپشن‌هایش گران است (درآمد در صعود یا ثبات) + اسپرد نزولی Put روی بازاری که بیشترین همراهی را با بیت‌کوین دارد (Beta)، به‌عنوان بیمهٔ ریزش کل بازار.',
    wins: 'صعود ملایم یا ثبات؛ در ریزش شدید، بیمه بخشی از ضرر را جبران می‌کند.',
    loses: 'ریزش متوسط که بیمه هنوز کامل فعال نشده، یا وقتی بازار پرریسک بالا رود و بیمه بی‌ارزش منقضی شود.'
  },
  breakout: {
    title: 'شرط روی حرکت بزرگ',
    idea: 'خرید استرنگل (Long Strangle) روی دو بازاری که آپشن‌هایشان نسبت به نوسان واقعی اخیر ارزان‌تر است؛ جهت مهم نیست، اندازهٔ حرکت مهم است.',
    wins: 'حرکت بزرگ در هر جهت، یا گران شدن ناگهانی آپشن‌ها (مثلاً پیش از یک خبر مهم).',
    loses: 'بازار آرام، گذر زمان یا ارزان شدن آپشن‌ها؛ بیشترین زیان همان پولی است که در شروع پرداخته‌اید.'
  }
};

export interface ComboLeg {
  currency: string;
  role: string;
  strategy: BuiltStrategy;
  snap: MarketSnap;
}

export interface Combo {
  id: ComboId;
  legs: ComboLeg[];
  /** جمع حداکثر ضرر پاها (همه ریسک‌محدود) */
  totalMaxLoss: number;
  totalPremium: number;
  totalFees: number | null;
  /** یکی از پاها با سقف ریسک به حداقل اندازهٔ Derive نرسید */
  belowMinimum: boolean;
}

const ratio = (s: MarketSnap) => (s.atmIv !== null && s.hv ? s.atmIv / s.hv : null);
/** حداقل نقدینگی برای ورود به ترکیب (قاعدهٔ ثابت اپ) */
export const COMBO_MIN_OI_USD = 100_000;

/**
 * ترکیب‌های پیشنهادی از بازارهای نقد. riskCapPerTradeUsd = سرمایه × درصد ریسک (برای هر پا جدا).
 * ترتیب: ترکیبی که با وضعیت فعلی IV بیشتر جور است اول می‌آید.
 */
export function suggestCombos(snaps: readonly MarketSnap[], riskCapPerTradeUsd: number): Combo[] {
  const ok = snaps.filter((s) => ratio(s) !== null && (s.oiUsd ?? 0) >= COMBO_MIN_OI_USD);
  if (ok.length < 2) return [];
  const byRich = [...ok].sort((a, b) => ratio(b)! - ratio(a)!);
  const byCheap = [...byRich].reverse();
  const byBeta = [...ok].sort((a, b) => (b.beta ?? 1) - (a.beta ?? 1));
  const make = (id: ComboId, parts: [MarketSnap, StrategyId, string][]): Combo | null => {
    if (new Set(parts.map((p) => p[0].currency)).size !== parts.length) return null;
    const legs: ComboLeg[] = [];
    for (const [snap, sid, role] of parts) {
      const strategy = buildStrategy(sid, snap.chain, snap.m, riskCapPerTradeUsd, 0);
      if (!strategy || strategy.unlimitedLoss) return null;
      legs.push({ currency: snap.currency, role, strategy, snap });
    }
    return {
      id,
      legs,
      totalMaxLoss: legs.reduce((s, l) => s + (l.strategy.stats.maxLoss ?? 0), 0),
      totalPremium: legs.reduce((s, l) => s + l.strategy.stats.netPremium, 0),
      totalFees: legs.reduce<number | null>((s, l) => (s === null || l.strategy.fees === null ? null : s + l.strategy.fees), 0),
      belowMinimum: legs.some((l) => l.strategy.belowMinimum)
    };
  };
  const rich = byRich[0];
  const cheap = byCheap[0];
  const hedger = byBeta.find((s) => s.currency !== rich.currency) ?? byBeta[0];
  const candidates: (Combo | null)[] = [
    make('calm', [
      [byRich[0], 'iron_condor', `فروش آپشن گران (${fmtRatio(byRich[0])} برابر نوسان واقعی)`],
      [byRich[1], 'iron_condor', `فروش آپشن گران (${fmtRatio(byRich[1])} برابر نوسان واقعی)`]
    ]),
    make('vol_pair', [
      [rich, 'iron_condor', `فروش آپشن گران (${fmtRatio(rich)} برابر نوسان واقعی)`],
      [cheap, 'long_strangle', `خرید آپشن ارزان (${fmtRatio(cheap)} برابر نوسان واقعی)`]
    ]),
    make('hedged_bull', [
      [rich, 'bull_put_spread', 'درآمد در صعود یا ثبات با فروش Put گران'],
      [hedger, 'bear_put_spread', `بیمهٔ ریزش (همراهی با بیت‌کوین ${hedger.beta === null ? '—' : hedger.beta.toFixed(2)})`]
    ]),
    make('breakout', [
      [byCheap[0], 'long_strangle', `خرید آپشن ارزان (${fmtRatio(byCheap[0])} برابر نوسان واقعی)`],
      [byCheap[1], 'long_strangle', `خرید آپشن ارزان (${fmtRatio(byCheap[1])} برابر نوسان واقعی)`]
    ])
  ];
  const combos = candidates.filter((c): c is Combo => c !== null);
  // اولویت با وضعیت IV: اگر بیشتر بازارها گران‌اند، فروش نوسان اول؛ اگر ارزان، خرید نوسان اول
  const avg = ok.reduce((s, x) => s + ratio(x)!, 0) / ok.length;
  const order: ComboId[] = avg > 1.1 ? ['calm', 'vol_pair', 'hedged_bull', 'breakout'] : avg < 0.9 ? ['breakout', 'vol_pair', 'hedged_bull', 'calm'] : ['vol_pair', 'hedged_bull', 'calm', 'breakout'];
  return combos.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

const fmtRatio = (s: MarketSnap) => (ratio(s) ?? 0).toFixed(2);

/* ---------------- تجزیهٔ سود و زیان ---------------- */

export interface Shock {
  /** حرکت قیمت (کسری، مثلاً ۰٫۱ = +۱۰٪) */
  move: number;
  /** تغییر IV (کسری، مثلاً ۰٫۱ = +۱۰ واحد) */
  iv: number;
  /** روزهای گذشته؛ Infinity = تا سررسید */
  days: number;
}

export interface Attribution {
  total: number;
  /** اثر قیمت با IV و زمان ثابت (Delta و Gamma) */
  price: number;
  /** اثر تغییر IV (Vega) */
  vol: number;
  /** اثر گذر زمان (Theta) */
  time: number;
}

/** سود/زیان یک پوزیشن زیر شوک، تجزیه به قیمت → IV → زمان (به همین ترتیب، پس جمع دقیقاً برابر کل است) */
export function attribute(legs: readonly Leg[], spot: number, T: number, s: Shock): Attribution {
  const S1 = spot * (1 + s.move);
  const T1 = Number.isFinite(s.days) ? Math.max(0, T - s.days / 365) : 0;
  const v0 = valueAt(legs, spot, T, 0);
  const vPrice = valueAt(legs, S1, T, 0);
  const vVol = valueAt(legs, S1, T, s.iv);
  const vEnd = T1 === 0 ? payoffAt(legs, S1) : valueAt(legs, S1, T1, s.iv);
  return { total: vEnd, price: vPrice - v0, vol: vVol - vPrice, time: vEnd - vVol };
}

/** جملهٔ قاعده‌محور: چه چیزی سود یا ضرر را ساخت */
export function explainAttribution(a: Attribution, scale: number): string {
  const tiny = Math.max(0.5, scale * 0.02);
  if (Math.abs(a.total) < tiny) return 'تقریباً سربه‌سر';
  const parts = [
    { k: 'price', v: a.price, up: 'حرکت قیمت به نفع پوزیشن', down: 'حرکت قیمت خلاف پوزیشن (بیرون از بازهٔ سود)' },
    { k: 'vol', v: a.vol, up: 'تغییر نوسان بازار به نفع شما بود', down: 'تغییر نوسان بازار به ضرر شما بود' },
    { k: 'time', v: a.time, up: 'گذر زمان به نفع شما بود', down: 'گذر زمان از ارزش آپشن‌های شما کم کرد' }
  ].sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  const main = parts[0];
  const second = parts[1];
  const mainText = main.v >= 0 ? main.up : main.down;
  const head = a.total >= 0 ? `سود عمدتاً از ${mainText}` : `ضرر عمدتاً از ${mainText}`;
  const counter = Math.abs(second.v) >= tiny && Math.sign(second.v) !== Math.sign(a.total) ? `؛ ${second.v >= 0 ? second.up : second.down} بخشی را جبران کرد` : '';
  return head + counter;
}

/* ---------------- بازه‌های سود و زیان ---------------- */

export interface PnlZone {
  lo: number | null;
  hi: number | null;
  profit: boolean;
  /** احتمال ماندن قیمت در این بازه در سررسید (لگ‌نرمال با IV) */
  prob: number | null;
}

export function pnlZones(legs: readonly Leg[], forward: number, T: number, sigma: number | null): PnlZone[] {
  const be = positionStats(legs, forward, T, sigma).breakevens;
  const edges: (number | null)[] = [null, ...be, null];
  const zones: PnlZone[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const probe = lo === null && hi === null ? forward : lo === null ? hi! * 0.9 : hi === null ? lo * 1.1 : (lo + hi) / 2;
    const above = (x: number | null) => (x === null ? null : sigma === null ? null : probAbove(forward, x, T, sigma));
    const pLo = lo === null ? 1 : above(lo);
    const pHi = hi === null ? 0 : above(hi);
    zones.push({ lo, hi, profit: payoffAt(legs, probe) > 0, prob: pLo === null || pHi === null ? null : Math.max(0, pLo - pHi) });
  }
  return zones;
}

/* ---------------- سناریوهای ترکیب ---------------- */

export type ScenarioGroup = 'market' | 'divergence' | 'vol' | 'combo' | 'time' | 'replay';

export interface ComboScenario {
  id: string;
  group: ScenarioGroup;
  label: string;
  /** حرکت BTC (برای سناریوهای کل بازار) */
  baseMove: number | null;
  perLeg: { currency: string; move: number; attribution: Attribution; why: string }[];
  total: Attribution;
}

/** حرکت هر دارایی وقتی BTC به اندازهٔ baseMove جابه‌جا شود: exp(β × ln(1+m)) − ۱ */
export const betaMove = (baseMove: number, beta: number | null) => Math.exp((beta ?? 1) * Math.log(1 + baseMove)) - 1;

export function comboScenarios(c: Combo): ComboScenario[] {
  const defs: { id: string; group: ScenarioGroup; label: string; baseMove: number | null; shock: (l: ComboLeg, i: number) => Shock }[] = [];
  for (const m of [0.3, 0.2, 0.1, 0.05, 0, -0.05, -0.1, -0.2, -0.3])
    defs.push({
      id: `mkt${m}`,
      group: 'market',
      label: m === 0 ? 'بدون حرکت تا سررسید' : c.legs.length > 1 ? `${m > 0 ? 'صعود' : 'ریزش'} کل بازار ${Math.abs(m * 100)}٪ (BTC)` : `${m > 0 ? 'صعود' : 'ریزش'} ${Math.abs(m * 100)}٪`,
      baseMove: m,
      shock: (l) => ({ move: betaMove(m, l.snap.beta), iv: 0, days: Infinity })
    });
  if (c.legs.length >= 2)
    defs.push(
      { id: 'div1', group: 'divergence', label: `واگرایی: ${c.legs[0].currency} +۱۵٪، ${c.legs[1].currency} −۱۵٪`, baseMove: null, shock: (_l, i) => ({ move: i === 0 ? 0.15 : -0.15, iv: 0, days: Infinity }) },
      { id: 'div2', group: 'divergence', label: `واگرایی: ${c.legs[0].currency} −۱۵٪، ${c.legs[1].currency} +۱۵٪`, baseMove: null, shock: (_l, i) => ({ move: i === 0 ? -0.15 : 0.15, iv: 0, days: Infinity }) }
    );
  defs.push(
    { id: 'ivup', group: 'vol', label: 'آپشن‌ها ناگهان گران شوند (نوسان مورد انتظار +۱۵ واحد)، قیمت ثابت', baseMove: null, shock: () => ({ move: 0, iv: 0.15, days: 0 }) },
    { id: 'ivdn', group: 'vol', label: 'آپشن‌ها ناگهان ارزان شوند (نوسان مورد انتظار −۱۵ واحد)، قیمت ثابت', baseMove: null, shock: () => ({ move: 0, iv: -0.15, days: 0 }) },
    { id: 'crash', group: 'combo', label: c.legs.length > 1 ? 'سقوط ناگهانی: بیت‌کوین −۲۰٪ و نوسان مورد انتظار +۲۵ واحد' : 'سقوط ناگهانی: −۲۰٪ و نوسان مورد انتظار +۲۵ واحد', baseMove: -0.2, shock: (l) => ({ move: betaMove(-0.2, l.snap.beta), iv: 0.25, days: 0 }) },
    { id: 'rally', group: 'combo', label: c.legs.length > 1 ? 'صعود آرام: بیت‌کوین +۱۰٪ و نوسان مورد انتظار −۱۰ واحد طی ۷ روز' : 'صعود آرام: +۱۰٪ و نوسان مورد انتظار −۱۰ واحد طی ۷ روز', baseMove: 0.1, shock: (l) => ({ move: betaMove(0.1, l.snap.beta), iv: -0.1, days: 7 }) },
    { id: 'chop', group: 'combo', label: c.legs.length > 1 ? 'نوسان بی‌جهت: بیت‌کوین −۵٪ و نوسان مورد انتظار +۱۰ واحد طی ۷ روز' : 'نوسان بی‌جهت: −۵٪ و نوسان مورد انتظار +۱۰ واحد طی ۷ روز', baseMove: -0.05, shock: (l) => ({ move: betaMove(-0.05, l.snap.beta), iv: 0.1, days: 7 }) },
    { id: 't7', group: 'time', label: 'گذر ۷ روز، قیمت و نوسان ثابت', baseMove: 0, shock: () => ({ move: 0, iv: 0, days: 7 }) },
    { id: 'thalf', group: 'time', label: 'نیمهٔ راه تا سررسید، قیمت و نوسان ثابت', baseMove: 0, shock: (l) => ({ move: 0, iv: 0, days: l.snap.days / 2 }) }
  );
  const scale = Math.max(1, c.totalMaxLoss);
  return defs.map((d) => {
    const perLeg = c.legs.map((l, i) => {
      const s = d.shock(l, i);
      const a = attribute(l.strategy.legs, l.snap.spot, l.snap.m.T, s);
      return { currency: l.currency, move: s.move, attribution: a, why: explainAttribution(a, l.strategy.stats.maxLoss ?? scale) };
    });
    const total = perLeg.reduce<Attribution>((t, p) => ({ total: t.total + p.attribution.total, price: t.price + p.attribution.price, vol: t.vol + p.attribution.vol, time: t.time + p.attribution.time }), { total: 0, price: 0, vol: 0, time: 0 });
    return { id: d.id, group: d.group, label: d.label, baseMove: d.baseMove, perLeg, total };
  });
}

/* ---------------- مونت‌کارلو ---------------- */

/** مولد تصادفی با بذر ثابت (mulberry32) — نتیجه در هر بار اجرا یکسان */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export interface MonteCarlo {
  paths: number;
  /** احتمال سود کل ترکیب در سررسید */
  pProfit: number;
  expected: number;
  /** ۵٪ بدترین حالت (میانگین دم = CVaR) */
  worst5: number;
  best5: number;
  /** احتمال اینکه همهٔ پاها با هم ضرر بدهند */
  pAllLose: number;
}

/**
 * مدل یک‌عاملی: بازده لگاریتمی هر بازار = σ√T × (ρ·Z_بازار + √(1−ρ²)·Z_خاص) با رانش ریسک‌خنثی −σ²T/2.
 * vol = 'iv' نوسان ضمنی همان پا، 'hv' نوسان تاریخی ۳۰ روز.
 */
export function monteCarlo(c: Combo, vol: 'iv' | 'hv', paths = 4000, seed = 7): MonteCarlo | null {
  const sig = c.legs.map((l) => (vol === 'iv' ? l.snap.atmIv : l.snap.hv));
  if (sig.some((s) => s === null || !(s > 0))) return null;
  const r = rng(seed);
  const out: number[] = [];
  let wins = 0;
  let allLose = 0;
  for (let p = 0; p < paths; p++) {
    const zm = gauss(r);
    let total = 0;
    let losers = 0;
    c.legs.forEach((l, i) => {
      const rho = Math.max(-1, Math.min(1, l.snap.corr ?? 0.7));
      const z = rho * zm + Math.sqrt(1 - rho * rho) * gauss(r);
      const sT = sig[i]! * Math.sqrt(l.snap.m.T);
      const S = l.snap.m.forward * Math.exp(-0.5 * sT * sT + sT * z);
      const v = payoffAt(l.strategy.legs, S);
      total += v;
      if (v < 0) losers++;
    });
    out.push(total);
    if (total > 0) wins++;
    if (losers === c.legs.length) allLose++;
  }
  out.sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(paths * 0.05));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { paths, pProfit: wins / paths, expected: mean(out), worst5: mean(out.slice(0, k)), best5: mean(out.slice(-k)), pAllLose: allLose / paths };
}

/** حرکت ۱ انحراف معیار تا سررسید (٪) — برای خواندن سناریوها */
export const oneSigmaMovePct = (iv: number | null, T: number) => (iv === null ? null : (Math.exp(iv * Math.sqrt(T)) - 1) * 100);

/** احتمال حرکت بیش از x٪ در هر جهت تا سررسید با IV */
export function probMoveBeyond(iv: number | null, T: number, pct: number): number | null {
  if (iv === null || !(T > 0)) return null;
  const s = iv * Math.sqrt(T);
  const up = Math.log(1 + pct / 100) / s;
  const dn = Math.log(1 - pct / 100) / s;
  return 1 - normCdf(up + s / 2) + normCdf(dn + s / 2);
}


/** یک استراتژی تک‌بازاری به‌شکل ترکیب یک‌پا — برای همان تحلیل عمیق */
export function singleCombo(strategy: BuiltStrategy, snap: MarketSnap): Combo {
  return {
    id: 'calm',
    legs: [{ currency: snap.currency, role: '', strategy, snap: { ...snap, beta: 1 } }],
    totalMaxLoss: strategy.stats.maxLoss ?? 0,
    totalPremium: strategy.stats.netPremium,
    totalFees: strategy.fees,
    belowMinimum: strategy.belowMinimum
  };
}

/* ---------------- دادهٔ زندهٔ بخش «بازارها» ---------------- */

export interface LiveQuote {
  symbol: string;
  price: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  snapshot?: boolean;
}

export interface Breadth {
  n: number;
  /** درصد نمادهای مثبت در ۲۴ ساعت و ۷ روز */
  up24Pct: number | null;
  up7Pct: number | null;
  /** میانهٔ تغییر ۷ روزه (٪) */
  median7d: number | null;
  mood: 'risk_on' | 'risk_off' | 'mixed' | null;
}

/** پهنای بازار از ۲۰۰ رمزارز برتر: ریسک‌پذیری (بیش از ۶۵٪ مثبت) یا ریسک‌گریزی (کمتر از ۳۵٪) — قاعدهٔ ثابت */
export function marketBreadth(quotes: readonly LiveQuote[]): Breadth {
  const liveOnly = quotes.filter((q) => !q.snapshot);
  const pct = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
    return v.length >= 20 ? (v.filter((x) => x > 0).length / v.length) * 100 : null;
  };
  const c7 = liveOnly.map((q) => q.change7d).filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  const up7Pct = pct(liveOnly.map((q) => q.change7d));
  return {
    n: liveOnly.length,
    up24Pct: pct(liveOnly.map((q) => q.change24h)),
    up7Pct,
    median7d: c7.length >= 20 ? c7[Math.floor(c7.length / 2)] : null,
    mood: up7Pct === null ? null : up7Pct > 65 ? 'risk_on' : up7Pct < 35 ? 'risk_off' : 'mixed'
  };
}

/**
 * دیدگاه پیشنهادی از روند خود نماد و پهنای بازار (قاعده‌محور، نه پیش‌بینی):
 *   ۷ و ۳۰ روز هر دو بیش از +۳٪ و بازار ریسک‌گریز نیست → صعودی؛ هر دو کمتر از −۳٪ و بازار ریسک‌پذیر نیست → نزولی؛
 *   هر دو بین ±۳٪ → خنثی؛ در غیر این صورت نامطمئن.
 */
export function viewFromMarket(q: LiveQuote | null, b: Breadth): { view: 'bull' | 'bear' | 'neutral' | 'unsure'; reason: string } | null {
  if (!q || q.change7d === null || q.change30d === null) return null;
  const a = q.change7d;
  const m = q.change30d;
  const fa = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}٪`;
  const ctx = b.up7Pct === null ? '' : `، ${Math.round(b.up7Pct)}٪ بازار در ۷ روز مثبت`;
  const base = `۷ روز ${fa(a)}، ۳۰ روز ${fa(m)}${ctx}`;
  if (a > 3 && m > 3 && b.mood !== 'risk_off') return { view: 'bull', reason: `روند صعودی (${base})` };
  if (a < -3 && m < -3 && b.mood !== 'risk_on') return { view: 'bear', reason: `روند نزولی (${base})` };
  if (Math.abs(a) <= 3 && Math.abs(m) <= 3) return { view: 'neutral', reason: `بازار در محدوده (${base})` };
  return { view: 'unsure', reason: `روند ناهمسو (${base})` };
}

/** سناریوی «تکرار حرکت اخیر»: هر بازار همان تغییر ۷ یا ۳۰ روزهٔ خودش را از بخش بازارها تکرار کند (تا سررسید) */
export function replayScenarios(c: Combo, live: readonly LiveQuote[]): ComboScenario[] {
  const q = (sym: string) => live.find((x) => x.symbol.toUpperCase() === sym && !x.snapshot) ?? null;
  const out: ComboScenario[] = [];
  for (const [key, label, inverse] of [
    ['change7d', 'تکرار حرکت ۷ روز اخیر', false],
    ['change30d', 'تکرار حرکت ۳۰ روز اخیر', false],
    ['change30d', 'برگشت حرکت ۳۰ روز اخیر (معکوس)', true]
  ] as const) {
    const moves = c.legs.map((l) => q(l.currency)?.[key] ?? null);
    if (moves.some((m) => m === null)) continue;
    const perLeg = c.legs.map((l, i) => {
      const raw = moves[i]! / 100;
      const move = inverse ? 1 / (1 + raw) - 1 : raw;
      const a = attribute(l.strategy.legs, l.snap.spot, l.snap.m.T, { move, iv: 0, days: Infinity });
      return { currency: l.currency, move, attribution: a, why: explainAttribution(a, l.strategy.stats.maxLoss ?? Math.max(1, c.totalMaxLoss)) };
    });
    const total = perLeg.reduce<Attribution>((t, p) => ({ total: t.total + p.attribution.total, price: t.price + p.attribution.price, vol: t.vol + p.attribution.vol, time: t.time + p.attribution.time }), { total: 0, price: 0, vol: 0, time: 0 });
    out.push({ id: `replay-${key}-${inverse ? 'inv' : 'fwd'}`, group: 'replay', label, baseMove: null, perLeg, total });
  }
  return out;
}
