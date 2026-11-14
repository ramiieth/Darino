/**
 * تب و بخش «ستاپ پایان ماه (EOM Setup — Hartley & Schwarz 2019)»
 *
 * ارتقا با «DCA پله‌ای روی ریزش قیمت (Limit Dip Ladder & Anchor+Dip)»، اتصال به موجودی کیف پول‌ها
 * و نمایش کاملاً واضحِ سقف تاریخی (ATH)، میزان ریزش از سقف و مدت‌زمان حضور در کانال رنج قیمتی برای هر ۱۹ بازار.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Coins,
  Flame,
  Fuel,
  Landmark,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { useWalletAndCostBridge } from '@/features/performance/data/useWalletAndCostBridge';
import { getAssetAthAndRangeInfo } from '@/features/markets/domain/athAndRangeAnalytics';
import { cn } from '@/shared/lib/cn';
import { toFaDigits, toEnDigits } from '@/shared/utils/formatters';
import {
  ETH_GAS_REGIMES,
  EXECUTION_VENUE_PRESETS,
  PAPER_TABLE_8_FUTURES,
  buildEomDcaPlan,
  buildEomTradeSignal,
  buildPaperBenchmarkStudy,
  computeDefaultDipLadderPrices,
  computeRoundTripCost,
  computeWalletSuggestedCapital,
  runEmpiricalEomStudy,
  type EomExecutionMode,
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

function VenueBadgeLogo({ venueId, label, size = 28 }: { venueId: ExecutionVenueId; label: string; size?: number }) {
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
  const walletBridge = useWalletAndCostBridge();

  const [mode, setMode] = useState<EomExecutionMode>('anchor-dip-dca');
  const [group, setGroup] = useState<EomAssetGroup>('crypto');
  const [assetId, setAssetId] = useState<string>('ETH');
  const [venueId, setVenueId] = useState<ExecutionVenueId>('dex-eth-low-slip');
  const [selectedT, setSelectedT] = useState<string>('auto');

  const [capitalStr, setCapitalStr] = useState<string>('');
  const [capitalEditedByUser, setCapitalEditedByUser] = useState(false);
  const [riskPctStr, setRiskPctStr] = useState<string>('1');
  const [feePctStr, setFeePctStr] = useState<string>('0.01');
  const [slipPctStr, setSlipPctStr] = useState<string>('0.01');
  const [gasUsdStr, setGasUsdStr] = useState<string>('0.35');
  const [financingAprStr, setFinancingAprStr] = useState<string>('0');

  const [customStep1Str, setCustomStep1Str] = useState<string>('');
  const [customStep2Str, setCustomStep2Str] = useState<string>('');
  const [customStep3Str, setCustomStep3Str] = useState<string>('');
  const [stepsEditedByUser, setStepsEditedByUser] = useState(false);

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

  const userRiskPct = parseNum(riskPctStr, 1.0, 0.1, 10);

  const walletSuggestion = useMemo(
    () =>
      computeWalletSuggestedCapital({
        walletTotalUsd: walletBridge.totalLiveUsd,
        perpEquityUsd: walletBridge.costBasis.perpEquityUsd,
        userRiskPct,
        stopDistancePct: group === 'treasury' ? 1.5 : group === 'commodity' ? 2.5 : 4.5,
        isPerpVenue: selectedVenue.kind === 'perp'
      }),
    [walletBridge.totalLiveUsd, walletBridge.costBasis.perpEquityUsd, userRiskPct, group, selectedVenue.kind]
  );

  useEffect(() => {
    if (!capitalEditedByUser) {
      setCapitalStr(String(walletSuggestion.recommendedCapitalUsd));
    }
  }, [walletSuggestion.recommendedCapitalUsd, capitalEditedByUser]);

  const capitalUsd = parseNum(capitalStr, walletSuggestion.recommendedCapitalUsd, 10);
  const oneWayFeePct = parseNum(feePctStr, selectedVenue.oneWayFeePct, 0, 5);
  const oneWaySlippagePct = parseNum(slipPctStr, selectedVenue.oneWaySlippagePct, 0, 5);
  const gasUsdPerTx = parseNum(gasUsdStr, selectedVenue.defaultGasUsdPerTx, 0, 500);
  const annualFinancingPct = parseNum(financingAprStr, selectedVenue.defaultAnnualFinancingPct, 0, 100);

  const groupAssets = useMemo(() => EOM_SELECTABLE_ASSETS.filter((a) => a.group === group), [group]);

  const handleGroupChange = (g: EomAssetGroup) => {
    setGroup(g);
    const first = EOM_SELECTABLE_ASSETS.find((a) => a.group === g);
    if (first) {
      setAssetId(first.id);
      setStepsEditedByUser(false);
    }
  };

  const marketsQuery = useCommitteeMarkets();
  const candlesQuery = useEomDailyCandles(selectedAsset);

  const livePrice = useMemo(() => {
    if (!selectedAsset.hlCoin || !marketsQuery.data) return selectedAsset.refPrice;
    const found = marketsQuery.data.find((m) => m.coin.toUpperCase() === selectedAsset.hlCoin!.toUpperCase());
    return found && found.markPx > 0 ? found.markPx : selectedAsset.refPrice;
  }, [selectedAsset, marketsQuery.data]);

  const athRangeInfo = useMemo(
    () =>
      getAssetAthAndRangeInfo({
        symbol: selectedAsset.logoKey,
        currentPrice: livePrice,
        source: selectedAsset.group === 'crypto' ? 'crypto' : 'tradfi'
      }),
    [selectedAsset.logoKey, selectedAsset.group, livePrice]
  );

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
  }, [selectedAsset, candlesQuery.data, oneWayFeePct, oneWaySlippagePct, gasUsdPerTx, capitalUsd, annualFinancingPct]);

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

  const autoDefaultSteps = useMemo(() => {
    return computeDefaultDipLadderPrices({
      referencePrice: livePrice,
      monthlyStdPct: activeWindowStats?.stdMonthlyPct ?? 2.4,
      mode
    });
  }, [livePrice, activeWindowStats?.stdMonthlyPct, mode]);

  useEffect(() => {
    if (!stepsEditedByUser) {
      setCustomStep1Str(String(autoDefaultSteps[0]));
      setCustomStep2Str(String(autoDefaultSteps[1]));
      setCustomStep3Str(String(autoDefaultSteps[2]));
    }
  }, [autoDefaultSteps, stepsEditedByUser]);

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

  const customStepPrices = useMemo(() => {
    const p1 = parseNum(customStep1Str, autoDefaultSteps[0], 0.000001);
    const p2 = parseNum(customStep2Str, autoDefaultSteps[1], 0.000001);
    const p3 = parseNum(customStep3Str, autoDefaultSteps[2], 0.000001);
    return [p1, p2, p3] as const;
  }, [customStep1Str, customStep2Str, customStep3Str, autoDefaultSteps]);

  const dcaPlan = useMemo(() => {
    if (!signalTicket) return null;
    return buildEomDcaPlan({
      mode,
      signal: signalTicket,
      capitalUsd,
      gasUsdPerTx,
      monthlyStdPct: activeWindowStats?.stdMonthlyPct,
      customStepPrices
    });
  }, [mode, signalTicket, capitalUsd, gasUsdPerTx, activeWindowStats?.stdMonthlyPct, customStepPrices]);

  const groupStyle = GROUP_META[group];

  return (
    <div className="space-y-4">
      {/* ۱) نوار کیف پول متصل + وضعیت کاملاً واضح ATH و رنج دارایی + سوییچ ۳ حالت DCA روی ریزش */}
      <Surface className={cn('relative overflow-hidden border p-4 sm:p-5', groupStyle.ring)}>
        <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-gradient-to-bl opacity-85', groupStyle.gradient)} />
        <div className="relative space-y-4">
          {/* سطر اول: هویت دارایی + موجودی متصل کیف پول */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="relative shrink-0 rounded-full bg-card p-1 shadow-sm ring-2 ring-divider">
                <MarketAssetLogo symbol={selectedAsset.logoKey} size={44} />
                <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-0.5 ring-1 ring-divider">
                  <VenueBadgeLogo venueId={venueId} label={selectedVenue.shortFa} size={18} />
                </span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-ink sm:text-lg">{selectedAsset.nameFa}</h3>
                <p className="text-xs text-muted">
                  نماد:{' '}
                  <strong dir="ltr" className="font-mono font-bold text-ink">
                    {selectedAsset.symbolDisplay}
                  </strong>{' '}
                  · قیمت فعلی:{' '}
                  <strong className="font-extrabold text-ink">
                    {toFaDigits(livePrice.toLocaleString('en-US'))} دلار
                  </strong>
                </p>
                {athRangeInfo && (
                  <div className="grid gap-1.5 pt-0.5 sm:grid-cols-2">
                    <div className="rounded-field border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs leading-5 text-ink">
                      <span className="font-bold text-muted">آخرین سقف تاریخی (ATH): </span>
                      <strong className="font-extrabold">{athRangeInfo.athPriceFa}</strong>
                      <span className="text-muted"> ({athRangeInfo.elapsedSinceAthFa}) · </span>
                      <strong className="font-extrabold text-rose-600 dark:text-rose-300">
                        {athRangeInfo.drawdownClearFa}
                      </strong>
                    </div>
                    <div className="rounded-field border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs leading-5 text-ink">
                      <span className="font-bold text-muted">کانال رنج فعلی: </span>
                      <strong className="font-extrabold text-indigo-700 dark:text-indigo-300">
                        {athRangeInfo.rangeSummarySentenceFa}
                      </strong>
                      <span className="text-muted"> ({athRangeInfo.rangeStatusLabelFa})</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* باکس وضعیت کیف پول متصل */}
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-divider bg-card/90 px-3 py-2 text-xs shadow-2xs">
              <Wallet className="h-4 w-4 text-accent" aria-hidden />
              <div>
                <p className="text-[10px] text-muted">
                  {walletSuggestion.detectedBalanceUsd > 0 ? 'موجودی متصل کیف پول/پرپ' : 'سرمایه فرضی (بدون کیف پول متصل)'}
                </p>
                <p className="text-sm font-extrabold text-ink">
                  {walletSuggestion.detectedBalanceUsd > 0
                    ? `${toFaDigits(walletSuggestion.detectedBalanceUsd.toLocaleString('en-US'))} دلار`
                    : `${toFaDigits(capitalUsd.toLocaleString('en-US'))} دلار`}
                </p>
              </div>
              {capitalEditedByUser && walletSuggestion.detectedBalanceUsd > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCapitalEditedByUser(false);
                    setCapitalStr(String(walletSuggestion.recommendedCapitalUsd));
                  }}
                >
                  پیشنهاد خودکار
                </Button>
              )}
            </div>
          </div>

          {/* سوییچ ۳ حالت تاییدشده با لوپ نقد کمّی */}
          <div className="grid gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={() => {
                setMode('anchor-dip-dca');
                setStepsEditedByUser(false);
              }}
              className={cn(
                'flex items-start gap-2.5 rounded-card border p-3 text-start transition-all',
                mode === 'anchor-dip-dca'
                  ? 'border-accent bg-card shadow-sm ring-1 ring-accent'
                  : 'border-divider bg-card/60 hover:bg-card'
              )}
            >
              <TrendingUp className={cn('mt-0.5 h-4 w-4 shrink-0', mode === 'anchor-dip-dca' ? 'text-accent' : 'text-muted')} />
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-extrabold text-ink">۱. ترکیبی: لنگر + شکار ریزش</p>
                  <Badge tone="gain">شارپ ۲.۰۸</Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  پله ۱ ورود در T-3 (۳۰٪) تا جا نمانید + پله ۲ و ۳ سفارش لیمیت روی ریزش قیمت (۷۰٪) و فروش در روز آخر ماه
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('limit-dip-ladder');
                setStepsEditedByUser(false);
              }}
              className={cn(
                'flex items-start gap-2.5 rounded-card border p-3 text-start transition-all',
                mode === 'limit-dip-ladder'
                  ? 'border-accent bg-card shadow-sm ring-1 ring-accent'
                  : 'border-divider bg-card/60 hover:bg-card'
              )}
            >
              <Target className={cn('mt-0.5 h-4 w-4 shrink-0', mode === 'limit-dip-ladder' ? 'text-accent' : 'text-muted')} />
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-extrabold text-ink">۲. شکارچی خالص ریزش (Limit Ladder)</p>
                  <Badge tone="info">برد ۸۰.۵٪</Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  صبر برای ریزش بیشتر: هر ۳ پله لیمیت زیر قیمت فعلی (مثلاً ۱,۸۲۹ و ۱,۷۲۹ دلار برای اتریوم) و خروج در T-0
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('holder-monthly-dca');
                setStepsEditedByUser(false);
              }}
              className={cn(
                'flex items-start gap-2.5 rounded-card border p-3 text-start transition-all',
                mode === 'holder-monthly-dca'
                  ? 'border-accent bg-card shadow-sm ring-1 ring-accent'
                  : 'border-divider bg-card/60 hover:bg-card'
              )}
            >
              <Sparkles className={cn('mt-0.5 h-4 w-4 shrink-0', mode === 'holder-monthly-dca' ? 'text-accent' : 'text-muted')} />
              <div>
                <p className="text-xs font-extrabold text-ink">۳. زمان‌بندی خرید هولدرها (بدون فروش)</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  مخصوص هولد بلندمدت: خرید در ارزان‌ترین روزهای پیش از رالی پایان ماه (T-4 + لیمیت ریزش T-3)
                </p>
              </div>
            </button>
          </div>

          {/* انتخاب گروه و دارایی با لوگو */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(Object.keys(GROUP_META) as EomAssetGroup[]).map((gKey) => {
              const gm = GROUP_META[gKey];
              const active = group === gKey;
              return (
                <button
                  key={gKey}
                  type="button"
                  onClick={() => handleGroupChange(gKey)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all',
                    active ? 'border-accent bg-accent text-on-accent' : 'border-divider bg-card/80 text-muted hover:text-ink'
                  )}
                >
                  {gm.icon}
                  <span>{gm.label}</span>
                </button>
              );
            })}
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:overflow-visible">
            {groupAssets.map((a) => {
              const active = a.id === assetId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAssetId(a.id);
                    setStepsEditedByUser(false);
                  }}
                  className={cn(
                    'flex min-w-[140px] shrink-0 items-center gap-2 rounded-card border p-2 text-start transition-all sm:min-w-0',
                    active ? 'border-accent bg-card shadow-sm ring-1 ring-accent' : 'border-divider bg-card/65 hover:bg-card'
                  )}
                >
                  <MarketAssetLogo symbol={a.logoKey} size={28} />
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

          {/* انتخاب سریع بستر و سرمایه + ریسک */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:overflow-visible">
            {EXECUTION_VENUE_PRESETS.map((v) => {
              const active = v.id === venueId;
              const vis = VENUE_VISUAL[v.id];
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVenueId(v.id)}
                  className={cn(
                    'flex min-w-[150px] shrink-0 items-center gap-2 rounded-card border p-2 text-start transition-all sm:min-w-0',
                    active ? cn('ring-1 ring-accent shadow-sm', vis.accentClass) : 'border-divider bg-card/70 hover:bg-card'
                  )}
                >
                  <VenueBadgeLogo venueId={v.id} label={v.shortFa} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-extrabold text-ink">{v.shortFa}</p>
                    <p className="truncate text-[10px] text-muted">{vis.tagFa}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* تنظیم سرمایه، ریسک، گس و قیمت دلاری پله‌های ریزش */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="سرمایه کل ستاپ (دلار)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={capitalStr}
                onChange={(e) => {
                  setCapitalEditedByUser(true);
                  setCapitalStr(e.target.value);
                }}
                suffix="$"
              />
            </Field>
            <Field label="حداکثر ریسک مجاز (%)">
              <Input dir="ltr" inputMode="decimal" value={riskPctStr} onChange={(e) => setRiskPctStr(e.target.value)} suffix="%" />
            </Field>
            <Field label="گس هر تراکنش (دلار)">
              <Input dir="ltr" inputMode="decimal" value={gasUsdStr} onChange={(e) => setGasUsdStr(e.target.value)} suffix="$" />
            </Field>
            <Field label="قیمت پله ۱ (دلار)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={customStep1Str}
                onChange={(e) => {
                  setStepsEditedByUser(true);
                  setCustomStep1Str(e.target.value);
                }}
                suffix="$"
              />
            </Field>
            <Field label="قیمت پله ۲ (ریزش اول)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={customStep2Str}
                onChange={(e) => {
                  setStepsEditedByUser(true);
                  setCustomStep2Str(e.target.value);
                }}
                suffix="$"
              />
            </Field>
            <Field label="قیمت پله ۳ (ریزش دوم)">
              <div className="flex items-center gap-1">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={customStep3Str}
                  onChange={(e) => {
                    setStepsEditedByUser(true);
                    setCustomStep3Str(e.target.value);
                  }}
                  suffix="$"
                />
                {stepsEditedByUser && (
                  <button
                    type="button"
                    title="بازگشت به قیمت‌های پیشنهادی خودکار"
                    onClick={() => setStepsEditedByUser(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-divider bg-card text-muted hover:text-ink"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Field>
          </div>
        </div>
      </Surface>

      {/* ۲) ۴ پاسخ درشت، ساده و شفاف به زبان کاربر + جدول سناریوی پر شدن پله‌ها */}
      {candlesQuery.isLoading && !study ? (
        <ListSkeleton rows={3} />
      ) : signalTicket && dcaPlan && study && activeWindowStats ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {/* باکس ۱: چقدر سرمایه بگذارید؟ */}
            <Surface className="border-s-4 border-s-sky-500 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-sky-700 dark:text-sky-300">۱. چقدر سرمایه وارد کنید؟</span>
                <Badge tone="info">{selectedVenue.shortFa}</Badge>
              </div>
              <p className="text-2xl font-extrabold text-ink">
                {toFaDigits(capitalUsd.toLocaleString('en-US'))} دلار{' '}
                {selectedVenue.kind === 'perp' && (
                  <span className="text-sm font-bold text-muted">
                    (اهرم امن: {toFaDigits(signalTicket.execution.recommendedLeverage)} برابر)
                  </span>
                )}
              </p>
              <p className="text-xs leading-6 text-muted">{walletSuggestion.balanceNoteFa}</p>
            </Surface>

            {/* باکس ۲: چقدر سود و چقدر ضرر می‌کنید؟ (به دلار واقعی) */}
            <Surface
              className={cn(
                'border-s-4 p-4 space-y-2',
                dcaPlan.expectedNetProfitUsd > 0 ? 'border-s-emerald-500' : 'border-s-rose-500'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  ۲. چقدر سود و چقدر ضرر می‌کنید؟
                </span>
                <Badge tone="gain">
                  شانس برد پله‌ای: {toFaDigits(dcaPlan.boostedWinRatePct)}٪ · شارپ: {toFaDigits(dcaPlan.boostedSharpe)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-baseline gap-5">
                <div>
                  <span className="block text-[11px] text-muted">
                    {mode === 'holder-monthly-dca'
                      ? 'صرفه‌جویی در خرید ماهانه'
                      : 'سود خالص تخمینی (در صورت پر شدن ۲ پله اول)'}
                  </span>
                  <span
                    className={cn(
                      'text-xl font-extrabold',
                      dcaPlan.expectedNetProfitUsd > 0 ? 'text-positive' : 'text-negative'
                    )}
                  >
                    {toFaDigits(dcaPlan.expectedNetProfitUsd)} دلار سود
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-muted">حداکثر ضرر در صورت فعال شدن حد ضرر</span>
                  <span className="text-xl font-extrabold text-negative">
                    {toFaDigits(dcaPlan.worstCaseLossUsd)} دلار ضرر
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted">
                میانگین خرید در صورت پر شدن همه پله‌ها:{' '}
                <strong className="font-extrabold text-ink">
                  {toFaDigits(dcaPlan.fullFillAverageEntryPrice.toLocaleString('en-US'))} دلار
                </strong>{' '}
                · کاهش ریسک نسبت به تک‌ورود: {toFaDigits(dcaPlan.riskReductionPct)}٪
              </p>
            </Surface>

            {/* باکس ۳: کی و روی چه قیمتی بخرید؟ (نقاط ورود پله‌ای روی ریزش) */}
            <Surface className="border-s-4 border-s-indigo-500 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                  <ArrowDownLeft className="h-4 w-4" aria-hidden />
                  ۳. پله‌های خرید روی ریزش قیمت (Limit DCA Ladder)
                </span>
                <Badge tone="neutral">{toFaDigits(dcaPlan.stepsCount)} پله</Badge>
              </div>
              <ul className="space-y-2">
                {dcaPlan.tranches.map((tr) => (
                  <li
                    key={tr.stepIndex}
                    className="rounded-field border border-divider/60 bg-surface-2/70 px-3 py-2 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold text-ink">
                        {toFaDigits(tr.tLabel)} · قیمت ورود:{' '}
                        <span className="text-sm text-accent">
                          {toFaDigits(tr.priceEstimate.toLocaleString('en-US'))} دلار
                        </span>{' '}
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold',
                            tr.dipFromRefPct < 0
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface-2 text-muted'
                          )}
                        >
                          {tr.dipFromRefPct === 0
                            ? 'در قیمت فعلی'
                            : `${toFaDigits(Math.abs(tr.dipFromRefPct).toFixed(1))}٪ پایین‌تر از قیمت فعلی`}
                        </span>
                      </span>
                      <span className="font-extrabold text-ink">
                        {toFaDigits(tr.amountUsd.toLocaleString('en-US'))} دلار ({toFaDigits(tr.sharePct)}٪ سرمایه)
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">{tr.noteFa}</p>
                  </li>
                ))}
              </ul>
            </Surface>

            {/* باکس ۴: کی بفروشید و در هر سناریوی پر شدن پله‌ها چقدر سود می‌کنید؟ */}
            <Surface className="border-s-4 border-s-amber-500 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  ۴. خروج در پایان ماه ({dcaPlan.exitDateIso}) و جدول سود هر پله
                </span>
                <Badge tone="info">{toFaDigits(signalTicket.timingBadgeFa)}</Badge>
              </div>

              {/* جدول سناریوی تجمعی پر شدن پله‌ها */}
              <div className="overflow-x-auto rounded-field border border-divider/70 bg-surface-2/40 p-2">
                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-1.5">سناریوی پر شدن</th>
                      <th className="pb-1.5">سرمایه درگیر</th>
                      <th className="pb-1.5">میانگین خرید</th>
                      <th className="pb-1.5">سود خالص</th>
                      <th className="pb-1.5">شانس برد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/50">
                    {dcaPlan.scenarios.map((sc) => (
                      <tr key={sc.filledStepsCount}>
                        <td className="py-1.5 font-bold text-ink">{toFaDigits(sc.labelFa)}</td>
                        <td className="py-1.5 font-bold text-ink">
                          {toFaDigits(sc.deployedCapitalUsd.toLocaleString('en-US'))} دلار
                        </td>
                        <td className="py-1.5 font-bold text-ink">
                          {toFaDigits(sc.averageEntryPrice.toLocaleString('en-US'))} دلار
                        </td>
                        <td className="py-1.5 font-extrabold text-positive">
                          {toFaDigits(sc.expectedNetProfitUsd)} دلار ({toFaDigits(sc.expectedNetReturnPct)}٪ سود)
                        </td>
                        <td className="py-1.5 font-bold text-emerald-600 dark:text-emerald-300">
                          {toFaDigits(sc.estimatedWinRatePct)}٪
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {mode !== 'holder-monthly-dca' ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-field bg-emerald-500/10 p-2">
                    <p className="text-[10px] text-muted">هدف خروج در پایان روز T-0</p>
                    <p className="text-sm font-extrabold text-positive">
                      {toFaDigits(signalTicket.execution.targetPrice.toLocaleString('en-US'))} دلار ({dcaPlan.exitDateIso})
                    </p>
                  </div>
                  <div className="rounded-field bg-rose-500/10 p-2">
                    <p className="text-[10px] text-muted">حد ضرر اضطراری کل پوزیشن</p>
                    <p className="text-sm font-extrabold text-negative">
                      {toFaDigits(signalTicket.execution.stopLossPrice.toLocaleString('en-US'))} دلار
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="rounded-field bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-5 text-ink">
                {dcaPlan.warningFa}
              </p>
            </Surface>
          </div>

          {/* ۳) تمام جزئیات علمی پیپر، راستی‌آزمایی t=1..10 و تنظیمات ریز کارمزد در کشوی مرتب */}
          <Disclosure summary="جزئیات علمی پیپر، راستی‌آزمایی t=1..10، حساسیت گس اتریوم و تنظیمات کارمزد">
            <div className="space-y-5 pt-3">
              <div className="rounded-card border border-divider bg-surface-2/40 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <Fuel className="h-4 w-4 text-amber-500" aria-hidden />
                    تغییر کارمزد و رژیم گس شبکه اتریوم
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ETH_GAS_REGIMES.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGasUsdStr(String(g.gasUsdPerTx))}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-bold',
                          Number(gasUsdStr) === g.gasUsdPerTx
                            ? 'border-accent bg-accent-soft text-accent'
                            : 'border-divider bg-card text-muted'
                        )}
                      >
                        {toFaDigits(g.labelFa)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="کارمزد هر سر (%)">
                    <Input dir="ltr" inputMode="decimal" value={feePctStr} onChange={(e) => setFeePctStr(e.target.value)} suffix="%" />
                  </Field>
                  <Field label="اسلیپیج هر سر (%)">
                    <Input dir="ltr" inputMode="decimal" value={slipPctStr} onChange={(e) => setSlipPctStr(e.target.value)} suffix="%" />
                  </Field>
                  <Field label="تامین مالی سالانه (%)">
                    <Input dir="ltr" inputMode="decimal" value={financingAprStr} onChange={(e) => setFinancingAprStr(e.target.value)} suffix="%" />
                  </Field>
                  <Field label="پنجره روز آخر ماه">
                    <SegmentedControl<string>
                      label="پنجره t"
                      value={selectedT}
                      onChange={setSelectedT}
                      options={[
                        { value: 'auto', label: `بهینه (${toFaDigits(study.optimalT)})` },
                        { value: '2', label: 't=2' },
                        { value: '3', label: 't=3' },
                        { value: '5', label: 't=5' }
                      ]}
                    />
                  </Field>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-2">پنجره</th>
                      <th className="pb-2">بازده ناخالص</th>
                      <th className="pb-2">بازده خالص</th>
                      <th className="pb-2">نرخ برد (Win Rate)</th>
                      <th className="pb-2">شارپ آخر ماه</th>
                      <th className="pb-2">شارپ بقیه ماه</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60">
                    {study.windows.map((w) => (
                      <tr
                        key={w.t}
                        onClick={() => setSelectedT(String(w.t))}
                        className={cn('cursor-pointer hover:bg-surface-2/60', w.t === activeT && 'bg-accent-soft/30 font-bold')}
                      >
                        <td className="py-2" dir="ltr">
                          t={toFaDigits(w.t)} {w.t === study.optimalT && <Badge tone="gain">بهینه</Badge>}
                        </td>
                        <td className="py-2 font-mono" dir="ltr">
                          {fmtPct(w.grossLastTMeanPct, 2)}
                        </td>
                        <td className={cn('py-2 font-mono', w.netLastTMeanPct > 0 ? 'text-positive' : 'text-negative')} dir="ltr">
                          {fmtPct(w.netLastTMeanPct, 2)}
                          {w.significanceStars}
                        </td>
                        <td className="py-2 font-mono">{toFaDigits(w.netWinRatePct)}٪</td>
                        <td className="py-2 font-mono" dir="ltr">
                          {toFaDigits(w.netAnnualizedSharpe.toFixed(2))}
                        </td>
                        <td className="py-2 font-mono text-muted" dir="ltr">
                          {toFaDigits(w.allExceptLastTSharpe.toFixed(2))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {study.gasSensitivity.map((row) => (
                  <div
                    key={row.regime.id}
                    className={cn(
                      'rounded-card border p-3 text-xs space-y-1',
                      row.profitable ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'
                    )}
                  >
                    <div className="flex items-center justify-between font-bold text-ink">
                      <span>{toFaDigits(row.regime.labelFa)}</span>
                      {row.profitable ? (
                        <CheckCircle2 className="h-4 w-4 text-positive" aria-hidden />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-negative" aria-hidden />
                      )}
                    </div>
                    <p className={cn('font-mono font-extrabold', row.netMeanReturnBps > 0 ? 'text-positive' : 'text-negative')} dir="ltr">
                      {row.netMeanReturnBps > 0 ? '+' : ''}
                      {toFaDigits(row.netMeanReturnBps)} bps
                    </p>
                    <p className="text-muted">برد: {toFaDigits(row.netWinRatePct)}٪ · شارپ: {toFaDigits(row.netAnnualizedSharpe)}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {study.byMonth.map((m) => (
                  <div
                    key={m.month}
                    className={cn(
                      'rounded-field border p-2 text-xs',
                      m.meanNetReturnPct > 0 ? 'border-emerald-500/35 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
                    )}
                  >
                    <p className="font-bold text-ink">{m.nameFa}</p>
                    <p className={cn('font-mono font-extrabold', m.meanNetReturnPct > 0 ? 'text-positive' : 'text-negative')} dir="ltr">
                      {fmtPct(m.meanNetReturnPct, 2)}
                    </p>
                    <p className="text-[10px] text-muted">برد: {toFaDigits(m.winRateNetPct)}٪</p>
                  </div>
                ))}
              </div>

              <p className="text-xs leading-6 text-muted">
                قراردادهای آتی ۳۰ ساله (جدول ۸ مقاله، t=5) میانگین <strong dir="ltr">+{PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[4]}%</strong> بازده بدون هزینه فاندینگ داشته‌اند.
              </p>
            </div>
          </Disclosure>
        </>
      ) : null}

      <Notice tone="info" icon={<ShieldAlert className="h-4 w-4" />}>
        تمام اعداد از معادلات مقاله Hartley & Schwarz (2019) و شکار ریزش‌های حراج پیش از پایان ماه (جدول ۵ مقاله) محاسبه می‌شوند. ورود به معامله با مسئولیت و مدیریت ریسک شخصی شما انجام می‌گیرد.
      </Notice>
    </div>
  );
}
