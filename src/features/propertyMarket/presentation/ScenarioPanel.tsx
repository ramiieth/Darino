/** ============================================================
 * Property Market — پنل سناریوی نرخ دلار آینده (§۲۳/§۲۴ مأموریت)
 *
 * ⚠️ «سناریوی آینده» — نه پیش‌بینی قیمت ملک.
 * ⚠️ نرخ فعلی فقط از منبع موجود دلار (تنظیمات اپ) خوانده می‌شود؛
 *    نرخ آینده یک «فرض سناریو» است که با همان مقدار اولیه می‌شود.
 * ============================================================ */
import { useEffect, useState } from 'react';
import { FlaskConical, Info, RotateCcw, Settings2 } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { toFaDigits, fmtIntLatin } from '@/shared/utils/formatters';
import type { PropertyMarketScenario } from '../domain/types';

export function ScenarioPanel({
  scenario,
  currentRate,
  fxHydrated,
  onChange,
  onReset
}: {
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
    <GlassCard className="p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold text-ink">
          <FlaskConical className="h-3.5 w-3.5 text-accent" />
          سناریوی نرخ دلار آینده
        </h3>
        <button
          onClick={onReset}
          className="flex items-center gap-1 rounded-full border border-line/15 px-2 py-0.5 text-[8px] font-bold text-muted hover:text-ink"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          بازنشانی
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[8px] font-extrabold text-muted">
            نرخ دلار فعلی (منبع اپ)
          </label>
          <div className="flex h-9 items-center rounded-xl border border-line/15 bg-surface-2/50 px-2.5 text-[10px] font-extrabold text-ink">
            {fxHydrated && currentRate !== null ? (
              <span className="num-ltr">{fmtIntLatin(currentRate)} تومان</span>
            ) : (
              '—'
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-[7px] font-medium text-muted">
            <Settings2 className="h-2.5 w-2.5" />
            تغییر نرخ فعلی فقط از تنظیمات اپ انجام می‌شود
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[8px] font-extrabold text-muted">
            نرخ دلار آینده (فرض سناریو)
          </label>
          <div className="flex gap-1">
            <input
              value={futureInput}
              onChange={(e) => setFutureInput(e.target.value)}
              onBlur={applyFuture}
              onKeyDown={(e) => e.key === 'Enter' && applyFuture()}
              inputMode="numeric"
              placeholder={currentRate !== null ? String(currentRate) : 'مثلاً 120000'}
              className="num-ltr h-9 w-full rounded-xl border border-line/15 bg-card px-2.5 text-[10px] font-extrabold text-ink shadow-card outline-none focus:border-accent/50"
            />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <label className="mb-1 block text-[8px] font-extrabold text-muted">
          فرض رشد قیمت تومانی ملک (٪ — اختیاری، سناریو قیمت متغیر)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            value={growthInput}
            onChange={(e) => setGrowthInput(e.target.value)}
            onBlur={applyGrowth}
            onKeyDown={(e) => e.key === 'Enter' && applyGrowth()}
            inputMode="decimal"
            placeholder="خالی = قیمت تومانی ثابت"
            className="num-ltr h-9 w-36 rounded-xl border border-line/15 bg-card px-2.5 text-[10px] font-extrabold text-ink shadow-card outline-none focus:border-accent/50"
          />
          <span className="text-[8px] font-bold text-muted">
            {growthActive
              ? `سناریو فعال: ${toFaDigits(String(scenario.propertyTomanGrowthPct))}٪ تغییر تومانی`
              : 'سناریو پیش‌فرض: قیمت تومانی ثابت'}
          </span>
        </div>
      </div>

      <div className="mt-2.5 rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-2 text-[8px] font-medium leading-4 text-muted">
        <Info className="me-1 inline h-3 w-3 text-warn" />
        قیمت دلاری آینده، یک سناریوی محاسباتی بر اساس نرخ دلار آینده است و به معنی
        پیش‌بینی قطعی قیمت ملک نیست.
        {growthActive
          ? ' ارزش‌گذاری دلاری آینده سناریو-مبنا است (قیمت تومانی سناریو هم اعمال شده).'
          : ' فرض این سناریو: قیمت تومانی ملک بدون تغییر می‌ماند.'}
      </div>
    </GlassCard>
  );
}
