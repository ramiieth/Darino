/** ============================================================
 * Car Market — کاتالوگ برندها (نام فارسی/انگلیسی، لوگو، دسته)
 *
 *  لوگوها محلی‌اند: public/logos/cars/<slug>.webp (۲۵۶px، مربع، پس‌زمینه شفاف)
 *  — از car.ir گرفته و یکدست شده‌اند؛ لوگوهای سفید برای پس‌زمینه سفید تیره شده‌اند.
 *  برند ناشناخته از منبع → نام فارسی منبع + آواتار حرفی.
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */
import type { CarCategory } from './types.js';

export interface CarBrand {
  slug: string;
  fa: string;
  en: string;
}

const B: Record<string, Omit<CarBrand, 'slug'>> = {
  aito: { fa: 'آیتو', en: 'Aito' },
  audi: { fa: 'آئودی', en: 'Audi' },
  bac: { fa: 'بک', en: 'BAC' },
  bahman: { fa: 'بهمن موتور', en: 'Bahman Motor' },
  'baic-motor': { fa: 'بایک', en: 'BAIC' },
  bestune: { fa: 'بستیون', en: 'Bestune' },
  'bm-cars': { fa: 'بی‌ام‌کارز', en: 'BM Cars' },
  bmw: { fa: 'بی‌ام‌و', en: 'BMW' },
  byd: { fa: 'بی‌وای‌دی', en: 'BYD' },
  changan: { fa: 'چانگان', en: 'Changan' },
  chery: { fa: 'چری', en: 'Chery' },
  dayun: { fa: 'دایون', en: 'Dayun' },
  'dong-feng': { fa: 'دانگ‌فنگ', en: 'Dongfeng' },
  eres: { fa: 'ایرس', en: 'ERES' },
  farda: { fa: 'فردا موتور', en: 'Farda Motors' },
  fiat: { fa: 'فیات', en: 'Fiat' },
  foton: { fa: 'فوتون', en: 'Foton' },
  fownix: { fa: 'فونیکس', en: 'Fownix' },
  gac: { fa: 'جی‌ای‌سی', en: 'GAC' },
  geely: { fa: 'جیلی', en: 'Geely' },
  'great-wall': { fa: 'گریت‌وال', en: 'Great Wall' },
  haima: { fa: 'هایما', en: 'Haima' },
  haval: { fa: 'هاوال', en: 'Haval' },
  honda: { fa: 'هوندا', en: 'Honda' },
  hongqi: { fa: 'هونگچی', en: 'Hongqi' },
  hyundai: { fa: 'هیوندای', en: 'Hyundai' },
  'iran-khodro': { fa: 'ایران خودرو', en: 'Iran Khodro' },
  jac: { fa: 'جک', en: 'JAC' },
  jetta: { fa: 'جتا', en: 'Jetta' },
  'kermanmotor-kmc': { fa: 'کی‌ام‌سی', en: 'KMC' },
  kia: { fa: 'کیا', en: 'Kia' },
  lamaco: { fa: 'لاماکو', en: 'Lamaco' },
  lamari: { fa: 'لاماری', en: 'Lamari' },
  'leap-motor': { fa: 'لیپ موتور', en: 'Leapmotor' },
  lucano: { fa: 'لوکانو', en: 'Lucano' },
  maanian: { fa: 'مانیان', en: 'Maanian' },
  'max-motor': { fa: 'مکث موتور', en: 'Max Motor' },
  maxus: { fa: 'مکسوس', en: 'Maxus' },
  mazda: { fa: 'مزدا', en: 'Mazda' },
  mg: { fa: 'ام‌جی', en: 'MG' },
  mitsubishi: { fa: 'میتسوبیشی', en: 'Mitsubishi' },
  mvm: { fa: 'ام‌وی‌ام', en: 'MVM' },
  nissan: { fa: 'نیسان', en: 'Nissan' },
  opel: { fa: 'اپل', en: 'Opel' },
  peugeot: { fa: 'پژو', en: 'Peugeot' },
  renault: { fa: 'رنو', en: 'Renault' },
  saipa: { fa: 'سایپا', en: 'Saipa' },
  skoda: { fa: 'اشکودا', en: 'Skoda' },
  suzuki: { fa: 'سوزوکی', en: 'Suzuki' },
  swm: { fa: 'اس‌دبلیو‌ام', en: 'SWM' },
  tank: { fa: 'تانک', en: 'Tank' },
  tigard: { fa: 'تیگارد', en: 'Tigard' },
  toyota: { fa: 'تویوتا', en: 'Toyota' },
  venocia: { fa: 'ونوسیا', en: 'Venucia' },
  volkswagen: { fa: 'فولکس‌واگن', en: 'Volkswagen' },
  xtrim: { fa: 'اکستریم', en: 'Xtrim' },
  'zhong-xing': { fa: 'ژانگ‌ژینگ', en: 'Zhongxing' },
  zotye: { fa: 'زوتی', en: 'Zotye' }
};

/** برندهایی که لوگوی محلی دارند */
export const KNOWN_BRAND_SLUGS: readonly string[] = Object.keys(B);

/** برندهای تولید داخلی (سال مدل شمسی) — بقیه برندهای سال‌شمسی «مونتاژی»‌اند */
const DOMESTIC_BRANDS = new Set(['iran-khodro', 'saipa', 'peugeot', 'nissan' /* وانت زامیاد */]);

export function brandInfo(slug: string, sourceName?: string): CarBrand {
  const b = B[slug];
  if (b) return { slug, ...b };
  return { slug, fa: sourceName?.trim() || slug, en: slug };
}

/** مسیر لوگوی محلی — null برای برند ناشناخته */
export function brandLogo(slug: string): string | null {
  return B[slug] ? `/logos/cars/${slug}.webp` : null;
}

/** سال مدل میلادی = وارداتی؛ شمسی = داخلی یا مونتاژی (بر اساس برند) */
export function categoryOf(brand: string, year: string): CarCategory {
  const y = Number(year);
  if (Number.isFinite(y) && y >= 1900) return 'imported';
  return DOMESTIC_BRANDS.has(brand) ? 'domestic' : 'assembled';
}

export const CATEGORY_FA: Record<CarCategory, string> = {
  domestic: 'داخلی',
  assembled: 'مونتاژی',
  imported: 'وارداتی'
};
