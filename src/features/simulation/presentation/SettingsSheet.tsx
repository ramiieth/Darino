/**
 * شیت تنظیمات و سناریوی سفارشی — React Hook Form + Zod
 * + نمایش نرخ زنده تتر (تنها مبنای دلار؛ نرخ دستی وجود ندارد)
 * + پاک‌سازی کش با تأیید دومرحله‌ای
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, KeyRound, Check } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { KeyValueList } from '@/shared/components/ui/FinancialValue';
import { useSettingsStore, effectiveApiKeys } from '@/shared/store/settingsStore';
import { useMarketStore } from '@/shared/store/marketStore';
import { useUsdRate } from '@/shared/store/usdtStore';
import { UsdtRateField } from '@/shared/components/ui/UsdtRateField';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useAvBudgetStore } from '@/shared/store/avBudgetStore';
import { avBudgetInfo } from '@/shared/lib/alphavantage';
import { cacheClearPrices } from '@/shared/lib/db';
import { toast } from '@/shared/store/toastStore';
import { t } from '@/shared/i18n/fa';
import { storage } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';

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
  const usdRate = useUsdRate();
  const avBudget = useAvBudgetStore();
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
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
      void avBudget.hydrate();
      setSaved(false);
      setConfirmClear(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hydrate, avBudget.hydrate, reset]);

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
    // کلیدها با کاما جدا می‌شوند — از فیلد کنترل‌شده (فیلد فرم ثبت نشده بود و ویرایش ذخیره نمی‌شد)
    const keys = (keysInput ?? '')
      .split(/[,،]/)
      .map((k) => k.trim())
      .filter(Boolean);
    await saveApiKeys(keys);
    setKeysInput(keys.join(', '));
    setSaved(true);
    toast('success', t('savedToast'));
    setTimeout(() => setSaved(false), 2000);
  };

  const clearCache = async () => {
    await cacheClearPrices();
    useMarketStore.setState({ quotes: {}, lastCycleAt: null });
    setConfirmClear(false);
    toast('success', t('cacheCleared'));
  };

  const field = (label: string, key: keyof ScenarioForm, suffix?: string) => (
    <Field label={label} error={errors[key]?.message as string | undefined}>
      <Input type="number" step="any" inputMode="decimal" dir="ltr" placeholder="0.00" suffix={suffix} {...register(key)} />
    </Field>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('settingsTitle')}
      variant="panel"
      footer={
        <Button size="lg" className="w-full" type="submit" form="settings-form" loading={isSubmitting} icon={saved ? <Check /> : undefined}>
          {saved ? t('savedToast') : t('save')}
        </Button>
      }
    >
      <form id="settings-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-2">
        {/* نرخ دلار — فقط تتر زنده (والکس/بیت‌پین)؛ نرخ دستی وجود ندارد */}
        <section className="space-y-3" aria-labelledby="fx-title">
          <div>
            <h3 id="fx-title" className="text-sm font-bold text-ink">نرخ دلار (تتر زنده)</h3>
            <p className="text-xs text-muted">ارزش‌گذاری دلار در کل اپ با نرخ لحظه‌ای تتر از والکس یا بیت‌پین — هر دقیقه به‌روز می‌شود.</p>
          </div>
          <UsdtRateField effective={usdRate} />
        </section>

        {/* ETH position */}
        <section className="space-y-3" aria-labelledby="eth-title">
          <h3 id="eth-title" className="text-sm font-bold text-ink">{t('scenarioEthTitle')}</h3>
          <div className="grid grid-cols-2 gap-4">
            {field(t('ethAmountLabel'), 'ethAmount', 'ETH')}
            {field(t('ethBuyPriceLabel'), 'ethBuyPrice', '$')}
            {field(t('ethInitialLabel'), 'ethInitialInvestment', '$')}
            {field(t('usdcLabel'), 'usdcAllocation2026', '$')}
          </div>
        </section>

        {/* base capital */}
        <section className="space-y-3" aria-labelledby="base-title">
          <div>
            <h3 id="base-title" className="text-sm font-bold text-ink">{t('scenarioBaseTitle')}</h3>
            <p className="text-xs text-muted">
              با فعال بودن حسابداری، موجودی نقد واقعی مبنای شبیه‌سازی‌هاست — این مقادیر فقط جایگزین هستند.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field(t('base2025Label'), 'baseCapital2025', '$')}
            {field(t('base2026Label'), 'baseCapital2026', '$')}
            {field(t('ethRef2026Label'), 'ethRefJuly2026', '$')}
          </div>
        </section>

        {/* API keys */}
        <section className="space-y-3" aria-labelledby="keys-title">
          <h3 id="keys-title" className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <KeyRound aria-hidden className="h-4 w-4 text-muted" />
            {t('apiKeysLabel')}
          </h3>
          <Field label="کلیدها (با کاما جدا کنید)" hint={t('avBudgetHint')}>
            <Input dir="ltr" placeholder="WZK7..., KEY2, KEY3" value={keysInput} onChange={(e) => setKeysInput(e.target.value)} />
          </Field>
          <div className="rounded-field border border-divider px-3">
            <KeyValueList
              dense
              rows={[
                ...effectiveApiKeys(useSettingsStore.getState().apiKeys).map((k) => {
                  const used = avBudget.usedToday(k);
                  const left = Math.max(0, 22 - used);
                  return {
                    label: <bdi dir="ltr" className="font-mono">{k.slice(0, 10)}…</bdi>,
                    value: (
                      <span className={cn('num-ltr', left <= 0 ? 'text-negative' : left < 10 ? 'text-warn' : 'text-ink')}>
                        {used}/22
                      </span>
                    )
                  };
                }),
                {
                  label: t('avBudgetLabel'),
                  emphasis: true,
                  value: (
                    <span className="num-ltr">
                      {avBudgetInfo().used} / {avBudgetInfo().budget}
                    </span>
                  )
                }
              ]}
            />
          </div>
        </section>

        {/* cache */}
        <section className="flex items-center justify-between gap-3 rounded-field border border-divider p-3" aria-label={t('settingsCacheTitle')}>
          <div>
            <p className="text-sm font-semibold text-ink">{t('settingsCacheTitle')}</p>
            <p className="text-xs text-muted">{storage.persistent ? 'IndexedDB / LocalStorage' : 'حافظه موقت (پیش‌نمایش)'}</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            icon={<Trash2 />}
            onClick={() => (confirmClear ? void clearCache() : setConfirmClear(true))}
            type="button"
          >
            {confirmClear ? t('clearCacheConfirm') : t('clearCache')}
          </Button>
        </section>
      </form>
    </Sheet>
  );
}
