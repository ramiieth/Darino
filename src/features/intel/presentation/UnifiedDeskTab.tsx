/**
 * تب «تصمیم واحد» (Unified Decision Cockpit) — مرکز تصمیم‌گیری یکپارچه در یک صفحه
 *
 * هدف: پایان دادن به جابه‌جایی خسته‌کننده بین صفحات مختلف برای تصمیم‌گیری روی یک رمزارز یا دارایی:
 *   ۱) انتخاب سریع از دارایی‌های کیف پول خودتان، پیشنهادهای داغ سوینگ، یا هر نماد دلخواه بازار
 *   ۲) نوار وضعیت شخصی شما (موجودی فعلی، میانگین خرید، نقدینگی آزاد، قیمت زنده و فاصله از ATH)
 *   ۳) حکم هم‌زمان «کمیته ایجنت‌ها (TradingAgents)» و «سوینگ بازار» کنار هم در یک نگاه
 *   ۴) «ستاپ پایان ماه (EOM) و پله‌های خرید روی ریزش» متصل به میانگین خرید فعلی شما در همان صفحه
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Calendar,
  Compass,
  Layers,
  Search,
  Sparkles,
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
import { useCommitteeMarkets, useSwing } from '../data/intelApi';
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

  // ۴) داده‌های زندهٔ دارایی انتخاب‌شده
  const assetData = useMemo(() => {
    const fromTop = cryptoTop200.find((c) => canonicalAssetSymbol(c.symbol) === activeSymbol);
    const fromCommittee = committeeMarkets.data?.find((m) => canonicalAssetSymbol(m.coin) === activeSymbol);
    const fromCurated = GLOBAL_COMMITTEE_MARKETS.find((m) => canonicalAssetSymbol(m.coin) === activeSymbol);

    const price = fromCommittee?.markPx ?? fromTop?.price ?? fromCurated?.refPrice ?? 100;
    const change24h = fromTop?.change24h ?? fromCommittee?.change24h ?? fromCurated?.refChange24h ?? 0;
    const change7d = fromTop?.change7d ?? null;
    const change30d = fromTop?.change30d ?? null;
    const nameInfo = assetDisplayName(activeSymbol);
    const nameFa = nameInfo.name !== activeSymbol ? nameInfo.name : fromCurated?.nameFa ?? activeSymbol;

    return {
      symbol: activeSymbol,
      nameFa,
      price,
      change24h,
      change7d,
      change30d,
      volume24hUsd: fromCommittee?.volume24h ?? fromCurated?.volume24h ?? null,
      openInterestUsd: fromCommittee?.openInterestUsd ?? fromCurated?.openInterestUsd ?? null,
      maxLeverage: fromCommittee?.maxLeverage ?? fromCurated?.maxLeverage ?? 10,
      fundingAprNow: fromCommittee ? fromCommittee.fundingHourly * 24 * 365 * 100 : null
    };
  }, [activeSymbol, cryptoTop200, committeeMarkets.data]);

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

  // ۵) حکم فوری و قطعی «کمیته ایجنت‌ها (TradingAgents)» برای همین دارایی
  const committeeVerdict = useMemo(() => {
    const candles = synthesizeFallbackCandles(assetData.price, assetData.change24h, activeSymbol, 120);
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
  }, [activeSymbol, assetData, swingQuery.data?.regime, walletPos.stableCashUsd, walletPos.valueUsd, walletBridge.totalLiveUsd]);

  // ۶) سیگنال سوینگ برای همین دارایی (از لیست زنده یا محاسبهٔ مستقیم)
  const swingForAsset = useMemo(() => {
    const exact = swingOpportunities.find((o) => canonicalAssetSymbol(o.symbol) === activeSymbol);
    if (exact) return exact;
    const stop = assetData.price * 0.93;
    const risk = assetData.price - stop;
    return {
      id: activeSymbol.toLowerCase(),
      symbol: activeSymbol,
      price: assetData.price,
      change24h: assetData.change24h,
      change7d: assetData.change7d,
      change30d: assetData.change30d,
      score: athRangeInfo && athRangeInfo.drawdownFromAthPct <= -40 ? 72 : 58,
      verdict: 'watch' as const,
      verdictFa: 'تحت نظر برای ورود پله‌ای',
      entry: assetData.price,
      stop,
      target1: assetData.price + risk * 1.5,
      target2: assetData.price + risk * 2.5,
      reason: athRangeInfo
        ? `${athRangeInfo.rangeStatusLabelFa} · ${athRangeInfo.drawdownClearFa}`
        : 'رصد قیمت نسبت به حمایت‌های کوتاه‌مدت',
      fromPerpSignal: false
    };
  }, [swingOpportunities, activeSymbol, assetData, athRangeInfo]);

  const regimeState = swingQuery.data?.regime.state ?? 'unknown';

  return (
    <div className="space-y-5">
      {/* ۱) نوار انتخاب سریع دارایی (کیف پول شما + فرصت‌های سوینگ + جستجو) */}
      <Surface className="p-4 space-y-3">
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

        {/* چیپ‌های دارایی‌های کیف پول کاربر + پرکاربردها */}
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

      {/* ۲) کارت هویت دارایی + وضعیت شخصی شما در کیف پول */}
      <Surface variant="focal" className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-card p-1 shadow-xs ring-2 ring-divider">
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
                  <span className="text-indigo-600 dark:text-indigo-300 font-semibold">{athRangeInfo.rangeStatusLabelFa}</span>
                </p>
              )}
            </div>
          </div>

          <div className="text-end">
            <p className="text-xl font-extrabold text-ink whitespace-nowrap">
              <MoneyValue value={assetData.price} />
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-2 text-xs">
              <PercentValue value={assetData.change24h} />
              <span className="text-[11px] text-subtle">۲۴ ساعت</span>
            </div>
          </div>
        </div>
      </Surface>

      {/* ۳) حکم هم‌زمان «کمیته ایجنت‌ها» و «سوینگ بازار» کنار هم */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* کارت چپ/اول: کمیته ایجنت‌ها (TradingAgents) */}
        <Surface className="flex flex-col justify-between gap-3.5 border-s-4 border-s-accent p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent" aria-hidden />
                <h3 className="text-sm font-extrabold text-ink">جمع‌بندی کمیته ایجنت‌ها</h3>
              </div>
              {committeeVerdict && (
                <div className="flex items-center gap-1.5">
                  <Badge tone={committeeVerdict.ratingMeta.tone}>{committeeVerdict.ratingMeta.short}</Badge>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink">
                    امتیاز {toFaDigits(committeeVerdict.sentiment.overallScore)}/۱۰
                  </span>
                </div>
              )}
            </div>

            {committeeVerdict ? (
              <>
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-divider bg-divider text-center">
                  <div className="bg-card px-2 py-2">
                    <p className="text-[10px] text-subtle">ورود مرجع</p>
                    <p className="num-ltr text-xs font-extrabold text-ink">{fmtPrice(committeeVerdict.entry)}</p>
                  </div>
                  <div className="bg-card px-2 py-2">
                    <p className="text-[10px] text-subtle">حد ضرر (۲×ATR)</p>
                    <p className="num-ltr text-xs font-extrabold text-negative">
                      {committeeVerdict.stop ? fmtPrice(committeeVerdict.stop) : 'صبر'}
                    </p>
                  </div>
                  <div className="bg-card px-2 py-2">
                    <p className="text-[10px] text-subtle">
                      هدف {committeeVerdict.rr ? `(${toFaDigits(committeeVerdict.rr)}R)` : ''}
                    </p>
                    <p className="num-ltr text-xs font-extrabold text-positive">
                      {committeeVerdict.target ? fmtPrice(committeeVerdict.target) : 'صبر'}
                    </p>
                  </div>
                </div>

                <p className="text-xs leading-6 text-muted">
                  {committeeVerdict.ratingMeta.actionHint}
                </p>

                <div className="rounded-control bg-surface-2/60 px-3 py-2 text-[11px] leading-5 text-muted">
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
        </Surface>

        {/* کارت راست/دوم: پیشنهاد سوینگ بازار */}
        <Surface className="flex flex-col justify-between gap-3.5 border-s-4 border-s-indigo-500 p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-indigo-500" aria-hidden />
                <h3 className="text-sm font-extrabold text-ink">ستاپ سوینگ (میان‌مدت)</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={swingForAsset.verdict === 'entry' ? 'gain' : swingForAsset.verdict === 'accumulate' ? 'info' : 'neutral'}>
                  {swingForAsset.verdictFa}
                </Badge>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink">
                  امتیاز {toFaDigits(swingForAsset.score)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-divider bg-divider text-center">
              <div className="bg-card px-2 py-2">
                <p className="text-[10px] text-subtle">محدوده ورود</p>
                <p className="num-ltr text-xs font-extrabold text-ink">{fmtPrice(swingForAsset.entry)}</p>
              </div>
              <div className="bg-card px-2 py-2">
                <p className="text-[10px] text-subtle">حد زیان سوینگ</p>
                <p className="num-ltr text-xs font-extrabold text-negative">{fmtPrice(swingForAsset.stop)}</p>
              </div>
              <div className="bg-card px-2 py-2">
                <p className="text-[10px] text-subtle">هدف ۲.۵R</p>
                <p className="num-ltr text-xs font-extrabold text-positive">{fmtPrice(swingForAsset.target2)}</p>
              </div>
            </div>

            <p className="text-xs leading-6 text-muted">{swingForAsset.reason}</p>

            <div className="rounded-control bg-surface-2/60 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
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
        </Surface>
      </div>

      {/* ۴) ستاپ پایان ماه (EOM) و پله‌های خرید روی ریزش — متصل مستقیم به میانگین خرید فعلی شما */}
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
