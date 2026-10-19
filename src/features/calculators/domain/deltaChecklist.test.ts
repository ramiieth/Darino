import { describe, it, expect } from 'vitest';
import { deltaChecklist, type ChecklistInput } from './deltaChecklist';

const good: ChecklistInput = { spreadApr7d: 15, profitableShare24h: 0.95, netWithoutPoints: 12, liquidationDistancePct: 40, basisPct: 0.05, lowLiquidity: false };

describe('وضعیت امروز دلتا نوترال', () => {
  it('همه برقرار → سبز (وارد شوید)', () => {
    expect(deltaChecklist(good).verdict).toBe('enter');
  });
  it('یک شرط نه‌چندان خطرناک برقرار نیست یا داده نیست → زرد (صبر کنید)', () => {
    expect(deltaChecklist({ ...good, spreadApr7d: 3 }).verdict).toBe('wait');
    expect(deltaChecklist({ ...good, basisPct: 0.8 }).verdict).toBe('wait');
    expect(deltaChecklist({ ...good, spreadApr7d: null }).verdict).toBe('wait');
    expect(deltaChecklist({ ...good, lowLiquidity: true }).verdict).toBe('wait');
  });
  it('فاندینگ ۷ روزه منفی، سود بدون پوینت منفی یا خطر بسته شدن اجباری → قرمز', () => {
    expect(deltaChecklist({ ...good, spreadApr7d: -2 }).verdict).toBe('avoid');
    expect(deltaChecklist({ ...good, netWithoutPoints: -1 }).verdict).toBe('avoid');
    expect(deltaChecklist({ ...good, liquidationDistancePct: 8 }).verdict).toBe('avoid');
  });
});
