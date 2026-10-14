/** ============================================================
 * شهرهای پرکاربرد — شناسه‌ها از فهرست عمومی شهرهای دیوار و شیپور
 * و فرودگاه/ایستگاه‌های مستربلیط (مهر ۱۴۰۵) استخراج شده‌اند.
 * ============================================================ */
import type { CityRef } from './types.js';

type Row = [name: string, slug: string, divarId: number, sheypoor: string | null, iata: string | null, trainId: number | null, lat: number, lon: number];

const ROWS: Row[] = [
  ['تهران', 'tehran', 1, null, 'THR', 1, 35.7032, 51.3892],
  ['کرج', 'karaj', 2, null, 'PYK', 165, 35.8345, 50.9457],
  ['مشهد', 'mashhad', 3, null, 'MHD', 191, 36.297, 59.6062],
  ['اصفهان', 'isfahan', 4, null, 'IFN', 21, 32.6546, 51.668],
  ['شیراز', 'shiraz', 6, null, 'SYZ', 255, 29.617, 52.5911],
  ['تبریز', 'tabriz', 5, null, 'TBZ', 55, 38.08, 46.2919],
  ['اهواز', 'ahvaz', 7, null, 'AWZ', 25, 31.319, 48.6842],
  ['قم', 'qom', 8, null, 'QQM', 161, 34.6146, 50.8527],
  ['کرمانشاه', 'kermanshah', 9, null, 'KSH', 195, 34.3142, 47.065],
  ['ارومیه', 'urmia', 10, null, 'OMH', 448, 37.5527, 45.0761],
  ['رشت', 'rasht', 12, null, 'RAS', 451, 37.2808, 49.5832],
  ['کرمان', 'kerman', 13, null, 'KER', 167, 30.2839, 57.0834],
  ['یزد', 'yazd', 16, null, 'AZD', 219, 31.8974, 54.3569],
  ['زاهدان', 'zahedan', 11, null, 'ZAH', 259, 29.4963, 60.8629],
  ['همدان', 'hamedan', 14, null, 'HDM', 117, 34.7992, 48.5146],
  ['اراک', 'arak', 15, null, 'AJK', 14, 34.0954, 49.7013],
  ['قزوین', 'qazvin', 19, null, 'GZW', 160, 36.2797, 50.0049],
  ['زنجان', 'zanjan', 20, null, 'JWN', 97, 36.6712, 48.4431],
  ['ساری', 'sari', 22, null, 'SRY', 100, 36.5525, 53.0833],
  ['گرگان', 'gorgan', 21, null, 'GBT', 175, 36.8427, 54.4439],
  ['بندرعباس', 'bandar-abbas', 18, null, 'BND', 37, 27.1832, 56.2666],
  ['بوشهر', 'bushehr', 25, null, 'BUZ', null, 28.9234, 50.8203],
  ['کیش', 'kish', 33, null, 'KIH', null, 26.5336, 53.9745],
  ['قشم', 'qeshm', 660, null, 'GSM', null, 26.9492, 56.27],
  ['آبادان', 'abadan', 24, null, 'ABD', null, 30.3392, 48.3043],
  ['خرمشهر', 'khorramshahr', 799, null, null, 72, 30.4256, 48.1891],
  ['دزفول', 'dezful', 23, null, 'DEF', null, 32.3811, 48.4058],
  ['اندیمشک', 'andimeshk', 796, null, null, 24, 32.46, 48.3592],
  ['سنندج', 'sanandaj', 28, null, 'SDG', 300, 35.3194, 46.986],
  ['خرم‌آباد', 'khorramabad', 27, 'lorestan-khorram-abad', 'KHD', null, 33.4589, 48.381],
  ['سمنان', 'semnan', 35, null, 'SNX', 116, 35.5729, 53.3971],
  ['بیرجند', 'birjand', 34, null, 'XBJ', null, 32.8649, 59.2262],
  ['چابهار', 'chabahar', 747, null, 'ZBR', null, 25.2919, 60.643],
  ['بابلسر', 'babolsar', 710, null, null, null, 36.6941, 52.6512],
  ['رامسر', 'ramsar', 745, null, 'RZR', null, 36.9031, 50.6583],
  ['نوشهر', 'nowshahr', 709, null, 'NSH', null, 36.649, 51.4961],
  ['چالوس', 'chalus', 835, null, null, null, 36.6551, 51.4204],
  ['کاشان', 'kashan', 30, null, 'KKS', 162, 33.985, 51.41],
  ['شاهرود', 'shahrud', 707, null, 'RUD', 130, 36.4182, 54.9763],
  ['ایلام', 'ilam', 32, null, 'IIL', null, 33.6166, 46.3849],
  ['یاسوج', 'yasuj', 38, null, 'YES', null, 30.6682, 51.588],
  ['شهرکرد', 'shahrekord', 36, null, 'CQD', null, 32.3256, 50.8644],
  ['بجنورد', 'bojnurd', 39, null, 'BJB', null, 37.4747, 57.329],
  ['اردبیل', 'ardabil', 17, null, 'ADU', 452, 38.2498, 48.2933],
  ['لاهیجان', 'lahijan', 746, null, null, null, 37.1728, 49.9765]
];

/** شناسهٔ شهر اتوبوس مستربلیط («همهٔ پایانه‌ها») — از GetBusCityList */
const BUS: Record<string, number> = {
  تهران: 11320000, کرج: 18310000, مشهد: 31310000, اصفهان: 21310000, شیراز: 41310000, تبریز: 26310000, اهواز: 36310000, قم: 14310000,
  کرمانشاه: 71310000, ارومیه: 57310000, رشت: 54310000, کرمان: 45310000, یزد: 93310000, زاهدان: 61310000, همدان: 75310000, اراک: 51310000,
  قزوین: 15310000, زنجان: 67310000, ساری: 16310000, گرگان: 97310000, بندرعباس: 64310000, بوشهر: 95310000, قشم: 64370000, آبادان: 36320000,
  خرمشهر: 36380000, دزفول: 36390000, اندیمشک: 36330000, سنندج: 73310000, 'خرم‌آباد': 81310000, سمنان: 87310000, بیرجند: 33310000,
  چابهار: 61330000, بابلسر: 16340000, رامسر: 16390000, نوشهر: 16450000, چالوس: 16460000, کاشان: 21420000, شاهرود: 87330000, ایلام: 83310000,
  یاسوج: 85310000, شهرکرد: 77310000, بجنورد: 32310000, اردبیل: 91310000, لاهیجان: 54450000
};

/** تاکسی بین‌شهری دربست مستربلیط (GetTaxiCityList) — شناسه همان شناسهٔ اتوبوس است */
const TAXI: Record<string, string> = {
  تهران: 'tehran', کرج: 'karaj', مشهد: 'mashhad', اصفهان: 'esfahan', شیراز: 'shiraz', تبریز: 'tabriz', اهواز: 'ahwaz', قم: 'qom', کرمانشاه: 'kermanshah',
  رشت: 'rasht', یزد: 'yazd', همدان: 'hamedan', اراک: 'arak', قزوین: 'qazvin', زنجان: 'zanjan', ساری: 'sari', گرگان: 'gorgan', بندرعباس: 'bandar_abbas',
  بوشهر: 'bushehr', سمنان: 'semnan', بابلسر: 'babolsar', رامسر: 'ramsar', نوشهر: 'nowshahr', چالوس: 'chalous', کاشان: 'kashan', شهرکرد: 'shahr_e_kord', لاهیجان: 'lahijan'
};

/** شهر بدون فرودگاه یا کم‌پرواز → نزدیک‌ترین فرودگاه پرپرواز */
const NEAR_AIRPORT: Record<string, string> = { کرج: 'THR', قم: 'THR', کاشان: 'IFN', خرمشهر: 'ABD', اندیمشک: 'DEF', لاهیجان: 'RAS', بابلسر: 'SRY', چالوس: 'NSH', شاهرود: 'SNX' };

export const CITIES: CityRef[] = ROWS.map(([name, slug, divarId, sheypoor, iata, trainId, lat, lon]) => ({
  name, slug, sheypoorSlug: sheypoor ?? slug, divarId, iata, trainId, busId: BUS[name] ?? null, taxiSlug: TAXI[name] ?? null, nearIata: NEAR_AIRPORT[name] ?? null, lat, lon
}));

/** نام‌های دیگر یک شهر (املای رایج، بدون فاصلهٔ مجازی) */
const ALIASES: Record<string, string> = {
  'خرم آباد': 'خرم‌آباد', 'خرماباد': 'خرم‌آباد', 'بندر عباس': 'بندرعباس', 'جزیره کیش': 'کیش', 'جزیره قشم': 'قشم'
};

/** «شمال» در درخواست اقامت و سفر = این شهرها */
export const NORTH = ['رامسر', 'نوشهر', 'چالوس', 'بابلسر', 'رشت', 'لاهیجان', 'ساری'];

export const cityByName = (name: string): CityRef | null => CITIES.find((c) => c.name === (ALIASES[name] ?? name)) ?? null;

/** همهٔ شهرهای ذکرشده در متن، به ترتیب جای آن‌ها؛ نام بلندتر اول (خرمشهر پیش از خرم‌آباد نمی‌خورد) */
export function findCities(text: string): { city: CityRef; at: number; len: number }[] {
  const names = [...CITIES.map((c) => c.name), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
  const taken: [number, number][] = [];
  const out: { city: CityRef; at: number; len: number }[] = [];
  for (const n of names) {
    const re = new RegExp(`(^|[^\\p{L}])${n.replace(/[\s‌]/g, '[\\s\\u200c]?')}(?=$|[^\\p{L}])`, 'gu');
    for (const m of text.matchAll(re)) {
      const at = (m.index ?? 0) + m[1].length;
      const len = m[0].length - m[1].length;
      if (taken.some(([s, e]) => at < e && at + len > s)) continue;
      taken.push([at, at + len]);
      const city = cityByName(n);
      if (city && !out.some((o) => o.city === city)) out.push({ city, at, len });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
