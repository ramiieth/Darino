import { describe, expect, it } from 'vitest';
import type { ClassifiedTrade, Fill, JournalAccount, TradeNote } from './types';
import { baseOf, buildTrades } from './roundTrips';
import { accountKey, fromHlFills, fromHlFunding, fromLighterTrades, fromArcusFills, inferPosBefore } from './fills';
import { classifyTrades } from './classify';
import { computeCore, isScratch, scratchFloorOf } from './metrics';
import { analyzeBehavior } from './behavior';
import { buildScorecard, overallVerdict, rankRows } from './scorecard';
import { calcPlan, linkPlans, newPlan, plannedRisks } from './plan';
import { checkCommitment, crossWeekPatterns, weekStats } from './review';
import { isoWeekKey, shiftWeek } from './time';
import { DEFAULT_SETTINGS } from './defaults';
import { runJournal } from './audit';
import { neutralBook } from './neutral';

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 5, 8); // دوشنبه ۵ اکتبر ۲۰۲۶ ۰۸:۰۰ UTC
const acc = (venue: JournalAccount['venue'], addr = '0x' + '1'.repeat(40), sub?: number): JournalAccount => ({ key: accountKey(venue, addr, sub), venue, label: venue, address: addr, sub });
const HL = acc('hyperliquid');
const LR = acc('lighter-robinhood', '0x' + '2'.repeat(40), 7);

let seq = 0;
function fill(p: Partial<Fill> & Pick<Fill, 'side' | 'px' | 'sz' | 'time'>, a: JournalAccount = HL, symbol = 'BTC'): Fill {
  return { id: `${a.key}|${seq++}`, account: a.key, venue: a.venue, symbol, fee: 0, realized: null, posBefore: null, ...p };
}

/** معاملهٔ ساختگی کامل برای آزمون معیارها */
function trade(net: number, openTime: number, holdH = 1, extra: Partial<ClassifiedTrade> = {}): ClassifiedTrade {
  return {
    id: `t${seq++}`, account: HL.key, venue: 'hyperliquid', symbol: 'BTC', base: 'BTC', direction: 'long', openTime, closeTime: openTime + holdH * H,
    open: false, truncated: false, entryPx: 100, exitPx: 100, maxSize: 10, maxNotional: 1000, volume: 2000, grossPnl: net, fees: 0, funding: 0, netPnl: net,
    fills: 2, liquidated: false, book: 'directional', bookReason: '', hedgeGroup: null, ...extra
  };
}

describe('بازسازی معاملهٔ رفت‌وبرگشت', () => {
  it('ورود پله‌ای و خروج کامل → یک معامله با میانگین ورود و سود قیمتی', () => {
    const t = buildTrades([
      fill({ side: 'buy', px: 100, sz: 1, time: T0, fee: 0.1 }),
      fill({ side: 'buy', px: 110, sz: 1, time: T0 + H, fee: 0.1 }),
      fill({ side: 'sell', px: 120, sz: 2, time: T0 + 2 * H, fee: 0.2 })
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].direction).toBe('long');
    expect(t[0].entryPx).toBeCloseTo(105);
    expect(t[0].grossPnl).toBeCloseTo(30);
    expect(t[0].fees).toBeCloseTo(0.4);
    expect(t[0].netPnl).toBeCloseTo(29.6);
    expect(t[0].open).toBe(false);
    expect(t[0].maxNotional).toBeCloseTo(210);
  });

  it('چرخش جهت در یک اجرا → بستن لانگ + شورت تازه؛ کارمزد به نسبت تقسیم', () => {
    const t = buildTrades([
      fill({ side: 'buy', px: 100, sz: 1, time: T0, fee: 0 }),
      fill({ side: 'sell', px: 90, sz: 3, time: T0 + H, fee: 0.3 }),
      fill({ side: 'buy', px: 80, sz: 2, time: T0 + 2 * H, fee: 0 })
    ]).sort((a, b) => a.openTime - b.openTime);
    expect(t).toHaveLength(2);
    expect(t[0].direction).toBe('long');
    expect(t[0].grossPnl).toBeCloseTo(-10);
    expect(t[0].fees).toBeCloseTo(0.1);
    expect(t[1].direction).toBe('short');
    expect(t[1].entryPx).toBeCloseTo(90);
    expect(t[1].grossPnl).toBeCloseTo(20);
    expect(t[1].fees).toBeCloseTo(0.2);
  });

  it('شروع بیرون از تاریخچه → ناقص؛ سود از گزارش صرافی، قیمت ورود نامعلوم', () => {
    const t = buildTrades([fill({ side: 'sell', px: 120, sz: 1, time: T0, posBefore: 1, realized: 15 })]);
    expect(t[0].truncated).toBe(true);
    expect(t[0].entryPx).toBeNull();
    expect(t[0].grossPnl).toBe(15);
  });

  it('پوزیشن باز → open و بدون زمان بستن', () => {
    const t = buildTrades([fill({ side: 'sell', px: 50, sz: 2, time: T0 })]);
    expect(t[0].open).toBe(true);
    expect(t[0].direction).toBe('short');
  });

  it('فاندینگ به معاملهٔ باز همان زمان؛ پلتفرم بدون فاندینگ → null نه صفر', () => {
    const fills = [fill({ side: 'buy', px: 100, sz: 1, time: T0 }), fill({ side: 'sell', px: 100, sz: 1, time: T0 + 5 * H })];
    const withF = buildTrades(fills, [{ id: 'f1', account: HL.key, symbol: 'BTC', time: T0 + H, amount: 2 }], new Set([HL.key]));
    expect(withF[0].funding).toBe(2);
    expect(withF[0].netPnl).toBe(2);
    expect(buildTrades(fills)[0].funding).toBeNull();
  });

  it('کارمزد گزارش‌نشده → fees=null', () => {
    const t = buildTrades([fill({ side: 'buy', px: 1, sz: 1, time: T0, fee: null }), fill({ side: 'sell', px: 2, sz: 1, time: T0 + H })]);
    expect(t[0].fees).toBeNull();
  });

  it('نام پایه بین پلتفرم‌ها یکی می‌شود', () => {
    expect(baseOf('BTC-USD')).toBe('BTC');
    expect(baseOf('ETH-PERP')).toBe('ETH');
    expect(baseOf('kPEPE')).toBe('PEPE');
    expect(baseOf('1000PEPE')).toBe('PEPE');
    expect(baseOf('xyz:TSLA')).toBe('TSLA');
    expect(baseOf('SOL')).toBe('SOL');
  });
});

describe('نرمال‌سازی پلتفرم‌ها', () => {
  it('هایپرلیکوئید: اسپات و تسویه کنار؛ startPosition و closedPnl خوانده می‌شود', () => {
    const f = fromHlFills(HL, [
      { coin: 'BTC', px: '100', sz: '1', side: 'A', time: T0, startPosition: '1', dir: 'Close Long', closedPnl: '5', fee: '0.05', tid: 9, crossed: true },
      { coin: '@107', px: '1', sz: '1', side: 'B', time: T0, startPosition: '0', dir: 'Buy', closedPnl: '0', tid: 10 },
      { coin: 'PAPER', px: '1', sz: '1', side: 'A', time: T0, startPosition: '0', dir: 'Settlement', closedPnl: '0', tid: 11 }
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ side: 'sell', posBefore: 1, realized: 5, fee: 0.05, maker: false });
    expect(fromHlFunding(HL, [{ time: T0, delta: { type: 'funding', coin: 'BTC', usdc: '-0.4' } }])[0].amount).toBe(-0.4);
  });

  it('لایتر و آرکوس', () => {
    expect(fromLighterTrades(LR, [{ id: '1', t: T0, sym: 'ETH', side: 'buy', px: 2000, sz: 1, usd: 2000, fee: null, pnl: -5, before: -2, maker: true, liq: false }])[0]).toMatchObject({ posBefore: -2, realized: -5, fee: null });
    const ar = acc('arcus', '0x' + '3'.repeat(40), 0);
    const f = fromArcusFills(ar, [{ tradeId: 'x', side: 'SELL', price: '10', size: '2', fee: '0.01', role: 'TAKER', marketDisplayName: 'SOL-USD', createdAt: '1791187200000000' }]);
    expect(f[0]).toMatchObject({ side: 'sell', time: 1791187200000, symbol: 'SOL-USD' });
  });

  it('پوزیشن قبل از پوزیشن فعلی به عقب استنتاج می‌شود', () => {
    const fs = [fill({ side: 'sell', px: 10, sz: 1, time: T0 }), fill({ side: 'buy', px: 9, sz: 3, time: T0 + H })];
    const out = inferPosBefore(fs, new Map([['BTC', 4]]));
    expect(out.find((f) => f.time === T0)!.posBefore).toBe(2);
  });
});

describe('تفکیک دفترها', () => {
  const legs = () => buildTrades([
    fill({ side: 'buy', px: 100, sz: 10, time: T0 }, HL, 'ETH'),
    fill({ side: 'sell', px: 101, sz: 10, time: T0 + 24 * H }, HL, 'ETH'),
    fill({ side: 'sell', px: 100, sz: 10, time: T0 + 0.1 * H }, acc('lighter-mainnet', '0x' + '4'.repeat(40), 1), 'ETH'),
    fill({ side: 'buy', px: 101, sz: 10, time: T0 + 24 * H }, acc('lighter-mainnet', '0x' + '4'.repeat(40), 1), 'ETH'),
    fill({ side: 'buy', px: 50, sz: 1, time: T0 }, HL, 'SOL'),
    fill({ side: 'sell', px: 55, sz: 1, time: T0 + H }, HL, 'SOL')
  ]);

  it('پای مخالف هم‌زمان روی حساب دیگر → هر دو نوترال و هم‌گروه؛ بقیه جهت‌دار', () => {
    const c = classifyTrades(legs(), DEFAULT_SETTINGS, new Map(), T0 + 48 * H);
    const eth = c.filter((t) => t.base === 'ETH');
    expect(eth.every((t) => t.book === 'neutral')).toBe(true);
    expect(eth[0].hedgeGroup).toBe(eth[1].hedgeGroup);
    expect(c.find((t) => t.base === 'SOL')!.book).toBe('directional');
  });

  it('نقش حساب و انتخاب دستی مقدم‌اند؛ لایتر رابین‌هود پیش‌فرض نوترال', () => {
    const t = buildTrades([fill({ side: 'buy', px: 1, sz: 1, time: T0 }, LR), fill({ side: 'sell', px: 2, sz: 1, time: T0 + H }, LR)]);
    expect(classifyTrades(t, DEFAULT_SETTINGS, new Map())[0].book).toBe('neutral');
    const note: TradeNote = { tradeId: t[0].id, whyTags: [], whyTaggedBeforeClose: false, mistakeTags: [], goodTags: [], note: '', book: 'directional', followedRules: null, updatedAt: 1 };
    const c = classifyTrades(t, DEFAULT_SETTINGS, new Map([[t[0].id, note]]));
    expect(c[0].book).toBe('directional');
    expect(c[0].bookReason).toContain('دستی');
  });
});

describe('معیارهای عملکرد', () => {
  const sample = () => [100, -50, 0.5, 200, -80, -40, 60, -30, 150, -120].map((n, i) => trade(n, T0 + i * 24 * H));

  it('سربه‌سر، نرخ برد دوگانه، ضریب سود و امید ریاضی', () => {
    const ts = sample();
    const m = computeCore(ts, { tz: 'UTC', accountSize: 10_000 });
    const floor = scratchFloorOf(ts);
    expect(floor).toBeCloseTo(0.02 * ((100 + 0.5 + 200 + 60 + 150) / 5));
    expect(isScratch(ts[2], floor)).toBe(true);
    expect(m.scratches).toBe(1);
    expect(m.wins).toBe(4);
    expect(m.losses).toBe(5);
    expect(m.winRateDecisive).toBeCloseTo(44.44, 1);
    expect(m.winRateAll).toBeCloseTo(40);
    expect(m.netPnl).toBeCloseTo(190.5);
    expect(m.profitFactor).toBeCloseTo(510.5 / 320);
    expect(m.expectancy).toBeCloseTo(19.05);
    expect(m.payoff).toBeCloseTo(127.5 / 64);
  });

  it('افت سرمایه، رشته‌ها و آزمون «یک معاملهٔ بد»', () => {
    const m = computeCore(sample(), { tz: 'UTC', accountSize: 10_000 });
    // تجمعی: 100, 50, 50.5, 250.5, 170.5, 130.5, 190.5, 160.5, 310.5, 190.5 → اولین افت ۱۲۰ از قلهٔ ۲۵۰٫۵
    expect(m.maxDrawdown).toBeCloseTo(120);
    expect(m.maxDrawdownPct).toBeCloseTo((120 / 10_250.5) * 100);
    expect(m.longestLossStreak).toBe(2);
    expect(m.withoutWorst1).toBeCloseTo(310.5);
    expect(m.withoutWorst3).toBeCloseTo(190.5 + 120 + 80 + 50);
    expect(m.recoveryFactor).toBeCloseTo(190.5 / 120);
  });

  it('بدون اندازهٔ حساب → درصدها null (ارزیابی نشد)، نه صفر', () => {
    const m = computeCore(sample(), { tz: 'UTC', accountSize: null });
    expect(m.maxDrawdownPct).toBeNull();
    expect(m.worstDayPct).toBeNull();
    const rows = buildScorecard({ core: m, behavior: analyzeBehavior(sample(), { tz: 'UTC', notes: new Map(), risks: new Map() }), planCoverage: null, ruleAdherence: null });
    expect(rows.find((r) => r.id === 'maxDrawdown')!.verdict).toBe('na');
    expect(rows.find((r) => r.id === 'riskPerTrade')!.verdict).toBe('na');
  });

  it('سبک از میانهٔ زمان نگه‌داری؛ تعداد معامله در روز برای سوینگ «نامربوط»', () => {
    const ts = [1, -1, 2, -2, 3].map((n, i) => trade(n * 10, T0 + i * 30 * 24 * H, 5 * 24));
    const m = computeCore(ts, { tz: 'UTC', accountSize: null });
    expect(m.style).toBe('swing');
    const rows = buildScorecard({ core: m, behavior: analyzeBehavior(ts, { tz: 'UTC', notes: new Map(), risks: new Map() }), planCoverage: 0, ruleAdherence: null });
    expect(rows.find((r) => r.id === 'tradesPerDay')!.verdict).toBe('notApplicable');
  });

  it('حکم کلی: نمونهٔ کمتر از ۱۰ معامله → «دادهٔ کافی نیست»', () => {
    const m = computeCore(sample().slice(0, 5), { tz: 'UTC', accountSize: null });
    expect(overallVerdict(m, []).band).toBe('insufficient');
  });
});

describe('کالبدشکافی رفتاری', () => {
  it('ورود سریع بعد از ضرر شناسایی و قیمت‌گذاری می‌شود', () => {
    const ts: ClassifiedTrade[] = [];
    let t = T0;
    // الگوی عادی: فاصلهٔ ۶ ساعته، برد کوچک
    for (let i = 0; i < 6; i++) { ts.push(trade(20, t)); t += 7 * H; }
    // ضرر، بعد ورود ۱۰ دقیقه‌ای و ضرر دوباره (سه بار)
    for (let i = 0; i < 3; i++) {
      ts.push(trade(-30, t));
      ts.push(trade(-40, t + H + 10 * 60_000));
      t += 9 * H;
    }
    const b = analyzeBehavior(ts, { tz: 'UTC', notes: new Map(), risks: new Map() });
    expect(b.revenge).not.toBeNull();
    expect(b.revenge!.cost).toBeGreaterThan(0);
    expect(b.leaks.some((l) => l.id === 'revenge')).toBe(true);
  });

  it('زیان بیش از استاپ برنامه → نقض نظم استاپ با اضافهٔ زیان', () => {
    const ts = [trade(-250, T0), trade(-90, T0 + 24 * H), trade(150, T0 + 48 * H)];
    const risks = new Map(ts.map((x) => [x.id, { riskUsd: 100, plan: newPlan(T0) }]));
    const b = analyzeBehavior(ts, { tz: 'UTC', notes: new Map(), risks });
    expect(b.stops).toEqual({ planned: 3, violations: 1, excess: 150 });
    expect(b.leaks[0].id).toBe('stops');
  });

  it('تناقض یادداشت «مطمئن» با زیان برگردانده می‌شود', () => {
    const ts = [trade(-50, T0), trade(30, T0 + H), trade(-10, T0 + 2 * H)];
    const notes = new Map([[ts[0].id, { tradeId: ts[0].id, whyTags: [], whyTaggedBeforeClose: false, mistakeTags: [], goodTags: [], note: 'ستاپ تمیز و مطمئن', followedRules: null, updatedAt: 1 } as TradeNote]]);
    expect(analyzeBehavior(ts, { tz: 'UTC', notes, risks: new Map() }).contradictions[0].quote).toContain('مطمئن');
  });

  it('رتبه‌بندی کارنامه: ردیف دارای اثر دلاری بالاتر از بی‌قیمت', () => {
    const ts = [100, -300, 80, -250, 90, -280, 70].map((n, i) => trade(n, T0 + i * 24 * H));
    const m = computeCore(ts, { tz: 'UTC', accountSize: null });
    const rows = rankRows(buildScorecard({ core: m, behavior: analyzeBehavior(ts, { tz: 'UTC', notes: new Map(), risks: new Map() }), planCoverage: null, ruleAdherence: null }));
    expect(rows[0].impact).toBeGreaterThan(0);
  });
});

describe('برنامهٔ معامله', () => {
  it('R هدف، ریسک دلاری، اندازهٔ پیشنهادی و هشدارها', () => {
    const c = calcPlan({ direction: 'long', entry: 100, stop: 95, target: 115, size: 40, leverage: 10 }, 10_000, 1);
    expect(c.rTarget).toBeCloseTo(3);
    expect(c.riskUsd).toBeCloseTo(200);
    expect(c.riskPct).toBeCloseTo(2);
    expect(c.suggestedSize).toBeCloseTo(20);
    expect(c.withinLimit).toBe(false);
    expect(c.problems.some((p) => p.includes('سقف'))).toBe(true);
    expect(calcPlan({ direction: 'short', entry: 100, stop: 95, target: 90, size: null, leverage: null }, null, 1).problems[0]).toContain('شورت');
    expect(calcPlan({ direction: 'long', entry: 100, stop: 80, target: 150, size: null, leverage: 10 }, null, 1).problems.some((p) => p.includes('لیکوئید'))).toBe(true);
  });

  it('اتصال خودکار به نزدیک‌ترین معاملهٔ هم‌جهت و هم‌دارایی در بازهٔ اعتبار؛ R واقعی با اندازهٔ واقعی', () => {
    const p = newPlan(T0, { symbol: 'BTC-USD', direction: 'long', entry: 100, stop: 90 });
    const near = trade(50, T0 + 2 * H, 1, { maxSize: 3 });
    const far = trade(50, T0 + 40 * H);
    const wrongSide = trade(50, T0 + H, 1, { direction: 'short' });
    const links = linkPlans([p], [far, wrongSide, near]);
    expect(links.get(near.id)?.id).toBe(p.id);
    expect(links.size).toBe(1);
    expect(plannedRisks(links, [near]).get(near.id)!.riskUsd).toBeCloseTo(30);
  });
});

describe('مرور هفتگی', () => {
  it('هفتهٔ ISO با سال؛ ابتدای ژانویه می‌تواند هفتهٔ آخر سال قبل باشد', () => {
    expect(isoWeekKey(Date.UTC(2027, 0, 1, 12), 'UTC')).toBe('2026-W53');
    expect(isoWeekKey(Date.UTC(2026, 9, 28, 12), 'UTC')).toBe('2026-W44');
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
  });

  it('تعهدها روی هفتهٔ اجرا خودکار سنجیده می‌شوند', () => {
    const ctx = { tz: 'UTC', notes: new Map<string, TradeNote>(), links: new Map(), risks: new Map(), accountSize: null, weekEnded: true };
    const day = [trade(10, T0), trade(-10, T0 + H), trade(5, T0 + 2 * H + 5 * 60_000)];
    expect(checkCommitment({ id: '1', text: '', rule: { type: 'maxTradesPerDay', n: 2 }, done: false }, day, ctx)).toMatchObject({ status: 'broken', violations: 1 });
    expect(checkCommitment({ id: '2', text: '', rule: { type: 'cooldownAfterLoss', minutes: 30 }, done: false }, day, ctx).status).toBe('broken');
    expect(checkCommitment({ id: '3', text: '', rule: { type: 'maxLossUsd', usd: 50 }, done: false }, day, ctx).status).toBe('kept');
    expect(checkCommitment({ id: '4', text: '', rule: { type: 'requirePlan' }, done: false }, day, ctx).violations).toBe(3);
    expect(checkCommitment({ id: '5', text: '', rule: { type: 'maxRiskPct', pct: 1 }, done: false }, day, ctx).status).toBe('unknown');
    expect(checkCommitment({ id: '6', text: '', rule: { type: 'free' }, done: false }, day, ctx).status).toBe('manual');
  });

  it('الگوی تکرار اشتباه در چند هفته', () => {
    const mk = (week: string, tags: string[]) => {
      const t = trade(-10, T0);
      const notes = new Map([[t.id, { tradeId: t.id, whyTags: [], whyTaggedBeforeClose: false, mistakeTags: tags, goodTags: [], note: '', followedRules: false, updatedAt: 1 } as TradeNote]]);
      return weekStats(week, [t], notes, new Map());
    };
    const p = crossWeekPatterns([mk('2026-W40', ['جابه‌جاکردن استاپ']), mk('2026-W41', ['جابه‌جاکردن استاپ'])], new Map(), []);
    expect(p.some((x) => x.text.includes('جابه‌جاکردن استاپ') && x.text.includes('2 از 2') && x.tone === 'bad')).toBe(true);
    expect(p.some((x) => x.text.includes('خلاف قانون'))).toBe(true);
  });
});

describe('دفتر نوترال و هماهنگ‌کننده', () => {
  it('حجم، هزینه به‌ازای میلیون و عدم‌تعادل پوشش', () => {
    const fills = [
      fill({ side: 'buy', px: 100, sz: 10, time: T0, fee: 0.5 }, HL, 'ETH'),
      fill({ side: 'sell', px: 100, sz: 10, time: T0 + 24 * H, fee: 0.5 }, HL, 'ETH'),
      fill({ side: 'sell', px: 100, sz: 8, time: T0, fee: 0 }, LR, 'ETH'),
      fill({ side: 'buy', px: 100, sz: 8, time: T0 + 24 * H, fee: 0 }, LR, 'ETH')
    ];
    const trades = classifyTrades(buildTrades(fills, [{ id: 'f', account: HL.key, symbol: 'ETH', time: T0 + H, amount: 3 }], new Set([HL.key])), DEFAULT_SETTINGS, new Map(), T0 + 48 * H);
    const nb = neutralBook({ trades: trades.filter((t) => t.book === 'neutral'), fills, funding: [{ id: 'f', account: HL.key, symbol: 'ETH', time: T0 + H, amount: 3 }], accounts: [HL, LR], neutralKeys: [LR.key], platformDaily: new Map(), from: 0, tz: 'UTC', now: T0 + 48 * H });
    expect(nb.totals.volume).toBeCloseTo(3600);
    expect(nb.hedges).toHaveLength(1);
    expect(nb.hedges[0].imbalancePct).toBeCloseTo((200 / 1800) * 100);
    expect(nb.hedges[0].net).toBeCloseTo(2);
    expect(nb.totals.fundingPartial).toBe(true);
  });

  it('runJournal: دفتر جهت‌دار فقط معاملات جهت‌دار کامل را می‌سنجد', () => {
    const fills = [
      fill({ side: 'buy', px: 100, sz: 1, time: T0 }), fill({ side: 'sell', px: 110, sz: 1, time: T0 + H }),
      fill({ side: 'buy', px: 1, sz: 1, time: T0 }, LR, 'ETH'), fill({ side: 'sell', px: 2, sz: 1, time: T0 + H }, LR, 'ETH'),
      fill({ side: 'sell', px: 100, sz: 1, time: T0 + 2 * H, posBefore: 3, realized: 4 }, HL, 'SOL')
    ];
    const j = runJournal({ trades: buildTrades(fills), fills, funding: [], accounts: [HL, LR], notes: new Map(), plans: [], settings: DEFAULT_SETTINGS, accountSize: null, platformDaily: new Map(), from: 0, tz: 'UTC', sourceNotes: [], now: T0 + 10 * H });
    expect(j.directional.core.n).toBe(1);
    expect(j.directional.data.open).toBe(1);
    expect(j.neutralTrades).toHaveLength(1);
    expect(j.directional.data.coverage.find((c) => c.field === 'stop')!.pct).toBe(0);
  });
});
