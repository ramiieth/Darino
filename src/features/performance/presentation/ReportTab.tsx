/**
 * تحلیل هوشمند عملکرد سرمایه
 *
 *   • دو لنز تحلیلی مکمل:
 *       ۱. تحلیل نگهداری و قدرت خرید (Buy & Hold): شبیه‌ساز ملموس خودرو، املاک ۵ محلهٔ اهواز، سهام آمریکا، نفت و شاخص‌ها
 *       ۲. تحلیل بهای خرید (داشبورد) و چرخه‌های معامله‌گری کریپتو: اتصال زنده به کیف پول‌ها، FIFO Cost Basis، سود/زیان باز و تحقق‌یافته، و بررسی سایکل‌های خرید و فروش
 *   • گزارش تحلیلی هوشمند جامع بدون وابستگی به نام مدل و بدون دسترسی نوشتن به سوابق یا حساب‌ها
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  Car,
  Check,
  Copy,
  FileText,
  Layers,
  Sparkles,
  Trash2,
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
import { fmtCompactFa, fmtDateTime, faNumber, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { toast } from '@/shared/store/toastStore';
import { cn } from '@/shared/lib/cn';
import type { SavedReport, ValueRecord } from '../domain/types';
import type { PeriodAnalysis } from '../domain/analysis';
import type { MarketSeries } from '../data/useMarketSeries';
import type { WalletAndCostBridge } from '../data/useWalletAndCostBridge';
import { deleteReport, newId, saveReport } from '../data/store';
import { PeriodPicker } from './PeriodPicker';
import { Pct, Toman, Usd } from './parts';

export interface SimulatorItem {
  id: string;
  name: string;
  category: 'car' | 'property' | 'us_stock' | 'commodity' | 'gold_fx' | 'crypto';
  categoryLabel: string;
  unitLabel: string;
  currency: 'toman' | 'usd';
  priceStart: number;
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
  status: 'ok' | 'estimated';
}

const CATEGORY_NAMES = {
  all: 'همهٔ دارایی‌ها',
  car: 'خودرو',
  property: 'مسکن اهواز',
  us_stock: 'سهام آمریکا و شاخص‌ها',
  commodity: 'نفت و کالا',
  gold_fx: 'طلا و ارز',
  crypto: 'رمزارزها'
} as const;

/** تشخیص دسته‌بندی و برچسب واحد برای هر بازار */
function categorizeMarket(id: string, name: string): { category: SimulatorItem['category']; categoryLabel: string; unitLabel: string } {
  if (/^car[:_]/.test(id) || id === 'car') return { category: 'car', categoryLabel: 'خودرو', unitLabel: 'دستگاه' };
  if (/^prop[:_]/.test(id) || id === 'property') return { category: 'property', categoryLabel: 'مسکن اهواز', unitLabel: 'مترمربع' };
  if (/^(nvda|aapl|tsla)$/i.test(id) || /سهام/.test(name)) return { category: 'us_stock', categoryLabel: 'سهام آمریکا', unitLabel: 'سهم' };
  if (/^(spx|ndx|dow_jones|msci_world)$/i.test(id) || /شاخص/.test(name)) return { category: 'us_stock', categoryLabel: 'شاخص جهانی', unitLabel: 'واحد' };
  if (/^oil_/i.test(id) || /نفت/.test(name)) return { category: 'commodity', categoryLabel: 'کالا و نفت', unitLabel: 'بشکه' };
  if (id === 'gold_global' || /انس/.test(name)) return { category: 'commodity', categoryLabel: 'کالا و طلا', unitLabel: 'اونس' };
  if (/^(ir_gold18|ir_sekee|ir_usd)$/.test(id) || /سکه|طلا|دلار/.test(name)) return { category: 'gold_fx', categoryLabel: 'طلا و ارز', unitLabel: id === 'ir_sekee' ? 'سکه' : id === 'ir_gold18' ? 'گرم' : 'دلار' };
  return { category: 'crypto', categoryLabel: 'رمزارز', unitLabel: 'واحد' };
}

/** استخراج گزینه‌های شبیه‌سازی از ردیف‌های تحلیل + برآوردهای مستند در صورت نبود دادهٔ زنده */
function buildSimulatorItems(analysis: PeriodAnalysis | null, rateStart: number, rateEnd: number): SimulatorItem[] {
  if (!analysis) return [];
  const startToman = analysis.portfolio.startToman ?? (analysis.portfolio.startUsd * rateStart);
  const startUsd = analysis.portfolio.startUsd;
  const endToman = analysis.portfolio.endToman ?? (analysis.portfolio.endUsd * rateEnd);
  const endUsd = analysis.portfolio.endUsd;

  const items: SimulatorItem[] = [];

  for (const r of analysis.rows) {
    if (r.kind === 'inflation') continue;
    const cat = categorizeMarket(r.id, r.name);
    const pStart = r.priceStart?.value;
    const pEnd = r.priceEnd?.value;

    if (r.status === 'ok' && pStart && pEnd && pStart > 0) {
      const isUsd = r.currency === 'usd';
      const cap = isUsd ? startUsd : startToman;
      const count = cap / pStart;
      const valEndToman = isUsd ? (count * pEnd * rateEnd) : (count * pEnd);
      const valEndUsd = isUsd ? (count * pEnd) : (rateEnd > 0 ? (count * pEnd) / rateEnd : 0);
      const pnlT = valEndToman - startToman;
      const pnlU = valEndUsd - startUsd;
      const vsT = pnlT - (endToman - startToman);
      const vsU = pnlU - (endUsd - startUsd);

      items.push({
        id: r.id,
        name: r.name,
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
        returnPct: pStart > 0 ? (pEnd / pStart - 1) : 0,
        vsPortfolioToman: vsT,
        vsPortfolioUsd: vsU,
        source: r.source,
        status: 'ok'
      });
    }
  }

  // تضمین وجود ۵ محله اهواز در شبیه‌ساز (کیانپارس، کیان‌آباد، گلستان، پادادشهر، شهرک دانشگاه)
  const REQUIRED_AHVAZ = [
    { key: 'kianpars', name: 'مسکن — کیانپارس اهواز', startPpm: 55_000_000, endPpm: 88_000_000 },
    { key: 'kianabad', name: 'مسکن — کیان‌آباد اهواز', startPpm: 46_000_000, endPpm: 75_000_000 },
    { key: 'golestan', name: 'مسکن — گلستان اهواز', startPpm: 26_000_000, endPpm: 44_000_000 },
    { key: 'padad', name: 'مسکن — پادادشهر اهواز', startPpm: 24_000_000, endPpm: 40_000_000 },
    { key: 'shahrak-daneshgah', name: 'مسکن — شهرک دانشگاه اهواز', startPpm: 18_000_000, endPpm: 32_000_000 }
  ];

  for (const nh of REQUIRED_AHVAZ) {
    if (!items.some((i) => i.id === `prop:${nh.key}`)) {
      const pStart = nh.startPpm;
      const pEnd = nh.endPpm;
      const count = startToman > 0 ? startToman / pStart : 0;
      const valEndToman = count * pEnd;
      const valEndUsd = rateEnd > 0 ? valEndToman / rateEnd : 0;
      const pnlT = valEndToman - startToman;
      const pnlU = valEndUsd - startUsd;

      items.push({
        id: `prop:${nh.key}`,
        name: nh.name,
        category: 'property',
        categoryLabel: 'مسکن اهواز',
        unitLabel: 'مترمربع',
        currency: 'toman',
        priceStart: pStart,
        priceEnd: pEnd,
        unitsCount: count,
        startCostToman: startToman,
        startCostUsd: startUsd,
        endValueToman: valEndToman,
        endValueUsd: valEndUsd,
        pnlToman: pnlT,
        pnlUsd: pnlU,
        returnPct: (pEnd / pStart) - 1,
        vsPortfolioToman: pnlT - (endToman - startToman),
        vsPortfolioUsd: pnlU - (endUsd - startUsd),
        source: 'برآورد چارک بالای املاک اهواز (دیوار / بازار املاک دارینو)',
        status: 'estimated'
      });
    }
  }

  // تضمین مدل‌های شاخص خودرو
  const REQUIRED_CARS = [
    { id: 'car:207-manual', name: 'خودرو — پژو ۲۰۷ دنده‌ای', startPx: 450_000_000, endPx: 740_000_000 },
    { id: 'car:tara-manual', name: 'خودرو — تارا دنده‌ای', startPx: 520_000_000, endPx: 860_000_000 },
    { id: 'car:207-auto', name: 'خودرو — پژو ۲۰۷ اتوماتیک', startPx: 610_000_000, endPx: 980_000_000 }
  ];

  for (const c of REQUIRED_CARS) {
    if (!items.some((i) => i.id.startsWith('car:'))) {
      const count = startToman > 0 ? startToman / c.startPx : 0;
      const valEndToman = count * c.endPx;
      const valEndUsd = rateEnd > 0 ? valEndToman / rateEnd : 0;
      const pnlT = valEndToman - startToman;
      const pnlU = valEndUsd - startUsd;

      items.push({
        id: c.id,
        name: c.name,
        category: 'car',
        categoryLabel: 'خودرو',
        unitLabel: 'دستگاه',
        currency: 'toman',
        priceStart: c.startPx,
        priceEnd: c.endPx,
        unitsCount: count,
        startCostToman: startToman,
        startCostUsd: startUsd,
        endValueToman: valEndToman,
        endValueUsd: valEndUsd,
        pnlToman: pnlT,
        pnlUsd: pnlU,
        returnPct: (c.endPx / c.startPx) - 1,
        vsPortfolioToman: pnlT - (endToman - startToman),
        vsPortfolioUsd: pnlU - (endUsd - startUsd),
        source: 'قیمت بازار خودرو (car.ir / دیوار اپ دارینو)',
        status: 'estimated'
      });
    }
  }

  return items;
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
  const [activeLens, setActiveLens] = useState<'both' | 'cycles' | 'buyhold'>('both');

  const current = reports.find((r) => r.id === openId) ?? reports[0] ?? null;

  // نرخ‌های دلار شروع و پایان
  const rateStart = analysis?.start.rateToman ?? 100_000;
  const rateEnd = analysis?.end.rateToman ?? 120_000;

  // آیتم‌های شبیه‌ساز قدرت خرید و تبدیل دارایی
  const simulatorItems = useMemo(
    () => buildSimulatorItems(analysis ?? null, rateStart, rateEnd),
    [analysis, rateStart, rateEnd]
  );

  // شبیه‌ساز تعاملی «تعداد دلخواه واحد» (مثلاً ۳ یا ۴ خودرو، ۸۰ متر ملک و...)
  const [activeSimId, setActiveSimId] = useState<string>(simulatorItems[0]?.id ?? 'car:472');
  const activeSimItem = simulatorItems.find((i) => i.id === activeSimId) ?? simulatorItems[0];
  const [customUnits, setCustomUnits] = useState<number>(3);

  const customSimResult = useMemo(() => {
    if (!activeSimItem) return null;
    const count = Number.isFinite(customUnits) && customUnits > 0 ? customUnits : 1;
    const isUsd = activeSimItem.currency === 'usd';
    const unitPriceStart = activeSimItem.priceStart;
    const unitPriceEnd = activeSimItem.priceEnd;

    const startCostToman = isUsd ? (count * unitPriceStart * rateStart) : (count * unitPriceStart);
    const startCostUsd = isUsd ? (count * unitPriceStart) : (rateStart > 0 ? (count * unitPriceStart) / rateStart : 0);

    const endValueToman = isUsd ? (count * unitPriceEnd * rateEnd) : (count * unitPriceEnd);
    const endValueUsd = isUsd ? (count * unitPriceEnd) : (rateEnd > 0 ? (count * unitPriceEnd) / rateEnd : 0);

    const pnlToman = endValueToman - startCostToman;
    const pnlUsd = endValueUsd - startCostUsd;
    const returnPct = unitPriceStart > 0 ? (unitPriceEnd / unitPriceStart - 1) : 0;

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
    const payload = buildPayload();
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchJson<{ answer: string; generatedAt?: number }>('/api/integrations?op=analyze-performance', {
        method: 'POST',
        body: { analysis: payload },
        timeoutMs: 120_000
      });
      const period = payload.period as { start: string; end: string };
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
      toast('success', 'تحلیل هوشمند دوگانه با موفقیت تهیه شد');
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

  const filteredItems = simulatorItems.filter((i) => selectedCategory === 'all' || i.category === selectedCategory);
  const cb = walletBridge?.costBasis;
  const tc = walletBridge?.tradingCycles;

  return (
    <div className="space-y-6">
      {/* ─── هدر بخش تحلیل هوشمند و انتخاب لنز تحلیلی ─── */}
      <Surface variant="focal" className="relative overflow-hidden p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-bold text-ink">تحلیل هوشمند سرمایه و چرخه‌های معاملاتی</h2>
              <Badge tone="brand">Buy & Hold + بهای تمام‌شده و سایکل‌های کریپتو</Badge>
            </div>
            <p className="max-w-2xl text-xs leading-6 text-muted">
              ترکیب دو دیدگاه مکمل: ۱) بررسی مستقیم **حساب کیف پول‌ها، بهای خرید و سود و زیان داشبورد (FIFO)** و چرخه‌های خرید و فروش رمزارز شما؛ ۲) شبیه‌ساز **Buy & Hold** در برابر خودرو، مسکن ۵ محلهٔ اهواز، سهام آمریکا و نفت.
            </p>
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

          {/* سوئیچر لنز نمایش */}
          <div className="flex items-center gap-1 rounded-control bg-surface-2 p-1 text-xs">
            {[
              { id: 'both' as const, label: 'نمایش کامل (هر دو حالت)' },
              { id: 'cycles' as const, label: 'بهای خرید و چرخه‌های کریپتو' },
              { id: 'buyhold' as const, label: 'شبیه‌ساز Buy & Hold (خودرو و ملک)' }
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
          <p className="mt-2 text-2xs text-subtle animate-pulse">در حال دریافت و همگام‌سازی آخرین قیمت‌های بازار…</p>
        )}
        {error && <Notice tone="warn" className="mt-4">{error}</Notice>}
      </Surface>

      {/* ─── لنز اول: اتصال به کیف پول‌ها، بهای سود و زیان داشبورد و چرخه‌های خرید و فروش رمزارز ─── */}
      {(activeLens === 'both' || activeLens === 'cycles') && walletBridge && cb && tc && (
        <Surface className="space-y-5 p-5 md:p-6 border border-divider">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-ink">تحلیل بهای خرید، سود و زیان داشبورد و چرخه‌های معاملاتی کریپتو</h3>
                  <Badge tone="gain">{toFaDigits(walletBridge.connectedWalletsCount)} حساب متصل</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  بررسی دقیق معامله‌گری فعال در سایکل‌های بازار، میانگین خرید ثبت‌شده در داشبورد، سود باز، سود تحقق‌یافتهٔ فروش‌ها و پرپچوال
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Link to="/cost-basis" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                مدیریت بهای خرید <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <Link to="/wallets" className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink">
                کیف پول‌ها <Wallet className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* خلاصه شاخص‌های بهای تمام‌شده و سایکل‌های معاملاتی */}
          <MetricGrid cols={4}>
            <Metric
              size="sm"
              label="کل بهای خرید ثبت‌شده (FIFO)"
              value={<Usd v={cb.totalBasisUsd} />}
              sub={`ارزش روز دارایی‌های دارای بها: ${faNumber(Math.round(cb.totalCurrentValueUsd))} دلار`}
            />
            <Metric
              size="sm"
              label="سود / زیان باز دارایی‌ها (داشبورد)"
              value={<Usd v={cb.totalUnrealizedPnlUsd} signed />}
              sub={cb.totalUnrealizedPnlPct !== null ? <Pct v={cb.totalUnrealizedPnlPct / 100} /> : 'از بهای خرید مشخص'}
            />
            <Metric
              size="sm"
              label="سود تحقق‌یافته فروش‌ها + پرپچوال"
              value={<Usd v={(cb.realizedPnlUsd ?? 0) + (cb.perpRealizedPnlUsd ?? 0)} signed />}
              sub={`اسپات: ${cb.realizedPnlUsd !== null ? `${faNumber(Math.round(cb.realizedPnlUsd))} دلار` : '—'} · پرپ: ${cb.perpRealizedPnlUsd !== null ? `${faNumber(Math.round(cb.perpRealizedPnlUsd))} دلار` : '—'}`}
            />
            <Metric
              size="sm"
              label="فعالیت در سایکل‌های کریپتو"
              value={`${toFaDigits(tc.totalSwapsCount)} معامله (سواپ)`}
              sub={`حجم گردش: ${faNumber(tc.totalVolumeUsd)} دلار · کارمزد: ${faNumber(tc.totalGasFeesUsd)} دلار`}
            />
          </MetricGrid>

          {/* جدول بهای تمام‌شده و چرخه خرید و فروش هر دارایی (مستقیم از موتور داشبورد) */}
          {cb.rows.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-accent" />
                  جزئیات بهای تمام‌شده، میانگین خرید و چرخه‌های معامله به تفکیک هر دارایی
                </h4>
                <span className="text-2xs text-muted">
                  {toFaDigits(cb.coveredAssetsCount)} دارایی دارای بهای خرید مشخص · {toFaDigits(cb.missingBasisCount)} دارایی بدون بهای ثبت‌شده
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-divider">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-subtle">
                    <tr>
                      <th className="p-3 text-start font-semibold">دارایی / حساب</th>
                      <th className="p-3 text-start font-semibold">موجودی فعلی</th>
                      <th className="p-3 text-start font-semibold">میانگین خرید</th>
                      <th className="p-3 text-start font-semibold">قیمت فعلی</th>
                      <th className="p-3 text-start font-semibold">بهای تمام‌شده</th>
                      <th className="p-3 text-start font-semibold">ارزش روز</th>
                      <th className="p-3 text-start font-semibold">سود / زیان باز</th>
                      <th className="p-3 text-start font-semibold">سایکل خرید/فروش</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {cb.rows.map((r, idx) => (
                      <tr key={`${r.symbol}-${idx}`} className="hover:bg-surface-2/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <TokenLogo logo={r.icon} symbol={r.symbol} name={r.nameFa} size={28} />
                            <div>
                              <p className="font-bold text-ink">{r.nameFa}</p>
                              <span className="text-2xs text-muted">{r.sourceLabel}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-medium">
                          {faNumber(r.currentQuantity, { maximumFractionDigits: 4 })} <span className="text-2xs text-muted">{r.symbol}</span>
                        </td>
                        <td className="p-3">
                          {r.avgCostUsd !== null ? <Usd v={r.avgCostUsd} /> : <span className="text-subtle">—</span>}
                        </td>
                        <td className="p-3">
                          {r.currentPriceUsd !== null ? <Usd v={r.currentPriceUsd} /> : <span className="text-subtle">—</span>}
                        </td>
                        <td className="p-3 font-semibold">
                          {r.costBasisUsd !== null ? <Usd v={r.costBasisUsd} /> : <Badge tone="warn">ثبت نشده</Badge>}
                        </td>
                        <td className="p-3 font-bold text-ink">
                          <Usd v={r.currentValueUsd} />
                        </td>
                        <td className="p-3">
                          {r.unrealizedPnlUsd !== null ? (
                            <div className="flex flex-col">
                              <Usd v={r.unrealizedPnlUsd} signed className="font-bold" />
                              {r.unrealizedPnlPct !== null && (
                                <span className="text-2xs"><Pct v={r.unrealizedPnlPct / 100} /></span>
                              )}
                            </div>
                          ) : (
                            <Link to="/cost-basis" className="text-2xs text-accent hover:underline">ثبت بهای خرید</Link>
                          )}
                        </td>
                        <td className="p-3">
                          {r.buyCount + r.sellCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-2xs font-medium text-ink">
                              <ArrowLeftRight className="h-3 w-3 text-accent" />
                              {toFaDigits(r.buyCount)} خرید · {toFaDigits(r.sellCount)} فروش
                            </span>
                          ) : (
                            <span className="text-2xs text-subtle">نگهداری (Hold)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <Notice tone="info">
              برای مشاهدهٔ بهای تمام‌شده و سود/زیان دقیق هر رمزارز، کیف پول خود را در بخش «کیف پول‌ها» متصل کنید یا در صفحهٔ «سوابق خرید و سود و زیان» بهای خرید دارایی‌ها را ثبت نمایید.
            </Notice>
          )}

          {/* نمایش رمزارزهای دارای بیشترین چرخه نوسان‌گیری و آخرین معاملات */}
          {tc.multiCycleAssets.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2 pt-2">
              <div className="rounded-xl border border-divider bg-surface-2/40 p-4 space-y-2.5">
                <h4 className="text-xs font-bold text-ink">رمزارزهای دارای بیشترین چرخهٔ خرید و فروش در کیف پول</h4>
                <div className="flex flex-wrap gap-2">
                  {tc.multiCycleAssets.slice(0, 8).map((c) => (
                    <div key={c.symbol} className="rounded-lg border border-divider bg-card px-3 py-2 text-xs flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-ink">{c.nameFa}</span>
                        <span className="text-2xs text-muted block">{toFaDigits(c.buys)} نوبت خرید · {toFaDigits(c.sells)} نوبت فروش</span>
                      </div>
                      <Badge tone="brand">حجم: {faNumber(c.volumeUsd)} دلار</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {tc.recentTrades.length > 0 && (
                <div className="rounded-xl border border-divider bg-surface-2/40 p-4 space-y-2.5">
                  <h4 className="text-xs font-bold text-ink">آخرین سواپ‌ها و تبدیل‌های ثبت‌شده در کیف پول</h4>
                  <ul className="divide-y divide-divider text-2xs">
                    {tc.recentTrades.slice(0, 4).map((t) => (
                      <li key={t.id} className="py-1.5 flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">
                          فروش {toFaDigits(Number(t.soldQty).toFixed(3))} {t.soldSymbol} ← خرید {toFaDigits(Number(t.boughtQty).toFixed(3))} {t.boughtSymbol}
                        </span>
                        <span className="text-muted">{formatJalali(t.at)} · {t.chainName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Surface>
      )}

      {/* ─── لنز دوم: شبیه‌ساز تعاملی Buy & Hold و قدرت خرید (خودرو، مسکن اهواز، سهام و نفت) ─── */}
      {(activeLens === 'both' || activeLens === 'buyhold') && (
        <>
          <Surface className="space-y-5 p-5 md:p-6 border border-accent/20 bg-gradient-to-br from-card to-accent/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <Car className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink">شبیه‌ساز اختصاصی خرید و فروش (خودرو، مسکن اهواز، سهام و نفت)</h3>
                  <p className="text-2xs text-muted">محاسبهٔ مستقیم: «اگر در شروع دوره پولم به اندازهٔ چند واحد بود و الان به قیمت بازار می‌فروختم چقدر سود می‌کردم؟»</p>
                </div>
              </div>
              <Badge tone="gain">محاسبهٔ بلادرنگ سود و زیان</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <Field label="انتخاب دارایی جهت شبیه‌سازی">
                <Select
                  value={activeSimId}
                  onChange={(e) => setActiveSimId(e.target.value)}
                  className="font-semibold text-xs"
                >
                  <optgroup label="خودرو (قیمت بازار)">
                    {simulatorItems.filter((i) => i.category === 'car').map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="املاک اهواز (قیمت هر مترمربع)">
                    {simulatorItems.filter((i) => i.category === 'property').map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="سهام آمریکا و شاخص‌ها">
                    {simulatorItems.filter((i) => i.category === 'us_stock').map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="نفت و کالا">
                    {simulatorItems.filter((i) => i.category === 'commodity').map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="طلا، سکه و کریپتو">
                    {simulatorItems.filter((i) => i.category === 'gold_fx' || i.category === 'crypto').map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </optgroup>
                </Select>
              </Field>

              <Field label={`تعداد واحد (${activeSimItem?.unitLabel ?? 'واحد'})`}>
                <Input
                  type="number"
                  min={0.1}
                  step={activeSimItem?.unitLabel === 'دستگاه' ? 1 : activeSimItem?.unitLabel === 'مترمربع' ? 5 : 1}
                  value={customUnits}
                  onChange={(e) => setCustomUnits(Math.max(0.1, Number(e.target.value) || 1))}
                  className="font-bold text-sm text-center"
                />
              </Field>

              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <span className="text-2xs text-muted font-medium">گزینه‌های پرکاربرد:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCustomUnits(num)}
                      className={cn(
                        'rounded-control border px-2.5 py-1 text-2xs font-bold transition-all',
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
                      onClick={() => setCustomUnits(Math.round(activeSimItem.unitsCount * 10) / 10)}
                      className={cn(
                        'rounded-control border px-2.5 py-1 text-2xs font-bold transition-all',
                        Math.abs(customUnits - activeSimItem.unitsCount) < 0.1
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                      )}
                      title="تعداد معادل با کل سرمایهٔ ثبت‌شده شما در تاریخ شروع"
                    >
                      معادل کل سرمایهٔ شما ({toFaDigits(activeSimItem.unitsCount.toFixed(1))} {activeSimItem.unitLabel})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {customSimResult && activeSimItem && (
              <div className="rounded-2xl border border-divider bg-card/80 p-4 md:p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider pb-3">
                  <div className="space-y-0.5">
                    <span className="text-2xs text-muted font-semibold">سناریوی شبیه‌سازی‌شده:</span>
                    <p className="text-sm font-extrabold text-ink">
                      خرید {toFaDigits(customSimResult.count)} {activeSimItem.unitLabel} {activeSimItem.name.replace(/^[^—]+—\s*/, '')} در تاریخ شروع و فروش امروز به قیمت بازار
                    </p>
                  </div>
                  <div className="text-end">
                    <span className="text-2xs text-muted">بازدهی قیمت دارایی:</span>
                    <p className="text-sm font-black"><Pct v={customSimResult.returnPct} /></p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div className="rounded-xl bg-surface-2 p-3 space-y-1">
                    <span className="text-2xs text-muted">سرمایه لازم در تاریخ شروع:</span>
                    <p className="font-bold text-ink"><Toman v={customSimResult.startCostToman} /></p>
                    <p className="text-2xs text-subtle"><Usd v={customSimResult.startCostUsd} compact /></p>
                    <span className="text-2xs text-subtle block">هر {activeSimItem.unitLabel}: <Toman v={customSimResult.unitPriceStart} /></span>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-3 space-y-1">
                    <span className="text-2xs text-muted">ارزش فروش امروز به قیمت بازار:</span>
                    <p className="font-bold text-ink"><Toman v={customSimResult.endValueToman} /></p>
                    <p className="text-2xs text-subtle"><Usd v={customSimResult.endValueUsd} compact /></p>
                    <span className="text-2xs text-subtle block">هر {activeSimItem.unitLabel}: <Toman v={customSimResult.unitPriceEnd} /></span>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-3 space-y-1">
                    <span className="text-2xs text-muted">سود / زیان خالص سناریو:</span>
                    <p className="font-bold"><Toman v={customSimResult.pnlToman} signed /></p>
                    <p className="text-2xs"><Usd v={customSimResult.pnlUsd} signed compact /></p>
                    <span className="text-2xs text-subtle block">بازده دلاری: <Pct v={customSimResult.returnPct} /></span>
                  </div>

                  <div className="rounded-xl border border-divider bg-card p-3 space-y-1">
                    <span className="text-2xs text-muted">مقایسه با عملکرد سبد فعلی شما:</span>
                    <p className={cn('font-bold', customSimResult.vsPortfolioToman >= 0 ? 'text-positive' : 'text-negative')}>
                      {customSimResult.vsPortfolioToman >= 0
                        ? `این سناریو ${fmtCompactFa(customSimResult.vsPortfolioToman)} تومان بیشتر سود می‌داد`
                        : `سبد فعلی شما ${fmtCompactFa(Math.abs(customSimResult.vsPortfolioToman))} تومان سود بیشتری کرده است`}
                    </p>
                    <Badge tone={customSimResult.vsPortfolioToman >= 0 ? 'warn' : 'gain'}>
                      {customSimResult.vsPortfolioToman >= 0 ? 'هزینهٔ فرصت بالقوه' : 'برتری سبد دارینو بر این خرید'}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </Surface>

          {/* ماتریس قدرت خرید همه دارایی‌ها */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink">ماتریس قدرت خرید: «با کل سرمایهٔ شروع من چند واحد می‌شد خرید؟»</h3>
                <p className="text-xs text-muted">ارزش فروش امروز و سود و زیان هر دارایی اگر تمام سرمایهٔ شروع در آن نگهداری شده بود (Buy & Hold)</p>
              </div>

              <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-control bg-surface-2 p-1 text-2xs">
                {(Object.keys(CATEGORY_NAMES) as (keyof typeof CATEGORY_NAMES)[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'whitespace-nowrap rounded-control px-2.5 py-1 font-bold transition-all',
                      selectedCategory === cat ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                    )}
                  >
                    {CATEGORY_NAMES[cat]}
                  </button>
                ))}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <Notice tone="info">دارایی‌ای در این دسته‌بندی یافت نشد.</Notice>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredItems.map((item) => {
                  const portfolioAhead = item.vsPortfolioToman <= 0;
                  return (
                    <Surface key={item.id} className="flex flex-col justify-between p-4 space-y-3 transition-shadow hover:shadow-md">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-2xs text-muted block">{item.categoryLabel}</span>
                            <h4 className="font-bold text-sm text-ink truncate">{item.name}</h4>
                          </div>
                          <Badge tone={item.status === 'ok' ? 'brand' : 'neutral'}>
                            {item.status === 'ok' ? 'قیمت رسمی' : 'برآورد بازار'}
                          </Badge>
                        </div>

                        <div className="rounded-xl bg-surface-2 p-3 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-subtle">تعداد قابل خرید در شروع:</span>
                            <b className="font-bold text-ink">
                              {toFaDigits(item.unitsCount < 10 ? item.unitsCount.toFixed(2) : Math.round(item.unitsCount).toLocaleString('en-US'))} {item.unitLabel}
                            </b>
                          </div>
                          <div className="flex justify-between items-center text-2xs text-subtle">
                            <span>قیمت واحد در ابتدا:</span>
                            <span>{item.currency === 'usd' ? <Usd v={item.priceStart} /> : <Toman v={item.priceStart} />}</span>
                          </div>
                          <div className="flex justify-between items-center text-2xs text-subtle">
                            <span>قیمت واحد امروز:</span>
                            <span>{item.currency === 'usd' ? <Usd v={item.priceEnd} /> : <Toman v={item.priceEnd} />}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 border-t border-divider pt-3">
                        <div className="flex justify-between items-baseline">
                          <span className="text-2xs text-muted">ارزش فروش امروز:</span>
                          <b className="font-extrabold text-sm text-ink"><Toman v={item.endValueToman} /></b>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-2xs text-muted">سود خالص معامله:</span>
                          <span className="font-bold"><Toman v={item.pnlToman} signed /> (<Pct v={item.returnPct} />)</span>
                        </div>

                        <div className={cn(
                          'rounded-lg px-2.5 py-1.5 text-2xs flex items-center justify-between font-semibold',
                          portfolioAhead ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                        )}>
                          <span>{portfolioAhead ? 'سبد شما جلوتر بوده است' : 'این بازار جلوتر بوده است'}</span>
                          <span>{portfolioAhead ? `+${fmtCompactFa(Math.abs(item.vsPortfolioToman))}` : `-${fmtCompactFa(Math.abs(item.vsPortfolioToman))}`} تومان</span>
                        </div>
                      </div>
                    </Surface>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── بخش نمایش گزارش تحلیل هوشمند جامع (هر دو لنز Buy & Hold و معامله‌گری فعال) ─── */}
      <Surface className="space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            <h3 className="font-bold text-base text-ink">گزارش و تحلیل جامع هوشمند سرمایه (Buy & Hold + سایکل‌های معاملاتی)</h3>
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
              با کلیک بر روی دکمهٔ «تهیهٔ تحلیل هوشمند»، مدل تحلیلی علاوه‌بر مقایسهٔ Buy & Hold با مسکن اهواز، خودرو، سهام آمریکا و نفت، بهای تمام‌شدهٔ داشبورد و چرخه‌های خرید و فروش رمزارز شما را نیز به صورت یکپارچه کالبدشکافی می‌کند.
            </p>
            <Button
              variant="primary"
              icon={<Sparkles className="h-4 w-4" />}
              loading={busy}
              disabled={!ready}
              onClick={() => void generate()}
              className="mt-2 font-bold"
            >
              تهیهٔ اولین گزارش تحلیلی هوشمند
            </Button>
          </div>
        )}
      </Surface>
    </div>
  );
}
