/**
 * سرمایهٔ نقد سناریو — خودکار (از موجودی نقد حسابداری) یا دستی
 * با هر تغییر، همهٔ سناریوها (شبیه‌سازی، «اگر سرمایه‌گذاری کرده بودم»…) فوراً بازمحاسبه می‌شوند.
 */
import { useEffect, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { toast } from '@/shared/store/toastStore';
import { normalizeNumericInput } from '@/features/custody/domain/decimal';
import { saveScenarioCash, useInvestableCash } from '@/shared/hooks/useInvestableCash';

export function ScenarioCashCard({ compact = false }: { compact?: boolean }) {
  const inv = useInvestableCash();
  const [mode, setMode] = useState<'auto' | 'manual'>(inv.mode);
  const [manual, setManual] = useState(inv.manualUsd !== null ? String(inv.manualUsd) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(inv.mode);
    setManual(inv.manualUsd !== null ? String(inv.manualUsd) : '');
  }, [inv.mode, inv.manualUsd]);

  const parsed = Number(normalizeNumericInput(manual));
  const manualValid = manual.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  async function save(nextMode: 'auto' | 'manual') {
    if (nextMode === 'manual' && !manualValid) return toast('error', 'مبلغ معتبر وارد کنید');
    setSaving(true);
    try {
      await saveScenarioCash({ mode: nextMode, manualUsd: manualValid ? parsed : inv.manualUsd });
      toast('success', nextMode === 'auto' ? 'سرمایهٔ سناریو: خودکار از موجودی نقد' : 'سرمایهٔ سناریو به‌روز شد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className={compact ? 'space-y-3 p-4' : 'space-y-4 p-4 md:p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">سرمایهٔ نقد سناریوها</h3>
          <p className="text-xs leading-5 text-muted">
            {inv.mode === 'auto'
              ? 'خودکار: موجودی نقد حسابداری (تتر و دلارهای دیجیتال) — پس از هر خرید، فروش، سواپ یا برداشت به‌روز می‌شود.'
              : 'دستی: مبلغی که خودتان تعیین کرده‌اید.'}
          </p>
        </div>
        <p className="text-lg font-bold text-ink">
          <MoneyValue value={inv.cash} state={inv.loading ? 'loading' : 'ready'} />
        </p>
      </div>
      <SegmentedControl
        label="نوع سرمایهٔ سناریو"
        options={[
          { value: 'auto', label: 'خودکار از حسابداری' },
          { value: 'manual', label: 'دستی' }
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          if (m === 'auto') void save('auto');
        }}
        fill
      />
      {mode === 'auto' ? (
        <p className="text-xs text-muted">
          موجودی نقد فعلی حسابداری: <MoneyValue value={inv.accountingCash} state={inv.accountingCash === null ? 'loading' : 'ready'} />
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="مبلغ سرمایهٔ سناریو" className="min-w-[180px] flex-1">
            <Input dir="ltr" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} suffix="دلار" />
          </Field>
          <Button loading={saving} disabled={!manualValid} onClick={() => save('manual')}>
            ذخیره و بازمحاسبه
          </Button>
        </div>
      )}
    </Surface>
  );
}
