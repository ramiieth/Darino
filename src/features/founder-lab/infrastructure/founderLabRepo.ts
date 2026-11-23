/** ============================================================
 * Founder Lab — Repository (Neon PostgreSQL /api/founderLab + localStorage cache)
 * Syncs seamlessly with Darino's Neon DB when configured & logged in,
 * while maintaining instant offline persistence in localStorage.
 * ============================================================ */
import { generateConsumerPanel, todayIso, uid } from '../domain/engines';
import type { FounderLabProject } from '../domain/types';

const LOCAL_KEY = 'darino_founder_lab_v1';

export function createEmptyProject(name = ''): FounderLabProject {
  const now = new Date().toISOString();
  return {
    id: uid('fl'),
    createdAt: now,
    updatedAt: now,
    currency: 'IRT',
    profile: {
      name,
      description: '',
      problem: '',
      product: '',
      targetCustomer: '',
      targetMarket: '',
      revenueModel: 'فروش مستقیم تکی',
      proposedPrice: 0,
      initialCapital: 0,
      operatingCosts: 0,
      constraints: '',
      stage: 'idea'
    },
    board: {
      hormozi: { dreamOutcome: 7, perceivedLikelihood: 6, timeDelay: 5, effortEase: 6, notes: '' },
      thiel: { smallMarketFocus: 6, tenXAdvantage: 5, defensibility: 5, timingStrength: 7, notes: '' },
      jobs: { simplicityFocus: 7, customerExperience: 7, clarityOfProblem: 7, craftQuality: 6, notes: '' },
      lastRunAt: null
    },
    competitors: [],
    panel: { size: 100, seed: 4219, personas: [], lastRunAt: null, lastRunNote: '' },
    realSurvey: [],
    pricing: {
      dataSource: 'auto',
      customVwRows: [],
      tiers: [
        { id: 'eco', name: 'اقتصادی', price: 0, unitCost: 0, features: 'نسخه پایه با امکانات ضروری' },
        { id: 'std', name: 'استاندارد', price: 0, unitCost: 0, features: 'نسخه اصلی پیشنهادی برای اکثر مشتریان' },
        { id: 'pro', name: 'حرفه‌ای', price: 0, unitCost: 0, features: 'نسخه کامل همراه با خدمات تکمیلی و پشتیبانی اولویت‌دار' }
      ]
    },
    offer: {
      coreProblem: '',
      desiredOutcome: '',
      mainBarriers: '',
      competitiveEdge: '',
      guarantee: '',
      launchOffer: '',
      applyOfferCostToCfo: true,
      items: []
    },
    cfo: {
      salePrice: 0,
      variableCostPerUnit: 0,
      packagingShippingCost: 0,
      commissionPercent: 0,
      commissionFixed: 0,
      rent: 0,
      salaries: 0,
      softwareServices: 0,
      otherFixed: 0,
      initialCapital: 0,
      dailyCapacity: 0,
      workingDaysPerMonth: 26,
      monthlyForecast: Array<number>(12).fill(0)
    },
    marketing: {
      positioning: '',
      targetAudienceSummary: '',
      adBudgetMonthly: 0,
      hooks: [],
      contentIdeas: [],
      channels: [],
      plan30Days: [],
      kpis: []
    },
    brand: {
      candidates: [],
      topThree: [],
      slogan: '',
      voice: '',
      personality: '',
      promise: '',
      colors: [
        { name: 'اصلی', hex: '#2E5BFF' },
        { name: 'ثانویه', hex: '#0E1530' },
        { name: 'تأکید', hex: '#0F9D6B' },
        { name: 'پس‌زمینه', hex: '#F6F8FC' }
      ],
      fonts: 'Vazirmatn FD (فونت رسمی دارینو)',
      logoGuide: '',
      visualExperience: '',
      checks: { domainIr: false, domainCom: false, trademark: false, socialHandles: false }
    },
    operations: {
      equipment: [],
      materials: [],
      staff: [],
      dailyTasks: '',
      salesProcess: '',
      supportProcess: '',
      inventoryProcess: '',
      logisticsProcess: '',
      permits: '',
      insurance: '',
      risks: [],
      checklist: { day1: [], week1: [], month1: [] }
    },
    launch: {
      experiment: {
        type: 'پیش‌فروش محصول',
        hypothesis: '',
        successCriteria: '',
        budget: 0,
        targetCount: 15,
        actualCount: 0,
        notes: '',
        status: 'not_started',
        completedAt: null
      },
      launchDate: '',
      countdownTasks: [],
      first30Kpis: []
    },
    snapshots: []
  };
}

export function createDemoProject(): FounderLabProject {
  const today = todayIso();
  const base = createEmptyProject('اشتراک قهوه تازه‌برشت «دانه» (پروژه نمونه)');
  base.id = 'fl_demo_daneh';
  base.isDemo = true;
  base.profile = {
    ...base.profile,
    description: 'سرویس اشتراک ماهانه قهوه تازه‌برشت تخصصی با آسیاب متناسب با دستگاه خانگی مشتری و ارسال ۴۸ ساعته.',
    problem: 'کارمندان و دورکاران قهوه‌نوش یا هزینه بالای کافه می‌پردازند یا بسته‌های کهنه سوپرمارکتی می‌خرند.',
    product: 'بسته ۵۰۰ گرمی قهوه عربیکای تازه‌برشت (عمر برشت زیر ۷ روز) با آسیاب دقیق و راهنمای دم‌آوری.',
    targetCustomer: 'کارمندان، برنامه‌نویسان و متخصصان ۲۵ تا ۴۲ ساله با درآمد متوسط به بالا و مصرف روزانه قهوه.',
    targetMarket: 'تهران، کرج و اهواز — فاز اول ارسال هفتگی',
    revenueModel: 'اشتراک ماهانه + فروش تکی آزمایشی',
    proposedPrice: 680000,
    initialCapital: 95000000,
    operatingCosts: 38000000,
    constraints: 'تیم ۲ نفره، بدون فروشگاه فیزیکی در فاز اول، همکاری با برشته‌کاری قراردادی',
    stage: 'validation'
  };
  base.board = {
    hormozi: { dreamOutcome: 8, perceivedLikelihood: 7, timeDelay: 8, effortEase: 8, notes: '' },
    thiel: { smallMarketFocus: 8, tenXAdvantage: 6, defensibility: 6, timingStrength: 7, notes: '' },
    jobs: { simplicityFocus: 8, customerExperience: 8, clarityOfProblem: 8, craftQuality: 7, notes: '' },
    lastRunAt: new Date().toISOString()
  };
  base.competitors = [
    {
      id: 'cmp_1',
      name: 'رُستری آنلاین نمونه الف',
      website: '',
      group: 'direct',
      sector: 'فروش آنلاین دانه قهوه تخصصی',
      products: 'بسته‌های ۲۵۰ و ۵۰۰ گرمی قهوه تک‌خاستگاه',
      price: 760000,
      targetCustomers: 'علاقه‌مندان حرفه‌ای قهوه موج سوم',
      advantage: 'تنوع بالای دانه‌های وارداتی',
      weakness: 'فرآیند خرید پیچیده برای کاربر غیرحرفه‌ای و هزینه ارسال بالا',
      complaints: 'تأخیر در ارسال و نامشخص بودن درجه آسیاب مناسب دستگاه خانگی',
      marketing: 'اینستاگرام و همکاری با باریستاها',
      sourceUrl: '',
      checkedDate: today,
      verified: false
    },
    {
      id: 'cmp_2',
      name: 'کافه‌های زنجیره‌ای شهری',
      website: '',
      group: 'indirect',
      sector: 'کافه و نوشیدنی آماده',
      products: 'اسپرسو و لته بیرون‌بر روزانه',
      price: 1200000,
      targetCustomers: 'کارمندان و دانشجویان',
      advantage: 'آماده بدون نیاز به دم‌آوری',
      weakness: 'هزینه ماهانه بسیار بالا',
      complaints: 'صف صبحگاهی و نوسان کیفیت بین شعب',
      marketing: 'حضور فیزیکی و اپلیکیشن سفارش',
      sourceUrl: '',
      checkedDate: today,
      verified: false
    },
    {
      id: 'cmp_3',
      name: 'قهوه بسته‌بندی سوپرمارکتی',
      website: '',
      group: 'substitute',
      sector: 'کالای تندمصرف (FMCG)',
      products: 'بسته‌های آسیاب‌شده آماده با تاریخ تولید چند ماه پیش',
      price: 420000,
      targetCustomers: 'عموم مصرف‌کنندگان حساس به قیمت',
      advantage: 'دسترسی فوری و قیمت پایین‌تر',
      weakness: 'طعم کهنه و نبود تاریخ برشت تازه',
      complaints: 'عطر ضعیف و کیفیت پایین',
      marketing: 'توزیع فروشگاهی',
      sourceUrl: '',
      checkedDate: today,
      verified: false
    }
  ];
  base.offer = {
    coreProblem: 'قهوه تازه و باکیفیت خانگی یا گران است یا تهیه منظم آن وقت‌گیر است.',
    desiredOutcome: 'هر صبح در ۳ دقیقه قهوه باکیفیت کافه را با نصف هزینه در خانه دم کنید.',
    mainBarriers: 'نگرانی از پسندیدن طعم، تردید درباره تازگی و ترس از تعهد اشتراک.',
    competitiveEdge: 'تاریخ برشت ثبت‌شده زیر ۷ روز + آسیاب دقیق برای دستگاه مشتری + لغو اشتراک با یک کلیک.',
    guarantee: 'ضمانت تعویض طعم در اولین سفارش: اگر پروفایل طعمی را نپسندیدید، بسته جایگزین بدون هزینه ارسال می‌شود.',
    launchOffer: 'بسته آزمایشی ۲۵۰ گرمی با قیمت تمام‌شده + ارسال رایگان برای ۵۰ مشترک اول.',
    applyOfferCostToCfo: true,
    items: [
      { id: 'off_1', title: 'پروفایل آسیاب اختصاصی (موکاپات / اسپرسوساز / فرنچ‌پرس)', valueScore: 9, costPerUnit: 5000 },
      { id: 'off_2', title: 'کارت راهنمای تصویری دم‌آوری ۶۰ ثانیه‌ای', valueScore: 8, costPerUnit: 8000 },
      { id: 'off_3', title: 'ضمانت تعویض طعم سفارش اول (ذخیره ریسک ۵٪)', valueScore: 9, costPerUnit: 22000 }
    ]
  };
  base.cfo = {
    salePrice: 680000,
    variableCostPerUnit: 330000,
    packagingShippingCost: 55000,
    commissionPercent: 2,
    commissionFixed: 0,
    rent: 12000000,
    salaries: 20000000,
    softwareServices: 2500000,
    otherFixed: 3500000,
    initialCapital: 95000000,
    dailyCapacity: 40,
    workingDaysPerMonth: 26,
    monthlyForecast: [95, 130, 175, 220, 260, 300, 340, 370, 400, 430, 460, 500]
  };
  base.pricing.tiers = [
    { id: 'eco', name: 'اقتصادی (۲۵۰ گرم)', price: 390000, unitCost: 210000, features: 'بسته ۲۵۰ گرمی تازه‌برشت + انتخاب نوع آسیاب' },
    { id: 'std', name: 'استاندارد (۵۰۰ گرم)', price: 680000, unitCost: 385000, features: 'بسته ۵۰۰ گرمی + راهنمای دم‌آوری + ضمانت تعویض طعم' },
    { id: 'pro', name: 'حرفه‌ای (۱ کیلو / تیمی)', price: 1240000, unitCost: 720000, features: '۱ کیلوگرم ۲ طعم مختلف + ارسال رایگان + اولویت برشت' }
  ];
  base.marketing = {
    positioning: 'برای کارمندان و دورکاران قهوه‌نوش، «دانه» تنها اشتراک قهوه تازه‌برشت است که دقیقاً مطابق دستگاه خانگی شما ظرف ۴۸ ساعت می‌رسد.',
    targetAudienceSummary: 'کارمندان، برنامه‌نویسان و فریلنسرهای ۲۵ تا ۴۲ ساله با خرید منظم ماهانه',
    adBudgetMonthly: 12000000,
    hooks: [
      'چرا قهوه خانگی شما طعم کافه را نمی‌دهد؟ راز در تاریخ برشت زیر ۷ روز است.',
      'به‌جای ماهی ۲ میلیون هزینه کافه، با ۶۸۰ هزار تومان هر صبح قهوه تازه دم کنید.'
    ],
    contentIdeas: [
      'ویدیو ۴۵ ثانیه‌ای مقایسه عطر قهوه تازه‌برشت با بسته ۶ ماهه سوپرمارکت',
      'پشت‌صحنه واقعی برشته‌کاری و ثبت تاریخ روی بسته همان روز'
    ],
    channels: [
      { id: 'ch_1', name: 'اینستاگرام و ریلز آموزشی', reason: 'حضور مستقیم مخاطب ۲۵ تا ۴۰ ساله', budget: 6000000, estCac: 140000, kpi: 'سفارش بسته آزمایشی' },
      { id: 'ch_2', name: 'لینکدین و دفاتر استارتاپی', reason: 'دسترسی مستقیم به تیم‌های دورکار و برنامه‌نویس', budget: 3500000, estCac: 110000, kpi: 'اشتراک تیمی' }
    ],
    plan30Days: [
      { id: 'm1', week: 'هفته ۱', task: 'ساخت صفحه معرفی ساده و فرم پیش‌فروش بسته آزمایشی', done: false },
      { id: 'm2', week: 'هفته ۲', task: 'انتشار ۶ ویدیو کوتاه آموزشی و ارسال تست برای ۱۰ دفتر', done: false }
    ],
    kpis: ['نرخ تبدیل صفحه فرود (بالای ۴٪)', 'هزینه جذب CAC زیر ۱۸۰ هزار تومان', 'نرخ تمدید ماه دوم (بالای ۶۵٪)']
  };
  base.brand = {
    ...base.brand,
    candidates: ['دانه', 'برشت‌نو', 'دم‌تازه', 'صبح‌دانه', 'رُست‌خانه', 'عطر‌تازه', 'فنجان‌نو', 'کارگاه دم', 'تازه‌دم', 'دقیقه‌دم'],
    topThree: ['دانه', 'برشت‌نو', 'تازه‌دم'],
    slogan: 'تازه‌برشت، دقیقاً برای دستگاه تو',
    voice: 'صمیمی، دقیق، شفاف و بدون اصطلاحات پیچیده کافه‌ای',
    personality: 'دوست متخصص و قابل‌اعتماد که کیفیت را ساده می‌کند',
    promise: 'هیچ بسته‌ای با عمر برشت بالای ۷ روز ارسال نمی‌شود.',
    logoGuide: 'نماد مینیمال دانه قهوه ترکیب‌شده با عقربه تازگی، قابل چاپ تک‌رنگ روی کرافت.',
    visualExperience: 'بسته‌بندی کرافت مات با برچسب خوانای تاریخ برشت و ۳ مرحله تصویری دم‌آوری.'
  };
  base.operations = {
    equipment: [
      { id: 'eq_1', name: 'آسیاب صنعتی دقیق با تنظیم درجه‌بندی', cost: 42000000 },
      { id: 'eq_2', name: 'ترازو دیجیتال و دستگاه دوخت پاکت سوپاپ‌دار', cost: 18000000 }
    ],
    materials: [
      { id: 'mat_1', name: 'دانه قهوه عربیکا برشته‌شده (۵۰۰ گرم)', supplier: 'برشته‌کاری همکار', unitCost: 330000 },
      { id: 'mat_2', name: 'پاکت سوپاپ‌دار + برچسب + کارتن', supplier: 'تأمین‌کننده بسته‌بندی', unitCost: 55000 }
    ],
    staff: [
      { id: 'st_1', name: 'اپراتور بسته‌بندی و پشتیبانی (پاره‌وقت)', monthlySalary: 12000000 },
      { id: 'st_2', name: 'تولید محتوا و ثبت سفارش (پاره‌وقت)', monthlySalary: 8000000 }
    ],
    dailyTasks: 'ثبت سفارش‌های روز، آسیاب و بسته‌بندی، تحویل به پیک/پست و پیگیری پیام‌ها.',
    salesProcess: 'انتخاب دستگاه و طعم ← پرداخت آنلاین ← ارسال پیامک تاریخ برشت و کد رهگیری.',
    supportProcess: 'پاسخ‌گویی زیر ۲ ساعت و ثبت درخواست تعویض طعم در صورت نارضایتی.',
    inventoryProcess: 'موجودی دانه حداکثر برای ۵ روز کاری جهت حفظ تازگی.',
    logisticsProcess: 'ارسال درون‌شهری با پیک تجمیعی و برون‌شهری با پست پیشتاز.',
    permits: 'اینماد، کد مالیاتی صنفی و استعلام مجوز بهداشتی بسته‌بندی مواد غذایی.',
    insurance: 'بیمه مسئولیت کارگاه کوچک و بیمه مرسولات پستی.',
    risks: [
      { id: 'r1', risk: 'نوسان قیمت دانه سبز وارداتی', likelihood: 'بالا', impact: 'بالا', mitigation: 'قرارداد ماهانه با ۲ تأمین‌کننده' }
    ],
    checklist: {
      day1: [{ id: 'd1', text: 'تست نهایی کیفیت آسیاب با ۳ دستگاه خانگی', done: false }],
      week1: [{ id: 'w1', text: 'ارسال ۲۰ بسته آزمایشی اول و تماس پیگیری با خریداران', done: false }],
      month1: [{ id: 'mo1', text: 'تطبیق اعداد واقعی ماه اول با مدل CFO', done: false }]
    }
  };
  base.launch = {
    experiment: {
      type: 'پیش‌فروش محصول',
      hypothesis: 'حداقل ۱۵ نفر از کارمندان و برنامه‌نویسان حاضرند ۶۸۰ هزار تومان برای بسته ۵۰۰ گرمی تازه‌برشت پیش‌پرداخت کنند.',
      successCriteria: 'دریافت حداقل ۱۵ سفارش واقعی با پرداخت کامل ظرف ۱۰ روز.',
      budget: 4000000,
      targetCount: 15,
      actualCount: 0,
      notes: 'هنوز آزمایش واقعی اجرا نشده است — نتایج فعلی صرفاً شبیه‌سازی الگوریتمی هستند.',
      status: 'not_started',
      completedAt: null
    },
    launchDate: '',
    countdownTasks: [
      { id: 'l1', day: 'روز ۱۰−', task: 'ساخت صفحه پیش‌فروش و انتخاب ۲۰ مخاطب اولیه', owner: 'بنیان‌گذار', done: false },
      { id: 'l2', day: 'روز ۰', task: 'باز کردن پیش‌فروش و پیگیری مستقیم خریداران', owner: 'تیم', done: false }
    ],
    first30Kpis: ['تعداد خریداران واقعی ماه اول', 'نرخ تمدید ماه دوم', 'هزینه جذب واقعی (CAC)']
  };

  base.panel.personas = generateConsumerPanel(base, 100, base.panel.seed);
  base.panel.lastRunAt = new Date().toISOString();
  base.panel.lastRunNote = 'اجرای اولیه پروژه نمونه';
  return base;
}

export function loadLocalProjects(): FounderLabProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FounderLabProject[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  const demo = [createDemoProject()];
  saveLocalProjects(demo);
  return demo;
}

export function saveLocalProjects(projects: FounderLabProject[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
  } catch {
    // ignore quota errors
  }
}

export async function fetchRemoteProjects(): Promise<{ configured: boolean; projects: FounderLabProject[] }> {
  try {
    const res = await fetch('/api/founderLab', { credentials: 'include' });
    if (!res.ok) return { configured: false, projects: [] };
    const data = (await res.json()) as { configured?: boolean; projects?: FounderLabProject[] };
    return {
      configured: Boolean(data.configured),
      projects: Array.isArray(data.projects) ? data.projects : []
    };
  } catch {
    return { configured: false, projects: [] };
  }
}

export async function upsertRemoteProject(project: FounderLabProject): Promise<boolean> {
  try {
    const res = await fetch('/api/founderLab', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', project })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteRemoteProject(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/founderLab', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function bulkImportRemoteProjects(projects: FounderLabProject[]): Promise<boolean> {
  try {
    const res = await fetch('/api/founderLab', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'bulkImport', projects })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function wipeRemoteProjects(): Promise<boolean> {
  try {
    const res = await fetch('/api/founderLab', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'wipeAll' })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function exportCsvFile(filename: string, headers: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  downloadTextFile(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8;');
}
