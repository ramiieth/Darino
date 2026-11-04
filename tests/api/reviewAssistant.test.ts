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
