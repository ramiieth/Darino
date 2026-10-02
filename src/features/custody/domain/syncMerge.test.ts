/** ادغام همگام‌سازی بین دستگاه‌ها — دادهٔ مصنوعی */
import { describe, expect, it } from 'vitest';
import { isNewer, planMerge, validateSyncRecord, type SyncRecord } from './syncMerge';

const r = (id: string, revision: number, updatedAt: number, collection: SyncRecord['collection'] = 'operations'): SyncRecord => ({
  collection,
  id,
  revision,
  updatedAt,
  payload: { id }
});

describe('planMerge', () => {
  it('رکورد فقط‌محلی push و فقط‌سروری pull می‌شود؛ هیچ حذفی نیست', () => {
    const p = planMerge([r('a', 1, 1)], [r('b', 1, 1)]);
    expect(p.push.map((x) => x.id)).toEqual(['a']);
    expect(p.pull.map((x) => x.id)).toEqual(['b']);
  });

  it('نسخهٔ بالاتر برنده است؛ در نسخهٔ برابر، زمان جدیدتر', () => {
    expect(planMerge([r('a', 3, 1)], [r('a', 2, 999)]).push).toHaveLength(1);
    expect(planMerge([r('a', 2, 5)], [r('a', 2, 9)]).pull).toHaveLength(1);
    const same = planMerge([r('a', 2, 5)], [r('a', 2, 5)]);
    expect(same.pull.length + same.push.length).toBe(0);
  });

  it('شناسهٔ یکسان در مجموعه‌های مختلف تداخل ندارد', () => {
    const p = planMerge([r('x', 1, 1, 'holdings')], [r('x', 1, 1, 'assets')]);
    expect(p.push).toHaveLength(1);
    expect(p.pull).toHaveLength(1);
  });

  it('isNewer', () => {
    expect(isNewer({ revision: 2, updatedAt: 0 }, { revision: 1, updatedAt: 9 })).toBe(true);
  });
});

describe('validateSyncRecord', () => {
  it('مجموعه، شناسه و payload نامعتبر رد می‌شوند', () => {
    expect(validateSyncRecord(r('ok-id', 1, 0))).toBe(true);
    expect(validateSyncRecord({ ...r('a', 1, 0), collection: 'users' })).toBe(false);
    expect(validateSyncRecord({ ...r('a', 1, 0), id: '../../x' })).toBe(false);
    expect(validateSyncRecord({ ...r('a', 0, 0) })).toBe(false);
    expect(validateSyncRecord({ ...r('a', 1, 0), payload: { id: 'other' } })).toBe(false);
    expect(validateSyncRecord({ ...r('a', 1, 0), payload: [] })).toBe(false);
  });
});
