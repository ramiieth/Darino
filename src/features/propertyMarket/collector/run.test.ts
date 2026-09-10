/**
 * کلکشنر — اجرای تکه‌ای با دیوار شبیه‌سازی‌شده (بدون شبکه)
 */
import { describe, it, expect } from 'vitest';
import { collectChunk, newCursor } from './run';
import type { Fetcher } from './client';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

const CITIES = {
  cities: [
    { id: 1, slug: 'tehran', name: 'تهران' },
    { id: 3, slug: 'ahvaz', name: 'اهواز' }
  ]
};

function postRow(token: string, title: string, district: string, price: string) {
  return {
    widget_type: 'POST_ROW',
    data: { action: { payload: { token, web_info: { title, district_persian: district }, price } } }
  };
}

describe('collectChunk', () => {
  it('شهر را از فهرست شهرها resolve می‌کند و آگهی‌ها را با کرسر صفحه‌بندی می‌خواند', async () => {
    const pages = [
      {
        list_widgets: [
          postRow('t1', 'آپارتمان ۱۰۰ متری', 'کیانپارس', '۵,۰۰۰,۰۰۰,۰۰۰'),
          postRow('t2', 'آپارتمان ۸۰ متری', 'پاداد', '۲,۸۰۰,۰۰۰,۰۰۰')
        ],
        pagination: { has_next_page: true, data: { cursor: 'p2' } }
      },
      {
        list_widgets: [postRow('t3', 'آپارتمان ۱۲۰ متری', 'گلستان', '۳,۶۰۰,۰۰۰,۰۰۰'), postRow('t1', 'dup', 'کیانپارس', '۵,۰۰۰,۰۰۰,۰۰۰')],
        pagination: { has_next_page: false, data: null }
      }
    ];
    let pageIdx = 0;
    const fetcher: Fetcher = async (url) => {
      if (url.includes('/places/cities')) return jsonResponse(CITIES);
      if (url.includes('/postlist/')) return jsonResponse(pages[pageIdx++] ?? pages[pages.length - 1]);
      return jsonResponse({});
    };

    const cursor = newCursor();
    const r1 = await collectChunk({
      city: 'ahvaz',
      maxListings: 2,
      detailBudget: 0,
      pauseMs: 0,
      fetcher,
      cursor
    });
    expect(r1.cityId).toBe('3'); // اهواز از /places/cities
    expect(r1.seeds.length).toBe(2);
    expect(r1.done).toBe(false);

    const r2 = await collectChunk({
      city: 'ahvaz',
      maxListings: 2,
      detailBudget: 0,
      pauseMs: 0,
      fetcher,
      cursor: r1.cursor
    });
    // t1 تکراری است — فقط t3 جدید
    expect(r2.seeds.length).toBe(1);
    expect(r2.seeds[0].token).toBe('t3');
    expect(r2.done).toBe(true);
  });

  it('آگهی بدون قیمت/متراژ در فهرست → به صف جزئیات می‌رود و با بودجه واکشی می‌شود', async () => {
    const detail = {
      sections: [
        {
          widgets: [
            {
              widget_type: 'GROUP_INFO_ROW',
              data: {
                items: [
                  { title: 'متراژ', value: '۹۰ متر' },
                  { title: 'قیمت کل', value: '۴,۵۰۰,۰۰۰,۰۰۰ تومان' }
                ]
              }
            }
          ]
        }
      ]
    };
    const fetcher: Fetcher = async (url) => {
      if (url.includes('/places/cities')) return jsonResponse(CITIES);
      if (url.includes('/postlist/')) {
        return jsonResponse({
          list_widgets: [postRow('t9', 'آگهی بدون قیمت در فهرست', 'کیان‌آباد', '')],
          pagination: { has_next_page: false, data: null }
        });
      }
      if (url.includes('/posts-v2/web/')) return jsonResponse(detail);
      return jsonResponse({});
    };

    const r = await collectChunk({ city: 'ahvaz', detailBudget: 3, pauseMs: 0, fetcher });
    expect(r.fetchedDetails).toBe(1);
    expect(r.done).toBe(true);
    const seed = r.seeds.find((s) => s.token === 't9')!;
    expect(seed.areaSqm).toBe(90);
    expect(seed.totalPriceToman).toBe(4_500_000_000);
  });

  it('شهر غیرقابل تطبیق → خطای شفاف (نه داده جعلی)', async () => {
    const fetcher: Fetcher = async () => jsonResponse({ cities: [{ id: 1, slug: 'tehran', name: 'تهران' }] });
    await expect(
      collectChunk({ city: 'ahvaz', detailBudget: 0, pauseMs: 0, fetcher })
    ).rejects.toThrow(/city not found/);
  });
});
