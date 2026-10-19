/**
 * متن ساده برای کاربر غیرحرفه‌ای: واژه‌نامه، توضیح یک‌خطی هر استراتژی و
 * خلاصهٔ پنج‌بخشی نتیجه. همهٔ اعداد از خروجی موتور می‌آید؛ اینجا هیچ عددی ساخته نمی‌شود.
 */
import { PREMIUM_SELLER, STRATEGY_FA, type BuiltStrategy, type IvRegime, type RiskProfile, type StrategyId, type View } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';

/** واژه‌های تخصصی به زبان ساده (نام فارسی اول، اصطلاح انگلیسی در پرانتز) */
export const GLOSSARY: { term: string; plain: string }[] = [
  { term: 'آپشن (Option)', plain: 'قراردادی که به خریدار حق می‌دهد (نه اجبار) دارایی را تا تاریخ مشخصی با قیمت از پیش تعیین‌شده بخرد یا بفروشد.' },
  { term: 'اختیار خرید (Call)', plain: 'وقتی قیمت بالا برود ارزشمندتر می‌شود.' },
  { term: 'اختیار فروش (Put)', plain: 'وقتی قیمت پایین بیاید ارزشمندتر می‌شود؛ مثل بیمه در برابر ریزش.' },
  { term: 'قیمت توافقی (Strike)', plain: 'قیمتی که قرارداد آپشن بر اساس آن بسته شده است.' },
  { term: 'سررسید (Expiry)', plain: 'روزی که قرارداد تمام و تسویه می‌شود. سررسید Derive ساعت ۸ صبح به وقت جهانی (UTC) است.' },
  { term: 'حق آپشن (Premium)', plain: 'پولی که خریدار آپشن می‌پردازد و فروشنده دریافت می‌کند.' },
  { term: 'نقطهٔ سربه‌سر (Breakeven)', plain: 'قیمتی که در سررسید، نه سود دارید نه زیان.' },
  { term: 'نوسان مورد انتظار (IV)', plain: 'نوسانی که بازار در قیمت آپشن‌ها لحاظ کرده است. IV بالا یعنی آپشن‌ها گران‌اند.' },
  { term: 'نوسان واقعی اخیر (HV)', plain: 'نوسانی که قیمت در ۳۰ روز گذشته واقعاً داشته است.' },
  { term: 'دلتا (Delta)', plain: 'نشان می‌دهد با تغییر قیمت دارایی اصلی، ارزش موقعیت شما تقریباً چقدر تغییر می‌کند. با تغییر قیمت، خود این عدد هم تغییر می‌کند.' },
  { term: 'اثر گذر زمان (Theta)', plain: 'تغییر تقریبی ارزش موقعیت در هر روز، اگر قیمت و نوسان ثابت بمانند. مثبت یعنی گذر زمان به نفع شماست.' },
  { term: 'حساسیت به نوسان (Vega)', plain: 'تغییر تقریبی ارزش موقعیت اگر IV یک واحد بالا برود.' },
  { term: 'فاصلهٔ خرید و فروش (Spread)', plain: 'فاصلهٔ بهترین قیمت خرید (Bid) و بهترین قیمت فروش (Ask). فاصلهٔ زیاد یعنی ورود و خروج گران‌تر است.' },
  { term: 'قیمت میانه (Mid)', plain: 'وسط بهترین قیمت خرید و فروش.' },
  { term: 'سفارش با قیمت مشخص (Limit)', plain: 'سفارشی که فقط با قیمتی که خودتان تعیین می‌کنید یا بهتر از آن انجام می‌شود.' },
  { term: 'قراردادهای باز (Open Interest)', plain: 'تعداد قراردادهایی که الان باز هستند. عدد کم یعنی خروج از معامله ممکن است سخت باشد.' },
  { term: 'وثیقه (Margin)', plain: 'مبلغی که صرافی برای باز نگه داشتن موقعیت از حساب شما قفل می‌کند.' },
  { term: 'جابه‌جایی به سررسید بعد (Roll)', plain: 'بستن قرارداد فعلی و باز کردن قرارداد مشابه با سررسید دیرتر.' },
  { term: 'دلتا نوترال (Delta-Neutral)', plain: 'تنظیم موقعیت به‌طوری که تغییرات کوچک قیمت تقریباً روی سود و زیان اثر نگذارد.' },
  { term: 'فاندینگ (Funding)', plain: 'هزینه یا درآمد دوره‌ای قراردادهای دائمی (Perp) که بین خریدارها و فروشنده‌ها رد و بدل می‌شود.' }
];

/** هر استراتژی در یک جملهٔ ساده: کی سود می‌دهد */
export const STRATEGY_PLAIN: Record<StrategyId, string> = {
  long_call: 'اگر قیمت تا سررسید به‌اندازهٔ کافی بالا برود سود می‌کنید؛ بیشترین زیان همان پولی است که پرداخته‌اید.',
  bull_call_spread: 'برای صعود ملایم؛ هزینه کمتر از خرید Call ساده است، اما سود هم سقف دارد.',
  bull_put_spread: 'در شروع پول دریافت می‌کنید؛ اگر قیمت پایین نیاید سود می‌کنید. زیان سقف مشخصی دارد.',
  cash_secured_put: 'در شروع پول دریافت می‌کنید و قبول می‌کنید اگر قیمت پایین آمد، دارایی را با قیمت توافقی بخرید.',
  long_put: 'اگر قیمت تا سررسید به‌اندازهٔ کافی پایین بیاید سود می‌کنید؛ بیشترین زیان همان پولی است که پرداخته‌اید.',
  bear_put_spread: 'برای نزول ملایم؛ هزینه کمتر از خرید Put ساده است، اما سود هم سقف دارد.',
  bear_call_spread: 'در شروع پول دریافت می‌کنید؛ اگر قیمت بالا نرود سود می‌کنید. زیان سقف مشخصی دارد.',
  iron_condor: 'در شروع پول دریافت می‌کنید؛ اگر قیمت تا سررسید در یک بازه بماند سود می‌کنید. زیان در هر دو طرف سقف دارد.',
  iron_butterfly: 'شبیه آیرون کاندور با بازهٔ باریک‌تر؛ دریافتی بیشتر است اما قیمت باید به نقطهٔ وسط نزدیک بماند.',
  short_strangle: 'در شروع پول دریافت می‌کنید؛ اگر قیمت آرام بماند سود می‌کنید. اگر قیمت تند حرکت کند، زیان سقف ندارد.',
  long_straddle: 'اگر قیمت در هر جهت تند حرکت کند سود می‌کنید؛ اگر آرام بماند، پول پرداختی را از دست می‌دهید.',
  long_strangle: 'مثل استرادل ولی ارزان‌تر؛ قیمت باید حرکت بزرگ‌تری داشته باشد تا سود بدهد.',
  covered_call: 'روی دارایی‌ای که دارید درآمد می‌گیرید؛ در عوض اگر قیمت خیلی بالا برود، سود بیشتر از قیمت توافقی را از دست می‌دهید.',
  protective_put: 'بیمه برای دارایی‌ای که دارید؛ اگر قیمت ریزش کند، زیان شما محدود می‌شود.',
  collar: 'برای دارایی‌ای که دارید هم کف زیان می‌گذارد هم سقف سود؛ هزینهٔ بیمه از فروش Call تأمین می‌شود.'
};

export const VIEW_HINT: Record<View, string> = {
  bull: 'فکر می‌کنید قیمت بالا می‌رود.',
  bear: 'فکر می‌کنید قیمت پایین می‌آید.',
  neutral: 'فکر می‌کنید قیمت تا سررسید زیاد تغییر نمی‌کند.',
  unsure: 'نظری درباره جهت قیمت ندارید.'
};

export const RISK_HINT: Record<RiskProfile, string> = {
  conservative: 'زیان احتمالی هر معامله کوچک بماند.',
  moderate: 'ریسک و سود در حد متوسط.',
  aggressive: 'زیان احتمالی بیشتر را برای سود بیشتر می‌پذیرید.'
};

export interface PlainSummaryInput {
  b: BuiltStrategy;
  currency: string;
  capital: number;
  riskCap: number;
  days: number;
  view: View;
  regime: IvRegime | null;
  /** سناریوهای سررسید با همان ردیف‌های جدول قدم ۴ */
  scenarios: { movePct: number; atExpiry: number }[];
  missing: string[];
  wideSpread: boolean;
  lowOi: boolean;
  /** قیمت بخش «بازارها» زنده نیست (Snapshot) */
  priceSnapshot: boolean;
}

export interface PlainSummary {
  result: string;
  meaning: string;
  why: string;
  risk: string[];
  next: string;
}

/** مقدار مطلق؛ جهت سود یا زیان در خود جمله گفته می‌شود */
const usd = (v: number) => {
  const a = Math.abs(v);
  return `${toFaDigits((a >= 100 ? Math.round(a) : Math.round(a * 100) / 100).toLocaleString('en-US'))} دلار`;
};
const pct = (v: number) => `${toFaDigits(Math.round(v))}٪`;
const price = (v: number) => `${toFaDigits(Math.round(v).toLocaleString('en-US'))} دلار`;

/** خلاصهٔ پنج‌بخشی: نتیجه، معنی، دلیل، خطر، قدم بعدی — فقط از اعداد محاسبه‌شده */
export function plainSummary(x: PlainSummaryInput): PlainSummary {
  const b = x.b;
  const stats = b.stats;
  const name = STRATEGY_FA[b.id];
  const seller = PREMIUM_SELLER.has(b.id);
  const days = toFaDigits(Math.max(0, Math.round(x.days)));

  const lossText = stats.maxLoss === null ? 'زیان احتمالی سقف ندارد' : `بیشترین زیان تقریبی ${usd(stats.maxLoss)} است`;
  const profitText = stats.maxProfit === null ? 'سود احتمالی سقف ندارد' : `بیشترین سود تقریبی ${usd(stats.maxProfit)} است`;
  const result = `استراتژی پیشنهادی «${name}» است. ${lossText} و ${profitText}.`;

  const premium = stats.netPremium >= 0 ? `در شروع حدود ${usd(stats.netPremium)} دریافت می‌کنید.` : `در شروع حدود ${usd(stats.netPremium)} پرداخت می‌کنید.`;
  const be = stats.breakevens.length === 2
    ? `اگر قیمت ${x.currency} در سررسید (${days} روز دیگر) بین ${price(stats.breakevens[0]!)} و ${price(stats.breakevens[1]!)} باشد، سود می‌کنید.`
    : stats.breakevens.length === 1
      ? `نقطهٔ سربه‌سر در سررسید (${days} روز دیگر) حدود ${price(stats.breakevens[0]!)} است.`
      : '';
  const pop = stats.pop === null ? '' : ` احتمال تقریبی سود ${pct(stats.pop * 100)} است؛ این عدد از قیمت فعلی آپشن‌ها به دست آمده و پیش‌بینی نیست.`;
  const meaning = `${premium} ${be}${pop}`.trim();

  const ivWhy = x.regime === 'rich'
    ? 'آپشن‌ها الان نسبت به نوسان واقعی اخیر گران‌اند، پس فروش آپشن و دریافت پول در شروع به‌صرفه‌تر بود.'
    : x.regime === 'cheap'
      ? 'آپشن‌ها الان نسبت به نوسان واقعی اخیر ارزان‌اند، پس خرید آپشن به‌صرفه‌تر بود.'
      : 'قیمت آپشن‌ها نزدیک نوسان واقعی اخیر است.';
  const viewWhy = { bull: 'شما دیدگاه صعودی انتخاب کردید', bear: 'شما دیدگاه نزولی انتخاب کردید', neutral: 'شما دیدگاه خنثی انتخاب کردید', unsure: 'شما جهت قیمت را نامطمئن انتخاب کردید' }[x.view];
  // ردیفی که بیشترین اثر را دارد
  const extreme = x.scenarios.reduce<{ movePct: number; atExpiry: number } | null>((m, r) => (m === null || Math.abs(r.atExpiry) > Math.abs(m.atExpiry) ? r : m), null);
  const extremeText = extreme && extreme.movePct !== 0
    ? ` بیشترین اثر را حرکت قیمت دارد: اگر قیمت ${pct(Math.abs(extreme.movePct))} ${extreme.movePct > 0 ? 'بالا برود' : 'پایین بیاید'}، در سررسید تقریباً ${usd(extreme.atExpiry)} ${extreme.atExpiry >= 0 ? 'سود' : 'زیان'} دارید.`
    : '';
  const why = `${viewWhy}. ${ivWhy} اندازهٔ معامله طوری انتخاب شد که زیان آن از سقف ریسک شما (${usd(x.riskCap)} از ${usd(x.capital)}) بیشتر نشود.${extremeText}`;

  const risk: string[] = [];
  if (b.unlimitedLoss) risk.push('⚠️ این استراتژی پوشش ندارد و زیانش می‌تواند از کل سرمایهٔ این معامله بیشتر شود.');
  if (b.belowMinimum) risk.push('حتی کوچک‌ترین اندازهٔ قرارداد Derive از سقف ریسک شما بیشتر است؛ اعداد برای همین کوچک‌ترین اندازه حساب شده‌اند.');
  if (x.wideSpread) risk.push('فاصلهٔ قیمت خرید و فروش زیاد است؛ ممکن است با قیمتی بدتر از عدد محاسبه‌شده وارد یا خارج شوید.');
  if (x.lowOi) risk.push('تعداد قراردادهای باز کم است؛ خروج پیش از سررسید ممکن است سخت باشد.');
  if (x.missing.length) risk.push(`بخشی از داده‌ها در دسترس نبود: ${x.missing.join('، ')}. نتیجه با دقت کمتری حساب شده است.`);
  if (x.priceSnapshot) risk.push('قیمت بخش «بازارها» زنده نیست و از آخرین ذخیره خوانده شده است.');
  risk.push(seller
    ? 'اگر قیمت تند حرکت کند یا نوسان بازار بالا برود، ارزش موقعیت ممکن است پیش از سررسید به ضرر شما تغییر کند.'
    : 'اگر قیمت حرکت نکند یا نوسان بازار پایین بیاید، ارزش آپشن با گذشت زمان کم می‌شود.');
  risk.push('همهٔ اعداد تقریبی‌اند و با تغییر قیمت، نوسان و زمان تغییر می‌کنند. وثیقهٔ واقعی را خود Derive تعیین می‌کند.');

  const next = b.unlimitedLoss
    ? 'یکی از استراتژی‌های جایگزین با زیان محدود را از فهرست بالا انتخاب کنید و اعدادش را مقایسه کنید.'
    : b.belowMinimum
      ? 'سرمایه را بیشتر کنید یا تحمل ریسک را تغییر دهید، یا استراتژی جایگزین را ببینید.'
      : x.missing.length
        ? 'چند دقیقهٔ دیگر صفحه را تازه کنید تا داده‌های کامل‌تر خوانده شود.'
        : 'به قدم بعد بروید و جدول سناریوها و برنامهٔ خروج (حد سود و حد ضرر) را ببینید.';

  return { result, meaning, why, risk, next };
}
