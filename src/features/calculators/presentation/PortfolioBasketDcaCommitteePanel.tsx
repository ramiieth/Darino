/**
 * ماژول یکپارچه «مدیریت سبد دارایی، میانگین خرید پله‌ای (DCA) و کمیته ایجنت‌ها» در ماشین‌حساب دارینو
 *
 * امکانات:
 *   ۱) مدیریت موجودی استیبل‌کوینی دوگانه (۱۷,۶۸۱ USDC + ۵,۰۰۰ USDT = ۲۲,۶۸۱ دلار) و ذخیره نقدینگی / دلتا نوترال (۵,۶۸۱ دلار)
 *   ۲) افزودن، ویرایش و حذف آزادانه رمزارزها (شامل HYPE، ETH، SOL، XAUT، PAXG، BTC، SUI، AAVE، LINK، PENDLE یا هر نماد دلخواه)
 *   ۳) ویرایش پله‌های خرید DCA برای هر دارایی و محاسبه لحظه‌ای «میانگین قیمت خرید جدید» (با احتساب دارایی قبلی کیف پول مثل ۳.۳۳ واحد ETH روی ۲,۸۲۰ دلار)
 *   ۴) اجرای کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents: ۱۱ اندیکاتور تکنیکال، مناظره Bull/Bear، معامله‌گر ATR و حکم مدیر پرتفولیو) برای تک‌تک رمزارزهای سبد
 *   ۵) مقایسه رو در روی طلای XAUT در برابر PAXG با قابلیت جایگزینی تک‌کلیکی و هشدارهای هوشمند کمیته ریسک روی کل سبد.
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Layers,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
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
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import {
  RATING_FA,
  SENTIMENT_BAND_FA,
  TRADER_ACTION_FA,
  type TradingAgentsReport
} from '@/features/intel/domain/tradingAgents';
import { fetchJson } from '@/repositories/remoteClient';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import {
  GOLD_TOKEN_COMPARISON,
  PRESET_BASKET_CANDIDATES,
  buildDefaultDcaStepsForPrice,
  buildInitialUserBasket,
  createBasketAssetItem,
  simulatePortfolioBasketDcaAndCommittee,
  type BasketAssetItem,
  type ComputedBasketAssetRow,
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

export function PortfolioBasketDcaCommitteePanel() {
  const { prices: livePrices } = useCalculatorPrices();

  // ۱) موجودی استیبل‌کوین‌ها و ذخیره نقدینگی (پیش‌فرض: ۱۷,۶۸۱ USDC + ۵,۰۰۰ USDT و ۵,۶۸۱ دلار ذخیره)
  const [usdcStr, setUsdcStr] = useState<string>('17681');
  const [usdtStr, setUsdtStr] = useState<string>('5000');
  const [reserveStr, setReserveStr] = useState<string>('5681');

  // ۲) لیست دارایی‌های سبد (با قابلیت ویرایش، حذف و افزودن)
  const [items, setItems] = useState<BasketAssetItem[]>(() => buildInitialUserBasket(livePrices, true));

  // ۳) افزودن رمزارز جدید (از کاتالوگ یا نماد دلخواه)
  const [customSymbol, setCustomSymbol] = useState<string>('');
  const [customNameFa, setCustomNameFa] = useState<string>('');
  const [customPriceStr, setCustomPriceStr] = useState<string>('');

  // ۴) وضعیت باز بودن جزئیات پله‌های DCA و کمیته ایجنت‌ها برای هر ردیف
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>('HYPE');
  const [liveCommitteeReports, setLiveCommitteeReports] = useState<Record<string, TradingAgentsReport>>({});
  const [runningCommitteeSymbol, setRunningCommitteeSymbol] = useState<string | null>(null);

  const usdcBalance = parseNum(usdcStr, 17681);
  const usdtBalance = parseNum(usdtStr, 5000);
  const reserveUsd = parseNum(reserveStr, 5681);

  const summary = useMemo(
    () =>
      simulatePortfolioBasketDcaAndCommittee({
        usdcBalanceUsd: usdcBalance,
        usdtBalanceUsd: usdtBalance,
        reserveDryPowderUsd: reserveUsd,
        items
      }),
    [usdcBalance, usdtBalance, reserveUsd, items]
  );

  const existingSymbols = useMemo(
    () => new Set(items.map((i) => i.symbol.toUpperCase())),
    [items]
  );

  // ─── عملیات ویرایش، حذف و افزودن رمزارز در سبد ───────────────────────────

  const handleAddPresetCoin = (symbol: string) => {
    const up = symbol.toUpperCase();
    if (existingSymbols.has(up)) {
      setItems((prev) => prev.map((it) => (it.symbol === up ? { ...it, enabled: true } : it)));
      setExpandedSymbol(up);
      return;
    }
    const newItem = createBasketAssetItem(up, livePrices);
    setItems((prev) => [...prev, newItem]);
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
      allocationPct: 10
    });
    setItems((prev) => [...prev, newItem]);
    setCustomSymbol('');
    setCustomNameFa('');
    setCustomPriceStr('');
    setExpandedSymbol(sym);
  };

  const handleRemoveAsset = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleUpdateAsset = (id: string, patch: Partial<BasketAssetItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, ...patch };
        return updated;
      })
    );
  };

  const handleRecalibrateStepsToPrice = (item: BasketAssetItem, newPrice: number) => {
    const safePx = newPrice > 0 ? newPrice : item.currentPriceUsd;
    const preset = PRESET_BASKET_CANDIDATES.find((c) => c.symbol === item.symbol);
    const nextSteps = buildDefaultDcaStepsForPrice(
      item.symbol,
      safePx,
      preset?.stepDropsPct ?? [0, -6, -12]
    );
    handleUpdateAsset(item.id, {
      currentPriceUsd: safePx,
      dcaSteps: nextSteps
    });
  };

  const handleUpdateStep = (
    assetId: string,
    stepId: string,
    patch: Partial<{ labelFa: string; targetPriceUsd: number; weightPct: number; enabled: boolean }>
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== assetId) return it;
        return {
          ...it,
          dcaSteps: it.dcaSteps.map((st) => (st.id === stepId ? { ...st, ...patch } : st))
        };
      })
    );
  };

  const handleAddStep = (item: BasketAssetItem) => {
    const lastStep = item.dcaSteps[item.dcaSteps.length - 1];
    const nextPx = lastStep
      ? Number((lastStep.targetPriceUsd * 0.94).toPrecision(4))
      : Number((item.currentPriceUsd * 0.9).toPrecision(4));
    const idx = item.dcaSteps.length + 1;
    handleUpdateAsset(item.id, {
      dcaSteps: [
        ...item.dcaSteps,
        {
          id: `${item.symbol}-step-${Date.now()}`,
          labelFa: `پله ${toFaDigits(idx)} (حمایت پایین‌تر)`,
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
    handleUpdateAsset(item.id, {
      dcaSteps: item.dcaSteps.filter((s) => s.id !== stepId)
    });
  };

  const handleSwapGoldToken = (targetGold: 'XAUT' | 'PAXG') => {
    const otherGold = targetGold === 'XAUT' ? 'PAXG' : 'XAUT';
    setItems((prev) => {
      const hasTarget = prev.some((i) => i.symbol === targetGold);
      const hasOther = prev.some((i) => i.symbol === otherGold);
      if (hasTarget && hasOther) {
        return prev.filter((i) => i.symbol !== otherGold);
      }
      if (hasOther && !hasTarget) {
        return prev.map((i) =>
          i.symbol === otherGold
            ? createBasketAssetItem(targetGold, livePrices, {
                allocationPct: i.allocationPct,
                preferredStable: targetGold === 'XAUT' ? 'USDT' : 'USDC'
              })
            : i
        );
      }
      if (!hasTarget) {
        return [
          ...prev,
          createBasketAssetItem(targetGold, livePrices, {
            allocationPct: 25,
            preferredStable: targetGold === 'XAUT' ? 'USDT' : 'USDC'
          })
        ];
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
      setReserveStr('5681');
    }
  };

  const handleRunLiveCommitteeForAsset = async (row: ComputedBasketAssetRow) => {
    const sym = row.item.symbol;
    if (runningCommitteeSymbol) return;
    setRunningCommitteeSymbol(sym);
    try {
      const res = await fetchJson<{ report: TradingAgentsReport }>(
        '/api/integrations?op=analyze-trading-agents',
        {
          method: 'POST',
          body: row.committee.committeeInput,
          timeoutMs: 65_000
        }
      );
      if (res?.report) {
        setLiveCommitteeReports((prev) => ({ ...prev, [sym]: res.report }));
      }
    } catch {
      // در صورت آفلاین بودن سرور، گزارش کامل ۴ مرحله‌ای موتور کمی بومی نمایش داده می‌شود
      setLiveCommitteeReports((prev) => ({ ...prev, [sym]: row.committee.report }));
    } finally {
      setRunningCommitteeSymbol(null);
      setExpandedSymbol(sym);
    }
  };

  return (
    <div className="space-y-5">
      {/* ۱) هدر، خلاصه سرمایه استیبل‌کوینی (۱۷,۶۸۱ USDC + ۵,۰۰۰ USDT) و پیش‌تنظیم‌های سبد */}
      <Surface className="border-2 border-accent/40 bg-gradient-to-bl from-accent/10 via-surface-2/40 to-transparent p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Bot className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="text-base font-extrabold text-ink sm:text-lg">
                ماشین‌حساب سبد دارایی، میانگین خرید پله‌ای (DCA) و کمیته ایجنت‌ها
              </h2>
              <Badge tone="gain">قابل ویرایش، حذف و افزودن رمزارز</Badge>
            </div>
            <p className="text-xs leading-6 text-muted">
              تخصیص هوشمند <strong>۱۷,۶۸۱ واحد USDC</strong> و <strong>۵,۰۰۰ واحد USDT</strong> (جمعاً ۲۲,۶۸۱ دلار) به همراه دارایی قبلی داشبورد (<strong>۳.۳۳ واحد ETH روی ۲,۸۲۰ دلار</strong>) با محاسبه پله‌به‌پله میانگین خرید جدید و حکم کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={() => {
                setUsdcStr('17681');
                setUsdtStr('5000');
                setReserveStr('5681');
                setItems(buildInitialUserBasket(livePrices, true));
              }}
            >
              چیدمان بهینه کمیته (با BTC + XAUT)
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => {
                setUsdcStr('17681');
                setUsdtStr('5000');
                setReserveStr('5681');
                setItems(buildInitialUserBasket(livePrices, false));
              }}
            >
              ۴ دارایی پایه (HYPE, ETH, SOL, XAUT)
            </Button>
          </div>
        </div>

        {/* ورودی‌های موجودی USDC، USDT و ذخیره نقدینگی */}
        <div className="grid grid-cols-1 gap-3 rounded-card border border-divider bg-card/90 p-3.5 sm:grid-cols-3">
          <Field
            label="موجودی USDC شما (دلار)"
            hint="برای خرید پله‌ای HYPE، ETH، BTC، SOL و ذخیره نقدینگی"
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={usdcStr}
              onChange={(e) => setUsdcStr(e.target.value)}
              suffix="USDC"
            />
          </Field>

          <Field
            label="موجودی تتر USDT شما (دلار)"
            hint="پیشنهاد کمیته: اختصاص مستقیم به پله‌های طلای تتر (XAUT)"
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={usdtStr}
              onChange={(e) => setUsdtStr(e.target.value)}
              suffix="USDT"
            />
          </Field>

          <Field
            label="ذخیره نقدینگی / دلتا نوترال (دلار)"
            hint={`معادل ${toFaDigits(summary.reserveDryPowderPct)}٪ کل استیبل‌کوین‌ها بیرون از خرید اسپات`}
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={reserveStr}
              onChange={(e) => setReserveStr(e.target.value)}
              suffix="دلار"
            />
          </Field>
        </div>

        {/* ۴ کارت خلاصه کلان سبد */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-field border border-divider bg-card p-3">
            <span className="text-[11px] font-semibold text-muted">کل نقدینگی استیبل‌کوین</span>
            <p className="mt-1 text-base font-extrabold text-ink">
              {fmtUsdFa(summary.totalStableBalanceUsd)}
            </p>
            <span className="text-[11px] text-subtle">
              بودجه فعال DCA: <strong className="text-accent">{fmtUsdFa(summary.deployableDcaBudgetUsd)}</strong>
            </span>
          </div>

          <div className="rounded-field border border-divider bg-card p-3">
            <span className="text-[11px] font-semibold text-muted">ذخیره نقد و دلتا نوترال</span>
            <p className="mt-1 text-base font-extrabold text-ink">
              {fmtUsdFa(summary.reserveDryPowderUsd)}
            </p>
            <span className="text-[11px] text-subtle">
              سهم ذخیره: <strong>{toFaDigits(summary.reserveDryPowderPct)}٪</strong> از استیبل‌ها
            </span>
          </div>

          <div className="rounded-field border border-divider bg-card p-3">
            <span className="text-[11px] font-semibold text-muted">امتیاز وزنی کمیته ایجنت‌ها</span>
            <p className="mt-1 text-base font-extrabold text-positive">
              {toFaDigits(summary.weightedCommitteeScore)} از ۱۰
            </p>
            <span className="text-[11px] text-subtle">{summary.overallVerdictFa}</span>
          </div>

          <div className="rounded-field border border-divider bg-card p-3">
            <span className="text-[11px] font-semibold text-muted">سود خالص کل در اهداف قیمتی</span>
            <p
              className={cn(
                'mt-1 text-base font-extrabold',
                summary.totalProjectedProfitAtTargetsUsd >= 0 ? 'text-positive' : 'text-negative'
              )}
            >
              {fmtUsdFa(summary.totalProjectedProfitAtTargetsUsd, true)}
            </p>
            <span className="text-[11px] text-subtle">
              بازده کل سبد: <strong>{fmtPctFa(summary.totalProjectedRoiPct, 1)}</strong>
            </span>
          </div>
        </div>

        {/* توصیه‌ها و هشدارهای هوشمند کمیته ایجنت‌ها روی کل سبد */}
        <div className="space-y-2">
          {summary.advisories.map((adv) => (
            <div
              key={adv.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-card border px-3.5 py-2.5 text-xs',
                adv.tone === 'gain'
                  ? 'border-gain/35 bg-gain/10 text-ink'
                  : adv.tone === 'warn'
                    ? 'border-warn/40 bg-warn/10 text-ink'
                    : 'border-accent/35 bg-accent-soft/30 text-ink'
              )}
            >
              <div className="flex items-start gap-2.5 max-w-3xl">
                {adv.tone === 'gain' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                )}
                <div className="space-y-0.5 leading-6">
                  <p className="font-extrabold">{adv.titleFa}</p>
                  <p className="text-muted">{adv.bodyFa}</p>
                </div>
              </div>

              {adv.actionType && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleApplyAdvisoryAction(adv.actionType)}
                >
                  اعمال خودکار اصلاح
                </Button>
              )}
            </div>
          ))}
        </div>
      </Surface>

      {/* ۲) نوار افزودن سریع رمزارز (بیت‌کوین، طلا، دیفای یا هر رمزارز دلخواه) */}
      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-ink">
              افزودن رمزارز جدید به سبد (بیت‌کوین، طلا، لایه‌اول‌ها و دیفای)
            </h3>
            <p className="text-2xs text-muted">
              روی هر نماد کلیک کنید تا با ۳ پله استاندارد DCA و ارزیابی کمیته ایجنت‌ها به سبد اضافه شود، یا نماد دلخواهتان را وارد کنید:
            </p>
          </div>
          <span className="text-xs font-bold text-accent">
            تعداد دارایی‌های فعال سبد: {toFaDigits(summary.rows.filter((r) => r.item.enabled).length)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESET_BASKET_CANDIDATES.map((cand) => {
            const exists = existingSymbols.has(cand.symbol);
            return (
              <button
                key={cand.symbol}
                type="button"
                onClick={() => handleAddPresetCoin(cand.symbol)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                  exists
                    ? 'border-accent/50 bg-accent-soft/40 text-accent'
                    : 'border-divider bg-surface-2 hover:border-accent hover:text-ink'
                )}
              >
                <MarketAssetLogo symbol={cand.symbol} size={18} />
                <span>{cand.nameFa}</span>
                <span dir="ltr" className="font-mono text-[11px] opacity-80">
                  ({cand.symbol})
                </span>
                {exists ? (
                  <Badge tone="gain" className="text-[9px] px-1.5 py-0">
                    در سبد
                  </Badge>
                ) : (
                  <Plus className="h-3.5 w-3.5 text-accent" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        <Disclosure summary="افزودن نماد سفارشی (هر رمزارز یا توکن دلخواه خارج از لیست بالا)">
          <div className="grid grid-cols-1 items-end gap-2.5 pt-2 sm:grid-cols-4">
            <Field label="نماد انگلیسی (مثلاً ONDO یا TON)">
              <Input
                dir="ltr"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                placeholder="BTC / ONDO / ARB"
              />
            </Field>
            <Field label="نام فارسی (اختیاری)">
              <Input
                value={customNameFa}
                onChange={(e) => setCustomNameFa(e.target.value)}
                placeholder="مثلاً اندو فایننس"
              />
            </Field>
            <Field label="قیمت فعلی بازار (دلار)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={customPriceStr}
                onChange={(e) => setCustomPriceStr(e.target.value)}
                placeholder="100"
                suffix="دلار"
              />
            </Field>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              disabled={!customSymbol.trim()}
              onClick={handleAddCustomCoin}
            >
              افزودن به سبد DCA
            </Button>
          </div>
        </Disclosure>
      </Surface>

      {/* ۳) کارت‌های تفصیلی هر دارایی در سبد (ویرایش وزن، حذف، ویرایش پله‌های DCA و کمیته ایجنت‌ها) */}
      <div className="space-y-4">
        {summary.rows.map((row) => {
          const { item, committee, athInfo } = row;
          const isExpanded = expandedSymbol === item.symbol;
          const activeReport = liveCommitteeReports[item.symbol] ?? committee.report;
          const ratingMeta = RATING_FA[activeReport.riskDebate.portfolioDecision.rating];
          const sentimentMeta = SENTIMENT_BAND_FA[committee.sentimentBand];
          const traderMeta = TRADER_ACTION_FA[activeReport.traderProposal.action];

          return (
            <Surface
              key={item.id}
              className={cn(
                'border transition-all p-4 sm:p-5 space-y-4',
                !item.enabled && 'opacity-55',
                isExpanded ? 'border-accent shadow-sm' : 'border-divider'
              )}
            >
              {/* هدر دارایی: لوگو، نام، حکم کمیته ایجنت‌ها، دکمه حذف و باز/بسته کردن پله‌ها */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`فعال بودن ${item.nameFa} در سبد`}
                    checked={item.enabled}
                    onChange={(e) => handleUpdateAsset(item.id, { enabled: e.target.checked })}
                    className="mt-2 h-4 w-4 accent-[rgb(var(--c-brand-500))]"
                  />
                  <MarketAssetLogo symbol={item.symbol} size={40} />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-extrabold text-ink sm:text-base">{item.nameFa}</h3>
                      <span
                        dir="ltr"
                        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-bold text-muted"
                      >
                        {item.symbol}
                      </span>
                      <Badge tone={ratingMeta.tone}>
                        حکم کمیته: {ratingMeta.short} ({activeReport.riskDebate.portfolioDecision.rating})
                      </Badge>
                      <Badge tone={sentimentMeta.tone}>
                        امتیاز: {toFaDigits(committee.sentimentScore)}/۱۰
                      </Badge>
                      <Badge tone="neutral">
                        منبع خرید: {item.preferredStable}
                      </Badge>
                    </div>

                    <p className="text-xs leading-6 text-muted">{item.fundamentalNoteFa}</p>

                    {athInfo && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                        <span>{athInfo.athSummarySentenceFa}</span>
                        <span>·</span>
                        <span className="font-semibold text-accent">{athInfo.rangeSummarySentenceFa}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* دکمه‌های عملیات روی این رمزارز (اجرای کمیته، باز کردن پله‌ها، حذف رمزارز) */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={runningCommitteeSymbol === item.symbol}
                    icon={<Bot className="h-3.5 w-3.5" />}
                    onClick={() => void handleRunLiveCommitteeForAsset(row)}
                  >
                    به‌روزرسانی کمیته
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    icon={isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    onClick={() => setExpandedSymbol(isExpanded ? null : item.symbol)}
                  >
                    {isExpanded ? 'بستن جزئیات DCA و کمیته' : 'ویرایش پله‌های DCA و کمیته'}
                  </Button>

                  <IconButton
                    size="sm"
                    aria-label={`حذف ${item.symbol} از سبد`}
                    onClick={() => handleRemoveAsset(item.id)}
                    className="text-negative hover:bg-negative/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              {/* نوار متریک‌های کلیدی این رمزارز (بودجه، میانگین خرید DCA، میانگین کل جدید و سود در هدف) */}
              <div className="grid grid-cols-2 gap-2.5 rounded-card bg-surface-2/60 p-3 sm:grid-cols-5">
                <div>
                  <span className="block text-[11px] text-muted">بودجه تخصیص‌یافته ({toFaDigits(row.normalizedWeightPct)}٪)</span>
                  <span className="text-sm font-extrabold text-ink">{fmtUsdFa(row.allocatedBudgetUsd)}</span>
                  <span className="block text-[10px] text-subtle">
                    {row.usdtShareUsd > 0 ? `${fmtUsdFa(row.usdtShareUsd)} از USDT` : `${fmtUsdFa(row.usdcShareUsd)} از USDC`}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-muted">میانگین ورود پله‌های DCA</span>
                  <span className="text-sm font-extrabold text-accent">{fmtUsdFa(row.dcaAverageEntryUsd)}</span>
                  <span className="block text-[10px] text-subtle">
                    خرید جدید: +{toFaDigits(row.dcaAddedUnits.toFixed(4))} {item.symbol}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-muted">
                    {item.existingQuantity > 0 ? 'میانگین کل جدید (با دارایی قبلی)' : 'میانگین تمام‌شده نهایی'}
                  </span>
                  <span className="text-sm font-extrabold text-positive">
                    {fmtUsdFa(row.combinedNewAvgCostUsd)}
                  </span>
                  <span className="block text-[10px] text-subtle">
                    {item.existingQuantity > 0
                      ? `قبلی: ${fmtUsdFa(item.existingAvgCostUsd)} (${fmtPctFa(-row.avgCostReductionPct, 1)} کاهش)`
                      : `موجودی کل: ${toFaDigits(row.totalQuantityAfterDca.toFixed(4))} ${item.symbol}`}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-muted">حد ضرر کمیته (2×ATR)</span>
                  <span className="text-sm font-extrabold text-negative">
                    {fmtUsdFa(committee.atrStopLong)}
                  </span>
                  <span className="block text-[10px] text-subtle">
                    تراز اندیکاتورها: {toFaDigits(committee.bullIndicatorsCount)} صعودی / {toFaDigits(committee.bearIndicatorsCount)} نزولی
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-muted">سود خالص در هدف ({fmtUsdFa(item.targetExitPriceUsd)})</span>
                  <span
                    className={cn(
                      'text-sm font-extrabold',
                      row.projectedProfitAtTargetUsd >= 0 ? 'text-positive' : 'text-negative'
                    )}
                  >
                    {fmtUsdFa(row.projectedProfitAtTargetUsd, true)}
                  </span>
                  <span className="block text-[10px] text-subtle">
                    بازده تا هدف: {fmtPctFa(row.projectedRoiAtTargetPct, 1)}
                  </span>
                </div>
              </div>

              {/* پنل بازشونده: ویرایش پارامترهای دارایی، پله‌های خرید DCA و گزارش ۴ مرحله‌ای کمیته ایجنت‌ها */}
              {isExpanded && (
                <div className="space-y-4 border-t border-divider pt-4">
                  {/* بخش الف: ویرایش پارامترهای پایه دارایی (وزن، قیمت روز، قیمت هدف، موجودی قبلی و منبع استیبل‌کوین) */}
                  <div className="grid grid-cols-1 gap-3 rounded-card border border-divider bg-card p-3.5 sm:grid-cols-6">
                    <Field label="ضریب وزن در سبد (%)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(Number(item.allocationPct.toFixed(2)))}
                        onChange={(e) =>
                          handleUpdateAsset(item.id, { allocationPct: parseNum(e.target.value, 0) })
                        }
                        suffix="٪"
                      />
                    </Field>

                    <Field label="قیمت فعلی بازار ($)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.currentPriceUsd)}
                        onChange={(e) =>
                          handleUpdateAsset(item.id, {
                            currentPriceUsd: parseNum(e.target.value, item.currentPriceUsd)
                          })
                        }
                        suffix="$"
                      />
                    </Field>

                    <Field label="قیمت هدف فروش ($)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.targetExitPriceUsd)}
                        onChange={(e) =>
                          handleUpdateAsset(item.id, {
                            targetExitPriceUsd: parseNum(e.target.value, item.targetExitPriceUsd)
                          })
                        }
                        suffix="$"
                      />
                    </Field>

                    <Field label={`موجودی قبلی (${item.symbol})`}>
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.existingQuantity)}
                        onChange={(e) =>
                          handleUpdateAsset(item.id, {
                            existingQuantity: parseNum(e.target.value, 0)
                          })
                        }
                      />
                    </Field>

                    <Field label="میانگین خرید قبلی ($)">
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={String(item.existingAvgCostUsd)}
                        onChange={(e) =>
                          handleUpdateAsset(item.id, {
                            existingAvgCostUsd: parseNum(e.target.value, 0)
                          })
                        }
                        suffix="$"
                      />
                    </Field>

                    <Field label="استیبل‌کوین خرید">
                      <SegmentedControl<StableSource>
                        label="استیبل‌کوین"
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

                  {/* بخش ب: جدول و ویرایشگر پله‌های خرید DCA (میانگین کم کردن پله‌به‌پله) */}
                  <div className="space-y-3 rounded-card border border-divider bg-card p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-extrabold text-ink">
                          پله‌های خرید DCA برای {item.nameFa} ({item.symbol}) — روش میانگین خرید پله‌ای
                        </h4>
                        <p className="text-[11px] text-muted">
                          قیمت ورود و سهم درصدی هر پله را ویرایش کنید یا پله جدید اضافه نمایید تا میانگین تمام‌شده جدید پس از هر پله محاسبه شود:
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRecalibrateStepsToPrice(item, item.currentPriceUsd)}
                        >
                          تنظیم خودکار پله‌ها با قیمت روز
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Plus className="h-3.5 w-3.5" />}
                          onClick={() => handleAddStep(item)}
                        >
                          افزودن پله DCA
                        </Button>
                      </div>
                    </div>

                    {/* ویرایشگر پله‌ها */}
                    <div className="grid gap-2 sm:grid-cols-3">
                      {item.dcaSteps.map((st, idx) => (
                        <div
                          key={st.id}
                          className="space-y-2 rounded-field border border-divider bg-surface-2/40 p-2.5"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-ink">
                              پله {toFaDigits(idx + 1)}: {st.labelFa}
                            </span>
                            {item.dcaSteps.length > 1 && (
                              <IconButton
                                size="sm"
                                aria-label={`حذف پله ${idx + 1}`}
                                onClick={() => handleRemoveStep(item, st.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted hover:text-negative" />
                              </IconButton>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="قیمت ورود پله ($)">
                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                value={String(st.targetPriceUsd)}
                                onChange={(e) =>
                                  handleUpdateStep(item.id, st.id, {
                                    targetPriceUsd: parseNum(e.target.value, st.targetPriceUsd)
                                  })
                                }
                                suffix="$"
                              />
                            </Field>
                            <Field label="سهم از بودجه این ارز (%)">
                              <Input
                                dir="ltr"
                                inputMode="decimal"
                                value={String(st.weightPct)}
                                onChange={(e) =>
                                  handleUpdateStep(item.id, st.id, {
                                    weightPct: parseNum(e.target.value, st.weightPct)
                                  })
                                }
                                suffix="٪"
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* جدول خروجی پله‌به‌پله میانگین خرید جدید */}
                    <div className="overflow-x-auto pt-1">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="border-b border-divider text-muted">
                            <th className="pb-2">پله DCA</th>
                            <th className="pb-2">قیمت ورود پله</th>
                            <th className="pb-2">مبلغ خرید پله</th>
                            <th className="pb-2">واحد خریداری‌شده</th>
                            <th className="pb-2">موجودی کل تجمعی</th>
                            <th className="pb-2">میانگین کل جدید</th>
                            <th className="pb-2">رشد لازم تا سربه‌سر</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/60">
                          {row.stepDetails.map((sd) => (
                            <tr key={sd.id}>
                              <td className="py-2 font-bold text-ink">{sd.labelFa}</td>
                              <td className="py-2 font-bold text-accent">
                                {fmtUsdFa(sd.targetPriceUsd)}{' '}
                                <span className="text-[10px] text-subtle">
                                  ({fmtPctFa(sd.dropFromMarketPct, 1)})
                                </span>
                              </td>
                              <td className="py-2 font-bold text-ink">{fmtUsdFa(sd.allocatedUsd)}</td>
                              <td className="py-2 text-muted">
                                +{toFaDigits(sd.unitsBought.toFixed(4))} {item.symbol}
                              </td>
                              <td className="py-2 font-bold text-ink">
                                {toFaDigits(sd.cumulativeUnits.toFixed(4))} {item.symbol}
                              </td>
                              <td className="py-2 font-extrabold text-positive">
                                {fmtUsdFa(sd.newCombinedAvgCostUsd)}
                              </td>
                              <td className="py-2 font-semibold text-ink">
                                +{toFaDigits(sd.bounceToBreakEvenPct.toFixed(1))}٪
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* بخش ج: خروجی کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents) برای این رمزارز */}
                  <div className="space-y-3 rounded-card border border-accent/30 bg-surface-2/50 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-accent" aria-hidden />
                        <h4 className="text-xs font-extrabold text-ink">
                          گزارش کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents) روی {item.nameFa}
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={ratingMeta.tone}>{ratingMeta.label}</Badge>
                        <Badge tone={traderMeta.tone}>{traderMeta.label}</Badge>
                      </div>
                    </div>

                    <p className="text-xs leading-7 text-ink">
                      {activeReport.riskDebate.portfolioDecision.executiveSummary}
                    </p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-field border border-gain/25 bg-gain/5 p-3 text-xs leading-6">
                        <p className="font-extrabold text-positive flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                          پژوهشگر صعودی (Bull Researcher)
                        </p>
                        <p className="mt-1 text-ink">{activeReport.researchDebate.bullHistory}</p>
                      </div>

                      <div className="rounded-field border border-negative/25 bg-negative/5 p-3 text-xs leading-6">
                        <p className="font-extrabold text-negative flex items-center gap-1">
                          <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                          پژوهشگر نزولی (Bear Researcher)
                        </p>
                        <p className="mt-1 text-ink">{activeReport.researchDebate.bearHistory}</p>
                      </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-3 text-xs">
                      <div className="rounded-field bg-card p-2.5">
                        <span className="font-bold text-positive block">دیدگاه ریسک تهاجمی:</span>
                        <p className="mt-1 text-muted leading-6">{activeReport.riskDebate.aggressiveArgument}</p>
                      </div>
                      <div className="rounded-field bg-card p-2.5">
                        <span className="font-bold text-warn block">دیدگاه ریسک محافظه‌کار:</span>
                        <p className="mt-1 text-muted leading-6">{activeReport.riskDebate.conservativeArgument}</p>
                      </div>
                      <div className="rounded-field bg-card p-2.5">
                        <span className="font-bold text-accent block">دیدگاه ریسک متوازن:</span>
                        <p className="mt-1 text-muted leading-6">{activeReport.riskDebate.neutralArgument}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Surface>
          );
        })}
      </div>

      {/* ۴) کارت مقایسه تخصصی طلای XAUT در برابر PAXG و جایگزینی تک‌کلیکی */}
      <Surface className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">
              مقایسه طلای توکنایز: تتر گلد (XAUT) در برابر پکس گلد (PAXG) — کدام در سبد بماند؟
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => handleSwapGoldToken('XAUT')}>
              انتخاب XAUT و حذف PAXG (پیشنهادی)
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSwapGoldToken('PAXG')}>
              جایگزینی با PAXG
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {GOLD_TOKEN_COMPARISON.map((g) => (
            <div
              key={g.symbol}
              className={cn(
                'rounded-card border p-3.5 text-xs space-y-2',
                g.recommendedForUser
                  ? 'border-accent bg-accent-soft/20'
                  : 'border-divider bg-surface-2/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MarketAssetLogo symbol={g.symbol} size={28} />
                  <span className="text-sm font-extrabold text-ink">{g.nameFa}</span>
                  <span dir="ltr" className="font-mono text-xs text-muted">
                    ({g.symbol})
                  </span>
                </div>
                {g.recommendedForUser ? (
                  <Badge tone="gain">پیشنهاد کمیته برای ۵,۰۰۰ USDT</Badge>
                ) : (
                  <Badge tone="neutral">جایگزین دلاری / USDC</Badge>
                )}
              </div>

              <dl className="space-y-1 text-muted leading-6">
                <div>
                  <dt className="inline font-bold text-ink">صادرکننده و چارچوب: </dt>
                  <dd className="inline">{g.issuerFa} ({g.regulatorFa})</dd>
                </div>
                <div>
                  <dt className="inline font-bold text-ink">حسابرس و خزانه: </dt>
                  <dd className="inline">{g.auditorFa} · {g.vaultLocationFa}</dd>
                </div>
                <div>
                  <dt className="inline font-bold text-ink">جفت‌ارز بهینه و نقدشوندگی: </dt>
                  <dd className="inline">{g.liquidityAdvantageFa}</dd>
                </div>
              </dl>

              <p className="border-t border-divider pt-2 text-ink font-semibold leading-6">
                {g.summaryFa}
              </p>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}
