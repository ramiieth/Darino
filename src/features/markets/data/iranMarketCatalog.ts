/**
 * کاتالوگ و لایهٔ دادهٔ یکپارچهٔ «بازار سرمایه ایران» در دارینو:
 *   1) بورس اوراق بهادار تهران (TSE)
 *   2) فرابورس ایران (IFB)
 *   3) بورس کالای ایران (IME — گواهی سپرده طلا/سکه/نقره/زعفران و صندوق‌های کالایی)
 *   4) صندوق‌های سرمایه‌گذاری (سهامی، اهرمی، بخشی، شاخصی، طلا و درآمد ثابت)
 *   5) صندوق‌های بازنشستگی تکمیلی / آتیه (آتیه مفید، اندوخته آگاه، کاریز کاریزما و…)
 *
 * معماری:
 *   • در صورت فعال بودن سرویس زنده (`/api/integrations?op=iran-market` متصل به BrsApi / TSETMC / FIPIRAN)،
 *     کل نمادهای زندهٔ بازار بارگذاری و با کاتالوگ صندوق‌های بازنشستگی ادغام می‌شوند.
 *   • در نبود کلید سرویس زنده، کاتالوگ جامع مرجع بدون نمایش قیمت جعلی و با برچسب شفاف نمایش داده می‌شود.
 */

export type IranMarketSegment = 'tse' | 'ifb' | 'ime' | 'funds' | 'pension';

export type IranFundSubtype =
  | 'equity'
  | 'leveraged'
  | 'sector'
  | 'index'
  | 'gold'
  | 'fixed_income'
  | 'pension';

export interface IranMarketInstrument {
  id: string;
  symbol: string;
  nameFa: string;
  segment: IranMarketSegment;
  sectorFa: string;
  /** برای صندوق‌ها: نوع صندوق (سهامی، اهرمی، بخشی، طلا، درآمد ثابت، بازنشستگی تکمیلی) */
  fundSubtype?: IranFundSubtype;
  /** نوع معامله: قابل معامله در تابلو (ETF/سهام) یا صدور و ابطالی (Non-ETF) */
  tradeMode: 'exchange' | 'issuance';
  /** مدیر صندوق یا ناشر (برای صندوق‌ها و بورس کالا) */
  managerFa?: string;
  /** قیمت آخرین معامله یا قیمت صدور (ریال) — فقط وقتی دادهٔ زنده دریافت شود */
  lastPriceRial?: number | null;
  /** قیمت پایانی یا ابطال (ریال) — فقط وقتی دادهٔ زنده دریافت شود */
  closePriceRial?: number | null;
  /** درصد تغییر روزانه */
  changePct?: number | null;
  /** نسبت P/E (برای سهام) */
  pe?: number | null;
  /** ارزش معاملات روز (میلیارد تومان) */
  tradeValueBillionToman?: number | null;
  /** توضیح کوتاه کاربردی */
  noteFa: string;
  /** لینک رسمی نماد یا صفحهٔ صندوق */
  officialUrl: string;
  /** آیا داده از منبع زنده دریافت شده؟ */
  live?: boolean;
}

export interface IranMarketSegmentMeta {
  id: IranMarketSegment;
  labelFa: string;
  shortFa: string;
  descriptionFa: string;
}

export const IRAN_MARKET_SEGMENTS: readonly IranMarketSegmentMeta[] = [
  {
    id: 'tse',
    labelFa: 'بورس تهران',
    shortFa: 'بورس',
    descriptionFa: 'سهام شرکت‌های پذیرفته‌شده در بورس اوراق بهادار تهران (TSE)'
  },
  {
    id: 'ifb',
    labelFa: 'فرابورس',
    shortFa: 'فرابورس',
    descriptionFa: 'سهام بازارهای اول، دوم و پایهٔ فرابورس ایران (IFB)'
  },
  {
    id: 'ime',
    labelFa: 'بورس کالا',
    shortFa: 'بورس کالا',
    descriptionFa: 'گواهی سپرده شمش طلا، سکه، نقره، زعفران و قراردادهای بورس کالای ایران (IME)'
  },
  {
    id: 'funds',
    labelFa: 'صندوق‌های سهامی و ETF',
    shortFa: 'صندوق‌ها',
    descriptionFa: 'صندوق‌های سهامی، اهرمی، بخشی، شاخصی، طلا و درآمد ثابت'
  },
  {
    id: 'pension',
    labelFa: 'صندوق‌های بازنشستگی (آتیه)',
    shortFa: 'بازنشستگی / آتیه',
    descriptionFa: 'صندوق‌های بازنشستگی تکمیلی (صدور و ابطالی) برای سرمایه‌گذاری بلندمدت و پوشش تورم'
  }
];

export const IRAN_FUND_SUBTYPE_LABELS: Record<IranFundSubtype, string> = {
  equity: 'سهامی',
  leveraged: 'اهرمی',
  sector: 'بخشی (صنایع)',
  index: 'شاخصی',
  gold: 'طلا',
  fixed_income: 'درآمد ثابت',
  pension: 'بازنشستگی تکمیلی'
};

export const IRAN_MARKET_CATALOG: readonly IranMarketInstrument[] = [
  // ─── ۱) بورس اوراق بهادار تهران (TSE) ──────────────────────────────────────
  {
    id: 'tse-foolad',
    symbol: 'فولاد',
    nameFa: 'فولاد مبارکه اصفهان',
    segment: 'tse',
    sectorFa: 'فلزات اساسی',
    tradeMode: 'exchange',
    noteFa: 'بزرگ‌ترین تولیدکننده فولاد تخت کشور و از لیدرهای اصلی شاخص کل',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-femeli',
    symbol: 'فملی',
    nameFa: 'ملی صنایع مس ایران',
    segment: 'tse',
    sectorFa: 'فلزات اساسی',
    tradeMode: 'exchange',
    noteFa: 'تولیدکننده مس کاتد و کنسانتره؛ همبسته با قیمت جهانی مس و نرخ ارز',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-fars',
    symbol: 'فارس',
    nameFa: 'صنایع پتروشیمی خلیج فارس',
    segment: 'tse',
    sectorFa: 'محصولات شیمیایی',
    tradeMode: 'exchange',
    noteFa: 'بزرگ‌ترین هلدینگ پتروشیمی ایران با بیشترین وزن در شاخص کل',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-shasta',
    symbol: 'شستا',
    nameFa: 'سرمایه‌گذاری تأمین اجتماعی',
    segment: 'tse',
    sectorFa: 'چندرشته‌ای صنعتی',
    tradeMode: 'exchange',
    noteFa: 'هلدینگ چندرشته‌ای در حوزه‌های نفت، گاز، پتروشیمی، دارو و سیمان',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-shapna',
    symbol: 'شپنا',
    nameFa: 'پالایش نفت اصفهان',
    segment: 'tse',
    sectorFa: 'فرآورده‌های نفتی',
    tradeMode: 'exchange',
    noteFa: 'از پالایشگاه‌های شاخص بورس با نقدشوندگی بالا',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-shabandar',
    symbol: 'شبندر',
    nameFa: 'پالایش نفت بندرعباس',
    segment: 'tse',
    sectorFa: 'فرآورده‌های نفتی',
    tradeMode: 'exchange',
    noteFa: 'پالایشگاه بزرگ صادرات‌محور جنوب کشور',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-webmellat',
    symbol: 'وبملت',
    nameFa: 'بانک ملت',
    segment: 'tse',
    sectorFa: 'بانک‌ها و مؤسسات اعتباری',
    tradeMode: 'exchange',
    noteFa: 'لیدر گروه بانکی بورس تهران با بیشترین درآمد عملیاتی بانکی',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-wetejarat',
    symbol: 'وتجارت',
    nameFa: 'بانک تجارت',
    segment: 'tse',
    sectorFa: 'بانک‌ها و مؤسسات اعتباری',
    tradeMode: 'exchange',
    noteFa: 'از پرتراکنش‌ترین نمادهای گروه بانکی',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-khodro',
    symbol: 'خودرو',
    nameFa: 'ایران خودرو',
    segment: 'tse',
    sectorFa: 'خودرو و ساخت قطعات',
    tradeMode: 'exchange',
    noteFa: 'لیدر سنتی گروه خودرویی با حجم معاملات بالا',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-khesapa',
    symbol: 'خساپا',
    nameFa: 'سایپا',
    segment: 'tse',
    sectorFa: 'خودرو و ساخت قطعات',
    tradeMode: 'exchange',
    noteFa: 'دومین خودروساز بزرگ بورسی کشور',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-kegol',
    symbol: 'کگل',
    nameFa: 'معدنی و صنعتی گل‌گهر',
    segment: 'tse',
    sectorFa: 'استخراج کانه‌های فلزی',
    tradeMode: 'exchange',
    noteFa: 'تولیدکننده سنگ‌آهن، گندله و آهن اسفنجی',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-kechad',
    symbol: 'کچاد',
    nameFa: 'معدنی و صنعتی چادرملو',
    segment: 'tse',
    sectorFa: 'استخراج کانه‌های فلزی',
    tradeMode: 'exchange',
    noteFa: 'زنجیره کامل معدن تا شمش فولاد',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-nouri',
    symbol: 'نوری',
    nameFa: 'پتروشیمی نوری',
    segment: 'tse',
    sectorFa: 'محصولات شیمیایی',
    tradeMode: 'exchange',
    noteFa: 'بزرگ‌ترین مجتمع تولید آروماتیک کشور با فروش دلاری',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-hamrah',
    symbol: 'همراه',
    nameFa: 'ارتباطات سیار ایران (همراه اول)',
    segment: 'tse',
    sectorFa: 'مخابرات',
    tradeMode: 'exchange',
    noteFa: 'سهم تدافعی و سودنقدی‌پرداز در صنعت مخابرات',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-tapico',
    symbol: 'تاپیکو',
    nameFa: 'سرمایه‌گذاری نفت و گاز و پتروشیمی تأمین',
    segment: 'tse',
    sectorFa: 'چندرشته‌ای / پتروشیمی',
    tradeMode: 'exchange',
    noteFa: 'هلدینگ بزرگ پتروشیمی و سلولزی زیرمجموعه شستا',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'tse-weghadir',
    symbol: 'وغدیر',
    nameFa: 'سرمایه‌گذاری غدیر',
    segment: 'tse',
    sectorFa: 'چندرشته‌ای صنعتی',
    tradeMode: 'exchange',
    noteFa: 'پرتفوی متنوع پتروشیمی، سیمان، نیروگاهی و معدن',
    officialUrl: 'https://www.tsetmc.com/'
  },

  // ─── ۲) فرابورس ایران (IFB) ────────────────────────────────────────────────
  {
    id: 'ifb-arya',
    symbol: 'آریا',
    nameFa: 'پلیمر آریا ساسول',
    segment: 'ifb',
    sectorFa: 'محصولات شیمیایی',
    tradeMode: 'exchange',
    noteFa: 'بزرگ‌ترین نماد پتروشیمی فرابورس با حاشیه سود بالا و فروش صادراتی',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-zagros',
    symbol: 'زاگرس',
    nameFa: 'پتروشیمی زاگرس',
    segment: 'ifb',
    sectorFa: 'محصولات شیمیایی',
    tradeMode: 'exchange',
    noteFa: 'تولیدکننده بزرگ متانول صادراتی در بازار فرابورس',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-shagouya',
    symbol: 'شگویا',
    nameFa: 'پتروشیمی تندگویان',
    segment: 'ifb',
    sectorFa: 'محصولات شیمیایی',
    tradeMode: 'exchange',
    noteFa: 'تولیدکننده PET و محصولات پلیمری در فرابورس',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-bepas',
    symbol: 'بپاس',
    nameFa: 'بیمه پاسارگاد',
    segment: 'ifb',
    sectorFa: 'بیمه و صندوق بازنشستگی',
    tradeMode: 'exchange',
    noteFa: 'از پیشروهای صنعت بیمه عمر و بازنشستگی در فرابورس',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-hormoz',
    symbol: 'هرمز',
    nameFa: 'فولاد هرمزگان جنوب',
    segment: 'ifb',
    sectorFa: 'فلزات اساسی',
    tradeMode: 'exchange',
    noteFa: 'تولیدکننده اسلب فولادی با دسترسی مستقیم به آب‌های آزاد',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-fezar',
    symbol: 'فزر',
    nameFa: 'پویا زرکان آق‌دره',
    segment: 'ifb',
    sectorFa: 'استخراج کانه‌های فلزی (طلا)',
    tradeMode: 'exchange',
    noteFa: 'تک‌سهم معدنی طلای فرابورس با حساسیت بالا به قیمت طلا',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-tajalli',
    symbol: 'تجلی',
    nameFa: 'تجلی توسعه معادن و فلزات',
    segment: 'ifb',
    sectorFa: 'معدن و فلزات (پروژه‌محور)',
    tradeMode: 'exchange',
    noteFa: 'اولین شرکت پروژه‌محور معدنی در بازار سرمایه ایران',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'ifb-wesepehr',
    symbol: 'وسپهر',
    nameFa: 'سرمایه‌گذاری مالی سپهر صادرات',
    segment: 'ifb',
    sectorFa: 'سرمایه‌گذاری‌ها',
    tradeMode: 'exchange',
    noteFa: 'هلدینگ مالی با پرتفوی متنوع بورسی و بانکی',
    officialUrl: 'https://www.tsetmc.com/'
  },

  // ─── ۳) بورس کالای ایران (IME) ─────────────────────────────────────────────
  {
    id: 'ime-gold-bar',
    symbol: 'شمش طلا (گواهی سپرده)',
    nameFa: 'گواهی سپرده شمش طلای ۲۴ عیار بورس کالا',
    segment: 'ime',
    sectorFa: 'فلزات گران‌بها (گواهی سپرده)',
    tradeMode: 'exchange',
    managerFa: 'بورس کالای ایران (IME)',
    noteFa: 'هر ۱,۰۰۰ گواهی معادل ۱۰۰ گرم شمش طلای ۲۴ عیار تحویل خزانه بانکی (معاف از مالیات)',
    officialUrl: 'https://www.ime.co.ir/'
  },
  {
    id: 'ime-coin-refah',
    symbol: 'سکه ۰۳۱۲پ۰۴ (گواهی سکه)',
    nameFa: 'گواهی سپرده سکه تمام بهار آزادی (بانک رفاه/سامان/ملت)',
    segment: 'ime',
    sectorFa: 'فلزات گران‌بها (گواهی سپرده)',
    tradeMode: 'exchange',
    managerFa: 'بورس کالای ایران (IME)',
    noteFa: 'هر ۱۰۰ گواهی معادل ۱ سکه تمام بانکی بدون ریسک جعل و نگهداری فیزیکی',
    officialUrl: 'https://www.ime.co.ir/'
  },
  {
    id: 'ime-silver-bar',
    symbol: 'نقره (گواهی سپرده)',
    nameFa: 'گواهی سپرده شمش نقره ۹۹۹.۹ بورس کالا',
    segment: 'ime',
    sectorFa: 'فلزات گران‌بها (گواهی سپرده)',
    tradeMode: 'exchange',
    managerFa: 'بورس کالای ایران (IME)',
    noteFa: 'معامله آنلاین شمش نقره با پشتوانه انبار رسمی و امکان تحویل فیزیکی',
    officialUrl: 'https://www.ime.co.ir/'
  },
  {
    id: 'ime-saffron',
    symbol: 'زعفران نگین (گواهی سپرده)',
    nameFa: 'گواهی سپرده زعفران نگین و پوشال بورس کالا',
    segment: 'ime',
    sectorFa: 'کشاورزی (گواهی سپرده)',
    tradeMode: 'exchange',
    managerFa: 'بورس کالای ایران (IME)',
    noteFa: 'قرارداد نقدی و آتی زعفران استانداردشده در انبارهای بورس کالا',
    officialUrl: 'https://www.ime.co.ir/'
  },
  {
    id: 'ime-pistachio',
    symbol: 'پسته فندقی (گواهی سپرده)',
    nameFa: 'گواهی سپرده پسته صادراتی بورس کالا',
    segment: 'ime',
    sectorFa: 'کشاورزی (گواهی سپرده)',
    tradeMode: 'exchange',
    managerFa: 'بورس کالای ایران (IME)',
    noteFa: 'دارایی کالایی صادرات‌محور با همبستگی مستقیم با نرخ ارز',
    officialUrl: 'https://www.ime.co.ir/'
  },
  {
    id: 'ime-glass-cement',
    symbol: 'سلف موازی (فولاد/سیمان/پتروشیمی)',
    nameFa: 'اوراق سلف موازی استاندارد بورس کالا',
    segment: 'ime',
    sectorFa: 'اوراق مالی کالایی',
    tradeMode: 'exchange',
    managerFa: 'بورس کالای ایران (IME)',
    noteFa: 'تأمین مالی کالایی برای محصولات صنعتی (فولاد، سیمان، پلی‌اتیلن و اوره)',
    officialUrl: 'https://www.ime.co.ir/'
  },

  // ─── ۴) صندوق‌های سهامی، اهرمی، بخشی، شاخصی، طلا و درآمد ثابت ──────────────
  {
    id: 'fund-atlas',
    symbol: 'اطلس',
    nameFa: 'صندوق سهامی اطلس (مفید)',
    segment: 'funds',
    fundSubtype: 'equity',
    sectorFa: 'صندوق سهامی (ETF)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'از بزرگ‌ترین صندوق‌های سهامی ETF ایران با نقدشوندگی بالا',
    officialUrl: 'https://www.emofid.com/'
  },
  {
    id: 'fund-agah',
    symbol: 'آگاس',
    nameFa: 'صندوق سهامی آگاس (آگاه)',
    segment: 'funds',
    fundSubtype: 'equity',
    sectorFa: 'صندوق سهامی (ETF)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان آگاه',
    noteFa: 'صندوق سهامی پرتراکنش با تمرکز بر شرکت‌های بنیادی و دلاری',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'fund-dara1',
    symbol: 'دارا یکم',
    nameFa: 'صندوق واسطه‌گری مالی یکم',
    segment: 'funds',
    fundSubtype: 'equity',
    sectorFa: 'صندوق سهامی (بانکی و بیمه)',
    tradeMode: 'exchange',
    managerFa: 'تأمین سرمایه بانک مسکن',
    noteFa: 'ترکیب سهام بانک‌های ملت، تجارت، صادرات و بیمه‌های اتکایی و البرز',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'fund-palayesh',
    symbol: 'پالایش',
    nameFa: 'صندوق پالایشی یکم',
    segment: 'funds',
    fundSubtype: 'sector',
    sectorFa: 'صندوق بخشی پالایشی',
    tradeMode: 'exchange',
    managerFa: 'تأمین سرمایه ملت',
    noteFa: 'سبد متمرکز ۴ پالایشگاه بزرگ کشور (شپنا، شبندر، شتران، شبریز)',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'fund-ahrom',
    symbol: 'اهرم',
    nameFa: 'صندوق اهرمی کاریزما',
    segment: 'funds',
    fundSubtype: 'leveraged',
    sectorFa: 'صندوق اهرمی (واحد ممتاز)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان کاریزما',
    noteFa: 'نوسان و بازدهی مضاعف نسبت به شاخص بورس در روندهای صعودی و نزولی',
    officialUrl: 'https://charisma.ir/'
  },
  {
    id: 'fund-shetab',
    symbol: 'شتاب',
    nameFa: 'صندوق اهرمی شتاب (آگاه)',
    segment: 'funds',
    fundSubtype: 'leveraged',
    sectorFa: 'صندوق اهرمی (واحد ممتاز)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان آگاه',
    noteFa: 'صندوق سهامی اهرمی با اهرم پویا روی سبد سهام شاخصی',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'fund-tavan',
    symbol: 'توان',
    nameFa: 'صندوق اهرمی توان (مفید)',
    segment: 'funds',
    fundSubtype: 'leveraged',
    sectorFa: 'صندوق اهرمی (واحد ممتاز)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'دارای واحدهای عادی (کم‌ریسک) و ممتاز (اهرمی سهامی)',
    officialUrl: 'https://www.emofid.com/'
  },
  {
    id: 'fund-steel',
    symbol: 'استیل',
    nameFa: 'صندوق بخشی فلزات اساسی استیل (مفید)',
    segment: 'funds',
    fundSubtype: 'sector',
    sectorFa: 'صندوق بخشی فلزات',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'تمرکز اختصاصی بر سهام فولاد، مس و فلزات اساسی',
    officialUrl: 'https://www.emofid.com/'
  },
  {
    id: 'fund-oktan',
    symbol: 'اکتان',
    nameFa: 'صندوق بخشی پتروشیمی اکتان (مفید)',
    segment: 'funds',
    fundSubtype: 'sector',
    sectorFa: 'صندوق بخشی شیمیایی',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'تمرکز اختصاصی بر شرکت‌های پتروشیمی و شیمیایی',
    officialUrl: 'https://www.emofid.com/'
  },
  {
    id: 'fund-hamsang',
    symbol: 'همسنگ',
    nameFa: 'صندوق شاخصی هم‌وزن همسنگ (مفید)',
    segment: 'funds',
    fundSubtype: 'index',
    sectorFa: 'صندوق شاخصی هم‌وزن',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'هم‌حرکت با شاخص کل هم‌وزن بورس تهران',
    officialUrl: 'https://www.emofid.com/'
  },
  {
    id: 'fund-ayar',
    symbol: 'عیار',
    nameFa: 'صندوق طلای عیار مفید',
    segment: 'funds',
    fundSubtype: 'gold',
    sectorFa: 'صندوق کالایی طلا (ETF)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'پشتوانه شمش و سکه طلای بورس کالا با بالاترین نقدشوندگی بین صندوق‌های طلا',
    officialUrl: 'https://www.emofid.com/funds/ayar/'
  },
  {
    id: 'fund-lotus',
    symbol: 'طلا',
    nameFa: 'صندوق طلای لوتوس پارسیان',
    segment: 'funds',
    fundSubtype: 'gold',
    sectorFa: 'صندوق کالایی طلا (ETF)',
    tradeMode: 'exchange',
    managerFa: 'تأمین سرمایه لوتوس پارسیان',
    noteFa: 'قدیمی‌ترین صندوق ETF طلا در بورس کالای ایران',
    officialUrl: 'https://www.tsetmc.com/'
  },
  {
    id: 'fund-kahroba',
    symbol: 'کهربا',
    nameFa: 'صندوق طلای کهربا (کاریزما)',
    segment: 'funds',
    fundSubtype: 'gold',
    sectorFa: 'صندوق کالایی طلا (ETF)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان کاریزما',
    noteFa: 'صندوق مبتنی بر گواهی سپرده شمش و سکه طلای بورس کالا',
    officialUrl: 'https://charisma.ir/'
  },
  {
    id: 'fund-avand',
    symbol: 'آوند',
    nameFa: 'صندوق درآمد ثابت آوند (مفید)',
    segment: 'funds',
    fundSubtype: 'fixed_income',
    sectorFa: 'صندوق درآمد ثابت (ETF)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان مفید',
    noteFa: 'پارکینگ نقدینگی کم‌ریسک با سود روزشمار بدون نرخ شکست',
    officialUrl: 'https://www.emofid.com/'
  },
  {
    id: 'fund-kara',
    symbol: 'کارا',
    nameFa: 'صندوق درآمد ثابت کارا (کاریزما)',
    segment: 'funds',
    fundSubtype: 'fixed_income',
    sectorFa: 'صندوق درآمد ثابت (ETF)',
    tradeMode: 'exchange',
    managerFa: 'سبدگردان کاریزما',
    noteFa: 'صندوق درآمد ثابت قابل معامله با نقدشوندگی لحظه‌ای',
    officialUrl: 'https://charisma.ir/'
  },

  // ─── ۵) صندوق‌های بازنشستگی تکمیلی (آتیه) — صدور و ابطالی ──────────────────
  {
    id: 'pension-atieh-mofid',
    symbol: 'آتیه مفید',
    nameFa: 'صندوق بازنشستگی تکمیلی آتیه مفید',
    segment: 'pension',
    fundSubtype: 'pension',
    sectorFa: 'بازنشستگی تکمیلی (سهام + طلا + اوراق)',
    tradeMode: 'issuance',
    managerFa: 'سبدگردان مفید (کد ثبت ۱۲۲۱۷)',
    noteFa: 'اولین صندوق بازنشستگی تکمیلی بورس ایران (صدور و ابطالی) با ترکیب سهام، سپرده طلا و اوراق؛ مناسب پس‌انداز ماهانه بلندمدت و مشارکت کارفرما',
    officialUrl: 'https://www.emofid.com/atie-fund/'
  },
  {
    id: 'pension-andoukhteh-agah',
    symbol: 'اندوخته آگاه',
    nameFa: 'صندوق بازنشستگی تکمیلی اندوخته آگاه',
    segment: 'pension',
    fundSubtype: 'pension',
    sectorFa: 'بازنشستگی تکمیلی (سهامی / مختلط)',
    tradeMode: 'issuance',
    managerFa: 'سبدگردان آگاه',
    noteFa: 'صندوق بازنشستگی تکمیلی تحت نظارت سازمان بورس با هدف پوشش تورم بلندمدت و ایجاد مستمری تکمیلی',
    officialUrl: 'https://databourse.ir/funds'
  },
  {
    id: 'pension-kariz-charisma',
    symbol: 'کاریز (کاریزما)',
    nameFa: 'صندوق بازنشستگی تکمیلی کاریز',
    segment: 'pension',
    fundSubtype: 'pension',
    sectorFa: 'بازنشستگی تکمیلی (سهام + طلا + درآمد ثابت)',
    tradeMode: 'issuance',
    managerFa: 'سبدگردان کاریزما',
    noteFa: 'صندوق بازنشستگی تکمیلی گروه مالی کاریزما با مدیریت فعال دارایی‌ها برای افق ۵ تا ۱۵ ساله',
    officialUrl: 'https://charisma.ir/funds/pension-fund'
  },
  {
    id: 'pension-farabi',
    symbol: 'آینده‌ساز فارابی',
    nameFa: 'صندوق بازنشستگی تکمیلی کارگزاری فارابی',
    segment: 'pension',
    fundSubtype: 'pension',
    sectorFa: 'بازنشستگی تکمیلی',
    tradeMode: 'issuance',
    managerFa: 'سبدگردان فارابی',
    noteFa: 'طراحی‌شده برای انباشت تدریجی سرمایه دوران بازنشستگی و طرح‌های رفاهی سازمانی',
    officialUrl: 'https://irfarabi.com/amoozin/supplementary-retirement-investment-fund'
  },
  {
    id: 'pension-hafez',
    symbol: 'آتیه حافظ',
    nameFa: 'صندوق بازنشستگی تکمیلی هدف حافظ',
    segment: 'pension',
    fundSubtype: 'pension',
    sectorFa: 'بازنشستگی تکمیلی',
    tradeMode: 'issuance',
    managerFa: 'سبدگردان هدف حافظ',
    noteFa: 'صندوق بازنشستگی تکمیلی با ترکیب دارایی متنوع برای حفظ قدرت خرید بلندمدت',
    officialUrl: 'https://blog.hafez.co/'
  },
  {
    id: 'pension-servat-cvpf',
    symbol: 'مدیریت ثروت (کشوری)',
    nameFa: 'صندوق سرمایه‌گذاری مدیریت ثروت (بازنشستگی کشوری)',
    segment: 'pension',
    fundSubtype: 'pension',
    sectorFa: 'بازنشستگی (با سرمایه باز)',
    tradeMode: 'issuance',
    managerFa: 'گروه مالی صندوق بازنشستگی کشوری',
    noteFa: 'صندوق با سرمایه باز ثبت‌شده در سازمان بورس زیرمجموعه گروه مالی صندوق بازنشستگی کشوری',
    officialUrl: 'https://cvpf.ir/'
  }
];

/** نرمال‌سازی حروف فارسی/عربی برای جستجوی دقیق نمادها */
export function normalizeFaSearch(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ');
}

export function filterIranMarketInstruments(params: {
  items: readonly IranMarketInstrument[];
  segment: IranMarketSegment | 'all';
  fundSubtype?: IranFundSubtype | 'all';
  query?: string;
  onlyWatchlist?: boolean;
  watchlistIds?: ReadonlySet<string>;
}): IranMarketInstrument[] {
  const q = normalizeFaSearch(params.query ?? '');
  return params.items.filter((item) => {
    if (params.segment !== 'all' && item.segment !== params.segment) return false;
    if (
      params.segment === 'funds' &&
      params.fundSubtype &&
      params.fundSubtype !== 'all' &&
      item.fundSubtype !== params.fundSubtype
    ) {
      return false;
    }
    if (params.onlyWatchlist && params.watchlistIds && !params.watchlistIds.has(item.id)) {
      return false;
    }
    if (!q) return true;
    const haystack = normalizeFaSearch(
      `${item.symbol} ${item.nameFa} ${item.sectorFa} ${item.managerFa ?? ''} ${item.noteFa}`
    );
    return haystack.includes(q);
  });
}

export interface IranMarketLivePayload {
  items: IranMarketInstrument[];
  source: 'live' | 'catalog';
  updatedAt: number | null;
}

/**
 * واکشی اختیاری دادهٔ زنده از `/api/integrations?op=iran-market`
 * در صورت نبود سرویس زنده، کاتالوگ کامل مرجع (شامل بورس، فرابورس، بورس کالا، صندوق‌ها و صندوق‌های آتیه) برگردانده می‌شود.
 */
export async function fetchIranMarketData(): Promise<IranMarketLivePayload> {
  try {
    const res = await fetch('/api/integrations?op=iran-market', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      return { items: [...IRAN_MARKET_CATALOG], source: 'catalog', updatedAt: null };
    }
    const json = (await res.json()) as { items?: IranMarketInstrument[]; updatedAt?: number };
    if (!Array.isArray(json?.items) || json.items.length === 0) {
      return { items: [...IRAN_MARKET_CATALOG], source: 'catalog', updatedAt: null };
    }
    // ادغام نمادهای زنده با صندوق‌های بازنشستگی تکمیلی (چون صندوق‌های صدور و ابطالی در TSETMC نیستند)
    const liveIds = new Set(json.items.map((i) => i.id));
    const merged = [
      ...json.items.map((i) => ({ ...i, live: true })),
      ...IRAN_MARKET_CATALOG.filter((c) => !liveIds.has(c.id))
    ];
    return { items: merged, source: 'live', updatedAt: json.updatedAt ?? Date.now() };
  } catch {
    return { items: [...IRAN_MARKET_CATALOG], source: 'catalog', updatedAt: null };
  }
}
