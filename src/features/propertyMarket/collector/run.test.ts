/**
 * کلکشنر — اجرای تکه‌ای با دیوار شبیه‌سازی‌شده (بدون شبکه)
 */
import { describe, it, expect } from 'vitest';
import { collectChunk, newCursor, sanitizeCursor, needsDetail, DEFAULT_MAX_LISTINGS, type CollectCursor } from './run';
import type { Fetcher } from './client';
import { emptySeed } from './parse';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

const CITIES = {
  cities: [
    { id: 1, slug: 'tehran', name: 'تهران' },
    { id: 7, slug: 'ahvaz', name: 'اهواز' }
  ]
};

function postRow(token: string, district: string, price = '۵,۰۰۰,۰۰۰,۰۰۰ تومان') {
  return {
    widget_type: 'POST_ROW',
    data: {
      middle_description_text: price,
      action: { payload: { token, web_info: { title: `آگهی ${token}`, district_persian: district } } }
    }
  };
}

function detailFor(area: number) {
  return {
    sections: [
      {
        widgets: [
          { widget_type: 'GROUP_INFO_ROW', data: { items: [{ title: 'متراژ', value: String(area) }] } }
        ]
      }
    ]
  };
}

/** دیوار ساختگی: صفحات فهرست + جزئیات با متراژ ۱۰۰ */
function fakeDivar(pages: unknown[], opts: { failDetail?: string[]; calls?: string[] } = {}): Fetcher {
  let pageIdx = 0;
  return async (url) => {
    opts.calls?.push(url);
    if (url.includes('/places/cities')) return jsonResponse(CITIES);
    if (url.includes('/postlist/')) return jsonResponse(pages[Math.min(pageIdx++, pages.length - 1)]);
    const token = url.split('/').pop()!;
    if (opts.failDetail?.includes(token)) return jsonResponse({}, 404);
    return jsonResponse(detailFor(100));
  };
}

describe('collectChunk — دیوار', () => {
  it('شهر را resolve می‌کند، قیمت فهرست + متراژ جزئیات را ترکیب می‌کند', async () => {
    const fetcher = fakeDivar([
      { list_widgets: [postRow('t1', 'کیانپارس'), postRow('t2', 'پاداد')], pagination: { has_next_page: false, data: null } }
    ]);
    const r = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher });
    expect(r.cityId).toBe('7');
    expect(r.seeds.map((s) => s.token).sort()).toEqual(['t1', 't2']);
    expect(r.seeds.every((s) => s.areaSqm === 100 && s.totalPriceToman === 5_000_000_000)).toBe(true);
    expect(r.fetchedDetails).toBe(2);
    expect(r.done).toBe(true);
  });

  it('آگهی شناخته‌شده (جزئیات ذخیره) → جزئیات دوباره گرفته نمی‌شود؛ سقف پیش‌فرض همه اهواز را می‌گیرد', async () => {
    const calls: string[] = [];
    const fetcher = fakeDivar(
      [{ list_widgets: [postRow('old1', 'کیانپارس'), postRow('new1', 'گلستان')], pagination: { has_next_page: false, data: null } }],
      { calls }
    );
    const r = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher, knownTokens: ['old1'] });
    expect(r.seeds.map((s) => s.token).sort()).toEqual(['new1', 'old1']);
    expect(r.fetchedDetails).toBe(1);
    expect(calls.some((u) => u.endsWith('/old1'))).toBe(false);
    expect(r.seeds.find((s) => s.token === 'old1')!.totalPriceToman).toBe(5_000_000_000);
    expect(DEFAULT_MAX_LISTINGS).toBeGreaterThanOrEqual(3000);
  });

  it('رگرسیون: آگهی‌های بیش از بودجه جزئیات دور ریخته نمی‌شوند (به تکه بعد منتقل می‌شوند)', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => postRow(`p${i}`, 'گلستان'));
    const fetcher = fakeDivar([{ list_widgets: rows, pagination: { has_next_page: false, data: null } }]);
    const r1 = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, detailBudget: 4, fetcher });
    expect(r1.seeds.length).toBe(4);
    expect(r1.pending).toBe(6);
    expect(r1.done).toBe(false);

    const r2 = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, detailBudget: 4, fetcher, cursor: r1.cursor });
    const r3 = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, detailBudget: 4, fetcher, cursor: r2.cursor });
    const all = [...r1.seeds, ...r2.seeds, ...r3.seeds].map((s) => s.token);
    expect(new Set(all).size).toBe(10); // همه ۱۰ آگهی، بدون تکرار
    expect(r3.done).toBe(true);
  });

  it('صفحه‌بندی با کرسر + حذف تکراری بین صفحات', async () => {
    const calls: string[] = [];
    const fetcher = fakeDivar(
      [
        { list_widgets: [postRow('a', 'گلستان'), postRow('b', 'گلستان')], pagination: { has_next_page: true, data: { page: 1 } } },
        { list_widgets: [postRow('b', 'گلستان'), postRow('c', 'گلستان')], pagination: { has_next_page: false, data: null } }
      ],
      { calls }
    );
    const r1 = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher });
    expect(r1.done).toBe(false);
    expect(r1.cursor.paginationData).toEqual({ page: 1 });
    const r2 = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher, cursor: r1.cursor });
    expect(r2.seeds.map((s) => s.token)).toEqual(['c']);
    expect(r2.done).toBe(true);
    // شهر فقط یک‌بار resolve شد
    expect(calls.filter((u) => u.includes('/places/cities')).length).toBe(1);
  });

  it('خطای جزئیات یک آگهی → همان آگهی بدون متراژ خروجی می‌شود (نه پرتاب خطا)', async () => {
    const fetcher = fakeDivar(
      [{ list_widgets: [postRow('ok', 'گلستان'), postRow('bad', 'گلستان')], pagination: { has_next_page: false, data: null } }],
      { failDetail: ['bad'] }
    );
    const r = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher });
    expect(r.failedDetails).toBe(1);
    expect(r.seeds.find((s) => s.token === 'bad')?.areaSqm).toBeNull();
    expect(r.done).toBe(true);
  });

  it('خطای شبکه در فهرست → پرتاب خطا (فراخواننده گزارش می‌دهد)', async () => {
    const fetcher: Fetcher = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher })).rejects.toThrow();
  });

  it('سقف کل آگهی‌ها → پایان صفحه‌بندی', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => postRow(`m${i}`, 'گلستان'));
    const fetcher = fakeDivar([{ list_widgets: rows, pagination: { has_next_page: true, data: { p: 1 } } }]);
    const r = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, maxListings: 3, fetcher });
    expect(r.cursor.seenTokens.length).toBe(3);
    expect(r.cursor.hasNextPage).toBe(false);
    expect(r.done).toBe(true);
  });

  it('فهرست خالی (با has_next_page) → پایان، نه حلقه بی‌پایان', async () => {
    const fetcher = fakeDivar([{ list_widgets: [], pagination: { has_next_page: true, data: { p: 2 } } }]);
    const r = await collectChunk({ city: 'ahvaz', source: 'divar', pauseMs: 0, fetcher });
    expect(r.done).toBe(true);
  });
});

describe('کرسر', () => {
  it('sanitizeCursor: ورودی خراب/منبع دیگر → کرسر تازه', () => {
    expect(sanitizeCursor(null, 'divar')).toEqual(newCursor('divar'));
    expect(sanitizeCursor('x', 'divar')).toEqual(newCursor('divar'));
    const other = { ...newCursor('divar'), source: 'sheypoor', cityId: 'ahvaz', pagesRead: 3 } as unknown as CollectCursor;
    expect(sanitizeCursor(other, 'divar')).toEqual(newCursor('divar'));
  });

  it('sanitizeCursor: کرسر قدیمی (pendingTokens) پذیرفته و تمیز می‌شود', () => {
    const legacy = { cityId: '7', paginationData: { a: 1 }, hasNextPage: true, seenTokens: ['a', 5], pendingTokens: ['x'], pagesRead: 2 };
    const c = sanitizeCursor(legacy, 'divar');
    expect(c.cityId).toBe('7');
    expect(c.seenTokens).toEqual(['a']);
    expect(c.pendingSeeds).toEqual([]);
    expect(c.pagesRead).toBe(2);
  });

  it('needsDetail: فقط وقتی قیمت/متر محاسبه‌پذیر نیست', () => {
    const d = emptySeed('d1');
    d.totalPriceToman = 1e9;
    expect(needsDetail(d)).toBe(true);
    d.areaSqm = 100;
    expect(needsDetail(d)).toBe(false);
    const p = emptySeed('d2');
    p.pricePerSqmToman = 5e7;
    expect(needsDetail(p)).toBe(false);
  });
});
