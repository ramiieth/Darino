/**
 * محتوای استراتژی‌های آربیتراژ فاندینگ — فقط داده.
 * استراتژی جدید = یک آیتم به STRATEGIES (پاها، پیش‌فرض‌ها، ریسک‌ها، سناریوها)؛ UI و موتور تغییری نمی‌خواهند.
 * عددهای سناریو محاسبه می‌شوند (evaluateStrategy روی پیش‌فرض‌ها + StressSpec)، نه دستی نوشته.
 */
import type {
  LegCosts,
  LegSpec,
  NumericInputKey,
  ScenarioKind,
  Severity,
  StrategyDef,
  StrategyInputs,
  StrategyWarning,
  StressSpec
} from '@/features/calculators/domain';

export type StrategyId = 'spotPerp' | 'perpPerp' | 'lendShort' | 'reverseSpotPerp' | 'basisFutures' | 'lstShort' | 'inverseShort';
export type RiskKind = 'liquidation' | 'counterparty' | 'smartContract' | 'fundingFlip' | 'basis' | 'execution' | 'transfer' | 'adl' | 'depeg';

export interface LegContent extends LegSpec {
  label: string;
  venueType: string;
}

export interface StrategyScenario {
  kind: ScenarioKind;
  title: string;
  note: string;
  stress: StressSpec;
  /** مقدار مطلق ورودی‌ها در این سناریو (مثلاً بازهٔ فاندینگ متفاوت) */
  overrides?: Partial<StrategyInputs>;
}

export interface StrategyContent extends StrategyDef {
  id: StrategyId;
  name: string;
  nameEn: string;
  summary: string;
  worksWhen: string[];
  failsWhen: string[];
  entry: string[];
  exits: string[];
  legs: readonly [LegContent, LegContent];
  /** ورودی‌های مخصوص این استراتژی (ورودی‌های مشترک همیشه نمایش داده می‌شوند) */
  inputs: NumericInputKey[];
  /** ورودی سطرهای جدول حساسیت */
  sensitivityKey: NumericInputKey;
  costs: string[];
  risks: { kind: RiskKind; severity: Severity; note: string }[];
  capitalNote: string;
  scenarios: StrategyScenario[];
  checklist: string[];
}

export const RISK_LABEL: Record<RiskKind, string> = {
  liquidation: 'لیکوئیدیشن',
  counterparty: 'صرافی / طرف مقابل',
  smartContract: 'اسمارت‌کانترکت',
  fundingFlip: 'برگشت فاندینگ',
  basis: 'گسترش بیسیس',
  execution: 'اجرا / اسلیپیج',
  transfer: 'تأخیر انتقال',
  adl: 'ADL',
  depeg: 'دیپگ'
};

export const SEVERITY_LABEL: Record<Severity, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
export const SCENARIO_LABEL: Record<ScenarioKind, string> = { best: 'بهترین', base: 'پایه', stress: 'استرس' };

export const WARNING_TEXT: Record<StrategyWarning, string> = {
  netNegative: 'سود خالص منفی است؛ هزینه‌ها از درآمد بیشترند.',
  breakEvenBeyondHold: 'سربه‌سر شدن بیشتر از مدت نگهداری طول می‌کشد (یا هرگز رخ نمی‌دهد).',
  liquidationNear: 'فاصلهٔ لیکوئیدیشن کمتر از ۱۵٪ است؛ اهرم را کم یا بافر مارجین را زیاد کنید.',
  intervalMismatch: 'بازهٔ فاندینگ دو صرافی متفاوت است؛ پرداخت‌ها هم‌زمان تسویه نمی‌شوند و اسپرد لحظه‌ای گمراه‌کننده است.',
  capitalShortfall: 'نوتیونال واردشده بیشتر از توان سرمایه است؛ بازده روی سرمایهٔ قفل‌شده محاسبه شد.',
  liquidated: 'در این سناریو یک پا لیکویید می‌شود؛ وثیقهٔ آن پا از دست رفته و هج شکسته است.'
};

/** برچسب و واحد فیلدهای عددی — فرم از روی همین ساخته می‌شود */
export const FIELD_META: Record<NumericInputKey, { label: string; suffix: string }> = {
  capital: { label: 'سرمایهٔ کل', suffix: 'دلار' },
  leverage: { label: 'اهرم پای مشتقه', suffix: 'x' },
  holdDays: { label: 'مدت نگهداری', suffix: 'روز' },
  entryPrice: { label: 'قیمت ورود دارایی', suffix: 'دلار' },
  fundingA: { label: 'فاندینگ صرافی A (هر بازه)', suffix: '٪' },
  intervalA: { label: 'بازهٔ فاندینگ A', suffix: 'ساعت' },
  fundingB: { label: 'فاندینگ صرافی B (هر بازه)', suffix: '٪' },
  intervalB: { label: 'بازهٔ فاندینگ B', suffix: 'ساعت' },
  lendApy: { label: 'APY لندینگ', suffix: '٪' },
  borrowApr: { label: 'APR قرض', suffix: '٪' },
  stakeApy: { label: 'APY استیکینگ', suffix: '٪' },
  futuresBasisPct: { label: 'بیسیس فیوچرز تا سررسید', suffix: '٪' },
  daysToExpiry: { label: 'روز تا سررسید', suffix: 'روز' },
  basisEntryPct: { label: 'بیسیس ورود (شورت − لانگ)', suffix: '٪' },
  basisExitPct: { label: 'بیسیس خروج', suffix: '٪' },
  transferUsd: { label: 'انتقال / برداشت', suffix: 'دلار' },
  gasUsd: { label: 'گس / شبکه', suffix: 'دلار' },
  rebalanceUsd: { label: 'بالانس مجدد', suffix: 'دلار' },
  marginBufferPct: { label: 'بافر مارجین', suffix: '٪' },
  maintenancePct: { label: 'مارجین نگهداری', suffix: '٪' },
  riskFreeApr: { label: 'بازده بدون ریسک (فرصت)', suffix: '٪' }
};

export const COMMON_FIELDS: NumericInputKey[] = ['capital', 'leverage', 'holdDays', 'entryPrice'];
export const COST_FIELDS: NumericInputKey[] = ['transferUsd', 'gasUsd', 'rebalanceUsd', 'marginBufferPct', 'maintenancePct', 'riskFreeApr'];

const cost = (fee: number, slip = 0.03): LegCosts => ({ feeEntryPct: fee, feeExitPct: fee, slipEntryPct: slip, slipExitPct: slip });

export const BASE_INPUTS: StrategyInputs = {
  capital: 10_000,
  leverage: 3,
  notional: null,
  holdDays: 30,
  entryPrice: 3000,
  fundingA: 0.01,
  intervalA: 8,
  fundingB: 0,
  intervalB: 8,
  lendApy: 4,
  borrowApr: 8,
  stakeApy: 3,
  futuresBasisPct: 2,
  daysToExpiry: 90,
  basisEntryPct: 0,
  basisExitPct: 0,
  transferUsd: 10,
  gasUsd: 5,
  rebalanceUsd: 0,
  marginBufferPct: 10,
  maintenancePct: 0.5,
  riskFreeApr: 4,
  legCosts: [cost(0.1), cost(0.05)]
};

const def = (o: Partial<StrategyInputs>): StrategyInputs => ({ ...BASE_INPUTS, ...o });

export const STRATEGIES: StrategyContent[] = [
  {
    id: 'spotPerp',
    name: 'اسپات–پرپ (کش‌اند‌کری)',
    nameEn: 'Spot-Perp',
    summary: 'خرید اسپات + شورت پرپ با نوتیونال برابر؛ فاندینگ مثبت را بدون ریسک قیمت جمع می‌کنید.',
    worksWhen: ['فاندینگ پایدار مثبت (بازار صعودی، تقاضای لانگ اهرمی)', 'کوین‌های اصلی با اوردربوک عمیق و اسلیپیج ناچیز'],
    failsWhen: ['فاندینگ منفی یا نزدیک صفر می‌شود', 'نگهداری کوتاه‌تر از زمان جبران کارمزد ۴ معامله', 'رالی شدید بدون مارجین اضافه → لیکویید شدن شورت'],
    entry: ['میانگین فاندینگ ۷ روزه مثبت و بالاتر از سربه‌سر', 'بیسیس پرپ نسبت به اسپات صفر یا مثبت (شورت گران‌تر)'],
    exits: ['فاندینگ ۳ بازهٔ متوالی منفی', 'فاصلهٔ لیکویید کمتر از ۱۵٪ → مارجین اضافه یا کاهش اندازه', 'بیسیس به نفع شما بسته شد (سود بیسیس را بگیرید)'],
    legs: [
      { side: 'long', instrument: 'spot', venue: 'A', label: 'خرید اسپات', venueType: 'صرافی متمرکز / DEX' },
      { side: 'short', instrument: 'perp', venue: 'A', label: 'شورت پرپچوال USDT-M', venueType: 'صرافی پرپ' }
    ],
    inputs: ['fundingA', 'intervalA', 'basisEntryPct', 'basisExitPct'],
    sensitivityKey: 'fundingA',
    defaults: def({ fundingA: 0.015, legCosts: [cost(0.1), cost(0.05)] }),
    costs: ['کارمزد ورود/خروج اسپات و پرپ', 'اسلیپیج هر ۴ معامله', 'انتقال وجه بین حساب اسپات و فیوچرز', 'هزینهٔ فرصت مارجین بیکار'],
    risks: [
      { kind: 'fundingFlip', severity: 'medium', note: 'در بازار نزولی فاندینگ منفی می‌شود و شورت می‌پردازد.' },
      { kind: 'liquidation', severity: 'medium', note: 'رالی تند پای شورت را تهدید می‌کند؛ سود اسپات در حساب دیگر است.' },
      { kind: 'counterparty', severity: 'medium', note: 'هر دو پا در یک صرافی متمرکز.' },
      { kind: 'execution', severity: 'low', note: 'در کوین‌های اصلی ناچیز.' },
      { kind: 'adl', severity: 'low', note: 'در نوسان شدید شورت سودده ممکن است ADL شود.' }
    ],
    capitalNote: 'اسپات کامل پرداخت می‌شود؛ با اهرم ۳ و بافر ۱۰٪ حدود ۷۰٪ سرمایه هج می‌شود.',
    scenarios: [
      { kind: 'best', title: 'فاندینگ ۱٫۵ برابر', note: 'بازار داغ؛ تقاضای لانگ بالا.', stress: { carryFactor: 1.5 } },
      { kind: 'base', title: 'نرخ فعلی ثابت', note: 'فاندینگ در کل دوره ثابت می‌ماند.', stress: {} },
      {
        kind: 'stress',
        title: 'برگشت فاندینگ + رالی ۲۰٪',
        note: 'از روز ۱۰ فاندینگ کاملاً منفی؛ قیمت ۲۰٪ بالا و شورت مارجین اضافه می‌خواهد.',
        stress: { flipAfterDays: 10, flipFactor: -1, priceMovePct: 20 }
      }
    ],
    checklist: ['فاندینگ پیش‌بینی‌شدهٔ بازهٔ بعد', 'نسبت مارجین پای شورت', 'نوتیونال دو پا برابر است؟', 'سود تجمعی در برابر سربه‌سر']
  },
  {
    id: 'perpPerp',
    name: 'پرپ–پرپ بین‌صرافی',
    nameEn: 'Perp-Perp',
    summary: 'شورت در صرافی با فاندینگ بالا، لانگ در صرافی با فاندینگ کم/منفی؛ اسپرد فاندینگ سود شماست.',
    worksWhen: ['یک صرافی مدام فاندینگ بالا دارد و دیگری به میانگین برمی‌گردد', 'اسپرد بزرگ‌تر از کارمزد ۴ معامله و هزینهٔ انتقال'],
    failsWhen: ['اسپرد جمع یا برعکس می‌شود', 'بازه‌های فاندینگ متفاوت و اسپرد لحظه‌ای فریبنده است', 'قطعی یا فریز برداشت مانع بالانس مارجین می‌شود'],
    entry: ['اسپرد میانگین ۷ روزه (نه لحظه‌ای) بالاتر از سربه‌سر', 'پایداری بالا: بیشتر ساعت‌ها اسپرد به نفع شما'],
    exits: ['اسپرد ۷ روزه زیر سربه‌سر', 'چرخش علامت اسپرد بیش از یک بار در روز', 'نسبت مارجین یکی از دو صرافی بالای ۶۰٪'],
    legs: [
      { side: 'long', instrument: 'perp', venue: 'B', label: 'لانگ پرپ (فاندینگ کمتر)', venueType: 'صرافی B' },
      { side: 'short', instrument: 'perp', venue: 'A', label: 'شورت پرپ (فاندینگ بیشتر)', venueType: 'صرافی A' }
    ],
    inputs: ['fundingA', 'intervalA', 'fundingB', 'intervalB', 'basisEntryPct', 'basisExitPct'],
    sensitivityKey: 'fundingA',
    defaults: def({ fundingA: 0.03, fundingB: 0, transferUsd: 20, legCosts: [cost(0.05), cost(0.05)] }),
    costs: ['کارمزد ۴ معامله در دو صرافی', 'اسلیپیج دو اوردربوک', 'انتقال/پل بین صرافی‌ها برای بالانس', 'هزینهٔ فرصت مارجین دو طرف'],
    risks: [
      { kind: 'fundingFlip', severity: 'high', note: 'اسپرد بین‌صرافی سریع جمع می‌شود.' },
      { kind: 'liquidation', severity: 'high', note: 'سود یک پا در صرافی دیگر است؛ بدون بالانس، پای زیان‌ده لیکویید می‌شود.' },
      { kind: 'counterparty', severity: 'high', note: 'دو صرافی = دو ریسک ورشکستگی/فریز.' },
      { kind: 'basis', severity: 'medium', note: 'اختلاف قیمت مارک دو صرافی هنگام خروج.' },
      { kind: 'transfer', severity: 'medium', note: 'انتقال مارجین در بحران کند یا متوقف می‌شود.' },
      { kind: 'adl', severity: 'medium', note: 'صرافی‌های کوچک‌تر ADL تهاجمی‌تری دارند.' }
    ],
    capitalNote: 'هر دو پا اهرمی‌اند؛ بازدهی سرمایه بالا (با اهرم ۳ حدود ۱۱۵٪) ولی ریسک لیکویید دوبرابر.',
    scenarios: [
      { kind: 'best', title: 'اسپرد پایدار + بیسیس به نفع', note: 'اسپرد ثابت و اختلاف قیمت ۰٫۰۵٪ به نفع شما بسته می‌شود.', stress: { basisShiftPct: -0.05 } },
      { kind: 'base', title: 'میانگین‌گرایی نصف دوره', note: 'از روز ۱۵ اسپرد نصف می‌شود.', stress: { flipAfterDays: 15, flipFactor: 0.5 } },
      {
        kind: 'stress',
        title: 'برگشت اسپرد + بازهٔ ۱ ساعته + فریز ۵ روزه',
        note: 'صرافی B بازهٔ ۱ ساعته دارد، اسپرد از روز ۷ برعکس می‌شود، بیسیس ۰٫۳٪ علیه شما و برداشت ۵ روز فریز.',
        stress: { flipAfterDays: 7, flipFactor: -0.5, basisShiftPct: 0.3, extraHoldDays: 5, priceMovePct: 20 },
        overrides: { intervalB: 1 }
      }
    ],
    checklist: ['اسپرد ۷ روزه و چرخش علامت', 'نسبت مارجین هر دو صرافی', 'وضعیت برداشت و شبکهٔ انتقال', 'اختلاف قیمت مارک دو صرافی']
  },
  {
    id: 'lendShort',
    name: 'لندینگ + شورت پرپ',
    nameEn: 'Lending + Short Perp',
    summary: 'دارایی را در پروتکل لندینگ سپرده کنید و هم‌اندازه شورت بزنید؛ بهرهٔ لندینگ + فاندینگ.',
    worksWhen: ['فاندینگ مثبت و APY لندینگ معقول', 'می‌خواهید دارایی بیکار هم بازده بگیرد'],
    failsWhen: ['فاندینگ منفی و APY لندینگ سقوط می‌کند', 'هک یا توقف برداشت پروتکل', 'استفادهٔ ۱۰۰٪ از استخر مانع برداشت در خروج می‌شود'],
    entry: ['APY لندینگ + APR فاندینگ > سربه‌سر', 'پروتکل ممیزی‌شده با استفادهٔ استخر < ۹۰٪'],
    exits: ['فاندینگ منفی بیشتر از APY لندینگ', 'APY لندینگ زیر بازده بدون ریسک', 'فاصلهٔ لیکویید شورت کمتر از ۱۵٪'],
    legs: [
      { side: 'long', instrument: 'spot', venue: 'A', yield: 'lend', label: 'سپرده در لندینگ', venueType: 'پروتکل DeFi (Aave و…)' },
      { side: 'short', instrument: 'perp', venue: 'A', label: 'شورت پرپ', venueType: 'صرافی پرپ' }
    ],
    inputs: ['lendApy', 'fundingA', 'intervalA'],
    sensitivityKey: 'fundingA',
    defaults: def({ lendApy: 5, fundingA: 0.01, gasUsd: 20, legCosts: [cost(0.1), cost(0.05)] }),
    costs: ['کارمزد خرید/فروش اسپات و پرپ', 'گس واریز و برداشت پروتکل', 'انتقال بین زنجیره و صرافی', 'اسلیپیج'],
    risks: [
      { kind: 'smartContract', severity: 'high', note: 'هک یا باگ پروتکل لندینگ.' },
      { kind: 'liquidation', severity: 'medium', note: 'سپرده در پروتکل است، نه وثیقهٔ شورت.' },
      { kind: 'fundingFlip', severity: 'medium', note: 'APY لندینگ بخشی از فاندینگ منفی را جبران می‌کند.' },
      { kind: 'transfer', severity: 'medium', note: 'برداشت از استخر پر و پل‌ها کند است.' },
      { kind: 'counterparty', severity: 'medium', note: 'صرافی پای شورت.' }
    ],
    capitalNote: 'سپرده کامل + مارجین شورت؛ بازدهی سرمایه پایین‌تر (حدود ۷۰٪ با اهرم ۳).',
    scenarios: [
      { kind: 'best', title: 'فاندینگ و APY بالا', note: 'فاندینگ ۱٫۵ برابر، APY لندینگ ۱٫۲ برابر.', stress: { carryFactor: 1.5, yieldFactor: 1.2 } },
      { kind: 'base', title: 'نرخ‌های فعلی', note: 'هر دو نرخ ثابت.', stress: {} },
      { kind: 'stress', title: 'فاندینگ منفی + سقوط APY', note: 'از روز ۵ فاندینگ برعکس، APY نصف، قیمت ۲۰٪ بالا.', stress: { flipAfterDays: 5, flipFactor: -1, yieldFactor: 0.5, priceMovePct: 20 } }
    ],
    checklist: ['APY و نرخ استفادهٔ استخر', 'فاندینگ پای شورت', 'سلامت پروتکل (اخبار، TVL)', 'نسبت مارجین شورت']
  },
  {
    id: 'reverseSpotPerp',
    name: 'اسپات–پرپ معکوس (فاندینگ منفی)',
    nameEn: 'Reverse Spot-Perp',
    summary: 'اسپات را قرض بگیرید و بفروشید (یا استیبل نگه دارید) و لانگ پرپ بزنید؛ فاندینگ منفی را دریافت کنید.',
    worksWhen: ['فاندینگ عمیقاً منفی (بازار ترسیده، شورت شلوغ)', 'نرخ قرض دارایی کمتر از |فاندینگ|'],
    failsWhen: ['فاندینگ مثبت می‌شود (شورت اسکوئیز)', 'نرخ قرض ناگهان بالا می‌رود یا قرض فراخوانده می‌شود'],
    entry: ['|APR فاندینگ| − APR قرض > سربه‌سر', 'دسترسی به قرض دارایی با مدت کافی'],
    exits: ['فاندینگ به صفر یا مثبت برگشت', 'APR قرض بالاتر از |APR فاندینگ|', 'نسبت مارجین حساب قرض نزدیک فراخوان'],
    legs: [
      { side: 'short', instrument: 'spot', venue: 'A', borrowed: true, label: 'فروش اسپات قرضی', venueType: 'مارجین صرافی / لندینگ' },
      { side: 'long', instrument: 'perp', venue: 'A', label: 'لانگ پرپ', venueType: 'صرافی پرپ' }
    ],
    inputs: ['fundingA', 'intervalA', 'borrowApr', 'basisEntryPct', 'basisExitPct'],
    sensitivityKey: 'fundingA',
    defaults: def({ fundingA: -0.02, borrowApr: 6, legCosts: [cost(0.1), cost(0.05)] }),
    costs: ['بهرهٔ قرض اسپات', 'کارمزد ۴ معامله', 'اسلیپیج', 'انتقال'],
    risks: [
      { kind: 'fundingFlip', severity: 'high', note: 'فاندینگ منفی معمولاً کوتاه‌مدت است.' },
      { kind: 'liquidation', severity: 'high', note: 'شورت اسپات قرضی در رالی فراخوان مارجین می‌گیرد.' },
      { kind: 'counterparty', severity: 'medium', note: 'وام‌دهنده می‌تواند دارایی را فراخواند.' },
      { kind: 'execution', severity: 'medium', note: 'قرض آلت‌کوین کم‌عمق و گران است.' }
    ],
    capitalNote: 'هر دو پا وثیقه‌ای‌اند؛ بازدهی سرمایه بالا ولی بهرهٔ قرض بازده را می‌خورد.',
    scenarios: [
      { kind: 'best', title: 'فاندینگ عمیق‌تر', note: 'فاندینگ منفی ۱٫۵ برابر.', stress: { carryFactor: 1.5 } },
      { kind: 'base', title: 'نرخ فعلی', note: 'فاندینگ و قرض ثابت.', stress: {} },
      { kind: 'stress', title: 'شورت اسکوئیز', note: 'از روز ۵ فاندینگ مثبت، قیمت ۲۰٪ بالا.', stress: { flipAfterDays: 5, flipFactor: -1, priceMovePct: 20 } }
    ],
    checklist: ['APR قرض (متغیر است)', 'فاندینگ هر بازه', 'نسبت مارجین حساب قرض', 'امکان بازپرداخت فوری']
  },
  {
    id: 'basisFutures',
    name: 'معاملهٔ بیسیس با فیوچرز سررسیددار',
    nameEn: 'Dated-Futures Basis',
    summary: 'لانگ اسپات + شورت فیوچرز با پریمیوم؛ در سررسید قیمت‌ها همگرا می‌شوند و پریمیوم قفل‌شده سود شماست.',
    worksWhen: ['کانتانگو (فیوچرز گران‌تر از اسپات) با APR بالاتر از بازده بدون ریسک', 'می‌خواهید بازده از ورود قفل باشد'],
    failsWhen: ['بیسیس پیش از سررسید علیه شما گسترش یابد و مجبور به خروج زودهنگام شوید', 'رول با پریمیوم پایین‌تر یا بک‌وارداسیون'],
    entry: ['APR بیسیس (بیسیس ÷ روز تا سررسید × ۳۶۵) > بازده بدون ریسک + هزینه‌ها', 'نقدشوندگی کافی قرارداد'],
    exits: ['سررسید (همگرایی خودکار)', 'بیسیس زودتر بسته شد → خروج و برداشت سود', 'رول فقط اگر بیسیس قرارداد بعدی کافی باشد'],
    legs: [
      { side: 'long', instrument: 'spot', venue: 'A', label: 'خرید اسپات', venueType: 'صرافی متمرکز' },
      { side: 'short', instrument: 'dated', venue: 'A', label: 'شورت فیوچرز سررسیددار', venueType: 'صرافی فیوچرز (CME/Deribit/…)' }
    ],
    inputs: ['futuresBasisPct', 'daysToExpiry', 'basisEntryPct', 'basisExitPct'],
    sensitivityKey: 'futuresBasisPct',
    defaults: def({ futuresBasisPct: 2, daysToExpiry: 90, holdDays: 90, legCosts: [cost(0.1), cost(0.05)] }),
    costs: ['کارمزد ۴ معامله', 'هزینهٔ رول (بستن و باز کردن قرارداد بعدی)', 'اسلیپیج', 'هزینهٔ فرصت سرمایه'],
    risks: [
      { kind: 'basis', severity: 'medium', note: 'گسترش بیسیس پیش از سررسید زیان کاغذی/واقعی می‌سازد.' },
      { kind: 'liquidation', severity: 'medium', note: 'رالی تند پای شورت را تهدید می‌کند.' },
      { kind: 'counterparty', severity: 'low', note: 'در صرافی‌های تنظیم‌شده کم.' },
      { kind: 'fundingFlip', severity: 'low', note: 'بازدهِ دورهٔ اول قفل است؛ فقط رول‌ها متأثرند.' }
    ],
    capitalNote: 'شبیه کش‌اند‌کری؛ بازده تا سررسید قفل است و فاندینگ متغیر ندارد.',
    scenarios: [
      { kind: 'best', title: 'نگهداری تا سررسید', note: 'همگرایی کامل؛ بازده قفل‌شده.', stress: {} },
      { kind: 'base', title: 'رول یک‌باره با پریمیوم کمتر', note: '۱۸۰ روز؛ رول با ۷۰٪ بیسیس فعلی.', stress: { carryFactor: 0.7, flipAfterDays: 90, flipFactor: 0.7 }, overrides: { holdDays: 180 } },
      { kind: 'stress', title: 'خروج زودهنگام با گسترش بیسیس', note: 'خروج در روز ۳۰، بیسیس ۱٪ علیه شما، قیمت ۲۰٪ بالا.', stress: { basisShiftPct: 1, priceMovePct: 20 }, overrides: { holdDays: 30 } }
    ],
    checklist: ['APR بیسیس قرارداد فعلی و بعدی', 'نسبت مارجین شورت', 'تاریخ سررسید و برنامهٔ رول']
  },
  {
    id: 'lstShort',
    name: 'LST/استیکینگ + شورت پرپ',
    nameEn: 'LST Staking + Short Perp',
    summary: 'توکن استیکینگ (مثل stETH) نگه دارید و دارایی پایه را شورت کنید؛ بازده استیکینگ + فاندینگ.',
    worksWhen: ['فاندینگ مثبت و LST نزدیک پگ', 'نقدشوندگی کافی LST برای خروج'],
    failsWhen: ['دیپگ LST (صف برداشت، اسلشینگ، فروش اجباری)', 'فاندینگ منفی طولانی'],
    entry: ['APY استیکینگ + APR فاندینگ > سربه‌سر', 'تخفیف LST نسبت به پایه زیر ۰٫۵٪'],
    exits: ['دیپگ بیش از ۱٪', 'فاندینگ منفی بیشتر از APY استیکینگ', 'صف برداشت طولانی'],
    legs: [
      { side: 'long', instrument: 'spot', venue: 'A', yield: 'stake', label: 'نگهداری LST', venueType: 'پروتکل استیکینگ' },
      { side: 'short', instrument: 'perp', venue: 'A', label: 'شورت پرپ دارایی پایه', venueType: 'صرافی پرپ' }
    ],
    inputs: ['stakeApy', 'fundingA', 'intervalA'],
    sensitivityKey: 'fundingA',
    defaults: def({ stakeApy: 3.2, fundingA: 0.01, gasUsd: 15, legCosts: [cost(0.1, 0.05), cost(0.05)] }),
    costs: ['کارمزد/اسلیپیج سواپ LST', 'گس', 'کارمزد پرپ', 'انتقال'],
    risks: [
      { kind: 'depeg', severity: 'high', note: 'شورت روی پایه است؛ دیپگ LST مستقیماً زیان است.' },
      { kind: 'smartContract', severity: 'medium', note: 'قرارداد LST و اسلشینگ.' },
      { kind: 'liquidation', severity: 'medium', note: 'شورت در رالی مارجین می‌خواهد.' },
      { kind: 'fundingFlip', severity: 'medium', note: 'APY استیکینگ بالشتک است.' },
      { kind: 'execution', severity: 'medium', note: 'خروج بزرگ LST اسلیپیج دارد.' }
    ],
    capitalNote: 'مانند اسپات–پرپ؛ بازده استیکینگ کف بازده است.',
    scenarios: [
      { kind: 'best', title: 'فاندینگ بالا', note: 'فاندینگ ۱٫۵ برابر.', stress: { carryFactor: 1.5 } },
      { kind: 'base', title: 'نرخ‌های فعلی', note: 'بدون دیپگ.', stress: {} },
      { kind: 'stress', title: 'دیپگ ۳٪ + برگشت فاندینگ', note: 'LST ۳٪ زیر پایه، فاندینگ از روز ۱۰ منفی، قیمت ۲۰٪ پایین.', stress: { depegPct: 3, flipAfterDays: 10, flipFactor: -1, priceMovePct: -20 } }
    ],
    checklist: ['نسبت LST/پایه', 'صف برداشت پروتکل', 'فاندینگ پای شورت', 'نسبت مارجین']
  },
  {
    id: 'inverseShort',
    name: 'پرپ کوین‌مارجین (Inverse) در برابر استیبل‌مارجین',
    nameEn: 'Coin-margined vs Stable-margined',
    summary: 'کوین را وثیقهٔ شورت inverse هم‌اندازه کنید؛ وثیقه خودش پای لانگ است و تقریباً لیکویید نمی‌شود.',
    worksWhen: ['کوین را از قبل دارید و نمی‌خواهید USDT جدا کنار بگذارید', 'فاندینگ inverse مثبت'],
    failsWhen: ['وثیقهٔ کوین اضافه بدون شورت اضافه → دلتای پنهان', 'فاندینگ به کوین پرداخت می‌شود و ارزش دلاری‌اش نوسان دارد'],
    entry: ['نسبت هج: نوتیونال شورت = (اسپات + مارجین کوینی) × قیمت', 'فاندینگ inverse > سربه‌سر'],
    exits: ['فاندینگ منفی', 'نیاز به نقد کردن کوین'],
    legs: [
      { side: 'long', instrument: 'spot', venue: 'A', label: 'کوین (هم‌زمان وثیقه)', venueType: 'حساب فیوچرز کوین‌مارجین' },
      { side: 'short', instrument: 'perp', venue: 'A', inverse: true, label: 'شورت پرپ Inverse', venueType: 'صرافی (COIN-M)' }
    ],
    inputs: ['fundingA', 'intervalA'],
    sensitivityKey: 'fundingA',
    defaults: def({ fundingA: 0.01, marginBufferPct: 5, legCosts: [cost(0.1), cost(0.05)] }),
    costs: ['کارمزد ۴ معامله', 'اسلیپیج', 'نوسان دلاری فاندینگ کوینی'],
    risks: [
      { kind: 'liquidation', severity: 'low', note: 'شورت ۱x با وثیقهٔ کوین در رالی لیکویید نمی‌شود.' },
      { kind: 'counterparty', severity: 'medium', note: 'همهٔ دارایی در یک صرافی.' },
      { kind: 'fundingFlip', severity: 'medium', note: 'مثل اسپات–پرپ.' },
      { kind: 'execution', severity: 'low', note: 'نسبت هج اشتباه دلتای پنهان می‌سازد.' }
    ],
    capitalNote: 'کوین هم پای لانگ است هم وثیقه؛ بازدهی سرمایه ~۹۵٪ در برابر ~۷۰٪ نسخهٔ USDT-M.',
    scenarios: [
      { kind: 'best', title: 'فاندینگ بالا', note: 'فاندینگ ۱٫۵ برابر.', stress: { carryFactor: 1.5 } },
      { kind: 'base', title: 'نرخ فعلی', note: '', stress: {} },
      { kind: 'stress', title: 'رالی ۲۰٪ + فاندینگ منفی', note: 'وثیقهٔ کوین هم بالا می‌رود؛ فقط فاندینگ زیان می‌دهد.', stress: { priceMovePct: 20, flipAfterDays: 10, flipFactor: -1 } }
    ],
    checklist: ['نسبت هج (کوین کل × قیمت = نوتیونال شورت)', 'فاندینگ', 'ارزش دلاری فاندینگ دریافتی']
  }
];

export const strategyById = (id: StrategyId): StrategyContent => STRATEGIES.find((s) => s.id === id)!;
