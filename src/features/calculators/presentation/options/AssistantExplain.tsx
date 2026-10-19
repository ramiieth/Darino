/**
 * توضیح نتیجه به زبان ساده:
 *  - خلاصهٔ پنج‌بخشی (نتیجه، معنی، دلیل، خطر، قدم بعدی) که مستقیم از اعداد موتور ساخته می‌شود و همیشه دیده می‌شود
 *  - دکمهٔ «توضیح دستیار»: همان اعداد به دستیار آپشن (Gemini) می‌رود و پاسخ فقط متن است
 * اگر دستیار در دسترس نباشد، خلاصهٔ محاسبه‌شده سر جایش می‌ماند.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { fetchJson } from '@/repositories/remoteClient';
import { AssistantResponse } from '@/features/connected/presentation/AssistantResponse';
import type { PlainSummary } from './plainText';

export function PlainSummaryView({ s }: { s: PlainSummary }) {
  const row = (title: string, body: React.ReactNode) => (
    <div>
      <p className="text-xs font-bold text-ink">{title}</p>
      <div className="text-xs leading-6 text-muted">{body}</div>
    </div>
  );
  return (
    <div className="space-y-2.5">
      {row('۱. نتیجه به زبان ساده', s.result)}
      {row('۲. یعنی چه؟', s.meaning)}
      {row('۳. چرا این نتیجه؟', s.why)}
      {row(
        '۴. خطرها و محدودیت‌ها',
        <ul className="list-disc space-y-1 ps-4">
          {s.risk.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {row('۵. قدم بعدی', s.next)}
    </div>
  );
}

export function AssistantExplain({
  payload,
  summary,
  op = 'analyze-options'
}: {
  payload: () => Record<string, unknown>;
  summary?: PlainSummary;
  /** مسیر تحلیل سرور: آپشن یا «برنامهٔ من» */
  op?: 'analyze-options' | 'analyze-plan';
}) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchJson<{ answer: string }>(`/api/integrations?op=${op}`, { method: 'POST', body: { analysis: payload() }, timeoutMs: 60_000 });
      setAnswer(r.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دستیار پاسخ نداد');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-card border border-divider bg-surface-2/40 p-3.5">
      {summary && (
        <>
          <p className="text-sm font-bold text-ink">توضیح نتیجه به زبان ساده</p>
          <PlainSummaryView s={summary} />
          <p className="text-2xs text-subtle">این خلاصه مستقیم از محاسبات همین صفحه ساخته شده است.</p>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-6 text-muted">
          {summary ? 'توضیح کامل‌تر از دستیار دارینو؛ دستیار فقط همین اعداد را توضیح می‌دهد و عدد جدیدی نمی‌سازد.' : 'توضیح به زبان ساده از دستیار دارینو؛ دستیار فقط همین اعداد را توضیح می‌دهد و عدد جدیدی نمی‌سازد.'}
        </p>
        <Button size="sm" icon={<Sparkles />} onClick={() => void ask()} loading={busy}>
          {answer ? 'توضیح دوباره' : 'توضیح دستیار'}
        </Button>
      </div>
      {error && (
        <Notice tone="warn">
          {error}
          {summary && ' خلاصهٔ بالا همچنان معتبر است، چون از محاسبات همین صفحه آمده است.'}
        </Notice>
      )}
      {answer && <AssistantResponse text={answer} />}
    </div>
  );
}
