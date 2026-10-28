/**
 * کارنامه: مقایسه با معیار حرفه‌ای (Prop)، حکم، کلاس معیار، جملهٔ اقدام و رتبه‌بندی دلاری
 *
 * کلاس‌ها (از پرامپت حسابرسی):
 *   performance  نتیجه‌ای که معامله‌گری شما تولید کرد — با معیار سنجیده می‌شود
 *   behaviour    نحوهٔ اجرا — فقط وقتی داده پشتش هست سنجیده می‌شود
 *   confidence   ویژگی داده، نه معامله‌گری — هرگز نمره، قرمز یا رتبه نمی‌گیرد
 *   context      توصیفی یا وابسته به سبک — نمره نمی‌گیرد
 * حکم‌ها: meets · borderline · fails · na (ارزیابی نشد، خاکستری) · notApplicable (مناسب سبک شما نیست)
 * معیارها «مرجع» Prop هستند و منبع آماری مستقل ندارند؛ این در متن هر ردیف گفته می‌شود.
 */
import type { Behavior, Leak } from './behavior';
import type { CoreMetrics, Style } from './metrics';
import { STYLE_FA } from './metrics';

export type MetricClass = 'performance' | 'behaviour' | 'confidence' | 'context';
export type Verdict = 'meets' | 'borderline' | 'fails' | 'na' | 'notApplicable';

export const CLASS_FA: Record<MetricClass, string> = { performance: 'عملکرد', behaviour: 'رفتار', confidence: 'اعتماد داده', context: 'زمینه' };
export const VERDICT_FA: Record<Verdict, string> = { meets: 'در حد استاندارد', borderline: 'مرزی', fails: 'زیر استاندارد', na: 'ارزیابی نشد', notApplicable: 'مناسب سبک شما نیست' };

export interface ScoreRow {
  id: string;
  cls: MetricClass;
  /** عنوان ساده؛ نام فنی جدا */
  title: string;
  term: string;
  value: number | null;
  display: string;
  benchmark: string;
  /** نوار گلوله‌ای: بازهٔ حرفه‌ای و جای شما روی یک محور */
  band: { min: number; max: number; goodFrom: number; goodTo: number; mark: number | null } | null;
  verdict: Verdict;
  /** «اگر این عدد بد است، باید…» */
  action: string;
  /** چرا ارزیابی نشد / توضیح حکم */
  note: string | null;
  /** اثر دلاری برآوردشده از فرض خلاف واقع (برای رتبه‌بندی) */
  impact: number | null;
  /** روش دقیق محاسبه */
  formula: string;
}

const usd = (v: number | null | undefined, signed = false) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
  return `${v < 0 ? '−' : signed && v > 0 ? '+' : ''}$${s}`;
};
const pc = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}٪`);
const ratio = (v: number | null | undefined) => (v === null || v === undefined ? '—' : !Number.isFinite(v) ? '∞' : v.toFixed(2));

function grade(v: number | null, good: (x: number) => boolean, ok: (x: number) => boolean): Verdict {
  if (v === null || Number.isNaN(v)) return 'na';
  return good(v) ? 'meets' : ok(v) ? 'borderline' : 'fails';
}

export interface ScoreInput {
  core: CoreMetrics;
  behavior: Behavior;
  /** درصد معاملات دارای برنامهٔ ثبت‌شده */
  planCoverage: number | null;
  /** درصد معاملاتی که کاربر «طبق قانون» علامت زده (از علامت‌خورده‌ها) */
  ruleAdherence: { pct: number; n: number } | null;
}

export function buildScorecard({ core: m, behavior: b, planCoverage, ruleAdherence }: ScoreInput): ScoreRow[] {
  const rows: ScoreRow[] = [];
  const style: Style | null = m.style;
  const thin = (n: number) => (n < 30 ? ` — فقط بر پایهٔ ${n} معامله، پس جهت‌نما است نه حکم قطعی` : '');

  rows.push({
    id: 'winRate', cls: 'performance', title: 'چند درصد معاملات قطعی را بردید', term: 'نرخ برد (Win rate)',
    value: m.winRateDecisive, display: pc(m.winRateDecisive),
    benchmark: '۴۵ تا ۶۰٪؛ زیر ۴۰٪ فقط با نسبت سود به زیان بالای ۲ دوام می‌آورد',
    band: m.winRateDecisive === null ? null : { min: 0, max: 100, goodFrom: 45, goodTo: 60, mark: m.winRateDecisive },
    verdict: m.winRateDecisive === null ? 'na' : m.winRateDecisive >= 45 ? 'meets' : m.winRateDecisive >= 40 || (m.payoff ?? 0) >= 2 ? 'borderline' : 'fails',
    action: 'اگر پایین است، ورودهای ضعیف را با تگ «چرا» پیدا و حذف کنید؛ معمولاً یک یا دو نوع ورود بیشتر ضرر را می‌سازند.',
    note: `با سربه‌سرها در مخرج: ${pc(m.winRateAll)} · ${m.scratches} معاملهٔ سربه‌سر${thin(m.n)}`,
    impact: null,
    formula: 'بردها ÷ (بردها + باخت‌ها)؛ معاملهٔ سربه‌سر (|سود خالص| کمتر از کارمزد یا ۲٪ میانگین سود) کنار گذاشته می‌شود.'
  });

  rows.push({
    id: 'payoff', cls: 'performance', title: 'سود متوسط شما چند برابر زیان متوسط است', term: 'نسبت سود به زیان (Payoff ratio)',
    value: m.payoff, display: ratio(m.payoff), benchmark: '۱٫۵ یا بیشتر',
    band: m.payoff === null ? null : { min: 0, max: 3, goodFrom: 1.5, goodTo: 3, mark: Math.min(3, m.payoff) },
    verdict: grade(m.payoff, (x) => x >= 1.5, (x) => x >= 1.2),
    action: 'اگر پایین است، زیان‌ها را کوچک‌تر کنید (استاپ نزدیک‌تر، اندازه از فاصلهٔ استاپ)، نه اینکه دنبال سود بزرگ‌تر بروید.',
    note: m.avgWin !== null && m.avgLoss !== null ? `میانگین سود ${usd(m.avgWin)} · میانگین زیان ${usd(m.avgLoss)}` : null,
    impact: b.capLosers?.delta && b.capLosers.delta > 0 ? b.capLosers.delta : null,
    formula: 'میانگین سود خالص بردها ÷ قدر مطلق میانگین زیان خالص باخت‌ها'
  });

  const pfSmall = m.profitFactor !== null && m.profitFactor > 3 && m.n < 100;
  rows.push({
    id: 'profitFactor', cls: 'performance', title: 'به‌ازای هر ۱ دلار زیان چند دلار سود کردید', term: 'ضریب سود (Profit factor)',
    value: m.profitFactor, display: ratio(m.profitFactor), benchmark: '۱٫۵+ استاندارد نهادی؛ ۱٫۳ تا ۱٫۵ قابل‌قبول؛ زیر ۱ سیستم بازنده',
    band: m.profitFactor === null ? null : { min: 0, max: 3, goodFrom: 1.5, goodTo: 3, mark: Math.min(3, m.profitFactor) },
    verdict: grade(m.profitFactor, (x) => x >= 1.5, (x) => x >= 1.0),
    action: 'اگر پایین است، تقریباً همیشه راهش کوچک‌کردن زیان‌هاست، نه پیدا کردن بردهای بیشتر.',
    note: pfSmall ? `بالای ۳ روی کمتر از ۱۰۰ معامله معمولاً اثر نمونهٔ کوچک است، نه لبهٔ واقعی.` : thin(m.n) || null,
    impact: null,
    formula: 'جمع سود خالص بردها ÷ جمع قدر مطلق زیان خالص باخت‌ها'
  });

  rows.push({
    id: 'expectancy', cls: 'performance', title: 'هر معامله به‌طور میانگین چقدر برایتان پول ساخت', term: 'امید ریاضی (Expectancy)',
    value: m.expectancy, display: usd(m.expectancy, true), benchmark: 'مثبت بعد از کارمزد و پایدار در ماه‌های مختلف',
    band: null,
    verdict: m.expectancy === null ? 'na' : m.expectancy <= 0 ? 'fails' : m.months >= 2 && m.monthsPositive / m.months < 0.6 ? 'borderline' : 'meets',
    action: 'اگر منفی است، تا مثبت شدنش حجم را کوچک کنید؛ معاملهٔ بیشتر با امید منفی فقط ضرر را سریع‌تر می‌کند.',
    note: `${m.monthsPositive} از ${m.months} ماه مثبت${m.expectancyPerMonth !== null ? ` · ماهانه حدود ${usd(m.expectancyPerMonth, true)}` : ''}${m.expectancyPctNotional !== null ? ` · ${pc(m.expectancyPctNotional)} از اندازهٔ معمول پوزیشن` : ''}`,
    impact: null,
    formula: 'سود خالص کل ÷ تعداد معاملات = (نرخ برد × میانگین سود) − (نرخ باخت × میانگین زیان)'
  });

  rows.push({
    id: 'maxDrawdown', cls: 'performance', title: 'بیشترین افت از قله تا دره', term: 'بیشترین افت سرمایه (Max drawdown)',
    value: m.maxDrawdownPct, display: m.maxDrawdownPct !== null ? `${pc(m.maxDrawdownPct)} · ${usd(-m.maxDrawdown)}` : usd(-m.maxDrawdown),
    benchmark: 'زیر ۱۰٪ حساب',
    band: m.maxDrawdownPct === null ? null : { min: 0, max: 30, goodFrom: 0, goodTo: 10, mark: Math.min(30, m.maxDrawdownPct) },
    verdict: m.maxDrawdownPct === null ? 'na' : m.maxDrawdownPct < 10 ? 'meets' : m.maxDrawdownPct < 20 ? 'borderline' : 'fails',
    action: 'اگر بالاست، حد زیان روزانه و هفتگی بگذارید و بعد از رسیدن به آن، تا روز/هفتهٔ بعد معامله نکنید.',
    note: m.accountSize === null ? 'برای درصد، اندازهٔ حساب لازم است (تنظیمات یا موجودی حساب‌ها).' : null,
    impact: null,
    formula: 'بزرگ‌ترین فاصلهٔ قله تا درهٔ منحنی سود خالص تجمعی (بر اساس زمان بستن) ÷ (اندازهٔ حساب + قله)'
  });

  rows.push({
    id: 'dailyLoss', cls: 'performance', title: 'بدترین روز شما', term: 'بیشترین زیان روزانه (Daily max drawdown)',
    value: m.worstDayPct, display: m.worstDay !== null ? `${usd(m.worstDay)}${m.worstDayPct !== null ? ` · ${pc(m.worstDayPct)}` : ''}` : '—',
    benchmark: 'حد زیان روزانهٔ حرفه‌ای ۴ تا ۵٪ حساب',
    band: m.worstDayPct === null ? null : { min: 0, max: 15, goodFrom: 0, goodTo: 5, mark: Math.min(15, Math.abs(Math.min(0, m.worstDayPct))) },
    verdict: m.worstDayPct === null ? 'na' : -m.worstDayPct <= 5 ? 'meets' : -m.worstDayPct <= 8 ? 'borderline' : 'fails',
    action: 'اگر بالاست، بعد از زیان روزانه‌ای برابر حد روزانه، تا فردا هیچ معامله‌ای باز نکنید.',
    note: m.accountSize === null ? 'برای درصد، اندازهٔ حساب لازم است.' : m.worstDayKey ? `روز ${m.worstDayKey}` : null,
    impact: null,
    formula: 'کمترین جمع سود خالص در یک روز (به وقت محلی) ÷ اندازهٔ حساب'
  });

  rows.push({
    id: 'recovery', cls: 'performance', title: 'سود کل چند برابر بدترین افت است', term: 'ضریب بازیابی (Recovery factor)',
    value: m.recoveryFactor, display: ratio(m.recoveryFactor), benchmark: '۲ یا بیشتر',
    band: m.recoveryFactor === null ? null : { min: -1, max: 4, goodFrom: 2, goodTo: 4, mark: Math.max(-1, Math.min(4, m.recoveryFactor)) },
    verdict: grade(m.recoveryFactor, (x) => x >= 2, (x) => x >= 1),
    action: 'اگر پایین است، یعنی یک دورهٔ بد سود چند ماه را می‌بلعد؛ اندازهٔ معامله را در رشته‌های باخت کم کنید.',
    note: null, impact: null, formula: 'سود خالص کل ÷ بیشترین افت سرمایه (دلاری)'
  });

  const fees = m.feesKnown ? m.feeDragPct : null;
  rows.push({
    id: 'feeDrag', cls: 'performance', title: 'چه سهمی از سود ناخالص را کارمزد برد', term: 'فشار کارمزد (Fee drag)',
    value: fees, display: pc(fees), benchmark: 'زیر ۱۵ تا ۲۰٪ سود ناخالص؛ اسکالپرها معمولاً لبه‌شان را همین‌جا می‌بازند',
    band: fees === null ? null : { min: 0, max: 60, goodFrom: 0, goodTo: 15, mark: Math.min(60, fees) },
    verdict: fees === null ? 'na' : fees <= 15 ? 'meets' : fees <= 25 ? 'borderline' : 'fails',
    action: 'اگر بالاست، سفارش لیمیت (میکر) بگذارید و تعداد معاملات کوتاه‌مدت را کم کنید.',
    note: !m.feesKnown ? 'کارمزد بعضی معاملات گزارش نشده.' : `کل کارمزد ${usd(m.fees)}`,
    impact: fees !== null && fees > 15 ? (m.fees - 0.15 * (m.fees / (fees / 100))) : null,
    formula: 'کل کارمزد ÷ جمع سود قیمتی معاملات سودده (قبل از کارمزد)'
  });

  const dayStyle = style === 'scalp' || style === 'day';
  rows.push({
    id: 'tradesPerDay', cls: dayStyle ? 'behaviour' : 'context', title: 'چند معامله در هر روز فعال', term: 'تعداد معامله در روز',
    value: m.tradesPerActiveDay, display: m.tradesPerActiveDay === null ? '—' : m.tradesPerActiveDay.toFixed(1),
    benchmark: 'قبول‌شده‌های Prop حدود ۳٫۲ در روز؛ ردشده‌ها حدود ۶٫۸ (آمار مرجع بدون منبع مستقل)',
    band: m.tradesPerActiveDay === null || !dayStyle ? null : { min: 0, max: 10, goodFrom: 0, goodTo: 3.2, mark: Math.min(10, m.tradesPerActiveDay) },
    verdict: m.tradesPerActiveDay === null ? 'na' : !dayStyle ? 'notApplicable' : m.tradesPerActiveDay <= 3.2 ? 'meets' : m.tradesPerActiveDay <= 6.8 ? 'borderline' : 'fails',
    action: 'اگر بالاست، سقف معامله در روز بگذارید و بعد از آن پلتفرم را ببندید.',
    note: dayStyle ? null : style ? `سبک شما «${STYLE_FA[style]}» است؛ این معیار برای معامله‌گر روزانه است.` : null,
    impact: b.overtrading && b.overtrading.delta > 0 ? b.overtrading.delta : null,
    formula: 'تعداد معاملات ÷ تعداد روزهایی که حداقل یک معامله بسته شده'
  });

  rows.push({
    id: 'consistency', cls: 'performance', title: 'سهم بهترین روز از کل سود', term: 'ثبات (Consistency)',
    value: m.bestDayShare, display: pc(m.bestDayShare), benchmark: 'هیچ روزی بیش از ۳۰٪ سود کل نباشد',
    band: m.bestDayShare === null ? null : { min: 0, max: 100, goodFrom: 0, goodTo: 30, mark: Math.min(100, m.bestDayShare) },
    verdict: m.bestDayShare === null ? (m.netPnl <= 0 && m.n ? 'notApplicable' : 'na') : m.bestDayShare <= 30 ? 'meets' : m.bestDayShare <= 50 ? 'borderline' : 'fails',
    action: 'اگر بالاست، سود شما به یک روز خوش‌شانس وابسته است؛ قبل از بزرگ‌کردن حجم، ثبات را در ماه‌های بیشتر ثابت کنید.',
    note: m.netPnl <= 0 && m.n ? 'وقتی سود خالص مثبت نیست معنا ندارد.' : m.bestDayKey ? `بهترین روز: ${m.bestDayKey}` : null,
    impact: null, formula: 'سود خالص بهترین روز ÷ سود خالص کل'
  });

  rows.push({
    id: 'riskPerTrade', cls: 'behaviour', title: 'هر معامله چند درصد حساب را به خطر انداخت', term: 'ریسک هر معامله (Risk per trade)',
    value: m.riskPctAvg, display: pc(m.riskPctAvg), benchmark: '۰٫۵ تا ۱٪؛ ردشده‌های Prop به‌طور میانگین ۲ تا ۳٪',
    band: m.riskPctAvg === null ? null : { min: 0, max: 5, goodFrom: 0.5, goodTo: 1, mark: Math.min(5, m.riskPctAvg) },
    verdict: m.riskPctAvg === null ? 'na' : m.riskPctAvg <= 1 ? 'meets' : m.riskPctAvg <= 2 ? 'borderline' : 'fails',
    action: 'اگر بالاست، اندازه را از فرمول «ریسک مجاز ÷ فاصلهٔ استاپ» بگیرید (برگهٔ برنامه این را حساب می‌کند).',
    note: m.riskPctAvg === null ? 'نیاز به برنامهٔ دارای استاپ متصل به معامله و اندازهٔ حساب دارد.' : `بر پایهٔ ${m.riskPctCount} معاملهٔ برنامه‌دار${thin(m.riskPctCount)}`,
    impact: null, formula: 'اندازهٔ واقعی × |ورود − استاپ برنامه| ÷ اندازهٔ حساب'
  });

  rows.push({
    id: 'rMultiple', cls: 'behaviour', title: 'میانگین نتیجه بر حسب ریسک برنامه', term: 'R میانگین (R-multiple)',
    value: m.avgR, display: m.avgR === null ? '—' : `${m.avgR.toFixed(2)}R`, benchmark: 'مثبت؛ هر معامله ≥ −۱R',
    band: m.avgR === null ? null : { min: -2, max: 3, goodFrom: 0.3, goodTo: 3, mark: Math.max(-2, Math.min(3, m.avgR)) },
    verdict: m.avgR === null ? 'na' : m.avgR >= 0.3 ? 'meets' : m.avgR > 0 ? 'borderline' : 'fails',
    action: 'اگر پایین است، یا زود خارج می‌شوید یا استاپ را رعایت نمی‌کنید؛ پراکندگی R را در جزئیات ببینید.',
    note: m.avgR === null ? 'برای R، قبل از معامله برنامه با قیمت استاپ ثبت کنید.' : `بر پایهٔ ${m.rCount} معامله${thin(m.rCount)}`,
    impact: null, formula: 'سود خالص ÷ ریسک دلاری برنامه'
  });

  rows.push({
    id: 'stops', cls: 'behaviour', title: 'آیا زیان از استاپ برنامه بیشتر شد', term: 'نظم استاپ (Stop discipline)',
    value: b.stops ? (b.stops.violations / b.stops.planned) * 100 : null,
    display: b.stops ? `${b.stops.violations} از ${b.stops.planned}` : '—', benchmark: 'صفر معامله با زیانی بیش از ۱۱۰٪ ریسک برنامه',
    band: null,
    verdict: !b.stops ? 'na' : b.stops.violations === 0 ? 'meets' : b.stops.violations / b.stops.planned <= 0.1 ? 'borderline' : 'fails',
    action: 'اگر نقض دارید، استاپ را همراه سفارش ورود در صرافی ثبت کنید و هرگز دورتر نبرید.',
    note: b.stops ? `اضافهٔ زیان ${usd(-b.stops.excess)}` : 'نیاز به برنامهٔ دارای استاپ متصل به معامله.',
    impact: b.stops?.excess || null, formula: 'معاملاتی که زیان خالصشان از ۱٫۱ × ریسک برنامه بیشتر است'
  });

  rows.push({
    id: 'revenge', cls: 'behaviour', title: 'ورود عجولانه بعد از ضرر', term: 'نشانهٔ معاملهٔ انتقامی',
    value: b.revenge?.fasterShare ?? null,
    display: b.revenge ? `${pc(b.revenge.fasterShare)} سریع‌تر از معمول` : '—', benchmark: 'معاملهٔ بعد از ضرر نه سریع‌تر، نه بزرگ‌تر، نه بدتر از حالت عادی',
    band: null,
    verdict: !b.revenge ? 'na' : b.revenge.cost === 0 ? 'meets' : b.revenge.cost < 0.1 * Math.max(1, m.grossLoss) ? 'borderline' : 'fails',
    action: 'اگر نشانه دارید، بعد از هر ضرر یک وقفهٔ اجباری بگذارید (تعهد «وقفه بعد از ضرر» در مرور هفتگی خودکار بررسی می‌شود).',
    note: b.revenge ? `${b.revenge.n} معامله بعد از ضرر · نرخ برد ${pc(b.revenge.winRate)} در برابر ${pc(b.revenge.baseWinRate)} معمول · اندازه ${ratio(b.revenge.sizeRatio)} برابر` : 'حداقل ۳ معامله بعد از ضرر لازم است.',
    impact: b.revenge?.cost || null, formula: 'معاملاتی که بعد از یک باخت، زودتر از میانهٔ فاصلهٔ بین معاملات باز شده‌اند'
  });

  rows.push({
    id: 'holding', cls: 'behaviour', title: 'ضررده را بیشتر از سودده نگه می‌دارید؟', term: 'عدم‌تقارن زمان نگه‌داری',
    value: b.holding?.ratio ?? null, display: b.holding?.ratio ? `${b.holding.ratio.toFixed(1)} برابر` : '—', benchmark: 'زمان نگه‌داری ضررده ≤ ۱٫۵ برابر سودده',
    band: b.holding?.ratio ? { min: 0, max: 5, goodFrom: 0, goodTo: 1.5, mark: Math.min(5, b.holding.ratio) } : null,
    verdict: !b.holding?.ratio ? 'na' : b.holding.ratio <= 1.5 ? 'meets' : b.holding.ratio <= 3 ? 'borderline' : 'fails',
    action: 'اگر بالاست، سقف زمانی برای هر معامله بگذارید؛ ضرردهٔ کهنه را امید نگه ندارد.',
    note: null, impact: b.holding?.cost || null, formula: 'میانگین زمان باز ماندن باخت‌ها ÷ میانگین زمان باز ماندن بردها'
  });

  rows.push({
    id: 'sizeCv', cls: 'behaviour', title: 'اندازهٔ معاملاتتان چقدر ثابت است', term: 'ضریب تغییرات اندازه',
    value: m.sizeCv, display: ratio(m.sizeCv), benchmark: 'زیر ۰٫۵ (اندازه از قاعدهٔ ریسک می‌آید، نه از حس)',
    band: m.sizeCv === null ? null : { min: 0, max: 2, goodFrom: 0, goodTo: 0.5, mark: Math.min(2, m.sizeCv) },
    verdict: grade(m.sizeCv, (x) => x <= 0.5, (x) => x <= 1),
    action: 'اگر بالاست، اندازه را با فرمول ریسک ثابت بگیرید؛ نوسان اندازه یعنی تصمیم احساسی.',
    note: null, impact: null, formula: 'انحراف معیار ارزش اسمی بیشینهٔ پوزیشن ÷ میانگین آن'
  });

  rows.push({
    id: 'planCoverage', cls: 'behaviour', title: 'چند درصد معاملات برنامهٔ قبلی داشتند', term: 'پوشش برنامه',
    value: planCoverage, display: pc(planCoverage), benchmark: '۱۰۰٪ — هیچ ورودی بدون برنامهٔ نوشته‌شده',
    band: planCoverage === null ? null : { min: 0, max: 100, goodFrom: 90, goodTo: 100, mark: planCoverage },
    verdict: planCoverage === null ? 'na' : planCoverage >= 90 ? 'meets' : planCoverage >= 60 ? 'borderline' : 'fails',
    action: 'اگر پایین است، قبل از هر ورود برگهٔ «برنامهٔ معامله» را پر کنید؛ ۶۰ ثانیه وقت می‌برد.',
    note: null, impact: null, formula: 'معاملات متصل به برنامه ÷ همهٔ معاملات'
  });

  rows.push({
    id: 'ruleAdherence', cls: 'behaviour', title: 'چند درصد معاملات طبق قوانین خودتان بود', term: 'پایبندی به قوانین',
    value: ruleAdherence?.pct ?? null, display: ruleAdherence ? `${pc(ruleAdherence.pct)} (${ruleAdherence.n} علامت‌خورده)` : '—',
    benchmark: '۱۰۰٪',
    band: ruleAdherence ? { min: 0, max: 100, goodFrom: 90, goodTo: 100, mark: ruleAdherence.pct } : null,
    verdict: !ruleAdherence ? 'na' : ruleAdherence.pct >= 90 ? 'meets' : ruleAdherence.pct >= 75 ? 'borderline' : 'fails',
    action: 'اگر پایین است، معاملات «خلاف قانون» را در مرور هفتگی یکی‌یکی ببینید: کدام انگیزه و کدام قانون جلویش را می‌گرفت؟',
    note: ruleAdherence ? null : 'در فهرست معاملات، «طبق قوانینم بود؟» را علامت بزنید.',
    impact: null, formula: 'معاملات علامت‌خورده «طبق قانون» ÷ همهٔ علامت‌خورده‌ها'
  });

  return rows;
}

/** مرتب‌سازی کارنامه: اثر دلاری (بدترین اول)، بعد بدون قیمت؛ هر کلاس جدا */
export function rankRows(rows: readonly ScoreRow[]): ScoreRow[] {
  const weight: Record<Verdict, number> = { fails: 0, borderline: 1, meets: 2, na: 3, notApplicable: 4 };
  return [...rows].sort((a, b) => {
    const ai = a.impact ?? -1, bi = b.impact ?? -1;
    if ((ai > 0) !== (bi > 0)) return ai > 0 ? -1 : 1;
    if (ai > 0 && bi > 0 && ai !== bi) return bi - ai;
    return weight[a.verdict] - weight[b.verdict];
  });
}

export type Confidence = 'hypothesis' | 'low' | 'medium' | 'good';
export const CONFIDENCE_FA: Record<Confidence, string> = {
  hypothesis: 'نمونه خیلی کوچک — هر یافته فرضیه است، نه حکم',
  low: 'اعتماد کم (کمتر از ۳۰ معامله)',
  medium: 'اعتماد متوسط',
  good: 'نمونهٔ کافی'
};
export function confidenceOf(n: number): Confidence {
  return n < 20 ? 'hypothesis' : n < 30 ? 'low' : n < 100 ? 'medium' : 'good';
}

export type StatusBand = 'pass' | 'conditions' | 'fail' | 'insufficient';
export const STATUS_FA: Record<StatusBand, string> = {
  pass: 'در حال حاضر ارزیابی Prop را قبول می‌شد',
  conditions: 'قبول با شرط',
  fail: 'در حال حاضر ارزیابی Prop را قبول نمی‌شد',
  insufficient: 'برای حکم دادهٔ کافی نیست'
};

/** حکم کلی به سبک میز تأمین سرمایه + یک جملهٔ اصلی */
export function overallVerdict(m: CoreMetrics, rows: readonly ScoreRow[]): { band: StatusBand; reason: string; headline: string } {
  if (m.n < 10) return { band: 'insufficient', reason: `فقط ${m.n} معاملهٔ بسته‌شدهٔ کامل در این دفتر هست.`, headline: m.n ? 'هنوز زود است؛ بگذارید داده جمع شود و تگ «چرا» را از همین حالا بزنید.' : 'هنوز معاملهٔ بسته‌شده‌ای در این دفتر نیست.' };
  const fails = rows.filter((r) => r.verdict === 'fails' && (r.cls === 'performance' || r.cls === 'behaviour'));
  const core = ['expectancy', 'profitFactor', 'maxDrawdown'];
  const coreFail = fails.some((r) => core.includes(r.id));
  const band: StatusBand = coreFail ? 'fail' : fails.length ? 'conditions' : 'pass';
  const reason = coreFail
    ? `${fails.filter((r) => core.includes(r.id)).map((r) => r.term).join('، ')} زیر استاندارد است.`
    : fails.length
      ? `مشکل اصلی: ${fails.slice(0, 2).map((r) => r.term).join('، ')}.`
      : 'معیارهای اصلی در حد استاندارد است.';
  let headline: string;
  if (m.netPnl <= 0) headline = m.payoff !== null && m.payoff < 1 ? 'در ضرر هستید و زیان متوسط از سود متوسط بزرگ‌تر است؛ تا این عوض نشود، انتخاب بهتر ورود هم کافی نیست.' : 'در ضرر هستید؛ قبل از هر چیز اندازه را کوچک کنید و نشتی اول را ببندید.';
  else if (m.maxDrawdown > m.netPnl) headline = 'سودده هستید، اما یک دورهٔ بد به اندازهٔ بدترین افتتان کل سود را پاک می‌کند.';
  else if (m.top5Share !== null && m.top5Share > 80) headline = 'سودده هستید، ولی بیشتر سود از ۵ معامله آمده؛ هنوز معلوم نیست لبه واقعی است یا شانس.';
  else headline = 'سودده و با افت کنترل‌شده؛ حالا ثبات را در ماه‌های بیشتر ثابت کنید.';
  return { band, reason, headline };
}

/** «اول این را درست کن» + سه بعدی + سه قانون از دادهٔ خود کاربر */
export function priorities(leaks: readonly Leak[]): { first: Leak | null; next: Leak[]; rules: string[] } {
  const sorted = [...leaks].sort((a, b) => b.cost - a.cost);
  return { first: sorted[0] ?? null, next: sorted.slice(1, 4), rules: sorted.slice(0, 3).map((l) => l.rule) };
}
