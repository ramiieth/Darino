/**
 * تحلیل هوشمند عملکرد سرمایه — طراحی مدرن و کامل
 *
 *   ۱. تمرکز بر دارایی‌های موجود فعلی در کیف پول، جزئیات بهای تمام‌شده (FIFO داشبورد)، میانگین خرید و سود/زیان باز
 *      (بدون نمایش چرخه‌های خرید و فروش گذشته یا رمزارزهای فروخته‌شده)
 *   ۲. کاتالوگ کامل و دقیق قیمت‌های مستند ۱۱ دی ۱۴۰۳ (۳۱ دسامبر ۲۰۲۴):
 *      • مسکن اهواز: کیانپارس (۶۰ تا ۶۵ میلیون)، پادادشهر (۴۵ میلیون)، گلستان (۴۵ میلیون)، کیان‌آباد (۴۵ میلیون)، شهرک دانشگاه (۳۰ تا ۳۲ میلیون)
 *      • تمامی خودروهای بازار آزاد (صرفاً قیمت بازار آزاد؛ قیمت کارخانه به طور کامل حذف شده است):
 *        تارا (V1، V2، V4)، پژو ۲۰۷ (TU3، دنده‌ای هیدرولیک، دنده‌ای پانوراما، اتوماتیک سقف فلزی، اتوماتیک پانوراما)،
 *        ری‌را، هایما (S5، S7، 8S، 7X)، دنا پلاس (۵ دنده، ۶ سرعته، توربو اتوماتیک)، سورن پلاس (XU7P، بنزینی فول، دوگانه‌سوز)،
 *        شاهین (GL، G، اتوماتیک CVT، پلاس)، اطلس G، سهند S، ساینا (S بنزینی، دوگانه‌سوز)، کوییک (S/GX، GXR، اتوماتیک)،
 *        چانگان (CS35 تیپ ۲ و ۳، CS55 پلاس)، هیوندای النترا و ام‌جی ۵ (MG5)
 *   ۳. استخراج زندهٔ قیمت‌های فعلی تمامی خودروها و مسکن اهواز از استورهای اپ دارینو + پشتیبانی از سایر بازارهای جهانی (سهام آمریکا، نفت، طلا، شاخص‌ها و رمزارزها)
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Car,
  Check,
  Coins,
  Copy,
  FileText,
  Flame,
  Globe,
  Layers,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { fetchJson } from '@/repositories/remoteClient';
import { AssistantResponse } from '@/features/connected/presentation/AssistantResponse';
import { useCarMarketStore } from '@/features/carMarket/data/store';
import { usePropertyMarketStore } from '@/features/propertyMarket/data/store';
import { fmtCompactFa, fmtDateTime, faNumber, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { toast } from '@/shared/store/toastStore';
import { cn } from '@/shared/lib/cn';
import type { SavedReport, ValueRecord } from '../domain/types';
import type { PeriodAnalysis } from '../domain/analysis';
import type { MarketSeries } from '../data/useMarketSeries';
import type { WalletAndCostBridge } from '../data/useWalletAndCostBridge';
import {
  AHVAZ_PROPERTY_BENCHMARKS,
  HISTORICAL_CAR_BENCHMARKS,
  extractAdditionalLiveCarsFromStore,
  resolveLiveAhvazPropertyPrice,
  resolveLiveCarMarketPrice
} from '../domain/historicalIranBenchmarks';
import { deleteReport, newId, saveReport } from '../data/store';
import { PeriodPicker } from './PeriodPicker';
import { Pct, Toman, Usd } from './parts';

export interface SimulatorItem {
  id: string;
  name: string;
  subLabel?: string;
  category: 'car' | 'property' | 'us_stock' | 'commodity' | 'gold_fx' | 'crypto';
  categoryLabel: string;
  unitLabel: string;
  currency: 'toman' | 'usd';
  priceStart: number;
  priceStartRangeNote?: string;
  priceEnd: number;
  unitsCount: number;
  startCostToman: number;
  startCostUsd: number;
  endValueToman: number;
  endValueUsd: number;
  pnlToman: number;
  pnlUsd: number;
  returnPct: number;
  vsPortfolioToman: number;
  vsPortfolioUsd: number;
  source?: string;
  isLiveFromApp?: boolean;
}

const CATEGORY_NAMES = {
  all: 'همهٔ بازارها',
  property: 'مسکن اهواز (۵ محله)',
  car: 'خودرو (بازار آزاد)',
  us_stock: 'سهام آمریکا و شاخص‌ها',
  commodity: 'نفت و طلای جهانی',
  gold_fx: 'طلا، سکه و دلار ایران',
  crypto: 'رمزارزها'
} as const;

/** تشخیص دسته‌بندی برای ردیف‌های عمومی بازار */
function categorizeMarket(id: string, name: string): { category: SimulatorItem['category']; categoryLabel: string; unitLabel: string } {
  if (/^car[:_]/.test(id) || id === 'car') return { category: 'car', categoryLabel: 'خودرو (بازار آزاد)', unitLabel: 'دستگاه' };
  if (/^prop[:_]/.test(id) || id === 'property') return { category: 'property', categoryLabel: 'مسکن اهواز', unitLabel: 'مترمربع' };
  if (/^(nvda|aapl|tsla)$/i.test(id) || /سهام/.test(name)) return { category: 'us_stock', categoryLabel: 'سهام آمریکا', unitLabel: 'سهم' };
  if (/^(spx|ndx|dow_jones|msci_world)$/i.test(id) || /شاخص/.test(name)) return { category: 'us_stock', categoryLabel: 'شاخص جهانی', unitLabel: 'واحد شاخص' };
  if (/^oil_/i.test(id) || /نفت/.test(name)) return { category: 'commodity', categoryLabel: 'نفت و انرژی', unitLabel: 'بشکه' };
  if (id === 'gold_global' || /انس/.test(name)) return { category: 'commodity', categoryLabel: 'طلای جهانی', unitLabel: 'اونس' };
  if (/^(ir_gold18|ir_sekee|ir_usd)$/.test(id) || /سکه|طلا|دلار/.test(name)) {
    return {
      category: 'gold_fx',
      categoryLabel: 'طلا و ارز ایران',
      unitLabel: id === 'ir_sekee' ? 'سکه' : id === 'ir_gold18' ? 'گرم' : 'دلار'
    };
  }
  return { category: 'crypto', categoryLabel: 'رمزارز', unitLabel: 'واحد' };
}

export function ReportTab({
  records,
  startId,
  endId,
  onPeriod,
  analysis,
  market,
  walletBridge,
  reports,
  buildPayload,
  sources,
  ready
}: {
  records: ValueRecord[];
  startId: string;
  endId: string;
  onPeriod: (s: string, e: string) => void;
  analysis?: PeriodAnalysis | null;
  market?: MarketSeries;
  walletBridge?: WalletAndCostBridge;
  reports: SavedReport[];
  buildPayload: () => Record<string, unknown> | null;
  sources: string[];
  ready: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(reports[0]?.id ?? null);
  const [copied, setCopied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof CATEGORY_NAMES>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLens, setActiveLens] = useState<'both' | 'holdings' | 'buyhold'>('both');

  // اتصال مستقیم به استورهای بازار خودرو و املاک اهواز در اپ دارینو برای استخراج قیمت‌های روز
  const carSnapshots = useCarMarketStore((s) => s.snapshots);
  const propSnapshots = usePropertyMarketStore((s) => s.snapshots);
  const propListings = usePropertyMarketStore((s) => s.listings);

  useEffect(() => {
    void useCarMarketStore.getState().hydrate();
    void usePropertyMarketStore.getState().hydrate();
  }, []);

  const current = reports.find((r) => r.id === openId) ?? reports[0] ?? null;

  const rateStart = analysis?.start.rateToman ?? 80_000;
  const rateEnd = analysis?.end.rateToman ?? 120_000;

  // ساخت فهرست کامل و یکپارچهٔ تمام بازارها (مسکن اهواز، تمامی خودروهای بازار آزاد، سهام آمریکا، نفت، طلا و رمزارزها)
  const simulatorItems = useMemo((): SimulatorItem[] => {
    if (!analysis) return [];
    const startToman = analysis.portfolio.startToman ?? analysis.portfolio.startUsd * rateStart;
    const startUsd = analysis.portfolio.startUsd;
    const endToman = analysis.portfolio.endToman ?? analysis.portfolio.endUsd * rateEnd;
    const endUsd = analysis.portfolio.endUsd;
    const portPnlToman = endToman - startToman;
    const portPnlUsd = endUsd - startUsd;

    const items: SimulatorItem[] = [];
    const matchedCarNames = new Set<string>();

    // ۱. پنج محلهٔ مسکن اهواز با قیمت دقیق ۱۱ دی ۱۴۰۳ و استخراج قیمت روز از اپ دارینو
    for (const nh of AHVAZ_PROPERTY_BENCHMARKS) {
      const liveProp = resolveLiveAhvazPropertyPrice(nh.key, propSnapshots, propListings, nh.fallbackCurrentPpm);
      const pStart = nh.priceDec1403;
      const pEnd = liveProp.price;
      const count = startToman > 0 ? startToman / pStart : 0;
      const valEndToman = count * pEnd;
      const valEndUsd = rateEnd > 0 ? valEndToman / rateEnd : 0;
      const pnlT = valEndToman - startToman;
      const pnlU = valEndUsd - startUsd;

      items.push({
        id: `prop:${nh.key}`,
        name: nh.name,
        subLabel: `۱۱ دی ۱۴۰۳: ${nh.rangeNoteDec1403}`,
        category: 'property',
        categoryLabel: 'مسکن اهواز',
        unitLabel: 'مترمربع',
        currency: 'toman',
        priceStart: pStart,
        priceStartRangeNote: nh.rangeNoteDec1403,
        priceEnd: pEnd,
        unitsCount: count,
        startCostToman: startToman,
        startCostUsd: startUsd,
        endValueToman: valEndToman,
        endValueUsd: valEndUsd,
        pnlToman: pnlT,
        pnlUsd: pnlU,
        returnPct: pStart > 0 ? pEnd / pStart - 1 : 0,
        vsPortfolioToman: pnlT - portPnlToman,
        vsPortfolioUsd: pnlU - portPnlUsd,
        source: liveProp.source,
        isLiveFromApp: liveProp.isLive
      });
    }

    // ۲. تمامی خودروهای بازار آزاد در ۱۱ دی ۱۴۰۳ (بدون قیمت کارخانه) + قیمت روز از استور بازار خودروی دارینو
    for (const car of HISTORICAL_CAR_BENCHMARKS) {
      const liveCar = resolveLiveCarMarketPrice(car, carSnapshots);
      const pStart = car.marketPriceDec1403;
      const pEnd = liveCar.price;
      const count = startToman > 0 ? startToman / pStart : 0;
      const valEndToman = count * pEnd;
      const valEndUsd = rateEnd > 0 ? valEndToman / rateEnd : 0;
      const pnlT = valEndToman - startToman;
      const pnlU = valEndUsd - startUsd;

      items.push({
        id: car.id,
        name: car.name,
        subLabel: `${car.brandFa} · ۱۱ دی ۱۴۰۳: ${car.rangeNoteDec1403}`,
        category: 'car',
        categoryLabel: `خودرو (${car.brandFa})`,
        unitLabel: 'دستگاه',
        currency: 'toman',
        priceStart: pStart,
        priceStartRangeNote: car.rangeNoteDec1403,
        priceEnd: pEnd,
        unitsCount: count,
        startCostToman: startToman,
        startCostUsd: startUsd,
        endValueToman: valEndToman,
        endValueUsd: valEndUsd,
        pnlToman: pnlT,
        pnlUsd: pnlU,
        returnPct: pStart > 0 ? pEnd / pStart - 1 : 0,
        vsPortfolioToman: pnlT - portPnlToman,
        vsPortfolioUsd: pnlU - portPnlUsd,
        source: liveCar.source,
        isLiveFromApp: liveCar.isLive
      });
      matchedCarNames.add(car.name.replace(/^خودرو\s*—\s*/, '').trim());
    }

    // ۳. استخراج سایر خودروهای موجود در استور بازار خودروی اپ دارینو (که در جدول بالا نبودند)
    const extraLiveCars = extractAdditionalLiveCarsFromStore(carSnapshots, analysis.start.dateTs, matchedCarNames);
    for (const ex of extraLiveCars) {
      const count = startToman > 0 ? startToman / ex.priceStart : 0;
      const valEndToman = count * ex.priceEnd;
      const valEndUsd = rateEnd > 0 ? valEndToman / rateEnd : 0;
      const pnlT = valEndToman - startToman;
      const pnlU = valEndUsd - startUsd;

      items.push({
        id: ex.id,
        name: ex.name,
        subLabel: `${ex.brandFa} · مدل ${toFaDigits(ex.year)} (بازار آزاد)`,
        category: 'car',
        categoryLabel: `خودرو (${ex.brandFa})`,
        unitLabel: 'دستگاه',
        currency: 'toman',
        priceStart: ex.priceStart,
        priceEnd: ex.priceEnd,
        unitsCount: count,
        startCostToman: startToman,
        startCostUsd: startUsd,
        endValueToman: valEndToman,
        endValueUsd: valEndUsd,
        pnlToman: pnlT,
        pnlUsd: pnlU,
        returnPct: ex.priceStart > 0 ? ex.priceEnd / ex.priceStart - 1 : 0,
        vsPortfolioToman: pnlT - portPnlToman,
        vsPortfolioUsd: pnlU - portPnlUsd,
        source: ex.source,
        isLiveFromApp: true
      });
    }

    // ۴. بازارهای جهانی، طلا، سکه، دلار، سهام آمریکا، نفت و کریپتو از موتور تحلیل
    for (const r of analysis.rows) {
      if (r.kind === 'inflation' || /^prop[:_]/.test(r.id) || /^car[:_]/.test(r.id)) continue;
      const cat = categorizeMarket(r.id, r.name);
      const pStart = r.priceStart?.value;
      const pEnd = r.priceEnd?.value;

      if (r.status === 'ok' && pStart && pEnd && pStart > 0) {
        const isUsd = r.currency === 'usd';
        const cap = isUsd ? startUsd : startToman;
        const count = cap / pStart;
        const valEndToman = isUsd ? count * pEnd * rateEnd : count * pEnd;
        const valEndUsd = isUsd ? count * pEnd : rateEnd > 0 ? (count * pEnd) / rateEnd : 0;
        const pnlT = valEndToman - startToman;
        const pnlU = valEndUsd - startUsd;

        items.push({
          id: r.id,
          name: r.name,
          subLabel: r.detail,
          category: cat.category,
          categoryLabel: cat.categoryLabel,
          unitLabel: r.units?.label ?? cat.unitLabel,
          currency: r.currency,
          priceStart: pStart,
          priceEnd: pEnd,
          unitsCount: count,
          startCostToman: startToman,
          startCostUsd: startUsd,
          endValueToman: valEndToman,
          endValueUsd: valEndUsd,
          pnlToman: pnlT,
          pnlUsd: pnlU,
          returnPct: pEnd / pStart - 1,
          vsPortfolioToman: pnlT - portPnlToman,
          vsPortfolioUsd: pnlU - portPnlUsd,
          source: r.source,
          isLiveFromApp: true
        });
      }
    }

    return items;
  }, [analysis, rateStart, rateEnd, propSnapshots, propListings, carSnapshots]);

  // شبیه‌ساز تعاملی «تعداد دلخواه واحد» (مثلاً ۳ یا ۴ دستگاه خودرو یا ۱۰۰ متر ملک)
  const [activeSimId, setActiveSimId] = useState<string>('car:tara-v1-manual');
  const activeSimItem = simulatorItems.find((i) => i.id === activeSimId) ?? simulatorItems[0];
  const [customUnits, setCustomUnits] = useState<number>(3);

  const customSimResult = useMemo(() => {
    if (!activeSimItem) return null;
    const count = Number.isFinite(customUnits) && customUnits > 0 ? customUnits : 1;
    const isUsd = activeSimItem.currency === 'usd';
    const unitPriceStart = activeSimItem.priceStart;
    const unitPriceEnd = activeSimItem.priceEnd;

    const startCostToman = isUsd ? count * unitPriceStart * rateStart : count * unitPriceStart;
    const startCostUsd = isUsd ? count * unitPriceStart : rateStart > 0 ? (count * unitPriceStart) / rateStart : 0;

    const endValueToman = isUsd ? count * unitPriceEnd * rateEnd : count * unitPriceEnd;
    const endValueUsd = isUsd ? count * unitPriceEnd : rateEnd > 0 ? (count * unitPriceEnd) / rateEnd : 0;

    const pnlToman = endValueToman - startCostToman;
    const pnlUsd = endValueUsd - startCostUsd;
    const returnPct = unitPriceStart > 0 ? unitPriceEnd / unitPriceStart - 1 : 0;

    const portReturnToman = analysis?.portfolio.returnToman ?? 0;
    const portEquivalentProfitToman = startCostToman * portReturnToman;
    const vsPortfolioToman = pnlToman - portEquivalentProfitToman;

    return {
      count,
      unitPriceStart,
      unitPriceEnd,
      startCostToman,
      startCostUsd,
      endValueToman,
      endValueUsd,
      pnlToman,
      pnlUsd,
      returnPct,
      vsPortfolioToman
    };
  }, [activeSimItem, customUnits, rateStart, rateEnd, analysis]);

  async function generate() {
    const basePayload = buildPayload();
    if (!basePayload) return;
    setBusy(true);
    setError(null);
    try {
      // غنی‌سازی پیلود ارسالی با کاتالوگ کامل قیمت‌های ۱۱ دی ۱۴۰۳ و قیمت‌های روز استخراج‌شده از اپ دارینو
      const enrichedPayload = {
        ...basePayload,
        iranRealAssetsBenchmarks: simulatorItems
          .filter((i) => i.category === 'property' || i.category === 'car')
          .map((i) => ({
            id: i.id,
            name: i.name,
            category: i.categoryLabel,
            unit: i.unitLabel,
            priceDec1403Toman: Math.round(i.priceStart),
            priceCurrentAppToman: Math.round(i.priceEnd),
            returnTomanPct: Math.round(i.returnPct * 10000) / 100,
            unitsBuyableWithStartCapital: Math.round(i.unitsCount * 100) / 100,
            sellValueTodayToman: Math.round(i.endValueToman),
            profitToman: Math.round(i.pnlToman),
            vsUserPortfolioToman: Math.round(i.vsPortfolioToman),
            source: i.source
          }))
      };

      const r = await fetchJson<{ answer: string; generatedAt?: number }>('/api/integrations?op=analyze-performance', {
        method: 'POST',
        body: { analysis: enrichedPayload },
        timeoutMs: 120_000
      });
      const period = basePayload.period as { start: string; end: string };
      const rep: SavedReport = {
        id: newId(),
        createdAt: r.generatedAt ?? Date.now(),
        periodStart: Date.parse(period.start),
        periodEnd: Date.parse(period.end),
        text: r.answer.slice(0, 45_000),
        sources,
        model: 'smart-analysis'
      };
      await saveReport(rep);
      setOpenId(rep.id);
      toast('success', 'تحلیل هوشمند جامع با موفقیت تهیه شد');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دستیار تحلیل در زمان مجاز پاسخ نداد؛ دوباره تلاش کنید');
    } finally {
      setBusy(false);
    }
  }

  const copyReportText = async () => {
    if (!current?.text) return;
    try {
      await navigator.clipboard.writeText(current.text);
      setCopied(true);
      toast('success', 'متن کامل تحلیل هوشمند در کلیپ‌بورد کپی شد');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast('error', 'کپی متن انجام نشد');
    }
  };

  if (records.length < 2) {
    return <Notice tone="info">برای گزارش و تحلیل هوشمند حداقل دو سابقهٔ ارزش در بازه‌های مختلف لازم است.</Notice>;
  }

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return simulatorItems.filter((i) => {
      if (selectedCategory !== 'all' && i.category !== selectedCategory) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.subLabel ?? '').toLowerCase().includes(q) || i.categoryLabel.toLowerCase().includes(q);
    });
  }, [simulatorItems, selectedCategory, searchQuery]);

  const cb = walletBridge?.costBasis;

  return (
    <div className="space-y-6">
      {/* ─── هدر اصلی تحلیل هوشمند ─── */}
      <Surface variant="focal" className="relative overflow-hidden p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-xs">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-ink">تحلیل هوشمند عملکرد و مقایسه سرمایه</h2>
                  <Badge tone="brand">موتور تحلیلی دارینو</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  بررسی تخصصی دارایی‌های فعلی کیف پول و بهای تمام‌شده در کنار مقایسهٔ کامل با املاک ۵ محلهٔ اهواز، تمامی خودروهای بازار آزاد، سهام آمریکا، نفت و طلا
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={<Sparkles className="h-4 w-4" />}
              loading={busy}
              disabled={!ready}
              onClick={() => void generate()}
              className="font-bold shadow-sm"
            >
              {reports.length ? 'به‌روزرسانی تحلیل هوشمند' : 'تهیهٔ تحلیل هوشمند'}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-4">
          <div className="flex-1 min-w-[260px]">
            <PeriodPicker records={records} startId={startId} endId={endId} onChange={onPeriod} />
          </div>

          {/* انتخاب‌گر نمای نمایش */}
          <div className="flex items-center gap-1 rounded-control bg-surface-2 p-1 text-xs">
            {[
              { id: 'both' as const, label: 'نمای جامع (هر دو بخش)' },
              { id: 'holdings' as const, label: 'دارایی‌های موجود و بهای تمام‌شده' },
              { id: 'buyhold' as const, label: 'مقایسه خودرو، ملک اهواز و بازارها' }
            ].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setActiveLens(l.id)}
                className={cn(
                  'rounded-control px-3 py-1.5 font-bold transition-all',
                  activeLens === l.id ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {!ready && (
          <p className="mt-2 text-2xs text-subtle animate-pulse">در حال دریافت و همگام‌سازی آخرین قیمت‌های بازار از اپ دارینو…</p>
        )}
        {error && <Notice tone="warn" className="mt-4">{error}</Notice>}
      </Surface>

      {/* ─── بخش اول: دارایی‌های موجود فعلی در کیف پول، جزئیات بهای تمام‌شده، میانگین خرید و سود/زیان باز ─── */}
      {(activeLens === 'both' || activeLens === 'holdings') && walletBridge && cb && (
        <Surface className="space-y-5 p-5 md:p-6 border border-divider">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gain/15 text-positive">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-ink">دارایی‌های موجود در کیف پول، میانگین خرید و سود و زیان</h3>
                  <Badge tone="gain">{toFaDigits(cb.rows.length)} دارایی فعال</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  تمرکز صرف بر موجودی فعلی کیف پول‌ها و حساب‌های متصل، بهای تمام‌شدهٔ ثبت‌شده در داشبورد، میانگین قیمت خرید و سود/زیان باز هر دارایی
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Link to="/cost-basis" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                ویرایش بهای خرید <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <Link to="/dashboard" className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink">
                داشبورد <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* خلاصه شاخص‌های بهای تمام‌شده دارایی‌های موجود */}
          <MetricGrid cols={4}>
            <Metric
              size="sm"
              label="بهای تمام‌شدهٔ دارایی‌های موجود"
              value={<Usd v={cb.totalBasisUsd} />}
              sub={`${toFaDigits(cb.coveredAssetsCount)} دارایی دارای بهای خرید مشخص`}
            />
            <Metric
              size="sm"
              label="ارزش روز دارایی‌های دارای بها"
              value={<Usd v={cb.totalCurrentValueUsd} />}
              sub={walletBridge.totalLiveUsd !== null ? `کل کیف پول‌ها: ${faNumber(Math.round(walletBridge.totalLiveUsd))} دلار` : undefined}
            />
            <Metric
              size="sm"
              label="سود / زیان باز موجودی فعلی"
              value={<Usd v={cb.totalUnrealizedPnlUsd} signed />}
              sub={cb.totalUnrealizedPnlPct !== null ? <Pct v={cb.totalUnrealizedPnlPct / 100} /> : 'نسبت به میانگین خرید'}
            />
            <Metric
              size="sm"
              label="حساب‌های پرپچوال فعال"
              value={cb.perpEquityUsd !== null ? <Usd v={cb.perpEquityUsd} /> : '—'}
              sub={cb.perpAllTimePnlUsd !== null ? `سود/زیان کل پرپ: ${faNumber(Math.round(cb.perpAllTimePnlUsd))} دلار` : 'بدون پوزیشن'}
            />
          </MetricGrid>

          {/* جدول تمیز دارایی‌های موجود فعلی در کیف پول */}
          {cb.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-divider">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-subtle">
                  <tr>
                    <th className="p-3.5 text-start font-semibold">دارایی موجود</th>
                    <th className="p-3.5 text-start font-semibold">موجودی فعلی</th>
                    <th className="p-3.5 text-start font-semibold">میانگین قیمت خرید</th>
                    <th className="p-3.5 text-start font-semibold">قیمت لحظه‌ای</th>
                    <th className="p-3.5 text-start font-semibold">بهای تمام‌شده کل</th>
                    <th className="p-3.5 text-start font-semibold">ارزش روز (دلار)</th>
                    <th className="p-3.5 text-start font-semibold">سود / زیان باز</th>
                    <th className="p-3.5 text-end font-semibold">سهم از سبد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {cb.rows.map((r, idx) => (
                    <tr key={`${r.symbol}-${idx}`} className="transition-colors hover:bg-surface-2/50">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <TokenLogo logo={r.icon} symbol={r.symbol} name={r.nameFa} size={30} />
                          <div>
                            <p className="font-bold text-ink">{r.nameFa}</p>
                            <span className="text-2xs text-muted">{r.sourceLabel}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 font-medium">
                        {faNumber(r.currentQuantity, { maximumFractionDigits: 4 })} <span className="text-2xs text-muted">{r.symbol}</span>
                      </td>
                      <td className="p-3.5 font-medium">
                        {r.avgCostUsd !== null ? <Usd v={r.avgCostUsd} /> : <span className="text-subtle">—</span>}
                      </td>
                      <td className="p-3.5 font-medium">
                        {r.currentPriceUsd !== null ? <Usd v={r.currentPriceUsd} /> : <span className="text-subtle">—</span>}
                      </td>
                      <td className="p-3.5 font-semibold">
                        {r.costBasisUsd !== null ? <Usd v={r.costBasisUsd} /> : <Badge tone="warn">بهای خرید ثبت نشده</Badge>}
                      </td>
                      <td className="p-3.5 font-extrabold text-ink">
                        <Usd v={r.currentValueUsd} />
                      </td>
                      <td className="p-3.5">
                        {r.unrealizedPnlUsd !== null ? (
                          <div className="flex flex-col">
                            <Usd v={r.unrealizedPnlUsd} signed className="font-bold" />
                            {r.unrealizedPnlPct !== null && (
                              <span className="text-2xs"><Pct v={r.unrealizedPnlPct / 100} /></span>
                            )}
                          </div>
                        ) : (
                          <Link to="/cost-basis" className="text-2xs font-semibold text-accent hover:underline">
                            + ثبت بهای خرید
                          </Link>
                        )}
                      </td>
                      <td className="p-3.5 text-end font-semibold text-muted">
                        {r.sharePct !== null ? `${toFaDigits(r.sharePct.toFixed(1))}٪` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Notice tone="info">
              هنوز دارایی فعالی در کیف پول‌های متصل یافت نشد. از بخش «کیف پول‌ها» آدرس عمومی خود را متصل کنید تا موجودی و بهای تمام‌شدهٔ هر دارایی اینجا تحلیل شود.
            </Notice>
          )}
        </Surface>
      )}

      {/* ─── بخش دوم: شبیه‌ساز تعاملی و کاتالوگ کامل املاک اهواز، تمامی خودروهای بازار آزاد، سهام آمریکا و نفت ─── */}
      {(activeLens === 'both' || activeLens === 'buyhold') && (
        <>
          {/* شبیه‌ساز تعاملی «اگر ۳ یا ۴ دستگاه خودرو یا چند متر ملک در ۱۱ دی ۱۴۰۳ خریده بودم» */}
          <Surface className="space-y-5 p-5 md:p-6 border border-accent/25 bg-gradient-to-br from-card via-card to-accent/5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <Car className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-ink">
                      ماشین‌حساب ملموس خرید و فروش به قیمت بازار آزاد (۱۱ دی ۱۴۰۳ تا امروز)
                    </h3>
                    <Badge tone="brand">فقط قیمت بازار آزاد (بدون کارخانه)</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    بررسی دقیق: «اگر در ابتدای تاریخ تحلیل پولم به اندازهٔ ۳ یا ۴ خودرو یا متراژ مشخصی ملک در اهواز، سهام آمریکا یا نفت بود و امروز به قیمت بازار آزاد می‌فروختم چقدر سود می‌کردم؟»
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 items-end">
              <div className="lg:col-span-5">
                <Field label="انتخاب خودرو (بازار آزاد)، محلهٔ مسکن اهواز یا سهام جهانی">
                  <Select
                    value={activeSimId}
                    onChange={(e) => setActiveSimId(e.target.value)}
                    className="font-bold text-xs"
                  >
                    <optgroup label="مسکن اهواز (۵ محلهٔ منتخب — ۱۱ دی ۱۴۰۳ تا امروز)">
                      {simulatorItems.filter((i) => i.category === 'property').map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} (شروع: {fmtCompactFa(i.priceStart)} ← امروز: {fmtCompactFa(i.priceEnd)})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="خودروهای بازار آزاد (ایران‌خودرو، سایپا، مونتاژی و وارداتی)">
                      {simulatorItems.filter((i) => i.category === 'car').map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} (بازار ۱۱ دی ۱۴۰۳: {fmtCompactFa(i.priceStart)} ← امروز: {fmtCompactFa(i.priceEnd)})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="سهام آمریکا و شاخص‌های جهانی">
                      {simulatorItems.filter((i) => i.category === 'us_stock').map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="نفت خام و طلای جهانی">
                      {simulatorItems.filter((i) => i.category === 'commodity').map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="طلا، سکه، دلار و رمزارزها">
                      {simulatorItems.filter((i) => i.category === 'gold_fx' || i.category === 'crypto').map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </optgroup>
                  </Select>
                </Field>
              </div>

              <div className="lg:col-span-2">
                <Field label={`تعداد (${activeSimItem?.unitLabel ?? 'واحد'})`}>
                  <Input
                    type="number"
                    min={0.1}
                    step={activeSimItem?.unitLabel === 'دستگاه' ? 1 : activeSimItem?.unitLabel === 'مترمربع' ? 10 : 1}
                    value={customUnits}
                    onChange={(e) => setCustomUnits(Math.max(0.1, Number(e.target.value) || 1))}
                    className="font-bold text-sm text-center"
                  />
                </Field>
              </div>

              <div className="lg:col-span-5 flex flex-col gap-1.5">
                <span className="text-2xs text-muted font-semibold">انتخاب سریع تعداد واحد:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeSimItem?.unitLabel === 'مترمربع' ? [50, 75, 100, 120, 150, 200] : [1, 2, 3, 4, 5, 10]).map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCustomUnits(num)}
                      className={cn(
                        'rounded-control border px-2.5 py-1.5 text-2xs font-bold transition-all',
                        customUnits === num
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-divider bg-surface-2 text-ink hover:border-accent/40'
                      )}
                    >
                      {toFaDigits(num)} {activeSimItem?.unitLabel}
                    </button>
                  ))}
                  {activeSimItem && (
                    <button
                      type="button"
                      onClick={() => setCustomUnits(Math.round(activeSimItem.unitsCount * 100) / 100)}
                      className={cn(
                        'rounded-control border px-2.5 py-1.5 text-2xs font-bold transition-all',
                        Math.abs(customUnits - activeSimItem.unitsCount) < 0.05
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                      )}
                    >
                      معادل کل سرمایهٔ شروع شما ({toFaDigits(activeSimItem.unitsCount.toFixed(1))} {activeSimItem.unitLabel})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* نتیجهٔ شبیه‌سازی سناریوی انتخاب‌شده */}
            {customSimResult && activeSimItem && (
              <div className="rounded-2xl border border-divider bg-card p-4 md:p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-ink">
                        خرید {toFaDigits(customSimResult.count)} {activeSimItem.unitLabel} «{activeSimItem.name.replace(/^[^—]+—\s*/, '')}» و فروش امروز به قیمت بازار آزاد
                      </span>
                      {activeSimItem.priceStartRangeNote && (
                        <Badge tone="neutral">{activeSimItem.priceStartRangeNote}</Badge>
                      )}
                    </div>
                    {activeSimItem.source && (
                      <p className="mt-1 text-2xs text-subtle">منبع قیمت فعلی: {activeSimItem.source}</p>
                    )}
                  </div>
                  <div className="text-end">
                    <span className="text-2xs text-muted block">رشد قیمت بازار آزاد:</span>
                    <span className="text-base font-black"><Pct v={customSimResult.returnPct} /></span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div className="rounded-xl bg-surface-2 p-3.5 space-y-1">
                    <span className="text-2xs text-muted">پول لازم در تاریخ شروع (۱۱ دی ۱۴۰۳):</span>
                    <p className="text-sm font-extrabold text-ink"><Toman v={customSimResult.startCostToman} /></p>
                    <p className="text-2xs text-subtle">معادل دلاری شروع: <Usd v={customSimResult.startCostUsd} compact /></p>
                    <span className="text-2xs text-subtle block pt-1 border-t border-divider/60">
                      فی هر {activeSimItem.unitLabel} در شروع: {activeSimItem.currency === 'usd' ? <Usd v={customSimResult.unitPriceStart} /> : <Toman v={customSimResult.unitPriceStart} />}
                    </span>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-3.5 space-y-1">
                    <span className="text-2xs text-muted">ارزش فروش امروز به قیمت بازار آزاد:</span>
                    <p className="text-sm font-extrabold text-ink"><Toman v={customSimResult.endValueToman} /></p>
                    <p className="text-2xs text-subtle">معادل دلاری امروز: <Usd v={customSimResult.endValueUsd} compact /></p>
                    <span className="text-2xs text-subtle block pt-1 border-t border-divider/60">
                      فی هر {activeSimItem.unitLabel} امروز: {activeSimItem.currency === 'usd' ? <Usd v={customSimResult.unitPriceEnd} /> : <Toman v={customSimResult.unitPriceEnd} />}
                    </span>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-3.5 space-y-1">
                    <span className="text-2xs text-muted">سود خالص فروش در بازار آزاد:</span>
                    <p className="text-sm font-extrabold"><Toman v={customSimResult.pnlToman} signed /></p>
                    <p className="text-2xs"><Usd v={customSimResult.pnlUsd} signed compact /></p>
                    <span className="text-2xs text-subtle block pt-1 border-t border-divider/60">
                      درصد سود تومانی: <Pct v={customSimResult.returnPct} />
                    </span>
                  </div>

                  <div className="rounded-xl border border-divider bg-surface-2/40 p-3.5 space-y-1.5 flex flex-col justify-between">
                    <div>
                      <span className="text-2xs text-muted block">مقایسه با بازدهی سبد فعلی شما:</span>
                      <p className={cn('mt-1 font-bold leading-5', customSimResult.vsPortfolioToman <= 0 ? 'text-positive' : 'text-negative')}>
                        {customSimResult.vsPortfolioToman <= 0
                          ? `سبد شما ${fmtCompactFa(Math.abs(customSimResult.vsPortfolioToman))} تومان بیشتر از این خرید سود ساخته است`
                          : `خرید این دارایی ${fmtCompactFa(customSimResult.vsPortfolioToman)} تومان بیشتر از سبد شما سود می‌داد`}
                      </p>
                    </div>
                    <div>
                      <Badge tone={customSimResult.vsPortfolioToman <= 0 ? 'gain' : 'warn'}>
                        {customSimResult.vsPortfolioToman <= 0 ? 'عملکرد برتر سبد شما' : 'جا ماندن از این بازار'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Surface>

          {/* ─── ماتریس و جدول جامع همهٔ دارایی‌ها (مسکن اهواز، ۳۳+ مدل خودروی بازار آزاد، سهام آمریکا و نفت) ─── */}
          <Surface className="space-y-4 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink">
                  مقایسهٔ جامع بازارها: مسکن اهواز، تمامی خودروهای بازار آزاد، سهام آمریکا، نفت و طلا
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  بر اساس سرمایهٔ شروع شما (<Toman v={analysis?.portfolio.startToman} /> معادل <Usd v={analysis?.portfolio.startUsd} />): چند واحد قابل خرید بود و امروز در بازار آزاد چقدر می‌ارزد؟
                </p>
              </div>

              <div className="w-full sm:w-64">
                <Input
                  withSearchIcon
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جست‌وجوی خودرو، محله اهواز، سهام…"
                  aria-label="جست‌وجوی دارایی"
                />
              </div>
            </div>

            {/* تب‌های دسته‌بندی بازارها */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-xl bg-surface-2 p-1.5 text-xs">
              {(Object.keys(CATEGORY_NAMES) as (keyof typeof CATEGORY_NAMES)[]).map((cat) => {
                const count = cat === 'all' ? simulatorItems.length : simulatorItems.filter((i) => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'whitespace-nowrap rounded-lg px-3 py-1.5 font-bold transition-all flex items-center gap-1.5',
                      selectedCategory === cat ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                    )}
                  >
                    <span>{CATEGORY_NAMES[cat]}</span>
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.2 text-2xs text-subtle">{toFaDigits(count)}</span>
                  </button>
                );
              })}
            </div>

            {filteredItems.length === 0 ? (
              <Notice tone="info">موردی مطابق با جست‌وجوی شما پیدا نشد.</Notice>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => {
                  const portfolioAhead = item.vsPortfolioToman <= 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setActiveSimId(item.id);
                        setCustomUnits(item.unitLabel === 'مترمربع' ? 100 : 3);
                      }}
                      className={cn(
                        'cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md flex flex-col justify-between gap-3',
                        activeSimId === item.id ? 'border-accent bg-accent/5 ring-1 ring-accent/30' : 'border-divider bg-card'
                      )}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-2xs font-semibold text-accent block">{item.categoryLabel}</span>
                            <h4 className="font-extrabold text-sm text-ink mt-0.5">{item.name}</h4>
                            {item.subLabel && <p className="text-2xs text-muted mt-0.5">{item.subLabel}</p>}
                          </div>
                          <Badge tone={item.returnPct >= 0 ? 'gain' : 'loss'}>
                            <Pct v={item.returnPct} />
                          </Badge>
                        </div>

                        <div className="rounded-xl bg-surface-2 p-3 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-subtle">قابل خرید با سرمایهٔ شروع:</span>
                            <b className="font-extrabold text-ink">
                              {toFaDigits(item.unitsCount < 10 ? item.unitsCount.toFixed(2) : Math.round(item.unitsCount).toLocaleString('en-US'))} {item.unitLabel}
                            </b>
                          </div>
                          <div className="flex justify-between items-center text-2xs text-subtle">
                            <span>قیمت بازار در ۱۱ دی ۱۴۰۳:</span>
                            <span className="font-semibold text-ink">
                              {item.currency === 'usd' ? <Usd v={item.priceStart} /> : <Toman v={item.priceStart} />}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-2xs text-subtle">
                            <span>قیمت بازار آزاد امروز (اپ):</span>
                            <span className="font-semibold text-ink">
                              {item.currency === 'usd' ? <Usd v={item.priceEnd} /> : <Toman v={item.priceEnd} />}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 border-t border-divider pt-2.5">
                        <div className="flex justify-between items-baseline">
                          <span className="text-2xs text-muted">ارزش فروش امروز:</span>
                          <b className="font-extrabold text-sm text-ink"><Toman v={item.endValueToman} /></b>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-2xs text-muted">سود خالص بازار آزاد:</span>
                          <span className="font-bold"><Toman v={item.pnlToman} signed /></span>
                        </div>

                        <div
                          className={cn(
                            'rounded-lg px-2.5 py-1.5 text-2xs flex items-center justify-between font-bold',
                            portfolioAhead ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                          )}
                        >
                          <span>{portfolioAhead ? 'برتری سبد شما:' : 'برتری این بازار:'}</span>
                          <span>
                            {portfolioAhead ? `+${fmtCompactFa(Math.abs(item.vsPortfolioToman))}` : `-${fmtCompactFa(Math.abs(item.vsPortfolioToman))}`} تومان
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>
        </>
      )}

      {/* ─── بخش سوم: گزارش متنی تحلیل هوشمند ─── */}
      <Surface className="space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-accent" />
            <div>
              <h3 className="font-bold text-base text-ink">گزارش جامع تحلیل هوشمند سرمایه</h3>
              <p className="text-2xs text-muted">تفسیر یکپارچهٔ دارایی‌های موجود و بهای تمام‌شده در کنار مقایسه با ملک اهواز، خودروهای بازار آزاد، سهام آمریکا و نفت</p>
            </div>
          </div>

          {current && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                icon={copied ? <Check className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
                onClick={() => void copyReportText()}
              >
                {copied ? 'کپی شد' : 'کپی متن گزارش'}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                aria-label="حذف گزارش"
                onClick={() => {
                  void deleteReport(current);
                  setOpenId(null);
                  toast('info', 'گزارش حذف شد');
                }}
              />
            </div>
          )}
        </div>

        {reports.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="گزارش‌های قبلی">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={current?.id === r.id}
                onClick={() => setOpenId(r.id)}
                className={cn(
                  'min-h-9 shrink-0 rounded-control border px-3 text-xs font-semibold transition-all',
                  current?.id === r.id
                    ? 'border-accent bg-accent/15 text-accent font-bold'
                    : 'border-divider bg-surface-2 text-muted hover:border-accent/40'
                )}
              >
                {formatJalali(r.createdAt)}
              </button>
            ))}
          </div>
        )}

        {current ? (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted border-b border-divider pb-3">
              <span>تاریخ تهیهٔ تحلیل: {fmtDateTime(current.createdAt)}</span>
              <span>بازهٔ بررسی: {formatJalali(current.periodStart)} تا {formatJalali(current.periodEnd)}</span>
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none leading-7">
              <AssistantResponse text={current.text} />
            </div>

            {current.sources.length > 0 && (
              <div className="mt-6 border-t border-divider pt-4 space-y-1.5">
                <p className="text-xs font-bold text-ink">منابع داده‌های تحلیل‌شده</p>
                <ul className="list-disc space-y-0.5 ps-5 text-2xs text-subtle leading-5">
                  {current.sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center space-y-3">
            <Sparkles className="h-10 w-10 text-muted mx-auto opacity-40" />
            <h4 className="text-sm font-semibold text-ink">هنوز گزارش تحلیلی برای این بازه ثبت نشده است</h4>
            <p className="text-xs text-muted max-w-md mx-auto">
              با کلیک بر روی دکمهٔ «تهیهٔ تحلیل هوشمند»، گزارش تحلیلی کامل بر اساس دارایی‌های موجود فعلی، بهای تمام‌شده، مسکن اهواز و قیمت بازار آزاد تمامی خودروها تولید می‌شود.
            </p>
            <Button
              variant="primary"
              icon={<Sparkles className="h-4 w-4" />}
              loading={busy}
              disabled={!ready}
              onClick={() => void generate()}
              className="mt-2 font-bold"
            >
              تهیهٔ گزارش تحلیلی هوشمند
            </Button>
          </div>
        )}
      </Surface>
    </div>
  );
}
