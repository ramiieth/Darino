/**
 * تب و بخش «ستاپ پایان ماه (EOM Setup — Hartley & Schwarz 2019)»
 *
 * بازطراحی کامل، رنگی و مدرن برای نسخه وب و PWA:
 *   - هدر گرادیانت رنگی متناسب با گروه دارایی + لوگوی زنده دارایی و نشانگر بستر معاملاتی
 *   - کارت‌های انتخاب دارایی با لوگوی واقعی (`MarketAssetLogo` و `AssetLogo`) + اسکرول افقی نرم در موبایل/PWA
 *   - کارت‌های انتخاب بستر معامله با لوگوی رسمی پلتفرم‌ها و شبکه‌ها (`/logos/chain-1.svg`, `platform-lighter.png`, `platform-arcus.png`, `platform-ondo.png`, `chain-999.png`)
 *   - کارت کانونی «پیشنهاد ورود و خروج» با نوار پیشرفت تقویمی تا پایان ماه، سطوح ورود/خروج/استاپ/تارگت و سایزینگ ریسک
 *   - نمایش کارتی موبایل/PWA و جدول تعاملی دسکتاپ برای جدول ۱، ۲ (Win Rate) و ۳ (Sharpe) در t=1..10
 *   - ماتریس رنگی حساسیت گس اتریوم (<$0.50 تا $15) و نقشه گرمایی ۱۲ ماهه جدول ۶ مقاله
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Coins,
  Flame,
  Fuel,
  Landmark,
  Layers,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp
} from 'lucide-react';
import { Surface, Section } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { cn } from '@/shared/lib/cn';
import { toFaDigits, toEnDigits } from '@/shared/utils/formatters';
import {
  ETH_GAS_REGIMES,
  EXECUTION_VENUE_PRESETS,
  PAPER_TABLE_8_FUTURES,
  buildEomTradeSignal,
  buildPaperBenchmarkStudy,
  computeRoundTripCost,
  runEmpiricalEomStudy,
  type ExecutionVenueId
} from '../domain/eomPaper';
import {
  EOM_SELECTABLE_ASSETS,
  useEomDailyCandles,
  type EomAssetGroup
} from '../data/eomData';
import { useCommitteeMarkets } from '../data/intelApi';

const parseNum = (s: string, fallback: number, min = 0, max = 1_000_000_000) => {
  const n = Number(toEnDigits(s).replace(/[,٫]/g, '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

const fmtPct = (v: number, digits = 2, signed = true) => {
  const s = signed && v > 0 ? '+' : '';
  return `${s}${toFaDigits(v.toFixed(digits))}٪`;
};

const fmtBps = (pctVal: number, signed = true) => {
  const bps = pctVal * 100;
  const s = signed && bps > 0 ? '+' : '';
  return `${s}${toFaDigits(bps.toFixed(1))} bps`;
};

const GROUP_META: Record<
  EomAssetGroup,
  {
    label: string;
    short: string;
    icon: React.ReactNode;
    gradient: string;
    ring: string;
    pillBg: string;
  }
> = {
  treasury: {
    label: 'اوراق خزانه (پیپر)',
    short: 'اوراق خزانه',
    icon: <Landmark className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-emerald-500/15 via-teal-500/10 to-transparent',
    ring: 'border-emerald-500/35',
    pillBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
  },
  crypto: {
    label: 'رمزارز (BTC/ETH/SOL)',
    short: 'رمزارز',
    icon: <Coins className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-indigo-500/15 via-violet-500/10 to-transparent',
    ring: 'border-indigo-500/35',
    pillBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
  },
  equity: {
    label: 'سهام توکنایز (NVDA/SPY)',
    short: 'سهام و شاخص',
    icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-sky-500/15 via-blue-500/10 to-transparent',
    ring: 'border-sky-500/35',
    pillBg: 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
  },
  commodity: {
    label: 'طلا و نفت (PAXG/WTI)',
    short: 'طلا و نفت',
    icon: <Flame className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-amber-500/15 via-orange-500/10 to-transparent',
    ring: 'border-amber-500/35',
    pillBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
  }
};

const VENUE_VISUAL: Record<
  ExecutionVenueId,
  { logo: string; badgeLogo?: string; accentClass: string; tagFa: string }
> = {
  'dex-eth-low-slip': {
    logo: '/logos/chain-1.svg',
    accentClass: 'border-indigo-500/40 bg-indigo-500/10',
    tagFa: 'گس پویا اتریوم'
  },
  'dex-l2-solana': {
    logo: '/logos/chain-42161.png',
    badgeLogo: '/logos/chain-solana.svg',
    accentClass: 'border-sky-500/40 bg-sky-500/10',
    tagFa: 'گس ۱ سنت'
  },
  lighter: {
    logo: '/logos/platform-lighter.png',
    accentClass: 'border-emerald-500/40 bg-emerald-500/10',
    tagFa: 'کارمزد ۰٪'
  },
  'lighter-robinhood': {
    logo: '/logos/platform-lighter.png',
    badgeLogo: '/logos/chain-4663.svg',
    accentClass: 'border-lime-500/40 bg-lime-500/10',
    tagFa: 'سهام و ETF'
  },
  arcus: {
    logo: '/logos/platform-arcus.png',
    accentClass: 'border-violet-500/40 bg-violet-500/10',
    tagFa: 'پرپ آرکوس'
  },
  'ondo-perps': {
    logo: '/logos/platform-ondo.png',
    accentClass: 'border-cyan-500/40 bg-cyan-500/10',
    tagFa: 'اوراق و RWA'
  },
  hyperliquid: {
    logo: '/logos/chain-999.png',
    accentClass: 'border-teal-500/40 bg-teal-500/10',
    tagFa: 'اصلی و HIP-3'
  }
};

function VenueBadgeLogo({ venueId, label, size = 30 }: { venueId: ExecutionVenueId; label: string; size?: number }) {
  const v = VENUE_VISUAL[venueId];
  return (
    <span className="relative inline-flex shrink-0">
      <LogoImage src={v.logo} label={label} size={size} />
      {v.badgeLogo && (
        <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-px ring-1 ring-divider">
          <LogoImage src={v.badgeLogo} label="شبکه" size={Math.round(size * 0.48)} />
        </span>
      )}
    </span>
  );
}

export function EomSetupTab() {
  const [group, setGroup] = useState<EomAssetGroup>('treasury');
  const [assetId, setAssetId] = useState<string>('US10Y_TLT');
  const [venueId, setVenueId] = useState<ExecutionVenueId>('dex-eth-low-slip');
  const [selectedT, setSelectedT] = useState<string>('auto');

  const [capitalStr, setCapitalStr] = useState<string>('10000');
  const [riskPctStr, setRiskPctStr] = useState<string>('1.0');
  const [feePctStr, setFeePctStr] = useState<string>('0.01');
  const [slipPctStr, setSlipPctStr] = useState<string>('0.01');
  const [gasUsdStr, setGasUsdStr] = useState<string>('0.35');
  const [financingAprStr, setFinancingAprStr] = useState<string>('0');

  const selectedAsset = useMemo(
    () => EOM_SELECTABLE_ASSETS.find((a) => a.id === assetId) ?? EOM_SELECTABLE_ASSETS[0],
    [assetId]
  );

  const selectedVenue = useMemo(
    () => EXECUTION_VENUE_PRESETS.find((v) => v.id === venueId) ?? EXECUTION_VENUE_PRESETS[0],
    [venueId]
  );

  useEffect(() => {
    setFeePctStr(String(selectedVenue.oneWayFeePct));
    setSlipPctStr(String(selectedVenue.oneWaySlippagePct));
    setGasUsdStr(String(selectedVenue.defaultGasUsdPerTx));
    setFinancingAprStr(String(selectedVenue.defaultAnnualFinancingPct));
  }, [selectedVenue]);

  const groupAssets = useMemo(
    () => EOM_SELECTABLE_ASSETS.filter((a) => a.group === group),
    [group]
  );

  const handleGroupChange = (g: EomAssetGroup) => {
    setGroup(g);
    const first = EOM_SELECTABLE_ASSETS.find((a) => a.group === g);
    if (first) setAssetId(first.id);
  };

  const marketsQuery = useCommitteeMarkets();
  const candlesQuery = useEomDailyCandles(selectedAsset);

  const livePrice = useMemo(() => {
    if (!selectedAsset.hlCoin || !marketsQuery.data) return selectedAsset.refPrice;
    const found = marketsQuery.data.find(
      (m) => m.coin.toUpperCase() === selectedAsset.hlCoin!.toUpperCase()
    );
    return found && found.markPx > 0 ? found.markPx : selectedAsset.refPrice;
  }, [selectedAsset, marketsQuery.data]);

  const capitalUsd = parseNum(capitalStr, 10000, 10);
  const userRiskPct = parseNum(riskPctStr, 1.0, 0.1, 10);
  const oneWayFeePct = parseNum(feePctStr, selectedVenue.oneWayFeePct, 0, 5);
  const oneWaySlippagePct = parseNum(slipPctStr, selectedVenue.oneWaySlippagePct, 0, 5);
  const gasUsdPerTx = parseNum(gasUsdStr, selectedVenue.defaultGasUsdPerTx, 0, 500);
  const annualFinancingPct = parseNum(financingAprStr, selectedVenue.defaultAnnualFinancingPct, 0, 100);

  const study = useMemo(() => {
    if (selectedAsset.paperMaturity) {
      return buildPaperBenchmarkStudy({
        maturity: selectedAsset.paperMaturity,
        oneWayFeePct,
        oneWaySlippagePct,
        gasUsdPerTx,
        positionNotionalUsd: capitalUsd,
        annualFinancingPct
      });
    }
    const bars = candlesQuery.data?.candles ?? [];
    if (!bars.length) return null;
    return runEmpiricalEomStudy(bars, {
      coin: selectedAsset.symbolDisplay,
      oneWayFeePct,
      oneWaySlippagePct,
      gasUsdPerTx,
      positionNotionalUsd: capitalUsd,
      annualFinancingPct
    });
  }, [
    selectedAsset,
    candlesQuery.data,
    oneWayFeePct,
    oneWaySlippagePct,
    gasUsdPerTx,
    capitalUsd,
    annualFinancingPct
  ]);

  const activeT = useMemo(() => {
    if (!study) return 3;
    if (selectedT === 'auto') return study.optimalT;
    const parsed = Number(selectedT);
    return parsed >= 1 && parsed <= 10 ? parsed : study.optimalT;
  }, [study, selectedT]);

  const activeWindowStats = useMemo(() => {
    if (!study) return null;
    return study.windows.find((w) => w.t === activeT) ?? study.optimalWindow;
  }, [study, activeT]);

  const roundTripCost = useMemo(
    () =>
      computeRoundTripCost({
        oneWayFeePct,
        oneWaySlippagePct,
        gasUsdPerTx,
        positionNotionalUsd: capitalUsd,
        calendarDaysHeld: Math.ceil(activeT * 1.4),
        annualFinancingPct: selectedAsset.paperMaturity ? 0 : annualFinancingPct
      }),
    [oneWayFeePct, oneWaySlippagePct, gasUsdPerTx, capitalUsd, activeT, selectedAsset.paperMaturity, annualFinancingPct]
  );

  const signalTicket = useMemo(() => {
    if (!activeWindowStats) return null;
    return buildEomTradeSignal({
      coin: selectedAsset.symbolDisplay,
      referencePrice: livePrice,
      selectedT: activeT,
      windowStats: activeWindowStats,
      roundTripCostPct: roundTripCost.totalCostPct,
      capitalUsd,
      userRiskPct,
      isDexSpot: selectedVenue.kind === 'dex'
    });
  }, [
    selectedAsset.symbolDisplay,
    livePrice,
    activeT,
    activeWindowStats,
    roundTripCost.totalCostPct,
    capitalUsd,
    userRiskPct,
    selectedVenue.kind
  ]);

  const groupStyle = GROUP_META[group];

  return (
    <div className="space-y-5">
      {/* ۱) هدر رنگی و مدرن + انتخابگر گروه و دارایی با لوگوهای واقعی */}
      <Surface className={cn('relative overflow-hidden border p-4 sm:p-5', groupStyle.ring)}>
        <div
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 bg-gradient-to-bl opacity-90', groupStyle.gradient)}
        />
        <div className="relative space-y-4">
          {/* ردیف بالای کارت: لوگوی دارایی انتخابی + عنوان + قیمت زنده + شمارشگر */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 rounded-full bg-card p-1 shadow-sm ring-2 ring-divider">
                <MarketAssetLogo symbol={selectedAsset.logoKey} size={44} />
                <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-0.5 ring-1 ring-divider">
                  <VenueBadgeLogo venueId={venueId} label={selectedVenue.shortFa} size={18} />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', groupStyle.pillBg)}>
                    {groupStyle.icon}
                    {groupStyle.short}
                  </span>
                  <Badge tone="info" className="text-[10px]">
                    {selectedAsset.paperMaturity
                      ? 'داده ۲۹ ساله پیپر (۳۴۸ ماه)'
                      : candlesQuery.data?.source === 'live'
                        ? `زنده (${toFaDigits(study?.totalMonths ?? 0)} ماه)`
                        : `روزانه (${toFaDigits(study?.totalMonths ?? 0)} ماه)`}
                  </Badge>
                </div>
                <h3 className="mt-1 truncate text-base font-extrabold text-ink sm:text-lg">
                  {selectedAsset.nameFa}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span dir="ltr" className="font-mono font-bold text-ink">
                    {selectedAsset.symbolDisplay}
                  </span>
                  <span>·</span>
                  <span dir="ltr" className="font-extrabold text-ink">
                    ${toFaDigits(livePrice.toLocaleString('en-US'))}
                  </span>
                </div>
              </div>
            </div>

            {signalTicket && (
              <div className="flex items-center gap-2 rounded-card border border-divider bg-card/85 px-3 py-2 backdrop-blur">
                <Calendar className="h-4 w-4 text-accent" aria-hidden />
                <div className="text-xs">
                  <p className="text-[10px] text-muted">وضعیت تقویم ماه جاری</p>
                  <p className="font-extrabold text-ink">{toFaDigits(signalTicket.timingBadgeFa)}</p>
                </div>
              </div>
            )}
          </div>

          {/* تب‌های رنگی انتخاب گروه دارایی (موبایل و دسکتاپ) */}
          <div
            role="tablist"
            aria-label="گروه دارایی‌ها"
            className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            {(Object.keys(GROUP_META) as EomAssetGroup[]).map((gKey) => {
              const gm = GROUP_META[gKey];
              const active = group === gKey;
              return (
                <button
                  key={gKey}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleGroupChange(gKey)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all',
                    active
                      ? 'border-accent bg-accent text-on-accent shadow-sm'
                      : 'border-divider bg-card/80 text-muted hover:border-accent/40 hover:text-ink'
                  )}
                >
                  {gm.icon}
                  <span>{gm.label}</span>
                </button>
              );
            })}
          </div>

          {/* کارت‌های انتخابگر دارایی با لوگو (افقی در PWA موبایل / گرید در دسکتاپ) */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:overflow-visible">
            {groupAssets.map((a) => {
              const active = a.id === assetId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAssetId(a.id)}
                  className={cn(
                    'flex min-w-[148px] shrink-0 items-center gap-2.5 rounded-card border p-2.5 text-start transition-all sm:min-w-0',
                    active
                      ? 'border-accent bg-card shadow-sm ring-1 ring-accent'
                      : 'border-divider bg-card/65 hover:border-accent/40 hover:bg-card'
                  )}
                >
                  <MarketAssetLogo symbol={a.logoKey} size={30} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-ink" dir="ltr">
                      {a.symbolDisplay}
                    </p>
                    <p className="truncate text-[10px] text-muted">{a.nameFa.split('(')[0].trim()}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* برچسب توکن‌های متناظر */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span className="font-semibold text-ink">نمادهای قابل معامله:</span>
            {selectedAsset.tokenizedSymbols.map((sym) => (
              <span
                key={sym}
                dir="ltr"
                className="rounded-full border border-divider bg-card/90 px-2.5 py-0.5 font-mono text-[10px] font-bold text-ink"
              >
                {sym}
              </span>
            ))}
          </div>
        </div>
      </Surface>

      {/* ۲) انتخابگر بصری بستر معاملاتی با لوگوهای واقعی + کنترل گس اتریوم و پنجره t */}
      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden />
            <h4 className="text-sm font-extrabold text-ink">بستر اجرای معامله (DEX کم‌اسلیپیج یا پرپچوال)</h4>
          </div>
          <SegmentedControl<string>
            label="پنجره نگهداری t"
            value={selectedT}
            onChange={setSelectedT}
            options={[
              { value: 'auto', label: `بهینه (t=${toFaDigits(study?.optimalT ?? 3)})` },
              { value: '1', label: 't=1' },
              { value: '2', label: 't=2' },
              { value: '3', label: 't=3' },
              { value: '5', label: 't=5' }
            ]}
          />
        </div>

        {/* گرید کارت‌های پلتفرم با لوگو */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
          {EXECUTION_VENUE_PRESETS.map((v) => {
            const active = v.id === venueId;
            const vis = VENUE_VISUAL[v.id];
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVenueId(v.id)}
                className={cn(
                  'flex min-w-[205px] shrink-0 items-center justify-between gap-2 rounded-card border p-2.5 text-start transition-all sm:min-w-0',
                  active
                    ? cn('ring-1 ring-accent shadow-sm', vis.accentClass)
                    : 'border-divider bg-surface-2/50 hover:border-accent/40 hover:bg-surface-2'
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <VenueBadgeLogo venueId={v.id} label={v.shortFa} size={30} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-ink">{v.shortFa}</p>
                    <p className="truncate text-[10px] text-muted">{vis.tagFa}</p>
                  </div>
                </div>
                <span dir="ltr" className="shrink-0 rounded-md bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink ring-1 ring-divider">
                  {v.oneWayFeePct === 0 ? '0%' : `${toFaDigits(v.oneWayFeePct)}%`}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs leading-6 text-muted">{selectedVenue.descriptionFa}</p>

        {/* نوار تنظیم سریع گس اتریوم + پارامترهای هزینه */}
        <div className="rounded-card border border-divider bg-surface-2/40 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <Fuel className="h-4 w-4 text-amber-500" aria-hidden />
              <span>رژیم گس شبکه اتریوم / DEX و پارامترهای ریسک</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ETH_GAS_REGIMES.map((g) => {
                const active = Number(gasUsdStr) === g.gasUsdPerTx;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGasUsdStr(String(g.gasUsdPerTx))}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
                      active
                        ? g.gasUsdPerTx <= 0.5
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                          : g.gasUsdPerTx <= 5
                            ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                            : 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                        : 'border-divider bg-card text-muted hover:text-ink'
                    )}
                  >
                    {toFaDigits(g.labelFa)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="سرمایه ($)">
              <Input dir="ltr" inputMode="decimal" value={capitalStr} onChange={(e) => setCapitalStr(e.target.value)} suffix="$" />
            </Field>
            <Field label="ریسک مجاز (%)">
              <Input dir="ltr" inputMode="decimal" value={riskPctStr} onChange={(e) => setRiskPctStr(e.target.value)} suffix="%" />
            </Field>
            <Field label="کارمزد هر سر (%)">
              <Input dir="ltr" inputMode="decimal" value={feePctStr} onChange={(e) => setFeePctStr(e.target.value)} suffix="%" />
            </Field>
            <Field label="اسلیپیج هر سر (%)">
              <Input dir="ltr" inputMode="decimal" value={slipPctStr} onChange={(e) => setSlipPctStr(e.target.value)} suffix="%" />
            </Field>
            <Field label="گس هر سواپ ($)">
              <Input dir="ltr" inputMode="decimal" value={gasUsdStr} onChange={(e) => setGasUsdStr(e.target.value)} suffix="$" />
            </Field>
            <Field label="تامین مالی (%)">
              <Input dir="ltr" inputMode="decimal" value={financingAprStr} onChange={(e) => setFinancingAprStr(e.target.value)} suffix="%" />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-card/80 px-3 py-2 text-xs">
            <span className="text-muted">کل هزینه رفت‌وبرگشت (ورود + خروج):</span>
            <span className="font-mono font-extrabold text-ink" dir="ltr">
              {toFaDigits(roundTripCost.totalCostBps.toFixed(1))} bps ({toFaDigits(roundTripCost.totalCostPct.toFixed(3))}٪ ≈ ${toFaDigits(roundTripCost.totalCostUsd.toFixed(2))})
            </span>
          </div>
        </div>
      </Surface>

      {/* ۳) کارت کانونی پیشنهاد ورود و خروج (Signal Ticket) */}
      {candlesQuery.isLoading && !study ? (
        <ListSkeleton rows={4} />
      ) : signalTicket && study && activeWindowStats ? (
        <>
          <Surface
            variant="focal"
            className={cn(
              'relative overflow-hidden border-2 p-4 sm:p-5 space-y-4',
              signalTicket.hasPositiveNetEdge
                ? 'border-emerald-500/60 bg-gradient-to-br from-emerald-500/10 via-card to-teal-500/5'
                : 'border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-card to-rose-500/5'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    signalTicket.hasPositiveNetEdge ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'
                  )}
                >
                  <Target className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-extrabold text-ink">کارت پیشنهاد ورود و خروج به بازار</p>
                  <p className="text-[11px] text-muted">اجرا با مسئولیت و مدیریت ریسک شخصی شما</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={signalTicket.hasPositiveNetEdge ? 'gain' : 'warn'}>
                  {signalTicket.hasPositiveNetEdge
                    ? `تایید آماری · نرخ برد ${toFaDigits(signalTicket.execution.winRatePct)}٪`
                    : 'احتیاط: هزینه بالا یا نرخ برد زیر ۵۰٪'}
                </Badge>
                <Badge tone="info">{toFaDigits(signalTicket.timingBadgeFa)}</Badge>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-base font-extrabold text-ink sm:text-lg">
                <ArrowUpRight className="h-5 w-5 shrink-0 text-positive" aria-hidden />
                {toFaDigits(signalTicket.actionHeadlineFa)}
              </h3>
              <p className="text-xs leading-6 text-muted sm:text-sm sm:leading-7">
                {toFaDigits(signalTicket.actionDetailFa)}
              </p>
            </div>

            {/* نوار ۴ کارت رنگی ورود، خروج، استاپ، حجم */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-card border border-sky-500/30 bg-sky-500/10 p-3">
                <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  ورود (بسته شدن T-{toFaDigits(signalTicket.selectedT)})
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-ink" dir="ltr">
                  {signalTicket.entryDateIso} · ${toFaDigits(signalTicket.execution.entryPrice.toLocaleString('en-US'))}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">جهت طبق پیپر: خرید (LONG)</p>
              </div>

              <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  خروج تقویمی و هدف (T-0)
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-positive" dir="ltr">
                  {signalTicket.exitDateIso} · ${toFaDigits(signalTicket.execution.targetPrice.toLocaleString('en-US'))}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  امید خالص: <bdi dir="ltr">{fmtPct(signalTicket.execution.expectedNetPct, 2)}</bdi> ({fmtBps(signalTicket.execution.expectedNetPct)})
                </p>
              </div>

              <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-3">
                <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  حد ضرر اضطراری (صدک ۵٪)
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-negative" dir="ltr">
                  ${toFaDigits(signalTicket.execution.stopLossPrice.toLocaleString('en-US'))} (-{toFaDigits(signalTicket.execution.stopDistancePct)}%)
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  سقف ضرر: <bdi dir="ltr">-${toFaDigits(signalTicket.execution.maxRiskLossUsd)}</bdi> ({toFaDigits(userRiskPct)}٪ سرمایه)
                </p>
              </div>

              <div className="rounded-card border border-violet-500/30 bg-violet-500/10 p-3">
                <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                  سایز پوزیشن و سود مورد انتظار
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-ink" dir="ltr">
                  ${toFaDigits(signalTicket.execution.positionNotionalUsd.toLocaleString('en-US'))} ({toFaDigits(signalTicket.execution.recommendedLeverage)}x)
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  سود خالص ماه:{' '}
                  <bdi dir="ltr" className={signalTicket.execution.expectedNetProfitUsd > 0 ? 'font-bold text-positive' : 'font-bold text-negative'}>
                    ${toFaDigits(signalTicket.execution.expectedNetProfitUsd)}
                  </bdi>
                </p>
              </div>
            </div>

            {/* نوار شاخص‌های کلیدی راستی‌آزمایی */}
            <div className="grid grid-cols-2 gap-2 border-t border-divider pt-3 sm:grid-cols-5 text-center text-xs">
              <div className="rounded-field bg-card/80 p-2">
                <p className="text-[10px] text-muted">نرخ برد خالص (Win Rate)</p>
                <p className="mt-0.5 text-sm font-extrabold text-positive">{toFaDigits(activeWindowStats.netWinRatePct)}٪</p>
              </div>
              <div className="rounded-field bg-card/80 p-2">
                <p className="text-[10px] text-muted">شارپ سالانه (T-{toFaDigits(activeT)})</p>
                <p className="mt-0.5 font-mono text-sm font-extrabold text-ink" dir="ltr">
                  {toFaDigits(activeWindowStats.netAnnualizedSharpe.toFixed(2))}
                </p>
              </div>
              <div className="rounded-field bg-card/80 p-2">
                <p className="text-[10px] text-muted">شارپ سایر روزهای ماه</p>
                <p className="mt-0.5 font-mono text-sm font-extrabold text-muted" dir="ltr">
                  {toFaDigits(activeWindowStats.allExceptLastTSharpe.toFixed(2))}
                </p>
              </div>
              <div className="rounded-field bg-card/80 p-2">
                <p className="text-[10px] text-muted">دامنه تاریخی (Min..Max)</p>
                <p className="mt-0.5 font-mono text-xs font-extrabold text-ink" dir="ltr">
                  {toFaDigits(activeWindowStats.minReturnPct)}%..+{toFaDigits(activeWindowStats.maxReturnPct)}%
                </p>
              </div>
              <div className="col-span-2 rounded-field bg-card/80 p-2 sm:col-span-1">
                <p className="text-[10px] text-muted">چولگی توزیع (شکل ۱)</p>
                <p className="mt-0.5 font-mono text-sm font-extrabold text-ink" dir="ltr">
                  {activeWindowStats.skewness >= 0 ? '+' : ''}
                  {toFaDigits(activeWindowStats.skewness.toFixed(2))}
                </p>
              </div>
            </div>
          </Surface>

          {/* ۴) راستی‌آزمایی جداول ۱، ۲ و ۳ (کارتی در PWA موبایل / جدول در دسکتاپ) */}
          <Section title={`راستی‌آزمایی جداول ۱، ۲ (Win Rate) و ۳ (Sharpe) برای t = ۱ تا ۱۰ روی ${selectedAsset.symbolDisplay}`}>
            <Surface className="p-4 space-y-3">
              <p className="text-xs leading-6 text-muted">
                مقایسه <strong className="text-ink">t روز آخر ماه (معادله ۱)</strong> در برابر{' '}
                <strong className="text-ink">سایر روزهای ماه (معادله ۲)</strong> از <bdi dir="ltr">{study.sampleStartIso}</bdi> تا{' '}
                <bdi dir="ltr">{study.sampleEndIso}</bdi> ({toFaDigits(study.totalMonths)} ماه). برای تغییر پنجره روی هر گزینه بزنید:
              </p>

              {/* نمای کارتی مخصوص PWA موبایل */}
              <div className="grid gap-2 sm:hidden">
                {study.windows.map((w) => {
                  const isSelected = w.t === activeT;
                  const isOptimal = w.t === study.optimalT;
                  return (
                    <button
                      key={w.t}
                      type="button"
                      onClick={() => setSelectedT(String(w.t))}
                      className={cn(
                        'w-full rounded-card border p-3 text-start transition-all',
                        isSelected
                          ? 'border-accent bg-accent-soft/35 ring-1 ring-accent'
                          : 'border-divider bg-surface-2/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="font-mono text-sm font-extrabold text-ink">
                            t = {toFaDigits(w.t)}
                          </span>
                          {isOptimal && (
                            <Badge tone="gain" className="text-[10px]">
                              بهینه
                            </Badge>
                          )}
                        </div>
                        <span
                          dir="ltr"
                          className={cn(
                            'font-mono text-sm font-extrabold',
                            w.netLastTMeanPct > 0 ? 'text-positive' : 'text-negative'
                          )}
                        >
                          {fmtPct(w.netLastTMeanPct, 2)}
                          {w.significanceStars}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-muted">نرخ برد: </span>
                          <strong className="text-ink">{toFaDigits(w.netWinRatePct)}٪</strong>
                        </div>
                        <div>
                          <span className="text-muted">شارپ آخر ماه: </span>
                          <strong dir="ltr" className="text-ink">
                            {toFaDigits(w.netAnnualizedSharpe.toFixed(2))}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted">شارپ بقیه ماه: </span>
                          <strong dir="ltr" className="text-muted">
                            {toFaDigits(w.allExceptLastTSharpe.toFixed(2))}
                          </strong>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* نمای جدولی مخصوص وب دسکتاپ */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-2 font-semibold">پنجره (t)</th>
                      <th className="pb-2 font-semibold">بازده ناخالص</th>
                      <th className="pb-2 font-semibold">بازده خالص (پس از گس و کارمزد)</th>
                      <th className="pb-2 font-semibold">خطای استاندارد</th>
                      <th className="pb-2 font-semibold">نرخ برد (Win Rate)</th>
                      <th className="pb-2 font-semibold">شارپ آخر ماه</th>
                      <th className="pb-2 font-semibold">بازده بقیه ماه</th>
                      <th className="pb-2 font-semibold">شارپ بقیه ماه</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60">
                    {study.windows.map((w) => {
                      const isSelected = w.t === activeT;
                      const isOptimal = w.t === study.optimalT;
                      return (
                        <tr
                          key={w.t}
                          onClick={() => setSelectedT(String(w.t))}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-surface-2/60',
                            isSelected && 'bg-accent-soft/35 font-semibold'
                          )}
                        >
                          <td className="py-2 text-ink" dir="ltr">
                            t = {toFaDigits(w.t)}{' '}
                            {isOptimal && (
                              <Badge tone="gain" className="ms-1">
                                بهینه
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 font-mono" dir="ltr">
                            {fmtPct(w.grossLastTMeanPct, 2)}
                          </td>
                          <td
                            className={cn(
                              'py-2 font-mono font-bold',
                              w.netLastTMeanPct > 0 ? 'text-positive' : 'text-negative'
                            )}
                            dir="ltr"
                          >
                            {fmtPct(w.netLastTMeanPct, 2)}
                            {w.significanceStars}
                          </td>
                          <td className="py-2 font-mono text-muted" dir="ltr">
                            ({toFaDigits(w.lastTSePct.toFixed(2))}%)
                          </td>
                          <td className="py-2 font-mono">
                            <span className={w.netWinRatePct >= 55 ? 'font-bold text-positive' : 'text-ink'}>
                              {toFaDigits(w.netWinRatePct)}٪
                            </span>{' '}
                            <span className="text-[11px] text-muted">(خام {toFaDigits(w.grossWinRatePct)}٪)</span>
                          </td>
                          <td
                            className={cn(
                              'py-2 font-mono font-bold',
                              w.netAnnualizedSharpe >= 0.7 ? 'text-positive' : w.netAnnualizedSharpe > 0 ? 'text-ink' : 'text-negative'
                            )}
                            dir="ltr"
                          >
                            {toFaDigits(w.netAnnualizedSharpe.toFixed(2))}
                          </td>
                          <td className="py-2 font-mono text-muted" dir="ltr">
                            {fmtPct(w.allExceptLastTMeanPct, 2)} ({toFaDigits(w.allExceptLastTSePct.toFixed(2))}%)
                          </td>
                          <td className="py-2 font-mono text-muted" dir="ltr">
                            {toFaDigits(w.allExceptLastTSharpe.toFixed(2))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Surface>
          </Section>

          {/* ۵) تست حساسیت گس اتریوم (کارت‌های رنگی) */}
          <Section title="تست حساسیت گس شبکه اتریوم (از کمتر از ۰.۵ دلار تا شلوغی ۱۵ دلاری)">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {study.gasSensitivity.map((row) => (
                <Surface
                  key={row.regime.id}
                  className={cn(
                    'border p-3.5 space-y-1.5',
                    row.profitable
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-rose-500/40 bg-rose-500/5'
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-extrabold text-ink">{toFaDigits(row.regime.labelFa)}</span>
                    {row.profitable ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" aria-hidden />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-negative" aria-hidden />
                    )}
                  </div>
                  <p className="text-[11px] text-muted">
                    هزینه کل رفت‌وبرگشت: <bdi dir="ltr">{toFaDigits(row.roundTripCostBps)} bps</bdi>
                  </p>
                  <p className="text-base font-extrabold" dir="ltr">
                    <span className={row.netMeanReturnBps > 0 ? 'text-positive' : 'text-negative'}>
                      {row.netMeanReturnBps > 0 ? '+' : ''}
                      {toFaDigits(row.netMeanReturnBps)} bps / ماه
                    </span>
                  </p>
                  <p className="text-[11px] text-muted">
                    نرخ برد: <strong className="text-ink">{toFaDigits(row.netWinRatePct)}٪</strong> · شارپ:{' '}
                    <bdi dir="ltr" className="font-semibold text-ink">
                      {toFaDigits(row.netAnnualizedSharpe)}
                    </bdi>
                  </p>
                </Surface>
              ))}
            </div>
          </Section>

          {/* ۶) نقشه گرمایی ۱۲ ماهه (جدول ۶ مقاله) */}
          <Section title={`نقشه گرمایی ۱۲ ماهه (جدول ۶ مقاله برای ${selectedAsset.symbolDisplay})`}>
            <Surface className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {study.byMonth.map((m) => {
                const curMonth = new Date().getUTCMonth() + 1;
                const isCurrent = m.month === curMonth;
                const strong = m.meanNetReturnPct >= 0.15;
                const positive = m.meanNetReturnPct > 0;
                return (
                  <div
                    key={m.month}
                    className={cn(
                      'rounded-card border p-2.5 text-xs transition-all',
                      isCurrent && 'ring-2 ring-accent',
                      strong
                        ? 'border-emerald-500/45 bg-emerald-500/10'
                        : positive
                          ? 'border-teal-500/30 bg-teal-500/5'
                          : 'border-rose-500/30 bg-rose-500/5'
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-ink">{m.nameFa}</span>
                      {isCurrent && (
                        <Badge tone="info" className="text-[9px] px-1.5 py-0">
                          الان
                        </Badge>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-1 font-mono text-sm font-extrabold',
                        positive ? 'text-positive' : 'text-negative'
                      )}
                      dir="ltr"
                    >
                      {fmtPct(m.meanNetReturnPct, 2)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      برد: <strong className="text-ink">{toFaDigits(m.winRateNetPct)}٪</strong>
                    </p>
                  </div>
                );
              })}
            </Surface>
          </Section>

          {/* ۷) جداول مرجع ۷ و ۸ مقاله */}
          <Disclosure summary="مشاهده جداول مرجع ۷ و ۸ مقاله (اوراق On-the-Run ۳۰ ساله و Treasury Futures)">
            <div className="space-y-4 pt-2 text-xs">
              <p className="leading-6 text-muted">
                طبق بخش ۴.۱ و ۴.۲ مقاله، در اوراق <strong className="text-ink">On-the-Run ۳۰ ساله (جدول ۷)</strong> بازده ۲ روز پایانی ماه{' '}
                <strong className="text-positive">۰.۳۷٪ در ماه (۴.۵٪ سالانه با شارپ ۱.۰۲)</strong> و در{' '}
                <strong className="text-ink">قرارداد آتی ۳۰ ساله (جدول ۸، t=5)</strong> برابر{' '}
                <strong className="text-positive">۰.۳۳٪ در ماه</strong> است:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-2">ابزار قابل معامله در مقاله</th>
                      <th className="pb-2" dir="ltr">t=1 / j=1</th>
                      <th className="pb-2" dir="ltr">t=2 / j=2</th>
                      <th className="pb-2" dir="ltr">t=3 / j=3</th>
                      <th className="pb-2" dir="ltr">t=5 / j=5</th>
                      <th className="pb-2">ویژگی کلیدی در مقاله</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60">
                    <tr>
                      <td className="py-2 font-semibold text-ink">On-the-Run ۱۰ ساله (جدول ۷)</td>
                      <td className="py-2 font-mono" dir="ltr">+0.13%***</td>
                      <td className="py-2 font-mono" dir="ltr">+0.07%***</td>
                      <td className="py-2 font-mono" dir="ltr">+0.03%</td>
                      <td className="py-2 font-mono" dir="ltr">+0.04%</td>
                      <td className="py-2 text-muted">شارپ روز آخر ۱.۰۲ · Duration ۸.۰ سال</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold text-ink">On-the-Run ۳۰ ساله (جدول ۷)</td>
                      <td className="py-2 font-mono font-bold text-positive" dir="ltr">+0.25%***</td>
                      <td className="py-2 font-mono font-bold text-positive" dir="ltr">+0.12%**</td>
                      <td className="py-2 font-mono" dir="ltr">+0.08%</td>
                      <td className="py-2 font-mono" dir="ltr">+0.06%</td>
                      <td className="py-2 text-muted">۲ روز آخر = ۰.۳۷٪/ماه (۴.۵٪ سالانه)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold text-ink">Treasury Futures ۵ ساله (جدول ۸)</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['5Y'].lastTMeanPct[0]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['5Y'].lastTMeanPct[1]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['5Y'].lastTMeanPct[2]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['5Y'].lastTMeanPct[4]}%***</td>
                      <td className="py-2 text-muted">بدون هزینه فاندینگ</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold text-ink">Treasury Futures ۱۰ ساله (جدول ۸)</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['10Y'].lastTMeanPct[0]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['10Y'].lastTMeanPct[1]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['10Y'].lastTMeanPct[2]}%***</td>
                      <td className="py-2 font-mono font-bold text-positive" dir="ltr">+{PAPER_TABLE_8_FUTURES['10Y'].lastTMeanPct[4]}%***</td>
                      <td className="py-2 text-muted">سبد تحویل ۶.۵ تا ۱۰ سال</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold text-ink">Treasury Futures ۳۰ ساله (جدول ۸)</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[0]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[1]}%***</td>
                      <td className="py-2 font-mono" dir="ltr">+{PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[2]}%***</td>
                      <td className="py-2 font-mono font-bold text-positive" dir="ltr">+{PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[4]}%***</td>
                      <td className="py-2 text-muted">بیشترین بازده تجمعی (۰.۳۳٪ در ۵ روز)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Disclosure>
        </>
      ) : null}

      <Notice tone="info" icon={<ShieldAlert className="h-4 w-4" />}>
        کارت پیشنهاد ورود و خروج بر مبنای معادلات (۱) و (۲) مقاله Hartley & Schwarz (2019) و بک‌تست کندل‌های روزانه محاسبه می‌شود. ورود به معامله با مسئولیت و مدیریت ریسک شخصی شما انجام می‌گیرد.
      </Notice>
    </div>
  );
}
