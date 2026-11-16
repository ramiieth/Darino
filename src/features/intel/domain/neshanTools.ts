/** ============================================================
 * Neshan MCP Tools & Spatial Domain Model — دارینو (بازار ایران)
 *
 * مستندات مرجع:
 *  - پلتفرم نشان (MCP): https://platform.neshan.org/mcp
 *  - سرور نشان در mcpfarsi: https://mcpfarsi.ir/servers/neshan/
 *
 * نکته امنیتی و معماری:
 *  - تمام فراخوانی‌های MCP و وب‌سرویس نشان صرفاً در سمت سرور (api/_neshanMcp.ts)
 *    انجام می‌شوند و کلید هرگز به مرورگر ارسال نمی‌شود.
 *  - هیچ داده مکانی یا ترافیکی ساختگی (Mock/Fake) تولید نمی‌شود.
 * ============================================================ */

export type NeshanToolPolicy = 'active_core' | 'active_conditional' | 'disabled_serverless';

export type NeshanToolCategory =
  | 'search_geocoding'
  | 'routing_matrix'
  | 'map_visualization'
  | 'traffic_analytics'
  | 'utilities'
  | 'enterprise_logistics';

export interface NeshanToolMeta {
  name: string;
  titleFa: string;
  category: NeshanToolCategory;
  categoryFa: string;
  policy: NeshanToolPolicy;
  policyLabelFa: string;
  policyReasonFa: string;
  costTier: 'low' | 'medium' | 'high';
  costNoteFa: string;
  backingServiceFa: string;
  restEndpoint: string;
  parametersSummary: string[];
}

export const NESHAN_PLATFORM_MCP_URL = 'https://platform.neshan.org/mcp';
export const MCPFARSI_NESHAN_URL = 'https://mcpfarsi.ir/servers/neshan/';

/**
 * ارزیابی کامل ۱۹ ابزار سرور MCP نشان (شامل ۱۷ ابزار نسخه 0.3.0 + ۲ ابزار نسخه‌های اولیه)
 * و سیاست فعال‌سازی بهینه در معماری دارینو
 */
export const NESHAN_MCP_TOOLS_CATALOG: readonly NeshanToolMeta[] = [
  // ۱. جستجو و آدرس (۵ ابزار)
  {
    name: 'neshan_search',
    titleFa: 'جست‌وجوی مکان، کسب‌وکار و خدمات',
    category: 'search_geocoding',
    categoryFa: 'جست‌وجو و آدرس',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'ابزار اصلی یافتن صرافی‌ها، بانک‌ها، خودپردازها، پمپ‌بنزین، داروخانه و فروشگاه‌ها در اطراف نقطه مرجع.',
    costTier: 'low',
    costNoteFa: 'فراخوانی سبک؛ کش ۱۰ دقیقه‌ای سمت سرور',
    backingServiceFa: 'Search API (v1/search)',
    restEndpoint: '/v1/search',
    parametersSummary: ['term', 'lat', 'lng', 'sw_lat?', 'sw_lng?', 'ne_lat?', 'ne_lng?', 'layer_slug?']
  },
  {
    name: 'neshan_reverse_geocode',
    titleFa: 'تبدیل مختصات GPS به آدرس فارسی',
    category: 'search_geocoding',
    categoryFa: 'جست‌وجو و آدرس',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'تبدیل طول و عرض جغرافیایی به نام خیابان، محله، شهر و آدرس دقیق فارسی.',
    costTier: 'low',
    costNoteFa: 'فراخوانی سبک؛ کش ۱۰ دقیقه‌ای سمت سرور',
    backingServiceFa: 'Reverse Geocoding API (v5/reverse)',
    restEndpoint: '/v5/reverse',
    parametersSummary: ['lat', 'lng']
  },
  {
    name: 'neshan_geocode',
    titleFa: 'تبدیل آدرس متنی به مختصات GPS',
    category: 'search_geocoding',
    categoryFa: 'جست‌وجو و آدرس',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'ابزار پیش‌فرض و کم‌هزینه برای تبدیل آدرس یا نام خیابان و میدان به مختصات جغرافیایی.',
    costTier: 'low',
    costNoteFa: 'ارزان‌ترین ابزار Geocoding نشان؛ کش ۱۰ دقیقه‌ای',
    backingServiceFa: 'Geocoding API (v6/geocoding)',
    restEndpoint: '/v6/geocoding',
    parametersSummary: ['address']
  },
  {
    name: 'neshan_geocode_plus',
    titleFa: 'تبدیل آدرس پیشرفته (با پلاک، شهر و نقطه مرجع)',
    category: 'search_geocoding',
    categoryFa: 'جست‌وجو و آدرس',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'برای آدرس‌های دارای پلاک یا مکان‌های شاخص با تفکیک شهر، استان و نقطه مرجع (bias).',
    costTier: 'medium',
    costNoteFa: 'فراخوانی هنگام وجود شهر/پلاک یا نیاز به دقت بالاتر',
    backingServiceFa: 'Geocoding Plus API',
    restEndpoint: '/v6/geocoding',
    parametersSummary: ['address', 'city?', 'province?', 'bias_lat?', 'bias_lng?']
  },
  {
    name: 'neshan_get_point_by_hash',
    titleFa: 'جزئیات کامل مکان شاخص (ساعت کاری و تلفن)',
    category: 'search_geocoding',
    categoryFa: 'جست‌وجو و آدرس',
    policy: 'active_conditional',
    policyLabelFa: 'فعال مشروط (کنترل هزینه)',
    policyReasonFa: 'فقط برای نتایج منتخبی که فیلد verified_details_available آن‌ها true است فراخوانی می‌شود تا سهمیه مصرف نشود.',
    costTier: 'high',
    costNoteFa: 'هزینه سهمیه بالاتر؛ صرفاً برای ۱ تا ۳ مکان منتخب تاییدشده',
    backingServiceFa: 'POI Details API',
    restEndpoint: '/v1/places',
    parametersSummary: ['hash']
  },

  // ۲. مسیریابی و تحلیل مسافت (۵ ابزار)
  {
    name: 'neshan_direction',
    titleFa: 'مسیریابی هوشمند (خودرو، موتور، پیاده با ترافیک لحظه‌ای)',
    category: 'routing_matrix',
    categoryFa: 'مسیریابی و فاصله',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'محاسبه زمان و مسافت دقیق با ترافیک لحظه‌ای (live)، بدون ترافیک (no_traffic)، الگوهای معمول (typical) و تاریخی (historical).',
    costTier: 'medium',
    costNoteFa: 'کش کوتاه ۶۰ ثانیه‌ای برای حفظ تازگی ترافیک لحظه‌ای',
    backingServiceFa: 'Direction & Pedestrian API (v4/direction)',
    restEndpoint: '/v4/direction',
    parametersSummary: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'vehicle?', 'traffic_mode?', 'waypoints?', 'avoid_traffic_zone?', 'avoid_odd_even_zone?']
  },
  {
    name: 'neshan_distance_matrix',
    titleFa: 'ماتریس فاصله و زمان سفر بین چند مبدأ و مقصد',
    category: 'routing_matrix',
    categoryFa: 'مسیریابی و فاصله',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'مقایسه هم‌زمان فاصله و زمان رسیدن به چند صرافی، بانک یا فروشگاه از موقعیت کاربر.',
    costTier: 'medium',
    costNoteFa: 'محدود به حداکثر ۱۰ نقطه در هر درخواست برای مدیریت سهمیه',
    backingServiceFa: 'Distance Matrix API (v1/distance-matrix)',
    restEndpoint: '/v1/distance-matrix',
    parametersSummary: ['origins', 'destinations', 'type?', 'no_traffic?']
  },
  {
    name: 'neshan_tsp',
    titleFa: 'بهینه‌سازی ترتیب مراجعه به چند مقصد (TSP)',
    category: 'routing_matrix',
    categoryFa: 'مسیریابی و فاصله',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'پیدا کردن بهترین ترتیب سر زدن به چند بانک، اداره یا فروشگاه در یک مسیر.',
    costTier: 'medium',
    costNoteFa: 'مناسب برای ۳ تا ۱۰ ایستگاه کاری در شهر',
    backingServiceFa: 'TSP API (v3/tsp)',
    restEndpoint: '/v3/tsp',
    parametersSummary: ['waypoints', 'round_trip?', 'source_is_any_point?', 'last_is_any_point?']
  },
  {
    name: 'neshan_isochrone',
    titleFa: 'محدوده دسترس‌پذیری زمانی و مسافتی (Isochrone)',
    category: 'routing_matrix',
    categoryFa: 'مسیریابی و فاصله',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'شناسایی محدوده و محله‌هایی که در بازه زمانی مشخص (مثلاً ۱۵ دقیقه رانندگی) قابل دسترسی هستند.',
    costTier: 'medium',
    costNoteFa: 'کش ۵ دقیقه‌ای برای هر نقطه و بازه زمانی',
    backingServiceFa: 'Isochrone / Isodistance API',
    restEndpoint: '/v1/isochrone',
    parametersSummary: ['lat', 'lng', 'time?', 'distance?', 'polygon?', 'denoise?']
  },
  {
    name: 'neshan_map_matching',
    titleFa: 'تطبیق نقاط خام GPS با شبکه راه (Map Matching)',
    category: 'routing_matrix',
    categoryFa: 'مسیریابی و فاصله',
    policy: 'disabled_serverless',
    policyLabelFa: 'غیرفعال پیش‌فرض (تخصصی تلماتیک)',
    policyReasonFa: 'مختص پردازش لاگ‌های سخت‌افزار ردیاب خودرو است و در پرسش‌های محاوره‌ای کاربر کاربرد ندارد.',
    costTier: 'high',
    costNoteFa: 'حذف از کانتکست LLM برای کاهش مصرف توکن و خطای انتخاب ابزار',
    backingServiceFa: 'Map Matching API (v1/map-matching)',
    restEndpoint: '/v1/map-matching',
    parametersSummary: ['path_points']
  },

  // ۳. نقشه و تصویرسازی (۳ ابزار)
  {
    name: 'neshan_static_map',
    titleFa: 'تولید تصویر نقشه استاتیک از یک موقعیت',
    category: 'map_visualization',
    categoryFa: 'نقشه و تصویرسازی',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'تولید تصویر نقشه از نقطه هدف از طریق پروکسی امن سمت سرور بدون افشای کلید API در مرورگر.',
    costTier: 'low',
    costNoteFa: 'سرو از طریق پروکسی امن سرور با کش مرورگر',
    backingServiceFa: 'Static Map API (v2/static)',
    restEndpoint: '/v2/static',
    parametersSummary: ['lat', 'lng', 'zoom?', 'width?', 'height?', 'map_type?', 'marker?']
  },
  {
    name: 'neshan_static_map_arc',
    titleFa: 'تولید تصویر نقشه استاتیک با کمان مبدأ و مقصد',
    category: 'map_visualization',
    categoryFa: 'نقشه و تصویرسازی',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'نمایش بصری ارتباط بین مبدأ و مقصد روی نقشه نشان.',
    costTier: 'low',
    costNoteFa: 'سرو از طریق پروکسی امن سرور',
    backingServiceFa: 'Static Map Arc API',
    restEndpoint: '/v2/static/arc',
    parametersSummary: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'width?', 'height?', 'map_type?', 'dashed?']
  },
  {
    name: 'neshan_map_view',
    titleFa: 'ساخت فایل HTML نقشه تعاملی روی دیسک سرور',
    category: 'map_visualization',
    categoryFa: 'نقشه و تصویرسازی',
    policy: 'disabled_serverless',
    policyLabelFa: 'جایگزین‌شده با نقشه بومی فرانت‌اند',
    policyReasonFa: 'این ابزار فایل HTML را روی فایل‌سیستم سرور MCP ذخیره می‌کند و به کلید جداگانه Web SDK نیاز دارد؛ در دارینو با کامپوننت نقشه بومی فرانت‌اند جایگزین شده است.',
    costTier: 'low',
    costNoteFa: 'رندر مستقیم در رابط کاربری React دارینو',
    backingServiceFa: 'MapLibre Web SDK File Generator',
    restEndpoint: 'Local MCP File Output',
    parametersSummary: ['title?', 'markers?', 'routes?', 'show_traffic?', 'map_key?']
  },

  // ۴. ترافیک (۱ ابزار)
  {
    name: 'neshan_traffic_analytics',
    titleFa: 'تحلیل الگوی ترافیک ۲۴ ساعته یک محدوده',
    category: 'traffic_analytics',
    categoryFa: 'تحلیل ترافیک',
    policy: 'active_conditional',
    policyLabelFa: 'فعال مشروط (تحلیل ترافیک)',
    policyReasonFa: 'بررسی شاخص کلی ترافیک (KPI) و ساعات شلوغی ۲۴ ساعت گذشته در اطراف یک نقطه.',
    costTier: 'medium',
    costNoteFa: 'فراخوانی هنگام پرسش مستقیم درباره وضعیت و الگوی ترافیک منطقه',
    backingServiceFa: 'Traffic Analytics MCP Service',
    restEndpoint: '/mcp (neshan_traffic_analytics)',
    parametersSummary: ['lat', 'lng']
  },

  // ۵. ابزارهای کمکی (۱ ابزار)
  {
    name: 'neshan_deeplink',
    titleFa: 'ساخت لینک مستقیم باز کردن در اپلیکیشن و وب نشان',
    category: 'utilities',
    categoryFa: 'ابزارهای کمکی',
    policy: 'active_core',
    policyLabelFa: 'فعال (ضروری)',
    policyReasonFa: 'ایجاد لینک استاندارد باز کردن نقطه یا مسیریابی زنده در اپلیکیشن موبایل و وب نشان.',
    costTier: 'low',
    costNoteFa: 'رایگان و بدون مصرف سهمیه خارجی',
    backingServiceFa: 'Neshan Deep Link Generator',
    restEndpoint: '/maps',
    parametersSummary: ['link_type', 'lat?', 'lng?', 'origin_lat?', 'origin_lng?', 'dest_lat?', 'dest_lng?', 'vehicle?']
  },

  // ۶. لجستیک سازمانی و ابزارهای تخصصی/قدیمی (۴ ابزار از ۱۹ ابزار)
  {
    name: 'neshan_vrp_logistic',
    titleFa: 'مسیریابی ناوگان پخش مویرگی (VRP)',
    category: 'enterprise_logistics',
    categoryFa: 'لجستیک سازمانی و تخصصی',
    policy: 'disabled_serverless',
    policyLabelFa: 'غیرفعال (خارج از دامنه کاربری شخصی)',
    policyReasonFa: 'مختص زمان‌بندی ناوگان توزیع با محدودیت ظرفیت و شیفت رانندگان؛ برای کاربر دارینو کاربردی ندارد.',
    costTier: 'high',
    costNoteFa: 'غیرفعال برای جلوگیری از مصرف سنگین سهمیه',
    backingServiceFa: 'VRP Logistic API',
    restEndpoint: '/v1/vrp',
    parametersSummary: ['vehicles', 'jobs', 'depot']
  },
  {
    name: 'neshan_nearby_category',
    titleFa: 'جست‌وجوی دسته‌بندی اطراف (پوشش در neshan_search)',
    category: 'enterprise_logistics',
    categoryFa: 'لجستیک سازمانی و تخصصی',
    policy: 'disabled_serverless',
    policyLabelFa: 'ادغام‌شده در neshan_search',
    policyReasonFa: 'با پارامتر layer_slug و term در neshan_search پوشش داده می‌شود.',
    costTier: 'low',
    costNoteFa: 'بدون نیاز به تعریف ابزار جداگانه',
    backingServiceFa: 'Nearby Search API',
    restEndpoint: '/v1/search',
    parametersSummary: ['lat', 'lng', 'category']
  },
  {
    name: 'neshan_region_lookup',
    titleFa: 'تشخیص محدوده و تقسیمات کشوری (پوشش در Reverse Geocode)',
    category: 'enterprise_logistics',
    categoryFa: 'لجستیک سازمانی و تخصصی',
    policy: 'disabled_serverless',
    policyLabelFa: 'ادغام‌شده در neshan_reverse_geocode',
    policyReasonFa: 'خروجی neshan_reverse_geocode شامل نام شهر، منطقه شهرداری، محله و استان است.',
    costTier: 'low',
    costNoteFa: 'بدون نیاز به فراخوانی مجزا',
    backingServiceFa: 'Region API',
    restEndpoint: '/v5/reverse',
    parametersSummary: ['lat', 'lng']
  },
  {
    name: 'neshan_zipcode_lookup',
    titleFa: 'استعلام کدپستی (حذف‌شده در نسخه ۰.۳.۰ سرور نشان)',
    category: 'enterprise_logistics',
    categoryFa: 'لجستیک سازمانی و تخصصی',
    policy: 'disabled_serverless',
    policyLabelFa: 'حذف‌شده در مخزن رسمی نشان',
    policyReasonFa: 'طبق تاریخچه کامیت‌های Neshan-MCP (remove zipcode) از سرور رسمی حذف شده است.',
    costTier: 'medium',
    costNoteFa: 'غیرفعال',
    backingServiceFa: 'Deprecated Zipcode Service',
    restEndpoint: 'N/A',
    parametersSummary: ['zipcode']
  }
] as const;

export const ACTIVE_NESHAN_TOOL_NAMES = NESHAN_MCP_TOOLS_CATALOG
  .filter((t) => t.policy !== 'disabled_serverless')
  .map((t) => t.name);

/* ---------------- مختصات مرجع شهرهای ایران و محله‌های اهواز ---------------- */
export interface GeoAnchor {
  id: string;
  nameFa: string;
  cityFa: string;
  lat: number;
  lng: number;
  keywords: string[];
}

export const GEO_ANCHORS: readonly GeoAnchor[] = [
  // اهواز و محله‌های اصلی
  { id: 'ahvaz-center', nameFa: 'مرکز شهر اهواز (فلکه ساعت / نادری)', cityFa: 'اهواز', lat: 31.3203, lng: 48.6842, keywords: ['مرکز شهر اهواز', 'فلکه ساعت', 'نادری اهواز', 'چهارراه نادری', 'اهواز'] },
  { id: 'ahvaz-kianpars', nameFa: 'کیانپارس اهواز', cityFa: 'اهواز', lat: 31.3489, lng: 48.6881, keywords: ['کیانپارس', 'کیان پارس', 'وهابی', 'خیابان وهابی'] },
  { id: 'ahvaz-kianabad', nameFa: 'کیان‌آباد اهواز', cityFa: 'اهواز', lat: 31.3522, lng: 48.6789, keywords: ['کیان آباد', 'کیان‌آباد', 'کیان آباد شرقی', 'کیاناباد'] },
  { id: 'ahvaz-golestan', nameFa: 'گلستان اهواز', cityFa: 'اهواز', lat: 31.2897, lng: 48.6175, keywords: ['گلستان اهواز', 'محله گلستان', 'گلستان', 'فروردین گلستان'] },
  { id: 'ahvaz-daneshgah', nameFa: 'شهرک دانشگاه اهواز', cityFa: 'اهواز', lat: 31.3005, lng: 48.6024, keywords: ['شهرک دانشگاه', 'شهرک دانشگاه اهواز'] },
  { id: 'ahvaz-pardis', nameFa: 'پردیس اهواز', cityFa: 'اهواز', lat: 31.2804, lng: 48.5842, keywords: ['پردیس اهواز', 'محله پردیس'] },
  { id: 'ahvaz-zeytoon', nameFa: 'زیتون کارمندی اهواز', cityFa: 'اهواز', lat: 31.3519, lng: 48.7248, keywords: ['زیتون کارمندی', 'زیتون اهواز', 'فلکه سنگر', 'پارک زیتون'] },
  { id: 'ahvaz-amanieh', nameFa: 'امانیه اهواز', cityFa: 'اهواز', lat: 31.3258, lng: 48.6694, keywords: ['امانیه', 'امانیه اهواز', 'سقراط'] },
  { id: 'ahvaz-padad', nameFa: 'پادادشهر اهواز', cityFa: 'اهواز', lat: 31.3014, lng: 48.7042, keywords: ['پادادشهر', 'پاداد'] },
  { id: 'ahvaz-saheli', nameFa: 'بلوار ساحلی اهواز', cityFa: 'اهواز', lat: 31.3352, lng: 48.6815, keywords: ['ساحلی اهواز', 'بلوار ساحلی', 'پل سفید', 'پل سیاه'] },
  { id: 'ahvaz-industrial-2', nameFa: 'شهرک صنعتی شماره ۲ اهواز', cityFa: 'اهواز', lat: 31.3912, lng: 48.7485, keywords: ['شهرک صنعتی شماره ۲', 'شهرک صنعتی ۲ اهواز'] },

  // تهران و نقاط شاخص
  { id: 'tehran-vanak', nameFa: 'میدان ونک تهران', cityFa: 'تهران', lat: 35.7575, lng: 51.4099, keywords: ['میدان ونک', 'ونک تهران', 'ونک'] },
  { id: 'tehran-azadi', nameFa: 'میدان آزادی تهران', cityFa: 'تهران', lat: 35.6997, lng: 51.3381, keywords: ['میدان آزادی', 'آزادی تهران'] },
  { id: 'tehran-ferdowsi', nameFa: 'میدان فردوسی تهران (راسته صرافی‌ها)', cityFa: 'تهران', lat: 35.7016, lng: 51.4193, keywords: ['میدان فردوسی', 'چهارراه استانبول', 'سبزه میدان', 'تهران'] },
  { id: 'tehran-tajrish', nameFa: 'میدان تجریش تهران', cityFa: 'تهران', lat: 35.8068, lng: 51.4288, keywords: ['میدان تجریش', 'تجریش'] },
  { id: 'tehran-milad', nameFa: 'برج میلاد تهران', cityFa: 'تهران', lat: 35.7448, lng: 51.3753, keywords: ['برج میلاد'] },
  { id: 'tehran-ika', nameFa: 'فرودگاه امام خمینی', cityFa: 'تهران', lat: 35.4161, lng: 51.1522, keywords: ['فرودگاه امام خمینی', 'فرودگاه امام'] },

  // سایر کلان‌شهرها
  { id: 'isfahan-center', nameFa: 'مرکز شهر اصفهان (دروازه دولت / چهارباغ)', cityFa: 'اصفهان', lat: 32.6546, lng: 51.668, keywords: ['اصفهان', 'چهارباغ اصفهان', 'سی و سه پل'] },
  { id: 'mashhad-center', nameFa: 'مرکز شهر مشهد', cityFa: 'مشهد', lat: 36.297, lng: 59.6062, keywords: ['مشهد', 'احمدآباد مشهد'] },
  { id: 'shiraz-center', nameFa: 'مرکز شهر شیراز (زند / ملاصدرا)', cityFa: 'شیراز', lat: 29.617, lng: 52.5911, keywords: ['شیراز', 'خیابان زند شیراز', 'ملاصدرا شیراز'] },
  { id: 'tabriz-center', nameFa: 'مرکز شهر تبریز (ولیعصر / آبرسان)', cityFa: 'تبریز', lat: 38.08, lng: 46.2919, keywords: ['تبریز', 'ولیعصر تبریز', 'آبرسان تبریز'] },
  { id: 'karaj-center', nameFa: 'مرکز شهر کرج (عظیمیه / گوهردشت)', cityFa: 'کرج', lat: 35.8345, lng: 50.9457, keywords: ['کرج', 'عظیمیه کرج', 'گوهردشت کرج'] }
];

/** یافتن نقطه مرجع از متن فارسی (تشخیص بازه‌های غیرهمپوشان با اولویت عبارت طولانی‌تر، مرتب‌شده به ترتیب ظهور در متن) */
export function resolveGeoAnchors(text: string, fallbackCitySlug = 'ahvaz'): GeoAnchor[] {
  const normalized = text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ');
  const candidates: { anchor: GeoAnchor; kw: string; start: number; end: number }[] = [];
  for (const anchor of GEO_ANCHORS) {
    for (const kw of anchor.keywords) {
      const nkw = kw.replace(/\u200c/g, ' ');
      let from = 0;
      while (from <= normalized.length - nkw.length) {
        const idx = normalized.indexOf(nkw, from);
        if (idx < 0) break;
        candidates.push({ anchor, kw: nkw, start: idx, end: idx + nkw.length });
        from = idx + 1;
      }
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken: [number, number][] = [];
  const accepted: { anchor: GeoAnchor; start: number }[] = [];
  for (const c of candidates) {
    if (taken.some(([s, e]) => c.start < e && c.end > s)) continue;
    taken.push([c.start, c.end]);
    accepted.push({ anchor: c.anchor, start: c.start });
  }
  accepted.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const out: GeoAnchor[] = [];
  for (const item of accepted) {
    if (!seen.has(item.anchor.id)) {
      seen.add(item.anchor.id);
      out.push(item.anchor);
    }
  }
  if (!out.length) {
    const cityMap: Record<string, string> = {
      ahvaz: 'ahvaz-center',
      tehran: 'tehran-ferdowsi',
      isfahan: 'isfahan-center',
      mashhad: 'mashhad-center',
      shiraz: 'shiraz-center',
      tabriz: 'tabriz-center',
      karaj: 'karaj-center'
    };
    const fallback = GEO_ANCHORS.find((a) => a.id === (cityMap[fallbackCitySlug] ?? 'ahvaz-center'));
    if (fallback) out.push(fallback);
  }
  return out;
}

/** استخراج مختصات صریح GPS از متن کاربر (مثلاً 31.3203, 48.6842) */
export function extractCoordinatesFromText(text: string): { lat: number; lng: number }[] {
  const normalized = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const regex = /\b(2[4-9]|3[0-9])\.(\d{2,8})\s*[,،\s]\s*(4[4-9]|5[0-9]|6[0-3])\.(\d{2,8})\b/g;
  const out: { lat: number; lng: number }[] = [];
  for (const m of normalized.matchAll(regex)) {
    const lat = Number(`${m[1]}.${m[2]}`);
    const lng = Number(`${m[3]}.${m[4]}`);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}

/* ---------------- ساخت لینک مستقیم نشان (neshan_deeplink) ---------------- */

export interface NeshanDeeplinkResult {
  linkType: 'point' | 'routing';
  webUrl: string;
  androidAndWebUrl: string;
  iosUrl: string;
  searchWebUrl?: string;
}

const NESHAN_WEB_ROOT = 'https://platform.neshan.org';

export function buildNeshanDeeplink(params: {
  linkType: 'point' | 'routing';
  lat?: number;
  lng?: number;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  vehicle?: 'car' | 'motorcycle' | 'pedestrian';
  queryText?: string;
}): NeshanDeeplinkResult {
  const v = params.vehicle ?? 'car';
  const mapHost = NESHAN_WEB_ROOT.replace('platform.', '');
  if (
    params.linkType === 'routing' &&
    typeof params.originLat === 'number' &&
    typeof params.originLng === 'number' &&
    typeof params.destLat === 'number' &&
    typeof params.destLng === 'number'
  ) {
    const oLat = params.originLat.toFixed(6);
    const oLng = params.originLng.toFixed(6);
    const dLat = params.destLat.toFixed(6);
    const dLng = params.destLng.toFixed(6);
    const mode = v === 'motorcycle' ? 'motorcycle' : v === 'pedestrian' ? 'walk' : 'car';
    const webUrl = `${mapHost}/maps/routing/${mode}/origin/${oLat},${oLng}/destination/${dLat},${dLng}`;
    const androidAndWebUrl = `${mapHost}/maps/?origin=${oLat},${oLng}&destination=${dLat},${dLng}&vehicle=${v === 'pedestrian' ? 'car' : v}`;
    const iosUrl = `${mapHost}/maps/?origin=${oLat},${oLng}&destination=${dLat},${dLng}`;
    return { linkType: 'routing', webUrl, androidAndWebUrl, iosUrl };
  }

  const lat = (params.lat ?? params.originLat ?? 31.3203).toFixed(6);
  const lng = (params.lng ?? params.originLng ?? 48.6842).toFixed(6);
  const webUrl = `${mapHost}/maps/@${lat},${lng},15.0z`;
  const androidAndWebUrl = `${mapHost}/maps/?lat=${lat}&lng=${lng}`;
  const iosUrl = `${mapHost}/maps/@${lat},${lng},15.0z`;
  const searchWebUrl = params.queryText
    ? `${mapHost}/maps/@${lat},${lng},14.0z/search/${encodeURIComponent(params.queryText.trim())}`
    : undefined;
  return { linkType: 'point', webUrl, androidAndWebUrl, iosUrl, searchWebUrl };
}

/* ---------------- تشخیص نیت مکانی و دسته‌بندی مالی/عمومی ---------------- */

export type SpatialIntentKind =
  | 'search_poi'
  | 'routing'
  | 'reverse_geocode'
  | 'geocode'
  | 'isochrone'
  | 'tsp'
  | 'distance_matrix'
  | 'traffic';

export interface SpatialQueryAnalysis {
  intent: SpatialIntentKind;
  isFinancialRelated: boolean;
  financialCategoryFa: string | null;
  searchTerm: string;
  vehicle: 'car' | 'motorcycle' | 'pedestrian';
  trafficMode: 'live' | 'no_traffic' | 'typical' | 'historical';
  isochroneMinutes: number | null;
  isochroneKm: number | null;
  anchors: GeoAnchor[];
  explicitCoords: { lat: number; lng: number }[];
}

const FINANCIAL_KEYWORDS: [RegExp, string, string][] = [
  [/صرافی|تبدیل ارز|دلار|سکه و ارز/u, 'صرافی', 'صرافی و خدمات ارزی'],
  [/بانک\s+([^\s،.]+)/u, 'بانک', 'شعبه بانکی'],
  [/بانک/u, 'بانک', 'شعبه بانکی'],
  [/خودپرداز|عابربانک|atm/iu, 'خودپرداز', 'خودپرداز (ATM)'],
  [/کارگزاری|بورس|پیشخوان بورس/u, 'کارگزاری بورس', 'کارگزاری و خدمات بازار سرمایه'],
  [/طلا|طلافروشی|سکه|جواهر/u, 'طلا و سکه', 'بازار طلا و سکه'],
  [/بیمه/u, 'نمایندگی بیمه', 'خدمات بیمه'],
  [/دفتر اسناد|محضر|ثبت اسناد/u, 'دفتر اسناد رسمی', 'دفتر اسناد رسمی (معاملات ملک و خودرو)'],
  [/تعویض پلاک|پلیس\s*\+?\s*۱۰|پلیس ۱۰/u, 'مرکز تعویض پلاک', 'خدمات خودرو و تعویض پلاک']
];

const GENERAL_POI_KEYWORDS: [RegExp, string][] = [
  [/پمپ\s*بنزین|جایگاه سوخت|بنزین|cng/iu, 'پمپ بنزین'],
  [/داروخانه|دواخانه/u, 'داروخانه'],
  [/بیمارستان|درمانگاه|کلینیک|اورژانس/u, 'بیمارستان'],
  [/سوپرمارکت|هایپرمارکت|فروشگاه زنجیره/u, 'سوپرمارکت'],
  [/کافه|قهوه|کافی\s*شاپ/u, 'کافه'],
  [/رستوران|غذا|کبابی|فست\s*فود/u, 'رستوران'],
  [/پارکینگ/u, 'پارکینگ'],
  [/مترو|ایستگاه مترو/u, 'ایستگاه مترو'],
  [/فرودگاه/u, 'فرودگاه'],
  [/ترمینال|پایانه/u, 'پایانه مسافربری']
];

export function analyzeSpatialQuery(text: string, fallbackCitySlug = 'ahvaz'): SpatialQueryAnalysis {
  const clean = text.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const explicitCoords = extractCoordinatesFromText(clean);
  const anchors = resolveGeoAnchors(clean, fallbackCitySlug);

  const vehicle: 'car' | 'motorcycle' | 'pedestrian' =
    /موتور|موتورسیکلت/u.test(clean) ? 'motorcycle' : /پیاده|پیاده‌روی/u.test(clean) ? 'pedestrian' : 'car';

  const trafficMode: 'live' | 'no_traffic' | 'typical' | 'historical' =
    /بدون ترافیک/u.test(clean) ? 'no_traffic' : /معمول|عادی/u.test(clean) ? 'typical' : 'live';

  // ۱. بررسی مختصات GPS به آدرس (Reverse Geocode)
  if (explicitCoords.length === 1 && /مختصات|کدام خیابان|کجاست|آدرس این نقطه|این نقطه/u.test(clean)) {
    return {
      intent: 'reverse_geocode',
      isFinancialRelated: false,
      financialCategoryFa: null,
      searchTerm: clean,
      vehicle,
      trafficMode,
      isochroneMinutes: null,
      isochroneKm: null,
      anchors,
      explicitCoords
    };
  }

  // ۲. بررسی محدوده دسترس‌پذیری (Isochrone)
  const isoMinMatch = clean.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/(\d{1,2})\s*دقیقه/u);
  const isoKmMatch = clean.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/(\d{1,2})\s*کیلومتر/u);
  if ((isoMinMatch || isoKmMatch) && /در فاصله|محدوده|قابل دسترس|شعاع|چند دقیقه رانندگی|دقیقه رانندگی/u.test(clean)) {
    let searchTerm = '';
    let isFinancialRelated = false;
    let financialCategoryFa: string | null = null;
    for (const [re, term, cat] of FINANCIAL_KEYWORDS) {
      if (re.test(clean)) {
        searchTerm = term;
        isFinancialRelated = true;
        financialCategoryFa = cat;
        break;
      }
    }
    if (!searchTerm) {
      for (const [re, term] of GENERAL_POI_KEYWORDS) {
        if (re.test(clean)) {
          searchTerm = term;
          break;
        }
      }
    }
    return {
      intent: 'isochrone',
      isFinancialRelated,
      financialCategoryFa,
      searchTerm: searchTerm || 'مراکز خدماتی و تجاری',
      vehicle,
      trafficMode,
      isochroneMinutes: isoMinMatch ? Math.min(60, Math.max(5, Number(isoMinMatch[1]))) : 15,
      isochroneKm: isoKmMatch ? Math.min(50, Math.max(1, Number(isoKmMatch[1]))) : null,
      anchors,
      explicitCoords
    };
  }

  // ۳. بررسی بهینه‌سازی مسیر چند ایستگاهی (TSP)
  if (/بهترین ترتیب|چند مقصد|چند مکان مختلف|چند جا سر بزنم|مسیر چند/u.test(clean)) {
    return {
      intent: 'tsp',
      isFinancialRelated: false,
      financialCategoryFa: null,
      searchTerm: clean,
      vehicle,
      trafficMode,
      isochroneMinutes: null,
      isochroneKm: null,
      anchors,
      explicitCoords
    };
  }

  // ۴. بررسی مسیریابی یا فاصله بین دو نقطه
  if (
    (/مسیر|رسیدن از|فاصله|چقدر زمان|چقدر طول|چقدر راه|ترافیک فعلی/u.test(clean) && (anchors.length >= 2 || /از\s+.+\s+(?:تا|به)\s+/u.test(clean))) ||
    explicitCoords.length >= 2
  ) {
    return {
      intent: 'routing',
      isFinancialRelated: false,
      financialCategoryFa: null,
      searchTerm: clean,
      vehicle,
      trafficMode,
      isochroneMinutes: null,
      isochroneKm: null,
      anchors,
      explicitCoords
    };
  }

  // ۵. بررسی تحلیل ترافیک منطقه
  if (/وضعیت ترافیک|الگوی ترافیک|ترافیک ۲۴ ساعت|ترافیک محدوده/u.test(clean)) {
    return {
      intent: 'traffic',
      isFinancialRelated: false,
      financialCategoryFa: null,
      searchTerm: clean,
      vehicle,
      trafficMode,
      isochroneMinutes: null,
      isochroneKm: null,
      anchors,
      explicitCoords
    };
  }

  // ۶. بررسی تبدیل آدرس به مختصات
  if (/مختصات\s+|طول و عرض جغرافیایی|نشانی دقیق/u.test(clean) && !/نزدیک/u.test(clean)) {
    return {
      intent: 'geocode',
      isFinancialRelated: false,
      financialCategoryFa: null,
      searchTerm: clean.replace(/مختصات|طول و عرض جغرافیایی|نشانی دقیق|پیدا کن|کجاست/gu, '').trim() || clean,
      vehicle,
      trafficMode,
      isochroneMinutes: null,
      isochroneKm: null,
      anchors,
      explicitCoords
    };
  }

  // ۷. پیش‌فرض: جست‌وجوی مکان، صرافی، بانک، فروشگاه یا خدمات (search_poi)
  let searchTerm = '';
  let isFinancialRelated = false;
  let financialCategoryFa: string | null = null;
  for (const [re, term, cat] of FINANCIAL_KEYWORDS) {
    const m = clean.match(re);
    if (m) {
      searchTerm = m[1] ? `بانک ${m[1]}` : term;
      isFinancialRelated = true;
      financialCategoryFa = cat;
      break;
    }
  }
  if (!searchTerm) {
    for (const [re, term] of GENERAL_POI_KEYWORDS) {
      if (re.test(clean)) {
        searchTerm = term;
        break;
      }
    }
  }
  if (!searchTerm) {
    searchTerm = clean
      .replace(/نزدیک‌ترین|نزدیک ترین|نزدیک|پیدا کن|کجاست|کجا هستند|در اطراف|به من|لطفاً/gu, '')
      .trim() || clean;
  }

  return {
    intent: 'search_poi',
    isFinancialRelated,
    financialCategoryFa,
    searchTerm,
    vehicle,
    trafficMode,
    isochroneMinutes: null,
    isochroneKm: null,
    anchors,
    explicitCoords
  };
}

/* ---------------- مدل داده خروجی پاسخ مکانی دارینو ---------------- */

export interface NeshanPlaceItem {
  title: string;
  address: string;
  neighbourhood?: string | null;
  region?: string | null;
  category?: string | null;
  type?: string | null;
  lat: number;
  lng: number;
  distanceMeters?: number | null;
  durationMinutes?: number | null;
  poiHash?: string | null;
  verifiedDetailsAvailable?: boolean;
  phone?: string | null;
  openingHours?: string | null;
  deeplink: NeshanDeeplinkResult;
}

export interface NeshanRouteSummary {
  originTitle: string;
  originLat: number;
  originLng: number;
  destTitle: string;
  destLat: number;
  destLng: number;
  vehicle: 'car' | 'motorcycle' | 'pedestrian';
  trafficMode: 'live' | 'no_traffic' | 'typical' | 'historical';
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  summaryText: string;
  steps: { instruction: string; distanceText: string; durationText: string }[];
  overviewPolyline?: string | null;
  deeplink: NeshanDeeplinkResult;
}

export interface NeshanIsochroneSummary {
  centerTitle: string;
  lat: number;
  lng: number;
  timeMinutes?: number | null;
  distanceKm?: number | null;
  polygonCoordinatesCount: number;
  boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
}

export interface NeshanToolTrace {
  tool: string;
  status: 'ok' | 'error' | 'unconfigured';
  transport: 'neshan-mcp' | 'neshan-rest' | 'local-deeplink';
  durationMs: number;
  note?: string;
}

export interface NeshanAskResponse {
  query: string;
  analysis: SpatialQueryAnalysis;
  answer: string;
  places: NeshanPlaceItem[];
  route: NeshanRouteSummary | null;
  reverseAddress: {
    formattedAddress: string;
    routeName?: string | null;
    neighbourhood?: string | null;
    city?: string | null;
    state?: string | null;
    lat: number;
    lng: number;
    deeplink: NeshanDeeplinkResult;
  } | null;
  isochrone: NeshanIsochroneSummary | null;
  tspOrder: { index: number; name: string; lat: number; lng: number }[] | null;
  staticMapProxyUrl: string | null;
  deeplinks: NeshanDeeplinkResult[];
  toolTraces: NeshanToolTrace[];
  sourceMeta: {
    provider: 'Neshan Official MCP Server';
    mcpServerUrl: string;
    mcpfarsiUrl: string;
    docsUrl: string;
    neshanKeyConfigured: boolean;
    geminiKeyConfigured: boolean;
    liveDataVerified: boolean;
    fetchedAt: number;
  };
}

export interface NeshanStatusResponse {
  neshanKeyConfigured: boolean;
  geminiKeyConfigured: boolean;
  mcpServerUrl: string;
  docsUrl: string;
  mcpfarsiUrl: string;
  activeToolsCount: number;
  totalCatalogToolsCount: number;
  quota: {
    perMinuteLimit: number;
    cacheTtlSearchSec: number;
    cacheTtlRoutingSec: number;
  };
  tools: readonly NeshanToolMeta[];
}
