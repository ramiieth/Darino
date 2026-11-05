import { describe, expect, it } from 'vitest';
import { sanitizeReview } from '../../api/_assistant';

const input = { week: '2026-W44', stats: {}, trades: [], previousCommitments: [], mistakeTags: ['بدون استاپ', 'FOMO'], goodTags: ['صبر'], whyTags: ['شکست'], questions: [{ id: 'q1', title: 'سؤال', sub: '' }], maxRiskPct: 1 };

describe('sanitizeReview', () => {
  it('فقط تگ، سؤال و قانون مجاز؛ پارامترها محدود', () => {
    const r = sanitizeReview({
      summary: ' خلاصه ', mistakeTags: ['FOMO', 'ساختگی'], mistakeNote: 'x', goodTags: ['ناشناس'], goodNote: '',
      answers: [{ id: 'q1', text: 'پاسخ' }, { id: 'zz', text: 'نه' }],
      commitments: [{ type: 'maxTradesPerDay', text: 'a', n: 500 }, { type: 'hack', text: 'b' }, { type: 'allowedSetups', text: 'c', tags: ['شکست', 'جعلی'] }, { type: 'free', text: 'd' }]
    }, input);
    expect(r.summary).toBe('خلاصه');
    expect(r.mistakeTags).toEqual(['FOMO']);
    expect(r.goodTags).toEqual([]);
    expect(r.answers).toEqual([{ id: 'q1', text: 'پاسخ' }]);
    expect(r.commitments).toEqual([{ type: 'maxTradesPerDay', text: 'a', n: 50 }, { type: 'allowedSetups', text: 'c', tags: ['شکست'] }, { type: 'free', text: 'd' }]);
  });
});

describe('sanitizeReview — پاسخ بلند رد نمی‌شود', () => {
  it('متن بلندتر از سقف کوتاه می‌شود و فیلد خراب خالی می‌شود', () => {
    const r = sanitizeReview({
      summary: 'خ'.repeat(5000), mistakeTags: 'نه آرایه', mistakeNote: 'ی'.repeat(3000), goodTags: [], goodNote: 12,
      answers: [{ id: 'q1', text: 'پ'.repeat(2500) }],
      commitments: [{ type: 'maxRiskPct', text: 'ت'.repeat(400), pct: 'یک' }]
    }, input);
    expect(r.summary).toHaveLength(3000);
    expect(r.mistakeTags).toEqual([]);
    expect(r.mistakeNote).toHaveLength(2000);
    expect(r.goodNote).toBe('');
    expect(r.answers[0].text).toHaveLength(2000);
    expect(r.commitments).toEqual([{ type: 'maxRiskPct', text: 'ت'.repeat(200), pct: 1 }]);
  });
});
