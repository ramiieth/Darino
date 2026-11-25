/**
 * تب «تصمیم واحد» (Unified Decision Cockpit) — ریدیزاین نهایی مینیمال و مدرن (قیف ۳ مرحله‌ای)
 *
 * طراحی بصری:
 *  - حذف باکس‌های تو در تو و خطوط اضافی؛ استفاده از هاله نوری ملایم متناسب با حکم (سبز/کهربایی/قرمز/نیلی)
 *  - نوار بصری محدوده قیمت (حد ضرر ← قیمت فعلی ← هدف) برای درک فوری نسبت ریسک به ریوارد در یک نگاه
 *  - نمایش خودکار موقعیت کیف پول کاربر روی همان ارز (موجودی، میانگین خرید و سود/زیان شناور)
 *  - جزئیات کمیته، سوینگ و رژیم بازار در کشوی ۳-ستونهٔ تمیز (به‌صورت پیش‌فرض بسته)
 *  - سوییچ ۲تایی اجرا: «خرید پله‌ای اسپات (EOM)» یا «سایزینگ حجم و اهرم مجاز»
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
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
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

/** واچ‌لیست تمرکز اصلی (رمزارزهای منتخب: BTC، SOL، HYPE + سهام جهانی مثل NVDA — بدون استیبل‌کوین) */
const FOCUS_BUY_SYMBOLS = [
  { symbol: 'BTC', tagFa: 'رمزارز' },
  { symbol: 'SOL', tagFa: 'رمزارز' },
  { symbol: 'HYPE', tagFa: 'رمزارز' },
  { symbol: 'NVDA', tagFa: 'سهام' }
] as const;

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

  const [sizerRisk, setSizerRisk] = useState('1');
  const [sizerCapital, setSizerCapital] = useState('');
  const [sizerClass, setSizerClass] = useState<AssetClass>('crypto');
  const [sizerHorizon, setSizerHorizon] = useState<Horizon>(20);

  useEffect(() => {
    void hydrateUniverse('crypto_top_200').then(() => syncUniverse('crypto_top_200'));
  }, []);

  useEffect(() => {
    const totalLive = walletBridge.totalLiveUsd ?? 0;
    if (!sizerCapital && totalLive > 50) {
      setSizerCapital(String(Math.round(totalLive)));
    }
  }, [walletBridge.totalLiveUsd, sizerCapital]);

  const rawSymbol = canonicalAssetSymbol(selectedMarket || 'BTC');
  // استیبل‌کوین‌ها نقدینگی آزاد برای خرید هستند و هرگز هدف خرید قرار نمی‌گیرند
  const activeSymbol = isStableSymbol(rawSymbol) ? 'BTC' : rawSymbol;

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

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: { symbol: string; nameFa: string; price: number }[] = [];
    for (const m of GLOBAL_COMMITTEE_MARKETS) {
      const sym = canonicalAssetSymbol(m.coin);
      if (seen.has(sym) || isStableSymbol(sym)) continue;
      if (sym.toLowerCase().includes(q) || m.nameFa.toLowerCase().includes(q)) {
        seen.add(sym);
        out.push({ symbol: sym, nameFa: m.nameFa, price: m.refPrice });
      }
      if (out.length >= 6) break;
    }
    if (out.length < 6) {
      for (const c of cryptoTop200) {
        const sym = canonicalAssetSymbol(c.symbol);
        if (seen.has(sym) || isStableSymbol(sym)) continue;
        const nameFa = assetDisplayName(sym).name;
        if (sym.toLowerCase().includes(q) || nameFa.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) {
          seen.add(sym);
          out.push({ symbol: sym, nameFa, price: c.price ?? 0 });
        }
        if (out.length >= 6) break;
      }
    }
    return out;
  }, [search, cryptoTop200]);

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
        cashUsd: walletPos.stableCashUsd > 0 ? walletPos.stableCashUsd : (walletBridge.totalLiveUsd ?? 0),
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

  // سطوح یکپارچه + محاسبه موقعیت قیمت روی نوار حدضرر تا هدف
  const unifiedLevels = useMemo(() => {
    const stopNum = swingForAsset.stop;
    const targetNum =
      consensus.alignment === 'aligned_long'
        ? swingForAsset.target2
        : consensus.tone === 'loss'
          ? (committeeVerdict?.stop && committeeVerdict.stop > assetData.price
              ? committeeVerdict.stop
              : assetData.price * 1.08)
          : swingForAsset.target1;

    const span = Math.max(0.0001, targetNum - stopNum);
    const markerPct = Math.max(8, Math.min(92, ((assetData.price - stopNum) / span) * 100));

    if (consensus.alignment === 'aligned_long') {
      return {
        entryLabel: 'ورود پیشنهادی (پله‌ای)',
        entryValue: fmtPrice(assetData.price),
        stopLabel: `حد ضرر (-${toFaDigits(swingForAsset.stopPct)}٪)`,
        stopValue: fmtPrice(stopNum),
        targetLabel: 'هدف میان‌مدت (۲.۵R)',
        targetValue: fmtPrice(targetNum),
        markerPct
      };
    }
    if (consensus.tone === 'loss') {
      return {
        entryLabel: 'وضعیت ورود',
        entryValue: 'صبر · نقد بمانید',
        stopLabel: 'حمایت بحرانی پایین‌تر',
        stopValue: fmtPrice(stopNum),
        targetLabel: 'مقاومت ابطال نزول',
        targetValue: fmtPrice(targetNum),
        markerPct
      };
    }
    return {
      entryLabel: 'وضعیت ورود',
      entryValue: 'صبر یا پله کوچک اسپات',
      stopLabel: `حد زیان اسپات (-${toFaDigits(swingForAsset.stopPct)}٪)`,
      stopValue: fmtPrice(stopNum),
      targetLabel: 'هدف اول (۱.۵R)',
      targetValue: fmtPrice(targetNum),
      markerPct
    };
  }, [consensus, assetData.price, swingForAsset, committeeVerdict?.stop]);

  const sizerCapNum = Number(sizerCapital);
  const sizerRiskNum = Number(sizerRisk);
  const sizerAbs = sizeFor(sizerCapNum, sizerRiskNum, sizerClass, sizerHorizon);
  const sizerRel = sizeFor(100, sizerRiskNum, sizerClass, sizerHorizon);

  const theme =
    consensus.tone === 'gain'
      ? {
          topBar: 'from-emerald-400 via-teal-500 to-cyan-500',
          glow: 'from-emerald-500/[0.11] via-teal-500/[0.03] to-transparent',
          pill: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" aria-hidden />
        }
      : consensus.tone === 'warn'
        ? {
            topBar: 'from-amber-400 via-orange-500 to-yellow-500',
            glow: 'from-amber-500/[0.11] via-orange-500/[0.03] to-transparent',
            pill: 'bg-amber-500/15 text-amber-800 ring-amber-500/35 dark:text-amber-200',
            icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden />
          }
        : consensus.tone === 'loss'
          ? {
              topBar: 'from-rose-500 via-red-500 to-orange-500',
              glow: 'from-rose-500/[0.11] via-red-500/[0.03] to-transparent',
              pill: 'bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300',
              icon: <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-300" aria-hidden />
            }
          : {
              topBar: 'from-indigo-500 via-sky-500 to-cyan-500',
              glow: 'from-indigo-500/[0.10] via-sky-500/[0.03] to-transparent',
              pill: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300',
              icon: <Scale className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden />
            };

  const avgCostGapPct =
    walletPos.avgCostUsd && walletPos.avgCostUsd > 0
      ? ((assetData.price - walletPos.avgCostUsd) / walletPos.avgCostUsd) * 100
      : null;

  return (
    <div className="space-y-4">
      {/* نوار انتخاب هدف خرید: تمرکز روی BTC، SOL، HYPE و سهام (مثل NVDA) + نقدینگی آزاد استیبل‌کوین */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            هدف خرید:
          </span>
          {(() => {
            const seen = new Set<string>();
            const chips: { sym: string; badge?: string }[] = [];
            for (const f of FOCUS_BUY_SYMBOLS) {
              seen.add(f.symbol);
              chips.push({ sym: f.symbol, badge: f.tagFa });
            }
            for (const h of walletHoldings) {
              if (!seen.has(h.symbol) && !isStableSymbol(h.symbol)) {
                seen.add(h.symbol);
                chips.push({ sym: h.symbol, badge: 'کیف پول' });
              }
            }
            return chips.map(({ sym, badge }) => {
              const active = sym === activeSymbol;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onChangeMarket(sym)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition duration-150',
                    active
                      ? 'border-ink bg-ink text-card shadow-sm'
                      : 'border-divider/80 bg-card text-ink hover:border-divider-strong hover:bg-surface-2/60'
                  )}
                >
                  <MarketAssetLogo symbol={sym} size={16} />
                  <span dir="ltr">{sym}</span>
                  {badge && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                        active ? 'bg-card/15 text-card/90' : 'bg-surface-2 text-muted'
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            });
          })()}
          {walletPos.stableCashUsd >= 10 && (
            <span className="ms-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              <Wallet className="h-3 w-3" />
              نقد آزاد (استیبل): <UsdShort value={walletPos.stableCashUsd} />
            </span>
          )}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی رمزارز یا سهام (NVDA, AAPL…)"
            className="w-full rounded-full border border-divider/85 bg-card py-1.5 pe-3.5 ps-8 text-xs text-ink shadow-2xs placeholder:text-subtle focus:border-accent focus:outline-none"
          />
          {searchResults.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-2xl border border-divider bg-card p-1.5 shadow-xl">
              {searchResults.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => {
                    onChangeMarket(item.symbol);
                    setSearch('');
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs transition hover:bg-surface-2"
                >
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <MarketAssetLogo symbol={item.symbol} size={20} />
                    <span>{item.nameFa}</span>
                    <span className="text-[10px] text-subtle" dir="ltr">{item.symbol}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-muted tabular-nums">
                    <MoneyValue value={item.price} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* گام ۱: کارت اصلی حکم نهایی — بدون باکس‌های تو در تو، با هاله نوری و نوار بصری محدوده قیمت */}
      <Surface variant="focal" className="relative overflow-hidden border border-divider/85 shadow-sm">
        <div className={cn('h-1.5 w-full bg-gradient-to-l', theme.topBar)} aria-hidden />
        <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-b', theme.glow)} aria-hidden />

        <div className="relative p-5 sm:p-6 space-y-5">
          {/* ردیف بالا: هویت ارز + قیمت زنده درشت */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="rounded-2xl bg-card p-2 shadow-sm ring-1 ring-divider/80">
                <MarketAssetLogo symbol={activeSymbol} size={46} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight text-ink">{assetData.nameFa}</h2>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-extrabold text-muted" dir="ltr">
                    {activeSymbol}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ring-1',
                      theme.pill
                    )}
                  >
                    {theme.icon}
                    {consensus.badgeFa}
                  </span>
                </div>
                {athRangeInfo && (
                  <p className="text-xs text-muted">
                    سقف تاریخی <strong className="text-ink">{athRangeInfo.athPriceFa}</strong> ·{' '}
                    <strong className="text-rose-600 dark:text-rose-300">{athRangeInfo.drawdownClearFa}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="text-end">
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-ink whitespace-nowrap tabular-nums">
                <MoneyValue value={assetData.price} />
              </p>
              <div className="mt-1 flex items-center justify-end gap-2 text-xs">
                <PercentValue value={assetData.change24h} />
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
                      assetData.isLivePrice ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    )}
                  />
                  {assetData.priceSourceFa}
                </span>
              </div>
            </div>
          </div>

          {/* موقعیت شخصی شما در کیف پول (در صورت داشتن موجودی) */}
          {walletPos.valueUsd > 1 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl bg-card/75 px-4 py-2.5 text-xs ring-1 ring-divider/70 backdrop-blur-xs">
              <span className="flex items-center gap-1.5 font-bold text-accent">
                <Wallet className="h-3.5 w-3.5" />
                موقعیت شما:
              </span>
              <span className="text-muted">
                ارزش فعلی:{' '}
                <strong className="text-ink tabular-nums">
                  <UsdShort value={walletPos.valueUsd} />
                </strong>
              </span>
              {walletPos.avgCostUsd && (
                <span className="text-muted">
                  میانگین خرید:{' '}
                  <strong className="num-ltr text-ink">{fmtPrice(walletPos.avgCostUsd)}</strong>
                </span>
              )}
              {avgCostGapPct !== null && (
                <span className="text-muted">
                  فاصله از میانگین:{' '}
                  <strong className={cn('num-ltr', avgCostGapPct >= 0 ? 'text-positive' : 'text-negative')}>
                    {avgCostGapPct > 0 ? '+' : ''}
                    {numFa(avgCostGapPct, 1)}٪
                  </strong>
                </span>
              )}
            </div>
          )}

          {/* متن حکم نهایی — تمیز و بدون کادر شلوغ */}
          <div className="space-y-1.5">
            <h3 className="text-base font-extrabold text-ink">{consensus.headlineFa}</h3>
            <p className="text-xs leading-6 text-muted">
              <strong className="text-ink">دستورالعمل عملی:</strong> {consensus.actionRuleFa}
            </p>
          </div>

          {/* نوار بصری محدوده قیمت (حد ضرر ← قیمت فعلی ← هدف) + ۳ عدد کلیدی */}
          <div className="space-y-3 pt-1">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="absolute inset-y-0 start-0 w-1/3 bg-gradient-to-l from-transparent to-rose-500/35" />
              <div className="absolute inset-y-0 end-0 w-1/3 bg-gradient-to-r from-transparent to-emerald-500/35" />
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-card bg-ink shadow-sm transition-all duration-300"
                style={{ insetInlineStart: `${unifiedLevels.markerPct}%` }}
                title={`قیمت فعلی: ${fmtPrice(assetData.price)}`}
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-2xl bg-card/85 px-4 py-3 ring-1 ring-divider/75">
                <p className="text-[11px] font-semibold text-muted">{unifiedLevels.entryLabel}</p>
                <p className="mt-1 text-sm font-black text-ink">{unifiedLevels.entryValue}</p>
              </div>
              <div className="rounded-2xl bg-rose-500/[0.06] px-4 py-3 ring-1 ring-rose-500/20">
                <p className="text-[11px] font-semibold text-rose-700/85 dark:text-rose-300/85">
                  {unifiedLevels.stopLabel}
                </p>
                <p className="num-ltr mt-1 text-sm font-black text-negative">{unifiedLevels.stopValue}</p>
              </div>
              <div className="rounded-2xl bg-emerald-500/[0.06] px-4 py-3 ring-1 ring-emerald-500/20">
                <p className="text-[11px] font-semibold text-emerald-700/85 dark:text-emerald-300/85">
                  {unifiedLevels.targetLabel}
                </p>
                <p className="num-ltr mt-1 text-sm font-black text-positive">{unifiedLevels.targetValue}</p>
              </div>
            </div>
          </div>

          {/* نوار باز/بستن دلایل (به‌صورت پیش‌فرض بسته) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/60 pt-3.5">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-bold text-ink shadow-2xs ring-1 ring-divider transition hover:bg-surface-2"
            >
              {detailsOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-accent" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-accent" />
              )}
              <span>{detailsOpen ? 'بستن جزئیات و دلایل' : 'مشاهده دلایل حکم (کمیته، سوینگ و رژیم بازار)'}</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-card/85 px-2.5 py-1 text-muted ring-1 ring-divider/70">
                {consensus.committeeDirection === 'long' ? (
                  <TrendingUp className="h-3 w-3 text-positive" />
                ) : consensus.committeeDirection === 'short' ? (
                  <TrendingDown className="h-3 w-3 text-negative" />
                ) : null}
                کوتاه‌مدت: <strong className="text-ink">{consensus.committeeDirectionFa}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-card/85 px-2.5 py-1 text-muted ring-1 ring-divider/70">
                میان‌مدت: <strong className="text-ink">{consensus.swingDirectionFa}</strong>
              </span>
            </div>
          </div>

          {/* کشوی ۳-ستونه دلایل حکم */}
          {detailsOpen && (
            <div className="grid gap-3 pt-1 lg:grid-cols-3">
              {/* ستون ۱: رژیم بازار */}
              <div className="rounded-2xl bg-card/85 p-3.5 ring-1 ring-divider/75 space-y-2 text-xs">
                <p className="font-extrabold text-ink">۱. رژیم کل بازار</p>
                {regime ? (
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', regime.btcAbove200 ? 'bg-gain/15 text-positive' : 'bg-negative/12 text-negative')}>
                          {regime.btcAbove200 ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        </span>
                        BTC / میانگین ۲۰۰
                      </span>
                      <span className="num-ltr font-bold text-ink">
                        {btcGap === null ? '—' : btcGap >= 0 ? `${pctFa(btcGap, 1)} بالا` : `${pctFa(-btcGap, 1)} پایین`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', (regime.breadth ?? 0) >= REGIME_BREADTH ? 'bg-gain/15 text-positive' : 'bg-negative/12 text-negative')}>
                          {(regime.breadth ?? 0) >= REGIME_BREADTH ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        </span>
                        پهنای بازار (SMA50)
                      </span>
                      <span className="num-ltr font-bold text-ink">
                        {breadthUp === null ? '—' : `${toFaDigits(breadthUp)} از ${toFaDigits(regime.counted)}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">در حال همگام‌سازی…</p>
                )}
              </div>

              {/* ستون ۲: کمیته ایجنت‌ها */}
              <div className="rounded-2xl bg-card/85 p-3.5 ring-1 ring-divider/75 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-extrabold text-ink">
                    <Bot className="h-3.5 w-3.5 text-accent" />
                    ۲. کمیته (کوتاه‌مدت)
                  </span>
                  {committeeVerdict && (
                    <span className="text-[11px] font-black text-ink tabular-nums">
                      {toFaDigits(committeeVerdict.sentiment.overallScore)}/۱۰
                    </span>
                  )}
                </div>
                {committeeVerdict && (
                  <>
                    <p className="text-[11px] leading-5 text-muted">{committeeVerdict.ratingMeta.actionHint}</p>
                    <p className="text-[11px] text-muted">
                      حد ضرر: <strong className="num-ltr text-negative">{committeeVerdict.stop ? fmtPrice(committeeVerdict.stop) : '—'}</strong> · هدف:{' '}
                      <strong className="num-ltr text-positive">{committeeVerdict.target ? fmtPrice(committeeVerdict.target) : '—'}</strong>
                    </p>
                  </>
                )}
              </div>

              {/* ستون ۳: سوینگ */}
              <div className="rounded-2xl bg-card/85 p-3.5 ring-1 ring-divider/75 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-extrabold text-ink">
                    <Compass className="h-3.5 w-3.5 text-indigo-500" />
                    ۳. سوینگ (میان‌مدت)
                  </span>
                  <span className="text-[11px] font-black text-ink tabular-nums">
                    {toFaDigits(swingForAsset.score)}/۱۰۰
                  </span>
                </div>
                <p className="text-[11px] leading-5 text-muted">{swingForAsset.reason}</p>
                <p className="text-[11px] text-muted">
                  حد زیان: <strong className="num-ltr text-negative">{fmtPrice(swingForAsset.stop)}</strong> · هدف ۲.۵R:{' '}
                  <strong className="num-ltr text-positive">{fmtPrice(swingForAsset.target2)}</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      </Surface>

      {/* گام ۲: اجرا (سوییچ ۲تایی تمیز — فقط یک ابزار فعال در صفحه) */}
      <Surface className="border border-divider/80 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-ink">برنامه اجرا برای {assetData.nameFa}</h3>
            <p className="text-[11px] text-muted">فقط روشی را انتخاب کنید که قصد انجامش را دارید</p>
          </div>

          <SegmentedControl<ExecutionMode>
            label="روش اجرای معامله"
            size="sm"
            value={execMode}
            onChange={setExecMode}
            options={[
              { value: 'eom', label: 'خرید پله‌ای اسپات (EOM)', icon: <Calendar /> },
              { value: 'sizer', label: 'حجم و اهرم مجاز', icon: <ShieldCheck /> }
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                محاسبه سقف حجم اسپات و اهرم امن بر اساس ۵٪ بدترین ریزش‌های ۳ سال اخیر
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
              <Field label="حداکثر ریسک مجاز (٪ سرمایه)">
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-emerald-500/[0.09] via-card to-card p-4 ring-1 ring-emerald-500/25">
                  <p className="text-[11px] font-semibold text-muted">سقف حجم مجاز در اسپات</p>
                  <p className="mt-1.5 text-xl font-black text-ink tabular-nums">
                    {numFa(sizerRel.spotMaxUsd)}٪ سرمایه
                  </p>
                  {sizerAbs && (
                    <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      معادل <UsdShort value={sizerAbs.spotMaxUsd} />
                    </p>
                  )}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-indigo-500/[0.09] via-card to-card p-4 ring-1 ring-indigo-500/25">
                  <p className="text-[11px] font-semibold text-muted">سقف اهرم امن در پرپ (ایزوله)</p>
                  <p className="mt-1.5 text-xl font-black text-ink tabular-nums" dir="ltr">
                    {numFa(sizerRel.perpMaxLeverage)}x
                  </p>
                  {sizerAbs && (
                    <p className="mt-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      مارجین مجاز: <UsdShort value={sizerAbs.perpMarginUsd} />
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Surface>

      {/* گام ۳: بررسی عمیق‌تر */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" icon={<Bot className="h-3.5 w-3.5" />} onClick={() => onOpenAgents(activeSymbol)}>
          مناظره کامل هوش مصنوعی
        </Button>
        <Button size="sm" variant="outline" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onOpenSwing}>
          سایر فرصت‌های بازار
        </Button>
      </div>
    </div>
  );
}
