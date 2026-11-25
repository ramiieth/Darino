/**
 * تب «تصمیم واحد» (Unified Decision Cockpit) — مرکز تصمیم‌گیری یکپارچه در یک صفحه
 *
 * اصلاح‌شده پس از لوپ نقد:
 *   ۱) یکپارچگی کامل منبع قیمت: هرگز قیمت مرجع/فالبک (isReference=true مثل ۲۸۲۰) روی قیمت زنده بازار نمی‌نشیند
 *      و هر دو کارت کمیته ایجنت‌ها و ستاپ سوینگ دقیقاً روی یک قیمت واحد و همگام محاسبه می‌شوند.
 *   ۲) نوار «حکم یکپارچه میز معامله» (Consensus Banner): هم‌سویی یا تضاد تایم‌فریم بین کمیته (کوتاه‌مدت)
 *      و سوینگ (میان‌مدت) را صریح و شفاف توضیح می‌دهد تا کاربر دچار تناقض لانگ/شورت نشود.
 *   ۳) استفاده از کندل‌های واقعی ۴ ساعته (useRiskCandles) در کمیته ایجنت‌ها + بازطراحی بصری مدرن کارت‌ها.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Compass,
  Layers,
  Scale,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
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
import { pickSwingOpportunities } from '../domain/swing';
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
import { fmtPrice } from './parts';

const QUICK_DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE', 'PAXG', 'SUI', 'LINK', 'AAVE'] as const;

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

  useEffect(() => {
    void hydrateUniverse('crypto_top_200').then(() => syncUniverse('crypto_top_200'));
  }, []);

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

  // دریافت کندل‌های واقعی ۴ ساعته برای کمیته ایجنت‌ها (با فالبک هماهنگ‌شده روی همان قیمت واحد)
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

  // ۵) حکم فوری و قطعی «کمیته ایجنت‌ها (TradingAgents)» روی همان قیمت واحد و کندل‌های واقعی
  const committeeVerdict = useMemo(() => {
    const liveCandles = candlesQuery.data;
    const lastLiveClose = liveCandles?.length ? liveCandles[liveCandles.length - 1].c : null;
    // اگر کندل‌های واقعی در دسترس‌اند و با قیمت واحد همخوانی دارند (< ۸٪ اختلاف) از همان‌ها استفاده شود
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

  // ۶) سیگنال سوینگ برای همین دارایی — قفل‌شده روی همان قیمت واحد assetData.price
  const swingForAsset = useMemo(() => {
    const exact = swingOpportunities.find((o) => canonicalAssetSymbol(o.symbol) === activeSymbol);
    if (exact && Math.abs(exact.entry - assetData.price) / Math.max(1, assetData.price) < 0.05) {
      return exact;
    }
    const baseScore = exact?.score ?? (athRangeInfo && athRangeInfo.drawdownFromAthPct <= -40 ? 72 : 58);
    const baseVerdict = exact?.verdict ?? (baseScore >= 65 ? ('accumulate' as const) : ('watch' as const));
    const baseVerdictFa =
      exact?.verdictFa ?? (baseVerdict === 'accumulate' ? 'ناحیه ارزنده (پله‌ای)' : 'تحت نظر برای ورود پله‌ای');

    const rangeStop =
      athRangeInfo?.rangeLow &&
      athRangeInfo.rangeLow < assetData.price * 0.97 &&
      athRangeInfo.rangeLow > assetData.price * 0.78
        ? athRangeInfo.rangeLow * 0.985
        : null;
    const stop = rangeStop ?? assetData.price * 0.92;
    const risk = Math.max(assetData.price * 0.03, assetData.price - stop);
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

  const regimeState = swingQuery.data?.regime.state ?? 'unknown';

  // ۷) جمع‌بندی و رفع تناقض بین کمیته کوتاه‌مدت و سوینگ میان‌مدت
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

  const committeeTopBar =
    consensus.committeeDirection === 'long'
      ? 'from-emerald-400 via-teal-500 to-cyan-500'
      : consensus.committeeDirection === 'short'
        ? 'from-rose-500 via-red-500 to-orange-500'
        : 'from-amber-400 via-yellow-500 to-orange-400';

  return (
    <div className="space-y-4">
      {/* ۱) نوار انتخاب سریع دارایی */}
      <Surface className="border border-divider/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-sm font-extrabold text-ink">یک ارز انتخاب کنید؛ همهٔ تحلیل‌ها یک‌جا آماده است</h2>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نماد (مثلاً ETH, SOL, NVDA)..."
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

        <div className="space-y-2">
          {walletHoldings.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted">
                <Wallet className="h-3.5 w-3.5 text-accent" />
                کیف پول شما:
              </span>
              {walletHoldings.map((h) => {
                const active = h.symbol === activeSymbol;
                return (
                  <button
                    key={h.symbol}
                    type="button"
                    onClick={() => onChangeMarket(h.symbol)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-all',
                      active
                        ? 'border-accent bg-accent text-on-accent shadow-xs'
                        : 'border-divider bg-surface-2/60 text-ink hover:border-accent/50'
                    )}
                  >
                    <MarketAssetLogo symbol={h.symbol} size={16} />
                    <span dir="ltr">{h.symbol}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              پیشنهاد سوینگ و منتخب:
            </span>
            {(swingOpportunities.length > 0
              ? swingOpportunities.slice(0, 6).map((o) => ({ sym: canonicalAssetSymbol(o.symbol), score: o.score }))
              : QUICK_DEFAULT_SYMBOLS.map((sym) => ({ sym, score: null as number | null }))
            ).map(({ sym, score }) => {
              const active = sym === activeSymbol;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onChangeMarket(sym)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-all',
                    active
                      ? 'border-accent bg-accent text-on-accent shadow-xs'
                      : 'border-divider bg-card text-muted hover:border-accent/50 hover:text-ink'
                  )}
                >
                  <MarketAssetLogo symbol={sym} size={16} />
                  <span dir="ltr">{sym}</span>
                  {score !== null && (
                    <span className={cn('text-[10px]', active ? 'opacity-90' : 'text-accent')}>
                      {toFaDigits(score)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Surface>

      {/* ۲) کارت هویت دارایی + قیمت یکپارچه زنده */}
      <Surface variant="focal" className="relative overflow-hidden border border-divider/85 p-4 sm:p-5">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-l from-indigo-500/[0.07] via-sky-500/[0.03] to-emerald-500/[0.06]"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-divider">
              <MarketAssetLogo symbol={activeSymbol} size={44} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink">{assetData.nameFa}</h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-subtle" dir="ltr">
                  {activeSymbol}
                </span>
                {regimeState !== 'unknown' && (
                  <Badge tone={regimeState === 'on' ? 'gain' : 'warn'}>
                    {regimeState === 'on' ? 'رژیم بازار صعودی' : 'رژیم بازار محتاط'}
                  </Badge>
                )}
              </div>
              {athRangeInfo && (
                <p className="mt-1 text-xs text-muted">
                  سقف تاریخی: <strong className="text-ink">{athRangeInfo.athPriceFa}</strong> ·{' '}
                  <strong className="text-rose-600 dark:text-rose-300">{athRangeInfo.drawdownClearFa}</strong> ·{' '}
                  <span className="font-semibold text-indigo-600 dark:text-indigo-300">
                    {athRangeInfo.rangeStatusLabelFa}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="text-end">
            <p className="text-2xl font-black text-ink whitespace-nowrap tabular-nums">
              <MoneyValue value={assetData.price} />
            </p>
            <div className="mt-1 flex items-center justify-end gap-2 text-xs">
              <PercentValue value={assetData.change24h} />
              <span className="text-[11px] text-subtle">۲۴ ساعت</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                  assetData.isLivePrice
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    assetData.isLivePrice ? 'bg-emerald-500' : 'bg-amber-500'
                  )}
                />
                {assetData.priceSourceFa}
              </span>
            </div>
          </div>
        </div>
      </Surface>

      {/* ۳) نوار حکم یکپارچه میز معامله — رفع شفاف تضاد بین کوتاه‌مدت (کمیته) و میان‌مدت (سوینگ) */}
      <Surface
        className={cn(
          'relative overflow-hidden border p-4 space-y-2',
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
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
            ) : consensus.tone === 'warn' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
            ) : (
              <Scale className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
            )}
            <h3 className="text-xs font-extrabold text-ink sm:text-sm">
              جمع‌بندی نهایی میز معامله: {consensus.headlineFa}
            </h3>
          </div>
          <Badge tone={consensus.tone}>{consensus.badgeFa}</Badge>
        </div>

        <p className="text-xs leading-6 text-muted">{consensus.explanationFa}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/50 pt-2 text-[11px]">
          <span className="font-bold text-ink">دستورالعمل عملی: {consensus.actionRuleFa}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-card/85 px-2.5 py-0.5 font-bold text-muted ring-1 ring-divider">
              کوتاه‌مدت (کمیته): <strong className="text-ink">{consensus.committeeDirectionFa}</strong>
            </span>
            <span className="rounded-full bg-card/85 px-2.5 py-0.5 font-bold text-muted ring-1 ring-divider">
              میان‌مدت (سوینگ): <strong className="text-ink">{consensus.swingDirectionFa}</strong>
            </span>
          </div>
        </div>
      </Surface>

      {/* ۴) کارت‌های بازطراحی‌شدهٔ «کمیته ایجنت‌ها (کوتاه‌مدت)» و «ستاپ سوینگ (میان‌مدت)» روی قیمت واحد */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* کارت اول: کمیته ایجنت‌ها (تایم‌فریم کوتاه‌مدت / تاکتیکی) */}
        <Surface className="flex flex-col justify-between overflow-hidden border border-divider/85 transition duration-200 hover:shadow-md">
          <div className={cn('h-1 w-full bg-gradient-to-l', committeeTopBar)} aria-hidden />
          <div className="flex flex-1 flex-col justify-between gap-3.5 p-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-xl ring-1',
                      consensus.committeeDirection === 'long'
                        ? 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300'
                        : consensus.committeeDirection === 'short'
                          ? 'bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300'
                          : 'bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-300'
                    )}
                  >
                    <Bot className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-ink">جمع‌بندی کمیته ایجنت‌ها</h3>
                    <span className="text-[10px] font-semibold text-muted">افق کوتاه‌مدت و تاکتیکی (۴ ساعته / روزانه)</span>
                  </div>
                </div>
                {committeeVerdict && (
                  <div className="flex items-center gap-1.5">
                    <Badge tone={committeeVerdict.ratingMeta.tone}>
                      {consensus.committeeDirection === 'short' ? (
                        <TrendingDown className="me-1 inline h-3 w-3" />
                      ) : consensus.committeeDirection === 'long' ? (
                        <TrendingUp className="me-1 inline h-3 w-3" />
                      ) : null}
                      {consensus.committeeDirectionFa}
                    </Badge>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-black text-ink tabular-nums">
                      {toFaDigits(committeeVerdict.sentiment.overallScore)}/۱۰
                    </span>
                  </div>
                )}
              </div>

              {committeeVerdict ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-divider/70 bg-surface-2/45 px-2.5 py-2.5">
                      <p className="text-[10px] font-semibold text-subtle">ورود مرجع</p>
                      <p className="num-ltr mt-0.5 text-sm font-black text-ink">{fmtPrice(committeeVerdict.entry)}</p>
                    </div>
                    <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-2.5 py-2.5">
                      <p className="text-[10px] font-semibold text-rose-700/80 dark:text-rose-300/80">حد ضرر (۲×ATR)</p>
                      <p className="num-ltr mt-0.5 text-sm font-black text-negative">
                        {committeeVerdict.stop ? fmtPrice(committeeVerdict.stop) : 'صبر'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-2.5">
                      <p className="text-[10px] font-semibold text-emerald-700/80 dark:text-emerald-300/80">
                        هدف {committeeVerdict.rr ? `(${toFaDigits(committeeVerdict.rr)}R)` : ''}
                      </p>
                      <p className="num-ltr mt-0.5 text-sm font-black text-positive">
                        {committeeVerdict.target ? fmtPrice(committeeVerdict.target) : 'صبر'}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs leading-6 text-muted">
                    {committeeVerdict.ratingMeta.actionHint}
                  </p>

                  <div className="rounded-xl border border-divider/60 bg-surface-2/50 px-3 py-2 text-[11px] leading-5 text-muted">
                    <strong className="text-ink">احساسات و ساختار:</strong>{' '}
                    {committeeVerdict.sentimentMeta.label} · {committeeVerdict.report.researchDebate.researchPlan.strategicActions}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted">در حال محاسبهٔ شاخص‌های تکنیکال کمیته…</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-divider/60 pt-2.5">
              <span className="text-[11px] text-subtle">تحلیلگر تکنیکال، مناظره Bull/Bear و مدیر ریسک</span>
              <Button size="sm" variant="outline" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => onOpenAgents(activeSymbol)}>
                مناظره کامل هوش مصنوعی
              </Button>
            </div>
          </div>
        </Surface>

        {/* کارت دوم: ستاپ سوینگ (تایم‌فریم میان‌مدت / اسپات پله‌ای) */}
        <Surface className="flex flex-col justify-between overflow-hidden border border-divider/85 transition duration-200 hover:shadow-md">
          <div className="h-1 w-full bg-gradient-to-l from-indigo-500 via-violet-500 to-sky-500" aria-hidden />
          <div className="flex flex-1 flex-col justify-between gap-3.5 p-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 ring-1 ring-indigo-500/30 dark:text-indigo-300">
                    <Compass className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-ink">ستاپ سوینگ (میان‌مدت)</h3>
                    <span className="text-[10px] font-semibold text-muted">افق چندروزه تا چندهفته‌ای (اسپات / پله‌ای)</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={swingForAsset.verdict === 'entry' ? 'gain' : swingForAsset.verdict === 'accumulate' ? 'info' : 'neutral'}>
                    {swingForAsset.verdictFa}
                  </Badge>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-black text-ink tabular-nums">
                    امتیاز {toFaDigits(swingForAsset.score)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-divider/70 bg-surface-2/45 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold text-subtle">محدوده ورود</p>
                  <p className="num-ltr mt-0.5 text-sm font-black text-ink">{fmtPrice(swingForAsset.entry)}</p>
                </div>
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold text-rose-700/80 dark:text-rose-300/80">حد زیان سوینگ</p>
                  <p className="num-ltr mt-0.5 text-sm font-black text-negative">{fmtPrice(swingForAsset.stop)}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold text-emerald-700/80 dark:text-emerald-300/80">هدف ۲.۵R</p>
                  <p className="num-ltr mt-0.5 text-sm font-black text-positive">{fmtPrice(swingForAsset.target2)}</p>
                </div>
              </div>

              <p className="text-xs leading-6 text-muted">{swingForAsset.reason}</p>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider/60 bg-surface-2/50 px-3 py-2 text-[11px]">
                <span className="text-muted">
                  هدف اول (۱.۵R): <strong className="num-ltr text-ink">{fmtPrice(swingForAsset.target1)}</strong>
                </span>
                <span className="text-muted">
                  ریسک استاندارد: <strong className="text-ink">حداکثر ۱٪ سرمایه</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-divider/60 pt-2.5">
              <span className="text-[11px] text-subtle">مقایسه با سایر ارزهای ارزندهٔ بازار</span>
              <Button size="sm" variant="outline" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onOpenSwing}>
                همهٔ فرصت‌های سوینگ
              </Button>
            </div>
          </div>
        </Surface>
      </div>

      {/* ۵) ستاپ پایان ماه (EOM) و پله‌های خرید روی ریزش */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-500" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">
              ستاپ پایان ماه (EOM) و پله‌های کاهش میانگین خرید برای {assetData.nameFa}
            </h3>
          </div>
          <Button size="sm" variant="ghost" onClick={onOpenEom}>
            نمای مستقل و مقایسهٔ ۱۹ بازار ←
          </Button>
        </div>

        <EomSetupTab externalSymbol={activeSymbol} embedded />
      </section>
    </div>
  );
}
