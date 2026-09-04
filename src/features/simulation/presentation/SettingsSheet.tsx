/**
 * شیت تنظیمات و سناریوی سفارشی — React Hook Form + Zod
 * + مدیریت نرخ ارز (fx_rates) با تاریخچه ۲۴ ساعت و نمودار
 * + پاک‌سازی کش با تأیید دومرحله‌ای
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, KeyRound, Check, Save, RotateCcw } from 'lucide-react';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, type ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { useSettingsStore, effectiveApiKeys } from '@/shared/store/settingsStore';
import { useMarketStore } from '@/shared/store/marketStore';
import { useFxStore } from '@/shared/store/fxStore';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useAvBudgetStore } from '@/shared/store/avBudgetStore';
import { avBudgetInfo } from '@/shared/lib/alphavantage';
import { cacheClearPrices } from '@/shared/lib/db';
import { toast } from '@/shared/store/toastStore';
import { t } from '@/shared/i18n/fa';
import { storage } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';
import { fmtIntLatin, fmtTime, DEFAULT_IRR_RATE } from '@/shared/utils/formatters';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

const scenarioSchema = z.object({
  ethAmount: z.coerce.number().min(0.000001, '≥ 0'),
  ethBuyPrice: z.coerce.number().positive(),
  ethInitialInvestment: z.coerce.number().positive(),
  usdcAllocation2026: z.coerce.number().positive(),
  baseCapital2025: z.coerce.number().positive(),
  baseCapital2026: z.coerce.number().positive(),
  ethRefJuly2026: z.coerce.number().positive(),
  apiKey: z.string().trim().optional()
});

type ScenarioForm = z.infer<typeof scenarioSchema>;

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { scenario, hydrate, saveScenario, apiKeys, saveApiKeys } = useSettingsStore();
  const fx = useFxStore();
  const avBudget = useAvBudgetStore();
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [fxInput, setFxInput] = useState('');
  const [keysInput, setKeysInput] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ScenarioForm>({
    resolver: zodResolver(scenarioSchema),
    defaultValues: { ...scenario, apiKey: apiKeys.join(', ') }
  });

  useEffect(() => {
    if (open) {
      void hydrate().then(() => {
        const keys = useSettingsStore.getState().apiKeys;
        reset({ ...useSettingsStore.getState().scenario, apiKey: keys.join(', ') });
        setKeysInput(keys.join(', '));
      });
      void fx.hydrate();
      void avBudget.hydrate();
      setSaved(false);
      setConfirmClear(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hydrate, fx.hydrate, avBudget.hydrate, reset]);

  // همگام‌سازی ورودی نرخ ارز
  useEffect(() => {
    if (open) setFxInput(String(fx.rate ?? DEFAULT_IRR_RATE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fx.rate]);

  const onSubmit = async (values: ScenarioForm) => {
    await saveScenario({
      ethAmount: values.ethAmount,
      ethBuyPrice: values.ethBuyPrice,
      ethInitialInvestment: values.ethInitialInvestment,
      usdcAllocation2026: values.usdcAllocation2026,
      baseCapital2025: values.baseCapital2025,
      baseCapital2026: values.baseCapital2026,
      ethRefJuly2026: values.ethRefJuly2026
    });
    // کلیدها با کاما جدا می‌شوند
    const keys = (values.apiKey ?? '')
      .split(/[,،]/)
      .map((k) => k.trim())
      .filter(Boolean);
    await saveApiKeys(keys);
    setKeysInput(keys.join(', '));
    setSaved(true);
    toast('success', t('savedToast'));
    setTimeout(() => setSaved(false), 2000);
  };

  const saveFx = async () => {
    const rate = Number(fxInput.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/,/g, ''));
    if (!Number.isFinite(rate) || rate <= 0) {
      toast('error', 'نرخ معتبر وارد کنید');
      return;
    }
    await fx.setRate(rate);
    toast('success', t('fxRateSaved'));
  };

  const clearCache = async () => {
    await cacheClearPrices();
    useMarketStore.setState({ quotes: {}, lastCycleAt: null });
    setConfirmClear(false);
    toast('success', t('cacheCleared'));
  };

  const field = (label: string, key: keyof ScenarioForm, placeholder = '0.00') => (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-muted">{label}</label>
      <Input
        type="number"
        step="any"
        inputMode="decimal"
        dir="ltr"
        placeholder={placeholder}
        className="h-10 text-xs text-start"
        {...register(key)}
      />
      {errors[key] && (
        <p className="mt-1 text-[11px] font-bold text-negative">{errors[key]?.message}</p>
      )}
    </div>
  );

  // نمودار تاریخچه نرخ
  const fxChartData = {
    labels: fx.history.map((h) => fmtTime(h.t)),
    datasets: [
      {
        label: 'نرخ',
        data: fx.history.map((h) => h.rate),
        borderColor: 'rgb(15 118 110)',
        backgroundColor: 'rgba(15,118,110,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true
      }
    ]
  };
  const fxOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        callbacks: {
          label: (ctx) => ` نرخ: ${fmtIntLatin(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 9 } } },
      y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { font: { size: 9 } } }
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('settingsTitle')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* نرخ ارز (fx_rates) */}
        <section className="space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
            <Save className="h-3.5 w-3.5 text-accent" />
            {t('fxRateTitle')}
          </h3>
          <p className="text-[11px] font-medium text-muted">{t('fxRateHint')}</p>
          <div className="flex items-center gap-2">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={fxInput}
              onChange={(e) => setFxInput(e.target.value)}
              className="h-10 flex-1 text-start text-xs"
              aria-label={t('fxRateInput')}
            />
            <Button size="sm" onClick={saveFx} type="button">
              <Save className="h-3.5 w-3.5" />
              {t('fxRateSave')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => {
                setFxInput(String(DEFAULT_IRR_RATE));
                void fx.setRate(DEFAULT_IRR_RATE);
                toast('info', t('fxRateSaved'));
              }}
              aria-label={t('fxRateReset')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          {fx.updatedAt && (
            <p className="text-[11px] font-bold text-muted">
              {t('fxLastUpdate')}: {fmtTime(fx.updatedAt)}
            </p>
          )}
          {fx.history.length > 1 && (
            <div className="glass-inset rounded-xl p-3">
              <p className="mb-2 text-[11px] font-bold text-muted">{t('fxHistoryTitle')}</p>
              <div className="h-28">
                <Line data={fxChartData} options={fxOptions} />
              </div>
            </div>
          )}
        </section>

        {/* موقعیت اتریوم */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-extrabold text-ink">{t('scenarioEthTitle')}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {field(t('ethAmountLabel'), 'ethAmount')}
            {field(t('ethBuyPriceLabel'), 'ethBuyPrice')}
            {field(t('ethInitialLabel'), 'ethInitialInvestment')}
            {field(t('usdcLabel'), 'usdcAllocation2026')}
          </div>
        </section>

        {/* سرمایه پایه */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-extrabold text-ink">{t('scenarioBaseTitle')}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {field(t('base2025Label'), 'baseCapital2025')}
            {field(t('base2026Label'), 'baseCapital2026')}
            <p className="text-[9px] font-medium leading-4 text-muted/70">
              با فعال بودن حسابداری، موجودی نقد واقعی (Cash Balance) مبنای شبیه‌سازی‌هاست —
              این مقادیر فقط فالبک هستند.
            </p>
            {field(t('ethRef2026Label'), 'ethRefJuly2026')}
          </div>
        </section>

        {/* کلیدهای API — چند کلید برای افزایش سهمیه روزانه */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
            <KeyRound className="h-3.5 w-3.5 text-accent" />
            {t('apiKeysLabel')}
          </h3>
          <Input
            dir="ltr"
            placeholder="WZK7..., KEY2, KEY3"
            value={keysInput}
            onChange={(e) => setKeysInput(e.target.value)}
            className="h-10 text-start text-xs"
            aria-label={t('apiKeysLabel')}
          />
          <p className="text-[11px] font-medium text-muted">{t('avBudgetHint')}</p>

          {/* مصرف امروز هر کلید */}
          <div className="glass-inset space-y-1.5 rounded-2xl p-3">
            {effectiveApiKeys(useSettingsStore.getState().apiKeys).map((k) => {
              const used = avBudget.usedToday(k);
              const left = Math.max(0, 22 - used);
              return (
                <div key={k} className="flex items-center justify-between text-[11px] font-bold">
                  <span dir="ltr" className="truncate text-muted">
                    {k.slice(0, 10)}…
                  </span>
                  <span
                    className={cn(
                      'num-ltr',
                      left <= 0 ? 'text-negative' : left < 10 ? 'text-warn' : 'text-ink'
                    )}
                  >
                    {used}/22
                  </span>
                </div>
              );
            })}
            <p className="num-ltr border-t border-line/10 pt-1.5 text-[11px] font-extrabold text-ink">
              {t('avBudgetLabel')}: {avBudgetInfo().used} / {avBudgetInfo().budget}
            </p>
          </div>
        </section>

        {/* کش */}
        <section className="flex items-center justify-between rounded-2xl glass-inset p-3">
          <div>
            <p className="text-[11px] font-bold text-ink">{t('settingsCacheTitle')}</p>
            <p className="text-[11px] text-muted">
              {storage.persistent ? 'IndexedDB / LocalStorage' : 'In-memory (پیش‌نمایش)'}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => (confirmClear ? void clearCache() : setConfirmClear(true))}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmClear ? t('clearCacheConfirm') : t('clearCache')}
          </Button>
        </section>

        <Button size="lg" className="w-full" type="submit" disabled={isSubmitting}>
          {saved ? (
            <>
              <Check className="h-4 w-4" /> {t('savedToast')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </form>
    </Sheet>
  );
}
