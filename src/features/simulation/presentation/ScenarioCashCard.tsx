import { useEffect, useState } from 'react';
import { Check, Coins, Sparkles } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { toast } from '@/shared/store/toastStore';
import { normalizeNumericInput } from '@/features/custody/domain/decimal';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const QUICK_AMOUNTS = [1_000, 5_000, 10_000, 25_000] as const;

export function ScenarioCashCard({ compact = false }: { compact?: boolean }) {
  const { scenario, hydrate, hydrated, saveScenario } = useSettingsStore();
  const [values, setValues] = useState([String(scenario.baseCapital2025), String(scenario.baseCapital2026)]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setValues([String(scenario.baseCapital2025), String(scenario.baseCapital2026)]);
  }, [scenario.baseCapital2025, scenario.baseCapital2026]);

  const parsed = values.map((v) => Number(normalizeNumericInput(v)));
  const valid = values.every((v, i) => v.trim() && Number.isFinite(parsed[i]) && parsed[i] > 0);
  const dirty =
    valid &&
    (parsed[0] !== scenario.baseCapital2025 || parsed[1] !== scenario.baseCapital2026);

  async function save(next?: [number, number]) {
    const target = next ?? [parsed[0], parsed[1]];
    if (!target.every((n) => Number.isFinite(n) && n > 0)) return;
    setSaving(true);
    try {
      await saveScenario({ ...scenario, baseCapital2025: target[0], baseCapital2026: target[1] });
      toast('success', 'سرمایهٔ شبیه‌سازی ذخیره و بازمحاسبه شد');
    } catch {
      toast('error', 'ذخیرهٔ سرمایه انجام نشد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface variant="focal" className="relative overflow-hidden">
      <div className="h-[3px] w-full bg-gradient-to-l from-accent via-gain/65 to-transparent" aria-hidden />
      <div className={cn('space-y-4', compact ? 'p-4' : 'p-4 md:p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
              <Coins aria-hidden className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-ink">سرمایهٔ فرضی شبیه‌سازی</h3>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                مبلغ دلاری هر تاریخ شروع را مستقل تنظیم کنید (مبنا: هر تتر برابر ۱ دلار، بدون اثر روی دارایی واقعی).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-subtle">
              <Sparkles aria-hidden className="h-3 w-3 text-accent" />
              مبلغ سریع:
            </span>
            {QUICK_AMOUNTS.map((amt) => {
              const active = parsed[0] === amt && parsed[1] === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setValues([String(amt), String(amt)]);
                    void save([amt, amt]);
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-bold transition-all',
                    active
                      ? 'border-accent bg-accent text-on-accent shadow-xs'
                      : 'border-divider bg-card text-muted hover:border-divider-strong hover:text-ink'
                  )}
                >
                  <bdi dir="ltr" className="num-ltr">
                    {toFaDigits(amt.toLocaleString('en-US'))}
                  </bdi>{' '}
                  دلار
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          {['از ۱ ژانویهٔ ۲۰۲۵', 'از ۱ ژوئیهٔ ۲۰۲۶'].map((label, i) => (
            <Field key={label} label={label}>
              <Input
                dir="ltr"
                inputMode="decimal"
                suffix="USDT"
                value={values[i]}
                onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </Field>
          ))}
          <Button
            loading={saving}
            disabled={!valid || !hydrated}
            variant={dirty ? 'primary' : 'outline'}
            icon={!dirty && hydrated ? <Check className="h-4 w-4 text-positive" /> : undefined}
            onClick={() => void save()}
            className="h-10 sm:px-5"
          >
            {dirty ? 'ذخیره و بازمحاسبه' : 'ذخیره‌شده'}
          </Button>
        </div>
      </div>
    </Surface>
  );
}
