/** انتخاب بازه بر اساس سوابق ثبت‌شده (شروع و پایان یکسان برای همهٔ بازارها) */
import { Field, Select } from '@/shared/components/ui/Input';
import { formatGregorianIso, formatJalali } from '@/shared/utils/jalali';
import type { ValueRecord } from '../domain/types';
import { usdText } from '@/shared/utils/formatters';

const label = (r: ValueRecord) => `${formatJalali(r.dateTs)} · ${formatGregorianIso(r.dateTs)} · ${usdText(Math.round(r.usd))}`;

export function PeriodPicker({ records, startId, endId, onChange }: { records: ValueRecord[]; startId: string; endId: string; onChange: (start: string, end: string) => void }) {
  const start = records.find((r) => r.id === startId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="شروع دوره">
        <Select value={startId} onChange={(e) => onChange(e.target.value, endId)}>
          {records.slice(0, -1).map((r) => (
            <option key={r.id} value={r.id}>{label(r)}</option>
          ))}
        </Select>
      </Field>
      <Field label="پایان دوره">
        <Select value={endId} onChange={(e) => onChange(startId, e.target.value)}>
          {records.filter((r) => !start || r.dateTs > start.dateTs).map((r) => (
            <option key={r.id} value={r.id}>{label(r)}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
