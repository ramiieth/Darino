/**
 * پنل یکپارچه «اتصال به کیف پول و بهای تمام‌شده داشبورد + محاسبه میانگین خرید جدید و پله‌های DCA»
 *
 * این کامپوننت داخل تب‌های موجود ماشین‌حساب («سود و زیان» و «خرید دوره‌ای») قرار می‌گیرد
 * تا بدون ایجاد منو یا صفحه تکراری:
 *   ۱) دارایی‌های موجود در کیف پول‌های متصل و بخش «بهای خرید و سود و زیان» داشبورد (مثل اتریوم ۳.۳۳ واحد روی ۲,۸۲۰ دلار) را استخراج کند
 *   ۲) با یک کلیک، موجودی و میانگین خرید فعلی کاربر را وارد ماشین‌حساب کند
 *   ۳) نشان دهد اگر کاربر خرید جدیدی (تک‌پله‌ای یا پله‌ای DCA روی ریزش) انجام دهد، «میانگین خرید جدید» او دقیقاً چند دلار می‌شود، چقدر به نقطه سربه‌سر نزدیک‌تر می‌شود و در صورت برگشت قیمت به میانگین قبلی چقدر سود می‌کند
 *   ۴) حل‌کننده معکوس: «چقدر باید بخرم تا میانگین خریدم به عدد دلخواه X برسد؟»
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  Calculator,
  CheckCircle2,
  Coins,
  Layers,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { useWalletAndCostBridge } from '@/features/performance/data/useWalletAndCostBridge';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import {
  buildWalletCostHoldingPresets,
  simulateWalletAverageDown,
  solveRequiredBuyForTargetAverage,
  type NewBuyStepInput,
  type WalletCostHoldingPreset
} from '../domain/walletDcaAverageSimulator';

interface EditableStep {
  id: number;
  labelFa: string;
  amountStr: string;
  priceStr: string;
}

const parseNum = (s: string, fallback = 0): number => {
  const n = Number(toEnDigits(s).replace(/[,٫]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const RLI = '\u2067';
const LRI = '\u2066';
const PDI = '\u2069';

const fmtUsdFa = (val: number | null | undefined, signed = false): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  const str =
    abs >= 1000
      ? Math.round(abs).toLocaleString('en-US')
      : abs >= 1
      ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : abs.toPrecision(4);
  const prefix = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return `${RLI}${LRI}${prefix}${toFaDigits(str)}${PDI} دلار${PDI}`;
};

const fmtPctFa = (val: number | null | undefined, digits = 1, signed = true): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  const prefix = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return `${LRI}${prefix}${toFaDigits(abs.toFixed(digits))}٪${PDI}`;
};

export function WalletAverageDownPanel({
  onSelectHoldingForParent
}: {
  /** همگام‌سازی اختیاری با فرم والد در PnlCalculator یا DcaCalculator */
  onSelectHoldingForParent?: (preset: {
    symbol: string;
    quantity: number;
    avgCostUsd: number;
    newAverageCostUsd: number;
    totalQuantityAfterNewBuy: number;
  }) => void;
}) {
  const walletBridge = useWalletAndCostBridge();
  const { prices: livePrices } = useCalculatorPrices();

  const presets = useMemo(
    () => buildWalletCostHoldingPresets(walletBridge.costBasis.rows, livePrices),
    [walletBridge.costBasis.rows, livePrices]
  );

  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => presets[0]?.id ?? 'dashboard:ETH:base');
  const activePreset: WalletCostHoldingPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? presets[0],
    [presets, selectedPresetId]
  );

  // ۱) وضعیت فعلی دارایی (قابل ویرایش دستی یا پرشده خودکار از کیف پول/داشبورد)
  const [existingQtyStr, setExistingQtyStr] = useState<string>(() => String(activePreset?.currentQuantity ?? 3.33));
  const [existingAvgStr, setExistingAvgStr] = useState<string>(() => String(activePreset?.avgCostUsd ?? 2820));
  const [marketPriceStr, setMarketPriceStr] = useState<string>(() =>
    String(activePreset?.currentPriceUsd ?? livePrices[activePreset?.symbol ?? 'ETH'] ?? 1895)
  );

  // ۲) حالت خرید جدید: تک‌خرید سریع یا پله‌های DCA روی ریزش
  const [buyMode, setBuyMode] = useState<'single_buy' | 'dca_ladder' | 'target_avg_solver'>('single_buy');

  // ورودی تک‌خرید سریع
  const [singleBuyUsdStr, setSingleBuyUsdStr] = useState<string>('1000');
  const [singleBuyPriceStr, setSingleBuyPriceStr] = useState<string>('');

  // ورودی پله‌های DCA (مثلاً پله ۱ روی قیمت فعلی، پله ۲ روی ۱۸۲۹، پله ۳ روی ۱۷۲۹)
  const [ladderSteps, setLadderSteps] = useState<EditableStep[]>([
    { id: 1, labelFa: 'خرید پله ۱ (قیمت فعلی یا لیمیت اول)', amountStr: '1000', priceStr: '1829' },
    { id: 2, labelFa: 'خرید پله ۲ (ریزش بیشتر)', amountStr: '1000', priceStr: '1729' },
    { id: 3, labelFa: 'خرید پله ۳ (شکار کف)', amountStr: '1000', priceStr: '1629' }
  ]);

  // ورودی حل‌کننده میانگین هدف
  const [targetAvgCostStr, setTargetAvgCostStr] = useState<string>('2300');

  // همگام‌سازی خودکار هنگام تغییر دارایی انتخابی از کیف پول / داشبورد
  const handleSelectPreset = (p: WalletCostHoldingPreset) => {
    setSelectedPresetId(p.id);
    setExistingQtyStr(String(p.currentQuantity));
    setExistingAvgStr(String(p.avgCostUsd));
    const mkt = p.currentPriceUsd ?? livePrices[p.symbol] ?? p.avgCostUsd;
    setMarketPriceStr(String(mkt));
    setSingleBuyPriceStr(String(mkt));

    // کالیبره کردن پله‌های پیش‌فرض DCA بر اساس قیمت فعلی آن دارایی
    if (p.symbol === 'ETH' && mkt >= 1500 && mkt <= 2200) {
      setLadderSteps([
        { id: 1, labelFa: 'پله ۱ (اصلاح اول)', amountStr: '1000', priceStr: '1829' },
        { id: 2, labelFa: 'پله ۲ (اصلاح دوم)', amountStr: '1000', priceStr: '1729' },
        { id: 3, labelFa: 'پله ۳ (اصلاح سوم)', amountStr: '1000', priceStr: '1629' }
      ]);
      setTargetAvgCostStr('2300');
    } else {
      const p1 = Number((mkt * 0.96).toPrecision(4));
      const p2 = Number((mkt * 0.91).toPrecision(4));
      const p3 = Number((mkt * 0.86).toPrecision(4));
      setLadderSteps([
        { id: 1, labelFa: 'پله ۱ (-۴٪ از قیمت فعلی)', amountStr: '1000', priceStr: String(p1) },
        { id: 2, labelFa: 'پله ۲ (-۹٪ از قیمت فعلی)', amountStr: '1000', priceStr: String(p2) },
        { id: 3, labelFa: 'پله ۳ (-۱۴٪ از قیمت فعلی)', amountStr: '1000', priceStr: String(p3) }
      ]);
      setTargetAvgCostStr(String(Number(((p.avgCostUsd + mkt) / 2).toPrecision(4))));
    }
  };

  useEffect(() => {
    if (activePreset && !singleBuyPriceStr) {
      const mkt = activePreset.currentPriceUsd ?? livePrices[activePreset.symbol] ?? 1895;
      setMarketPriceStr(String(mkt));
      setSingleBuyPriceStr(String(mkt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreset?.id]);

  const existingQty = parseNum(existingQtyStr, activePreset?.currentQuantity ?? 3.33);
  const existingAvg = parseNum(existingAvgStr, activePreset?.avgCostUsd ?? 2820);
  const marketPrice = parseNum(
    marketPriceStr,
    activePreset?.currentPriceUsd ?? livePrices[activePreset?.symbol ?? 'ETH'] ?? 1895
  );
  const singleBuyPrice = parseNum(singleBuyPriceStr, marketPrice);

  const activeSteps: NewBuyStepInput[] = useMemo(() => {
    if (buyMode === 'single_buy') {
      return [
        {
          stepIndex: 1,
          labelFa: 'خرید جدید تک‌پله‌ای',
          buyAmountUsd: parseNum(singleBuyUsdStr, 1000),
          buyPriceUsd: singleBuyPrice > 0 ? singleBuyPrice : marketPrice
        }
      ];
    }
    if (buyMode === 'dca_ladder') {
      return ladderSteps.map((s, idx) => ({
        stepIndex: idx + 1,
        labelFa: s.labelFa || `پله ${toFaDigits(idx + 1)}`,
        buyAmountUsd: parseNum(s.amountStr, 0),
        buyPriceUsd: parseNum(s.priceStr, marketPrice)
      }));
    }
    // در حالت target_avg_solver، اگر حل‌کننده مبلغی پیدا کرده باشد آن را شبیه‌سازی می‌کنیم
    const solved = solveRequiredBuyForTargetAverage({
      existingQuantity: existingQty,
      existingAvgCostUsd: existingAvg,
      buyPriceUsd: singleBuyPrice > 0 ? singleBuyPrice : marketPrice,
      targetAvgCostUsd: parseNum(targetAvgCostStr, existingAvg * 0.85)
    });
    return [
      {
        stepIndex: 1,
        labelFa: 'خرید لازم برای رسیدن به میانگین هدف',
        buyAmountUsd: solved.possible && solved.requiredBuyUsd ? solved.requiredBuyUsd : 0,
        buyPriceUsd: singleBuyPrice > 0 ? singleBuyPrice : marketPrice
      }
    ];
  }, [
    buyMode,
    singleBuyUsdStr,
    singleBuyPrice,
    marketPrice,
    ladderSteps,
    existingQty,
    existingAvg,
    targetAvgCostStr
  ]);

  const sim = useMemo(
    () =>
      simulateWalletAverageDown({
        symbol: activePreset?.symbol ?? 'ETH',
        nameFa: activePreset?.nameFa ?? 'اتریوم',
        existingQuantity: existingQty,
        existingAvgCostUsd: existingAvg,
        currentMarketPriceUsd: marketPrice,
        steps: activeSteps
      }),
    [activePreset, existingQty, existingAvg, marketPrice, activeSteps]
  );

  const targetSolverResult = useMemo(
    () =>
      solveRequiredBuyForTargetAverage({
        existingQuantity: existingQty,
        existingAvgCostUsd: existingAvg,
        buyPriceUsd: singleBuyPrice > 0 ? singleBuyPrice : marketPrice,
        targetAvgCostUsd: parseNum(targetAvgCostStr, existingAvg * 0.85)
      }),
    [existingQty, existingAvg, singleBuyPrice, marketPrice, targetAvgCostStr]
  );

  return (
    <Surface className="border border-accent/35 bg-gradient-to-bl from-accent/10 via-surface-2/35 to-transparent p-4 sm:p-5 space-y-4">
      {/* ۱) هدر و انتخاب سریع دارایی از کیف پول‌های متصل و بهای خرید داشبورد */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Wallet className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-extrabold text-ink sm:text-base">
              شبیه‌ساز میانگین کم کردن (DCA) و خرید جدید روی دارایی‌های کیف پول و داشبورد
            </h3>
            <Badge tone="info">متصل به بهای تمام‌شده داشبورد</Badge>
          </div>
          <p className="text-xs leading-6 text-muted">
            دارایی خود را از کیف پول‌های متصل یا بهای ثبت‌شده داشبورد (مثل اتریوم خریداری‌شده روی ۲,۸۲۰ دلار) انتخاب کنید تا ببینید با هر خرید جدید، <strong>میانگین قیمت خرید جدید شما</strong> دقیقاً چند دلار می‌شود.
          </p>
        </div>

        {onSelectHoldingForParent && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onSelectHoldingForParent({
                symbol: sim.symbol,
                quantity: sim.afterNewBuys.totalQuantity,
                avgCostUsd: sim.existing.avgCostUsd,
                newAverageCostUsd: sim.afterNewBuys.newAverageCostUsd,
                totalQuantityAfterNewBuy: sim.afterNewBuys.totalQuantity
              })
            }
          >
            انتقال میانگین جدید به فرم پایین
          </Button>
        )}
      </div>

      {/* لیست چیپ‌های دارایی‌های موجود در کیف پول / داشبورد */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-muted">
          انتخاب دارایی از کیف پول‌ها و جدول «بهای خرید و سود و زیان» داشبورد:
        </span>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {presets.map((p) => {
            const active = p.id === activePreset?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-card border px-3 py-2 text-start transition-all',
                  active
                    ? 'border-accent bg-card shadow-sm ring-1 ring-accent'
                    : 'border-divider bg-card/70 hover:bg-card'
                )}
              >
                <MarketAssetLogo symbol={p.symbol} size={28} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-ink">{p.nameFa}</span>
                    <span className="font-mono text-[11px] font-bold text-muted" dir="ltr">
                      ({p.symbol})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted">
                    موجودی: <strong className="text-ink">{toFaDigits(p.currentQuantity)}</strong> · میانگین خرید:{' '}
                    <strong className="text-accent">{fmtUsdFa(p.avgCostUsd)}</strong>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ۲) وضعیت فعلی دارایی در کیف پول (قابل ویرایش) */}
      <div className="grid grid-cols-1 gap-3 rounded-card border border-divider bg-card/90 p-3.5 sm:grid-cols-3">
        <Field label={`موجودی فعلی شما (${sim.symbol})`}>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={existingQtyStr}
            onChange={(e) => setExistingQtyStr(e.target.value)}
            suffix={sim.symbol}
          />
        </Field>
        <Field label="میانگین قیمت خرید فعلی در داشبورد (دلار)">
          <Input
            dir="ltr"
            inputMode="decimal"
            value={existingAvgStr}
            onChange={(e) => setExistingAvgStr(e.target.value)}
            suffix="دلار"
          />
        </Field>
        <Field label="قیمت لحظه‌ای بازار (دلار)">
          <Input
            dir="ltr"
            inputMode="decimal"
            value={marketPriceStr}
            onChange={(e) => setMarketPriceStr(e.target.value)}
            suffix="دلار"
          />
        </Field>
      </div>

      {/* ۳) سوییچ ۳ حالت شبیه‌سازی خرید جدید */}
      <div className="space-y-3">
        <SegmentedControl<'single_buy' | 'dca_ladder' | 'target_avg_solver'>
          label="روش شبیه‌سازی خرید جدید"
          fill
          value={buyMode}
          onChange={setBuyMode}
          options={[
            { value: 'single_buy', label: '۱. خرید جدید تک‌پله‌ای' },
            { value: 'dca_ladder', label: '۲. خرید پله‌ای DCA روی ریزش قیمت' },
            { value: 'target_avg_solver', label: '۳. رسیدن به میانگین قیمت هدف' }
          ]}
        />

        {buyMode === 'single_buy' && (
          <div className="grid grid-cols-1 gap-3 rounded-card border border-divider bg-card/85 p-3.5 sm:grid-cols-2">
            <div className="space-y-2">
              <Field label="مبلغ خرید جدید (دلار)">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={singleBuyUsdStr}
                  onChange={(e) => setSingleBuyUsdStr(e.target.value)}
                  suffix="دلار"
                />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {[500, 1000, 2000, 3000, 5000, 10000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSingleBuyUsdStr(String(amt))}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                      parseNum(singleBuyUsdStr) === amt
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-divider bg-surface-2 text-muted hover:text-ink'
                    )}
                  >
                    {toFaDigits(amt.toLocaleString('en-US'))} دلار
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Field label="در چه قیمتی می‌خواهید بخرید؟ (دلار)">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={singleBuyPriceStr}
                  onChange={(e) => setSingleBuyPriceStr(e.target.value)}
                  suffix="دلار"
                />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSingleBuyPriceStr(String(marketPrice))}
                  className="rounded-full border border-divider bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-muted hover:text-ink"
                >
                  قیمت فعلی ({toFaDigits(marketPrice)})
                </button>
                {sim.symbol === 'ETH' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSingleBuyPriceStr('1829')}
                      className="rounded-full border border-divider bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-muted hover:text-ink"
                    >
                      پله ۱,۸۲۹ دلار
                    </button>
                    <button
                      type="button"
                      onClick={() => setSingleBuyPriceStr('1729')}
                      className="rounded-full border border-divider bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-muted hover:text-ink"
                    >
                      پله ۱,۷۲۹ دلار
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {buyMode === 'dca_ladder' && (
          <div className="space-y-2.5 rounded-card border border-divider bg-card/85 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-ink">
                پله‌های خرید DCA روی قیمت‌های پایین‌تر (هر پله که پر شود میانگین شما مرحله‌به‌مرحله کمتر می‌شود):
              </p>
              <Button
                size="sm"
                variant="outline"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() =>
                  setLadderSteps((prev) => [
                    ...prev,
                    {
                      id: Date.now(),
                      labelFa: `پله ${toFaDigits(prev.length + 1)}`,
                      amountStr: '1000',
                      priceStr: String(Math.round(marketPrice * 0.85))
                    }
                  ])
                }
              >
                افزودن پله جدید
              </Button>
            </div>

            <div className="space-y-2">
              {ladderSteps.map((st, i) => (
                <div
                  key={st.id}
                  className="grid grid-cols-1 items-end gap-2 rounded-field border border-divider/60 bg-surface-2/40 p-2.5 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Field label={`مبلغ خرید پله ${toFaDigits(i + 1)} (دلار)`}>
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={st.amountStr}
                      onChange={(e) =>
                        setLadderSteps((l) =>
                          l.map((x) => (x.id === st.id ? { ...x, amountStr: e.target.value } : x))
                        )
                      }
                      suffix="دلار"
                    />
                  </Field>
                  <Field label={`قیمت ورود پله ${toFaDigits(i + 1)} (دلار)`}>
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={st.priceStr}
                      onChange={(e) =>
                        setLadderSteps((l) =>
                          l.map((x) => (x.id === st.id ? { ...x, priceStr: e.target.value } : x))
                        )
                      }
                      suffix="دلار"
                    />
                  </Field>
                  {ladderSteps.length > 1 && (
                    <IconButton
                      size="sm"
                      aria-label={`حذف پله ${i + 1}`}
                      onClick={() => setLadderSteps((l) => l.filter((x) => x.id !== st.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {buyMode === 'target_avg_solver' && (
          <div className="grid grid-cols-1 gap-3 rounded-card border border-divider bg-card/85 p-3.5 sm:grid-cols-2">
            <Field label="می‌خواهید میانگین خریدتان به چند دلار برسد؟ (میانگین هدف)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={targetAvgCostStr}
                onChange={(e) => setTargetAvgCostStr(e.target.value)}
                suffix="دلار"
              />
            </Field>
            <Field label="در چه قیمتی می‌خواهید این خرید را انجام دهید؟ (دلار)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={singleBuyPriceStr}
                onChange={(e) => setSingleBuyPriceStr(e.target.value)}
                suffix="دلار"
              />
            </Field>
            <div className="sm:col-span-2 rounded-field border border-accent/30 bg-accent-soft/25 px-3.5 py-2.5 text-xs leading-6 text-ink">
              <strong>نتیجه محاسبه معکوس: </strong>
              {toFaDigits(targetSolverResult.reasonFa)}
            </div>
          </div>
        )}
      </div>

      {/* ۴) مقایسه درشت و شفاف: «قبل از خرید جدید» در برابر «بعد از خرید جدید (میانگین جدید)» */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* کارت وضعیت فعلی در داشبورد */}
        <div className="rounded-card border border-divider bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-muted">وضعیت فعلی شما در داشبورد (قبل از خرید جدید)</span>
            <Badge tone="neutral">{toFaDigits(sim.existing.quantity)} {sim.symbol}</Badge>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="block text-[11px] text-muted">میانگین خرید فعلی:</span>
              <span className="text-xl font-extrabold text-ink">{fmtUsdFa(sim.existing.avgCostUsd)}</span>
            </div>
            <div className="text-end">
              <span className="block text-[11px] text-muted">سود / زیان باز فعلی:</span>
              <span
                className={cn(
                  'text-sm font-extrabold',
                  sim.existing.unrealizedPnlUsd >= 0 ? 'text-positive' : 'text-negative'
                )}
              >
                {fmtUsdFa(sim.existing.unrealizedPnlUsd, true)} ({fmtPctFa(sim.existing.unrealizedPnlPct, 1)})
              </span>
            </div>
          </div>
          <p className="text-xs text-muted">
            بهای تمام‌شده قبلی: <strong>{fmtUsdFa(sim.existing.totalBasisUsd)}</strong> · رشد لازم تا سربه‌سر شدن:{' '}
            <strong className="text-ink">{fmtPctFa(sim.existing.requiredBounceToBreakEvenPct, 1)}</strong>
          </p>
        </div>

        {/* کارت وضعیت جدید پس از خرید */}
        <div className="rounded-card border-2 border-accent bg-card p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-accent">
              وضعیت پس از خرید جدید ({fmtUsdFa(sim.afterNewBuys.addedAmountUsd, true)})
            </span>
            <Badge tone="gain">
              موجودی جدید: {toFaDigits(sim.afterNewBuys.totalQuantity.toFixed(4))} {sim.symbol}
            </Badge>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="block text-[11px] text-muted">میانگین قیمت خرید جدید شما:</span>
              <span className="text-2xl font-extrabold text-positive">
                {fmtUsdFa(sim.afterNewBuys.newAverageCostUsd)}
              </span>
            </div>
            <div className="text-end">
              <span className="block text-[11px] text-muted">کاهش میانگین خرید:</span>
              <span className="text-sm font-extrabold text-positive">
                {fmtUsdFa(sim.afterNewBuys.avgCostChangeUsd, true)} ({fmtPctFa(sim.afterNewBuys.avgCostChangePct, 1)})
              </span>
            </div>
          </div>

          <p className="text-xs leading-6 text-muted">
            رشد لازم تا نقطه سربه‌سر جدید از{' '}
            <strong>{fmtPctFa(sim.existing.requiredBounceToBreakEvenPct, 1, false)}</strong> به{' '}
            <strong className="text-positive">
              {fmtPctFa(sim.afterNewBuys.requiredBounceToBreakEvenPct, 1, false)}
            </strong>{' '}
            کاهش یافت! اگر قیمت فقط به همان میانگین قبلی ({fmtUsdFa(sim.existing.avgCostUsd)}) برگردد، شما{' '}
            <strong className="text-positive">{fmtUsdFa(sim.afterNewBuys.profitIfReachesOldAvgCostUsd, true)}</strong> در سود خالص خواهید بود.
          </p>
        </div>
      </div>

      {/* ۵) جدول پله‌به‌پله میانگین خرید جدید (برای حالت پله‌ای DCA یا تک‌خرید) */}
      {sim.stepByStep.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-divider bg-card p-3">
          <p className="mb-2 text-xs font-extrabold text-ink">
            جدول تغییر پله‌به‌پله میانگین خرید شما پس از پر شدن هر پله:
          </p>
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-divider text-muted">
                <th className="pb-2">پله خرید</th>
                <th className="pb-2">مبلغ این پله</th>
                <th className="pb-2">قیمت ورود پله</th>
                <th className="pb-2">واحد اضافه‌شده</th>
                <th className="pb-2">کل موجودی جدید</th>
                <th className="pb-2">میانگین خرید جدید</th>
                <th className="pb-2">کاهش میانگین نسبت به {toFaDigits(sim.existing.avgCostUsd)}$</th>
                <th className="pb-2">فاصله تا سربه‌سر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/60">
              {sim.stepByStep.map((st) => (
                <tr key={st.stepIndex}>
                  <td className="py-2 font-bold text-ink">{toFaDigits(st.labelFa)}</td>
                  <td className="py-2 font-bold text-ink">{fmtUsdFa(st.stepAmountUsd)}</td>
                  <td className="py-2 font-bold text-accent">{fmtUsdFa(st.stepPriceUsd)}</td>
                  <td className="py-2 text-muted">
                    <bdi dir="ltr" className="num-ltr">+{toFaDigits(st.stepUnitsAdded.toFixed(4))}</bdi> {sim.symbol}
                  </td>
                  <td className="py-2 font-bold text-ink">
                    {toFaDigits(st.cumulativeQuantity.toFixed(4))} {sim.symbol}
                  </td>
                  <td className="py-2 font-extrabold text-positive">{fmtUsdFa(st.newAverageCostUsd)}</td>
                  <td className="py-2 font-bold text-positive">
                    {toFaDigits(st.avgCostDropUsd)} دلار کمتر (<bdi dir="ltr" className="num-ltr">-{toFaDigits(st.avgCostDropPct.toFixed(1))}٪</bdi>)
                  </td>
                  <td className="py-2 font-semibold text-ink">
                    <bdi dir="ltr" className="num-ltr">+{toFaDigits(st.requiredBounceToBreakEvenPct.toFixed(1))}٪</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Surface>
  );
}
