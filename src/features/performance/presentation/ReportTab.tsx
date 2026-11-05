/**
 * تحلیل هوشمند Gemini
 *   ورودی = فقط خروجی موتور محاسبهٔ اپ (اعداد، منابع، تاریخ‌ها)؛ Gemini عددی نمی‌سازد و به هیچ
 *   سابقه، موجودی یا تراکنشی دسترسی نوشتن ندارد. هر گزارش با تاریخ تهیه و منابع ذخیره می‌شود
 *   و می‌توان در هر زمان گزارش تازه ساخت.
 */
import { useState } from 'react';
import { FileText, Sparkles, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { fetchJson } from '@/repositories/remoteClient';
import { AssistantResponse } from '@/features/connected/presentation/AssistantResponse';
import { fmtDateTime } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { toast } from '@/shared/store/toastStore';
import { cn } from '@/shared/lib/cn';
import type { SavedReport } from '../domain/types';
import { deleteReport, newId, saveReport } from '../data/store';
import { PeriodPicker } from './PeriodPicker';
import type { ValueRecord } from '../domain/types';

export function ReportTab({
  records,
  startId,
  endId,
  onPeriod,
  reports,
  buildPayload,
  sources,
  ready
}: {
  records: ValueRecord[];
  startId: string;
  endId: string;
  onPeriod: (s: string, e: string) => void;
  reports: SavedReport[];
  buildPayload: () => Record<string, unknown> | null;
  sources: string[];
  /** قیمت‌های بازار رسیده‌اند */
  ready: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(reports[0]?.id ?? null);
  const current = reports.find((r) => r.id === openId) ?? reports[0] ?? null;

  async function generate() {
    const payload = buildPayload();
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchJson<{ answer: string; generatedAt?: number }>('/api/integrations?op=analyze-performance', { method: 'POST', body: { analysis: payload }, timeoutMs: 70_000 });
      const period = payload.period as { start: string; end: string };
      const rep: SavedReport = {
        id: newId(),
        createdAt: r.generatedAt ?? Date.now(),
        periodStart: Date.parse(period.start),
        periodEnd: Date.parse(period.end),
        text: r.answer.slice(0, 40_000),
        sources,
        model: 'gemini'
      };
      await saveReport(rep);
      setOpenId(rep.id);
      toast('success', 'گزارش تازه ساخته شد');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دستیار پاسخ نداد');
    } finally {
      setBusy(false);
    }
  }

  if (records.length < 2) return <Notice tone="info">برای گزارش تحلیلی حداقل دو سابقهٔ ارزش لازم است.</Notice>;

  return (
    <div className="space-y-5">
      <Surface className="p-4">
        <PeriodPicker records={records} startId={startId} endId={endId} onChange={onPeriod} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
          <p className="max-w-xl text-xs leading-6 text-muted">
            Gemini فقط اعدادی را که اپ محاسبه کرده (سوابق، تورم، مقایسه با بازارها، رشد سال‌به‌سال) دریافت و تفسیر می‌کند؛ هیچ عددی را حدس نمی‌زند و هیچ سابقه، موجودی یا تراکنشی را تغییر نمی‌دهد.
          </p>
          <Button icon={<Sparkles />} loading={busy} disabled={!ready} onClick={() => void generate()}>
            {reports.length ? 'گزارش تازه' : 'تهیهٔ گزارش'}
          </Button>
        </div>
        {!ready && <p className="mt-2 text-2xs text-subtle">در انتظار دریافت قیمت‌های بازار…</p>}
        {error && <Notice tone="warn" className="mt-3">{error}</Notice>}
      </Surface>

      {reports.length > 1 && (
        <div className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter md:mx-0 md:px-0" role="tablist" aria-label="گزارش‌های قبلی">
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={current?.id === r.id}
              onClick={() => setOpenId(r.id)}
              className={cn('min-h-10 shrink-0 rounded-control border px-3 text-xs font-semibold', current?.id === r.id ? 'border-accent bg-accent/10 text-accent' : 'border-divider bg-surface-2 text-muted')}
            >
              {formatJalali(r.createdAt)}
            </button>
          ))}
        </div>
      )}

      {current ? (
        <Surface className="p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-divider pb-3">
            <div className="text-xs leading-6 text-muted">
              <p className="flex items-center gap-1.5 font-bold text-ink"><FileText className="h-4 w-4" /> گزارش عملکرد سرمایه</p>
              <p>تاریخ تهیه: {fmtDateTime(current.createdAt)}</p>
              <p>بازه: {formatJalali(current.periodStart)} تا {formatJalali(current.periodEnd)}</p>
            </div>
            <Button size="icon-sm" variant="ghost" icon={<Trash2 />} aria-label="حذف گزارش" onClick={() => { void deleteReport(current); setOpenId(null); }} />
          </div>
          <AssistantResponse text={current.text} />
          {current.sources.length > 0 && (
            <div className="mt-5 border-t border-divider pt-3">
              <p className="mb-1 text-xs font-bold text-ink">منابع داده</p>
              <ul className="list-disc space-y-0.5 ps-4 text-2xs leading-5 text-subtle">
                {current.sources.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
        </Surface>
      ) : (
        <Surface variant="subtle" className="p-5 text-center text-xs text-muted">هنوز گزارشی ساخته نشده است.</Surface>
      )}
    </div>
  );
}
