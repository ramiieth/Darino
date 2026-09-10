/**
 * پارسر دیوار — فیکسچرهایی با ساختار واقعی پاسخ دیوار
 * (مطابق مرجع `mobin-torabi/divar-house-scraper`)
 */
import { describe, it, expect } from 'vitest';
import {
  faToEnDigits,
  parseIntLoose,
  parseListPage,
  parseIntoSeed,
  derivePricePerSqm,
  emptySeed,
  findFeatureModal
} from './parse';

describe('ابزار اعداد', () => {
  it('ارقام فارسی/عربی → لاتین', () => {
    expect(faToEnDigits('۱۲۳۴۵')).toBe('12345');
    expect(faToEnDigits('٠٩٨')).toBe('098');
    expect(faToEnDigits('12متر')).toBe('12متر');
  });
  it('پارس عدد با نویز (کاما/واحد/فاصله)', () => {
    expect(parseIntLoose('۴,۹۰۰,۰۰۰,۰۰۰ تومان')).toBe(4900000000);
    expect(parseIntLoose('150 متر')).toBe(150);
    expect(parseIntLoose('')).toBeNull();
    expect(parseIntLoose(null)).toBeNull();
    expect(parseIntLoose(88)).toBe(88);
  });
});

describe('parseListPage', () => {
  it('استخراج توکن/عنوان/محله از POST_ROW + صفحه‌بندی', () => {
    const page = {
      list_widgets: [
        {
          widget_type: 'POST_ROW',
          data: {
            action: {
              payload: {
                token: 'QmFzZS0xMjM',
                web_info: { title: 'آپارتمان ۱۱۰ متری', district_persian: 'کیانپارس' },
                price: '۶,۵۰۰,۰۰۰,۰۰۰'
              }
            }
          }
        },
        { widget_type: 'BANNER', data: {} },
        {
          widget_type: 'POST_ROW',
          data: { action: { payload: { token: 'QmFzZS0xMjM', web_info: { title: 'dup' } } } }
        }
      ],
      pagination: { has_next_page: true, data: { offset: 50 } }
    };
    const { seeds, pagination } = parseListPage(page);
    expect(seeds.size).toBe(1); // تکراری در صفحه حذف می‌شود
    const seed = seeds.get('QmFzZS0xMjM')!;
    expect(seed.title).toBe('آپارتمان ۱۱۰ متری');
    expect(seed.neighborhood).toBe('کیانپارس');
    expect(seed.totalPriceToman).toBe(6500000000);
    expect(seed.propertyKind).toBe('apartment');
    expect(seed.url).toBe('https://divar.ir/v/QmFzZS0xMjM');
    expect(pagination.hasNext).toBe(true);
    expect(pagination.data).toEqual({ offset: 50 });
  });

  it('پاسخ خالی/بدون ساختار → بدون خطا', () => {
    expect(parseListPage(null).seeds.size).toBe(0);
    expect(parseListPage({}).seeds.size).toBe(0);
  });
});

describe('parseIntoSeed — جزئیات آگهی', () => {
  const detail = {
    sections: [
      {
        widgets: [
          {
            widget_type: 'GROUP_INFO_ROW',
            data: {
              items: [
                { title: 'متراژ', value: '۱۱۰ متر' },
                { title: 'ساخت', value: '۱۳۹۸' },
                { title: 'اتاق', value: '۲ خواب' },
                { title: 'قیمت کل', value: '۶,۵۰۰,۰۰۰,۰۰۰ تومان' },
                { title: 'طبقه', value: '۳ از ۵' }
              ]
            }
          },
          {
            widget_type: 'UNEXPANDABLE_ROW',
            data: { title: 'قیمت هر متر', value: '۵۹,۰۹۰,۹۰۹ تومان' }
          },
          {
            widget_type: 'BREADCRUMB',
            data: {
              parent_items: [
                {},
                {
                  title: 'آپارتمان',
                  action: {
                    payload: {
                      search_data: {
                        form_data: { data: { category: { str: { value: 'apartment-sell' } } } }
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ],
    modal_page: {
      title: 'ویژگی‌ها و امکانات',
      widget_list: [
        {
          widget_type: 'GROUP_FEATURE_ROW',
          data: {
            items: [
              { icon: { icon_name: 'ELEVATOR' }, title: 'آسانسور دارد' },
              { icon: { icon_name: 'PARKING' }, title: 'پارکینگ ندارد' },
              { icon: { icon_name: 'CABINET' }, title: 'انباری دارد' },
              { icon: { icon_name: 'BALCONY' }, title: 'بالکن دارد' }
            ]
          }
        }
      ]
    }
  };

  it('مشخصات + امکانات + نوع ملک از جزئیات', () => {
    const seed = emptySeed('tok-1');
    parseIntoSeed(seed, detail as never);
    expect(seed.areaSqm).toBe(110);
    expect(seed.yearBuilt).toBe(1398);
    expect(seed.rooms).toBe(2);
    expect(seed.totalPriceToman).toBe(6500000000);
    expect(seed.pricePerSqmToman).toBe(59090909);
    expect(seed.floor).toBe(3);
    expect(seed.elevator).toBe(true);
    expect(seed.parking).toBe(false);
    expect(seed.storage).toBe(true);
    expect(seed.balcony).toBe(true);
    expect(seed.propertyKind).toBe('apartment');
  });

  it('derivePricePerSqm — محاسبه از قیمت کل/متراژ وقتی قیمت هر متر نیست', () => {
    const seed = emptySeed('tok-2');
    seed.totalPriceToman = 5_000_000_000;
    seed.areaSqm = 100;
    expect(derivePricePerSqm(seed)).toBe(50_000_000);
  });

  it('derivePricePerSqm — بدون داده کافی → null (هرگز حدس)', () => {
    const seed = emptySeed('tok-3');
    seed.totalPriceToman = 5_000_000_000;
    expect(derivePricePerSqm(seed)).toBeNull();
  });

  it('findFeatureModal — مودال تودرتو پیدا می‌شود', () => {
    const found = findFeatureModal(detail);
    expect(Array.isArray(found)).toBe(true);
    expect(findFeatureModal({ a: { b: [] } })).toBeNull();
  });
});
