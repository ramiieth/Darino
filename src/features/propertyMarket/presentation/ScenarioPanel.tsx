/** ============================================================
 * Property Market — پنل سناریوی نرخ دلار آینده (§۲۳/§۲۴ مأموریت)
 *
 * ⚠️ «سناریوی آینده» — نه پیش‌بینی قیمت ملک.
 * ⚠️ نرخ فعلی فقط از منبع موجود دلار (تنظیمات اپ) خوانده می‌شود؛
 *    نرخ آینده یک «فرض سناریو» است که با همان مقدار اولیه می‌شود.
 * ============================================================ */
import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits, fmtIntLatin } from '@/shared/utils/formatters';
import type { PropertyMarketScenario } from '../domain/types';

export function ScenarioPanel({
  scenario,
  currentRate,
  fxHydrated,
  onChange,
  onReset,
  rateField
}: {
  /** نمایش نرخ فعلی (نرخ زنده تتر) — جایگزین فیلد ثابت */
  rateField?: ReactNode;
  scenario: PropertyMarketScenario;
  currentRate: number | null;
  fxHydrated: boolean;
  onChange: (patch: Partial<Omit<PropertyMarketScenario, 'updatedAt'>>) => void;
  onReset: () => void;
}) {
  const [futureInput, setFutureInput] = useState('');
  const [growthInput, setGrowthInput] = useState('');

  // مقداردهی اولیه از سناریوی ذخیره‌شده یا نرخ فعلی
  useEffect(() => {
    setFutureInput(String(scenario.futureUsdRateToman ?? currentRate ?? ''));
  }, [scenario.futureUsdRateToman, currentRate]);

  useEffect(() => {
    setGrowthInput(
      scenario.propertyTomanGrowthPct === null ? '' : String(scenario.propertyTomanGrowthPct)
    );
  }, [scenario.propertyTomanGrowthPct]);

  const applyFuture = () => {
    const v = Number(futureInput.replace(/[،,]/g, ''));
    if (!Number.isFinite(v) || v <= 0) return;
    onChange({ futureUsdRateToman: Math.round(v) });
  };

  const applyGrowth = () => {
    const raw = growthInput.trim();
    if (raw === '') {
      onChange({ propertyTomanGrowthPct: null });
      return;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    onChange({ propertyTomanGrowthPct: Math.max(-90, Math.min(500, v)) });
  };

  const growthActive = scenario.propertyTomanGrowthPct !== null && scenario.propertyTomanGrowthPct !== 0;

  return (
    <Surface className="p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ink">سناریوی نرخ دلار آینده</h2>
          <p className="text-xs text-muted">محاسبه‌ای بر اساس فرض شما — پیش‌بینی قیمت ملک نیست</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={onReset}>
          بازنشانی
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="نرخ دلار فعلی (تتر)" hint={rateField ? 'زنده — هر دقیقه به‌روز می‌شود' : 'از تنظیمات اپ تغییر می‌کند'}>
          {rateField ?? <div className="flex h-10 items-center rounded-field bg-surface-2 px-3.5 text-sm font-semibold text-ink">
            {fxHydrated && currentRate !== null ? (
              <span>
                <span className="num-ltr">{toFaDigits(fmtIntLatin(currentRate))}</span> تومان
              </span>
            ) : (
              '—'
            )}
          </div>}
        </Field>
        <Field label="نرخ دلار آینده (فرض)" hint="با Enter یا خروج از فیلد اعمال می‌شود">
          <Input
            dir="ltr"
            value={futureInput}
            onChange={(e) => setFutureInput(e.target.value)}
            onBlur={applyFuture}
            onKeyDown={(e) => e.key === 'Enter' && applyFuture()}
            inputMode="numeric"
            placeholder={currentRate !== null ? String(currentRate) : '120000'}
            suffix="تومان"
          />
        </Field>
        <Field
          label="رشد قیمت تومانی ملک"
          hint={growthActive ? `فعال: ${toFaDigits(String(scenario.propertyTomanGrowthPct))}٪` : 'خالی = قیمت تومانی ثابت'}
        >
          <Input
            dir="ltr"
            value={growthInput}
            onChange={(e) => setGrowthInput(e.target.value)}
            onBlur={applyGrowth}
            onKeyDown={(e) => e.key === 'Enter' && applyGrowth()}
            inputMode="decimal"
            suffix="%"
          />
        </Field>
      </div>

      <Notice tone="warn" className="mt-4">
        قیمت دلاری آینده یک سناریوی محاسباتی بر اساس نرخ دلار آینده است و پیش‌بینی قطعی قیمت ملک نیست.
        {growthActive ? ' رشد تومانی سناریو هم اعمال شده است.' : ' فرض: قیمت تومانی ملک بدون تغییر می‌ماند.'}
      </Notice>
    </Surface>
  );
}
