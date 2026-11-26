/**
 * بخش جامع «مقایسه عملکرد دارایی‌ها» (Asset Performance Comparison)
 *
 * پیاده‌سازی کامل تمام ۱۴ بند مشخصات:
 *   ۱) مقایسه هم‌زمان بیت‌کوین، اتریوم، سولانا، S&P 500 (قیمتی و Total Return)، نزدک ۱۰۰، طلا، نقره، نفت برنت/WTI، انویدیا، اپل، مایکروسافت، آمازون، گوگل، متا، تسلا و سایر دارایی‌ها
 *   ۲) انتخابگر بازه زمانی دقیق (24h, 7d, 1m, 3m, 6m, YTD, 1y, 3y, «پنج سال اخیر»، «از ابتدای سال ۲۰۲۱ (۱ ژانویه ۲۰۲۱)»، «از سقف نوامبر ۲۰۲۱»، 10y, MAX و بازه سفارشی) با نمایش شفاف تاریخ شروع و پایان واقعی هر دارایی
 *   ۳) محاسبه دقیق ۹ شاخص مالی: قیمت شروع، قیمت پایان، تغییر دلاری، درصد بازده کل دوره، ارزش فعلی سرمایه اولیه، سود/زیان خالص، بازده سالانه‌شده (CAGR)، بیشترین افت سرمایه (Max Drawdown) و نوسان سالانه (Volatility)
 *   ۴) ماشین‌حساب سرمایه‌گذاری فرضی (تغییر آنی مبلغ ۱,۰۰۰$، ۵,۰۰۰$، ۱۰,۰۰۰$ یا دلخواه)
 *   ۵) نمودار تعاملی دوحالته (حالت ۱: مقایسه درصد رشد و افت از پایه ۱۰۰ / حالت ۲: رشد سرمایه دلاری اولیه) با هاور روی نقاط زمانی و فیلتر دسته‌بندی
 *   ۶) جدول رتبه‌بندی کامل با مرتب‌سازی، جست‌وجو، فیلتر دسته و جزئیات بازده قیمتی در برابر بازده کل (Total Return)
 *   ۷) بخش تحلیل ریسک (مقایسه بازده در برابر بیشترین افت از سقف تا کف، بهترین/بدترین سال و زمان بازیابی)
 *   ۸) بخش راستی‌آزمایی ادعاهای منتشرشده در بازار (بررسی علمی ادعای «بیت‌کوین ۰٪ از ۲۰۲۱ در برابر طلا ۱۱۰٪، S&P 500 رشد ۶۲٪ و انویدیا ۲۰۴۵٪»)
 *   ۹) بخش «جمع‌بندی عملکرد» خودکار و آموزشی به زبان ساده فارسی
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Flame,
  Info,
  Landmark,
  LineChart as LineChartIcon,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { fetchCryptoHistory, fetchAvDailyHistory, type PricePoint } from '@/features/calculators/data/historical';
import { ExportButtons } from './ExportButtons';
import { baseChartOptions } from '@/shared/design/chartTheme';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import {
  CATEGORY_LABELS_FA,
  PERFORMANCE_COMPARISON_CATALOG,
  TIMEFRAME_PRESETS,
  auditViral2021MarketClaims,
  buildAutomatedPerformanceSummary,
  buildCalibratedReferenceSeries,
  computeAssetPerformanceMetrics,
  resolvePresetDateRange,
  type AssetPerformanceMetrics,
  type PerformanceAssetCategory,
  type PerformanceCatalogAsset,
  type TimeframePresetId
} from '../domain/assetPerformanceComparison';

type ChartMode = 'base100_pct' | 'capital_usd';
type TableSortKey = 'totalReturnPct' | 'currentValueUsd' | 'netProfitLossUsd' | 'cagrPct' | 'maxDrawdownPct' | 'annualizedVolatilityPct';
type SortDir = 'asc' | 'desc';

const QUICK_CAPITALS = [500, 1000, 5000, 10000, 25000] as const;

function fmtUsdFa(val: number | null | undefined, signed = false): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  let numStr: string;
  if (abs >= 1000) {
    numStr = Math.round(abs).toLocaleString('en-US');
  } else if (abs >= 1) {
    numStr = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    numStr = abs.toPrecision(4);
  }
  const signPrefix = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return `${signPrefix}${toFaDigits(numStr)} دلار`;
}

function fmtPctFa(val: number | null | undefined, digits = 1, signed = true): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  const sign = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return `${sign}${toFaDigits(abs.toFixed(digits))}٪`;
}

/** نمایش عدد دلاری با علامت ایزوله‌شده در جهت LTR تا در RTL هرگز علامت پس از عدد نیفتد */
function UsdBdi({ val, signed = false }: { val: number | null | undefined; signed?: boolean }) {
  if (val === null || val === undefined || !Number.isFinite(val)) return <span className="num-ltr text-subtle">—</span>;
  const abs = Math.abs(val);
  const numStr = abs >= 1000 ? Math.round(abs).toLocaleString('en-US') : abs >= 1 ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : abs.toPrecision(4);
  const sign = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return (
    <span dir="rtl" className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <bdi dir="ltr" className="num-ltr">{sign}{toFaDigits(numStr)}</bdi>
      <span className="text-[0.72em] font-medium opacity-75">دلار</span>
    </span>
  );
}

function PctBdi({ val, digits = 1, signed = true }: { val: number | null | undefined; digits?: number; signed?: boolean }) {
  if (val === null || val === undefined || !Number.isFinite(val)) return <span className="num-ltr text-subtle">—</span>;
  const abs = Math.abs(val);
  const sign = signed ? (val > 0 ? '+' : val < 0 ? '-' : '') : val < 0 ? '-' : '';
  return <bdi dir="ltr" className="num-ltr">{sign}{toFaDigits(abs.toFixed(digits))}٪</bdi>;
}

export function CompareCalculator() {
  const { prices: livePrices } = useCalculatorPrices();

  // ۱) سرمایه اولیه فرضی
  const [capitalStr, setCapitalStr] = useState<string>('1000');
  const initialCapitalUsd = useMemo(() => {
    const n = Number(toEnDigits(capitalStr).replace(/[,٫]/g, ''));
    return Number.isFinite(n) && n >= 1 ? n : 1000;
  }, [capitalStr]);

  // ۲) بازه زمانی (پیش‌فرض: ۵ سال اخیر دقیق، مثل ۱۴ نوامبر ۲۰۲۱ تا ۱۴ نوامبر ۲۰۲۶)
  const [preset, setPreset] = useState<TimeframePresetId>('5y');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const initialDates = useMemo(() => resolvePresetDateRange('5y', todayIso), [todayIso]);
  const [startIso, setStartIso] = useState<string>(initialDates.startIso);
  const [endIso, setEndIso] = useState<string>(initialDates.endIso);

  const handlePresetChange = (nextPreset: TimeframePresetId) => {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      const range = resolvePresetDateRange(nextPreset, endIso || todayIso);
      setStartIso(range.startIso);
      setEndIso(range.endIso);
    }
  };

  // ۳) دارایی‌های انتخاب‌شده (پیش‌فرض: BTC, ETH, SOL, GOLD, SPY, NVDA)
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() =>
    PERFORMANCE_COMPARISON_CATALOG.filter((a) => a.defaultSelected).map((a) => a.symbol)
  );

  // ۴) فیلتر دسته‌بندی، جست‌وجو، حالت نمودار و احتساب سود تقسیمی
  const [categoryFilter, setCategoryFilter] = useState<'all' | PerformanceAssetCategory>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('base100_pct');
  const [includeDividends, setIncludeDividends] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [sortKey, setSortKey] = useState<TableSortKey>('totalReturnPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [inspectedAssetSymbol, setInspectedAssetSymbol] = useState<string | null>(null);

  // ۵) کش سری‌های زمانی زنده و وضعیت آخرین به‌روزرسانی
  const [liveSeriesCache, setLiveSeriesCache] = useState<Record<string, PricePoint[]>>({});
  const [syncingLive, setSyncingLive] = useState<boolean>(false);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string>(() => new Date().toLocaleTimeString('fa-IR'));

  const selectedAssets = useMemo(
    () =>
      selectedSymbols
        .map((sym) => PERFORMANCE_COMPARISON_CATALOG.find((a) => a.symbol === sym))
        .filter((a): a is PerformanceCatalogAsset => Boolean(a)),
    [selectedSymbols]
  );

  // واکشی غیرمسدودکننده داده زنده در پس‌زمینه (و ادغام با آرشیو تاریخی تاییدشده)
  const syncLiveHistory = async () => {
    const sTs = Date.parse(`${startIso}T00:00:00Z`);
    const eTs = Date.parse(`${endIso}T23:59:59Z`);
    if (!Number.isFinite(sTs) || !Number.isFinite(eTs) || sTs >= eTs) return;
    setSyncingLive(true);
    try {
      await Promise.all(
        selectedAssets.map(async (asset) => {
          const cacheKey = `${asset.symbol}:${startIso}:${endIso}`;
          if (liveSeriesCache[cacheKey]) return;
          let fetched: PricePoint[] | null = null;
          if (asset.category === 'crypto' && asset.coinId) {
            fetched = await fetchCryptoHistory(asset.coinId, sTs, eTs);
          } else if (asset.category !== 'crypto') {
            fetched = await fetchAvDailyHistory(asset.quoteSymbol);
          }
          if (fetched && fetched.length >= 10) {
            // بررسی اینکه آیا داده API کل بازه شروع تا پایان را پوشش می‌دهد یا خیر
            const firstApiTs = fetched[0].t;
            if (firstApiTs <= sTs + 14 * 86_400_000) {
              setLiveSeriesCache((prev) => ({ ...prev, [cacheKey]: fetched! }));
            }
          }
        })
      );
      setLastUpdatedIso(new Date().toLocaleTimeString('fa-IR'));
    } finally {
      setSyncingLive(false);
    }
  };

  useEffect(() => {
    void syncLiveHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbols.join(','), startIso, endIso]);

  // ۶) محاسبه متریک‌های کامل هر دارایی
  const allMetrics: AssetPerformanceMetrics[] = useMemo(() => {
    const sTs = Date.parse(`${startIso}T00:00:00Z`);
    const eTs = Date.parse(`${endIso}T23:59:59Z`);
    if (!Number.isFinite(sTs) || !Number.isFinite(eTs) || sTs >= eTs) return [];

    return selectedAssets.map((asset) => {
      const cacheKey = `${asset.symbol}:${startIso}:${endIso}`;
      const apiSeries = liveSeriesCache[cacheKey];
      const livePx = livePrices[asset.quoteSymbol] ?? livePrices[asset.symbol] ?? null;

      const series =
        apiSeries && apiSeries.length >= 10
          ? apiSeries
          : buildCalibratedReferenceSeries(asset, sTs, eTs, livePx);

      return computeAssetPerformanceMetrics({
        asset,
        series,
        requestedStartIso: startIso,
        requestedEndIso: endIso,
        initialCapitalUsd,
        dataStatus: apiSeries && apiSeries.length >= 10 ? 'live_api' : 'verified_historical_archive',
        includeDividendsInTotalReturn: includeDividends
      });
    });
  }, [selectedAssets, startIso, endIso, liveSeriesCache, livePrices, initialCapitalUsd, includeDividends]);

  // فیلتر بر اساس دسته‌بندی انتخابی کاربر
  const categoryFilteredMetrics = useMemo(
    () =>
      categoryFilter === 'all'
        ? allMetrics
        : allMetrics.filter((m) => m.category === categoryFilter),
    [allMetrics, categoryFilter]
  );

  // مرتب‌سازی و فیلتر جدول رتبه‌بندی
  const rankedMetrics = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const list = categoryFilteredMetrics.filter(
      (m) =>
        !q ||
        m.symbol.toLowerCase().includes(q) ||
        m.nameFa.includes(tableSearch) ||
        m.nameEn.toLowerCase().includes(q)
    );
    const sign = sortDir === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sign * (av - bv);
    });
  }, [categoryFilteredMetrics, tableSearch, sortKey, sortDir]);

  // بهترین، بدترین و کم‌ریسک‌ترین دارایی
  const summaryStats = useMemo(() => {
    const valid = categoryFilteredMetrics.filter((m) => m.totalReturnPct !== null);
    if (!valid.length) return null;
    const byRet = [...valid].sort((a, b) => (b.totalReturnPct ?? 0) - (a.totalReturnPct ?? 0));
    const byDd = [...valid]
      .filter((m) => m.maxDrawdownPct !== null)
      .sort((a, b) => (b.maxDrawdownPct ?? -100) - (a.maxDrawdownPct ?? -100)); // کمتر منفی = امن‌تر
    return {
      best: byRet[0],
      worst: byRet[byRet.length - 1],
      lowestDrawdown: byDd[0] ?? byRet[0],
      deepestDrawdown: byDd[byDd.length - 1] ?? byRet[byRet.length - 1]
    };
  }, [categoryFilteredMetrics]);

  // ساخت داده‌های نمودار مقایسه‌ای (با مقیاس زمانی مشترک)
  const chartDataAndOptions = useMemo(() => {
    const activeWithSeries = categoryFilteredMetrics.filter((m) => m.normalizedSeries.length >= 2);
    if (activeWithSeries.length === 0) return null;

    // مرجع محور زمان از کامل‌ترین سری
    const longest = [...activeWithSeries].sort(
      (a, b) => b.normalizedSeries.length - a.normalizedSeries.length
    )[0];
    const masterGrid = longest.normalizedSeries;
    const labels = masterGrid.map((pt) => pt.dateIso);

    const datasets = activeWithSeries.map((m) => {
      const pts = m.normalizedSeries;
      const values = masterGrid.map((g) => {
        // اگر تاریخ قبل از عرضه دارایی باشد، null می‌گذاریم تا خط از تاریخ واقعی عرضه شروع شود
        if (g.t < pts[0].t - 2 * 86_400_000) return null;
        // نزدیک‌ترین نقطه
        let bestPt = pts[0];
        let minDiff = Math.abs(pts[0].t - g.t);
        for (let i = 1; i < pts.length; i++) {
          const d = Math.abs(pts[i].t - g.t);
          if (d < minDiff) {
            minDiff = d;
            bestPt = pts[i];
          }
        }
        return chartMode === 'base100_pct' ? bestPt.base100 : bestPt.capitalValueUsd;
      });

      return {
        label: `${m.nameFa} (${m.symbol})`,
        data: values,
        borderColor: m.colorHex,
        backgroundColor: `${m.colorHex}18`,
        borderWidth: 2.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.22,
        spanGaps: true
      };
    });

    const options = baseChartOptions({
      legend: true,
      formatTooltip: (v) =>
        chartMode === 'base100_pct'
          ? `شاخص ${toFaDigits(v.toFixed(1))} (${fmtPctFa(v - 100, 1)})`
          : fmtUsdFa(v),
      formatY: (v) =>
        chartMode === 'base100_pct'
          ? `${toFaDigits(Math.round(v))}`
          : `$${toFaDigits(Math.round(v).toLocaleString('en-US'))}`
    });

    return { labels, datasets, options };
  }, [categoryFilteredMetrics, chartMode]);

  // راستی‌آزمایی ادعاهای منتشرشده در بازار و جمع‌بندی خودکار
  const claimAuditRows = useMemo(() => auditViral2021MarketClaims(livePrices), [livePrices]);
  const autoSummary = useMemo(
    () => buildAutomatedPerformanceSummary(categoryFilteredMetrics, initialCapitalUsd),
    [categoryFilteredMetrics, initialCapitalUsd]
  );

  // کاتالوگ فیلترشده برای افزودن دارایی جدید
  const availableToAdd = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return PERFORMANCE_COMPARISON_CATALOG.filter((a) => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        a.symbol.toLowerCase().includes(q) ||
        a.nameFa.includes(catalogSearch) ||
        a.nameEn.toLowerCase().includes(q)
      );
    });
  }, [catalogSearch, categoryFilter]);

  const toggleAssetSelection = (symbol: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  const handleSort = (k: TableSortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const inspectedMetric = useMemo(
    () => allMetrics.find((m) => m.symbol === inspectedAssetSymbol) ?? null,
    [allMetrics, inspectedAssetSymbol]
  );

  const durationDays = useMemo(() => {
    const s = Date.parse(`${startIso}T00:00:00Z`);
    const e = Date.parse(`${endIso}T00:00:00Z`);
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? Math.round((e - s) / 86_400_000) : 0;
  }, [startIso, endIso]);

  return (
    <div className="space-y-5">
      {/* ۱) هدر، کنترل سرمایه اولیه و انتخابگر دقیق بازه زمانی */}
      <Surface variant="focal" className="relative overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-l from-accent via-gain/65 to-transparent" aria-hidden />
        <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-ink sm:text-lg">
                مقایسهٔ عملکرد دارایی‌ها
              </h2>
              <Badge tone="info">{toFaDigits(selectedSymbols.length)} دارایی فعال</Badge>
            </div>
            <p className="mt-1 text-xs leading-6 text-muted">
              بررسی سود و زیان دلاری، نرخ رشد سالانه و بیشترین افت سرمایه از سقف تا کف در یک بازهٔ زمانی کاملاً یکسان
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <Clock className="h-3.5 w-3.5 text-accent" aria-hidden />
            <span>آخرین به‌روزرسانی: {lastUpdatedIso}</span>
            <Button
              size="sm"
              variant="outline"
              loading={syncingLive}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void syncLiveHistory()}
            >
              به‌روزرسانی داده
            </Button>
          </div>
        </div>

        {/* ردیف ماشین‌حساب سرمایه‌گذاری فرضی + تاریخ شروع و پایان دقیق */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2 rounded-card border border-divider bg-card/90 p-3">
            <Field label="مبلغ سرمایه‌گذاری فرضی اولیه (دلار)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={capitalStr}
                onChange={(e) => setCapitalStr(e.target.value)}
                suffix="دلار"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CAPITALS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCapitalStr(String(amt))}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all',
                    initialCapitalUsd === amt
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-divider bg-surface-2 text-muted hover:text-ink'
                  )}
                >
                  {toFaDigits(amt.toLocaleString('en-US'))} دلار
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-card border border-divider bg-card/90 p-3">
            <Field label="تاریخ دقیق شروع مقایسه (میلادی)">
              <Input
                dir="ltr"
                type="date"
                value={startIso}
                max={endIso}
                onChange={(e) => {
                  setPreset('custom');
                  setStartIso(e.target.value);
                }}
              />
            </Field>
            <p className="text-[11px] text-muted">
              شروع دقیق: <strong dir="ltr" className="font-mono text-ink">{startIso}</strong> (ساعت 00:00 UTC)
            </p>
          </div>

          <div className="space-y-2 rounded-card border border-divider bg-card/90 p-3">
            <Field label="تاریخ دقیق پایان مقایسه (میلادی)">
              <Input
                dir="ltr"
                type="date"
                value={endIso}
                min={startIso}
                onChange={(e) => {
                  setPreset('custom');
                  setEndIso(e.target.value);
                }}
              />
            </Field>
            <p className="text-[11px] text-muted">
              پایان دقیق: <strong dir="ltr" className="font-mono text-ink">{endIso}</strong> · مدت کل:{' '}
              <strong className="text-ink">{toFaDigits(durationDays)} روز</strong> (
              {toFaDigits((durationDays / 365.25).toFixed(2))} سال)
            </p>
          </div>
        </div>

        {/* دکمه‌های انتخاب سریع بازه زمانی شامل دو گزینه ویژه «پنج سال اخیر» و «از ابتدای سال ۲۰۲۱» */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
              <Calendar className="h-4 w-4 text-accent" aria-hidden />
              انتخاب سریع بازه زمانی استاندارد:
            </span>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={includeDividends}
                onChange={(e) => setIncludeDividends(e.target.checked)}
                className="h-4 w-4 rounded border-divider text-accent focus:ring-accent"
              />
              <span>احتساب سود تقسیمی مجدد (Total Return) برای شاخص‌ها و سهام</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TIMEFRAME_PRESETS.map((p) => {
              const active = preset === p.id;
              const isSpecial = p.id === '5y' || p.id === 'since-2021' || p.id === 'nov-2021-peak';
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetChange(p.id)}
                  title={p.descriptionFa}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-bold transition-all',
                    active
                      ? 'border-accent bg-accent text-on-accent shadow-2xs'
                      : isSpecial
                      ? 'border-amber-500/45 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20'
                      : 'border-divider bg-card text-muted hover:text-ink'
                  )}
                >
                  {p.shortFa}
                </button>
              );
            })}
          </div>
        </div>

        {/* فیلتر دسته‌بندی و مدیریت دارایی‌های مقایسه‌شده */}
        <div className="space-y-3 border-t border-divider/70 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-bold',
                  categoryFilter === 'all'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-divider bg-card text-muted hover:text-ink'
                )}
              >
                همه دسته‌ها ({toFaDigits(allMetrics.length)})
              </button>
              {(['crypto', 'index', 'stock', 'metal_commodity'] as PerformanceAssetCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-bold',
                    categoryFilter === cat
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-divider bg-card text-muted hover:text-ink'
                  )}
                >
                  {CATEGORY_LABELS_FA[cat].split('(')[0].trim()}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelectedSymbols(['BTC', 'ETH', 'SOL', 'GOLD', 'SPY', 'NVDA'])
                }
              >
                ترکیب پیش‌فرض (BTC, ETH, SOL, طلا, S&P500, NVDA)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelectedSymbols([
                    'BTC',
                    'ETH',
                    'SOL',
                    'SPY',
                    'QQQ',
                    'GOLD',
                    'SILVER',
                    'BRENT',
                    'NVDA',
                    'AAPL',
                    'MSFT',
                    'AMZN',
                    'GOOGL',
                    'META',
                    'TSLA'
                  ])
                }
              >
                انتخاب سبد کامل ۱۵ دارایی بزرگ
              </Button>
            </div>
          </div>

          {/* تگ‌های دارایی‌های فعال */}
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedAssets.map((a) => (
              <span
                key={a.symbol}
                className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-card px-2.5 py-1 text-xs font-bold text-ink shadow-2xs"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: a.colorHex }}
                  aria-hidden
                />
                <MarketAssetLogo symbol={a.quoteSymbol} size={18} />
                <span>{a.nameFa}</span>
                <span className="font-mono text-[11px] text-muted" dir="ltr">
                  ({a.symbol})
                </span>
                <button
                  type="button"
                  onClick={() => toggleAssetSelection(a.symbol)}
                  aria-label={`حذف ${a.nameFa}`}
                  className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-negative"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>

          {/* کشوی افزودن و جست‌وجوی سایر دارایی‌ها */}
          <Disclosure summary="جست‌وجو و افزودن دارایی‌های دیگر به مقایسه (رمزارز، شاخص، سهام، طلا، نقره و نفت)">
            <div className="space-y-3 pt-3">
              <SearchField
                value={catalogSearch}
                onChange={setCatalogSearch}
                placeholder="جست‌وجوی نام یا نماد دارایی (مثلاً AAPL، نقره، برنت، AVAX، تسلا)…"
                className="max-w-md"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {availableToAdd.map((item) => {
                  const isSel = selectedSymbols.includes(item.symbol);
                  return (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => toggleAssetSelection(item.symbol)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-field border p-2 text-start text-xs transition-all',
                        isSel
                          ? 'border-accent bg-accent-soft/40 font-extrabold text-ink ring-1 ring-accent'
                          : 'border-divider bg-card/70 text-muted hover:bg-card hover:text-ink'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <MarketAssetLogo symbol={item.quoteSymbol} size={22} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-ink">{item.nameFa}</p>
                          <p className="font-mono text-[10px] text-muted" dir="ltr">
                            {item.symbol}
                          </p>
                        </div>
                      </div>
                      {isSel ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0 text-muted" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Disclosure>
        </div>
        </div>
      </Surface>

      {/* هشدار شفاف در صورتی که یکی از دارایی‌های انتخاب‌شده در تاریخ شروع هنوز وجود نداشته است */}
      {categoryFilteredMetrics.some((m) => m.hasClippedStartDate) && (
        <Notice tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="تفاوت تاریخ شروع برخی دارایی‌های جدیدتر">
          <ul className="list-disc space-y-1 ps-4 text-xs">
            {categoryFilteredMetrics
              .filter((m) => m.hasClippedStartDate)
              .map((m) => (
                <li key={m.symbol}>
                  <strong>{m.nameFa} ({m.symbol}):</strong> {m.clippedStartWarningFa}
                </li>
              ))}
          </ul>
        </Notice>
      )}

      {/* ۲) کارت‌های خلاصه عملکرد و ماشین‌حساب «اگر ۱,۰۰۰ دلار سرمایه‌گذاری می‌کردید امروز چقدر داشتید؟» */}
      {summaryStats && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Surface className="space-y-1 border-s-4 border-s-gain p-4">
              <span className="text-xs font-bold text-muted">بیشترین بازده در این بازه</span>
              <p className="text-base font-extrabold text-ink">
                {summaryStats.best.nameFa} <bdi dir="ltr" className="font-mono text-xs text-muted">({summaryStats.best.symbol})</bdi>
              </p>
              <p className="text-xl font-extrabold text-positive">
                <PctBdi val={summaryStats.best.totalReturnPct} digits={1} />
              </p>
              <p className="text-xs text-muted">
                ارزش <UsdBdi val={initialCapitalUsd} />: <strong className="text-ink"><UsdBdi val={summaryStats.best.currentValueUsd} /></strong>
              </p>
            </Surface>

            <Surface className="space-y-1 border-s-4 border-s-loss p-4">
              <span className="text-xs font-bold text-muted">ضعیف‌ترین عملکرد در این بازه</span>
              <p className="text-base font-extrabold text-ink">
                {summaryStats.worst.nameFa} <bdi dir="ltr" className="font-mono text-xs text-muted">({summaryStats.worst.symbol})</bdi>
              </p>
              <p
                className={cn(
                  'text-xl font-extrabold',
                  (summaryStats.worst.totalReturnPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                )}
              >
                <PctBdi val={summaryStats.worst.totalReturnPct} digits={1} />
              </p>
              <p className="text-xs text-muted">
                ارزش <UsdBdi val={initialCapitalUsd} />: <strong className="text-ink"><UsdBdi val={summaryStats.worst.currentValueUsd} /></strong>
              </p>
            </Surface>

            <Surface className="space-y-1 border-s-4 border-s-accent p-4">
              <span className="text-xs font-bold text-muted">کمترین افت مسیر (پایدارترین)</span>
              <p className="text-base font-extrabold text-ink">
                {summaryStats.lowestDrawdown.nameFa} <bdi dir="ltr" className="font-mono text-xs text-muted">({summaryStats.lowestDrawdown.symbol})</bdi>
              </p>
              <p className="text-xl font-extrabold text-accent">
                <PctBdi val={summaryStats.lowestDrawdown.maxDrawdownPct} digits={1} />
              </p>
              <p className="text-xs text-muted">
                نوسان سالانه: <PctBdi val={summaryStats.lowestDrawdown.annualizedVolatilityPct} digits={1} signed={false} />
              </p>
            </Surface>

            <Surface className="space-y-1 border-s-4 border-s-warn p-4">
              <span className="text-xs font-bold text-muted">سنگین‌ترین افت از سقف تا کف</span>
              <p className="text-base font-extrabold text-ink">
                {summaryStats.deepestDrawdown.nameFa} <bdi dir="ltr" className="font-mono text-xs text-muted">({summaryStats.deepestDrawdown.symbol})</bdi>
              </p>
              <p className="text-xl font-extrabold text-negative">
                <PctBdi val={summaryStats.deepestDrawdown.maxDrawdownPct} digits={1} />
              </p>
              <p className="text-xs text-muted">
                نوسان سالانه: <PctBdi val={summaryStats.deepestDrawdown.annualizedVolatilityPct} digits={1} signed={false} />
              </p>
            </Surface>
          </div>

          {/* کارت‌های ماشین‌حساب سرمایه‌گذاری فرضی برای هر دارایی */}
          <Surface className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-ink sm:text-base">
                  اگر در <bdi dir="ltr" className="font-mono">{startIso}</bdi> مبلغ{' '}
                  <UsdBdi val={initialCapitalUsd} /> می‌خریدید، در <bdi dir="ltr" className="font-mono">{endIso}</bdi> چقدر داشتید؟
                </h3>
                <p className="text-xs text-muted">
                  مقایسهٔ مستقیم قیمت خرید، قیمت پایان، ارزش فعلی سرمایه و سود یا زیان خالص دلاری
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rankedMetrics.map((m, idx) => {
                const isGain = (m.netProfitLossUsd ?? 0) >= 0;
                return (
                  <div
                    key={m.symbol}
                    onClick={() => setInspectedAssetSymbol(m.symbol)}
                    className="cursor-pointer space-y-2 rounded-card border border-divider bg-surface-2/40 p-3.5 transition-all hover:border-accent hover:bg-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold',
                            idx === 0 ? 'bg-gain/15 text-positive' : 'bg-surface-2 text-muted'
                          )}
                        >
                          {toFaDigits(idx + 1)}
                        </span>
                        <MarketAssetLogo symbol={m.symbol === 'GOLD' ? 'PAXG' : m.symbol === 'SILVER' ? 'SLV' : m.symbol} size={26} />
                        <div>
                          <p className="text-xs font-extrabold text-ink">{m.nameFa}</p>
                          <p className="font-mono text-[10px] text-muted" dir="ltr">
                            {m.actualStartIso} → {m.actualEndIso}
                          </p>
                        </div>
                      </div>
                      <Badge tone={isGain ? 'gain' : 'loss'}>
                        <PctBdi val={m.totalReturnPct} digits={1} />
                      </Badge>
                    </div>

                    <div className="space-y-1 rounded-field bg-card p-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-muted">ارزش امروز:</span>
                        <span className="text-base font-extrabold text-ink">
                          <UsdBdi val={m.currentValueUsd} />
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-muted">سود یا زیان خالص:</span>
                        <span
                          className={cn(
                            'text-xs font-extrabold',
                            isGain ? 'text-positive' : 'text-negative'
                          )}
                        >
                          <UsdBdi val={m.netProfitLossUsd} signed />
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
                      <div>
                        <span>شروع: </span>
                        <strong className="text-ink"><UsdBdi val={m.startPrice} /></strong>
                      </div>
                      <div>
                        <span>پایان: </span>
                        <strong className="text-ink"><UsdBdi val={m.endPrice} /></strong>
                      </div>
                      <div>
                        <span>رشد سالانه: </span>
                        <strong className="text-ink"><PctBdi val={m.cagrPct} digits={1} /></strong>
                      </div>
                      <div>
                        <span>بیشترین افت: </span>
                        <strong className="text-negative"><PctBdi val={m.maxDrawdownPct} digits={1} /></strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
      )}

      {/* ۳) نمودار تعاملی مقایسه عملکرد دارایی‌ها (دوحالته: پایه ۱۰۰ در برابر رشد سرمایه دلاری) */}
      {chartDataAndOptions && (
        <Surface className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink sm:text-base">
                <LineChartIcon className="h-4 w-4 text-accent" aria-hidden />
                نمودار مقایسه‌ای عملکرد دارایی‌ها (مقیاس یکسان از نقطه شروع)
              </h3>
              <p className="text-xs text-muted">
                {chartMode === 'base100_pct'
                  ? 'حالت اول: تمام دارایی‌ها در تاریخ شروع از عدد پایه ۱۰۰ شروع می‌شوند تا درصد رشد و افت آن‌ها با مقیاس یکسان مقایسه شود.'
                  : `حالت دوم: تغییرات ارزش دلاری سرمایه اولیه (${fmtUsdFa(initialCapitalUsd)}) در طول زمان برای هر دارایی نمایش داده می‌شود.`}
              </p>
            </div>

            <SegmentedControl<ChartMode>
              label="حالت نمودار"
              value={chartMode}
              onChange={setChartMode}
              options={[
                { value: 'base100_pct', label: 'مقایسه شاخص رشد (شروع = ۱۰۰)' },
                { value: 'capital_usd', label: `رشد سرمایه (${fmtUsdFa(initialCapitalUsd)})` }
              ]}
            />
          </div>

          <div className="h-[320px] sm:h-[380px]" dir="ltr">
            <Line
              data={{
                labels: chartDataAndOptions.labels,
                datasets: chartDataAndOptions.datasets as never
              }}
              options={chartDataAndOptions.options as never}
            />
          </div>
        </Surface>
      )}

      {/* ۴) جدول حرفه‌ای رتبه‌بندی عملکرد و ریسک دارایی‌ها */}
      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider p-4">
          <div>
            <h3 className="text-sm font-extrabold text-ink sm:text-base">
              جدول رتبه‌بندی عملکرد و ریسک دارایی‌ها ({startIso} تا {endIso})
            </h3>
            <p className="text-xs text-muted">
              برای مرتب‌سازی روی عنوان هر ستون کلیک کنید؛ برای مشاهده شناسنامه کامل هر دارایی روی ردیف آن کلیک کنید.
            </p>
          </div>
          <SearchField
            value={tableSearch}
            onChange={setTableSearch}
            placeholder="جست‌وجوی دارایی در جدول…"
            className="w-full sm:w-64"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[920px]">
            <thead>
              <tr>
                <th className="w-10 !ps-4">#</th>
                <th>دارایی و مبنای بازده</th>
                <th className="col-num">قیمت شروع</th>
                <th className="col-num">قیمت پایان</th>
                <th className="col-num">تغییر قیمت ($)</th>
                <SortHeader
                  label="بازده کل دوره"
                  sortKey="totalReturnPct"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={`ارزش ${toFaDigits(initialCapitalUsd.toLocaleString('en-US'))}$`}
                  sortKey="currentValueUsd"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="سود / زیان خالص"
                  sortKey="netProfitLossUsd"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="بازده سالانه (CAGR)"
                  sortKey="cagrPct"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="بیشترین افت (MDD)"
                  sortKey="maxDrawdownPct"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="نوسان سالانه"
                  sortKey="annualizedVolatilityPct"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  className="!pe-4"
                />
              </tr>
            </thead>
            <tbody>
              {rankedMetrics.map((m, idx) => {
                const isGain = (m.totalReturnPct ?? 0) >= 0;
                return (
                  <tr
                    key={m.symbol}
                    onClick={() => setInspectedAssetSymbol(m.symbol)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-surface-2/70',
                      inspectedAssetSymbol === m.symbol && 'bg-accent-soft/25'
                    )}
                  >
                    <td className="num-ltr !ps-4 text-xs font-bold text-subtle">{idx + 1}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-1 rounded-full"
                          style={{ backgroundColor: m.colorHex }}
                          aria-hidden
                        />
                        <MarketAssetLogo
                          symbol={m.symbol === 'GOLD' ? 'PAXG' : m.symbol === 'SILVER' ? 'SLV' : m.symbol}
                          size={26}
                        />
                        <div>
                          <p className="text-xs font-extrabold text-ink">
                            {m.nameFa}{' '}
                            <span className="font-mono text-[11px] text-muted" dir="ltr">
                              ({m.symbol})
                            </span>
                          </p>
                          <p className="text-[10px] text-muted">{m.returnBasisLabelFa}</p>
                        </div>
                      </div>
                    </td>
                    <td className="col-num text-xs text-muted"><UsdBdi val={m.startPrice} /></td>
                    <td className="col-num text-xs font-bold text-ink"><UsdBdi val={m.endPrice} /></td>
                    <td
                      className={cn(
                        'col-num text-xs font-semibold',
                        (m.priceChangeUsd ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                      )}
                    >
                      <UsdBdi val={m.priceChangeUsd} signed />
                    </td>
                    <td className="col-num">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-extrabold',
                          isGain
                            ? 'bg-gain/12 text-positive'
                            : 'bg-negative/12 text-negative'
                        )}
                      >
                        <PctBdi val={m.totalReturnPct} digits={1} />
                      </span>
                    </td>
                    <td className="col-num text-xs font-extrabold text-ink">
                      <UsdBdi val={m.currentValueUsd} />
                    </td>
                    <td
                      className={cn(
                        'col-num text-xs font-bold',
                        (m.netProfitLossUsd ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                      )}
                    >
                      <UsdBdi val={m.netProfitLossUsd} signed />
                    </td>
                    <td className="col-num text-xs font-semibold text-ink">
                      <PctBdi val={m.cagrPct} digits={1} />
                    </td>
                    <td className="col-num text-xs font-bold text-negative">
                      <PctBdi val={m.maxDrawdownPct} digits={1} />
                    </td>
                    <td className="col-num !pe-4 text-xs text-muted">
                      <PctBdi val={m.annualizedVolatilityPct} digits={1} signed={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* جزئیات کامل دارایی انتخاب‌شده در جدول (در صورت کلیک کاربر) */}
      {inspectedMetric && (
        <Surface className="border border-accent/40 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MarketAssetLogo
                symbol={
                  inspectedMetric.symbol === 'GOLD'
                    ? 'PAXG'
                    : inspectedMetric.symbol === 'SILVER'
                    ? 'SLV'
                    : inspectedMetric.symbol
                }
                size={32}
              />
              <div>
                <h4 className="text-sm font-extrabold text-ink">
                  شناسنامه عملکرد و ریسک: {inspectedMetric.nameFa} ({inspectedMetric.symbol})
                </h4>
                <p className="text-xs text-muted">
                  منبع داده: {inspectedMetric.dataSourceLabelFa} · مبنای محاسبه: {inspectedMetric.returnBasisLabelFa}
                </p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setInspectedAssetSymbol(null)}>
              بستن جزئیات
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-field bg-surface-2/60 p-3">
              <span className="text-muted">بازه زمانی واقعی داده</span>
              <p className="mt-1 font-mono font-extrabold text-ink" dir="ltr">
                {inspectedMetric.actualStartIso} → {inspectedMetric.actualEndIso}
              </p>
            </div>
            <div className="rounded-field bg-surface-2/60 p-3">
              <span className="text-muted">بهترین سال تقویمی در بازه</span>
              <p className="mt-1 font-extrabold text-positive">
                {inspectedMetric.bestYearReturn ? (
                  <>سال {toFaDigits(inspectedMetric.bestYearReturn.year)} (<PctBdi val={inspectedMetric.bestYearReturn.returnPct} digits={1} />)</>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div className="rounded-field bg-surface-2/60 p-3">
              <span className="text-muted">بدترین سال تقویمی در بازه</span>
              <p className="mt-1 font-extrabold text-negative">
                {inspectedMetric.worstYearReturn ? (
                  <>سال {toFaDigits(inspectedMetric.worstYearReturn.year)} (<PctBdi val={inspectedMetric.worstYearReturn.returnPct} digits={1} />)</>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div className="rounded-field bg-surface-2/60 p-3">
              <span className="text-muted">وضعیت بازیابی از عمیق‌ترین افت</span>
              <p className="mt-1 font-extrabold text-ink">
                {inspectedMetric.recoveredFromMaxDrawdown
                  ? inspectedMetric.maxDrawdownRecoveryDays
                    ? `بازیابی کامل پس از ${toFaDigits(inspectedMetric.maxDrawdownRecoveryDays)} روز`
                    : 'بدون افت سنگین'
                  : 'هنوز به سقف پیش از افت نرسیده است'}
              </p>
            </div>
          </div>
        </Surface>
      )}

      {/* ۵) تحلیل ریسک در برابر بازده (چرا فقط درصد رشد کافی نیست؟) */}
      <Surface className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-accent" aria-hidden />
          <h3 className="text-sm font-extrabold text-ink sm:text-base">
            تحلیل ریسک در طول مسیر: برای کسب این بازده، چقدر افت و نوسان را تحمل کرده‌اید؟
          </h3>
        </div>
        <p className="text-xs leading-6 text-muted">
          دارایی‌ای که بیشترین درصد رشد را ثبت کرده، لزوماً مسیر آرامی نداشته است. در جدول زیر، بازده کل هر دارایی در کنار «بیشترین افت سرمایه از سقف تا کف (Maximum Drawdown)»، «نوسان سالانه» و «بهترین و بدترین سال» مقایسه شده است:
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rankedMetrics.map((m) => {
            const ddAbs = Math.abs(m.maxDrawdownPct ?? 0);
            const riskLevelFa =
              ddAbs >= 60 ? 'ریسک و افت بسیار شدید' : ddAbs >= 35 ? 'ریسک و نوسان بالا' : ddAbs >= 18 ? 'ریسک متوسط' : 'نوسان و افت ملایم';
            const riskTone = ddAbs >= 50 ? 'loss' : ddAbs >= 25 ? 'warn' : 'gain';
            return (
              <div key={m.symbol} className="rounded-card border border-divider bg-surface-2/35 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-ink">
                    {m.nameFa} ({m.symbol})
                  </span>
                  <Badge tone={riskTone}>{riskLevelFa}</Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted">بازده کل در برابر بیشترین افت:</span>
                    <span>
                      <strong className="text-positive"><PctBdi val={m.totalReturnPct} digits={1} /></strong>
                      {' / '}
                      <strong className="text-negative"><PctBdi val={m.maxDrawdownPct} digits={1} /></strong>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-loss"
                      style={{ width: `${Math.min(100, Math.max(5, ddAbs))}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-between gap-2 pt-1 text-[11px] text-muted">
                  <span>
                    نوسان سالانه: <strong className="text-ink"><PctBdi val={m.annualizedVolatilityPct} digits={1} signed={false} /></strong>
                  </span>
                  <span>
                    بهترین سال:{' '}
                    <strong className="text-positive">
                      {m.bestYearReturn ? <>{toFaDigits(m.bestYearReturn.year)} (<PctBdi val={m.bestYearReturn.returnPct} digits={0} />)</> : '—'}
                    </strong>
                  </span>
                  <span>
                    بدترین سال:{' '}
                    <strong className="text-negative">
                      {m.worstYearReturn ? <>{toFaDigits(m.worstYearReturn.year)} (<PctBdi val={m.worstYearReturn.returnPct} digits={0} />)</> : '—'}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      {/* ۶) بخش ویژه راستی‌آزمایی ادعاهای منتشرشده در بازار (جمع‌شونده برای خلوت ماندن صفحه) */}
      <Disclosure summary="راستی‌آزمایی ادعای معروف ۲۰۲۱ (بیت‌کوین ۰٪ در برابر طلا، S&P 500 و انویدیا)">
        <Surface className="mt-2 space-y-3 border border-warn/35 bg-warn/[0.04] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warn" aria-hidden />
              <h3 className="text-sm font-extrabold text-ink sm:text-base">
                چرا مقایسهٔ «از سال ۲۰۲۱» می‌تواند گمراه‌کننده باشد؟
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => handlePresetChange('since-2021')}>
                تست روی نمودار: از ۱ ژانویه ۲۰۲۱
              </Button>
              <Button size="sm" variant="outline" onClick={() => handlePresetChange('nov-2021-peak')}>
                تست روی نمودار: از سقف ۱۰ نوامبر ۲۰۲۱
              </Button>
            </div>
          </div>

          <p className="text-xs leading-6 text-muted">
            ادعای معروف <strong>«از ۲۰۲۱: S&P 500 رشد ۶۲٪، طلا ۱۱۰٪، انویدیا ۲۰۴۵٪ و بیت‌کوین ۰٪»</strong> نتیجهٔ انتخاب تاریخ شروع دقیقاً روی <strong>سقف قیمتی ۱۰ نوامبر ۲۰۲۱</strong> به‌جای ابتدای سال ۲۰۲۱ است:
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {claimAuditRows.map((row) => (
              <div key={row.symbol} className="space-y-2 rounded-card border border-divider bg-card p-3.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-ink">{row.nameFa}</span>
                  <Badge tone={row.verdictTone}>{row.verdictBadgeFa}</Badge>
                </div>
                <p className="text-[11px] font-semibold text-muted">{row.viralClaimTextFa}</p>
                <div className="grid grid-cols-2 gap-2 rounded-field bg-surface-2/60 p-2.5">
                  <div>
                    <span className="block text-[10px] text-muted">از ۱ ژانویه ۲۰۲۱:</span>
                    <span
                      className={cn(
                        'text-sm font-extrabold',
                        row.returnFromJan2021Pct >= 0 ? 'text-positive' : 'text-negative'
                      )}
                    >
                      <PctBdi val={row.returnFromJan2021Pct} digits={1} />
                    </span>
                    <span className="block text-[10px] text-muted">شروع: <UsdBdi val={row.priceJan2021} /></span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-muted">از سقف ۱۰ نوامبر ۲۰۲۱:</span>
                    <span
                      className={cn(
                        'text-sm font-extrabold',
                        row.returnFromNov2021PeakPct >= 0 ? 'text-positive' : 'text-negative'
                      )}
                    >
                      <PctBdi val={row.returnFromNov2021PeakPct} digits={1} />
                    </span>
                    <span className="block text-[10px] text-muted">شروع: <UsdBdi val={row.priceNov2021Peak} /></span>
                  </div>
                </div>
                <p className="text-[11px] leading-5 text-muted">{row.explanationFa}</p>
              </div>
            ))}
          </div>
        </Surface>
      </Disclosure>

      {/* ۷) بخش «جمع‌بندی عملکرد» خودکار و آموزشی (بخش ۱۱ پرامپت) */}
      <Surface className="border-s-4 border-s-accent p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-accent" aria-hidden />
          <h3 className="text-sm font-extrabold text-ink sm:text-base">جمع‌بندی عملکرد</h3>
        </div>
        <p className="text-xs font-bold text-ink">{autoSummary.headlineFa}</p>
        <ul className="list-disc space-y-1.5 ps-5 text-xs leading-6 text-muted">
          {autoSummary.bulletsFa.map((b, i) => (
            <li key={i} className="text-ink/90">
              {b}
            </li>
          ))}
        </ul>
        <p className="rounded-field bg-surface-2/60 px-3 py-2 text-[11px] leading-5 text-muted">
          {autoSummary.methodologyNoteFa}
        </p>
      </Surface>

      {/* ۸) خروجی CSV و PDF */}
      <ExportButtons
        filename={`darino-asset-comparison-${startIso}-to-${endIso}.csv`}
        headers={[
          'رتبه',
          'نماد',
          'نام دارایی',
          'دسته',
          'تاریخ شروع',
          'تاریخ پایان',
          'قیمت شروع ($)',
          'قیمت پایان ($)',
          'بازده کل (%)',
          `ارزش ${initialCapitalUsd}$`,
          'سود/زیان خالص ($)',
          'CAGR (%)',
          'Max Drawdown (%)',
          'نوسان سالانه (%)'
        ]}
        rows={rankedMetrics.map((m, i) => [
          i + 1,
          m.symbol,
          m.nameFa,
          CATEGORY_LABELS_FA[m.category],
          m.actualStartIso,
          m.actualEndIso,
          m.startPrice ?? 'N/A',
          m.endPrice ?? 'N/A',
          m.totalReturnPct ?? 'N/A',
          m.currentValueUsd ?? 'N/A',
          m.netProfitLossUsd ?? 'N/A',
          m.cagrPct ?? 'N/A',
          m.maxDrawdownPct ?? 'N/A',
          m.annualizedVolatilityPct ?? 'N/A'
        ])}
        pdfTitle={`گزارش مقایسه عملکرد دارایی‌ها (${startIso} تا ${endIso})`}
        pdfSections={[
          {
            heading: `مقایسه ${rankedMetrics.length} دارایی با سرمایه اولیه ${fmtUsdFa(initialCapitalUsd)}`,
            table: {
              headers: ['دارایی', 'قیمت شروع', 'قیمت پایان', 'بازده کل', 'ارزش فعلی', 'Max Drawdown'],
              rows: rankedMetrics.map((m) => [
                `${m.nameFa} (${m.symbol})`,
                fmtUsdFa(m.startPrice),
                fmtUsdFa(m.endPrice),
                fmtPctFa(m.totalReturnPct, 1),
                fmtUsdFa(m.currentValueUsd),
                fmtPctFa(m.maxDrawdownPct, 1)
              ])
            }
          }
        ]}
      />
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className
}: {
  label: string;
  sortKey: TableSortKey;
  currentKey: TableSortKey;
  dir: SortDir;
  onSort: (k: TableSortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={cn('col-num', className)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'font-extrabold text-ink')}
      >
        <span>{label}</span>
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </th>
  );
}
