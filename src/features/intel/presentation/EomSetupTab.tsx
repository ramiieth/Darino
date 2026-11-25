/**
 * تب و بخش «ستاپ پایان ماه (EOM Setup — Hartley & Schwarz 2019)»
 *
 * متصل به:
 *   • موجودی فعلی همین ارز در کیف پول کاربر + میانگین خرید فعلی (avgCost)
 *   • نقدینگی آزاد استیبل‌کوین‌ها (USDC/USDT/DAI) برای تعیین سرمایه ستاپ
 *   • محاسبهٔ زندهٔ «میانگین خرید جدید شما» پس از پر شدن هر پلهٔ ریزش (پله ۱، پله ۱+۲، هر ۳ پله)
 *   • تمام معادلات علمی مقاله، راستی‌آزمایی t=1..10، حساسیت گس اتریوم و جدول ۸ در کشوی مرتب
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
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import {
  useWalletAndCostBridge,
  type CurrentAssetCostRow
} from '@/features/performance/data/useWalletAndCostBridge';
import { getAssetAthAndRangeInfo } from '@/features/markets/domain/athAndRangeAnalytics';
import { useMarketsStore } from '@/features/markets/pipeline/store';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { cn } from '@/shared/lib/cn';
import { toFaDigits, toEnDigits } from '@/shared/utils/formatters';
import { resolveUnifiedDeskPrice } from '../domain/deskConsensus';
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
  type EomAssetGroup,
  type EomSelectableAsset
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

const fmtPriceSmart = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '—';
  const digits = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 4;
  return toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }));
};

const fmtQty = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '۰';
  const digits = v >= 100 ? 2 : v >= 1 ? 4 : 6;
  return toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }));
};

/* ---------------- توابع مشترک اتصال به کیف پول و میانگین خرید ---------------- */

const STABLE_SYMBOLS = new Set([
  'USD', 'USDC', 'USDT', 'USDT0', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDS', 'PYUSD', 'FRAX', 'BUSD', 'USDD', 'EURC', 'LUSD', 'GHO', 'RLUSD', 'USD1', 'USDG', 'CRVUSD'
]);

const SYMBOL_ALIASES: Record<string, string> = {
  WETH: 'ETH',
  STETH: 'ETH',
  WSTETH: 'ETH',
  CBETH: 'ETH',
  RETH: 'ETH',
  WBTC: 'BTC',
  CBBTC: 'BTC',
  TBTC: 'BTC',
  WSOL: 'SOL',
  JITOSOL: 'SOL',
  MSOL: 'SOL',
  XAUT: 'PAXG',
  GOLD: 'PAXG',
  XAU: 'PAXG',
  SILVER: 'XAG',
  CL: 'WTI',
  USOIL: 'WTI',
  BRENTOIL: 'BRENT'
};

export function canonicalAssetSymbol(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const stripped = (upper.includes(':') ? upper.slice(upper.indexOf(':') + 1) : upper).replace(/[-/_].*$/, '');
  return SYMBOL_ALIASES[stripped] ?? stripped;
}

export function isStableSymbol(raw: string): boolean {
  return STABLE_SYMBOLS.has(canonicalAssetSymbol(raw));
}

export interface WalletAssetPosition {
  symbol: string;
  quantity: number;
  valueUsd: number;
  costBasisUsd: number | null;
  avgCostUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
  stableCashUsd: number;
  hasHolding: boolean;
}

export function extractWalletAssetPosition(
  rows: CurrentAssetCostRow[],
  targetSymbol: string
): WalletAssetPosition {
  const canon = canonicalAssetSymbol(targetSymbol);
  let quantity = 0;
  let valueUsd = 0;
  let costBasisSum = 0;
  let hasBasis = false;
  let stableCashUsd = 0;

  for (const r of rows) {
    const rc = canonicalAssetSymbol(r.symbol);
    if (STABLE_SYMBOLS.has(rc)) {
      if (r.currentValueUsd > 0) stableCashUsd += r.currentValueUsd;
      continue;
    }
    if (rc !== canon) continue;
    if (r.currentQuantity > 0) quantity += r.currentQuantity;
    if (r.currentValueUsd > 0) valueUsd += r.currentValueUsd;
    if (r.costBasisUsd !== null && r.costBasisUsd > 0) {
      costBasisSum += r.costBasisUsd;
      hasBasis = true;
    } else if (r.avgCostUsd !== null && r.avgCostUsd > 0 && r.currentQuantity > 0) {
      costBasisSum += r.avgCostUsd * r.currentQuantity;
      hasBasis = true;
    }
  }

  const avgCostUsd = hasBasis && quantity > 0 ? costBasisSum / quantity : null;
  const unrealizedPnlUsd = hasBasis && valueUsd > 0 ? valueUsd - costBasisSum : null;
  const unrealizedPnlPct =
    hasBasis && costBasisSum > 0 && unrealizedPnlUsd !== null ? (unrealizedPnlUsd / costBasisSum) * 100 : null;

  return {
    symbol: canon,
    quantity,
    valueUsd,
    costBasisUsd: hasBasis ? costBasisSum : null,
    avgCostUsd,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    stableCashUsd: Math.round(stableCashUsd * 100) / 100,
    hasHolding: quantity > 0 && valueUsd > 0.5
  };
}

export function computePostDcaAverage(params: {
  existingQty: number;
  existingAvgCost: number;
  addedCapitalUsd: number;
  addedAveragePrice: number;
}): {
  newAvgCost: number;
  deltaPct: number;
  newTotalQty: number;
} | null {
  const { existingQty, existingAvgCost, addedCapitalUsd, addedAveragePrice } = params;
  if (!(existingQty > 0) || !(existingAvgCost > 0) || !(addedCapitalUsd > 0) || !(addedAveragePrice > 0)) {
    return null;
  }
  const existingCost = existingQty * existingAvgCost;
  const addedQty = addedCapitalUsd / addedAveragePrice;
  const newTotalQty = existingQty + addedQty;
  if (!(newTotalQty > 0)) return null;
  const newAvgCost = (existingCost + addedCapitalUsd) / newTotalQty;
  const deltaPct = ((newAvgCost - existingAvgCost) / existingAvgCost) * 100;
  return { newAvgCost, deltaPct, newTotalQty };
}

function findOrCreateEomAsset(symbol: string, fallbackPrice = 100): EomSelectableAsset {
  const canon = canonicalAssetSymbol(symbol);
  const direct = EOM_SELECTABLE_ASSETS.find(
    (a) =>
      canonicalAssetSymbol(a.id) === canon ||
      canonicalAssetSymbol(a.logoKey) === canon ||
      (a.hlCoin && canonicalAssetSymbol(a.hlCoin) === canon)
  );
  if (direct) return direct;
  const display = assetDisplayName(canon);
  return {
    id: canon,
    hlCoin: canon,
    logoKey: canon,
    symbolDisplay: canon,
    tokenizedSymbols: [`${canon} (Spot)`, `${canon}-PERP`],
    nameFa: display.name !== canon ? `${display.name} (${canon})` : canon,
    group: 'crypto',
    refPrice: fallbackPrice > 0 ? fallbackPrice : 100
  };
}

const GROUP_META: Record<
  EomAssetGroup,
  {
    label: string;
    short: string;
    icon: React.ReactNode;
    gradient: string;
    ring: string;
  }
> = {
  treasury: {
    label: 'اوراق خزانه (پیپر)',
    short: 'اوراق خزانه',
    icon: <Landmark className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-emerald-500/12 via-teal-500/5 to-transparent',
    ring: 'border-emerald-500/30'
  },
  crypto: {
    label: 'رمزارز (BTC/ETH/SOL)',
    short: 'رمزارز',
    icon: <Coins className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-indigo-500/12 via-violet-500/5 to-transparent',
    ring: 'border-indigo-500/30'
  },
  equity: {
    label: 'سهام توکنایز (NVDA/SPY)',
    short: 'سهام و شاخص',
    icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-sky-500/12 via-blue-500/5 to-transparent',
    ring: 'border-sky-500/30'
  },
  commodity: {
    label: 'طلا و نفت (PAXG/WTI)',
    short: 'طلا و نفت',
    icon: <Flame className="h-3.5 w-3.5" aria-hidden />,
    gradient: 'from-amber-500/12 via-orange-500/5 to-transparent',
    ring: 'border-amber-500/30'
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

export interface EomSetupTabProps {
  /** همگام‌سازی خودکار دارایی از صفحهٔ «تصمیم واحد» */
  externalSymbol?: string;
  /** حالت جاسازی‌شده در صفحهٔ «تصمیم واحد» (بدون تکرار انتخابگر دارایی) */
  embedded?: boolean;
}

export function EomSetupTab({ externalSymbol, embedded = false }: EomSetupTabProps = {}) {
  const walletBridge = useWalletAndCostBridge();
  const cryptoTop200 = useMarketsStore((s) => s.data.crypto_top_200);

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

  // امکان ثبت یا اصلاح دستی تعداد و میانگین خرید فعلی اگر کیف پول بهای تمام‌شده نداشت
  const [manualQtyStr, setManualQtyStr] = useState<string>('');
  const [manualAvgStr, setManualAvgStr] = useState<string>('');
  const [holdingEditedByUser, setHoldingEditedByUser] = useState(false);

  const selectedAsset: EomSelectableAsset = useMemo(() => {
    if (externalSymbol) {
      const mkt = cryptoTop200.find((c) => canonicalAssetSymbol(c.symbol) === canonicalAssetSymbol(externalSymbol));
      return findOrCreateEomAsset(externalSymbol, mkt?.price ?? 100);
    }
    return EOM_SELECTABLE_ASSETS.find((a) => a.id === assetId) ?? EOM_SELECTABLE_ASSETS[0];
  }, [externalSymbol, assetId, cryptoTop200]);

  // هنگام تغییر externalSymbol، تنظیمات پله‌ها و میانگین خرید دستی ریست شوند
  useEffect(() => {
    if (!externalSymbol) return;
    setGroup(selectedAsset.group);
    setStepsEditedByUser(false);
    setHoldingEditedByUser(false);
  }, [externalSymbol, selectedAsset.group]);

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

  const marketsQuery = useCommitteeMarkets();
  const candlesQuery = useEomDailyCandles(selectedAsset);

  const livePrice = useMemo((): number => {
    const foundPerp =
      selectedAsset.hlCoin && marketsQuery.data
        ? marketsQuery.data.find((m) => m.coin.toUpperCase() === selectedAsset.hlCoin!.toUpperCase())
        : undefined;
    const fromTop200 = cryptoTop200.find(
      (c) => canonicalAssetSymbol(c.symbol) === canonicalAssetSymbol(selectedAsset.logoKey)
    );
    return resolveUnifiedDeskPrice({
      livePerpPrice: foundPerp?.markPx ?? null,
      livePerpIsReference: Boolean(foundPerp?.isReference),
      topMarketPrice: fromTop200?.price ?? null,
      topMarketIsSnapshot: Boolean(fromTop200?.snapshot),
      curatedRefPrice: selectedAsset.refPrice
    }).price;
  }, [selectedAsset, marketsQuery.data, cryptoTop200]);

  // استخراج دقیق موجودی فعلی همین ارز، میانگین خرید فعلی و نقدینگی آزاد استیبل‌کوین از کیف پول متصل
  const walletPos = useMemo(
    () => extractWalletAssetPosition(walletBridge.costBasis.rows, selectedAsset.logoKey),
    [walletBridge.costBasis.rows, selectedAsset.logoKey]
  );

  // همگام‌سازی خودکار فیلدهای موجودی و میانگین خرید با کیف پول متصل
  useEffect(() => {
    if (holdingEditedByUser) return;
    setManualQtyStr(walletPos.quantity > 0 ? String(Number(walletPos.quantity.toPrecision(6))) : '');
    setManualAvgStr(walletPos.avgCostUsd && walletPos.avgCostUsd > 0 ? String(Number(walletPos.avgCostUsd.toPrecision(6))) : '');
  }, [walletPos.quantity, walletPos.avgCostUsd, selectedAsset.id, holdingEditedByUser]);

  const effectiveQty = parseNum(manualQtyStr, 0, 0);
  const effectiveAvgCost = parseNum(manualAvgStr, 0, 0);
  const hasEffectivePosition = effectiveQty > 0 && effectiveAvgCost > 0;
  const distFromAvgPct =
    hasEffectivePosition && livePrice > 0 ? ((livePrice - effectiveAvgCost) / effectiveAvgCost) * 100 : null;

  const userRiskPct = parseNum(riskPctStr, 1.0, 0.1, 10);

  const walletSuggestion = useMemo(
    () =>
      computeWalletSuggestedCapital({
        walletTotalUsd: walletBridge.totalLiveUsd,
        perpEquityUsd: walletBridge.costBasis.perpEquityUsd,
        userRiskPct,
        stopDistancePct: selectedAsset.group === 'treasury' ? 1.5 : selectedAsset.group === 'commodity' ? 2.5 : 4.5,
        isPerpVenue: selectedVenue.kind === 'perp'
      }),
    [walletBridge.totalLiveUsd, walletBridge.costBasis.perpEquityUsd, userRiskPct, selectedAsset.group, selectedVenue.kind]
  );

  useEffect(() => {
    if (!capitalEditedByUser) {
      // اگر نقدینگی آزاد استیبل‌کوین در کیف پول موجود باشد و از پیشنهاد ریسک معقول‌تر باشد، اولویت با پیشنهاد متناسب است
      const preferred =
        walletPos.stableCashUsd >= 50
          ? Math.min(Math.round(walletPos.stableCashUsd), walletSuggestion.recommendedCapitalUsd)
          : walletSuggestion.recommendedCapitalUsd;
      setCapitalStr(String(Math.max(50, preferred)));
    }
  }, [walletSuggestion.recommendedCapitalUsd, walletPos.stableCashUsd, capitalEditedByUser]);

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
      setHoldingEditedByUser(false);
    }
  };

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

  // محاسبهٔ تأثیر پر شدن هر ۳ پله روی میانگین خرید فعلی کاربر
  const fullFillPostAvg = useMemo(() => {
    if (!dcaPlan || !hasEffectivePosition) return null;
    return computePostDcaAverage({
      existingQty: effectiveQty,
      existingAvgCost: effectiveAvgCost,
      addedCapitalUsd: capitalUsd,
      addedAveragePrice: dcaPlan.fullFillAverageEntryPrice
    });
  }, [dcaPlan, hasEffectivePosition, effectiveQty, effectiveAvgCost, capitalUsd]);

  const groupStyle = GROUP_META[selectedAsset.group];

  return (
    <div className="space-y-4">
      {/* ۱) پنل تنظیمات و اتصال به کیف پول و میانگین خرید */}
      <Surface className={cn('relative overflow-hidden border p-4 sm:p-5', groupStyle.ring)}>
        <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-gradient-to-bl opacity-80', groupStyle.gradient)} />
        <div className="relative space-y-4">
          {/* هدر دارایی (فقط در حالت مستقل نمایش داده می‌شود؛ در حالت embedded بالای صفحه نمایش داده شده) */}
          {!embedded && (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0 rounded-full bg-card p-1 shadow-sm ring-2 ring-divider">
                  <MarketAssetLogo symbol={selectedAsset.logoKey} size={42} />
                  <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-0.5 ring-1 ring-divider">
                    <VenueBadgeLogo venueId={venueId} label={selectedVenue.shortFa} size={18} />
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-ink sm:text-lg">{selectedAsset.nameFa}</h3>
                  <p className="text-xs text-muted">
                    نماد:{' '}
                    <strong dir="ltr" className="font-mono font-bold text-ink">
                      {selectedAsset.symbolDisplay}
                    </strong>{' '}
                    · قیمت زنده:{' '}
                    <strong className="font-extrabold text-ink">
                      <MoneyValue value={livePrice} />
                    </strong>
                  </p>
                </div>
              </div>

              {athRangeInfo && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-bold text-rose-600 dark:text-rose-300">
                    سقف تاریخی: {athRangeInfo.athPriceFa} ({athRangeInfo.drawdownClearFa})
                  </span>
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 font-bold text-indigo-700 dark:text-indigo-300">
                    {athRangeInfo.rangeStatusLabelFa}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* نوار اتصال مستقیم به موجودی این ارز + میانگین خرید فعلی + نقدینگی آزاد کیف پول */}
          <div className="rounded-card border border-divider bg-card/85 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-accent" aria-hidden />
                <span className="text-xs font-extrabold text-ink">
                  وضعیت {selectedAsset.symbolDisplay} در کیف پول شما
                </span>
                {walletPos.hasHolding ? (
                  <Badge tone="gain">متصل به کیف پول</Badge>
                ) : (
                  <Badge tone="neutral">خرید جدید / بدون موجودی</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {walletPos.stableCashUsd >= 10 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCapitalEditedByUser(true);
                      setCapitalStr(String(Math.round(walletPos.stableCashUsd)));
                    }}
                  >
                    تخصیص نقدینگی آزاد (<MoneyValue value={walletPos.stableCashUsd} />)
                  </Button>
                )}
                {capitalEditedByUser && walletSuggestion.detectedBalanceUsd > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCapitalEditedByUser(false);
                      setCapitalStr(String(walletSuggestion.recommendedCapitalUsd));
                    }}
                  >
                    پیشنهاد ریسک
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-control bg-surface-2/60 px-2.5 py-2">
                <p className="text-[10px] text-muted">موجودی فعلی این ارز</p>
                <p className="mt-0.5 text-xs font-extrabold text-ink">
                  {effectiveQty > 0 ? (
                    <>
                      <span dir="ltr">{fmtQty(effectiveQty)}</span>{' '}
                      <span className="text-[10px] font-semibold text-subtle">
                        (<MoneyValue value={effectiveQty * livePrice} />)
                      </span>
                    </>
                  ) : (
                    '۰ (ورود تازه)'
                  )}
                </p>
              </div>
              <div className="rounded-control bg-surface-2/60 px-2.5 py-2">
                <p className="text-[10px] text-muted">میانگین خرید فعلی شما</p>
                <p className="mt-0.5 text-xs font-extrabold text-ink">
                  {hasEffectivePosition ? (
                    <>
                      <MoneyValue value={effectiveAvgCost} />
                      {distFromAvgPct !== null && (
                        <span className={cn('ms-1 text-[10px] font-bold', distFromAvgPct >= 0 ? 'text-positive' : 'text-negative')}>
                          ({fmtPct(distFromAvgPct, 1)})
                        </span>
                      )}
                    </>
                  ) : (
                    'ثبت نشده'
                  )}
                </p>
              </div>
              <div className="rounded-control bg-surface-2/60 px-2.5 py-2">
                <p className="text-[10px] text-muted">نقدینگی آزاد (استیبل‌کوین)</p>
                <p className="mt-0.5 text-xs font-extrabold text-ink">
                  {walletPos.stableCashUsd > 0 ? <MoneyValue value={walletPos.stableCashUsd} /> : '—'}
                </p>
              </div>
              <div className="rounded-control bg-accent-soft/45 px-2.5 py-2">
                <p className="text-[10px] text-muted">میانگین جدید (پر شدن ۳ پله)</p>
                <p className="mt-0.5 text-xs font-extrabold text-accent">
                  {fullFillPostAvg ? (
                    <>
                      <MoneyValue value={fullFillPostAvg.newAvgCost} />{' '}
                      <span className="text-[10px] font-bold">
                        ({fmtPct(fullFillPostAvg.deltaPct, 1)})
                      </span>
                    </>
                  ) : dcaPlan ? (
                    <MoneyValue value={dcaPlan.fullFillAverageEntryPrice} />
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* انتخاب ۳ حالت ستاپ پایان ماه */}
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
                  <p className="text-xs font-extrabold text-ink">۱. لنگر + شکار ریزش</p>
                  <Badge tone="gain">شارپ ۲.۰۸</Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  ۳۰٪ ورود پایه در T-3 + ۷۰٪ سفارش لیمیت روی ریزش و خروج پایان ماه
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
                  <p className="text-xs font-extrabold text-ink">۲. شکارچی خالص ریزش</p>
                  <Badge tone="info">برد ۸۰.۵٪</Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  هر ۳ پله لیمیت زیر قیمت فعلی برای کاهش حداکثری میانگین خرید
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
                <p className="text-xs font-extrabold text-ink">۳. خرید هولدرها (بدون فروش)</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  خرید پله‌ای در ارزان‌ترین روزهای پیش از رالی پایان ماه برای هولد
                </p>
              </div>
            </button>
          </div>

          {/* انتخاب گروه و دارایی (فقط در حالت مستقل) */}
          {!embedded && (
            <>
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
                        setHoldingEditedByUser(false);
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
            </>
          )}

          {/* انتخاب سریع بستر اجرا */}
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
                    'flex min-w-[145px] shrink-0 items-center gap-2 rounded-card border p-2 text-start transition-all sm:min-w-0',
                    active ? cn('ring-1 ring-accent shadow-sm', vis.accentClass) : 'border-divider bg-card/70 hover:bg-card'
                  )}
                >
                  <VenueBadgeLogo venueId={v.id} label={v.shortFa} size={22} />
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
            <Field label="سرمایه جدید (دلار)">
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
            <Field label="حداکثر ریسک (%)">
              <Input dir="ltr" inputMode="decimal" value={riskPctStr} onChange={(e) => setRiskPctStr(e.target.value)} suffix="%" />
            </Field>
            <Field label="گس هر تراکنش ($)">
              <Input dir="ltr" inputMode="decimal" value={gasUsdStr} onChange={(e) => setGasUsdStr(e.target.value)} suffix="$" />
            </Field>
            <Field label="قیمت پله ۱ ($)">
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
            <Field label="قیمت پله ۲ (ریزش ۱)">
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
            <Field label="قیمت پله ۳ (ریزش ۲)">
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

          {/* امکان ویرایش سریع تعداد/میانگین خرید فعلی در کشوی سبک */}
          <Disclosure summary="اصلاح دستی تعداد یا میانگین خرید فعلی شما (اختیاری)">
            <div className="grid grid-cols-2 gap-3 pt-2 sm:max-w-md">
              <Field label={`تعداد فعلی ${selectedAsset.symbolDisplay}`}>
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="0"
                  value={manualQtyStr}
                  onChange={(e) => {
                    setHoldingEditedByUser(true);
                    setManualQtyStr(e.target.value);
                  }}
                />
              </Field>
              <Field label="میانگین خرید فعلی ($)">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  placeholder={String(livePrice)}
                  value={manualAvgStr}
                  onChange={(e) => {
                    setHoldingEditedByUser(true);
                    setManualAvgStr(e.target.value);
                  }}
                  suffix="$"
                />
              </Field>
            </div>
          </Disclosure>
        </div>
      </Surface>

      {/* ۲) نقشهٔ پله‌های خرید + جدول سود و میانگین خرید جدید شما */}
      {candlesQuery.isLoading && !study ? (
        <ListSkeleton rows={3} />
      ) : signalTicket && dcaPlan && study && activeWindowStats ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {/* باکس ۱: پله‌های خرید روی ریزش قیمت */}
            <Surface className="border-s-4 border-s-indigo-500 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                  <ArrowDownLeft className="h-4 w-4" aria-hidden />
                  پله‌های خرید روی ریزش قیمت (Limit DCA)
                </span>
                <Badge tone="neutral">{toFaDigits(dcaPlan.stepsCount)} پله · {selectedVenue.shortFa}</Badge>
              </div>
              <ul className="space-y-2">
                {dcaPlan.tranches.map((tr) => (
                  <li
                    key={tr.stepIndex}
                    className="rounded-field border border-divider/60 bg-surface-2/70 px-3 py-2 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold text-ink">
                        {toFaDigits(tr.tLabel)} ·{' '}
                        <span className="text-sm text-accent">
                          {fmtPriceSmart(tr.priceEstimate)} دلار
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
                            ? 'قیمت فعلی'
                            : `${toFaDigits(Math.abs(tr.dipFromRefPct).toFixed(1))}٪ پایین‌تر`}
                        </span>
                      </span>
                      <span className="font-extrabold text-ink">
                        <MoneyValue value={tr.amountUsd} /> ({toFaDigits(tr.sharePct)}٪)
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">{tr.noteFa}</p>
                  </li>
                ))}
              </ul>
            </Surface>

            {/* باکس ۲: خروج پایان ماه + جدول سناریوی پر شدن پله‌ها با ستون «میانگین جدید شما» */}
            <Surface className="border-s-4 border-s-amber-500 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  تأثیر روی میانگین خرید و سود پایان ماه ({dcaPlan.exitDateIso})
                </span>
                <Badge tone="gain">برد {toFaDigits(dcaPlan.boostedWinRatePct)}٪</Badge>
              </div>

              <div className="overflow-x-auto rounded-field border border-divider/70 bg-surface-2/40 p-2">
                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-1.5">سناریو</th>
                      <th className="pb-1.5">ورود جدید</th>
                      <th className="pb-1.5">{hasEffectivePosition ? 'میانگین جدید شما' : 'میانگین خرید'}</th>
                      <th className="pb-1.5">سود تخمینی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/50">
                    {dcaPlan.scenarios.map((sc) => {
                      const postAvg = hasEffectivePosition
                        ? computePostDcaAverage({
                            existingQty: effectiveQty,
                            existingAvgCost: effectiveAvgCost,
                            addedCapitalUsd: sc.deployedCapitalUsd,
                            addedAveragePrice: sc.averageEntryPrice
                          })
                        : null;
                      return (
                        <tr key={sc.filledStepsCount}>
                          <td className="py-1.5 font-bold text-ink">{toFaDigits(sc.labelFa)}</td>
                          <td className="py-1.5 font-bold text-ink">
                            <MoneyValue value={sc.deployedCapitalUsd} />
                          </td>
                          <td className="py-1.5 font-bold text-ink">
                            {postAvg ? (
                              <span>
                                {fmtPriceSmart(postAvg.newAvgCost)} دلار{' '}
                                <span className={cn('text-[10px]', postAvg.deltaPct <= 0 ? 'text-positive' : 'text-muted')}>
                                  ({fmtPct(postAvg.deltaPct, 1)})
                                </span>
                              </span>
                            ) : (
                              <span>{fmtPriceSmart(sc.averageEntryPrice)} دلار</span>
                            )}
                          </td>
                          <td className="py-1.5 font-extrabold text-positive">
                            <MoneyValue value={sc.expectedNetProfitUsd} /> ({toFaDigits(sc.expectedNetReturnPct)}٪)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {mode !== 'holder-monthly-dca' && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-field bg-emerald-500/10 p-2">
                    <p className="text-[10px] text-muted">هدف خروج T-0</p>
                    <p className="font-extrabold text-positive">{fmtPriceSmart(signalTicket.execution.targetPrice)} دلار</p>
                  </div>
                  <div className="rounded-field bg-rose-500/10 p-2">
                    <p className="text-[10px] text-muted">حد ضرر اضطراری</p>
                    <p className="font-extrabold text-negative">{fmtPriceSmart(signalTicket.execution.stopLossPrice)} دلار</p>
                  </div>
                  <div className="rounded-field bg-surface-2/80 p-2">
                    <p className="text-[10px] text-muted">حداکثر ریسک</p>
                    <p className="font-extrabold text-negative"><MoneyValue value={dcaPlan.worstCaseLossUsd} /></p>
                  </div>
                </div>
              )}

              <p className="rounded-field bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-5 text-ink">
                {dcaPlan.warningFa}
              </p>
            </Surface>
          </div>

          {/* ۳) جزئیات علمی پیپر، راستی‌آزمایی t=1..10 و تنظیمات ریز کارمزد در کشوی مرتب (بدون حذف هیچ داده‌ای) */}
          <Disclosure summary="جزئیات علمی پیپر (Hartley & Schwarz 2019)، جدول t=1..10، حساسیت گس و کارمزد">
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

      {!embedded && (
        <Notice tone="info" icon={<ShieldAlert className="h-4 w-4" />}>
          تمام اعداد از معادلات مقاله Hartley & Schwarz (2019) و شکار ریزش‌های پیش از پایان ماه محاسبه می‌شوند. تصمیم نهایی معامله با مدیریت ریسک شخصی شماست.
        </Notice>
      )}
    </div>
  );
}
