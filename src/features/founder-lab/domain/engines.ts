/** ============================================================
 * Founder Lab — Deterministic Analytical Engines for All 11 Skills
 * Pure TypeScript, zero external AI/API claims, transparent formulas.
 * ============================================================ */
import {
  CURRENCIES,
  type AnalysisSnapshot,
  type CompetitorItem,
  type CurrencyCode,
  type FounderLabProject,
  type RealSurveyEntry,
  type SimulatedPersona,
  type SkillId,
  type VwPriceSet
} from './types';

// ---------- Formatting & Utility Helpers ----------
export function parseNum(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (val === null || val === undefined || val === '') return fallback;
  const cleaned = String(val)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[,\s٬]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

export function formatNum(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val < 0 ? '−' : '';
  const abs = Math.abs(val);
  return (
    sign +
    abs.toLocaleString('fa-IR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    })
  );
}

export function formatMoney(val: number | null | undefined, currency: CurrencyCode = 'IRT'): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const cur = CURRENCIES[currency] ?? CURRENCIES.IRT;
  return `${formatNum(val, cur.decimals)} ${cur.symbol}`;
}

export function formatPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${formatNum(val, decimals)}٪`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sanitizeUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seedNum: number): () => number {
  let a = seedNum >>> 0 || 1337;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =========================================================================
// SKILL 1: FOUNDER BOARD (Hormozi, Thiel, Jobs inspired published frameworks)
// =========================================================================
export interface BoardLensResult {
  id: 'hormozi' | 'thiel' | 'jobs';
  title: string;
  framework: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  questions: string[];
  recommendations: string[];
}

export interface BoardResult {
  lenses: BoardLensResult[];
  averageScore: number;
  verdict: 'go' | 'conditional' | 'no_go';
  verdictLabel: string;
  reasons: string[];
}

export function computeBoard(project: FounderLabProject): BoardResult {
  const pr = project.profile;
  const { hormozi: h, thiel: t, jobs: j } = project.board;
  const hasProblem = pr.problem.trim().length > 15;
  const hasCustomer = pr.targetCustomer.trim().length > 10;
  const hasPrice = parseNum(pr.proposedPrice || project.cfo.salePrice) > 0;
  const hasOfferGuarantee = project.offer.guarantee.trim().length > 10;
  const compCount = project.competitors.length;

  const hScore = Math.max(
    1,
    Math.min(
      10,
      Number(
        (
          h.dreamOutcome * 0.3 +
          h.perceivedLikelihood * 0.25 +
          h.timeDelay * 0.2 +
          h.effortEase * 0.25 +
          (hasOfferGuarantee ? 0.5 : -0.4) +
          (hasPrice ? 0.2 : -0.5)
        ).toFixed(1)
      )
    )
  );

  const tScore = Math.max(
    1,
    Math.min(
      10,
      Number(
        (
          t.smallMarketFocus * 0.3 +
          t.tenXAdvantage * 0.3 +
          t.defensibility * 0.25 +
          t.timingStrength * 0.15 +
          (compCount >= 2 ? 0.3 : -0.3)
        ).toFixed(1)
      )
    )
  );

  const jScore = Math.max(
    1,
    Math.min(
      10,
      Number(
        (
          j.simplicityFocus * 0.3 +
          j.customerExperience * 0.3 +
          j.clarityOfProblem * 0.25 +
          j.craftQuality * 0.15 +
          (hasProblem && hasCustomer ? 0.3 : -0.5)
        ).toFixed(1)
      )
    )
  );

  const lenses: BoardLensResult[] = [
    {
      id: 'hormozi',
      title: 'دیدگاه طراحی پیشنهاد ارزش و قدرت فروش',
      framework: 'با الهام از چارچوب معادله ارزش (Alex Hormozi)',
      score: hScore,
      strengths: [
        h.dreamOutcome >= 7 ? 'نتیجه مطلوب برای مشتری ملموس و جذاب ارزیابی شده است.' : '',
        h.effortEase >= 7 ? 'اصطکاک و زحمت استفاده برای مشتری پایین است.' : '',
        hasOfferGuarantee ? 'ضمانت منطقی برای کاهش ریسک ذهنی خریدار تعریف شده است.' : ''
      ].filter(Boolean),
      weaknesses: [
        !hasOfferGuarantee ? 'هنوز ضمانت منطقی در بخش پیشنهاد فروش ثبت نشده است.' : '',
        h.perceivedLikelihood < 6 ? 'اطمینان مشتری از دستیابی به نتیجه هنوز نیازمند اثبات بیشتر است.' : '',
        !hasPrice ? 'قیمت پیشنهادی مشخص نشده و نسبت ارزش به قیمت قابل سنجش نیست.' : ''
      ].filter(Boolean),
      risks: [
        'اگر تفاوت ارزش پیشنهاد در ثانیه‌های اول روشن نباشد، هزینه جذب مشتری (CAC) بالا می‌رود.',
        'رقابت صرفاً روی ارزان‌فروشی، حاشیه سود را فرسایش می‌دهد.'
      ],
      questions: [
        'مشتری دقیقاً چه نتیجه قابل‌اندازه‌گیری را ظرف ۷ روز اول لمس می‌کند؟',
        'چه مانع پنهانی باعث تعویق تصمیم خرید می‌شود؟'
      ],
      recommendations: [
        'خدمات تکمیلی کم‌هزینه با ارزش درک‌شده بالا به پیشنهاد اضافه کنید.',
        'ضمانت قابل‌اجرا و کم‌ریسک برای اولین سفارش تعریف کنید.'
      ]
    },
    {
      id: 'thiel',
      title: 'دیدگاه مزیت رقابتی، بازار متمرکز و تمایز پایدار',
      framework: 'با الهام از چارچوب بازار کوچک و تمایز (Peter Thiel)',
      score: tScore,
      strengths: [
        t.smallMarketFocus >= 7 ? 'تمرکز بر یک بازار هدف کوچک و قابل تسلط در فاز اول.' : '',
        t.tenXAdvantage >= 7 ? 'تمایز معنادار نسبت به جایگزین‌های موجود تعریف شده است.' : '',
        compCount >= 2 ? 'نقشه رقبا ثبت شده و دید اولیه از بازار وجود دارد.' : ''
      ].filter(Boolean),
      weaknesses: [
        t.defensibility < 6 ? 'سپر رقابتی بلندمدت ضعیف است و مدل به سادگی قابل کپی است.' : '',
        compCount === 0 ? 'هیچ رقیب یا جایگزینی ثبت نشده؛ ادعای تمایز بدون رقیب ناپایدار است.' : '',
        !pr.targetMarket ? 'محدوده جغرافیایی یا بخش دقیق بازار هدف مشخص نشده است.' : ''
      ].filter(Boolean),
      risks: [
        'ورود به بازاری با رقبای جاافتاده بدون برتری مشخص منجر به جنگ قیمتی می‌شود.',
        'گسترش زودهنگام پیش از تسلط بر اولین گروه مشتریان، نقدینگی را مصرف می‌کند.'
      ],
      questions: [
        'کدام بخش کوچک بازار را می‌توانید در ۶ ماه اول به‌صورت محسوسی در اختیار بگیرید؟',
        'اگر رقیب با بودجه بزرگ‌تر وارد شود، چه چیزی مانع جایگزینی شما می‌شود؟'
      ],
      recommendations: [
        'بازار آغازین را دقیق‌تر و کوچک‌تر تعریف کنید.',
        'روی یکی از شکایت‌های پرتکرار مشتریان رقبا به‌عنوان نقطه تمایز اصلی تمرکز کنید.'
      ]
    },
    {
      id: 'jobs',
      title: 'دیدگاه کیفیت محصول، تجربه مشتری، تمرکز و سادگی',
      framework: 'با الهام از چارچوب تمرکز و تجربه محصول (Steve Jobs)',
      score: jScore,
      strengths: [
        j.simplicityFocus >= 7 ? 'محصول بر یک هسته اصلی ساده متمرکز است.' : '',
        j.customerExperience >= 7 ? 'تجربه کل مسیر مشتری (سفارش تا مصرف) دیده شده است.' : '',
        hasProblem ? 'مسئله محوری مشتری شفاف تعریف شده است.' : ''
      ].filter(Boolean),
      weaknesses: [
        !hasProblem ? 'شرح مسئله اصلی مشتری هنوز کامل نیست.' : '',
        j.craftQuality < 6 ? 'استاندارد کیفیت اجرا و جزئیات تحویل نیاز به ارتقا دارد.' : '',
        !pr.product ? 'تعریف محصول یا خدمت پایه هنوز ناقص است.' : ''
      ].filter(Boolean),
      risks: [
        'افزودن ویژگی‌های فرعی قبل از عالی شدن هسته اصلی محصول، تمرکز را از بین می‌برد.',
        'تجربه خرید یا پشتیبانی پیچیده حتی محصول خوب را زمین می‌زند.'
      ],
      questions: [
        'کدام ویژگی‌ها را می‌توان حذف کرد تا تجربه اصلی ساده‌تر و سریع‌تر شود؟',
        'اولین برخورد مشتری با محصول چه حسی ایجاد می‌کند؟'
      ],
      recommendations: [
        'فاز اول را محدود به یک بسته یا خدمت استاندارد با کیفیت یکنواخت نگه دارید.',
        'مسیر سفارش تا تحویل را روی ۵ کاربر واقعی تست و مراحل اضافه را حذف کنید.'
      ]
    }
  ];

  lenses.forEach((l) => {
    if (l.strengths.length === 0) l.strengths.push('پتانسیل اولیه وجود دارد، اما نیازمند تکمیل جزئیات بیشتر است.');
    if (l.weaknesses.length === 0) l.weaknesses.push('ضعف ساختاری حاد دیده نشد؛ راستی‌آزمایی با بازار واقعی ضروری است.');
  });

  const averageScore = Number(((hScore + tScore + jScore) / 3).toFixed(1));
  const minScore = Math.min(hScore, tScore, jScore);

  let verdict: BoardResult['verdict'] = 'conditional';
  let verdictLabel = 'مناسب مشروط به اصلاح';
  const reasons: string[] = [];

  if (!hasProblem || !hasCustomer || !pr.product) {
    verdict = 'conditional';
    verdictLabel = 'مناسب مشروط به اصلاح';
    reasons.push('برخی اطلاعات پایه پروژه (مسئله، محصول یا مشتری هدف) هنوز ناقص است.');
  } else if (averageScore >= 7.2 && minScore >= 6.0) {
    verdict = 'go';
    verdictLabel = 'مناسب برای شروع';
    reasons.push(`میانگین امتیاز سه دیدگاه (${formatNum(averageScore, 1)} از ۱۰) و نبود امتیاز بحرانی زیر ۶، شروع آزمایش کم‌هزینه را توجیه می‌کند.`);
  } else if (averageScore < 5.2 || minScore < 4.5) {
    verdict = 'no_go';
    verdictLabel = 'فعلاً نامناسب';
    reasons.push(`میانگین امتیاز (${formatNum(averageScore, 1)}) یا ضعف جدی در یکی از ستون‌ها (حداقل ${formatNum(minScore, 1)}) نیازمند بازطراحی اساسی است.`);
  } else {
    verdict = 'conditional';
    verdictLabel = 'مناسب مشروط به اصلاح';
    reasons.push(`ایده ظرفیت دارد (میانگین ${formatNum(averageScore, 1)} از ۱۰)، اما پیش از سرمایه‌گذاری باید نقاط ضعف ثبت‌شده اصلاح شوند.`);
  }

  if (compCount === 0) reasons.push('در گام بعدی حداقل ۲ تا ۳ رقیب یا جایگزین را ثبت کنید.');
  if (!hasPrice) reasons.push('تعیین قیمت پیشنهادی برای ارزیابی دقیق‌تر ضروری است.');

  return { lenses, averageScore, verdict, verdictLabel, reasons };
}

// =========================================================================
// SKILL 2: COMPETITOR ANALYSIS
// =========================================================================
export function analyzeCompetitors(project: FounderLabProject) {
  const list = project.competitors;
  const direct = list.filter((c) => c.group === 'direct');
  const indirect = list.filter((c) => c.group === 'indirect');
  const substitute = list.filter((c) => c.group === 'substitute');

  const priced = list.filter((c) => c.price > 0);
  const directPriced = direct.filter((c) => c.price > 0);
  const avgAllPrice = priced.length ? priced.reduce((s, c) => s + c.price, 0) / priced.length : 0;
  const avgDirectPrice = directPriced.length
    ? directPriced.reduce((s, c) => s + c.price, 0) / directPriced.length
    : avgAllPrice;

  let intensity = 'نامشخص (رقبا ثبت نشده‌اند)';
  if (list.length > 0) {
    if (direct.length >= 4) intensity = 'بسیار بالا (رقابت مستقیم فشرده)';
    else if (direct.length >= 2) intensity = 'متوسط تا بالا (نیازمند تمایز شفاف)';
    else if (direct.length === 1) intensity = 'متوسط (فضای مناسب برای جایگاه‌یابی متمایز)';
    else intensity = 'رقابت غیرمستقیم (مشتریان فعلاً از جایگزین‌ها استفاده می‌کنند)';
  }

  const complaints = list.map((c) => c.complaints.trim()).filter(Boolean);
  const weaknesses = list.map((c) => c.weakness.trim()).filter(Boolean);

  let topThreat: CompetitorItem | null = null;
  if (list.length > 0) {
    const myPrice = parseNum(project.cfo.salePrice || project.profile.proposedPrice);
    const scored = list.map((c) => {
      let threat = c.group === 'direct' ? 5 : c.group === 'indirect' ? 3 : 2;
      if (c.advantage.length > 10) threat += 2;
      if (c.marketing.length > 8) threat += 1;
      if (myPrice > 0 && c.price > 0 && c.price <= myPrice) threat += 2;
      return { c, threat };
    });
    scored.sort((a, b) => b.threat - a.threat);
    topThreat = scored[0].c;
  }

  const verifiedCount = list.filter((c) => c.verified && sanitizeUrl(c.sourceUrl)).length;
  return {
    total: list.length,
    counts: { direct: direct.length, indirect: indirect.length, substitute: substitute.length },
    avgAllPrice,
    avgDirectPrice,
    intensity,
    complaints,
    weaknesses,
    topThreat,
    verifiedCount,
    unverifiedCount: list.length - verifiedCount,
    unmetNeeds:
      complaints.length > 0
        ? complaints.slice(0, 3).map((c) => `پاسخ به نارضایتی ثبت‌شده: «${c}»`)
        : ['هنوز شکایات مشتریان رقبا ثبت نشده است؛ ثبت آن‌ها کلید یافتن شکاف بازار است.'],
    differentiationOpportunity:
      weaknesses.length > 0
        ? `تمرکز بر حل ضعف‌های تکرارشونده رقبا (${weaknesses.slice(0, 2).join(' | ')}) با تجربه خرید ساده‌تر و شفاف‌تر.`
        : 'با تکمیل نقاط ضعف رقبا، فرصت تمایز دقیق‌تر مشخص می‌شود.'
  };
}

// =========================================================================
// SKILL 3: CONSUMER PANEL (20/50/100 Algorithmic Simulation)
// =========================================================================
const FIRST_NAMES = [
  'سارا', 'علی', 'نیلوفر', 'امیر', 'مهسا', 'رضا', 'پریسا', 'محمد', 'نگار', 'حسین',
  'شیوا', 'پویا', 'مریم', 'کیان', 'آزاده', 'فرهاد', 'الهام', 'سینا', 'بهاره', 'آرش',
  'زهرا', 'مهدی', 'نازنین', 'سعید', 'لیلا', 'بهمن', 'هدی', 'شایان', 'مینا', 'کاوه'
];
const LAST_NAMES = [
  'رضایی', 'محمدی', 'کریمی', 'موسوی', 'احمدی', 'حسینی', 'صادقی', 'جعفری', 'نوری', 'مرادی',
  'شریفی', 'قاسمی', 'کاظمی', 'رحیمی', 'تهرانی', 'اکبری', 'باقری', 'سلیمانی', 'نجفی', 'امیری'
];
const SEGMENTS = [
  { id: 'quality', label: 'کیفیت‌محور', income: 'بالا', financial: 'پایدار و انعطاف‌پذیر', sensitivityRange: [2, 5] as const, wtpMult: [1.05, 1.45] as const, priority: 'کیفیت و صرفه‌جویی در زمان' },
  { id: 'value', label: 'ارزش‌محور (منطقی)', income: 'متوسط به بالا', financial: 'متعادل با بودجه‌بندی منظم', sensitivityRange: [4, 7] as const, wtpMult: [0.85, 1.2] as const, priority: 'نسبت کیفیت به قیمت و شفافیت' },
  { id: 'budget', label: 'حساس به قیمت', income: 'متوسط', financial: 'محدود در هزینه‌های غیرضروری', sensitivityRange: [7, 10] as const, wtpMult: [0.55, 0.92] as const, priority: 'قیمت اقتصادی و دوام' },
  { id: 'convenience', label: 'راحتی‌طلب و پرمشغله', income: 'متوسط به بالا', financial: 'حاضر به پرداخت برای راحتی', sensitivityRange: [3, 6] as const, wtpMult: [0.95, 1.32] as const, priority: 'سرعت، سادگی و تحویل بدون دردسر' },
  { id: 'skeptic', label: 'محتاط و سخت‌اعتماد', income: 'متوسط', financial: 'محتاط در خرید از برندهای جدید', sensitivityRange: [6, 9] as const, wtpMult: [0.7, 1.05] as const, priority: 'ضمانت، تجربه دیگران و تست کم‌ریسک' }
];
const BUYING_HABITS = [
  'قبل از خرید نقدها و مقایسه رقبا را دقیق می‌خواند',
  'اگر پیشنهاد واضح و سریع باشد همان لحظه تصمیم می‌گیرد',
  'ابتدا نسخه کوچک یا آزمایشی را امتحان می‌کند',
  'از طریق توصیه دوستان و همکاران خرید می‌کند',
  'به‌صورت دوره‌ای و برنامه‌ریزی‌شده خرید می‌کند'
];
const OBJECTION_POOL = [
  'قیمت نسبت به جایگزین فعلی کمی بالا به نظر می‌رسد',
  'به برند جدید هنوز اعتماد کامل ندارم و نیاز به ضمانت دارم',
  'مطمئن نیستم کیفیت در سفارش‌های بعدی یکنواخت بماند',
  'فعلاً به روش جایگزین خودم عادت کرده‌ام و تغییر آن زمان‌بر است',
  'ترجیح می‌دهم اول یک بسته یا تست کوچک‌تر امتحان کنم',
  'زمان ارسال و پشتیبانی در صورت بروز مشکل برایم مبهم است'
];
const FLIP_POOL = [
  'وجود ضمانت واقعی تعویض یا بازگشت وجه در سفارش اول',
  'ارائه نسخه آزمایشی کم‌هزینه برای تست کیفیت قبل از خرید اصلی',
  'شفافیت کامل در جزئیات محصول و نمایش نظرات مشتریان واقعی',
  'کاهش ۱۰ تا ۱۵ درصدی قیمت یا افزودن خدمات تکمیلی ملموس',
  'تضمین زمان تحویل مشخص و پشتیبانی سریع'
];

export function generateConsumerPanel(project: FounderLabProject, size: 20 | 50 | 100 = 100, seed = 4219): SimulatedPersona[] {
  const count = [20, 50, 100].includes(size) ? size : 100;
  const pr = project.profile;
  const price = parseNum(project.cfo.salePrice || pr.proposedPrice) || 500000;
  const comp = analyzeCompetitors(project);
  const marketAnchor = comp.avgDirectPrice > 0 ? comp.avgDirectPrice : price;

  const offerItems = project.offer.items;
  const offerValueAvg = offerItems.length
    ? offerItems.reduce((s, it) => s + parseNum(it.valueScore, 5), 0) / offerItems.length
    : 0;
  const hasGuarantee = project.offer.guarantee.trim().length > 10;
  const hasLaunchOffer = project.offer.launchOffer.trim().length > 10;
  const offerBoost = (offerItems.length > 0 ? Math.min(1.6, offerValueAvg * 0.16) : 0) + (hasGuarantee ? 0.9 : 0) + (hasLaunchOffer ? 0.5 : 0);

  const substitutes = project.competitors.map((c) => c.name).filter(Boolean);
  if (substitutes.length === 0) substitutes.push('جایگزین رایج فعلی در بازار', 'روش سنتی / دستی');

  const rng = createRng(hashString(`${project.id}|${seed}|${pr.targetCustomer}|${pr.product}`));
  const step = price >= 10000 ? 1000 : price >= 100 ? 10 : 1;
  const roundToStep = (v: number) => Math.max(step, Math.round(v / step) * step);

  const personas: SimulatedPersona[] = [];
  for (let i = 0; i < count; i++) {
    const seg = SEGMENTS[Math.floor(rng() * SEGMENTS.length)];
    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const age = 22 + Math.floor(rng() * 30);
    const priceSensitivity = seg.sensitivityRange[0] + Math.floor(rng() * (seg.sensitivityRange[1] - seg.sensitivityRange[0] + 1));
    const baseTrust = Math.max(2, Math.min(10, Math.round(4 + rng() * 4 + (hasGuarantee ? 1.5 : 0) - (seg.id === 'skeptic' ? 2 : 0))));

    const fairPrice = roundToStep(marketAnchor * (seg.wtpMult[0] + rng() * (seg.wtpMult[1] - seg.wtpMult[0])));
    const tooCheap = roundToStep(fairPrice * (0.42 + rng() * 0.14));
    const cheap = Math.max(tooCheap + step, roundToStep(fairPrice * (0.72 + rng() * 0.14)));
    const expensive = Math.max(cheap + step, roundToStep(fairPrice * (1.02 + rng() * 0.18)));
    const tooExpensive = Math.max(expensive + step, roundToStep(fairPrice * (1.28 + rng() * 0.25)));

    const priceRatio = price / fairPrice;
    const priceScore = priceRatio <= 0.85 ? 9.2 : priceRatio <= 1.0 ? 7.8 : priceRatio <= 1.15 ? 5.8 : priceRatio <= 1.35 ? 3.5 : 1.8;
    const sensitivityPenalty = priceRatio > 1 ? (priceRatio - 1) * priceSensitivity * 0.45 : 0;
    const score = Math.max(
      0,
      Math.min(10, Number((priceScore * 0.48 + baseTrust * 0.32 + Math.min(2.5, offerBoost) * 0.9 - sensitivityPenalty).toFixed(2)))
    );

    let decision: SimulatedPersona['decision'] = 'no';
    let decisionLabel = 'عدم خرید';
    if (score >= 6.4 && price <= tooExpensive) {
      decision = 'buy';
      decisionLabel = 'احتمال خرید';
    } else if (score >= 4.9 && price <= tooExpensive * 1.05) {
      decision = 'maybe';
      decisionLabel = 'مشروط / نیازمند اقناع';
    }

    let objection = OBJECTION_POOL[Math.floor(rng() * OBJECTION_POOL.length)];
    if (price > expensive) objection = 'قیمت پیشنهادی بالاتر از بودجه ذهنی من برای این محصول است';
    else if (baseTrust <= 4 && !hasGuarantee) objection = 'به برند جدید هنوز اعتماد کامل ندارم و نیاز به ضمانت دارم';

    const flipFactor =
      price > expensive
        ? 'کاهش ۱۰ تا ۱۵ درصدی قیمت یا ارائه بسته اقتصادی کوچک‌تر'
        : !hasGuarantee
          ? 'وجود ضمانت واقعی تعویض یا بازگشت وجه در سفارش اول'
          : FLIP_POOL[Math.floor(rng() * FLIP_POOL.length)];

    personas.push({
      id: `p_${i + 1}`,
      index: i + 1,
      name: `${first} ${last}`,
      age,
      segmentId: seg.id,
      segment: seg.label,
      income: seg.income,
      financialStatus: seg.financial,
      need: pr.problem ? `حل مسئله: ${pr.problem.slice(0, 75)}${pr.problem.length > 75 ? '…' : ''}` : 'نیاز به راهکار قابل‌اعتماد و سریع‌تر',
      buyingBehavior: BUYING_HABITS[Math.floor(rng() * BUYING_HABITS.length)],
      priceSensitivity,
      trustLevel: baseTrust,
      currentSubstitute: substitutes[Math.floor(rng() * substitutes.length)],
      priority: seg.priority,
      objection,
      flipFactor,
      vw: { tooCheap, cheap, expensive, tooExpensive },
      score,
      decision,
      decisionLabel,
      isSimulated: true
    });
  }
  return personas;
}

export function summarizePanel(personas: SimulatedPersona[]) {
  const total = personas.length;
  if (total === 0) {
    return {
      total: 0,
      buyers: 0,
      maybes: 0,
      nonBuyers: 0,
      buyRate: 0,
      topSegment: null as { segment: string; total: number; buyers: number; buyRate: number } | null,
      segmentStats: [] as { segment: string; total: number; buyers: number; buyRate: number }[],
      topObjections: [] as { text: string; count: number }[],
      topFlips: [] as { text: string; count: number }[],
      acceptableRange: { min: 0, max: 0 }
    };
  }
  const buyers = personas.filter((p) => p.decision === 'buy').length;
  const maybes = personas.filter((p) => p.decision === 'maybe').length;
  const nonBuyers = total - buyers - maybes;

  const segMap = new Map<string, { segment: string; total: number; buyers: number }>();
  const objMap = new Map<string, number>();
  const flipMap = new Map<string, number>();

  for (const p of personas) {
    const cur = segMap.get(p.segment) ?? { segment: p.segment, total: 0, buyers: 0 };
    cur.total++;
    if (p.decision === 'buy') cur.buyers++;
    segMap.set(p.segment, cur);

    if (p.decision !== 'buy') {
      objMap.set(p.objection, (objMap.get(p.objection) ?? 0) + 1);
      flipMap.set(p.flipFactor, (flipMap.get(p.flipFactor) ?? 0) + 1);
    }
  }

  const segmentStats = Array.from(segMap.values())
    .map((s) => ({ ...s, buyRate: (s.buyers / s.total) * 100 }))
    .sort((a, b) => b.buyRate - a.buyRate);

  const topObjections = Array.from(objMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topFlips = Array.from(flipMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const cheaps = personas.map((p) => p.vw.cheap).sort((a, b) => a - b);
  const exps = personas.map((p) => p.vw.expensive).sort((a, b) => a - b);
  const mid = Math.floor(total / 2);

  return {
    total,
    buyers,
    maybes,
    nonBuyers,
    buyRate: (buyers / total) * 100,
    topSegment: segmentStats[0] ?? null,
    segmentStats,
    topObjections,
    topFlips,
    acceptableRange: { min: cheaps[mid] ?? 0, max: exps[mid] ?? 0 }
  };
}

export function summarizeRealSurvey(entries: RealSurveyEntry[]) {
  const total = entries.length;
  if (total === 0) return { total: 0, buyers: 0, maybes: 0, nonBuyers: 0, buyRate: 0 };
  const buyers = entries.filter((e) => e.decision === 'buy').length;
  const maybes = entries.filter((e) => e.decision === 'maybe').length;
  return { total, buyers, maybes, nonBuyers: total - buyers - maybes, buyRate: (buyers / total) * 100 };
}

// =========================================================================
// SKILL 4: VAN WESTENDORP PRICE SENSITIVITY METER
// =========================================================================
export interface VwPoint {
  price: number;
  tooCheap: number;
  notCheap: number;
  notExpensive: number;
  tooExpensive: number;
}

export interface VwResult {
  valid: boolean;
  count: number;
  reason?: string;
  pmc: number;
  pme: number;
  opp: number;
  ipp: number;
  oppPct: number;
  points: VwPoint[];
}

export function computeVanWestendorp(rows: VwPriceSet[]): VwResult {
  const valid = rows.filter(
    (r) => r.tooCheap > 0 && r.cheap >= r.tooCheap && r.expensive >= r.cheap && r.tooExpensive >= r.expensive
  );
  if (valid.length < 3) {
    return {
      valid: false,
      count: valid.length,
      reason: 'برای محاسبه Van Westendorp حداقل ۳ پاسخ معتبر با ترتیب صحیح قیمت نیاز است.',
      pmc: 0,
      pme: 0,
      opp: 0,
      ipp: 0,
      oppPct: 0,
      points: []
    };
  }

  const n = valid.length;
  const priceSet = new Set<number>();
  valid.forEach((r) => {
    priceSet.add(r.tooCheap);
    priceSet.add(r.cheap);
    priceSet.add(r.expensive);
    priceSet.add(r.tooExpensive);
  });
  const grid = Array.from(priceSet).sort((a, b) => a - b);

  const points: VwPoint[] = grid.map((p) => {
    let tc = 0, nc = 0, ne = 0, te = 0;
    for (const r of valid) {
      if (r.tooCheap >= p) tc++;
      if (r.cheap <= p) nc++;
      if (r.expensive >= p) ne++;
      if (r.tooExpensive <= p) te++;
    }
    return {
      price: p,
      tooCheap: (tc / n) * 100,
      notCheap: (nc / n) * 100,
      notExpensive: (ne / n) * 100,
      tooExpensive: (te / n) * 100
    };
  });

  const intersect = (decKey: keyof Omit<VwPoint, 'price'>, incKey: keyof Omit<VwPoint, 'price'>) => {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const d1 = p1[decKey] - p1[incKey];
      const d2 = p2[decKey] - p2[incKey];
      if (d1 === 0) return { price: p1.price, pct: p1[decKey] };
      if (d1 > 0 && d2 <= 0) {
        const t = d1 / (d1 - d2);
        return {
          price: Math.round(p1.price + t * (p2.price - p1.price)),
          pct: Number((p1[decKey] + t * (p2[decKey] - p1[decKey])).toFixed(1))
        };
      }
    }
    let best = points[0];
    let bestDiff = Infinity;
    for (const pt of points) {
      const diff = Math.abs(pt[decKey] - pt[incKey]);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = pt;
      }
    }
    return { price: best.price, pct: Number(((best[decKey] + best[incKey]) / 2).toFixed(1)) };
  };

  const pmc = intersect('tooCheap', 'notCheap');
  const pme = intersect('notExpensive', 'tooExpensive');
  const opp = intersect('tooCheap', 'tooExpensive');
  const ipp = intersect('notExpensive', 'notCheap');

  return {
    valid: true,
    count: n,
    pmc: pmc.price,
    pme: pme.price,
    opp: opp.price,
    ipp: ipp.price,
    oppPct: opp.pct,
    points
  };
}

export function getActiveVwData(project: FounderLabProject) {
  const realCombined = [
    ...project.realSurvey.filter((r) => r.vw.tooCheap > 0).map((r) => r.vw),
    ...project.pricing.customVwRows
  ];
  const simVw = project.panel.personas.map((p) => p.vw);
  const mode = project.pricing.dataSource;

  let sourceUsed: 'real' | 'simulated' = 'simulated';
  let rows = simVw;
  if (mode === 'real') {
    sourceUsed = 'real';
    rows = realCombined;
  } else if (mode === 'simulated') {
    sourceUsed = 'simulated';
    rows = simVw;
  } else if (realCombined.length >= 3) {
    sourceUsed = 'real';
    rows = realCombined;
  }

  return {
    sourceUsed,
    isSimulated: sourceUsed === 'simulated',
    realCount: realCombined.length,
    simCount: simVw.length,
    vw: computeVanWestendorp(rows)
  };
}

// =========================================================================
// SKILL 5 & 6: OFFER METRICS + CFO UNIT ECONOMICS & 3 STRESS SCENARIOS
// =========================================================================
export function computeOfferMetrics(project: FounderLabProject) {
  const items = project.offer.items;
  const totalCostPerUnit = items.reduce((s, it) => s + parseNum(it.costPerUnit), 0);
  const avgValueScore = items.length
    ? Number((items.reduce((s, it) => s + parseNum(it.valueScore, 5), 0) / items.length).toFixed(1))
    : 0;
  return { itemCount: items.length, totalCostPerUnit, avgValueScore };
}

export interface CfoMonthRow {
  month: number;
  units: number;
  revenue: number;
  varCost: number;
  grossProfit: number;
  fixedCost: number;
  opProfit: number;
  cumCash: number;
}

export interface CfoCoreResult {
  missingFields: string[];
  isComplete: boolean;
  salePrice: number;
  commissionUnit: number;
  offerUnitCost: number;
  totalVarUnit: number;
  contributionUnit: number;
  contributionMarginPct: number;
  fixedMonthly: number;
  breakEvenUnitsMonthly: number;
  breakEvenRevenueMonthly: number;
  breakEvenUnitsDaily: number;
  dailyCapacity: number;
  workingDays: number;
  fitsCapacity: boolean;
  months: CfoMonthRow[];
  year1Revenue: number;
  year1VarCost: number;
  year1GrossProfit: number;
  year1OperatingProfit: number;
  year1NetMarginPct: number;
  initialCapital: number;
  operatingCashBuffer: number;
  totalCapitalNeeded: number;
  paybackMonth: number | null;
}

export interface CfoResult extends CfoCoreResult {
  scenarios: { id: string; title: string; result: CfoCoreResult }[];
}

export function runCfoModel(params: FounderLabProject['cfo'] & { offerUnitCost: number }): CfoCoreResult {
  const salePrice = parseNum(params.salePrice);
  const varUnit = parseNum(params.variableCostPerUnit);
  const packShip = parseNum(params.packagingShippingCost);
  const commPct = parseNum(params.commissionPercent);
  const commFixed = parseNum(params.commissionFixed);
  const offerUnitCost = parseNum(params.offerUnitCost);

  const fixedMonthly =
    parseNum(params.rent) + parseNum(params.salaries) + parseNum(params.softwareServices) + parseNum(params.otherFixed);
  const initialCapital = parseNum(params.initialCapital);
  const dailyCapacity = parseNum(params.dailyCapacity);
  const workingDays = Math.max(1, parseNum(params.workingDaysPerMonth, 26));
  const forecast =
    params.monthlyForecast.length === 12
      ? params.monthlyForecast.map((v) => Math.max(0, parseNum(v)))
      : Array<number>(12).fill(0);

  const missingFields: string[] = [];
  if (salePrice <= 0) missingFields.push('قیمت فروش');
  if (varUnit <= 0) missingFields.push('هزینه متغیر هر محصول');
  if (fixedMonthly <= 0) missingFields.push('هزینه ثابت ماهانه');
  if (forecast.every((u) => u <= 0)) missingFields.push('پیش‌بینی فروش ۱۲ ماهه');

  const commissionUnit = salePrice * (commPct / 100) + commFixed;
  const totalVarUnit = varUnit + packShip + commissionUnit + offerUnitCost;
  const contributionUnit = salePrice - totalVarUnit;
  const contributionMarginPct = salePrice > 0 ? (contributionUnit / salePrice) * 100 : 0;

  const breakEvenUnitsMonthly = contributionUnit > 0 ? Math.ceil(fixedMonthly / contributionUnit) : Infinity;
  const breakEvenRevenueMonthly = contributionUnit > 0 ? fixedMonthly / (contributionUnit / salePrice) : Infinity;
  const breakEvenUnitsDaily = Number.isFinite(breakEvenUnitsMonthly) ? breakEvenUnitsMonthly / workingDays : Infinity;
  const fitsCapacity = dailyCapacity > 0 && Number.isFinite(breakEvenUnitsDaily) && breakEvenUnitsDaily <= dailyCapacity;

  const months: CfoMonthRow[] = [];
  let year1Revenue = 0;
  let year1VarCost = 0;
  let year1GrossProfit = 0;
  let year1OperatingProfit = 0;
  let cumOpProfit = 0;
  let minCumOpProfit = 0;
  let cumCash = -initialCapital;
  let paybackMonth: number | null = null;

  for (let m = 0; m < 12; m++) {
    const units = forecast[m];
    const revenue = units * salePrice;
    const varCost = units * totalVarUnit;
    const grossProfit = revenue - varCost;
    const opProfit = grossProfit - fixedMonthly;
    const prevCumCash = cumCash;
    cumOpProfit += opProfit;
    if (cumOpProfit < minCumOpProfit) minCumOpProfit = cumOpProfit;
    cumCash += opProfit;

    if (paybackMonth === null && cumCash >= 0 && opProfit > 0) {
      const frac = prevCumCash < 0 ? Math.abs(prevCumCash) / opProfit : 0;
      paybackMonth = Number((m + frac).toFixed(1));
    }

    year1Revenue += revenue;
    year1VarCost += varCost;
    year1GrossProfit += grossProfit;
    year1OperatingProfit += opProfit;

    months.push({ month: m + 1, units, revenue, varCost, grossProfit, fixedCost: fixedMonthly, opProfit, cumCash });
  }

  const year1NetMarginPct = year1Revenue > 0 ? (year1OperatingProfit / year1Revenue) * 100 : 0;
  const operatingCashBuffer = Math.max(0, -minCumOpProfit);
  const totalCapitalNeeded = initialCapital + operatingCashBuffer;

  return {
    missingFields,
    isComplete: missingFields.length === 0,
    salePrice,
    commissionUnit,
    offerUnitCost,
    totalVarUnit,
    contributionUnit,
    contributionMarginPct,
    fixedMonthly,
    breakEvenUnitsMonthly,
    breakEvenRevenueMonthly,
    breakEvenUnitsDaily,
    dailyCapacity,
    workingDays,
    fitsCapacity,
    months,
    year1Revenue,
    year1VarCost,
    year1GrossProfit,
    year1OperatingProfit,
    year1NetMarginPct,
    initialCapital,
    operatingCashBuffer,
    totalCapitalNeeded,
    paybackMonth
  };
}

export function computeCfo(project: FounderLabProject): CfoResult {
  const offerMetrics = computeOfferMetrics(project);
  const offerUnitCost = project.offer.applyOfferCostToCfo ? offerMetrics.totalCostPerUnit : 0;
  const baseParams = {
    ...project.cfo,
    salePrice: parseNum(project.cfo.salePrice || project.profile.proposedPrice),
    initialCapital: parseNum(project.cfo.initialCapital || project.profile.initialCapital),
    offerUnitCost
  };

  const base = runCfoModel(baseParams);
  const scenarios = [
    {
      id: 'price_down_10',
      title: 'سناریو ۱: کاهش ۱۰٪ قیمت فروش',
      result: runCfoModel({ ...baseParams, salePrice: baseParams.salePrice * 0.9 })
    },
    {
      id: 'volume_down_20',
      title: 'سناریو ۲: کاهش ۲۰٪ حجم فروش',
      result: runCfoModel({
        ...baseParams,
        monthlyForecast: baseParams.monthlyForecast.map((u) => Math.round(u * 0.8))
      })
    },
    {
      id: 'var_up_15',
      title: 'سناریو ۳: افزایش ۱۵٪ هزینه متغیر',
      result: runCfoModel({
        ...baseParams,
        variableCostPerUnit: baseParams.variableCostPerUnit * 1.15,
        packagingShippingCost: baseParams.packagingShippingCost * 1.15
      })
    }
  ];

  return { ...base, scenarios };
}

export function computeOpsCosts(project: FounderLabProject) {
  const ops = project.operations;
  return {
    equipmentTotal: ops.equipment.reduce((s, x) => s + parseNum(x.cost), 0),
    unitMaterialTotal: ops.materials.reduce((s, x) => s + parseNum(x.unitCost), 0),
    monthlyPayrollTotal: ops.staff.reduce((s, x) => s + parseNum(x.monthlySalary), 0)
  };
}

export function computeSkillCompletion(project: FounderLabProject): Record<SkillId, boolean> {
  const pr = project.profile;
  const cfo = computeCfo(project);
  const vwData = getActiveVwData(project);
  return {
    board: Boolean(pr.name && pr.problem && pr.product),
    competitors: project.competitors.length >= 1,
    panel: project.panel.personas.length > 0,
    pricing: vwData.vw.valid,
    offer: Boolean(project.offer.coreProblem && project.offer.items.length > 0),
    cfo: cfo.isComplete,
    marketing: Boolean(project.marketing.positioning && project.marketing.channels.length > 0),
    brand: Boolean(project.brand.slogan && project.brand.topThree.length > 0),
    operations: project.operations.equipment.length > 0 || project.operations.materials.length > 0,
    launch: Boolean(project.launch.experiment.hypothesis),
    plan: true
  };
}

export interface BusinessPlanStatus {
  code: 'incomplete' | 'needs_revision' | 'promising' | 'validated';
  label: string;
  tone: 'neutral' | 'danger' | 'warn' | 'success';
  summary: string;
  reasons: string[];
}

export function computeBusinessPlanStatus(project: FounderLabProject): BusinessPlanStatus {
  const pr = project.profile;
  const cfo = computeCfo(project);
  const board = computeBoard(project);
  const panel = summarizePanel(project.panel.personas);
  const exp = project.launch.experiment;

  const missing: string[] = [];
  if (!pr.name || !pr.problem || !pr.product || !pr.targetCustomer) missing.push('تکمیل پروفایل پایه ایده');
  if (!cfo.isComplete) missing.push('تکمیل ورودی‌های کلیدی مدیر مالی (CFO)');
  if (panel.total === 0) missing.push('اجرای پنل مشتریان فرضی');

  if (missing.length > 0) {
    return {
      code: 'incomplete',
      label: 'ناقص',
      tone: 'neutral',
      summary: 'اطلاعات ضروری برای نتیجه‌گیری معتبر هنوز تکمیل نشده است.',
      reasons: missing
    };
  }

  const redFlags: string[] = [];
  if (cfo.contributionUnit <= 0) redFlags.push('سود مشارکت هر واحد صفر یا منفی است (فروش بیشتر باعث زیان می‌شود).');
  if (cfo.dailyCapacity > 0 && !cfo.fitsCapacity) redFlags.push('نقطه سربه‌سر روزانه از ظرفیت فروش روزانه بیشتر است.');
  if (cfo.year1OperatingProfit <= 0) redFlags.push('سود عملیاتی پیش‌بینی‌شده سال اول منفی است.');
  if (board.verdict === 'no_go') redFlags.push('ارزیابی هیئت‌مدیره وضعیت ایده را فعلاً نامناسب تشخیص داده است.');
  if (panel.buyRate < 18) redFlags.push(`نرخ تمایل در شبیه‌سازی فرضی پایین است (${formatPct(panel.buyRate)}).`);
  if (exp.status === 'failed') redFlags.push('آزمایش واقعی بازار به معیار موفقیت تعیین‌شده نرسید.');

  if (redFlags.length > 0) {
    return {
      code: 'needs_revision',
      label: 'نیازمند اصلاح',
      tone: 'danger',
      summary: 'یک یا چند معیار مهم اقتصادی یا بازار نامناسب است و پیش از شروع نیاز به اصلاح دارد.',
      reasons: redFlags
    };
  }

  if (exp.status === 'validated' && parseNum(exp.actualCount) >= parseNum(exp.targetCount, 1)) {
    return {
      code: 'validated',
      label: 'اعتبارسنجی‌شده در آزمایش',
      tone: 'success',
      summary: 'اقتصاد واحد سالم است و آزمایش واقعی با مشتریان معیار موفقیت از پیش تعیین‌شده را کسب کرده است.',
      reasons: [
        `آزمایش واقعی (${exp.type}) با ثبت ${formatNum(exp.actualCount)} مورد موفق (هدف: ${formatNum(exp.targetCount)}) تأیید شده است.`,
        `سود مشارکت هر واحد مثبت (${formatMoney(cfo.contributionUnit, project.currency)}) و سود عملیاتی سال اول مثبت است.`
      ]
    };
  }

  return {
    code: 'promising',
    label: 'امیدوارکننده (نیازمند آزمایش واقعی)',
    tone: 'warn',
    summary: 'اقتصاد واحد و شبیه‌سازی اولیه شرایط مناسبی دارند، اما بازار واقعی هنوز تأیید نشده است. هیچ ایده‌ای صرفاً با پنل فرضی اعتبارسنجی‌شده محسوب نمی‌شود.',
    reasons: [
      `سود مشارکت هر واحد: ${formatMoney(cfo.contributionUnit, project.currency)} و حاشیه خالص سال اول: ${formatPct(cfo.year1NetMarginPct)}.`,
      `نرخ تمایل در شبیه‌سازی فرضی: ${formatPct(panel.buyRate)} (این عدد احتمال واقعی فروش نیست).`,
      'گام ضروری بعدی: اجرای آزمایش کم‌هزینه واقعی (پیش‌فروش یا سفارش اولیه) و ثبت نتیجه در بخش راه‌اندازی.'
    ]
  };
}

export function buildSnapshot(project: FounderLabProject, reason: string): AnalysisSnapshot {
  const cfo = computeCfo(project);
  const panel = summarizePanel(project.panel.personas);
  const board = computeBoard(project);
  const plan = computeBusinessPlanStatus(project);
  return {
    id: uid('snap'),
    createdAt: new Date().toISOString(),
    reason: reason || 'ثبت نسخه تحلیل',
    price: parseNum(project.cfo.salePrice || project.profile.proposedPrice),
    offerItemsCount: project.offer.items.length,
    boardAvg: board.averageScore,
    boardVerdict: board.verdictLabel,
    simBuyRate: panel.total > 0 ? panel.buyRate : null,
    unitMargin: cfo.contributionUnit,
    breakEvenDaily: Number.isFinite(cfo.breakEvenUnitsDaily) ? cfo.breakEvenUnitsDaily : null,
    year1Profit: cfo.year1OperatingProfit,
    planStatus: plan.label
  };
}
