import { useEffect, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { toast } from '@/shared/store/toastStore';
import { normalizeNumericInput } from '@/features/custody/domain/decimal';
import { useSettingsStore } from '@/shared/store/settingsStore';
export function ScenarioCashCard({ compact = false }: { compact?: boolean }) {
  const { scenario, hydrate, hydrated, saveScenario } = useSettingsStore();
  const [values, setValues] = useState([String(scenario.baseCapital2025), String(scenario.baseCapital2026)]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { setValues([String(scenario.baseCapital2025), String(scenario.baseCapital2026)]); }, [scenario.baseCapital2025, scenario.baseCapital2026]);
  const parsed = values.map(v => Number(normalizeNumericInput(v)));
  const valid = values.every((v, i) => v.trim() && Number.isFinite(parsed[i]) && parsed[i] > 0);
  async function save() {
    if (!valid) return;
    setSaving(true);
    try { await saveScenario({ ...scenario, baseCapital2025: parsed[0], baseCapital2026: parsed[1] }); toast('success', 'سرمایه‌های دستی ذخیره و سناریوها بازمحاسبه شدند'); }
    catch { toast('error', 'ذخیرهٔ سرمایه انجام نشد'); } finally { setSaving(false); }
  }
  return <Surface className={compact ? 'space-y-3 p-4' : 'space-y-4 p-4 md:p-5'}>
    <div><h3 className="text-sm font-bold text-ink">مقدار تتر شبیه‌سازی</h3><p className="text-xs leading-6 text-muted">مقدار تتر (USDT) را برای هر تاریخ شروع به‌صورت مستقل وارد کنید؛ مبنای محاسبه هر تتر برابر یک دلار است.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{['از ۱ ژانویهٔ ۲۰۲۵', 'از ۱ ژوئیهٔ ۲۰۲۶'].map((label, i) => <Field key={label} label={label}><Input dir="ltr" inputMode="decimal" suffix="USDT" value={values[i]} onChange={e => setValues(v => v.map((x,j) => j === i ? e.target.value : x))} /></Field>)}</div>
    <Button loading={saving} disabled={!valid || !hydrated} onClick={() => void save()}>ذخیره و بازمحاسبه</Button>
  </Surface>;
}
