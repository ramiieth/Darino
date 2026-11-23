/** ============================================================
 * Founder Lab — Domain Types, Currencies, Stages, Glossary & Metadata
 * ============================================================ */

export type CurrencyCode = 'IRT' | 'IRR' | 'AED' | 'SAR' | 'USD' | 'EUR';

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  IRT: { code: 'IRT', label: 'تومان', symbol: 'تومان', decimals: 0 },
  IRR: { code: 'IRR', label: 'ریال ایران', symbol: 'ریال', decimals: 0 },
  AED: { code: 'AED', label: 'درهم امارات', symbol: 'درهم', decimals: 0 },
  SAR: { code: 'SAR', label: 'ریال سعودی', symbol: 'ریال سعودی', decimals: 2 },
  USD: { code: 'USD', label: 'دلار آمریکا', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', label: 'یورو', symbol: '€', decimals: 2 }
};

export type BusinessStage = 'idea' | 'validation' | 'mvp' | 'presale' | 'active';

export const STAGES: { id: BusinessStage; label: string }[] = [
  { id: 'idea', label: 'ایده اولیه' },
  { id: 'validation', label: 'در حال اعتبارسنجی' },
  { id: 'mvp', label: 'نمونه اولیه (MVP)' },
  { id: 'presale', label: 'پیش‌فروش / آزمایش بازار' },
  { id: 'active', label: 'کسب‌وکار فعال' }
];

export type FounderLabTab =
  | 'dashboard'
  | 'profile'
  | 'board'
  | 'competitors'
  | 'panel'
  | 'pricing'
  | 'offer'
  | 'cfo'
  | 'marketing'
  | 'brand'
  | 'operations'
  | 'launch'
  | 'plan'
  | 'history'
  | 'settings';

export type SkillId =
  | 'board'
  | 'competitors'
  | 'panel'
  | 'pricing'
  | 'offer'
  | 'cfo'
  | 'marketing'
  | 'brand'
  | 'operations'
  | 'launch'
  | 'plan';

export const SKILL_META: { id: SkillId; num: string; title: string; en: string; desc: string }[] = [
  { id: 'board', num: '۱', title: 'هیئت‌مدیره و ارزیابی ایده', en: 'Founder Board', desc: 'بررسی از ۳ دیدگاه Hormozi، Thiel و Jobs' },
  { id: 'competitors', num: '۲', title: 'تحلیل رقبا', en: 'Competitor Analysis', desc: 'رقبای مستقیم، غیرمستقیم، جایگزین‌ها و شکایات' },
  { id: 'panel', num: '۳', title: 'پنل ۱۰۰ مشتری فرضی', en: 'Consumer Panel', desc: 'شبیه‌سازی الگوریتمی شفاف + تفکیک نظرسنجی واقعی' },
  { id: 'pricing', num: '۴', title: 'استراتژی قیمت‌گذاری', en: 'Pricing Strategist', desc: 'مدل Van Westendorp، سه سطح قیمت و کنترل حاشیه سود' },
  { id: 'offer', num: '۵', title: 'طراحی پیشنهاد فروش', en: 'Offer Architect', desc: 'ارزش در برابر هزینه، ضمانت منطقی و بازآزمایی پنل' },
  { id: 'cfo', num: '۶', title: 'مدیر مالی (CFO)', en: 'CFO Unit Economics', desc: 'سود مشارکت، نقطه سربه‌سر، ۱۲ ماهه و ۳ سناریوی ریسک' },
  { id: 'marketing', num: '۷', title: 'مدیر بازاریابی', en: 'Marketing Director', desc: 'جایگاه‌یابی، کانال‌ها، سقف CAC و برنامه ۳۰ روزه' },
  { id: 'brand', num: '۸', title: 'طراحی برند', en: 'Brand Designer', desc: '۱۰ نام، شعار، پالت رنگی و چک‌لیست بررسی دامنه' },
  { id: 'operations', num: '۹', title: 'مدیر عملیات', en: 'Operations Manager', desc: 'تجهیزات، تأمین‌کنندگان، ریسک و همگام‌سازی با CFO' },
  { id: 'launch', num: '۱۰', title: 'برنامه‌ریزی راه‌اندازی', en: 'Launch Lead', desc: 'آزمایش کم‌هزینه واقعی بازار، شمارش معکوس و KPI' },
  { id: 'plan', num: '۱۱', title: 'طرح نهایی کسب‌وکار', en: 'Business Plan', desc: 'گزارش جامع قابل چاپ/PDF با وضعیت محاسبه‌شده' }
];

export const GLOSSARY: Record<string, string> = {
  contributionMargin:
    'سود مشارکت هر واحد = قیمت فروش منهای تمام هزینه‌های متغیر همان یک واحد (تولید، بسته‌بندی، ارسال و کمیسیون).',
  breakEven:
    'نقطه سربه‌سر تعداد فروشی است که در آن درآمد دقیقاً برابر کل هزینه‌ها (ثابت + متغیر) می‌شود.',
  paybackPeriod:
    'زمان بازگشت سرمایه یعنی چند ماه طول می‌کشد تا سود عملیاتی انباشته کل سرمایه اولیه را برگرداند.',
  peakCash:
    'نقدینگی لازم دوره شروع = سرمایه اولیه + حداکثر کسری نقدینگی ماه‌های ابتدایی پیش از سوددهی.',
  vanWestendorp:
    'مدل Van Westendorp با ۴ سؤال بازه قیمتی منطقی را مشخص می‌کند: PMC کف ارزانی مشکوک، PME سقف گرانی، OPP قیمت بهینه و IPP نقطه بی‌تفاوتی.',
  cac: 'هزینه جذب مشتری (CAC) میانگین هزینه بازاریابی و فروش برای جذب یک خریدار واقعی است.',
  simulatedPanel:
    'پنل فرضی یک شبیه‌سازی الگوریتمی شفاف است و جایگزین مصاحبه یا فروش واقعی نیست؛ عدد ۷۰ از ۱۰۰ به معنی ۷۰٪ احتمال فروش واقعی نیست.'
};

export interface VwPriceSet {
  tooCheap: number;
  cheap: number;
  expensive: number;
  tooExpensive: number;
}

export interface CompetitorItem {
  id: string;
  name: string;
  website: string;
  group: 'direct' | 'indirect' | 'substitute';
  sector: string;
  products: string;
  price: number;
  targetCustomers: string;
  advantage: string;
  weakness: string;
  complaints: string;
  marketing: string;
  sourceUrl: string;
  checkedDate: string;
  verified: boolean;
}

export interface SimulatedPersona {
  id: string;
  index: number;
  name: string;
  age: number;
  segmentId: string;
  segment: string;
  income: string;
  financialStatus: string;
  need: string;
  buyingBehavior: string;
  priceSensitivity: number;
  trustLevel: number;
  currentSubstitute: string;
  priority: string;
  objection: string;
  flipFactor: string;
  vw: VwPriceSet;
  score: number;
  decision: 'buy' | 'maybe' | 'no';
  decisionLabel: string;
  isSimulated: true;
}

export interface RealSurveyEntry {
  id: string;
  respondent: string;
  decision: 'buy' | 'maybe' | 'no';
  vw: VwPriceSet;
  note: string;
  createdAt: string;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  unitCost: number;
  features: string;
}

export interface OfferStackItem {
  id: string;
  title: string;
  valueScore: number;
  costPerUnit: number;
}

export interface MarketingChannel {
  id: string;
  name: string;
  reason: string;
  budget: number;
  estCac: number;
  kpi: string;
}

export interface ChecklistTask {
  id: string;
  text: string;
  done: boolean;
}

export interface AnalysisSnapshot {
  id: string;
  createdAt: string;
  reason: string;
  price: number;
  offerItemsCount: number;
  boardAvg: number;
  boardVerdict: string;
  simBuyRate: number | null;
  unitMargin: number;
  breakEvenDaily: number | null;
  year1Profit: number;
  planStatus: string;
}

export interface FounderLabProject {
  id: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
  currency: CurrencyCode;
  profile: {
    name: string;
    description: string;
    problem: string;
    product: string;
    targetCustomer: string;
    targetMarket: string;
    revenueModel: string;
    proposedPrice: number;
    initialCapital: number;
    operatingCosts: number;
    constraints: string;
    stage: BusinessStage;
  };
  board: {
    hormozi: { dreamOutcome: number; perceivedLikelihood: number; timeDelay: number; effortEase: number; notes: string };
    thiel: { smallMarketFocus: number; tenXAdvantage: number; defensibility: number; timingStrength: number; notes: string };
    jobs: { simplicityFocus: number; customerExperience: number; clarityOfProblem: number; craftQuality: number; notes: string };
    lastRunAt: string | null;
  };
  competitors: CompetitorItem[];
  panel: {
    size: 20 | 50 | 100;
    seed: number;
    personas: SimulatedPersona[];
    lastRunAt: string | null;
    lastRunNote: string;
  };
  realSurvey: RealSurveyEntry[];
  pricing: {
    dataSource: 'auto' | 'real' | 'simulated';
    customVwRows: VwPriceSet[];
    tiers: PricingTier[];
  };
  offer: {
    coreProblem: string;
    desiredOutcome: string;
    mainBarriers: string;
    competitiveEdge: string;
    guarantee: string;
    launchOffer: string;
    applyOfferCostToCfo: boolean;
    items: OfferStackItem[];
  };
  cfo: {
    salePrice: number;
    variableCostPerUnit: number;
    packagingShippingCost: number;
    commissionPercent: number;
    commissionFixed: number;
    rent: number;
    salaries: number;
    softwareServices: number;
    otherFixed: number;
    initialCapital: number;
    dailyCapacity: number;
    workingDaysPerMonth: number;
    monthlyForecast: number[];
  };
  marketing: {
    positioning: string;
    targetAudienceSummary: string;
    adBudgetMonthly: number;
    hooks: string[];
    contentIdeas: string[];
    channels: MarketingChannel[];
    plan30Days: { id: string; week: string; task: string; done: boolean }[];
    kpis: string[];
  };
  brand: {
    candidates: string[];
    topThree: string[];
    slogan: string;
    voice: string;
    personality: string;
    promise: string;
    colors: { name: string; hex: string }[];
    fonts: string;
    logoGuide: string;
    visualExperience: string;
    checks: { domainIr: boolean; domainCom: boolean; trademark: boolean; socialHandles: boolean };
  };
  operations: {
    equipment: { id: string; name: string; cost: number }[];
    materials: { id: string; name: string; supplier: string; unitCost: number }[];
    staff: { id: string; name: string; monthlySalary: number }[];
    dailyTasks: string;
    salesProcess: string;
    supportProcess: string;
    inventoryProcess: string;
    logisticsProcess: string;
    permits: string;
    insurance: string;
    risks: { id: string; risk: string; likelihood: string; impact: string; mitigation: string }[];
    checklist: {
      day1: ChecklistTask[];
      week1: ChecklistTask[];
      month1: ChecklistTask[];
    };
  };
  launch: {
    experiment: {
      type: string;
      hypothesis: string;
      successCriteria: string;
      budget: number;
      targetCount: number;
      actualCount: number;
      notes: string;
      status: 'not_started' | 'running' | 'validated' | 'failed';
      completedAt: string | null;
    };
    launchDate: string;
    countdownTasks: { id: string; day: string; task: string; owner: string; done: boolean }[];
    first30Kpis: string[];
  };
  snapshots: AnalysisSnapshot[];
}
