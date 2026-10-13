/** ============================================================
 * شهرهای پرکاربرد — شناسه‌ها از فهرست عمومی شهرهای دیوار و شیپور
 * و فرودگاه/ایستگاه‌های مستربلیط (مهر ۱۴۰۵) استخراج شده‌اند.
 * ============================================================ */
import type { CityRef } from './types.js';

type Row = [name: string, slug: string, divarId: number, sheypoor: string | null, iata: string | null, trainId: number | null, lat: number, lon: number];

const ROWS: Row[] = [
  ['تهران', 'tehran', 1, null, 'THR', 1, 35.7032, 51.3892],
  ['کرج', 'karaj', 2, null, 'PYK', 165, 35.8345, 50.9457],
  ['مشهد', 'mashhad', 3, null, 'MHD', 191, 36.5661, 59.6604],
  ['اصفهان', 'isfahan', 4, null, 'IFN', 21, 32.5937, 51.8289],
  ['شیراز', 'shiraz', 6, null, 'SYZ', 255, 29.617, 52.5911],
  ['تبریز', 'tabriz', 5, null, 'TBZ', 55, 38.1283, 46.2653],
  ['اهواز', 'ahvaz', 7, null, 'AWZ', 25, 31.2196, 48.6884],
  ['قم', 'qom', 8, null, 'QQM', 161, 34.6146, 50.8527],
  ['کرمانشاه', 'kermanshah', 9, null, 'KSH', 195, 34.3919, 47.0881],
  ['ارومیه', 'urmia', 10, null, 'OMH', 448, 37.4532, 45.1296],
  ['رشت', 'rasht', 12, null, 'RAS', 451, 37.2343, 49.578],
  ['کرمان', 'kerman', 13, null, 'KER', 167, 30.3051, 56.9698],
  ['یزد', 'yazd', 16, null, 'AZD', 219, 31.8626, 54.4909],
  ['زاهدان', 'zahedan', 11, null, 'ZAH', 259, 29.6852, 60.7258],
  ['همدان', 'hamedan', 14, null, 'HDM', 117, 34.7885, 48.6414],
  ['اراک', 'arak', 15, null, 'AJK', 14, 34.0674, 49.7745],
  ['قزوین', 'qazvin', 19, null, 'GZW', 160, 36.3375, 50.0235],
  ['زنجان', 'zanjan', 20, null, 'JWN', 97, 36.6712, 48.4431],
  ['ساری', 'sari', 22, null, 'SRY', 100, 36.5525, 53.0833],
  ['گرگان', 'gorgan', 21, null, 'GBT', 175, 36.7388, 54.4998],
  ['بندرعباس', 'bandar-abbas', 18, null, 'BND', 37, 27.4836, 56.3012],
  ['بوشهر', 'bushehr', 25, null, 'BUZ', null, 29.0583, 50.8766],
  ['کیش', 'kish', 33, null, 'KIH', null, 26.5336, 53.9745],
  ['قشم', 'qeshm', 660, null, 'GSM', null, 26.7806, 55.809],
  ['آبادان', 'abadan', 24, null, 'ABD', null, 30.203, 48.5961],
  ['خرمشهر', 'khorramshahr', 799, null, null, 72, 30.6856, 48.21],
  ['دزفول', 'dezful', 23, null, 'DEF', null, 32.5735, 48.8408],
  ['اندیمشک', 'andimeshk', 796, null, null, 24, 32.6979, 48.3283],
  ['سنندج', 'sanandaj', 28, null, 'SDG', 300, 35.3194, 46.986],
  ['خرم‌آباد', 'khorramabad', 27, 'lorestan-khorram-abad', 'KHD', null, 33.4589, 48.381],
  ['سمنان', 'semnan', 35, null, 'SNX', 116, 35.0428, 53.8067],
  ['بیرجند', 'birjand', 34, null, 'XBJ', null, 33.0098, 59.2353],
  ['چابهار', 'chabahar', 747, null, 'ZBR', null, 25.3851, 60.8131],
  ['بابلسر', 'babolsar', 710, null, null, null, 36.6941, 52.6512],
  ['رامسر', 'ramsar', 745, null, 'RZR', null, 36.78, 50.5292],
  ['نوشهر', 'nowshahr', 709, null, 'NSH', null, 36.5564, 51.6621],
  ['چالوس', 'chalus', 835, null, null, null, 36.604, 51.3711],
  ['کاشان', 'kashan', 30, null, 'KKS', 162, 34.0532, 51.3585],
  ['شاهرود', 'shahrud', 707, null, 'RUD', 130, 35.223, 55.1723],
  ['ایلام', 'ilam', 32, null, 'IIL', null, 33.6166, 46.3849],
  ['یاسوج', 'yasuj', 38, null, 'YES', null, 30.6083, 51.6137],
  ['شهرکرد', 'shahrekord', 36, null, 'CQD', null, 32.3189, 50.8145],
  ['بجنورد', 'bojnurd', 39, null, 'BJB', null, 37.4253, 57.2352],
  ['اردبیل', 'ardabil', 17, null, 'ADU', 452, 38.2537, 48.1832],
  ['لاهیجان', 'lahijan', 746, null, null, null, 37.1728, 49.9765]
];

export const CITIES: CityRef[] = ROWS.map(([name, slug, divarId, sheypoor, iata, trainId, lat, lon]) => ({
  name, slug, sheypoorSlug: sheypoor ?? slug, divarId, iata, trainId, lat, lon
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
