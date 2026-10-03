import { describe, expect, it } from 'vitest';
import arvandDetail from './__fixtures__/divar-detail-arvand.json';
import nationalDetail from './__fixtures__/divar-detail-national.json';
import listPage from './__fixtures__/divar-list.json';
import {
  buildCarSearchBody,
  classifyPlate,
  isDealerMulti,
  isInstallment,
  parseCarDetail,
  parseCarList,
  parseDivarDate,
  parseToman,
  parseYear
} from './divarCar';

describe('دیوار خودرو — پارس جزئیات', () => {
  it('فیلدهای ساختاری، عنوان و زمان‌ها', () => {
    const d = parseCarDetail(arvandDetail);
    expect(d.title).toBe('سانتافه 3.3L شش سیلندر دو دف پلاک اروند');
    expect(d.fields['برند و مدل']).toBe('هیوندای سانتافه ix 45 3300cc');
    expect(parseToman(d.fields['قیمت پایه'])).toBe(4_350_000_000);
    expect(parseYear(d.fields['مدل (سال تولید)'])).toBe(2015);
    // ۱۱ مهر ۱۴۰۵، ۲۲:۰۷ تهران = ۲۰۲۶-۱۰-۰۳ ۱۸:۳۷ UTC
    expect(new Date(d.listedAt!).toISOString()).toBe('2026-10-03T18:37:00.000Z');
    expect(d.updatedAt! - d.listedAt!).toBe(8 * 60_000);
    expect(d.description).not.toMatch(/^انتشار آگهی/);
  });

  it('آگهی پلاک ملی تهران', () => {
    const d = parseCarDetail(nationalDetail);
    expect(d.fields['برند و مدل']).toBe('هیوندای سانتافه ix 45 2400cc');
    expect(classifyPlate(`${d.title}\n${d.description}`).plate).not.toMatch(/arvand/);
  });
});

describe('تشخیص نوع پلاک از متن', () => {
  it.each([
    ['سانتافه پلاک اروند', 'arvand'],
    ['بنز c200 پلاک دائم منطقه آزاد اروند', 'arvand'],
    ['منطقه‌آزاد', 'arvand'],
    ['پلاک اروند دائم قابل تبدیل به پلاک ملی', 'arvand-convertible'],
    ['چانگان cs55 کف گمرک خرمشهر', 'customs'],
    ['پلاک گذر موقت دارد', 'transit'],
    ['پژو پارس پلاک ملی تهران', 'national'],
    ['پژو پارس دوگانه', 'unknown']
  ])('%s → %s', (text, kind) => {
    expect(classifyPlate(text).plate).toBe(kind);
  });

  it('«پارس» با منطقه آزاد اشتباه نمی‌شود و شاهد متنی برمی‌گردد', () => {
    expect(classifyPlate('پژو پارس سال').plate).toBe('unknown');
    expect(classifyPlate('خودرو تمیز پلاک اروند بیمه کامل').evidence).toContain('اروند');
  });

  it('آگهی نمایشگاهی چندخودرویی و شرایطی', () => {
    expect(isDealerMulti('فروش ماشین های اروندی صفر کیلومتر', '')).toBe(true);
    expect(isDealerMulti('سانتافه ۲۰۱۵', 'تمیز')).toBe(false);
    expect(isInstallment('النترا پلاک اروند به صورت شرایطی')).toBe(true);
  });
});

describe('دیوار خودرو — فهرست و درخواست', () => {
  it('ردیف‌ها با قیمت، کارکرد، محله، عکس و صفحه بعد', () => {
    const { rows, next } = parseCarList(listPage);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ token: 'gaBvkO5p', priceText: '۴,۳۵۰,۰۰۰,۰۰۰ تومان', where: 'پادادشهر، اهواز' });
    expect(rows[0].image).toMatch(/^https:\/\/s100\.divarcdn\.com\//);
    expect(next).toMatchObject({ page: 1 });
  });

  it('عکس فقط از CDN دیوار پذیرفته می‌شود', () => {
    const { rows } = parseCarList({ list_widgets: [{ widget_type: 'POST_ROW', data: { token: 'abcdef', title: 't', image_url: 'https://evil.example/x.png' } }] });
    expect(rows[0].image).toBeNull();
  });

  it('بدنه جستجو: دسته خودرو + عبارت + صفحه‌بندی', () => {
    const b = buildCarSearchBody(['7'], 'اروند', { page: 2 }) as { city_ids: string[]; search_data: { form_data: { data: Record<string, { str: { value: string } }> } }; pagination_data: unknown };
    expect(b.city_ids).toEqual(['7']);
    expect(b.search_data.form_data.data.category.str.value).toBe('light');
    expect(b.search_data.form_data.data.query.str.value).toBe('اروند');
    expect(b.pagination_data).toEqual({ page: 2 });
  });

  it('تبدیل‌ها', () => {
    expect(parseToman('توافقی')).toBeNull();
    expect(parseYear('۱۴۰۱ - ۲۰۲۲')).toBe(2022);
    expect(parseYear('۱۳۹۶')).toBe(2017);
    expect(parseDivarDate('۱ فروردین ۱۴۰۵')).toBe(Date.parse('2026-03-21T08:30:00Z'));
    expect(parseDivarDate('نامعتبر')).toBeNull();
  });
});
