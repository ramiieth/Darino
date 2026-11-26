/**
 * ماژول بازطراحی‌شده «سبد DCA متصل به کیف پول، آزمون استرس بدترین سناریوها و کمیته ایجنت‌ها»
 *
 * ویژگی‌ها:
 *   ۱) اتصال زنده به موجودی فعلی کیف پول و خریدهای اخیر (USDC، USDT، سایر استیبل‌ها و میانگین خرید فعلی هر ارز)
 *   ۲) تفکیک و قفل خودکار ۵,۰۰۰ تتر «ذخیره هزینه‌های زندگی» (خارج از DCA — هرگز وارد خرید نمی‌شود)
 *   ۳) انتخاب تک‌کلیکی رژیم پله‌های DCA: ریزش شدید (-۵۰٪) | ۲ سال بازار رنج (۲۴ ماهه) | پله‌ای متعادل
 *   ۴) جدول آزمون استرس ۴ سناریو (ریزش شدید -۴۵٪، ۲ سال رنج ۲۴ ماهه، زمستان عمیق -۶۵٪، بازگشت تا هدف)
 *   ۵) حفظ کامل تمام امکانات قبلی: ویرایش/حذف/افزودن ارز، ویرایش پله‌ها، کمیته ۴ مرحله‌ای ایجنت‌ها و مقایسه XAUT/PAXG
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { useWalletAndCostBridge } from '@/features/performance/data/useWalletAndCostBridge';
import { RATING_FA } from '@/features/intel/domain/tradingAgents';
import { buttonClass } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import {
  DEFAULT_LIVING_RESERVE_USDT,
  GOLD_TOKEN_COMPARISON,
  PRESET_BASKET_CANDIDATES,
  buildInitialUserBasket,
  buildStepsForStressRegime,
  buildWalletSyncedBasket,
  createBasketAssetItem,
  simulatePortfolioBasketDcaAndCommittee,
  type BasketAssetItem,
  type ComputedBasketAssetRow,
  type DcaStressRegime,
  type StableSource
} from '../domain/portfolioBasketDcaCommittee';

const parseNum = (raw: string, fallback = 0): number => {
  const cleaned = toEnDigits(raw).replace(/[,٫\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

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
  return `${prefix}${toFaDigits(str)} دلار`;
};

const fmtPctFa = (val: number | null | undefined, digits = 1, signed = true): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  const prefix = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return `${prefix}${toFaDigits(abs.toFixed(digits))}٪`;
};

const REGIME_LABELS: Record<DcaStressRegime, { label: string; hint: string }> = {
  severe_crash: {
    label: 'ریزش شدید (-۵۰٪)',
    hint: '۴ پلهٔ تدافعی (-۱۰٪ تا -۵۰٪) با وزن سنگین‌تر در کف‌های بحران'
  },
  two_year_range: {
    label: '۲ سال رنج (۲۴ ماه)',
    hint: 'تقسیم کل بودجهٔ مازاد به ۲۴ قسط ماهانه در محدودهٔ ۰٪ تا -۳۰٪'
  },
  standard: {
    label: 'پله‌ای متعادل',
    hint: '۳ پلهٔ استاندارد روی حمایت‌های کوتاه‌مدت'
  }
};

export function PortfolioBasketDcaCommitteePanel() {
  const { prices: livePrices } = useCalculatorPrices();
  const walletBridge = useWalletAndCostBridge();

  // ۱) رژیم طراحی پله‌های DCA (پیش‌فرض: ریزش شدید برای آمادگی در بدترین حالت)
  const [regime, setRegime] = useState<DcaStressRegime>('severe_crash');

  // ۲) استیبل‌کوین‌ها، ذخیره قفل‌شدهٔ هزینه‌های زندگی (۵,۰۰۰ تتر) و ذخیره اضطراری سرمایه‌گذاری
  const [usdcStr, setUsdcStr] = useState<string>('17681');
  const [usdtStr, setUsdtStr] = useState<string>('5000');
  const [livingReserveStr, setLivingReserveStr] = useState<string>(String(DEFAULT_LIVING_RESERVE_USDT));
  const [dryPowderStr, setDryPowderStr] = useState<string>('3000');
  const [walletSynced, setWalletSynced] = useState<boolean>(false);
  const didInitialWalletSync = useRef(false);

  // ۳) لیست دارایی‌های سبد
  const [items, setItems] = useState<BasketAssetItem[]>(() =>
    buildInitialUserBasket(livePrices, true).map((it) => ({
      ...it,
      preferredStable: 'USDC',
      dcaSteps: buildStepsForStressRegime(it.symbol, it.currentPriceUsd, 'severe_crash')
    }))
  );

  // همگام‌سازی خودکار اولیه با موجودی واقعی کیف پول و خریدهای جدید (به محض بارگذاری کیف پول)
  useEffect(() => {
    if (didInitialWalletSync.current) return;
    if (walletBridge.connectedWalletsCount === 0 || walletBridge.costBasis.rows.length === 0) return;

    const synced = buildWalletSyncedBasket({
      rows: walletBridge.costBasis.rows,
      livePrices,
      regime
    });
    if (synced.totalStableUsd > 0 || synced.syncedHoldingsCount > 0) {
      didInitialWalletSync.current = true;
      setUsdcStr(String(Math.round(synced.usdcBalanceUsd)));
      setUsdtStr(String(Math.round(synced.usdtBalanceUsd)));
      const living = Math.min(DEFAULT_LIVING_RESERVE_USDT, Math.round(synced.totalStableUsd));
      setLivingReserveStr(String(living));
      const investable = Math.max(0, synced.totalStableUsd - living);
      setDryPowderStr(String(Math.round(investable * 0.15)));
      setItems(synced.items);
      setWalletSynced(true);
    }
  }, [walletBridge.connectedWalletsCount, walletBridge.costBasis.rows, livePrices, regime]);

  const handleManualWalletSync = () => {
    const synced = buildWalletSyncedBasket({
      rows: walletBridge.costBasis.rows,
      livePrices,
      regime
    });
    setUsdcStr(String(Math.round(synced.usdcBalanceUsd)));
    setUsdtStr(String(Math.round(synced.usdtBalanceUsd)));
    const living = DEFAULT_LIVING_RESERVE_USDT;
    setLivingReserveStr(String(living));
    const investable = Math.max(0, synced.totalStableUsd - living);
    setDryPowderStr(String(Math.round(investable * 0.15)));
    setItems(synced.items);
    setWalletSynced(true);
  };

  const handleChangeRegime = (next: DcaStressRegime) => {
    setRegime(next);
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        dcaSteps: buildStepsForStressRegime(it.symbol, it.currentPriceUsd, next)
      }))
    );
  };

  // ۴) افزودن رمزارز جدید
  const [customSymbol, setCustomSymbol] = useState<string>('');
  const [customNameFa, setCustomNameFa] = useState<string>('');
  const [customPriceStr, setCustomPriceStr] = useState<string>('');

  // ۵) باز و بسته بودن جزئیات هر دارایی
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>('BTC');

  const usdcBalance = parseNum(usdcStr, 0);
  const usdtBalance = parseNum(usdtStr, 0);
  const livingReserveUsd = parseNum(livingReserveStr, DEFAULT_LIVING_RESERVE_USDT);
  const dryPowderUsd = parseNum(dryPowderStr, 0);

  const summary = useMemo(
    () =>
      simulatePortfolioBasketDcaAndCommittee({
        usdcBalanceUsd: usdcBalance,
        usdtBalanceUsd: usdtBalance,
        livingReserveUsd,
        reserveDryPowderUsd: dryPowderUsd,
        items
      }),
    [usdcBalance, usdtBalance, livingReserveUsd, dryPowderUsd, items]
  );

  const existingSymbols = useMemo(() => new Set(items.map((i) => i.symbol.toUpperCase())), [items]);

  // ─── عملیات ویرایش، حذف و افزودن رمزارز در سبد ───────────────────────────

  const handleAddPresetCoin = (symbol: string) => {
    const up = symbol.toUpperCase();
    if (existingSymbols.has(up)) {
      setItems((prev) => prev.map((it) => (it.symbol === up ? { ...it, enabled: true } : it)));
      setExpandedSymbol(up);
      return;
    }
    const base = createBasketAssetItem(up, livePrices, { preferredStable: 'USDC' });
    base.dcaSteps = buildStepsForStressRegime(up, base.currentPriceUsd, regime);
    setItems((prev) => [...prev, base]);
    setExpandedSymbol(up);
  };

  const handleAddCustomCoin = () => {
    const sym = customSymbol.trim().toUpperCase();
    if (!sym) return;
    if (existingSymbols.has(sym)) {
      setExpandedSymbol(sym);
      return;
    }
    const px = parseNum(customPriceStr, livePrices[sym] ?? 100);
    const newItem = createBasketAssetItem(sym, livePrices, {
      nameFa: customNameFa.trim() || sym,
      currentPriceUsd: px,
      targetExitPriceUsd: Number((px * 1.45).toPrecision(4)),
      allocationPct: 10,
      preferredStable: 'USDC',
      dcaSteps: buildStepsForStressRegime(sym, px, regime)
    });
    setItems((prev) => [...prev, newItem]);
    setCustomSymbol('');
    setCustomNameFa('');
    setCustomPriceStr('');
    setExpandedSymbol(sym);
  };

  const handleRemoveAsset = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const handleUpdateAsset = (id: string, patch: Partial<BasketAssetItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const handleUpdateStep = (
    assetId: string,
    stepId: string,
    patch: Partial<{ labelFa: string; targetPriceUsd: number; weightPct: number; enabled: boolean }>
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id !== assetId
          ? it
          : { ...it, dcaSteps: it.dcaSteps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)) }
      )
    );
  };

  const handleAddStep = (item: BasketAssetItem) => {
    const lastStep = item.dcaSteps[item.dcaSteps.length - 1];
    const nextPx = lastStep
      ? Number((lastStep.targetPriceUsd * 0.88).toPrecision(4))
      : Number((item.currentPriceUsd * 0.85).toPrecision(4));
    const idx = item.dcaSteps.length + 1;
    handleUpdateAsset(item.id, {
      dcaSteps: [
        ...item.dcaSteps,
        {
          id: `${item.symbol}-step-${Date.now()}`,
          labelFa: `پله ${toFaDigits(idx)} (کف عمیق‌تر)`,
          dropPctFromCurrent: Number((((nextPx - item.currentPriceUsd) / item.currentPriceUsd) * 100).toFixed(1)),
          targetPriceUsd: nextPx,
          weightPct: 20,
          enabled: true
        }
      ]
    });
  };

  const handleRemoveStep = (item: BasketAssetItem, stepId: string) => {
    if (item.dcaSteps.length <= 1) return;
    handleUpdateAsset(item.id, { dcaSteps: item.dcaSteps.filter((s) => s.id !== stepId) });
  };

  const handleSwapGoldToken = (targetGold: 'XAUT' | 'PAXG') => {
    const otherGold = targetGold === 'XAUT' ? 'PAXG' : 'XAUT';
    setItems((prev) => {
      const hasTarget = prev.some((i) => i.symbol === targetGold);
      const hasOther = prev.some((i) => i.symbol === otherGold);
      if (hasTarget && hasOther) return prev.filter((i) => i.symbol !== otherGold);
      if (hasOther && !hasTarget) {
        return prev.map((i) => {
          if (i.symbol !== otherGold) return i;
          const next = createBasketAssetItem(targetGold, livePrices, {
            allocationPct: i.allocationPct,
            preferredStable: 'USDC'
          });
          next.dcaSteps = buildStepsForStressRegime(targetGold, next.currentPriceUsd, regime);
          return next;
        });
      }
      if (!hasTarget) {
        const next = createBasketAssetItem(targetGold, livePrices, {
          allocationPct: 20,
          preferredStable: 'USDC'
        });
        next.dcaSteps = buildStepsForStressRegime(targetGold, next.currentPriceUsd, regime);
        return [...prev, next];
      }
      return prev;
    });
  };

  const handleApplyAdvisoryAction = (
    actionType?: 'remove_duplicate_gold' | 'add_btc_anchor' | 'keep_dry_powder' | 'prefer_xaut_for_usdt'
  ) => {
    if (!actionType) return;
    if (actionType === 'remove_duplicate_gold' || actionType === 'prefer_xaut_for_usdt') {
      handleSwapGoldToken('XAUT');
    } else if (actionType === 'add_btc_anchor') {
      handleAddPresetCoin('BTC');
    } else if (actionType === 'keep_dry_powder') {
      setDryPowderStr(String(Math.round(summary.investableStableUsd * 0.2)));
    }
  };


  return (
    <div className="space-y-5">
      {/* ۱) پنل یکپارچهٔ موجودی کیف پول، قفل ۵,۰۰۰ تتر هزینه‌های زندگی و انتخاب رژیم بدترین حالت */}
      <Surface variant="focal" className="border border-accent/35 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Wallet className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="text-base font-extrabold text-ink sm:text-lg">
                برنامهٔ DCA باقی‌ماندهٔ استیبل‌کوین‌ها و آزمون استرس بحران
              </h2>
              {walletSynced ? (
                <Badge tone="gain">متصل به موجودی زندهٔ کیف پول</Badge>
              ) : (
                <Badge tone="neutral">قابل همگام‌سازی با کیف پول</Badge>
              )}
            </div>
            <p className="text-xs text-muted">
              ۵,۰۰۰ تتر هزینه‌های زندگی به‌صورت کامل قفل و از خرید حذف می‌شود؛ فقط باقی‌ماندهٔ استیبل‌کوین‌ها برای کاهش میانگین خرید و بقا در ریزش سنگین یا ۲ سال رنج برنامه‌ریزی می‌شود.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {walletBridge.connectedWalletsCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={handleManualWalletSync}
              >
                همگام‌سازی مجدد با کیف پول
              </Button>
            )}
          </div>
        </div>

        {/* ورودی‌های شفاف: USDC، USDT، قفل ۵,۰۰۰ تتر زندگی، ذخیره نقد اضطراری */}
        <div className="grid grid-cols-2 gap-3 rounded-card border border-divider bg-card/90 p-3.5 lg:grid-cols-4">
          <Field label="موجودی USDC کیف پول">
            <Input
              dir="ltr"
              inputMode="decimal"
              value={usdcStr}
              onChange={(e) => setUsdcStr(e.target.value)}
              suffix="USDC"
            />
          </Field>

          <Field label="موجودی USDT کیف پول">
            <Input
              dir="ltr"
              inputMode="decimal"
              value={usdtStr}
              onChange={(e) => setUsdtStr(e.target.value)}
              suffix="USDT"
            />
          </Field>

          <Field
            label="ذخیره هزینه‌های زندگی (خارج از DCA)"
            hint="خط قرمز — هرگز وارد خرید نمی‌شود"
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={livingReserveStr}
              onChange={(e) => setLivingReserveStr(e.target.value)}
              suffix="USDT"
            />
          </Field>

          <Field
            label="ذخیره نقد اضطراری سبد (Dry Powder)"
            hint="جدا از پول زندگی، برای کف‌های غیرمنتظره"
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={dryPowderStr}
              onChange={(e) => setDryPowderStr(e.target.value)}
              suffix="$"
            />
          </Field>
        </div>

        {/* ۴ کارت خلاصه شفاف: قفل زندگی | باقی‌مانده قابل DCA | قسط ماهانه ۲ ساله | امتیاز کمیته */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <div className="rounded-field border border-gain/40 bg-gain/10 p-3">
            <span className="flex items-center gap-1 text-[11px] font-bold text-positive">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              قفل هزینه‌های زندگی
            </span>
            <p className="mt-1 text-base font-extrabold text-ink whitespace-nowrap">
              <MoneyValue value={summary.livingReserveUsd} />
            </p>
            <span className="text-[11px] text-muted">۱۰۰٪ دست‌نخورده در همهٔ سناریوها</span>
          </div>

          <div className="rounded-field border border-accent/40 bg-accent-soft/30 p-3">
            <span className="text-[11px] font-bold text-accent">بودجه فعال DCA (باقی‌مانده)</span>
            <p className="mt-1 text-base font-extrabold text-ink whitespace-nowrap">
              <MoneyValue value={summary.deployableDcaBudgetUsd} />
            </p>
            <span className="text-[11px] text-muted">
              از <MoneyValue value={summary.investableStableUsd} /> مازاد بر هزینهٔ زندگی
            </span>
          </div>

          <div className="rounded-field border border-divider bg-card p-3">
            <span className="text-[11px] font-semibold text-muted">سهم ماهانه در ۲ سال رنج</span>
            <p className="mt-1 text-base font-extrabold text-ink whitespace-nowrap">
              <MoneyValue value={summary.monthlyDca24mUsd} />
            </p>
            <span className="text-[11px] text-muted">توزیع آرام طی ۲۴ ماه بدون فشار روانی</span>
          </div>

          <div className="rounded-field border border-divider bg-card p-3">
            <span className="text-[11px] font-semibold text-muted">امتیاز وزنی کمیته ایجنت‌ها</span>
            <p className="mt-1 text-base font-extrabold text-positive">
              {toFaDigits(summary.weightedCommitteeScore)} از ۱۰
            </p>
            <span className="text-[11px] text-muted line-clamp-1">{summary.overallVerdictFa}</span>
          </div>
        </div>

        {/* انتخاب رژیم چیدمان پله‌های DCA */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-divider bg-card/85 p-3">
          <div className="space-y-0.5">
            <p className="text-xs font-extrabold text-ink">چیدمان خودکار پله‌های DCA بر اساس سناریوی بازار</p>
            <p className="text-[11px] text-muted">{REGIME_LABELS[regime].hint}</p>
          </div>
          <SegmentedControl<DcaStressRegime>
            label="رژیم پله‌های DCA"
            size="sm"
            value={regime}
            onChange={handleChangeRegime}
            options={[
              { value: 'severe_crash', label: REGIME_LABELS.severe_crash.label },
              { value: 'two_year_range', label: REGIME_LABELS.two_year_range.label },
              { value: 'standard', label: REGIME_LABELS.standard.label }
            ]}
          />
        </div>
      </Surface>

      {/* ۲) جدول آزمون استرس بدترین سناریوها (ریزش شدید -۴۵٪، ۲ سال رنج ۲۴ ماهه، زمستان -۶۵٪، بازگشت تا هدف) */}
      <Surface className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warn" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">
              آزمون استرس سبد در بدترین سناریوهای بازار (با حفظ ۵,۰۰۰ تتر زندگی)
            </h3>
          </div>
          <Badge tone="info">مقایسه زنده با خرید یکجا</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-divider text-muted">
                <th className="pb-2 font-bold">سناریوی بازار</th>
                <th className="pb-2 font-bold">ورود DCA انجام‌شده</th>
                <th className="pb-2 font-bold">ارزش سبد در پایان</th>
                <th className="pb-2 font-bold">سود / زیان خالص</th>
                <th className="pb-2 font-bold">برتری DCA نسبت به خرید یکجا</th>
                <th className="pb-2 font-bold">نقدینگی امن باقی‌مانده</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/60">
              {summary.stressScenarios.map((sc) => (
                <tr key={sc.id} className="align-top">
                  <td className="py-2.5 pe-2">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={sc.tone}>{sc.titleFa}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{sc.subtitleFa}</p>
                  </td>
                  <td className="py-2.5 pe-2 font-bold text-ink whitespace-nowrap">
                    <MoneyValue value={sc.deployedDcaUsd} />
                    {sc.monthlyDcaUsd !== null && sc.monthlyDcaUsd > 0 && (
                      <span className="block text-[10px] font-normal text-accent">
                        ماهانه <MoneyValue value={sc.monthlyDcaUsd} /> (۲۴ ماه)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pe-2 font-extrabold text-ink whitespace-nowrap">
                    <MoneyValue value={sc.portfolioValueAtEndUsd} />
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pe-2 font-extrabold whitespace-nowrap',
                      sc.netPnlUsd >= 0 ? 'text-positive' : 'text-negative'
                    )}
                  >
                    {fmtUsdFa(sc.netPnlUsd, true)}
                    <span className="block text-[10px] font-bold">{fmtPctFa(sc.netPnlPct, 1)}</span>
                  </td>
                  <td className="py-2.5 pe-2">
                    {sc.avgCostVsLumpSumBenefitPct > 0 ? (
                      <span className="font-extrabold text-positive">
                        +{toFaDigits(sc.avgCostVsLumpSumBenefitPct.toFixed(1))}٪ سرمایهٔ بیشتر
                      </span>
                    ) : (
                      <span className="text-muted">میانگین پایین‌تر برای رشد</span>
                    )}
                  </td>
                  <td className="py-2.5 text-[11px]">
                    <span className="flex items-center gap-1 font-bold text-positive whitespace-nowrap">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                      زندگی: <MoneyValue value={sc.untouchedLivingReserveUsd} />
                    </span>
                    {sc.untouchedDryPowderUsd > 0 && (
                      <span className="block text-muted whitespace-nowrap">
                        ذخیره سبد: <MoneyValue value={sc.untouchedDryPowderUsd} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* توصیه‌های هوشمند کمیته */}
        {summary.advisories.length > 0 && (
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            {summary.advisories.map((adv) => (
              <div
                key={adv.id}
                className={cn(
                  'flex items-start justify-between gap-2 rounded-field border px-3 py-2 text-xs',
                  adv.tone === 'gain'
                    ? 'border-gain/35 bg-gain/10'
                    : adv.tone === 'warn'
                      ? 'border-warn/40 bg-warn/10'
                      : 'border-accent/30 bg-accent-soft/20'
                )}
              >
                <div className="flex items-start gap-2">
                  {adv.tone === 'gain' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                  )}
                  <div>
                    <p className="font-bold text-ink">{adv.titleFa}</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted">{adv.bodyFa}</p>
                  </div>
                </div>
                {adv.actionType && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleApplyAdvisoryAction(adv.actionType)}
                  >
                    اعمال
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Surface>

      {/* ۳) نوار افزودن سریع رمزارز به سبد */}
      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-ink">دارایی‌های سبد DCA ({toFaDigits(summary.rows.filter((r) => r.item.enabled).length)} فعال)</h3>
          <span className="text-xs text-muted">برای افزودن یا فعال کردن هر ارز روی آن کلیک کنید</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESET_BASKET_CANDIDATES.map((cand) => {
            const exists = existingSymbols.has(cand.symbol);
            return (
              <button
                key={cand.symbol}
                type="button"
                onClick={() => handleAddPresetCoin(cand.symbol)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition',
                  exists
                    ? 'border-accent/50 bg-accent-soft/40 text-accent'
                    : 'border-divider bg-surface-2 hover:border-accent hover:text-ink'
                )}
              >
                <MarketAssetLogo symbol={cand.symbol} size={16} />
                <span dir="ltr" className="font-mono">{cand.symbol}</span>
                {!exists && <Plus className="h-3 w-3 text-accent" aria-hidden />}
              </button>
            );
          })}
        </div>

        <Disclosure summary="افزودن نماد سفارشی خارج از لیست بالا">
          <div className="grid grid-cols-1 items-end gap-2.5 pt-2 sm:grid-cols-4">
            <Field label="نماد انگلیسی">
              <Input
                dir="ltr"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                placeholder="ONDO / ARB / TON"
              />
            </Field>
            <Field label="نام فارسی (اختیاری)">
              <Input value={customNameFa} onChange={(e) => setCustomNameFa(e.target.value)} placeholder="مثلاً اندو" />
            </Field>
            <Field label="قیمت فعلی ($)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={customPriceStr}
                onChange={(e) => setCustomPriceStr(e.target.value)}
                placeholder="100"
                suffix="$"
              />
            </Field>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              disabled={!customSymbol.trim()}
              onClick={handleAddCustomCoin}
            >
              افزودن به سبد
            </Button>
          </div>
        </Disclosure>
      </Surface>

      {/* ۴) کارت‌های تمیز هر دارایی (موجودی فعلی کیف پول → میانگین جدید DCA + کمیته ایجنت‌ها) */}
      <div className="space-y-3.5">
        {summary.rows.map((row) => {
          const { item, committee } = row;
          const isExpanded = expandedSymbol === item.symbol;
          const ratingMeta = RATING_FA[committee.report.riskDebate.portfolioDecision.rating];

          return (
            <Surface
              key={item.id}
              className={cn(
                'border p-4 space-y-3 transition-all hover:border-accent/35',
                !item.enabled && 'opacity-55',
                isExpanded ? 'border-accent shadow-xs' : 'border-divider'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    aria-label={`فعال بودن ${item.nameFa}`}
                    checked={item.enabled}
                    onChange={(e) => handleUpdateAsset(item.id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[rgb(var(--c-brand-500))]"
                  />
                  <MarketAssetLogo symbol={item.symbol} size={34} />
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4 className="text-sm font-extrabold text-ink">{item.nameFa}</h4>
                      <span dir="ltr" className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold text-muted">
                        {item.symbol}
                      </span>
                      <Badge tone={ratingMeta.tone}>{ratingMeta.short}</Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      قیمت روز: <strong className="text-ink"><MoneyValue value={item.currentPriceUsd} /></strong>
                      {item.existingQuantity > 0 && (
                        <>
                          {' '}· موجودی فعلی کیف پول: <strong className="text-ink" dir="ltr">{toFaDigits(item.existingQuantity.toFixed(4))}</strong>
                          {item.existingAvgCostUsd > 0 && (
                            <> (میانگین <strong className="text-ink"><MoneyValue value={item.existingAvgCostUsd} /></strong>)</>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    to={`/desk?tab=agents&m=${encodeURIComponent(item.symbol)}`}
                    className={cn(buttonClass('outline', 'sm'), 'border-accent/30 text-accent hover:bg-accent/10')}
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden />
                    <span>مناظره در میز معامله</span>
                    <ArrowLeft className="h-3 w-3" aria-hidden />
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    onClick={() => setExpandedSymbol(isExpanded ? null : item.symbol)}
                  >
                    {isExpanded ? 'بستن پله‌ها' : 'ویرایش پله‌های DCA'}
                  </Button>
                  <IconButton
                    size="sm"
                    aria-label={`حذف ${item.symbol}`}
                    onClick={() => handleRemoveAsset(item.id)}
                    className="text-negative hover:bg-negative/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              {/* نوار متریک‌های کلیدی هر ارز */}
              <div className="grid grid-cols-2 gap-2 rounded-field bg-surface-2/60 p-2.5 sm:grid-cols-4">
                <div>
                  <span className="block text-[10px] text-muted">بودجه DCA ({toFaDigits(row.normalizedWeightPct)}٪)</span>
                  <span className="text-xs font-extrabold text-ink whitespace-nowrap">
                    <MoneyValue value={row.allocatedBudgetUsd} />
                  </span>
                  {regime === 'two_year_range' && row.allocatedBudgetUsd > 0 && (
                    <span className="block text-[10px] text-accent">
                      ماهانه <MoneyValue value={Math.round(row.allocatedBudgetUsd / 24)} />
                    </span>
                  )}
                </div>

                <div>
                  <span className="block text-[10px] text-muted">میانگین خرید پله‌های جدید</span>
                  <span className="text-xs font-extrabold text-accent whitespace-nowrap">
                    <MoneyValue value={row.dcaAverageEntryUsd} />
                  </span>
                  <span className="block text-[10px] text-subtle">
                    +{toFaDigits(row.dcaAddedUnits.toFixed(4))} {item.symbol}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] text-muted">میانگین کل جدید شما</span>
                  <span className="text-xs font-extrabold text-positive whitespace-nowrap">
                    <MoneyValue value={row.combinedNewAvgCostUsd} />
                  </span>
                  <span className="block text-[10px] text-subtle">
                    {item.existingQuantity > 0 && item.existingAvgCostUsd > 0
                      ? `${fmtPctFa(-row.avgCostReductionPct, 1)} کاهش میانگین`
                      : `مجموع ${toFaDigits(row.totalQuantityAfterDca.toFixed(4))} ${item.symbol}`}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] text-muted">حد ضرر کمیته / سود در هدف</span>
                  <span className="text-xs font-extrabold text-ink whitespace-nowrap">
                    {fmtUsdFa(row.projectedProfitAtTargetUsd, true)}
                  </span>
                  <span className="block text-[10px] text-subtle">
                    2×ATR: {fmtUsdFa(committee.atrStopLong)}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="space-y-4 border-t border-divider pt-3.5">
                  <div className="grid grid-cols-2 gap-2.5 rounded-card border border-divider bg-card p-3 sm:grid-cols-6">
                    <Field label="وزن در سبد (%)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(Number(item.allocationPct.toFixed(2)))}
                        onChange={(e) => handleUpdateAsset(item.id, { allocationPct: parseNum(e.target.value, 0) })}
                        suffix="٪"
                      />
                    </Field>
                    <Field label="قیمت روز ($)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.currentPriceUsd)}
                        onChange={(e) => handleUpdateAsset(item.id, { currentPriceUsd: parseNum(e.target.value, item.currentPriceUsd) })}
                        suffix="$"
                      />
                    </Field>
                    <Field label="هدف فروش ($)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.targetExitPriceUsd)}
                        onChange={(e) => handleUpdateAsset(item.id, { targetExitPriceUsd: parseNum(e.target.value, item.targetExitPriceUsd) })}
                        suffix="$"
                      />
                    </Field>
                    <Field label={`موجودی قبلی (${item.symbol})`}>
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.existingQuantity)}
                        onChange={(e) => handleUpdateAsset(item.id, { existingQuantity: parseNum(e.target.value, 0) })}
                      />
                    </Field>
                    <Field label="میانگین قبلی ($)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.existingAvgCostUsd)}
                        onChange={(e) => handleUpdateAsset(item.id, { existingAvgCostUsd: parseNum(e.target.value, 0) })}
                        suffix="$"
                      />
                    </Field>
                    <Field label="استیبل خرید">
                      <SegmentedControl<StableSource>
                        label="استیبل"
                        fill
                        size="sm"
                        value={item.preferredStable}
                        onChange={(val) => handleUpdateAsset(item.id, { preferredStable: val })}
                        options={[
                          { value: 'USDC', label: 'USDC' },
                          { value: 'USDT', label: 'USDT' }
                        ]}
                      />
                    </Field>
                  </div>

                  {/* ویرایشگر پله‌ها + جدول نتیجه */}
                  <div className="space-y-3 rounded-card border border-divider bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-xs font-extrabold text-ink">
                        پله‌های DCA برای {item.nameFa} ({REGIME_LABELS[regime].label})
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleUpdateAsset(item.id, {
                              dcaSteps: buildStepsForStressRegime(item.symbol, item.currentPriceUsd, regime)
                            })
                          }
                        >
                          بازچینی پله‌ها با قیمت روز
                        </Button>
                        <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => handleAddStep(item)}>
                          پله جدید
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {item.dcaSteps.map((st, idx) => (
                        <div key={st.id} className="space-y-1.5 rounded-field border border-divider bg-surface-2/40 p-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-ink truncate">
                              پله {toFaDigits(idx + 1)}: {st.labelFa}
                            </span>
                            {item.dcaSteps.length > 1 && (
                              <IconButton size="sm" aria-label={`حذف پله ${idx + 1}`} onClick={() => handleRemoveStep(item, st.id)}>
                                <Trash2 className="h-3 w-3 text-muted hover:text-negative" />
                              </IconButton>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Field label="قیمت ($)">
                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                value={String(st.targetPriceUsd)}
                                onChange={(e) =>
                                  handleUpdateStep(item.id, st.id, {
                                    targetPriceUsd: parseNum(e.target.value, st.targetPriceUsd)
                                  })
                                }
                              />
                            </Field>
                            <Field label="سهم (%)">
                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                value={String(st.weightPct)}
                                onChange={(e) =>
                                  handleUpdateStep(item.id, st.id, {
                                    weightPct: parseNum(e.target.value, st.weightPct)
                                  })
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="border-b border-divider text-muted">
                            <th className="pb-1.5">پله</th>
                            <th className="pb-1.5">قیمت ورود</th>
                            <th className="pb-1.5">مبلغ خرید</th>
                            <th className="pb-1.5">واحد جدید</th>
                            <th className="pb-1.5">میانگین کل جدید</th>
                            <th className="pb-1.5">رشد تا سربه‌سر</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/60">
                          {row.stepDetails.map((sd) => (
                            <tr key={sd.id}>
                              <td className="py-1.5 font-bold text-ink">{sd.labelFa}</td>
                              <td className="py-1.5 font-bold text-accent whitespace-nowrap">
                                {fmtUsdFa(sd.targetPriceUsd)}{' '}
                                <span className="text-[10px] text-subtle">({fmtPctFa(sd.dropFromMarketPct, 1)})</span>
                              </td>
                              <td className="py-1.5 font-bold text-ink whitespace-nowrap">{fmtUsdFa(sd.allocatedUsd)}</td>
                              <td className="py-1.5 text-muted">+{toFaDigits(sd.unitsBought.toFixed(4))}</td>
                              <td className="py-1.5 font-extrabold text-positive whitespace-nowrap">{fmtUsdFa(sd.newCombinedAvgCostUsd)}</td>
                              <td className="py-1.5 font-semibold text-ink">+{toFaDigits(sd.bounceToBreakEvenPct.toFixed(1))}٪</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>


                </div>
              )}
            </Surface>
          );
        })}
      </div>

      {/* ۵) مقایسه تخصصی XAUT در برابر PAXG در کشوی مرتب (بدون حذف) */}
      <Disclosure summary="مقایسه تخصصی طلای توکنایز: تتر گلد (XAUT) در برابر پکس گلد (PAXG) و جایگزینی تک‌کلیکی">
        <div className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <Scale className="h-4 w-4 text-accent" aria-hidden />
              فقط یکی از دو توکن طلا را برای جلوگیری از تکرار نگه دارید
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleSwapGoldToken('XAUT')}>
                انتخاب XAUT و حذف PAXG
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSwapGoldToken('PAXG')}>
                جایگزینی با PAXG (مناسب USDC)
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {GOLD_TOKEN_COMPARISON.map((g) => (
              <div
                key={g.symbol}
                className={cn(
                  'rounded-card border p-3 text-xs space-y-1.5',
                  g.recommendedForUser ? 'border-accent bg-accent-soft/15' : 'border-divider bg-surface-2/40'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MarketAssetLogo symbol={g.symbol} size={24} />
                    <span className="font-extrabold text-ink">{g.nameFa}</span>
                  </div>
                  <Badge tone={g.recommendedForUser ? 'gain' : 'neutral'}>{g.bestStablePair}</Badge>
                </div>
                <p className="text-muted leading-6">
                  <strong className="text-ink">صادرکننده و حسابرس:</strong> {g.issuerFa} · {g.auditorFa}
                </p>
                <p className="text-ink font-medium leading-6">{g.summaryFa}</p>
              </div>
            ))}
          </div>
        </div>
      </Disclosure>
    </div>
  );
}
