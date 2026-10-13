// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plan, shopAsk } from '../../api/_shop';
import { safeUrl } from '../../api/_shopHttp';
import { adPrice } from '../../api/_shopLocal';
import { cityByName } from '../../src/features/shopping/domain/cities';
import { parseShopQuery } from '../../src/features/shopping/domain/intent';

const NOW = Date.UTC(2026, 9, 13, 9, 0);
const ahvaz = cityByName('اهواز');
afterEach(() => { vi.unstubAllGlobals(); });

const services = (text: string) => plan(parseShopQuery(text, { now: NOW, home: ahvaz }), NOW).tasks.map((t) => t.service);

describe('دستیار خرید — سرور', () => {
  it('انتخاب منبع بر اساس نیت', () => {
    expect(services('پلی استیشن 5 اسلیم کارکرده در اهواز')).toEqual(['sheypoor', 'divar']);
    expect(services('هدفون بی سیم')).toEqual(['digikala', 'technolife', 'masterkala']);
    expect(services('کفش رانینگ')).toEqual(['digikala', 'shopino']);
    expect(services('متخصص قلب در تهران')).toEqual(['paziresh24', 'doctoreto']);
    expect(services('ارزان‌ترین پرواز یا قطار به مشهد')).toEqual(['mrbilit', 'mrbilit']);
    expect(services('ویلا در شمال')).toEqual(['otaghak']);
    expect(services('ارزان‌ترین شیر کم چرب در اهواز')).toEqual(['snappmarket']);
    const food = plan(parseShopQuery('پیتزا در اهواز', { now: NOW, home: ahvaz }), NOW);
    expect(food.tasks.map((t) => t.service)).toEqual(['snappfood']);
    expect(food.linkOnly).toContain('snappfood');
    expect(plan(parseShopQuery('پرواز ارزان', { now: NOW, home: ahvaz }), NOW).hints[0]).toMatch(/مقصد/);
  });

  it('لینک‌ها و تصاویر فقط https روی دامنهٔ خود سرویس‌ها', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('http://divar.ir/v/abc')).toBeNull();
    expect(safeUrl('https://divar.ir.evil.com/x')).toBeNull();
    expect(safeUrl('https://s100.divarcdn.com/a.webp')).toBe('https://s100.divarcdn.com/a.webp');
    expect(safeUrl('/image/x.png', 'https://www.technolife.com')).toBe('https://www.technolife.com/image/x.png');
  });

  it('قیمت آگهی: ریال به تومان، «توافقی» و قیمت نمادین حذف', () => {
    expect(adPrice('۱۲۰,۰۰۰,۰۰۰ تومان')).toBe(120_000_000);
    expect(adPrice('12,000,000', 'ریال')).toBe(1_200_000);
    expect(adPrice('۱,۰۰۰ تومان')).toBeNull();
    expect(adPrice('توافقی')).toBeNull();
  });

  it('فقط میزبان‌های مجاز، بدون کوکی/کلید کاربر؛ پرواز ریالی به تومان و ارزان‌ترین روز', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      const headers = init.headers as Record<string, string>;
      expect(headers.Cookie).toBeUndefined();
      expect(headers.Authorization).toBeUndefined();
      if (url.endsWith('/MinPrices')) {
        return new Response(JSON.stringify([{ TotalFare: 90_000_000, Date: '2026-10-15T00:00:00' }, { TotalFare: 61_000_000, Date: '2026-10-16T00:00:00' }]));
      }
      if (url.endsWith('/api/Flights')) {
        expect(JSON.parse(init.body as string).Routes[0]).toEqual({ OriginCode: 'AWZ', DestinationCode: 'KIH', DepartureDate: '2026-10-16' });
        const flight = (id: string, fare: number, dep: string) => ({
          Id: id,
          Segments: [{ Legs: [{ Origin: 'اهواز', Destination: 'کیش', DepartureTime: `2026-10-16T${dep}:00+03:30`, ArrivalTime: `2026-10-16T${dep}:00+03:30`, Airline: { PersianTitle: 'زاگرس', Logo: 'https://static.mrbilit.com/img/ZV.svg' } }] }],
          Prices: [{ Capacity: 4, CabinClassDisplayName: 'اکونومی', PassengerFares: [{ PaxType: 'ADL', TotalFare: fare }] }]
        });
        return new Response(JSON.stringify({ Flights: [flight('1', 70_000_000, '09:00'), flight('2', 61_000_000, '22:00')] }));
      }
      return new Response('{}', { status: 404 });
    }));
    const a = await shopAsk('ارزان‌ترین پرواز به کیش از اهواز', 'ahvaz', NOW);
    expect(calls.every((u) => u.startsWith('https://flight.atighgasht.com/'))).toBe(true);
    expect(a.items.map((i) => i.priceToman)).toEqual([6_100_000, 7_000_000]);
    expect(a.items[0].url).toBe('https://mrbilit.com/flights/AWZ-KIH?departureDate=2026-10-16');
    expect(a.top?.why).toBe("مستربلیط: ۹۰۰٬۰۰۰ تومان ارزان‌تر از رتبهٔ دوم");
    expect(a.links.map((l) => l.service)).toEqual(['flytoday']);
  });

  it('منبع مسدود (۴۰۳) به لینک مستقیم تبدیل می‌شود، نه خطای کل پاسخ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>blocked</html>', { status: 403 })));
    const a = await shopAsk('ارزان‌ترین پیتزا در اهواز', 'ahvaz', NOW + 1);
    expect(a.items).toEqual([]);
    expect(a.sources).toEqual([{ service: 'snappfood', ok: false, count: 0, note: 'سرور خارج از ایران را نمی‌پذیرد' }]);
    expect(a.links[0].url).toBe('https://snappfood.ir');
  });
});
