/** دکمهٔ «توضیح دستیار»: اعداد از پیش محاسبه‌شده به دستیار آپشن (Gemini) می‌رود و پاسخ فقط متن است */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { fetchJson } from '@/repositories/remoteClient';
import { AssistantResponse } from '@/features/connected/presentation/AssistantResponse';

export function AssistantExplain({ payload }: { payload: () => Record<string, unknown> }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchJson<{ answer: string }>('/api/integrations?op=analyze-options', { method: 'POST', body: { analysis: payload() }, timeoutMs: 60_000 });
      setAnswer(r.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دستیار پاسخ نداد');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-card border border-divider bg-surface-2/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-6 text-muted">توضیح کامل به زبان ساده از «دستیار تحلیل آپشن دارینو» — فقط همین اعداد را توضیح می‌دهد.</p>
        <Button size="sm" icon={<Sparkles />} onClick={() => void ask()} loading={busy}>
          {answer ? 'توضیح دوباره' : 'توضیح دستیار'}
        </Button>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      {answer && <AssistantResponse text={answer} />}
    </div>
  );
}
