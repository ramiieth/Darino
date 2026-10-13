/** ============================================================
 * فهم درخواست فارسی — بدون مدل زبانی، قطعی و قابل تست
 *
 *  «ارزان‌ترین پرواز به کیش از اهواز» → نیت flight، مبدأ اهواز، مقصد کیش، مرتب‌سازی ارزان
 *  «ویلا در شمال شبی حداکثر ۳ میلیون» → نیت stay، شهرهای شمال، سقف ۳٬۰۰۰٬۰۰۰ تومان
 * ============================================================ */
import { NORTH, cityByName, findCities } from './cities.js';
import { namedServices, SERVICE } from './services.js';
import type { CityRef, Intent, ShopQuery } from './types.js';

const FA_DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** ی/ک عربی، ارقام فارسی، نیم‌فاصله و فاصله‌های تکراری را یکسان می‌کند */
export function normalizeFa(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => FA_DIGITS[d])
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه')
    .replace(/‌/g, ' ')
    .replace(/[،؛؟!?,;:«»"()]/g, ' ')
    .replace(/(^|\s)(نیم|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده) (کیلو|کیلوگرم|لیتر|عدد|بسته)/g, (_, p: string, n: string, u: string) => `${p}${n === 'نیم' ? '0.5' : NUMBER_WORDS[n]} ${u}`)
    .replace(/(\d)\.(?!\d)/g, '$1 ').replace(/(^|[^\d])\./g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (t: string, re: RegExp) => re.test(t);

const INTENT_RULES: [Intent, RegExp][] = [
  ['job', /استخدام|استخدامی|شغل|فرصت شغلی|کاریابی|جویای کار|نیروی (کار|خدماتی|ساده|متخصص)|(^|\s)(منشی|کارگر|کارمند|حسابدار|فروشنده|صندوقدار|پیک موتوری|نگهبان|نظافتچی|آشپز|باریستا|راننده پایه)(\s|$)/],
  ['estate', /رهن|ودیعه|املاک|مسکن|(اجاره|خرید|فروش|پیش ?فروش)( ?ی)? (خانه|آپارتمان|ملک|زمین|سوئیت|سوییت|ویلا|مغازه|واحد|منزل|دفتر|سوله|انبار|کلنگی)|(خانه|آپارتمان|ملک|زمین|منزل|مغازه|واحد|سوئیت|سوییت|ویلا)( ?ی)? (اجاره|اجاره ای|رهنی|فروشی|برای اجاره|برای فروش)|\d+ ?متری/],
  ['car', /خودرو|اتومبیل|ماشین(?! ?(لباسشویی|ظرفشویی|حساب|اصلاح|ریش|چمن|کنترل|اسباب))|پراید|پژو|سمند|تیبا|(^|\s)دنا(\s|$)|کوییک|ساینا|(^|\s)رانا(\s|$)|شاهین|هایما|(^|\s)جک(\s|$)|چری|ام ?وی ?ام|لیفان|تویوتا|هیوندای|(^|\s)کیا(\s|$)|بنز|بی ?ام ?و|موتور ?سیکلت|وانت|(^|\s)نیسان(\s|$)|قطعات (یدکی|خودرو)|لوازم یدکی|(^|\s)لاستیک|رینگ خودرو/],
  ['service', /تعمیر|تعمیرکار|تعمیرات|آرایشگاه|سالن (زیبایی|آرایش)|مکانیک|نقاشی ساختمان|لوله ?کش|برق ?کار|سرویس کولر|نظافت (منزل|ساختمان)|خدمات|اسباب ?کشی|باربری|حمل بار|معلم خصوصی|تدریس|کلاس (خصوصی|زبان|کنکور)|عکاس|تشریفات|کابینت ?ساز|جوشکار|کاشی ?کار|کارواش|نصاب/],
  ['flight', /پرواز|هواپیما|بلیت? هواپیما|ایرلاین/],
  ['train', /قطار|رجا|راه ?آهن/],
  ['taxi', /تاکسی|دربست|داربست|سواری (بین ?شهری|دربست)|بین ?شهری (سواری|دربست)/],
  ['bus', /اتوبوس|ترمینال|(^|\s)vip(\s|$)|اسکانیا|ولوو|مینی ?بوس|سواری بین ?شهری/i],
  ['tour', /(^|\s)تور(\s|$|های|ها)/],
  ['stay', /ویلا|هتل|اقامت|اقامتگاه|سوئیت|سوییت|بوم ?گردی|کلبه|آپارتمان مبله|اتاق (هتل|برای|شبی)|شبی /],
  ['doctor', /دکتر|پزشک|متخصص|دندان|کلینیک|لیزیک|لازک|prk|جراح|ارتودنسی|ویزیت|مطب|نوبت (خالی|دکتر|پزشک)/i],
  ['food', /غذا|رستوران|فست ?فود|پیتزا|همبرگر|برگر|کباب|کوبیده|جوجه|قورمه|خورش|کافه|لاته|قهوه|نوشیدنی|کروسان|کیک|ساندویچ|سوشی|کترینگ|شیرینی|بستنی|چلو|پاستا|سوخاری|فلافل|صبحانه|ناهار|شام/],
  ['grocery', /سوپرمارکت|سوپر مارکت|خواربار|میوه|سبزی|تره ?بار|هایپر ?مارکت|بقالی|نانوایی|قصابی|مرغ ?فروشی|ماهی ?فروشی|لبنیات|خرید روزانه|مایونز|کچاپ|سوسیس|کالباس|ژامبون|تن ماهی|کنسرو|رب گوجه|حبوبات|عدس|لوبیا|نخود|ماکارونی|اسپاگتی|رشته|آرد|چیپس|پفک|بیسکویت|ویفر|شکلات|کیک یزدی|نوشابه|آب معدنی|دلستر|آبمیوه|مربا|عسل|کره بادام ?زمینی|خرما|زعفران|ادویه|زردچوبه|نمک|شوینده|مایع دستشویی|دستمال|پوشک|نوار بهداشتی|(^|\s)(شیر|گوشت|مرغ|ماهی|ماست|پنیر|کره|خامه|دوغ|تخم ?مرغ|برنج|روغن|نان تست|حبوبات|ماکارونی|رب گوجه|چای|قند|شکر|دستمال کاغذی|پوشک|مایع ظرفشویی|پودر لباسشویی|کنسرو|سس)(\s|$)/],
  ['book', /کتاب|رمان|کتاب صوتی/],
  ['beauty', /آرایش|رژ لب|رژلب|ضد ?آفتاب|عطر|ادکلن|ریمل|کرم (پودر|مرطوب|ضد)|سرم (پوست|مو)|شامپو|لوازم آرایشی|ماسک (صورت|مو)/],
  ['fashion', /کفش|کتونی|(^|\s)لباس(?! ?شویی)|مانتو|شلوار|پیراهن|تیشرت|تی شرت|کاپشن|جین|کیف (زنانه|مردانه|دستی)|پوشاک|هودی|سویشرت/]
];

/** واژه‌هایی که بخشی از نام کالا نیستند */
const FILLER = new Set(('نشان نشون بدین بدی ببینم ببینیم لیست فهرست آگهی آگهیهای آگهی‌های اگهی فروشی بفروشه فروشه میفروشه میفروشد فروشد فروشنده‌ای بگو بگید بیار بیاور ' +
  'را رو برای برام من معرفی کن کنید بکن پیدا بده بدید پیشنهاد بهترین بهتر ارزان ارزون ترین ارزانترین ارزونترین ' +
  'در شهر از به با که یک یه و یا حداکثر حداقل شبی تومان تومن میلیون میلیارد هزار نوبت خالی بر اساس نظرات کاربران شهرت سابقه باشد ' +
  'کارکرده کار کرده دست دوم دسته استوک سایت پلتفرم ها های دیگر قیمت کمترین بیشترین لطفا لطفاً میخواهم می خواهم میخوام خرید بخرم ' +
  'تخفیف خورده دار تخفیفی تخفیف‌دار کافه های رستوران رستوران‌های فست فود کترینگ چی چه کجا کجاست هست است کدام کدوم نزدیک اطراف ' +
  'مقرون صرفه اقتصادی دسترسی ترین قدم نقشه طبق مسیر رفتن آن اون توضیح هم همه زیر تا سقف بودجه کمتر بین فروش خوب عالی جدید نو').split(' '));

const INSTALLMENT = /قسط|اقساط|اعتباری|بدون پیش ?پرداخت|اسنپ ?پی|دیجی ?پی/;

const NUMBER_WORDS: Record<string, number> = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10 };
const UNIT: Record<string, number> = { میلیارد: 1e9, میلیون: 1e6, م: 1e6, هزار: 1e3, تومان: 1, تومن: 1 };

/** «حداکثر ۲ یا ۳ یا ۴ میلیون» → ۴٬۰۰۰٬۰۰۰ (فراگیرترین گزینه)؛ «بین ۱۰ تا ۲۰ میلیون» → [۱۰م، ۲۰م] */
export function parseBudget(t: string): { min: number | null; max: number | null; span: [number, number] | null } {
  const num = '(\\d+(?:[.\\/]\\d+)?)';
  const between = new RegExp(`بین ${num} (?:تا|و) ${num} ?(میلیارد|میلیون|هزار)`).exec(t);
  if (between) {
    const u = UNIT[between[3]];
    return { min: Math.round(Number(between[1].replace('/', '.')) * u), max: Math.round(Number(between[2].replace('/', '.')) * u), span: [between.index, between.index + between[0].length] };
  }
  const re = new RegExp(`(حداکثر|نهایتا|نهایتاً|زیر|کمتر از|تا سقف|سقف|بودجه(?: ام| من)?|تا|حداقل|بالای|بیشتر از) ?((?:${num} ?(?:یا|تا|و) ?)*${num}) ?(میلیارد|میلیون|هزار|تومان|تومن)`, 'g');
  let min: number | null = null; let max: number | null = null; let span: [number, number] | null = null;
  for (const m of t.matchAll(re)) {
    const values = [...m[2].matchAll(/\d+(?:[.\/]\d+)?/g)].map((v) => Number(v[0].replace('/', '.')) * UNIT[m[m.length - 1]]);
    if (!values.length) continue;
    if (/حداقل|بالای|بیشتر از/.test(m[1])) min = Math.round(Math.min(...values));
    else max = Math.round(Math.max(...values));
    span ??= [m.index ?? 0, (m.index ?? 0) + m[0].length];
  }
  return { min, max, span };
}

/* ---------- تاریخ ---------- */

/** جلالی → میلادی (الگوریتم استاندارد jdf) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let y = jy + 1595;
  let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  y = gy;
  let gd = days + 1;
  const months = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 12 && gd > months[gm]) gd -= months[gm++];
  return [gy, gm + 1, gd];
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** امروزِ تهران به‌صورت تاریخ UTC نیمه‌شب (برای جمع روزها بدون اثر ساعت) */
export function tehranToday(now: number): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

function jalaliYear(now: number): number {
  const y = new Intl.DateTimeFormat('en-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric' }).formatToParts(new Date(now)).find((x) => x.type === 'year');
  return Number(y?.value ?? 1405);
}

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

export function parseDate(t: string, now: number): string | null {
  const today = tehranToday(now);
  const plus = (n: number) => iso(new Date(today.getTime() + n * 86400000));
  if (/پس ?فردا/.test(t)) return plus(2);
  if (/فردا/.test(t)) return plus(1);
  if (/امروز|امشب/.test(t)) return plus(0);
  if (/آخر هفته/.test(t)) return plus((4 - today.getUTCDay() + 7) % 7 || 7); // پنجشنبهٔ پیش رو
  const m = new RegExp(`(\\d{1,2}) ?(${MONTHS.join('|')})(?: (\\d{4}))?`).exec(t);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]) + 1;
  let jy = m[3] ? Number(m[3]) : jalaliYear(now);
  let [gy, gm, gd] = jalaliToGregorian(jy, month, Number(m[1]));
  if (!m[3] && Date.UTC(gy, gm - 1, gd) < today.getTime()) { jy += 1; [gy, gm, gd] = jalaliToGregorian(jy, month, Number(m[1])); }
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

function countBefore(t: string, word: RegExp): number | null {
  const m = new RegExp(`(\\d+|${Object.keys(NUMBER_WORDS).join('|')}) ?${word.source}`).exec(t);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
}

/* ---------- تحلیل کامل ---------- */

export function parseShopQuery(raw: string, opts: { now?: number; home?: CityRef | null } = {}): ShopQuery {
  const now = opts.now ?? Date.now();
  const text = raw.trim().slice(0, 300);
  const t = normalizeFa(text);
  const named = namedServices(t);

  const intents = INTENT_RULES.filter(([, re]) => has(t, re)).map(([i]) => i);
  for (const id of named) for (const i of SERVICE[id].intents.slice(0, 1)) if (!intents.includes(i)) intents.push(i);
  const drop = (...xs: Intent[]) => { for (const x of xs) { const i = intents.indexOf(x); if (i >= 0) intents.splice(i, 1); } };
  if (intents.includes('doctor')) drop('food', 'beauty', 'service');
  // «اجاره آپارتمان» ملک است، «شبی… / هتل / سفر» اقامت
  if (intents.includes('estate')) { if (/شبی|هتل|اقامت|مسافر|سفر|بوم ?گردی/.test(t)) drop('estate'); else drop('stay'); }
  if (intents.includes('service')) drop('beauty', 'product', 'fashion');
  if (intents.includes('job')) drop('food', 'grocery', 'service', 'product', 'beauty');
  if (intents.includes('car')) drop('product');
  // «میوه‌فروشی» سوپرمارکت است؛ ولی «آبمیوه/کیک میوه‌ای» در کافه‌ها غذاست
  if (intents.includes('grocery') && intents.includes('food') && /میوه|سبزی|تره ?بار|سوپر ?مارکت|خواربار|بقالی|نانوایی|قصابی|لبنیات|هایپر/.test(t) && !/آبمیوه|کافه|رستوران|کیک|بستنی|اسموتی|سالاد/.test(t)) drop('food');
  // نام سرویس آگهی (دیوار/شیپور) بدون نیت دیگر = جستجوی آگهی کالا
  // «سفر/بلیت به X» بدون وسیله → پرواز، قطار و اتوبوس
  if (/سفر|مسافرت|بلیط|بلیت/.test(t) && !intents.some((i) => ['flight', 'train', 'bus', 'taxi', 'tour', 'stay'].includes(i))) intents.push('flight', 'train', 'bus', 'taxi');
  if (intents.some((i) => i === 'bus' || i === 'train' || i === 'flight' || i === 'taxi')) drop('car', 'product', 'service');
  if (!intents.length) intents.push('product');
  const listing = intents.some((i) => i === 'job' || i === 'estate' || i === 'car' || i === 'service');
  if (listing) drop('product');

  const found = findCities(t);
  const marker = (at: number) => t.slice(Math.max(0, at - 8), at).trim().split(' ').pop() ?? '';
  let origin = found.find((f) => marker(f.at) === 'از')?.city ?? null;
  const travel = intents.some((i) => i === 'flight' || i === 'train' || i === 'bus' || i === 'taxi' || i === 'tour');
  // «اهواز به تهران» (بدون «از»): در سفر، شهرِ پیش از «به» مبدأ است
  if (travel && !origin && found.length >= 2 && marker(found[1].at) === 'به' && marker(found[0].at) !== 'به') origin = found[0].city;
  let destinations = found.filter((f) => f.city !== origin).map((f) => f.city);
  if (/شمال/.test(t) && intents.some((i) => i === 'stay' || i === 'tour')) {
    destinations = [...destinations, ...NORTH.map((n) => cityByName(n)!).filter((c) => !destinations.includes(c))];
  }
  if (travel && !origin && opts.home && !destinations.includes(opts.home)) origin = opts.home;
  if (!travel && origin) { destinations = [origin, ...destinations]; origin = null; }
  destinations = destinations.slice(0, /شمال/.test(t) ? 7 : 6);
  const city = destinations[0] ?? (travel ? null : opts.home ?? null);

  const budget = parseBudget(t);
  const used = /کارکرده|کار کرده|دست ?دوم|دسته دوم|استوک/.test(t);
  const cheap = /ارزان|ارزون|کمترین قیمت|مقرون|اقتصادی|تخفیف/.test(t);
  const best = /بهترین|بهتر|معتبر|شهرت|سابقه|نظرات|امتیاز/.test(t);

  // عبارت جستجو: بدون شهر، بودجه، نام سرویس و واژه‌های دستوری
  let rest = t;
  if (budget.span) rest = rest.slice(0, budget.span[0]) + ' ' + rest.slice(budget.span[1]);
  for (const f of findCities(rest).sort((a, b) => b.at - a.at)) rest = rest.slice(0, f.at) + ' ' + rest.slice(f.at + f.len);
  for (const id of named) for (const a of SERVICE[id].aliases) rest = rest.split(a.replace(/‌/g, ' ')).join(' ');
  rest = rest.replace(/شمال|پس ?فردا|فردا|امروز|امشب|آخر هفته|\d+ ?(شب|نفر|روز)|\d{1,2} ?(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/g, ' ');
  if (intents.some((i) => i === 'flight' || i === 'train' || i === 'bus' || i === 'tour')) rest = rest.replace(/(پرواز|قطار|اتوبوس|تاکسی|تور)(?: ?های| ?ها)?|هواپیما|بلیت|بلیط|سفر|مسافرت|ترمینال|دربست|داربست|سواری|بین ?شهری|vip|وی ?آی ?پی/gi, ' ');
  // خرید اقساطی: واژه‌های پرداخت بخشی از نام کالا نیستند
  rest = rest.replace(/خرید (اقساطی|قسطی|اعتباری)|اقساطی|قسطی|اقساط|(با |به )?قسط|بدون پیش ?پرداخت|پرداخت (اقساطی|قسطی)/g, ' ');
  // واژه‌های دسته، خودِ دسته‌اند نه بخشی از عنوان آگهی
  if (intents.includes('job')) rest = rest.replace(/استخدامی|استخدام|فرصت(های)? شغلی|شغل(های)?|کاریابی|جویای کار|نیروی/g, ' ');
  if (intents.includes('estate')) rest = rest.replace(/رهن|ودیعه|املاک|مسکن|اجاره ای|اجاره|خرید|فروش|پیش فروش|ملک/g, ' ');
  if (intents.includes('car')) rest = rest.replace(/خودرو|اتومبیل|ماشین/g, ' ');
  if (intents.includes('grocery')) rest = rest.replace(/سوپر ?مارکت|هایپر ?مارکت|مغازه|فروشگاه/g, ' ');
  // «کتاب ملت عشق»: عنوان کتاب‌ها واژهٔ «کتاب» ندارد
  if (intents.includes('book')) rest = rest.replace(/کتاب(های| ها)?|رمان|صوتی|الکترونیکی|نسخه/g, ' ');
  const words = rest.split(' ').filter((w) => w && !FILLER.has(w) && !/^(ترین|تر)$/.test(w));
  let keywords = words.join(' ');
  // «آیفون یا جاروبرقی یا …» — نخستین گزینه جستجو می‌شود
  if (/ یا /.test(` ${rest} `)) {
    const first = rest.split(/ یا /)[0].split(' ').filter((w) => w && !FILLER.has(w)).join(' ');
    if (first) keywords = first;
  }
  keywords = keywords.slice(0, 60).trim();

  return {
    text,
    intents: intents.slice(0, 5),
    keywords,
    city,
    destinations,
    origin,
    date: parseDate(t, now),
    nights: Math.min(Math.max(countBefore(t, /شب(?! ?حداکثر)/) ?? 1, 1), 14),
    guests: Math.min(Math.max(countBefore(t, /نفر/) ?? 2, 1), 12),
    maxPrice: budget.max,
    minPrice: budget.min,
    used,
    sort: cheap && !best ? 'cheapest' : 'best',
    installment: INSTALLMENT.test(t) || named.some((id) => id === 'snapppay' || id === 'digipay'),
    deal: !intents.includes('estate') ? null : /رهن|اجاره|ودیعه/.test(t) ? 'rent' : /خرید|فروش|فروشی/.test(t) ? 'buy' : null,
    named
  };
}
