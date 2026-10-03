/** ============================================================
 * خودروهای اروند — برند از «برند و مدل» دیوار → اسلاگ لوگوی بازار خودرو
 *  نام برند اول رشته است («هیوندای سانتافه …»)؛ ناشناخته → null (آواتار حرفی)
 * ============================================================ */

const ALIASES: [RegExp, string][] = [
  [/^هیوندا/, 'hyundai'],
  [/^کیا/, 'kia'],
  [/^تویوتا/, 'toyota'],
  [/^(?:چانگان|اوشان)/, 'changan'],
  [/^ام[\s‌]*جی/, 'mg'],
  [/^نیسان/, 'nissan'],
  [/^میتسوبیشی/, 'mitsubishi'],
  [/^مزدا/, 'mazda'],
  [/^(?:بی[\s‌]*ام[\s‌]*و|ب[\s‌]*ام[\s‌]*و)/, 'bmw'],
  [/^هوندا/, 'honda'],
  [/^سوزوکی/, 'suzuki'],
  [/^جیلی/, 'geely'],
  [/^(?:بی[\s‌]*وای[\s‌]*دی|BYD)/i, 'byd'],
  [/^هاوال/, 'haval'],
  [/^(?:گریت[\s‌]*وال)/, 'great-wall'],
  [/^تانک/, 'tank'],
  [/^فولکس/, 'volkswagen'],
  [/^(?:اشکودا|اسکودا)/, 'skoda'],
  [/^رنو/, 'renault'],
  [/^پژو/, 'peugeot'],
  [/^آئودی|^آودی/, 'audi'],
  [/^چری/, 'chery'],
  [/^جک/, 'jac'],
  [/^هونگچی/, 'hongqi'],
  [/^(?:جی[\s‌]*ای[\s‌]*سی|GAC)/i, 'gac'],
  [/^بستیون/, 'bestune'],
  [/^دانگ[\s‌]*فنگ/, 'dong-feng'],
  [/^مکسوس/, 'maxus'],
  [/^اپل/, 'opel'],
  [/^فیات/, 'fiat'],
  [/^ونوسیا/, 'venocia'],
  [/^جتا/, 'jetta'],
  [/^لیپ[\s‌]*موتور/, 'leap-motor']
];

export function brandSlugOf(model: string | null | undefined): string | null {
  if (!model) return null;
  const m = model.trim();
  for (const [re, slug] of ALIASES) if (re.test(m)) return slug;
  return null;
}

/** نام برند (اولین کلمه) برای برچسب لوگو/فیلتر */
export function brandLabelOf(model: string | null | undefined): string {
  if (!model) return 'سایر';
  return model.trim().split(/\s+/)[0] || 'سایر';
}
