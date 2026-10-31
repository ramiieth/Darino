/**
 * ژورنال معاملاتی — مدل‌های مشترک دامنه (بدون React و بدون شبکه)
 *
 *   Fill      یک اجرای واقعی از صرافی (یا ورود دستی)
 *   Trade     یک معاملهٔ رفت‌وبرگشت کامل: از صفر شدن پوزیشن تا صفر شدن دوباره
 *   Book      دفتر «جهت‌دار» (ارزیابی حرفه‌ای) یا «دلتا نوترال» (فارم پوینت، فاندینگ، حجم)
 *   Note      یادداشت کاربر روی هر معامله (تگ «چرا»، اشتباه، دفتر دستی)
 *   Plan      برنامهٔ قبل از معامله (چشم‌انداز بازار + برنامهٔ ورود/استاپ/هدف)
 *   Review    مرور هفتگی (تگ‌ها، تعهدهای قابل‌بررسی، پاسخ سؤال‌ها)
 * مقدار نامعلوم null است؛ هرگز با صفر جایگزین نمی‌شود.
 */

export type Venue = 'hyperliquid' | 'txflow' | 'lighter-mainnet' | 'lighter-robinhood' | 'arcus' | 'metatrader' | 'manual';

export const VENUE_FA: Record<Venue, string> = {
  hyperliquid: 'هایپرلیکوئید',
  txflow: 'تی‌اکس‌فلو',
  'lighter-mainnet': 'لایتر',
  'lighter-robinhood': 'لایتر رابین‌هود',
  arcus: 'آرکوس',
  metatrader: 'متاتریدر',
  manual: 'ثبت دستی'
};

/** کدام داده را هر پلتفرم به‌صورت عمومی می‌دهد — منبع پنل «اعتماد داده» */
export const VENUE_COVERAGE: Record<Venue, { fees: boolean; funding: boolean; positionBefore: boolean }> = {
  hyperliquid: { fees: true, funding: true, positionBefore: true },
  // userFunding روی rpc.txflow.com مجاز نیست
  txflow: { fees: true, funding: false, positionBefore: true },
  // فاندینگ حساب اصلی لایتر فقط با توکن احراز هویت خوانده می‌شود؛ کارمزد در هر معامله گزارش می‌شود
  'lighter-mainnet': { fees: true, funding: false, positionBefore: true },
  'lighter-robinhood': { fees: true, funding: false, positionBefore: true },
  arcus: { fees: true, funding: true, positionBefore: false },
  // از استیتمنت: کمیسیون و سواپ (هم‌ارز فاندینگ) برای هر پوزیشن
  metatrader: { fees: true, funding: true, positionBefore: true },
  manual: { fees: true, funding: false, positionBefore: false }
};

export interface JournalAccount {
  /** کلید پایدار: venue:address[:sub] — در شناسهٔ معامله و تنظیمات به کار می‌رود */
  key: string;
  venue: Venue;
  label: string;
  address: string;
  /** شمارهٔ زیرحساب لایتر یا accountIndex آرکوس */
  sub?: number;
}

export interface Fill {
  /** یکتا در کل ژورنال: account|venueFillId */
  id: string;
  account: string;
  venue: Venue;
  symbol: string;
  side: 'buy' | 'sell';
  px: number;
  sz: number;
  time: number;
  /** کارمزد پرداختی (مثبت = پرداخت، منفی = ریبیت)؛ null = گزارش نشده */
  fee: number | null;
  /** سود/زیان قیمتی بسته‌شده طبق خود صرافی (بدون کارمزد) */
  realized: number | null;
  /** پوزیشن علامت‌دار قبل از این اجرا، اگر صرافی بدهد */
  posBefore: number | null;
  maker?: boolean;
  liquidation?: boolean;
}

export interface FundingEvent {
  id: string;
  account: string;
  symbol: string;
  time: number;
  /** مثبت = دریافت، منفی = پرداخت */
  amount: number;
}

export type Direction = 'long' | 'short';
export type BookKind = 'directional' | 'neutral';

export interface Trade {
  id: string;
  account: string;
  venue: Venue;
  symbol: string;
  /** نام پایهٔ نرمال‌شده برای تطبیق بین پلتفرم‌ها (BTC، ETH، PEPE…) */
  base: string;
  direction: Direction;
  openTime: number;
  closeTime: number | null;
  open: boolean;
  /** شروع پوزیشن قبل از بازهٔ تاریخچهٔ موجود بوده — قیمت ورود و سود کامل معلوم نیست */
  truncated: boolean;
  entryPx: number | null;
  exitPx: number | null;
  /** بیشترین اندازهٔ پوزیشن (واحد دارایی) */
  maxSize: number;
  /** بیشترین ارزش اسمی پوزیشن به دلار (بر پایهٔ قیمت ورود میانگین) */
  maxNotional: number;
  /** حجم معامله‌شده (مجموع ارزش اجراها) */
  volume: number;
  /** سود/زیان قیمتی قبل از کارمزد و فاندینگ */
  grossPnl: number;
  fees: number | null;
  funding: number | null;
  /** gross − fees + funding (با مقادیر معلوم) */
  netPnl: number;
  fills: number;
  liquidated: boolean;
}

export interface ClassifiedTrade extends Trade {
  book: BookKind;
  /** دلیل خوانای قرارگرفتن در این دفتر */
  bookReason: string;
  /** شناسهٔ گروه پوشش (برای پاهای دلتا نوترال) */
  hedgeGroup: string | null;
}

/* ---------------- دادهٔ کاربر (همگام بین دستگاه‌ها) ---------------- */

export type AccountRole = 'auto' | 'directional' | 'neutral';

export interface TradeNote {
  /** همان Trade.id */
  tradeId: string;
  /** تگ‌های «چرا وارد شدم» */
  whyTags: string[];
  /** true اگر تگ‌های «چرا» قبل از بسته‌شدن معامله زده شده‌اند (از برنامه یا هنگام باز بودن) */
  whyTaggedBeforeClose: boolean;
  mistakeTags: string[];
  goodTags: string[];
  note: string;
  /** جایگزینی دستی دفتر */
  book?: BookKind;
  /** پایبندی به قوانین خودم — null یعنی هنوز مشخص نشده */
  followedRules: boolean | null;
  planId?: string | null;
  updatedAt: number;
}

export type Bias = 'neutral' | 'bullish' | 'bearish';
export type YesNo = 'y' | 'n' | '-';

export interface NewsItem {
  day: string;
  time: string;
  event: string;
  impact: 'high' | 'med' | 'low';
}

export interface MarketOutlook {
  weeklyBias: Bias;
  weeklyNote: string;
  dailyBias: Bias;
  dailyNote: string;
  env: 'range' | 'trend' | 'unknown';
  proTrend: YesNo;
  /** پاسخ بله/خیر چک‌لیست نگاشت (شناسهٔ آیتم → پاسخ) */
  checklist: Record<string, YesNo>;
  checklistNotes: Record<string, string>;
  news: NewsItem[];
}

export type PlanStatus = 'planned' | 'taken' | 'skipped' | 'cancelled';

export interface TradePlan {
  id: string;
  createdAt: number;
  updatedAt: number;
  symbol: string;
  direction: Direction;
  account: string | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  /** اندازهٔ برنامه‌ریزی‌شده به واحد دارایی (اختیاری؛ وگرنه از سقف ریسک پیشنهاد می‌شود) */
  size: number | null;
  leverage: number | null;
  setupTags: string[];
  entryWhy: string;
  stopWhy: string;
  targetWhy: string;
  confluences: string[];
  reasonsAgainst: string[];
  outlook: MarketOutlook;
  status: PlanStatus;
  /** اتصال دستی؛ وگرنه تطبیق خودکار */
  linkedTradeId: string | null;
  /** ساعت اعتبار برای تطبیق خودکار با معاملهٔ واقعی */
  validHours: number;
  notes: string;
  /** نوع برنامه؛ نبودن = کریپتو (برنامه‌های قدیمی) */
  kind?: 'crypto' | 'mt';
  /** تنظیمات حجم متاتریدر (فقط kind = mt)؛ size برنامه = لات × اندازهٔ قرارداد تا R حسابرسی درست بماند */
  mt?: MtPlanParams;
  deleted?: boolean;
}

export interface MtPlanParams {
  capital: number | null;
  riskPct: number;
  leverage: number | null;
  contractSize: number | null;
  spreadPips: number;
  commissionPerLot: number;
}

export type CommitmentRule =
  | { type: 'free' }
  | { type: 'maxTradesPerDay'; n: number }
  | { type: 'cooldownAfterLoss'; minutes: number }
  | { type: 'requirePlan' }
  | { type: 'maxRiskPct'; pct: number }
  | { type: 'maxLossUsd'; usd: number }
  | { type: 'allowedSetups'; tags: string[] }
  | { type: 'noTradeHours'; from: number; to: number };

export interface Commitment {
  id: string;
  text: string;
  rule: CommitmentRule;
  /** تیک دستی (برای تعهدهای غیرقابل‌بررسی خودکار) */
  done: boolean;
}

export interface WeeklyReview {
  /** YYYY-Www */
  week: string;
  mistakeTags: string[];
  mistakeNote: string;
  goodTags: string[];
  goodNote: string;
  /** تعهدهای هفتهٔ بعد */
  commitments: Commitment[];
  /** پاسخ سؤال‌های سفارشی قالب */
  answers: Record<string, string>;
  updatedAt: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  group: 'context' | 'mapping' | 'tpo';
}

export interface ReviewQuestion {
  id: string;
  title: string;
  sub: string;
}

export interface JournalSettings {
  roles: Record<string, AccountRole>;
  /** اندازهٔ حساب جهت‌دار برای درصدها؛ null = موجودی فعلی حساب‌ها */
  accountSize: number | null;
  /** سقف ریسک هر معامله (درصد حساب) */
  maxRiskPct: number;
  /** حد زیان روزانه (درصد حساب) */
  dailyLossPct: number;
  whyTags: string[];
  mistakeTags: string[];
  goodTags: string[];
  checklist: ChecklistItem[];
  questions: ReviewQuestion[];
  /** معیار تشخیص خودکار پوشش */
  hedge: { minOverlap: number; maxSizeRatio: number };
  /** روزهای تاریخچهٔ اجراهای حساب‌های نوترال غیر آرکوس (حجم بالا؛ آمار کلی از سری روزانهٔ لایتر) */
  neutralFillDays: number;
}
