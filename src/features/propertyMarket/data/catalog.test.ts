/**
 * کاتالوگ اهواز — نرمال‌سازی و تطبیق محله‌ها (بدون حدس/انتساب جعلی)
 */
import { describe, it, expect } from 'vitest';
import { normalizeFaText, resolveNeighborhood, neighborhoodDisplayName, keyFromUnknownName } from './catalog';

describe('normalizeFaText', () => {
  it('ی/ک عربی و نیم‌فاصله نرمال می‌شوند', () => {
    expect(normalizeFaText('كيان‌پارس')).toBe('کیانپارس');
    expect(normalizeFaText('زیتون  کارمندی')).toBe('زیتون کارمندی');
  });
});

describe('resolveNeighborhood', () => {
  it('نام رسمی → کلید کاتالوگ', () => {
    expect(resolveNeighborhood('کیانپارس').key).toBe('kianpars-other');
    expect(resolveNeighborhood('زیتون کارمندی').key).toBe('zeytoon-karmandi');
    expect(resolveNeighborhood('پادادشهر').key).toBe('padad-main');
  });
  it('نیم‌فاصله/یای عربی هم تطبیق می‌شود', () => {
    expect(resolveNeighborhood('كيان پارس').key).toBe('kianpars-other');
    expect(resolveNeighborhood('گلستان').key).toBe('golestan');
  });
  it('نام ناشناخته → کلید خام مکانیکی (هرگز حدس)', () => {
    const r = resolveNeighborhood('محله ناشناخته ایکس');
    expect(r.key).toBe(keyFromUnknownName('محله ناشناخته ایکس'));
    expect(r.key!.startsWith('raw:')).toBe(true);
    expect(r.displayName).toBe('محله ناشناخته ایکس');
  });
  it('خالی → تهی', () => {
    expect(resolveNeighborhood(null).key).toBeNull();
    expect(resolveNeighborhood('   ').key).toBeNull();
  });
  it('نام ترکیبی با کلمه کامل → محله پایه', () => {
    expect(resolveNeighborhood('کیانپارس، فاز ۲').key).toBe('kianpars-other');
  });
});

describe('neighborhoodDisplayName', () => {
  it('کلید کاتالوگ → نام فارسی', () => {
    expect(neighborhoodDisplayName('kianpars')).toBe('کیانپارس');
  });
  it('کلید خام → خود نام', () => {
    expect(neighborhoodDisplayName('raw:محله جدید')).toBe('محله جدید');
  });
  it('تهی → نامشخص', () => {
    expect(neighborhoodDisplayName(null)).toBe('نامشخص');
  });
});

import { otherCityMarker } from './catalog';

describe('otherCityMarker — آگهی ملک شهر دیگر', () => {
  it('نام محله‌های تهران/کرج شناسایی می‌شوند', () => {
    expect(otherCityMarker('122 متر / سالن پرده خور / منطقه 5 / پونک')).toBe('پونک');
    expect(otherCityMarker('118 متر / اوکازیون / منطقه 2 / همیلا')).toBe('همیلا');
    expect(otherCityMarker('ساخت خاص/فروش آپارتمان 78 متر در مهرشهر/اندیشه/تهران')).toBe('تهران');
    expect(otherCityMarker('فوری «جنت‌آباد» 83متر')).not.toBeNull();
  });
  it('محله‌های اهواز (حتی هم‌نام) نشانه نیستند', () => {
    expect(otherCityMarker('فروش آپارتمان ۹۰ متری کیانپارس غربی')).toBeNull();
    expect(otherCityMarker('آپارتمان کوی صادقیه')).toBeNull();
    expect(otherCityMarker('مهرشهر، ۲ خواب')).toBeNull();
    expect(otherCityMarker(null)).toBeNull();
  });
});

describe('resolveNeighborhood — املای رایج دیوار/شیپور', () => {
  it('کیان اباد / فاز پاداد / نام شهر چسبیده', () => {
    expect(resolveNeighborhood('کیان اباد').key).toBe('kianabad-other');
    expect(resolveNeighborhood('فاز دو پاداد').key).toBe('padad-f2');
    expect(resolveNeighborhood('فاز ۲ پادادشهر').key).toBe('padad-f2');
    expect(resolveNeighborhood('کوی سعدی').key).toBe('saadi');
    const r = resolveNeighborhood('شهرک رزمندگان اهواز');
    expect(r.key).toBe('raw:شهرک رزمندگان');
    expect(r.displayName).toBe('شهرک رزمندگان');
  });
});

import districts from '../collector/__fixtures__/divar-ahvaz-districts.json';
import { AHVAZ_AREA_GROUPS, areaGroupName, areaGroupOf } from './catalog';

describe('محله رسمی / منطقه (گروه)', () => {
  it('شرقی/غربی کیانپارس و کیان‌آباد فقط از متن صریح عنوان', () => {
    expect(resolveNeighborhood('کیانپارس', 'فروش ۱۶۰متری شرقی کیانپارس').key).toBe('kianpars-east');
    expect(resolveNeighborhood('کیانپارس ', 'واحد ۸۲ متری شیک در کیانپارس غربی').key).toBe('kianpars-west');
    expect(resolveNeighborhood('کیان اباد', '۱۱۰متر/کیان اباد شرقی/تکواحدی').key).toBe('kianabad-east');
    expect(resolveNeighborhood('کیان اباد', 'آپارتمان ۹۰ متری').key).toBe('kianabad-other');
    // هر دو جهت در عنوان → نامشخص (بدون حدس)
    expect(resolveNeighborhood('کیانپارس', 'شرقی یا غربی فرقی ندارد').key).toBe('kianpars-other');
    // شرقی در عنوان محله دیگر اثری ندارد
    expect(resolveNeighborhood('گلستان', 'گلستان شرقی').key).toBe('golestan');
    // نام صریح با جهت (شیپور/عنوان)
    expect(resolveNeighborhood('کیان آباد غربی').key).toBe('kianabad-west');
  });

  it('district‌های رسمی متفاوت هرگز ادغام نمی‌شوند', () => {
    expect(resolveNeighborhood('کمپلو جنوبی').key).toBe('kompolo-south');
    expect(resolveNeighborhood('کمپلو شمالی').key).toBe('kompolo-north');
    expect(resolveNeighborhood('زیتون کارگری').key).toBe('zeytoon-kargari');
    expect(resolveNeighborhood('زیتون کارمندی').key).toBe('zeytoon-karmandi');
    expect(resolveNeighborhood('فاز ۵ پاداد').key).toBe('padad-f5');
    // همه ۱۴۵ district رسمی دیوار → کلیدهای یکتا (بدون ادغام دو نام رسمی)
    const keys = (districts as string[]).map((n) => resolveNeighborhood(n).key);
    expect(keys.every((k) => !!k)).toBe(true);
    expect(new Set(keys).size).toBe(districts.length);
  });

  it('منطقه‌ها: عضویت بر اساس نام رسمی', () => {
    expect(areaGroupOf('kianpars-east')).toBe('kianpars');
    expect(areaGroupOf('kianabad-other')).toBe('kianabad');
    expect(areaGroupOf('padad-f2')).toBe('padad');
    expect(areaGroupOf('zeytoon-kargari')).toBe('zeytoon');
    expect(areaGroupOf('kompolo-south')).toBe('kompolo');
    expect(areaGroupOf(resolveNeighborhood('اسلام آباد شرقی').key)).toBe('eslamabad');
    expect(areaGroupOf(resolveNeighborhood('پردیس دو').key)).toBe('pardis');
    expect(areaGroupOf(resolveNeighborhood('چنیبه علیا').key)).toBe('chonaibeh');
    expect(areaGroupOf(resolveNeighborhood('کوی فرهنگیان ۱').key)).toBe('farhangian');
    expect(areaGroupOf(resolveNeighborhood('سلیم آباد(سه راه خرمشهر)').key)).toBe('serah-khorramshahr');
    expect(areaGroupOf('golestan')).toBeNull(); // محله مستقل
    expect(areaGroupName('padad')).toBe('پادادشهر');
    // کلیدهای ادغامی قدیمی = کلید منطقه (تاریخچه قابل مقایسه)
    expect(neighborhoodDisplayName('kianpars')).toBe('کیانپارس');
    expect(neighborhoodDisplayName('kianabad')).toBe('کیان‌آباد');
    expect(AHVAZ_AREA_GROUPS.map((g) => g.key)).toContain('zeytoon');
  });

  it('هیچ نشانه «شهر دیگر» با نام district رسمی اهواز برخورد ندارد (مثل شهرک اکباتان)', () => {
    for (const n of districts as string[]) expect(otherCityMarker(n)).toBeNull();
  });
});

import { AHVAZ_DISTRICTS, conflictingPlace } from './catalog';

describe('تناقض محله آگهی با متن', () => {
  it('۱۴۵ district رسمی دیوار', () => {
    expect(AHVAZ_DISTRICTS.length).toBe(145);
  });
  it('کیانپارس + اندیشه (با یا بدون «منطقه/شهرک») → تناقض', () => {
    expect(conflictingPlace('kianpars-other', 'آپارتمان کیانپارس اندیشه')).toBe('اندیشه');
    expect(conflictingPlace('kianpars-east', 'کیانپارس منطقه اندیشه کلید اول')).toBe('اندیشه');
    expect(conflictingPlace('golestan', 'فروش آپارتمان شهرک اندیشه')).toBe('اندیشه');
  });
  it('نام منطقه دیگر با «کوی/شهرک/منطقه» → تناقض؛ نام خالی رایج → نه', () => {
    expect(conflictingPlace('kianpars-other', 'کیانپارس کوی ملی راه')).toBe('ملی راه');
    expect(conflictingPlace('golestan', 'گلستان خیابان سعدی')).toBeNull();
    expect(conflictingPlace('padad-f1', 'فاز یک پاداد برق کشی کامل')).toBeNull();
  });
  it('خود منطقه، نزدیکی یا واژه مشابه → تناقض نیست', () => {
    expect(conflictingPlace('raw:شهرک اندیشه', 'شهرک اندیشه ۹۰ متری')).toBeNull();
    expect(conflictingPlace('kianpars-other', 'کیانپارس نزدیک شهرک نفت')).toBeNull();
    expect(conflictingPlace('kianpars-other', 'کیانپارس جنب کوی ملی راه')).toBeNull();
    expect(conflictingPlace('kianpars-other', 'طراحی اندیشه‌ای نو در کیانپارس')).toBeNull();
    expect(conflictingPlace('kianpars-other', 'کیانپارس خیابان ۱۲ غربی')).toBeNull();
  });
});
