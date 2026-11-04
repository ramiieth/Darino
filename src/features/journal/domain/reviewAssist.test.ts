import { describe, expect, it } from 'vitest';
import { emptyReview } from './review';
import { mergeSuggestion, type ReviewSuggestion } from './reviewAssist';

const sug: ReviewSuggestion = {
  summary: 'هفتهٔ منفی؛ دو معامله بدون استاپ.',
  mistakeTags: ['بدون استاپ'], mistakeNote: 'گران‌ترین: ۲۰۰ دلار زیان بدون استاپ',
  goodTags: ['صبر'], goodNote: 'سه روز بدون معامله صبر کردید',
  answers: [{ id: 'q1', text: 'پاسخ دستیار' }, { id: 'q2', text: 'پاسخ دوم' }],
  commitments: [{ type: 'maxTradesPerDay', text: 'حداکثر ۲ معامله', n: 2 }, { type: 'bogus', text: 'x' }, { type: 'maxRiskPct', text: 'ریسک ۱٪', pct: 1 }]
};

describe('تکمیل خودکار مرور هفتگی', () => {
  it('هفتهٔ خالی کامل پر می‌شود؛ نوع قانون ناشناخته کنار می‌رود', () => {
    const r = mergeSuggestion(emptyReview('2026-W44'), sug, 1000);
    expect(r).toMatchObject({ mistakeTags: ['بدون استاپ'], goodTags: ['صبر'], aiSummary: sug.summary, aiAt: 1000, answers: { q1: 'پاسخ دستیار', q2: 'پاسخ دوم' } });
    expect(r.commitments.map((c) => c.rule)).toEqual([{ type: 'maxTradesPerDay', n: 2 }, { type: 'maxRiskPct', pct: 1 }]);
  });

  it('نوشتهٔ کاربر دست نمی‌خورد', () => {
    const mine = { ...emptyReview('2026-W44'), mistakeNote: 'یادداشت من', answers: { q1: 'پاسخ من' }, commitments: [{ id: 'c1', text: 'تعهد من', rule: { type: 'free' as const }, done: false }] };
    const r = mergeSuggestion(mine, sug, 1000);
    expect(r.mistakeNote).toBe('یادداشت من');
    expect(r.answers).toEqual({ q1: 'پاسخ من', q2: 'پاسخ دوم' });
    expect(r.commitments).toHaveLength(1);
    expect(r.commitments[0].text).toBe('تعهد من');
  });
});
