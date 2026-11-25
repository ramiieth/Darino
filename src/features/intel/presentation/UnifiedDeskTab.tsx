/**
 * تب «تصمیم واحد» (Unified Decision Cockpit) — قیف ۳ مرحله‌ای و خلوت برای تصمیم‌گیری سریع
 *
 * معماری ۳ مرحله‌ای (بدون شلوغی و بدون تکرار اعداد متناقض):
 *   ۱) حکم واحد و شفاف در یک کارت (هویت ارز، قیمت زنده یکپارچه، جهت نهایی و فقط یک ردیف ورود/حدضرر/هدف)
 *      + دکمه باز/بستن «مشاهده جزئیات و دلایل (کمیته، سوینگ و رژیم بازار)» به‌صورت پیش‌فرض بسته
 *   ۲) انتخاب روش اجرا با سوییچ ۲تایی:
 *      - خرید پله‌ای اسپات (EOM و کاهش میانگین خرید کیف پول)
 *      - محاسبه حجم و اهرم مجاز (سایزینگ ریسک واقعی بر اساس بکتست ۳ ساله)
 *   ۳) دسترسی سریع به بررسی عمیق‌تر (مناظره کامل هوش مصنوعی و لیست فرصت‌های بازار)
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Layers,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { useWalletAndCostBridge } from '@/features/performance/data/useWalletAndCostBridge';
import { hydrateUniverse, syncUniverse, useMarketsStore } from '@/features/markets/pipeline/store';
import { useMarkets } from '@/features/markets/pipeline/useMarkets';
import { getAssetAthAndRangeInfo } from '@/features/markets/domain/athAndRangeAnalytics';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { reconcileDeskSignals, resolveUnifiedDeskPrice } from '../domain/deskConsensus';
import {
  REGIME_BREADTH,
  pickSwingOpportunities,
  sizeFor,
  type AssetClass,
  type Horizon
} from '../domain/swing';
import {
  GLOBAL_COMMITTEE_MARKETS,
  RATING_FA,
  SENTIMENT_BAND_FA,
  buildDeterministicTradingAgentsReport,
  computeTechnicalSnapshot,
  computeTradeGeometry,
  synthesizeFallbackCandles
} from '../domain/tradingAgents';
import { useCommitteeMarkets, useRiskCandles, useSwing } from '../data/intelApi';
import {
  EomSetupTab,
  canonicalAssetSymbol,
  extractWalletAssetPosition,
  isStableSymbol
} from './EomSetupTab';
import { UsdShort, fmtPrice } from './parts';

const QUICK_DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE', 'PAXG', 'SUI', 'LINK', 'AAVE'] as const;

type ExecutionMode = 'eom' | 'sizer';

const pctFa = (v: number, digits = 0) =>
  `${toFaDigits((v * 100).toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`;
const numFa = (v: number, digits = 1) =>
  toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }));

export function UnifiedDeskTab({
  selectedMarket,
  onChangeMarket,
  onOpenAgents,
  onOpenSwing,
  onOpenEom
}: {
  selectedMarket: string;
  onChangeMarket: (coin: string) => void;
  onOpenAgents: (coin: string) => void;
  onOpenSwing: () => void;
  onOpenEom: () => void;
}) {
  const walletBridge = useWalletAndCostBridge();
  const swingQuery = useSwing();
  const committeeMarkets = useCommitteeMarkets();
  useMarkets('crypto_top_200');
  const cryptoTop200 = useMarketsStore((s) => s.data.crypto_top_200);

  const [search, setSearch] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [execMode, setExecMode] = useState<ExecutionMode>('eom');

  // پارامترهای سایزینگ پوزیشن در گام ۲
  const [sizerRisk, setSizerRisk] = useState('1');
  const [sizerCapital, setSizerCapital] = useState('');
  const [sizerClass, setSizerClass] = useState<AssetClass>('crypto');
  const [sizerHorizon, setSizerHorizon] = useState<Horizon>(20);

  useEffect(() => {
    void hydrateUniverse('crypto_top_200').then(() => syncUniverse('crypto_top_200'));
  }, []);

  // همگام‌سازی خودکار سرمایه کل کیف پول با سایزر (اگر کاربر دستی وارد نکرده باشد)
  useEffect(() => {
    const totalLive = walletBridge.totalLiveUsd ?? 0;
    if (!sizerCapital && totalLive > 50) {
      setSizerCapital(String(Math.round(totalLive)));
    }
  }, [walletBridge.totalLiveUsd, sizerCapital]);

  const activeSymbol = canonicalAssetSymbol(selectedMarket || 'ETH');

  // ۱) دارایی‌های غیراستیبل موجود در کیف پول کاربر
  const walletHoldings = useMemo(() => {
    const map = new Map<string, { symbol: string; valueUsd: number; avgCostUsd: number | null }>();
    for (const r of walletBridge.costBasis.rows) {
      if (isStableSymbol(r.symbol) || r.currentValueUsd < 1) continue;
      const sym = canonicalAssetSymbol(r.symbol);
      const prev = map.get(sym);
      map.set(sym, {
        symbol: sym,
        valueUsd: (prev?.valueUsd ?? 0) + r.currentValueUsd,
        avgCostUsd: prev?.avgCostUsd ?? r.avgCostUsd
      });
    }
    return [...map.values()].sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 8);
  }, [walletBridge.costBasis.rows]);

  // ۲) فرصت‌های برتر سوینگ بازار
  const swingOpportunities = useMemo(() => {
    const enriched = cryptoTop200.map((a) => {
      const info = getAssetAthAndRangeInfo({
        symbol: a.symbol,
        currentPrice: a.price,
        change30d: a.change30d,
        change7d: a.change7d,
        source: a.source
      });
      return {
        id: a.id,
        symbol: a.symbol,
        price: a.price,
        change24h: a.change24h,
        change7d: a.change7d,
        change30d: a.change30d,
        marketCap: a.marketCap,
        rank: a.rank,
        image: a.image,
        rangeStatus: info?.rangeStatus ?? null,
        drawdownFromAthPct: info?.drawdownFromAthPct ?? null,
        rangeLow: info?.rangeLow ?? null
      };
    });
    return pickSwingOpportunities(enriched, swingQuery.data ?? null, 12);
  }, [cryptoTop200, swingQuery.data]);

  // ۳) جستجوی سریع میان کل رمزارزها و دارایی‌های جهانی
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: { symbol: string; nameFa: string; price: number }[] = [];
    for (const c of cryptoTop200) {
      const sym = canonicalAssetSymbol(c.symbol);
      if (seen.has(sym)) continue;
      const nameFa = assetDisplayName(sym).name;
      if (sym.toLowerCase().includes(q) || nameFa.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) {
        seen.add(sym);
        out.push({ symbol: sym, nameFa, price: c.price ?? 0 });
      }
      if (out.length >= 6) break;
    }
    if (out.length < 6) {
      for (const m of GLOBAL_COMMITTEE_MARKETS) {
        const sym = canonicalAssetSymbol(m.coin);
        if (seen.has(sym)) continue;
        if (sym.toLowerCase().includes(q) || m.nameFa.toLowerCase().includes(q)) {
          seen.add(sym);
          out.push({ symbol: sym, nameFa: m.nameFa, price: m.refPrice });
        }
        if (out.length >= 6) break;
      }
    }
    return out;
  }, [search, cryptoTop200]);

  // ۴) داده‌های یکپارچه و زندهٔ دارایی انتخاب‌شده (بدون اولویت دادن به قیمت مرجع فالبک)
  const assetData = useMemo(() => {
    const fromTop = cryptoTop200.find((c) => canonicalAssetSymbol(c.symbol) === activeSymbol);
    const fromCommittee = committeeMarkets.data?.find((m) => canonicalAssetSymbol(m.coin) === activeSymbol);
    const fromCurated = GLOBAL_COMMITTEE_MARKETS.find((m) => canonicalAssetSymbol(m.coin) === activeSymbol);

    const resolved = resolveUnifiedDeskPrice({
      livePerpPrice: fromCommittee?.markPx ?? null,
      livePerpIsReference: Boolean(fromCommittee?.isReference),
      livePerpChange24h: fromCommittee?.change24h ?? null,
      topMarketPrice: fromTop?.price ?? null,
      topMarketIsSnapshot: Boolean(fromTop?.snapshot),
      topMarketChange24h: fromTop?.change24h ?? null,
      curatedRefPrice: fromCurated?.refPrice ?? null,
      curatedRefChange24h: fromCurated?.refChange24h ?? null
    });

    const change7d = fromTop?.change7d ?? null;
    const change30d = fromTop?.change30d ?? null;
    const nameInfo = assetDisplayName(activeSymbol);
    const nameFa = nameInfo.name !== activeSymbol ? nameInfo.name : fromCurated?.nameFa ?? activeSymbol;

    return {
      symbol: activeSymbol,
      coinForCandles: fromCommittee?.coin ?? activeSymbol,
      nameFa,
      price: resolved.price,
      change24h: resolved.change24h,
      isLivePrice: resolved.isLive,
      priceSourceFa: resolved.sourceLabelFa,
      change7d,
      change30d,
      volume24hUsd: fromCommittee?.volume24h ?? fromCurated?.volume24h ?? null,
      openInterestUsd: fromCommittee?.openInterestUsd ?? fromCurated?.openInterestUsd ?? null,
      maxLeverage: fromCommittee?.maxLeverage ?? fromCurated?.maxLeverage ?? 10,
      fundingAprNow:
        fromCommittee && !fromCommittee.isReference ? fromCommittee.fundingHourly * 24 * 365 * 100 : null
    };
  }, [activeSymbol, cryptoTop200, committeeMarkets.data]);

  const candlesQuery = useRiskCandles(assetData.coinForCandles, assetData.price, assetData.change24h);

  const walletPos = useMemo(
    () => extractWalletAssetPosition(walletBridge.costBasis.rows, activeSymbol),
    [walletBridge.costBasis.rows, activeSymbol]
  );

  const athRangeInfo = useMemo(
    () =>
      getAssetAthAndRangeInfo({
        symbol: activeSymbol,
        currentPrice: assetData.price,
        change7d: assetData.change7d,
        change30d: assetData.change30d,
        source: 'crypto'
      }),
    [activeSymbol, assetData.price, assetData.change7d, assetData.change30d]
  );

  // ۵) حکم کمیته ایجنت‌ها روی قیمت واحد و کندل واقعی
  const committeeVerdict = useMemo(() => {
    const liveCandles = candlesQuery.data;
    const lastLiveClose = liveCandles?.length ? liveCandles[liveCandles.length - 1].c : null;
    const candlesAreFresh =
      liveCandles &&
      liveCandles.length >= 20 &&
      lastLiveClose !== null &&
      Math.abs(lastLiveClose - assetData.price) / Math.max(1, assetData.price) < 0.08;

    const candles = candlesAreFresh
      ? liveCandles
      : synthesizeFallbackCandles(assetData.price, assetData.change24h, activeSymbol, 120);

    const technical = computeTechnicalSnapshot(candles, 6);
    if (!technical) return null;

    const regime = swingQuery.data?.regime;
    const report = buildDeterministicTradingAgentsReport({
      coin: activeSymbol,
      analysisDate: new Date().toISOString().slice(0, 10),
      researchDepth: 2,
      technical,
      derivatives: {
        fundingAprNow: assetData.fundingAprNow,
        fundingAvg7dApr: assetData.fundingAprNow,
        fundingPercentile30d: null,
        fundingRegime: 'متعادل',
        openInterestUsd: assetData.openInterestUsd,
        volume24hUsd: assetData.volume24hUsd,
        maxLeverage: assetData.maxLeverage,
        worstCrash24hPct: 12,
        safeLeverage7d: 2
      },
      macroRegime: regime
        ? {
            state: regime.state,
            btcAbove200: regime.btcAbove200,
            breadthPct: regime.breadth !== null ? Math.round(regime.breadth * 100) : null
          }
        : null,
      portfolio: {
        cashUsd: walletPos.stableCashUsd > 0 ? walletPos.stableCashUsd : walletBridge.totalLiveUsd,
        maxRiskPct: 1,
        currentHoldingUsd: walletPos.valueUsd
      }
    });

    const tp = report.traderProposal;
    const pm = report.riskDebate.portfolioDecision;
    const geom = computeTradeGeometry(tp.entryPrice, tp.stopLoss, tp.takeProfit);
    return {
      report,
      rating: pm.rating,
      ratingMeta: RATING_FA[pm.rating],
      sentiment: report.analysts.sentimentReport,
      sentimentMeta: SENTIMENT_BAND_FA[report.analysts.sentimentReport.overallBand],
      entry: tp.entryPrice ?? assetData.price,
      stop: tp.stopLoss,
      target: tp.takeProfit ?? pm.priceTarget,
      rr: geom.riskRewardRatio
    };
  }, [
    activeSymbol,
    assetData,
    candlesQuery.data,
    swingQuery.data?.regime,
    walletPos.stableCashUsd,
    walletPos.valueUsd,
    walletBridge.totalLiveUsd
  ]);

  // ۶) سیگنال سوینگ — قفل‌شده روی همان قیمت واحد
  const swingForAsset = useMemo(() => {
    const exact = swingOpportunities.find((o) => canonicalAssetSymbol(o.symbol) === activeSymbol);
    if (exact && Math.abs(exact.entry - assetData.price) / Math.max(1, assetData.price) < 0.05) {
      return exact;
    }
    const baseScore = exact?.score ?? (athRangeInfo && athRangeInfo.drawdownFromAthPct <= -40 ? 64 : 50);
    const baseVerdict = exact?.verdict ?? ('watch' as const);
    const baseVerdictFa = exact?.verdictFa ?? 'زیر نظر (صبر برای تثبیت)';
    const stop = assetData.price * 0.88;
    const risk = Math.max(assetData.price * 0.05, assetData.price - stop);
    return {
      id: activeSymbol.toLowerCase(),
      symbol: activeSymbol,
      price: assetData.price,
      change24h: assetData.change24h,
      change7d: assetData.change7d,
      change30d: assetData.change30d,
      score: baseScore,
      verdict: baseVerdict,
      verdictFa: baseVerdictFa,
      entry: assetData.price,
      stop,
      stopPct: 12,
      target1: assetData.price + risk * 1.5,
      target2: assetData.price + risk * 2.5,
      reason:
        exact?.reason ??
        (athRangeInfo
          ? `${athRangeInfo.rangeStatusLabelFa} · ${athRangeInfo.drawdownClearFa}`
          : 'رصد قیمت نسبت به حمایت‌های میان‌مدت'),
      fromPerpSignal: exact?.fromPerpSignal ?? false
    };
  }, [swingOpportunities, activeSymbol, assetData, athRangeInfo]);

  const regime = swingQuery.data?.regime ?? null;
  const regimeState = regime?.state ?? 'unknown';
  const btcGap = swingQuery.data?.btc?.sma200 ? swingQuery.data.btc.close / swingQuery.data.btc.sma200 - 1 : null;
  const breadthUp = regime && regime.breadth !== null ? Math.round(regime.breadth * regime.counted) : null;

  // ۷) حکم واحد نهایی (تنها یک ردیف ورود / حد ضرر / هدف برای کل صفحه)
  const consensus = useMemo(
    () =>
      reconcileDeskSignals({
        committeeRating: committeeVerdict?.rating ?? null,
        swingVerdict: swingForAsset.verdict,
        swingScore: swingForAsset.score,
        regimeState
      }),
    [committeeVerdict?.rating, swingForAsset.verdict, swingForAsset.score, regimeState]
  );

  // سطوح یکپارچهٔ نمایشی در کارت حکم واحد (بدون دو ست متناقض!)
  const unifiedLevels = useMemo(() => {
    if (consensus.alignment === 'aligned_long') {
      return {
        entryLabel: 'ورود پیشنهادی (پله‌ای)',
        entryValue: fmtPrice(assetData.price),
        stopLabel: `حد ضرر محافظ (-${toFaDigits(swingForAsset.stopPct)}٪)`,
        stopValue: fmtPrice(swingForAsset.stop),
        targetLabel: 'هدف میان‌مدت (۲.۵R)',
        targetValue: fmtPrice(swingForAsset.target2)
      };
    }
    if (consensus.tone === 'loss') {
      return {
        entryLabel: 'وضعیت ورود',
        entryValue: 'صبر / نقد بمانید',
        stopLabel: 'حمایت بحرانی پایین‌تر',
        stopValue: fmtPrice(swingForAsset.stop),
        targetLabel: 'مقاومت تثبیت (حد ابطال نزول)',
        targetValue: committeeVerdict?.stop && committeeVerdict.stop > assetData.price
          ? fmtPrice(committeeVerdict.stop)
          : fmtPrice(assetData.price * 1.08)
      };
    }
    // حالت تضاد تایم‌فریم یا انتظار
    return {
      entryLabel: 'ورود پیشنهادی',
      entryValue: 'صبر یا پله کوچک اسپات',
      stopLabel: `حد زیان اسپات (-${toFaDigits(swingForAsset.stopPct)}٪)`,
      stopValue: fmtPrice(swingForAsset.stop),
      targetLabel: 'هدف اول (۱.۵R)',
      targetValue: fmtPrice(swingForAsset.target1)
    };
  }, [consensus, assetData.price, swingForAsset, committeeVerdict?.stop]);

  const sizerCapNum = Number(sizerCapital);
  const sizerRiskNum = Number(sizerRisk);
  const sizerAbs = sizeFor(sizerCapNum, sizerRiskNum, sizerClass, sizerHorizon);
  const sizerRel = sizeFor(100, sizerRiskNum, sizerClass, sizerHorizon);

  const heroAccentBar =
    consensus.tone === 'gain'
      ? 'from-emerald-400 via-teal-500 to-cyan-500'
      : consensus.tone === 'warn'
        ? 'from-amber-400 via-orange-500 to-yellow-500'
        : consensus.tone === 'loss'
          ? 'from-rose-500 via-red-500 to-orange-500'
          : 'from-indigo-500 via-sky-500 to-cyan-500';

  return (
    <div className="space-y-4">
      {/* نوار انتخاب سریع ارز (خلوت و فشرده) */}
      <Surface className="border border-divider/80 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted">
              {walletHoldings.length > 0 ? (
                <>
                  <Wallet className="h-3.5 w-3.5 text-accent" />
                  کیف پول:
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  ارزها:
                </>
              )}
            </span>

            {(walletHoldings.length > 0
              ? walletHoldings.map((h) => h.symbol)
              : swingOpportunities.length > 0
                ? swingOpportunities.slice(0, 6).map((o) => canonicalAssetSymbol(o.symbol))
                : [...QUICK_DEFAULT_SYMBOLS]
            ).map((sym) => {
              const active = sym === activeSymbol;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onChangeMarket(sym)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition',
                    active
                      ? 'border-accent bg-accent text-on-accent shadow-xs'
                      : 'border-divider bg-surface-2/60 text-ink hover:border-accent/50'
                  )}
                >
                  <MarketAssetLogo symbol={sym} size={16} />
                  <span dir="ltr">{sym}</span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-52">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نماد (BTC, ETH, SOL…)"
              className="w-full rounded-control border border-divider bg-surface-2/60 py-1.5 pe-3 ps-8 text-xs text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-card border border-divider bg-card p-1 shadow-lg">
                {searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      onChangeMarket(item.symbol);
                      setSearch('');
                    }}
                    className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-xs hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2 font-bold text-ink">
                      <MarketAssetLogo symbol={item.symbol} size={20} />
                      <span>{item.nameFa}</span>
                      <span className="text-[10px] text-subtle" dir="ltr">{item.symbol}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-muted">
                      <MoneyValue value={item.price} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Surface>

      {/* گام ۱: کارت واحد تصمیم (قیمت زنده + یک حکم قطعی + یک ردیف سطوح + جزئیات کشویی) */}
      <Surface variant="focal" className="overflow-hidden border border-divider/85 shadow-sm">
        <div className={cn('h-1.5 w-full bg-gradient-to-l', heroAccentBar)} aria-hidden />

        <div className="p-4 sm:p-5 space-y-4">
          {/* هدر ارز و قیمت یکپارچه */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-card p-1.5 shadow-xs ring-1 ring-divider">
                <MarketAssetLogo symbol={activeSymbol} size={44} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">گام ۱ · حکم نهایی</span>
                  <h2 className="text-lg font-extrabold text-ink">{assetData.nameFa}</h2>
                  <span className="text-xs font-bold text-subtle" dir="ltr">{activeSymbol}</span>
                </div>
                {athRangeInfo && (
                  <p className="mt-0.5 text-xs text-muted">
                    سقف تاریخی: <strong className="text-ink">{athRangeInfo.athPriceFa}</strong> ·{' '}
                    <strong className="text-rose-600 dark:text-rose-300">{athRangeInfo.drawdownClearFa}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="text-end">
              <p className="text-2xl font-black text-ink whitespace-nowrap tabular-nums">
                <MoneyValue value={assetData.price} />
              </p>
              <div className="mt-0.5 flex items-center justify-end gap-2 text-xs">
                <PercentValue value={assetData.change24h} />
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    assetData.isLivePrice
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', assetData.isLivePrice ? 'bg-emerald-500' : 'bg-amber-500')} />
                  {assetData.priceSourceFa}
                </span>
              </div>
            </div>
          </div>

          {/* باکس حکم شفاف و غیرمتناقض */}
          <div
            className={cn(
              'rounded-2xl border p-4 space-y-2.5',
              consensus.tone === 'gain'
                ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                : consensus.tone === 'warn'
                  ? 'border-amber-500/40 bg-amber-500/[0.07]'
                  : consensus.tone === 'loss'
                    ? 'border-rose-500/35 bg-rose-500/[0.06]'
                    : 'border-indigo-500/30 bg-indigo-500/[0.05]'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {consensus.tone === 'gain' ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
                ) : consensus.tone === 'warn' ? (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
                ) : (
                  <Scale className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                )}
                <h3 className="text-sm font-extrabold text-ink">{consensus.headlineFa}</h3>
              </div>
              <Badge tone={consensus.tone}>{consensus.badgeFa}</Badge>
            </div>

            <p className="text-xs font-semibold leading-6 text-ink">
              پیشنهاد عملی: <span className="font-normal text-muted">{consensus.actionRuleFa}</span>
            </p>
          </div>

          {/* فقط یک ردیف سطوح شفاف (بدون تکرار اعداد مختلف) */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-center">
            <div className="rounded-xl border border-divider/80 bg-surface-2/45 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-muted">{unifiedLevels.entryLabel}</p>
              <p className="mt-0.5 text-sm font-black text-ink">{unifiedLevels.entryValue}</p>
            </div>
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2.5">
              <p className="text-[11px] font-semibold text-rose-700/85 dark:text-rose-300/85">{unifiedLevels.stopLabel}</p>
              <p className="num-ltr mt-0.5 text-sm font-black text-negative">{unifiedLevels.stopValue}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5">
              <p className="text-[11px] font-semibold text-emerald-700/85 dark:text-emerald-300/85">{unifiedLevels.targetLabel}</p>
              <p className="num-ltr mt-0.5 text-sm font-black text-positive">{unifiedLevels.targetValue}</p>
            </div>
          </div>

          {/* دکمه کشویی نمایش جزئیات کمیته، سوینگ و رژیم بازار (به‌صورت پیش‌فرض بسته) */}
          <div className="border-t border-divider/60 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/80 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-surface-2"
              >
                {detailsOpen ? <ChevronUp className="h-3.5 w-3.5 text-accent" /> : <ChevronDown className="h-3.5 w-3.5 text-accent" />}
                <span>{detailsOpen ? 'بستن جزئیات حکم' : 'مشاهده دلایل حکم (کمیته، سوینگ و رژیم بازار)'}</span>
              </button>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-surface-2/60 px-2.5 py-0.5 text-muted">
                  کوتاه‌مدت: <strong className="text-ink">{consensus.committeeDirectionFa}</strong>
                </span>
                <span className="rounded-full bg-surface-2/60 px-2.5 py-0.5 text-muted">
                  میان‌مدت: <strong className="text-ink">{consensus.swingDirectionFa}</strong>
                </span>
              </div>
            </div>

            {detailsOpen && (
              <div className="mt-3.5 space-y-3 border-t border-divider/50 pt-3.5">
                {/* رژیم بازار */}
                {regime && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', regime.btcAbove200 ? 'bg-gain/15 text-positive' : 'bg-negative/12 text-negative')}>
                          {regime.btcAbove200 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        بیت‌کوین / میانگین ۲۰۰ روزه
                      </span>
                      <span className="num-ltr font-bold text-ink">
                        {btcGap === null ? '—' : btcGap >= 0 ? `${pctFa(btcGap, 1)} بالا` : `${pctFa(-btcGap, 1)} پایین`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', (regime.breadth ?? 0) >= REGIME_BREADTH ? 'bg-gain/15 text-positive' : 'bg-negative/12 text-negative')}>
                          {(regime.breadth ?? 0) >= REGIME_BREADTH ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        کوین‌های بالای میانگین ۵۰ روزه
                      </span>
                      <span className="num-ltr font-bold text-ink">
                        {breadthUp === null ? '—' : `${toFaDigits(breadthUp)} از ${toFaDigits(regime.counted)}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* خلاصه کنار هم کمیته و سوینگ فقط وقتی کاربر درخواست جزئیات کند */}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-divider/75 bg-card/70 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-extrabold text-ink">
                        <Bot className="h-4 w-4 text-accent" />
                        کمیته ایجنت‌ها (کوتاه‌مدت)
                      </span>
                      {committeeVerdict && (
                        <Badge tone={committeeVerdict.ratingMeta.tone}>
                          {consensus.committeeDirectionFa} ({toFaDigits(committeeVerdict.sentiment.overallScore)}/۱۰)
                        </Badge>
                      )}
                    </div>
                    {committeeVerdict && (
                      <>
                        <p className="text-[11px] leading-5 text-muted">{committeeVerdict.ratingMeta.actionHint}</p>
                        <p className="text-[11px] text-muted">
                          حد ضرر کوتاه‌مدت: <strong className="num-ltr text-negative">{committeeVerdict.stop ? fmtPrice(committeeVerdict.stop) : '—'}</strong> · هدف:{' '}
                          <strong className="num-ltr text-positive">{committeeVerdict.target ? fmtPrice(committeeVerdict.target) : '—'}</strong>
                        </p>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-divider/75 bg-card/70 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-extrabold text-ink">
                        <Compass className="h-4 w-4 text-indigo-500" />
                        سوینگ بازار (میان‌مدت)
                      </span>
                      <Badge
                        tone={
                          swingForAsset.verdict === 'entry'
                            ? 'gain'
                            : swingForAsset.verdict === 'accumulate'
                              ? 'info'
                              : swingForAsset.verdict === 'avoid'
                                ? 'loss'
                                : 'neutral'
                        }
                      >
                        {swingForAsset.verdictFa} ({toFaDigits(swingForAsset.score)})
                      </Badge>
                    </div>
                    <p className="text-[11px] leading-5 text-muted">{swingForAsset.reason}</p>
                    <p className="text-[11px] text-muted">
                      حد زیان سوینگ: <strong className="num-ltr text-negative">{fmtPrice(swingForAsset.stop)}</strong> · هدف ۲.۵R:{' '}
                      <strong className="num-ltr text-positive">{fmtPrice(swingForAsset.target2)}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Surface>

      {/* گام ۲: انتخاب روش اجرا (فقط یک ابزار در لحظه — بدون شلوغی) */}
      <Surface className="border border-divider/80 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">گام ۲ · اجرا</span>
            <h3 className="text-sm font-extrabold text-ink">چطور برای {assetData.nameFa} اقدام کنم؟</h3>
          </div>

          <SegmentedControl<ExecutionMode>
            label="روش اجرای معامله"
            size="sm"
            value={execMode}
            onChange={setExecMode}
            options={[
              { value: 'eom', label: 'خرید پله‌ای اسپات (EOM)', icon: <Calendar /> },
              { value: 'sizer', label: 'حجم و اهرم مجاز (ریسک)', icon: <ShieldCheck /> }
            ]}
          />
        </div>

        {execMode === 'eom' ? (
          <div className="space-y-2.5">
            <EomSetupTab externalSymbol={activeSymbol} embedded />
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={onOpenEom}>
                مقایسه الگوی پایان ماه در ۱۹ بازار ←
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                محاسبه سقف حجم اسپات و اهرم امن بر اساس ۵٪ بدترین ریزش‌های واقعی ۳ سال اخیر (بدون لیکویید شدن روی فتیله)
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <SegmentedControl<AssetClass>
                  size="sm"
                  label="نوع دارایی"
                  value={sizerClass}
                  onChange={setSizerClass}
                  options={[
                    { value: 'crypto', label: 'رمزارز' },
                    { value: 'tradfi', label: 'سنتی/سهام' }
                  ]}
                />
                <SegmentedControl<string>
                  size="sm"
                  label="افق نگه‌داری"
                  value={String(sizerHorizon)}
                  onChange={(v) => setSizerHorizon(v === '5' ? 5 : 20)}
                  options={[
                    { value: '5', label: '۱ هفته' },
                    { value: '20', label: '۱ ماه' }
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="حداکثر ریسک مجاز در این معامله (٪ سرمایه)">
                <Input
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={sizerRisk}
                  onChange={(e) => setSizerRisk(e.target.value)}
                  suffix="%"
                />
              </Field>
              <Field label="کل سرمایه معاملاتی (دلار)">
                <Input
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  min={0}
                  placeholder="10000"
                  value={sizerCapital}
                  onChange={(e) => setSizerCapital(e.target.value)}
                  suffix="دلار"
                />
              </Field>
            </div>

            {sizerRel && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5">
                  <p className="text-[11px] font-semibold text-muted">سقف حجم مجاز در اسپات</p>
                  <p className="mt-1 text-base font-black text-ink">
                    {numFa(sizerRel.spotMaxUsd)}٪ سرمایه{' '}
                    {sizerAbs && (
                      <span className="text-xs font-semibold text-muted">
                        (<UsdShort value={sizerAbs.spotMaxUsd} />)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] p-3.5">
                  <p className="text-[11px] font-semibold text-muted">سقف اهرم امن در پرپ (ایزوله)</p>
                  <p className="mt-1 text-base font-black text-ink">
                    <bdi dir="ltr">{numFa(sizerRel.perpMaxLeverage)}x</bdi>{' '}
                    {sizerAbs && (
                      <span className="text-xs font-semibold text-muted">
                        (مارجین <UsdShort value={sizerAbs.perpMarginUsd} />)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Surface>

      {/* گام ۳: بررسی عمیق‌تر (فقط در صورت نیاز) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-divider/70 bg-surface-2/40 px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Layers className="h-3.5 w-3.5 text-accent" aria-hidden />
          گام ۳ · اگر می‌خواهید عمیق‌تر بررسی کنید:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" icon={<Bot className="h-3.5 w-3.5" />} onClick={() => onOpenAgents(activeSymbol)}>
            مناظره کامل هوش مصنوعی
          </Button>
          <Button size="sm" variant="outline" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onOpenSwing}>
            سایر فرصت‌های بازار
          </Button>
        </div>
      </div>
    </div>
  );
}
