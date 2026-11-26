/**
 * داشبورد یکپارچه «طلای ایران»
 *
 * شامل ۴ بخش تمیز، لوگودار و مرتبط به هم (با استفاده از نرخ زنده و ذخیره‌شده مشترک):
 * ۱. بازار و روند (قیمت روز طلای ۱۸ عیار، پلتفرم‌ها، سکه‌ها، تحلیل تاریخی ۷/۳۰/۶۰ روزه + نمودار مساحتی تعاملی، اسنپ‌شات مستقل)
 * ۲. طلای آنلاین (ملی‌گلد، میلی، وال‌گلد، دریک + افزودن پلتفرم سفارشی، محاسبه خرید، فروش، هزینه نگهداری و سربه‌سر)
 * ۳. طلای زینتی و مقایسه (محاسبه فاکتور خرید مصنوعات، فروش مجدد بدون اجرت/مالیات/سنگ، مقایسه با طلای آنلاین و سناریوی آینده)
 * ۴. صندوق‌های طلای بورسی (۶ صندوق لوگودار با مرجع ثابت ۱۰ مرداد ۱۴۰۵ + ماشین‌حساب سرمایه‌گذاری با کارمزد ۰.۱۲٪)
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  Banknote,
  BarChart3,
  Check,
  ExternalLink,
  Gem,
  Globe,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingUp
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList } from '@/shared/components/ui/FinancialValue';
import { ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { jsonGet, jsonSet } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import {
  COIN_FA,
  PLATFORM_FA,
  median,
  percentileOf,
  platformsVsBazaar,
  valuation,
  type CoinRow,
  type DayClose,
  type Decomposition,
  type GoldPayload,
  type PlatformRow,
  type PremiumStats,
  type Valuation
} from '../domain/gold';
import {
  DEFAULT_ONLINE_PLATFORMS,
  GOLD_ETF_PRESETS,
  GOLD_ETF_SNAPSHOT_DATE_FA,
  HISTORY_HORIZONS,
  calculateGoldEtfInvestment,
  calculateOnlineGold,
  compareOnlineAndJewelry,
  compareWithSnapshot,
  computeMovingHorizon,
  evaluateFutureGoldScenarios,
  evaluateGoldEtfCard,
  type GoldSnapshot,
  type HistoryHorizonDays,
  type JewelryTaxBase,
  type MakingChargeMode,
  type MovingHorizonChange,
  type OnlineGoldPlatformProfile,
  type SellerProfitBase,
  type StorageFeeMode
} from '../domain/goldInvestment';
import { useGold } from '../data/intelApi';
import {
  GoldBullionEmblem,
  GoldEtfLogo,
  GoldPlatformLogo,
  GoldSparkIcon,
  IranCoinLogo,
  JewelryEmblem
} from './GoldLogos';

const STORE_KEY = 'darino:iran-gold-suite:v1';
const LAST_PAYLOAD_KEY = 'darino:iran-gold-last-payload:v1';
const HISTORY_CACHE_KEY = 'darino:iran-gold-history18k:v1';

type SectionTab = 'market' | 'online' | 'jewelry' | 'etf';

const GOLD_TABS: readonly {
  id: SectionTab;
  label: string;
  sub: string;
  icon: ReactNode;
}[] = [
  { id: 'market', label: 'بازار، تاریخچه و اسنپ‌شات', sub: 'نرخ زنده، حباب و روند', icon: <TrendingUp aria-hidden className="h-4 w-4" /> },
  { id: 'online', label: 'خرید طلای آنلاین', sub: 'ملی‌گلد، میلی، وال‌گلد، دریک', icon: <Smartphone aria-hidden className="h-4 w-4" /> },
  { id: 'jewelry', label: 'طلای زینتی و مقایسه', sub: 'فاکتور، بازخرید و مقایسه', icon: <Gem aria-hidden className="h-4 w-4" /> },
  { id: 'etf', label: 'صندوق‌های طلا', sub: 'عیار، مثقال، لوتوس و…', icon: <Landmark aria-hidden className="h-4 w-4" /> }
];

const QUICK_WEIGHTS = [0.5, 1, 3, 5, 10] as const;

const JEWELRY_PRESETS = [
  { label: 'حلقه ۳ گرم · اجرت ۱۲٪', name: 'حلقه طلا', weight: '3', making: '12', profit: '7' },
  { label: 'دستبند ۱۰ گرم · اجرت ۱۵٪', name: 'دستبند طلا', weight: '10', making: '15', profit: '7' },
  { label: 'گردنبند ۱۵ گرم · اجرت ۱۸٪', name: 'گردنبند طلا', weight: '15', making: '18', profit: '7' },
  { label: 'طلای کم‌اجرت · اجرت ۳٪', name: 'طلای کم‌اجرت', weight: '5', making: '3', profit: '5' }
] as const;

const QUICK_ETF_AMOUNTS = [
  { value: 10_000_000, label: '۱۰ میلیون' },
  { value: 50_000_000, label: '۵۰ میلیون' },
  { value: 100_000_000, label: '۱۰۰ میلیون' },
  { value: 500_000_000, label: '۵۰۰ میلیون' }
] as const;

interface EtfUserEntry {
  currentPrice: string;
  futurePrice: string;
}

interface SavedGoldState {
  tab: SectionTab;
  horizonDays: HistoryHorizonDays;
  snapshots: GoldSnapshot[];
  selectedSnapshotId: string;
  /* طلای آنلاین */
  onlinePlatforms: OnlineGoldPlatformProfile[];
  selectedPlatformId: string;
  onlineWeightGrams: string;
  holdingMonths: string;
  physicalDelivery: boolean;
  /* طلای زینتی */
  jewelryProductName: string;
  jewelryWeightGrams: string;
  stoneWeightGrams: string;
  karat: string;
  makingChargeMode: MakingChargeMode;
  makingChargeValue: string;
  sellerProfitPct: string;
  sellerProfitBase: SellerProfitBase;
  taxPct: string;
  taxBase: JewelryTaxBase;
  otherBuyCostToman: string;
  discountToman: string;
  customResaleRate: string;
  resaleDeductionPct: string;
  resaleFixedDeduction: string;
  /* سناریوهای آینده طلا */
  futureScenarioPrices: number[];
  /* صندوق‌های طلا */
  etfEntries: Record<string, EtfUserEntry>;
  selectedEtfId: string;
  etfCalcMode: 'by_amount' | 'by_units';
  etfAmountToman: string;
  etfUnits: string;
  etfIntegerOnly: boolean;
  etfBuyPrice: string;
  etfCurrentPrice: string;
  etfFuturePrice: string;
}

const DEFAULT_SNAPSHOTS: GoldSnapshot[] = [
  {
    id: 'preset-1405-05-10',
    title: 'مرجع ۱۰ مرداد ۱۴۰۵',
    createdAt: Date.UTC(2026, 7, 1, 8, 0, 0),
    dateLabelFa: '۱۰ مرداد ۱۴۰۵',
    price18kToman: 22_450_000,
    protectedPreset: true
  }
];

const INITIAL_ETF_ENTRIES: Record<string, EtfUserEntry> = Object.fromEntries(
  GOLD_ETF_PRESETS.map((e) => [e.id, { currentPrice: '', futurePrice: '' }])
);

const DEFAULTS: SavedGoldState = {
  tab: 'market',
  horizonDays: 30,
  snapshots: DEFAULT_SNAPSHOTS,
  selectedSnapshotId: DEFAULT_SNAPSHOTS[0].id,
  onlinePlatforms: [...DEFAULT_ONLINE_PLATFORMS],
  selectedPlatformId: 'melligold',
  onlineWeightGrams: '3',
  holdingMonths: '0',
  physicalDelivery: false,
  jewelryProductName: 'حلقه طلا',
  jewelryWeightGrams: '3',
  stoneWeightGrams: '0',
  karat: '750',
  makingChargeMode: 'percent',
  makingChargeValue: '12',
  sellerProfitPct: '7',
  sellerProfitBase: 'raw_plus_making',
  taxPct: '10',
  taxBase: 'making_plus_profit',
  otherBuyCostToman: '0',
  discountToman: '0',
  customResaleRate: '',
  resaleDeductionPct: '1.5',
  resaleFixedDeduction: '0',
  futureScenarioPrices: [],
  etfEntries: INITIAL_ETF_ENTRIES,
  selectedEtfId: 'ayar',
  etfCalcMode: 'by_amount',
  etfAmountToman: '50000000',
  etfUnits: '1000',
  etfIntegerOnly: true,
  etfBuyPrice: '52105',
  etfCurrentPrice: '',
  etfFuturePrice: '65000'
};

/* ---------------- توابع قالب‌بندی عددی فارسی ---------------- */

const parseCleanNum = (raw: string): number => {
  const en = String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/,/g, '')
    .trim();
  const n = Number(en);
  return Number.isFinite(n) ? n : 0;
};

/** نشانه‌های جداسازی جهت یونیکد برای نمایش صحیح علامت منفی/مثبت و درصد در متن راست‌به‌چپ */
const RLI = '\u2067';
const LRI = '\u2066';
const PDI = '\u2069';

const fmtToman = (v: number | null | undefined, signed = false): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Math.round(v);
  const abs = Math.abs(r).toLocaleString('en-US');
  const prefix = r > 0 && signed ? '+' : r < 0 ? '-' : '';
  return `${RLI}${LRI}${prefix}${toFaDigits(abs)}${PDI} تومان${PDI}`;
};

const fmtPct = (v: number | null | undefined, digits = 2, signed = true): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const prefix = v > 0 && signed ? '+' : v < 0 ? '-' : '';
  return `${LRI}${prefix}${toFaDigits(abs)}٪${PDI}`;
};

const fmtFaDate = (ts: number | null | undefined): string => {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '—';
  try {
    return new Date(ts).toLocaleDateString('fa-IR');
  } catch {
    return '—';
  }
};

const pctRatio = (v: number, digits = 1, signed = true) => fmtPct(v * 100, digits, signed);
const million = (toman: number) => {
  const sign = toman < 0 ? '-' : '';
  const num = toFaDigits((Math.abs(toman) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
  return `${RLI}${LRI}${sign}${num}${PDI} میلیون${PDI}`;
};
const year = (t: number) => toFaDigits(new Date(t).getUTCFullYear());

/* ============================================================
   کامپوننت اصلی GoldTab
   ============================================================ */

export function GoldTab() {
  const q = useGold();
  const [s, setS] = useState<SavedGoldState>(() => {
    const saved = jsonGet<Partial<SavedGoldState> | null>(STORE_KEY, null) ?? {};
    const validTabs: SectionTab[] = ['market', 'online', 'jewelry', 'etf'];
    const safeTab: SectionTab =
      saved.tab && validTabs.includes(saved.tab as SectionTab) ? (saved.tab as SectionTab) : 'market';
    return {
      ...DEFAULTS,
      ...saved,
      tab: safeTab,
      snapshots:
        Array.isArray(saved.snapshots) && saved.snapshots.length > 0
          ? saved.snapshots
          : DEFAULT_SNAPSHOTS,
      onlinePlatforms:
        Array.isArray(saved.onlinePlatforms) && saved.onlinePlatforms.length > 0
          ? saved.onlinePlatforms
          : [...DEFAULT_ONLINE_PLATFORMS],
      futureScenarioPrices: Array.isArray(saved.futureScenarioPrices)
        ? saved.futureScenarioPrices
        : [],
      etfEntries: { ...INITIAL_ETF_ENTRIES, ...(saved.etfEntries ?? {}) }
    };
  });

  useEffect(() => {
    jsonSet(STORE_KEY, s);
  }, [s]);

  const set = <K extends keyof SavedGoldState>(k: K, v: SavedGoldState[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  // ذخیره آخرین Payload معتبر و تاریخچه برای حالت قطع ارتباط با API
  const [cachedPayload, setCachedPayload] = useState<GoldPayload | null>(() =>
    jsonGet<GoldPayload | null>(LAST_PAYLOAD_KEY, null)
  );
  const [cachedHistory, setCachedHistory] = useState<DayClose[]>(() => {
    const raw = jsonGet<DayClose[] | null>(HISTORY_CACHE_KEY, null);
    return Array.isArray(raw) ? raw : [];
  });

  useEffect(() => {
    if (q.data) {
      setCachedPayload(q.data);
      jsonSet(LAST_PAYLOAD_KEY, q.data);
      if (Array.isArray(q.data.history18k) && q.data.history18k.length > 0) {
        setCachedHistory((prev) => {
          const mergedMap = new Map<number, number>();
          for (const pt of prev) {
            if (pt && Number.isFinite(pt.t) && Number.isFinite(pt.close)) {
              mergedMap.set(pt.t, pt.close);
            }
          }
          for (const pt of q.data!.history18k!) {
            if (pt && Number.isFinite(pt.t) && Number.isFinite(pt.close)) {
              mergedMap.set(pt.t, pt.close);
            }
          }
          const merged = [...mergedMap.entries()]
            .map(([t, close]) => ({ t, close }))
            .sort((a, b) => a.t - b.t)
            .slice(-120);
          jsonSet(HISTORY_CACHE_KEY, merged);
          return merged;
        });
      }
    }
  }, [q.data]);

  const d: GoldPayload | null = q.data ?? cachedPayload ?? null;
  const liveRows: PlatformRow[] = d?.rows ?? [];
  const isOfflineCached = !q.data || q.isError;
  const isStale = !d || isOfflineCached || Date.now() - d.fetchedAt > 10 * 60_000;

  // قیمت مرجع هر گرم طلای ۱۸ عیار (تومان): اولویت با بازار TGJU، سپس میانه پلتفرم‌های آنلاین
  const live18kToman = useMemo(() => {
    if (!d) return null;
    return d.bazaar ?? median(liveRows.map((r) => (r.buy + r.sell) / 2)) ?? null;
  }, [d, liveRows]);

  const historySeries = useMemo(() => {
    if (d?.history18k && d.history18k.length > 0) return d.history18k;
    return cachedHistory;
  }, [d, cachedHistory]);

  const referenceNowMs = d?.fetchedAt ?? Date.now();

  // محاسبه تغییرات متحرک ۷، ۳۰ و ۶۰ روزه (همیشه بالاتر از هر return شرطی اجرا می‌شود)
  const horizons = useMemo(
    () =>
      HISTORY_HORIZONS.map((days) =>
        computeMovingHorizon(historySeries, live18kToman, days, referenceNowMs)
      ),
    [historySeries, live18kToman, referenceNowMs]
  );

  const selectedHorizon = horizons.find((h) => h.days === s.horizonDays) ?? horizons[1];

  // اسنپ‌شات انتخاب‌شده
  const activeSnapshot =
    s.snapshots.find((x) => x.id === s.selectedSnapshotId) ?? s.snapshots[0] ?? null;
  const snapshotComparison = useMemo(
    () => (activeSnapshot ? compareWithSnapshot(activeSnapshot, live18kToman) : null),
    [activeSnapshot, live18kToman]
  );

  return (
    <div className="space-y-5">
      {/* کارت کانونی: قیمت روز طلای ۱۸ عیار + نشان شمش دارینو + شاخص‌های ۷/۳۰/۶۰ روزه و اسنپ‌شات */}
      <Surface variant="focal" className="relative overflow-hidden border-divider">
        <div className="h-[3px] w-full bg-gradient-to-l from-accent via-accent/65 to-gold/55" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 start-8 h-44 w-72 rounded-full bg-accent/[0.07] blur-3xl"
        />
        <div className="relative space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <GoldBullionEmblem size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-muted">
                    قیمت روز هر گرم طلای ۱۸ عیار
                  </span>
                  <Badge tone={!d ? 'neutral' : isOfflineCached ? 'warn' : isStale ? 'neutral' : 'gain'}>
                    {!d && q.isLoading
                      ? 'در حال دریافت...'
                      : !d
                        ? 'آفلاین'
                        : isOfflineCached
                          ? 'آخرین قیمت ذخیره‌شده'
                          : isStale
                            ? 'کمی قدیمی'
                            : 'زنده · متصل'}
                  </Badge>
                </div>
                <p className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">
                  {live18kToman ? fmtToman(live18kToman) : q.isLoading ? 'در حال بارگذاری نرخ روز...' : '—'}
                </p>
                {d && (
                  <p className="mt-0.5 text-2xs text-subtle">
                    منبع: {d.bazaar ? 'بازار (TGJU) و ۴ پلتفرم' : 'میانه پلتفرم‌های آنلاین'} · {fmtRelativeAge(d.fetchedAt)}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              loading={q.isFetching}
              onClick={() => void q.refetch()}
            >
              به‌روزرسانی
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-divider/80 pt-3.5 sm:grid-cols-4">
            {horizons.map((h) => {
              const isSelected = s.horizonDays === h.days && s.tab === 'market';
              const up = (h.changePct ?? 0) >= 0;
              return (
                <button
                  key={h.days}
                  type="button"
                  onClick={() => {
                    set('horizonDays', h.days);
                    set('tab', 'market');
                  }}
                  className={cn(
                    'rounded-xl border p-3 text-start transition-all',
                    isSelected
                      ? 'border-accent/60 bg-accent/[0.07] shadow-xs ring-1 ring-accent/20'
                      : 'border-divider bg-card/85 hover:border-divider-strong hover:bg-card'
                  )}
                >
                  <p className="text-2xs font-semibold text-muted">تغییر {toFaDigits(h.days)} روز گذشته</p>
                  {h.available ? (
                    <>
                      <p className={cn('mt-1 text-sm font-extrabold', up ? 'text-positive' : 'text-negative')}>
                        {fmtPct(h.changePct)}
                      </p>
                      <p className="text-2xs text-subtle">{fmtToman(h.changeToman, true)}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-2xs text-subtle">داده تاریخی ناکافی</p>
                  )}
                </button>
              );
            })}

            <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
              <p className="truncate text-2xs font-bold text-accent">
                نسبت به اسنپ‌شات ({activeSnapshot?.title ?? 'مرجع'})
              </p>
              {snapshotComparison ? (
                <>
                  <p
                    className={cn(
                      'mt-1 text-sm font-extrabold',
                      snapshotComparison.changePct >= 0 ? 'text-positive' : 'text-negative'
                    )}
                  >
                    {fmtPct(snapshotComparison.changePct)}
                  </p>
                  <p className="text-2xs text-subtle">{fmtToman(snapshotComparison.diffToman, true)}</p>
                </>
              ) : (
                <p className="mt-1 text-2xs text-subtle">—</p>
              )}
            </div>
          </div>
        </div>
      </Surface>

      {/* ناوبری کارتی ۴گانه ماژول طلای ایران هماهنگ با سیستم دیزاین دارینو */}
      <nav
        aria-label="بخش‌های طلای ایران"
        className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"
      >
        {GOLD_TABS.map((t) => {
          const active = s.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => set('tab', t.id)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-2.5 rounded-2xl border p-3 text-start transition-all duration-150',
                active
                  ? 'border-accent/60 bg-accent/[0.06] shadow-sm ring-1 ring-accent/20'
                  : 'border-divider bg-card hover:border-divider-strong hover:bg-surface-2/50'
              )}
            >
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
                  active
                    ? 'bg-accent text-on-accent shadow-xs'
                    : 'bg-surface-2 text-muted'
                )}
              >
                {t.icon}
              </span>
              <span className="min-w-0">
                <span className={cn('block truncate text-xs font-extrabold', active ? 'text-ink' : 'text-ink/85')}>
                  {t.label}
                </span>
                <span className="block truncate text-2xs text-muted">{t.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {s.tab === 'market' && (
        <MarketAndHistorySection
          d={d}
          isLoading={q.isLoading}
          onRetry={() => void q.refetch()}
          live18kToman={live18kToman}
          horizons={horizons}
          selectedHorizon={selectedHorizon}
          onSelectHorizon={(days) => set('horizonDays', days)}
          snapshots={s.snapshots}
          selectedSnapshotId={s.selectedSnapshotId}
          onSelectSnapshot={(id) => set('selectedSnapshotId', id)}
          onChangeSnapshots={(list, activeId) =>
            setS((prev) => ({
              ...prev,
              snapshots: list,
              selectedSnapshotId: activeId ?? prev.selectedSnapshotId
            }))
          }
          snapshotComparison={snapshotComparison}
        />
      )}

      {s.tab === 'online' && (
        <OnlineGoldSection
          s={s}
          set={set}
          setS={setS}
          live18kToman={live18kToman}
          liveRows={liveRows}
        />
      )}

      {s.tab === 'jewelry' && (
        <JewelryAndComparisonSection
          s={s}
          set={set}
          setS={setS}
          live18kToman={live18kToman}
          liveRows={liveRows}
        />
      )}

      {s.tab === 'etf' && <GoldEtfSection s={s} set={set} setS={setS} />}
    </div>
  );
}

/* ============================================================
   بخش ۱: بازار، تحلیل تاریخی ۷/۳۰/۶۰ روزه، نمودار و اسنپ‌شات
   ============================================================ */

function MarketAndHistorySection({
  d,
  isLoading,
  onRetry,
  live18kToman,
  horizons,
  selectedHorizon,
  onSelectHorizon,
  snapshots,
  selectedSnapshotId,
  onSelectSnapshot,
  onChangeSnapshots,
  snapshotComparison
}: {
  d: GoldPayload | null;
  isLoading: boolean;
  onRetry: () => void;
  live18kToman: number | null;
  horizons: MovingHorizonChange[];
  selectedHorizon: MovingHorizonChange;
  onSelectHorizon: (days: HistoryHorizonDays) => void;
  snapshots: GoldSnapshot[];
  selectedSnapshotId: string;
  onSelectSnapshot: (id: string) => void;
  onChangeSnapshots: (list: GoldSnapshot[], activeId?: string) => void;
  snapshotComparison: ReturnType<typeof compareWithSnapshot>;
}) {
  const [newSnapTitle, setNewSnapTitle] = useState('');
  const [newSnapDate, setNewSnapDate] = useState('۱۴۰۵/۰۸/۲۷');
  const [newSnapPrice, setNewSnapPrice] = useState('');
  const [newSnapNote, setNewSnapNote] = useState('');
  const [editingSnapId, setEditingSnapId] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const addOrUpdateSnapshot = () => {
    const px = parseCleanNum(newSnapPrice) || live18kToman || 0;
    if (!(px > 0) || !newSnapTitle.trim()) return;
    if (editingSnapId) {
      const updated = snapshots.map((sn) =>
        sn.id === editingSnapId
          ? {
              ...sn,
              title: newSnapTitle.trim(),
              dateLabelFa: newSnapDate.trim() || sn.dateLabelFa,
              price18kToman: px,
              note: newSnapNote.trim() || undefined
            }
          : sn
      );
      onChangeSnapshots(updated, editingSnapId);
      setEditingSnapId(null);
    } else {
      const id = `snap-${Date.now()}`;
      const created: GoldSnapshot = {
        id,
        title: newSnapTitle.trim(),
        createdAt: Date.now(),
        dateLabelFa: newSnapDate.trim() || fmtFaDate(Date.now()),
        price18kToman: px,
        note: newSnapNote.trim() || undefined
      };
      onChangeSnapshots([...snapshots, created], id);
    }
    setNewSnapTitle('');
    setNewSnapPrice('');
    setNewSnapNote('');
  };

  const startEditSnap = (sn: GoldSnapshot) => {
    setEditingSnapId(sn.id);
    setNewSnapTitle(sn.title);
    setNewSnapDate(sn.dateLabelFa);
    setNewSnapPrice(String(sn.price18kToman));
    setNewSnapNote(sn.note ?? '');
  };

  const coins = d?.coins ?? [];
  const decomposition = d?.decomposition ?? [];

  return (
    <div className="space-y-5">
      {/* کارت ارزش‌گذاری ذاتی، پلتفرم‌ها و سکه‌ها (در دسترس فوری) */}
      {!d && isLoading && <ListSkeleton rows={3} />}
      {!d && !isLoading && (
        <ErrorState
          message="نرخ زنده پلتفرم‌ها و حباب سکه در حال حاضر دریافت نشد؛ محاسبه‌گرها و صندوق‌های طلا در تب‌های بالا فعال هستند."
          onRetry={onRetry}
        />
      )}
      {d && <ValueCard d={d} />}

      {/* جدول و نمودار مساحتی تغییرات ۷، ۳۰ و ۶۰ روزه */}
      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GoldSparkIcon />
            <h3 className="text-sm font-extrabold text-ink">تحلیل تاریخی قیمت طلای ۱۸ عیار (۷، ۳۰ و ۶۰ روز گذشته)</h3>
          </div>
          <SegmentedControl<'7' | '30' | '60'>
            label="بازه نمودار"
            size="sm"
            value={String(selectedHorizon.days) as '7' | '30' | '60'}
            onChange={(v) => {
              setHoverIdx(null);
              onSelectHorizon(Number(v) as HistoryHorizonDays);
            }}
            options={[
              { value: '7', label: '۷ روز' },
              { value: '30', label: '۳۰ روز' },
              { value: '60', label: '۶۰ روز' }
            ]}
          />
        </div>

        {/* نمودار مساحتی تعاملی SVG */}
        {selectedHorizon.series.length >= 2 ? (
          <InteractiveGoldChart
            series={selectedHorizon.series}
            isUp={(selectedHorizon.changePct ?? 0) >= 0}
            hoverIdx={hoverIdx}
            onHover={setHoverIdx}
          />
        ) : (
          <p className="py-4 text-center text-xs text-subtle">اطلاعات تاریخی کافی برای رسم نمودار در دسترس نیست.</p>
        )}

        <div className="overflow-x-auto">
          <table className="data-table w-full text-xs">
            <thead>
              <tr>
                <th>بازه زمانی</th>
                <th className="col-num">قیمت ابتدای بازه</th>
                <th className="col-num">قیمت فعلی</th>
                <th className="col-num">تغییر قیمت</th>
                <th className="col-num">درصد تغییر</th>
              </tr>
            </thead>
            <tbody>
              {horizons.map((h) => {
                const up = (h.changePct ?? 0) >= 0;
                return (
                  <tr
                    key={h.days}
                    onClick={() => {
                      setHoverIdx(null);
                      onSelectHorizon(h.days);
                    }}
                    className={cn(
                      'cursor-pointer transition-colors',
                      h.days === selectedHorizon.days && 'bg-accent/[0.06]'
                    )}
                  >
                    <td className="font-bold text-ink">
                      {toFaDigits(h.days)} روز گذشته
                      {h.referenceTimestamp && (
                        <span className="block text-2xs font-normal text-subtle">
                          از {fmtFaDate(h.referenceTimestamp)}
                        </span>
                      )}
                    </td>
                    {h.available ? (
                      <>
                        <td className="col-num whitespace-nowrap text-muted">{fmtToman(h.startPriceToman)}</td>
                        <td className="col-num whitespace-nowrap font-semibold text-ink">{fmtToman(h.currentPriceToman)}</td>
                        <td className={cn('col-num whitespace-nowrap font-bold', up ? 'text-positive' : 'text-negative')}>
                          {fmtToman(h.changeToman, true)}
                        </td>
                        <td className="col-num whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 font-extrabold',
                              up ? 'bg-gain/12 text-positive' : 'bg-negative/12 text-negative'
                            )}
                          >
                            {fmtPct(h.changePct)}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="text-center text-subtle">
                        اطلاعات تاریخی کافی در دسترس نیست
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* پلتفرم‌های آنلاین لوگودار، سکه‌های مدالیون‌دار و تفکیک عوامل رشد */}
      {d && (
        <>
          <Platforms d={d} />
          {coins.length > 0 && <Coins coins={coins} />}
          {decomposition.length > 0 && <Growth rows={decomposition} />}
        </>
      )}

      {/* بخش مستقل قیمت مرجع (Snapshot) */}
      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GoldSparkIcon />
            <h3 className="text-sm font-extrabold text-ink">قیمت مرجع (Snapshot)</h3>
          </div>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-2xs font-semibold text-subtle">
            ثابت و مستقل از تاریخچه خودکار بازار
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {snapshots.map((sn) => {
            const active = sn.id === selectedSnapshotId;
            return (
              <button
                key={sn.id}
                type="button"
                onClick={() => onSelectSnapshot(sn.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all',
                  active
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-divider bg-card text-muted hover:border-divider-strong hover:text-ink'
                )}
              >
                <span>{sn.title}</span>
                <span className="text-2xs opacity-80">({sn.dateLabelFa})</span>
              </button>
            );
          })}
        </div>

        {snapshotComparison && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-divider bg-surface-2/45 p-3.5 sm:grid-cols-4">
            <div>
              <p className="text-2xs text-muted">قیمت مرجع ({snapshotComparison.snapshot.dateLabelFa})</p>
              <p className="mt-1 text-sm font-bold text-ink">{fmtToman(snapshotComparison.snapshot.price18kToman)}</p>
            </div>
            <div>
              <p className="text-2xs text-muted">قیمت فعلی بازار</p>
              <p className="mt-1 text-sm font-bold text-ink">{fmtToman(snapshotComparison.currentPriceToman)}</p>
            </div>
            <div>
              <p className="text-2xs text-muted">اختلاف قیمت با مرجع</p>
              <p className={cn('mt-1 text-sm font-bold', snapshotComparison.diffToman >= 0 ? 'text-positive' : 'text-negative')}>
                {fmtToman(snapshotComparison.diffToman, true)}
              </p>
            </div>
            <div>
              <p className="text-2xs text-muted">درصد رشد یا افت از مرجع</p>
              <p className={cn('mt-1 text-sm font-extrabold', snapshotComparison.changePct >= 0 ? 'text-positive' : 'text-negative')}>
                {fmtPct(snapshotComparison.changePct)}
              </p>
            </div>
          </div>
        )}

        <Disclosure summary={editingSnapId ? 'ویرایش قیمت مرجع (Snapshot)' : 'ثبت یا مدیریت قیمت مرجع جدید (Snapshot)'}>
          <div className="space-y-3 pt-2">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="عنوان Snapshot">
                <Input value={newSnapTitle} onChange={(e) => setNewSnapTitle(e.target.value)} placeholder="مثلاً خرید پاییز" />
              </Field>
              <Field label="تاریخ ثبت">
                <Input value={newSnapDate} onChange={(e) => setNewSnapDate(e.target.value)} placeholder="۱۴۰۵/۰۸/۲۷" />
              </Field>
              <Field label="قیمت هر گرم ۱۸ عیار (تومان)">
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  value={newSnapPrice}
                  onChange={(e) => setNewSnapPrice(e.target.value)}
                  placeholder={live18kToman ? String(Math.round(live18kToman)) : '25000000'}
                />
              </Field>
              <Field label="توضیح (اختیاری)">
                <Input value={newSnapNote} onChange={(e) => setNewSnapNote(e.target.value)} placeholder="یادداشت کوتاه" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={editingSnapId ? <Check /> : <Plus />} onClick={addOrUpdateSnapshot}>
                {editingSnapId ? 'ذخیره ویرایش Snapshot' : 'ثبت Snapshot جدید'}
              </Button>
              {editingSnapId && (
                <Button size="sm" variant="ghost" onClick={() => setEditingSnapId(null)}>
                  انصراف
                </Button>
              )}
            </div>

            <ul className="divide-y divide-divider rounded-field border border-divider text-xs">
              {snapshots.map((sn) => (
                <li key={sn.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <b className="text-ink">{sn.title}</b> · <span className="text-muted">{sn.dateLabelFa}</span> ·{' '}
                    <span className="font-semibold text-ink">{fmtToman(sn.price18kToman)}</span>
                    {sn.note && <span className="ms-2 text-subtle">({sn.note})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => startEditSnap(sn)} className="text-accent underline">
                      ویرایش دستی
                    </button>
                    {snapshots.length > 1 && !sn.protectedPreset && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = snapshots.filter((x) => x.id !== sn.id);
                          onChangeSnapshots(next, next[0]?.id);
                        }}
                        className="text-muted hover:text-negative"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Disclosure>
      </Surface>
    </div>
  );
}

function InteractiveGoldChart({
  series,
  isUp,
  hoverIdx,
  onHover
}: {
  series: DayClose[];
  isUp: boolean;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  const gradId = useId();
  const prices = series.map((x) => x.close);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = Math.max(1, maxP - minP);
  const w = 640;
  const h = 160;
  const padY = 16;

  const points = series.map((pt, i) => {
    const x = (i / Math.max(1, series.length - 1)) * w;
    const y = h - padY - ((pt.close - minP) / range) * (h - 2 * padY);
    return { x, y, pt };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${w} ${h - 4} L 0 ${h - 4} Z`;
  const activePoint = hoverIdx != null && points[hoverIdx] ? points[hoverIdx] : points[points.length - 1];
  const strokeHex = isUp ? '#10b981' : '#ef4444';

  return (
    <div className="space-y-2.5 rounded-xl border border-divider/80 bg-surface-2/35 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          تاریخ: <b className="text-ink">{fmtFaDate(activePoint.pt.t)}</b>
        </span>
        <span className="rounded-full bg-card px-2.5 py-0.5 font-extrabold text-ink shadow-2xs ring-1 ring-divider/70">
          {fmtToman(activePoint.pt.close)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-40 w-full overflow-visible"
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeHex} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeHex} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={w}
            y1={padY + ratio * (h - 2 * padY)}
            y2={padY + ratio * (h - 2 * padY)}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeDasharray="3 4"
          />
        ))}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeHex}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {activePoint && (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={padY / 2}
            y2={h - 4}
            stroke={strokeHex}
            strokeOpacity="0.35"
            strokeDasharray="3 3"
          />
        )}
        {points.map((p, idx) => (
          <rect
            key={p.pt.t}
            x={p.x - w / series.length / 2}
            y={0}
            width={Math.max(4, w / series.length)}
            height={h}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => onHover(idx)}
            onClick={() => onHover(idx)}
          />
        ))}
        {activePoint && (
          <>
            <circle cx={activePoint.x} cy={activePoint.y} r={8} fill={strokeHex} opacity="0.2" />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={4.5}
              fill={strokeHex}
              className="stroke-card stroke-2"
            />
          </>
        )}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-2xs">
        <span className="rounded-full bg-negative/10 px-2.5 py-0.5 font-semibold text-negative">
          کف بازه: {fmtToman(minP)}
        </span>
        <span className="rounded-full bg-gain/10 px-2.5 py-0.5 font-semibold text-positive">
          سقف بازه: {fmtToman(maxP)}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   بخش ۲: محاسبه‌گر خرید و فروش طلای آنلاین (ملی‌گلد و سایر پلتفرم‌ها)
   ============================================================ */

function OnlineGoldSection({
  s,
  set,
  setS,
  live18kToman,
  liveRows
}: {
  s: SavedGoldState;
  set: <K extends keyof SavedGoldState>(k: K, v: SavedGoldState[K]) => void;
  setS: React.Dispatch<React.SetStateAction<SavedGoldState>>;
  live18kToman: number | null;
  liveRows: PlatformRow[];
}) {
  const [newPlatformName, setNewPlatformName] = useState('');
  const activeProfile =
    s.onlinePlatforms.find((p) => p.id === s.selectedPlatformId) ?? s.onlinePlatforms[0];

  const updateProfile = (patch: Partial<OnlineGoldPlatformProfile>) => {
    setS((prev) => ({
      ...prev,
      onlinePlatforms: prev.onlinePlatforms.map((p) =>
        p.id === activeProfile.id ? { ...p, ...patch } : p
      )
    }));
  };

  const addCustomPlatform = () => {
    const name = newPlatformName.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    const basePx = live18kToman ?? 26_000_000;
    const created: OnlineGoldPlatformProfile = {
      id,
      name,
      useLiveQuote: false,
      buyPricePerGramToman: basePx,
      sellPricePerGramToman: basePx,
      buyFeePct: 0.5,
      sellFeePct: 0.5,
      weightDeductionPct: 0,
      storageFeeMode: 'none',
      storageFeeValue: 0,
      withdrawalFixedFeeToman: 0,
      physicalDeliveryFeeToman: 0,
      minWithdrawalGrams: 0.1,
      otherBuyCostToman: 0,
      otherSellCostToman: 0
    };
    setS((prev) => ({
      ...prev,
      onlinePlatforms: [...prev.onlinePlatforms, created],
      selectedPlatformId: id
    }));
    setNewPlatformName('');
  };

  const calc = useMemo(
    () =>
      calculateOnlineGold({
        weightGrams: parseCleanNum(s.onlineWeightGrams),
        holdingMonths: parseCleanNum(s.holdingMonths),
        includePhysicalDelivery: s.physicalDelivery,
        profile: activeProfile,
        fallbackMarketPriceToman: live18kToman,
        liveRows
      }),
    [s.onlineWeightGrams, s.holdingMonths, s.physicalDelivery, activeProfile, live18kToman, liveRows]
  );

  return (
    <div className="space-y-5">
      <Surface className="overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-l from-accent via-gain/65 to-transparent" aria-hidden />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <GoldPlatformLogo platformId={activeProfile.id} name={activeProfile.name} size="md" />
              <div>
                <h3 className="text-sm font-extrabold text-ink">خرید و فروش طلای آنلاین</h3>
                <p className="text-2xs text-muted">محاسبهٔ دقیق خرید، کارمزد رفت‌وبرگشت و قیمت سربه‌سر در {activeProfile.name}</p>
              </div>
            </div>
            <Badge tone={calc.isEstimatedQuote ? 'warn' : 'gain'}>
              {calc.isEstimatedQuote ? 'نرخ تخمینی / دستی' : 'نرخ زنده API پلتفرم'}
            </Badge>
          </div>

          {/* انتخاب پلتفرم با لوگو و پیش‌نمایش نرخ */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {s.onlinePlatforms.map((p) => {
              const active = p.id === activeProfile.id;
              const live = liveRows.find((r) => r.platform === p.linkedPlatform);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set('selectedPlatformId', p.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border p-2.5 text-start transition-all',
                    active
                      ? 'border-accent/60 bg-accent/[0.06] shadow-xs ring-1 ring-accent/20'
                      : 'border-divider bg-card hover:border-divider-strong'
                  )}
                >
                  <GoldPlatformLogo platformId={p.id} name={p.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-extrabold text-ink">{p.name}</span>
                    <span className="block truncate text-2xs text-subtle">
                      {live ? fmtToman(live.buy) : `کارمزد ${toFaDigits(p.buyFeePct)}٪`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* انتخاب سریع وزن */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-subtle">
              <Sparkles aria-hidden className="h-3 w-3 text-accent" />
              وزن سریع:
            </span>
            {QUICK_WEIGHTS.map((w) => {
              const active = parseCleanNum(s.onlineWeightGrams) === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => set('onlineWeightGrams', String(w))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-bold transition-all',
                    active
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-divider bg-surface-2/70 text-muted hover:text-ink'
                  )}
                >
                  {toFaDigits(w)} گرم
                </button>
              );
            })}
          </div>

          {/* ورودی‌های اصلی ساده */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="وزن طلا (گرم)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.onlineWeightGrams}
                onChange={(e) => set('onlineWeightGrams', e.target.value)}
                suffix="گرم"
              />
            </Field>
            <Field label="مدت نگهداری (ماه)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.holdingMonths}
                onChange={(e) => set('holdingMonths', e.target.value)}
                suffix="ماه"
              />
            </Field>
            <Field label="نوع تسویه در پایان">
              <select
                value={s.physicalDelivery ? 'physical' : 'cash'}
                onChange={(e) => set('physicalDelivery', e.target.value === 'physical')}
                className="h-10 w-full rounded-control border border-divider bg-card px-3 text-xs font-semibold text-ink"
              >
                <option value="cash">فروش ریالی در پلتفرم</option>
                <option value="physical">تحویل فیزیکی طلا</option>
              </select>
            </Field>
          </div>

          {/* کارت‌های خلاصه نتیجه */}
          {calc.valid && (
            <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
              <div className="rounded-xl border border-divider border-s-4 border-s-accent bg-card p-3">
                <p className="text-2xs font-semibold text-muted">مبلغ کل پرداختی خرید</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.totalBuyCostToman)}</p>
                <p className="text-2xs text-subtle">کارمزد خرید: {fmtToman(calc.buyFeeToman)}</p>
              </div>
              <div className="rounded-xl border border-divider border-s-4 border-s-gain bg-card p-3">
                <p className="text-2xs font-semibold text-muted">مبلغ خالص دریافتی فروش</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.netSellProceedsToman)}</p>
                <p className="text-2xs text-subtle">کارمزد فروش: {fmtToman(calc.sellFeeToman)}</p>
              </div>
              <div
                className={cn(
                  'rounded-xl border border-divider border-s-4 bg-card p-3',
                  calc.netProfitToman >= 0 ? 'border-s-gain' : 'border-s-loss'
                )}
              >
                <p className="text-2xs font-semibold text-muted">سود یا زیان خالص لحظه‌ای</p>
                <p className={cn('mt-1 text-sm font-extrabold', calc.netProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                  {fmtToman(calc.netProfitToman, true)} ({fmtPct(calc.roiPct)})
                </p>
                <p className="text-2xs text-subtle">هزینه رفت‌وبرگشت و اسپرد</p>
              </div>
              <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
                <p className="text-2xs font-bold text-accent">قیمت سربه‌سر هر گرم</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.breakEvenSellPricePerGramToman)}</p>
                <p className="text-2xs text-subtle">وزن خالص: {toFaDigits(calc.netReceivedWeightGrams)} گرم</p>
              </div>
            </div>
          )}

          {/* جزئیات فاکتور و تنظیمات تعرفه پلتفرم (بازشونده) */}
          <Disclosure summary="جزئیات محاسبه و تنظیمات تعرفه پلتفرم">
            <div className="space-y-4 pt-2">
              {calc.valid && (
                <KeyValueList
                  dense
                  rows={[
                    { label: 'قیمت خرید هر گرم در پلتفرم', value: fmtToman(calc.buyPricePerGramToman) },
                    { label: 'قیمت فروش هر گرم در پلتفرم', value: fmtToman(calc.sellPricePerGramToman) },
                    { label: 'ارزش پایه طلای خام', value: fmtToman(calc.baseGoldValueToman) },
                    { label: `کارمزد خرید (${toFaDigits(activeProfile.buyFeePct)}٪)`, value: fmtToman(calc.buyFeeToman) },
                    { label: 'هزینه نگهداری دوره', value: fmtToman(calc.storageCostToman) },
                    { label: `کارمزد فروش (${toFaDigits(activeProfile.sellFeePct)}٪)`, value: fmtToman(calc.sellFeeToman) },
                    { label: 'سایر هزینه‌های برداشت / تحویل فیزیکی', value: fmtToman(calc.extraSellCostsToman) }
                  ]}
                />
              )}

              <div className="grid gap-3 border-t border-divider pt-3 sm:grid-cols-3">
                <Field label="کارمزد خرید (٪)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={String(activeProfile.buyFeePct)}
                    onChange={(e) => updateProfile({ buyFeePct: parseCleanNum(e.target.value) })}
                  />
                </Field>
                <Field label="کارمزد فروش (٪)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={String(activeProfile.sellFeePct)}
                    onChange={(e) => updateProfile({ sellFeePct: parseCleanNum(e.target.value) })}
                  />
                </Field>
                <Field label="مدل هزینه نگهداری">
                  <select
                    value={activeProfile.storageFeeMode}
                    onChange={(e) => updateProfile({ storageFeeMode: e.target.value as StorageFeeMode })}
                    className="h-10 w-full rounded-control border border-divider bg-card px-3 text-xs font-semibold text-ink"
                  >
                    <option value="none">بدون هزینه نگهداری</option>
                    <option value="monthly_fixed">مبلغ ثابت ماهانه (تومان)</option>
                    <option value="per_gram_monthly">به‌ازای هر گرم در ماه (تومان)</option>
                    <option value="annual_pct">درصد سالانه از ارزش دارایی</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {activeProfile.storageFeeMode !== 'none' && (
                  <Field label="مقدار هزینه نگهداری">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={String(activeProfile.storageFeeValue)}
                      onChange={(e) => updateProfile({ storageFeeValue: parseCleanNum(e.target.value) })}
                    />
                  </Field>
                )}
                <Field label="هزینه تحویل فیزیکی (تومان)">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={String(activeProfile.physicalDeliveryFeeToman)}
                    onChange={(e) => updateProfile({ physicalDeliveryFeeToman: parseCleanNum(e.target.value) })}
                  />
                </Field>
                <Field label="نرخ خرید دستی هر گرم (۰ = خودکار API)">
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={String(activeProfile.buyPricePerGramToman || '')}
                    onChange={(e) => {
                      const v = parseCleanNum(e.target.value);
                      updateProfile({
                        useLiveQuote: v <= 0,
                        buyPricePerGramToman: v,
                        sellPricePerGramToman: activeProfile.sellPricePerGramToman || v
                      });
                    }}
                    placeholder="خودکار از API"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-divider pt-3">
                <Field label="افزودن پلتفرم جدید" className="w-56">
                  <Input
                    value={newPlatformName}
                    onChange={(e) => setNewPlatformName(e.target.value)}
                    placeholder="نام پلتفرم..."
                  />
                </Field>
                <Button size="sm" variant="outline" icon={<Plus />} onClick={addCustomPlatform}>
                  افزودن پلتفرم
                </Button>
              </div>
            </div>
          </Disclosure>
        </div>
      </Surface>
    </div>
  );
}

/* ============================================================
   بخش ۳: طلای زینتی، فروش مجدد، مقایسه با آنلاین و سناریوی آینده
   ============================================================ */

function JewelryAndComparisonSection({
  s,
  set,
  setS,
  live18kToman,
  liveRows
}: {
  s: SavedGoldState;
  set: <K extends keyof SavedGoldState>(k: K, v: SavedGoldState[K]) => void;
  setS: React.Dispatch<React.SetStateAction<SavedGoldState>>;
  live18kToman: number | null;
  liveRows: PlatformRow[];
}) {
  const [scenarioInput, setScenarioInput] = useState('');
  const marketPx = live18kToman ?? 26_000_000;
  const activeProfile =
    s.onlinePlatforms.find((p) => p.id === s.selectedPlatformId) ?? s.onlinePlatforms[0];

  const weightNum = parseCleanNum(s.jewelryWeightGrams);
  const customResaleNum = parseCleanNum(s.customResaleRate);

  const jewelryInput = useMemo(
    () => ({
      productName: s.jewelryProductName,
      grossWeightGrams: weightNum,
      stoneOrNonGoldWeightGrams: parseCleanNum(s.stoneWeightGrams),
      karat: parseCleanNum(s.karat) || 750,
      market18kPriceToman: marketPx,
      makingChargeMode: s.makingChargeMode,
      makingChargeValue: parseCleanNum(s.makingChargeValue),
      sellerProfitPct: parseCleanNum(s.sellerProfitPct),
      sellerProfitBase: s.sellerProfitBase,
      taxPct: parseCleanNum(s.taxPct),
      taxBase: s.taxBase,
      otherBuyCostToman: parseCleanNum(s.otherBuyCostToman),
      discountToman: parseCleanNum(s.discountToman),
      customResale18kPriceToman: customResaleNum > 0 ? customResaleNum : null,
      resaleDeductionPct: parseCleanNum(s.resaleDeductionPct),
      resaleFixedDeductionToman: parseCleanNum(s.resaleFixedDeduction)
    }),
    [s, weightNum, marketPx, customResaleNum]
  );

  const onlineInput = useMemo(
    () => ({
      weightGrams: weightNum,
      holdingMonths: parseCleanNum(s.holdingMonths),
      includePhysicalDelivery: s.physicalDelivery,
      profile: activeProfile,
      fallbackMarketPriceToman: marketPx,
      liveRows
    }),
    [weightNum, s.holdingMonths, s.physicalDelivery, activeProfile, marketPx, liveRows]
  );

  const cmp = useMemo(
    () => compareOnlineAndJewelry(onlineInput, jewelryInput),
    [onlineInput, jewelryInput]
  );
  const j = cmp.jewelry;

  const scenarioPrices = useMemo(() => {
    const defaults = [
      Math.round(marketPx * 1.15),
      Math.round(j.breakEven18kPriceToman || marketPx * 1.25),
      Math.round(marketPx * 1.4),
      Math.round(marketPx * 0.9)
    ].filter((x) => x > 0);
    return [...new Set([...defaults, ...s.futureScenarioPrices])].sort((a, b) => a - b);
  }, [marketPx, j.breakEven18kPriceToman, s.futureScenarioPrices]);

  const scenarioRows = useMemo(
    () => evaluateFutureGoldScenarios(scenarioPrices, marketPx, onlineInput, jewelryInput),
    [scenarioPrices, marketPx, onlineInput, jewelryInput]
  );

  return (
    <div className="space-y-5">
      {/* محاسبه‌گر خرید و فروش مجدد طلای زینتی */}
      <Surface className="overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-l from-accent via-indigo-500/70 to-transparent" aria-hidden />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <JewelryEmblem />
              <div>
                <h3 className="text-sm font-extrabold text-ink">محاسبه خرید و فروش مجدد طلای زینتی</h3>
                <p className="text-2xs text-muted">نرخ پایهٔ هر گرم ۱۸ عیار: {fmtToman(marketPx)}</p>
              </div>
            </div>
          </div>

          {/* سناریوهای سریع طلای زینتی */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-subtle">
              <Sparkles aria-hidden className="h-3 w-3 text-accent" />
              نمونهٔ سریع:
            </span>
            {JEWELRY_PRESETS.map((pr) => (
              <button
                key={pr.label}
                type="button"
                onClick={() =>
                  setS((prev) => ({
                    ...prev,
                    jewelryProductName: pr.name,
                    jewelryWeightGrams: pr.weight,
                    makingChargeMode: 'percent',
                    makingChargeValue: pr.making,
                    sellerProfitPct: pr.profit
                  }))
                }
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xs font-bold transition-all',
                  s.jewelryProductName === pr.name && s.jewelryWeightGrams === pr.weight
                    ? 'border-accent bg-accent/12 text-accent'
                    : 'border-divider bg-surface-2/70 text-muted hover:text-ink'
                )}
              >
                {pr.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="نوع مصنوع (حلقه، دستبند...)">
              <Input
                value={s.jewelryProductName}
                onChange={(e) => set('jewelryProductName', e.target.value)}
              />
            </Field>
            <Field label="وزن کل محصول (گرم)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.jewelryWeightGrams}
                onChange={(e) => set('jewelryWeightGrams', e.target.value)}
                suffix="گرم"
              />
            </Field>
            <Field label="اجرت ساخت">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.makingChargeValue}
                onChange={(e) => set('makingChargeValue', e.target.value)}
                suffix={s.makingChargeMode === 'percent' ? '٪' : 'تومان'}
              />
            </Field>
            <Field label="سود فروشنده (٪)">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.sellerProfitPct}
                onChange={(e) => set('sellerProfitPct', e.target.value)}
                suffix="٪"
              />
            </Field>
          </div>

          {j.valid && (
            <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
              <div className="rounded-xl border border-divider border-s-4 border-s-accent bg-card p-3">
                <p className="text-2xs font-semibold text-muted">ارزش طلای خام داخل محصول</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.rawGoldValueToman)}</p>
                <p className="text-2xs text-subtle">وزن خالص طلا: {toFaDigits(j.netGoldWeightGrams)} گرم</p>
              </div>
              <div className="rounded-xl border border-warn/40 border-s-4 border-s-warn bg-warn/[0.05] p-3">
                <p className="text-2xs font-bold text-warn">مبلغ کل فاکتور خرید</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.totalBuyInvoiceToman)}</p>
                <p className="text-2xs text-subtle">
                  اجرت+سود+مالیات: {fmtToman(j.totalOverheadToman)} ({fmtPct(j.overheadPctOfRaw, 1, false)})
                </p>
              </div>
              <div className="rounded-xl border border-divider border-s-4 border-s-loss bg-card p-3">
                <p className="text-2xs font-semibold text-muted">مبلغ دریافتی فروش مجدد امروز</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.resaleNetProceedsToman)}</p>
                <p className="text-2xs font-semibold text-negative">
                  اختلاف با خرید: {fmtToman(j.netProfitOrLossToman, true)} ({fmtPct(j.roiPct, 1)})
                </p>
              </div>
              <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
                <p className="text-2xs font-bold text-accent">قیمت سربه‌سر هر گرم ۱۸ عیار</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.breakEven18kPriceToman)}</p>
                <p className="text-2xs text-subtle">رشد لازم بازار: {fmtPct(j.requiredMarketGrowthPctToBreakEven, 1)}</p>
              </div>
            </div>
          )}

          <Disclosure summary="جزئیات کامل فاکتور طلافروشی و تنظیمات عیار، مالیات و بازخرید">
            <div className="space-y-4 pt-2">
              {j.valid && (
                <KeyValueList
                  dense
                  rows={[
                    { label: 'ارزش طلای خام', value: fmtToman(j.rawGoldValueToman) },
                    { label: 'اجرت ساخت', value: fmtToman(j.makingChargeToman) },
                    { label: `سود فروشنده (${toFaDigits(s.sellerProfitPct)}٪)`, value: fmtToman(j.sellerProfitToman) },
                    { label: 'مبلغ مشمول مالیات (اجرت + سود)', value: fmtToman(j.taxableAmountToman) },
                    { label: `مالیات بر ارزش افزوده (${toFaDigits(s.taxPct)}٪)`, value: fmtToman(j.taxToman) },
                    { label: 'کسورات فروش مجدد و سنگ', value: fmtToman(j.resaleDeductionsToman) }
                  ]}
                />
              )}

              <div className="grid gap-3 border-t border-divider pt-3 sm:grid-cols-4">
                <Field label="روش محاسبه اجرت">
                  <select
                    value={s.makingChargeMode}
                    onChange={(e) => set('makingChargeMode', e.target.value as MakingChargeMode)}
                    className="h-10 w-full rounded-control border border-divider bg-card px-3 text-xs font-semibold text-ink"
                  >
                    <option value="percent">درصدی از طلای خام</option>
                    <option value="per_gram">مبلغ ثابت هر گرم (تومان)</option>
                    <option value="fixed_total">مبلغ ثابت کل محصول (تومان)</option>
                  </select>
                </Field>
                <Field label="عیار طلا (۷۵۰ = ۱۸ عیار)">
                  <Input dir="ltr" inputMode="decimal" value={s.karat} onChange={(e) => set('karat', e.target.value)} />
                </Field>
                <Field label="وزن نگین / غیرطلا (گرم)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={s.stoneWeightGrams}
                    onChange={(e) => set('stoneWeightGrams', e.target.value)}
                  />
                </Field>
                <Field label="نرخ مالیات (٪)">
                  <Input dir="ltr" inputMode="decimal" value={s.taxPct} onChange={(e) => set('taxPct', e.target.value)} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="مبنای محاسبه مالیات">
                  <select
                    value={s.taxBase}
                    onChange={(e) => set('taxBase', e.target.value as JewelryTaxBase)}
                    className="h-10 w-full rounded-control border border-divider bg-card px-3 text-xs font-semibold text-ink"
                  >
                    <option value="making_plus_profit">فقط اجرت + سود فروشنده (قانونی)</option>
                    <option value="total_invoice">کل مبلغ فاکتور</option>
                  </select>
                </Field>
                <Field label="کسورات بازخرید طلافروش (٪)">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={s.resaleDeductionPct}
                    onChange={(e) => set('resaleDeductionPct', e.target.value)}
                  />
                </Field>
                <Field label="تخفیف خرید (تومان)">
                  <Input dir="ltr" inputMode="numeric" value={s.discountToman} onChange={(e) => set('discountToman', e.target.value)} />
                </Field>
              </div>
            </div>
          </Disclosure>
        </div>
      </Surface>

      {/* داشبورد مقایسه طلای آنلاین با طلای زینتی با لوگوهای طرفین */}
      {cmp.online.valid && cmp.jewelry.valid && (
        <Surface className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center -space-x-2 space-x-reverse">
                <GoldPlatformLogo platformId={activeProfile.id} name={activeProfile.name} size="sm" className="ring-2 ring-card" />
                <JewelryEmblem size="sm" className="ring-2 ring-card" />
              </div>
              <h3 className="text-sm font-extrabold text-ink">
                مقایسه سرمایه‌گذاری در طلا ({toFaDigits(cmp.weightGrams)} گرم · عیار ۷۵۰)
              </h3>
            </div>
            <Badge tone="gain">
              برتر از نظر بازده مالی: {cmp.betterRoiMethod === 'online' ? `طلای آنلاین (${activeProfile.name})` : 'طلای زینتی'}
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full text-xs">
              <thead>
                <tr>
                  <th>شاخص مقایسه</th>
                  <th className="col-num">طلای آنلاین ({activeProfile.name})</th>
                  <th className="col-num">طلای زینتی ({s.jewelryProductName})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>ارزش طلای خام</td>
                  <td className="col-num whitespace-nowrap">{fmtToman(cmp.online.baseGoldValueToman)}</td>
                  <td className="col-num whitespace-nowrap">{fmtToman(cmp.jewelry.rawGoldValueToman)}</td>
                </tr>
                <tr>
                  <td>مجموع اجرت، سود، مالیات و کارمزد خرید</td>
                  <td className="col-num whitespace-nowrap font-semibold text-positive">{fmtToman(cmp.online.buyFeeToman + cmp.online.extraBuyCostsToman)}</td>
                  <td className="col-num whitespace-nowrap font-semibold text-warn">{fmtToman(cmp.jewelry.totalOverheadToman)}</td>
                </tr>
                <tr>
                  <td className="font-bold text-ink">مبلغ کل پرداختی در زمان خرید</td>
                  <td className="col-num whitespace-nowrap font-bold">{fmtToman(cmp.online.totalBuyCostToman)}</td>
                  <td className="col-num whitespace-nowrap font-bold">{fmtToman(cmp.jewelry.totalBuyInvoiceToman)}</td>
                </tr>
                <tr>
                  <td className="font-bold text-ink">مبلغ خالص دریافتی هنگام فروش مجدد</td>
                  <td className="col-num whitespace-nowrap font-bold">{fmtToman(cmp.online.netSellProceedsToman)}</td>
                  <td className="col-num whitespace-nowrap font-bold">{fmtToman(cmp.jewelry.resaleNetProceedsToman)}</td>
                </tr>
                <tr>
                  <td>سود یا زیان خالص در قیمت امروز</td>
                  <td className={cn('col-num whitespace-nowrap font-bold', cmp.online.netProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(cmp.online.netProfitToman, true)} ({fmtPct(cmp.online.roiPct, 1)})
                  </td>
                  <td className={cn('col-num whitespace-nowrap font-bold', cmp.jewelry.netProfitOrLossToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(cmp.jewelry.netProfitOrLossToman, true)} ({fmtPct(cmp.jewelry.roiPct, 1)})
                  </td>
                </tr>
                <tr>
                  <td>رشد لازم قیمت طلا برای رسیدن به سربه‌سر</td>
                  <td className="col-num whitespace-nowrap font-semibold text-positive">{fmtPct(cmp.onlineRequiredGrowthPctToBreakEven, 1)}</td>
                  <td className="col-num whitespace-nowrap font-semibold text-warn">{fmtPct(cmp.jewelryRequiredGrowthPctToBreakEven, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="rounded-xl bg-surface-2/60 px-3 py-2 text-2xs leading-5 text-muted">
            اختلاف هزینهٔ خرید اولیه: <b className="text-ink">{fmtToman(cmp.initialCostDiffToman)}</b> به نفع{' '}
            {cmp.lowerInitialCostMethod === 'online' ? 'طلای آنلاین' : 'طلای زینتی'} · این مقایسه صرفاً مالی است و ارزش مصرفی و زینتی مصنوعات طلا جداگانه است.
          </p>
        </Surface>
      )}

      {/* سناریوسازی قیمت آینده طلا */}
      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-ink">سناریوی قیمت آینده طلا (هر گرم ۱۸ عیار)</h3>
            <p className="text-2xs text-subtle">بررسی ارزش فروش و سود خالص هر دو روش در قیمت‌های فرضی آینده کاربر</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={scenarioInput}
              onChange={(e) => setScenarioInput(e.target.value)}
              placeholder="قیمت فرضی (تومان)"
              className="w-40"
            />
            <Button
              size="sm"
              variant="outline"
              icon={<Plus />}
              onClick={() => {
                const v = parseCleanNum(scenarioInput);
                if (v > 0) {
                  set('futureScenarioPrices', [...new Set([...s.futureScenarioPrices, v])]);
                  setScenarioInput('');
                }
              }}
            >
              افزودن
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full text-xs">
            <thead>
              <tr>
                <th>قیمت فرضی آینده (هر گرم)</th>
                <th className="col-num">تغییر نسبت به امروز</th>
                <th className="col-num">سود خالص طلای آنلاین</th>
                <th className="col-num">بازده آنلاین</th>
                <th className="col-num">سود خالص طلای زینتی</th>
                <th className="col-num">بازده زینتی</th>
              </tr>
            </thead>
            <tbody>
              {scenarioRows.map((r) => (
                <tr key={r.future18kPriceToman}>
                  <td className="whitespace-nowrap font-bold text-ink">{fmtToman(r.future18kPriceToman)}</td>
                  <td className={cn('col-num whitespace-nowrap', r.changeVsCurrentPct >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtPct(r.changeVsCurrentPct, 1)}
                  </td>
                  <td className={cn('col-num whitespace-nowrap font-bold', r.onlineNetProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(r.onlineNetProfitToman, true)}
                  </td>
                  <td className="col-num whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 font-extrabold',
                        r.onlineRoiPct >= 0 ? 'bg-gain/12 text-positive' : 'bg-negative/12 text-negative'
                      )}
                    >
                      {fmtPct(r.onlineRoiPct, 1)}
                    </span>
                  </td>
                  <td className={cn('col-num whitespace-nowrap font-bold', r.jewelryNetProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(r.jewelryNetProfitToman, true)}
                  </td>
                  <td className="col-num whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 font-extrabold',
                        r.jewelryRoiPct >= 0 ? 'bg-gain/12 text-positive' : 'bg-negative/12 text-negative'
                      )}
                    >
                      {fmtPct(r.jewelryRoiPct, 1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}

/* ============================================================
   بخش ۴: داشبورد و ماشین‌حساب صندوق‌های طلای بورسی
   ============================================================ */

function GoldEtfSection({
  s,
  set,
  setS
}: {
  s: SavedGoldState;
  set: <K extends keyof SavedGoldState>(k: K, v: SavedGoldState[K]) => void;
  setS: React.Dispatch<React.SetStateAction<SavedGoldState>>;
}) {
  const updateEtfEntry = (id: string, patch: Partial<EtfUserEntry>) => {
    setS((prev) => ({
      ...prev,
      etfEntries: {
        ...prev.etfEntries,
        [id]: { ...(prev.etfEntries[id] ?? { currentPrice: '', futurePrice: '' }), ...patch }
      }
    }));
  };

  const cards = useMemo(
    () =>
      GOLD_ETF_PRESETS.map((etf) => {
        const entry = s.etfEntries[etf.id] ?? { currentPrice: '', futurePrice: '' };
        return evaluateGoldEtfCard(
          etf,
          parseCleanNum(entry.currentPrice) || null,
          parseCleanNum(entry.futurePrice) || null
        );
      }),
    [s.etfEntries]
  );

  const calc = useMemo(
    () =>
      calculateGoldEtfInvestment({
        etfId: s.selectedEtfId,
        mode: s.etfCalcMode,
        investmentAmountToman: parseCleanNum(s.etfAmountToman),
        units: parseCleanNum(s.etfUnits),
        integerUnitsOnly: s.etfIntegerOnly,
        buyPricePerUnitToman: parseCleanNum(s.etfBuyPrice),
        currentPricePerUnitToman: parseCleanNum(s.etfCurrentPrice) || null,
        futurePricePerUnitToman: parseCleanNum(s.etfFuturePrice)
      }),
    [
      s.selectedEtfId,
      s.etfCalcMode,
      s.etfAmountToman,
      s.etfUnits,
      s.etfIntegerOnly,
      s.etfBuyPrice,
      s.etfCurrentPrice,
      s.etfFuturePrice
    ]
  );

  const selectedEtf = GOLD_ETF_PRESETS.find((e) => e.id === s.selectedEtfId) ?? GOLD_ETF_PRESETS[0];

  return (
    <div className="space-y-5">
      {/* داشبورد ۶ صندوق طلای بورسی لوگودار با قیمت مرجع ثابت ۱۰ مرداد ۱۴۰۵ */}
      <Surface className="overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-l from-accent via-accent/65 to-gold/55" aria-hidden />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GoldSparkIcon />
              <h3 className="text-sm font-extrabold text-ink">صندوق‌های طلای بورسی</h3>
            </div>
            <Badge tone="info">مرجع ثابت اسنپ‌شات: {GOLD_ETF_SNAPSHOT_DATE_FA}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => {
              const selected = s.selectedEtfId === c.etf.id;
              return (
                <div
                  key={c.etf.id}
                  className={cn(
                    'space-y-3 rounded-2xl border p-3.5 transition-all',
                    selected
                      ? 'border-accent/60 bg-accent/[0.05] shadow-xs ring-1 ring-accent/20'
                      : 'border-divider bg-card hover:border-divider-strong'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <GoldEtfLogo etfId={c.etf.id} tickerFa={c.etf.tickerFa} size="md" />
                      <div>
                        <p className="text-sm font-extrabold text-ink">{c.etf.nameFa}</p>
                        <p className="text-2xs text-muted">نماد بورسی: {c.etf.tickerFa}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        set('selectedEtfId', c.etf.id);
                        set('etfBuyPrice', String(c.currentPriceToman ?? c.etf.snapshotPriceToman));
                        if (c.currentPriceToman) set('etfCurrentPrice', String(c.currentPriceToman));
                        if (c.futurePriceToman) set('etfFuturePrice', String(c.futurePriceToman));
                      }}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-2xs font-bold transition-colors',
                        selected
                          ? 'bg-accent text-on-accent'
                          : 'bg-surface-2 text-accent hover:bg-accent/15'
                      )}
                    >
                      {selected ? 'انتخاب‌شده' : 'انتخاب در ماشین‌حساب'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-surface-2/65 px-3 py-2 text-xs">
                    <span className="text-muted">مرجع ({GOLD_ETF_SNAPSHOT_DATE_FA}):</span>
                    <b className="text-ink">{fmtToman(c.etf.snapshotPriceToman)}</b>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="قیمت فعلی (تومان)">
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        value={s.etfEntries[c.etf.id]?.currentPrice ?? ''}
                        onChange={(e) => updateEtfEntry(c.etf.id, { currentPrice: e.target.value })}
                        placeholder="ورود دستی"
                      />
                    </Field>
                    <Field label="قیمت آینده فرضی">
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        value={s.etfEntries[c.etf.id]?.futurePrice ?? ''}
                        onChange={(e) => updateEtfEntry(c.etf.id, { futurePrice: e.target.value })}
                        placeholder="سناریو"
                      />
                    </Field>
                  </div>

                  <div className="space-y-1 border-t border-divider pt-2 text-2xs">
                    <div className="flex justify-between">
                      <span className="text-muted">تغییر فعلی نسبت به مرجع:</span>
                      {c.changeCurrentVsSnapshotPct !== null ? (
                        <b className={c.changeCurrentVsSnapshotPct >= 0 ? 'text-positive' : 'text-negative'}>
                          {fmtPct(c.changeCurrentVsSnapshotPct)} ({fmtToman(c.diffCurrentVsSnapshotToman, true)})
                        </b>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">تغییر سناریوی آینده نسبت به مرجع:</span>
                      {c.changeFutureVsSnapshotPct !== null ? (
                        <b className={c.changeFutureVsSnapshotPct >= 0 ? 'text-positive' : 'text-negative'}>
                          {fmtPct(c.changeFutureVsSnapshotPct)} ({fmtToman(c.diffFutureVsSnapshotToman, true)})
                        </b>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Surface>

      {/* ماشین‌حساب سرمایه‌گذاری صندوق طلا */}
      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <GoldEtfLogo etfId={selectedEtf.id} tickerFa={selectedEtf.tickerFa} size="sm" />
            <div>
              <h3 className="text-sm font-extrabold text-ink">ماشین‌حساب سرمایه‌گذاری صندوق طلا</h3>
              <p className="text-2xs text-muted">با احتساب کارمزد خرید و فروش بورسی (۰.۱۲٪ هر طرف)</p>
            </div>
          </div>
          <SegmentedControl<'by_amount' | 'by_units'>
            label="روش محاسبه"
            size="sm"
            value={s.etfCalcMode}
            onChange={(m) => set('etfCalcMode', m)}
            options={[
              { value: 'by_amount', label: 'بر اساس مبلغ سرمایه‌گذاری' },
              { value: 'by_units', label: 'بر اساس تعداد واحد' }
            ]}
          />
        </div>

        {s.etfCalcMode === 'by_amount' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-subtle">
              <Sparkles aria-hidden className="h-3 w-3 text-accent" />
              مبلغ سریع:
            </span>
            {QUICK_ETF_AMOUNTS.map((item) => {
              const active = parseCleanNum(s.etfAmountToman) === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => set('etfAmountToman', String(item.value))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-bold transition-all',
                    active
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-divider bg-surface-2/70 text-muted hover:text-ink'
                  )}
                >
                  {item.label} تومان
                </button>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="انتخاب صندوق طلا">
            <select
              value={s.selectedEtfId}
              onChange={(e) => {
                const id = e.target.value;
                const preset = GOLD_ETF_PRESETS.find((x) => x.id === id);
                set('selectedEtfId', id);
                if (preset) set('etfBuyPrice', String(preset.snapshotPriceToman));
              }}
              className="h-10 w-full rounded-control border border-divider bg-card px-3 text-xs font-semibold text-ink"
            >
              {GOLD_ETF_PRESETS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nameFa} ({e.tickerFa})
                </option>
              ))}
            </select>
          </Field>

          {s.etfCalcMode === 'by_amount' ? (
            <Field label="مبلغ سرمایه‌گذاری اولیه (تومان)">
              <Input
                dir="ltr"
                inputMode="numeric"
                value={s.etfAmountToman}
                onChange={(e) => set('etfAmountToman', e.target.value)}
              />
            </Field>
          ) : (
            <Field label="تعداد واحد خریداری‌شده">
              <Input
                dir="ltr"
                inputMode="numeric"
                value={s.etfUnits}
                onChange={(e) => set('etfUnits', e.target.value)}
              />
            </Field>
          )}

          <Field label="قیمت خرید هر واحد (تومان)">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={s.etfBuyPrice}
              onChange={(e) => set('etfBuyPrice', e.target.value)}
            />
          </Field>

          <Field label="قیمت فعلی هر واحد (اختیاری)">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={s.etfCurrentPrice}
              onChange={(e) => set('etfCurrentPrice', e.target.value)}
              placeholder="ورود دستی"
            />
          </Field>

          <Field label="قیمت آینده هر واحد (تومان)">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={s.etfFuturePrice}
              onChange={(e) => set('etfFuturePrice', e.target.value)}
            />
          </Field>
        </div>

        {calc.valid && (
          <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
            <div className="rounded-xl border border-divider border-s-4 border-s-accent bg-card p-3">
              <p className="text-2xs font-semibold text-muted">تعداد واحد و هزینه واقعی ورود</p>
              <p className="mt-1 text-sm font-extrabold text-ink">
                {toFaDigits(calc.unitsPurchased.toLocaleString('en-US'))} واحد
              </p>
              <p className="text-2xs text-subtle">ورود: {fmtToman(calc.totalEntryCostToman)}</p>
            </div>
            <div className="rounded-xl border border-divider border-s-4 border-s-gain bg-card p-3">
              <p className="text-2xs font-semibold text-muted">مبلغ نهایی دریافتی پس از فروش</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.netFinalProceedsToman)}</p>
              <p className="text-2xs text-subtle">هزینه کارمزد معاملات: {fmtToman(calc.totalTradingFeesToman)}</p>
            </div>
            <div
              className={cn(
                'rounded-xl border border-divider border-s-4 bg-card p-3',
                calc.netProfitOrLossToman >= 0 ? 'border-s-gain' : 'border-s-loss'
              )}
            >
              <p className="text-2xs font-semibold text-muted">سود یا زیان خالص و بازدهی</p>
              <p
                className={cn(
                  'mt-1 text-sm font-extrabold',
                  calc.netProfitOrLossToman >= 0 ? 'text-positive' : 'text-negative'
                )}
              >
                {fmtToman(calc.netProfitOrLossToman, true)} ({fmtPct(calc.roiPct)})
              </p>
              {calc.leftoverCashToman > 0 && (
                <p className="text-2xs text-subtle">باقیمانده نقدی: {fmtToman(calc.leftoverCashToman)}</p>
              )}
            </div>
            <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
              <p className="text-2xs font-bold text-accent">قیمت سربه‌سر هر واحد</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.breakEvenUnitPriceToman)}</p>
              <p className="text-2xs text-subtle">
                نسبت به مرجع {GOLD_ETF_SNAPSHOT_DATE_FA}: {fmtPct(calc.futureChangeVsSnapshotPct, 1)}
              </p>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}

/* ============================================================
   کامپوننت‌های ارزش‌گذاری، پلتفرم‌ها، سکه‌ها و تجزیه رشد
   ============================================================ */

const VALUE_FA: Record<Valuation, { title: (p: number) => string; border: string; bar: string; badge: 'gain' | 'warn' | 'neutral' }> = {
  cheap: {
    title: (p) => `حباب طلای ۱۸ عیار ${pctRatio(p)} · پایین‌تر از محدودهٔ معمول`,
    border: 'border-gain/45',
    bar: 'from-gain via-emerald-400 to-transparent',
    badge: 'gain'
  },
  rich: {
    title: (p) => `حباب طلای ۱۸ عیار ${pctRatio(p)} · بالاتر از محدودهٔ معمول`,
    border: 'border-warn/45',
    bar: 'from-warn via-warn/50 to-transparent',
    badge: 'warn'
  },
  fair: {
    title: (p) => `حباب طلای ۱۸ عیار ${pctRatio(p)} · در محدودهٔ متعادل بازار`,
    border: 'border-divider',
    bar: 'from-accent via-accent/60 to-transparent',
    badge: 'neutral'
  },
  unknown: {
    title: () => 'حباب در انتظار دریافت نرخ انس و دلار',
    border: 'border-divider',
    bar: 'from-divider to-transparent',
    badge: 'neutral'
  }
};

function ValueCard({ d }: { d: GoldPayload }) {
  const rows = d.rows ?? [];
  const v = valuation(d.premium, rows, d.stats, d.dollarSource);
  const t = VALUE_FA[v.state];
  return (
    <Surface className={cn('overflow-hidden border', t.border)}>
      <div className={cn('h-[3px] w-full bg-gradient-to-l', t.bar)} aria-hidden />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-ink">{t.title(d.premium ?? 0)}</h3>
          {d.dollarSource === 'usdt' && (
            <Badge tone="warn">مبنای محاسبه: تتر</Badge>
          )}
        </div>

        <dl className="mt-3.5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3">
            <dt className="flex items-center gap-1.5 text-2xs font-semibold text-muted">
              <Scale aria-hidden className="h-3.5 w-3.5 text-accent" />
              ارزش ذاتی هر گرم ۱۸ عیار
            </dt>
            <dd className="mt-1.5 text-base font-extrabold text-ink sm:text-lg">{d.intrinsic ? million(d.intrinsic) : '—'}</dd>
            <dd className="text-2xs text-subtle">تومان (انس × دلار)</dd>
          </div>
          <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3">
            <dt className="flex items-center gap-1.5 text-2xs font-semibold text-muted">
              <Globe aria-hidden className="h-3.5 w-3.5 text-accent" />
              انس جهانی طلا
            </dt>
            <dd className="mt-1.5 text-base font-extrabold text-ink sm:text-lg">
              {d.ounceUsd ? `${toFaDigits(d.ounceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 }))} دلار` : '—'}
            </dd>
            <dd className="text-2xs text-subtle">هر انس جهانی</dd>
          </div>
          <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3">
            <dt className="flex items-center gap-1.5 text-2xs font-semibold text-muted">
              <Banknote aria-hidden className="h-3.5 w-3.5 text-positive" />
              {d.dollarSource === 'free' ? 'دلار آزاد' : 'دلار تتر'}
            </dt>
            <dd className="mt-1.5 text-base font-extrabold text-ink sm:text-lg">
              {d.dollarToman ? fmtToman(d.dollarToman) : '—'}
            </dd>
            <dd className="text-2xs text-subtle">نرخ لحظه‌ای</dd>
          </div>
        </dl>

        {d.premium !== null && (
          <PremiumBar now={d.premium} stats={d.dollarSource === 'free' ? d.stats : null} low={v.low} high={v.high} />
        )}
      </div>
    </Surface>
  );
}

function PremiumBar({
  now,
  stats,
  low,
  high,
  compact = false
}: {
  now: number;
  stats: PremiumStats | null;
  low: number;
  high: number;
  compact?: boolean;
}) {
  const span = Math.max(0.05, Math.abs(now), Math.abs(low), Math.abs(high)) * 1.15;
  const x = (v: number) => `${((v + span) / (2 * span)) * 100}%`;
  return (
    <div className={compact ? 'mt-2.5' : 'mt-3.5 border-t border-divider pt-3'}>
      {!compact && (
        <p className="text-2xs font-semibold text-muted">
          {stats
            ? `بازهٔ متعادل تاریخی (از ${year(stats.since)}): بین ${pctRatio(stats.p10)} تا ${pctRatio(stats.p90)} · میانه ${pctRatio(stats.p50)}`
            : `محدودهٔ هزینهٔ رفت‌وبرگشت: ${LRI}±${pctRatio(high, 1, false)}${PDI}`}
        </p>
      )}
      <div dir="ltr" className="relative mt-2.5 h-2.5 rounded-full bg-surface-2" role="img" aria-label={`حباب ${pctRatio(now)}`}>
        <span
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-gain/45 via-accent/45 to-warn/50"
          style={{ left: x(low), right: `calc(100% - ${x(high)})` }}
          aria-hidden
        />
        <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink/40" style={{ left: x(stats?.p50 ?? 0) }} aria-hidden />
        <span
          className="absolute -top-1 h-4.5 w-4.5 -translate-x-1/2 rounded-full border-2 border-card bg-accent shadow-sm ring-2 ring-accent/30"
          style={{ left: x(now) }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function Platforms({ d }: { d: GoldPayload }) {
  const rows = d.rows ?? [];
  const bestSell = rows.reduce<PlatformRow | null>((b, r) => (!b || r.sell > b.sell ? r : b), null);
  const vsBazaar = platformsVsBazaar(rows, d.bazaar);
  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GoldSparkIcon />
          <h3 className="text-sm font-extrabold text-ink">نرخ زنده پلتفرم‌های آنلاین طلای ۱۸ عیار</h3>
        </div>
        {d.bazaar && vsBazaar !== null && (
          <Badge tone={vsBazaar < 0 ? 'gain' : 'neutral'}>
            پلتفرم‌ها {pctRatio(Math.abs(vsBazaar), 1, false)} {vsBazaar < 0 ? 'ارزان‌تر' : 'گران‌تر'} از بازار
          </Badge>
        )}
      </div>
      <ul className="mt-3 divide-y divide-divider">
        {rows.map((r, i) => {
          const meta = PLATFORM_FA[r.platform] ?? { name: String(r.platform), url: '#' };
          const isBestBuy = i === 0;
          const isBestSell = bestSell?.platform === r.platform && rows.length > 1;
          return (
            <li
              key={r.platform}
              className={cn(
                'flex items-center gap-3 py-3 transition-colors',
                isBestBuy && 'rounded-xl bg-gain/[0.04] px-2.5 -mx-2.5'
              )}
            >
              <GoldPlatformLogo platformId={String(r.platform)} name={meta.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-extrabold text-ink">
                  {meta.name}
                  {isBestBuy && <Badge tone="gain">ارزان‌ترین خرید</Badge>}
                  {isBestSell && <Badge tone="info">بهترین فروش</Badge>}
                </p>
                <p className="mt-0.5 text-2xs text-muted">
                  خرید <b className="text-ink">{fmtToman(r.buy)}</b> · فروش <b className="text-ink">{fmtToman(r.sell)}</b>
                  {r.buy !== r.sell && ` · اسپرد ${pctRatio(r.spread, 1, false)}`}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p
                  className={cn(
                    'text-sm font-extrabold',
                    Number.isFinite(r.premium)
                      ? r.premium <= 0.01
                        ? 'text-positive'
                        : r.premium >= 0.03
                          ? 'text-warn'
                          : 'text-ink'
                      : 'text-subtle'
                  )}
                >
                  {Number.isFinite(r.premium) ? pctRatio(r.premium) : '—'}
                </p>
                <p className="text-2xs text-subtle">حباب</p>
              </div>
              <a
                href={meta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-divider bg-card text-subtle transition-colors hover:border-accent/45 hover:text-accent"
                aria-label={`باز کردن ${meta.name}`}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

const POSITION_FA = { low: 'پایین‌تر از معمول', mid: 'متعادل', high: 'بالاتر از معمول' } as const;

function Coins({ coins }: { coins: CoinRow[] }) {
  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <GoldSparkIcon />
        <h3 className="text-sm font-extrabold text-ink">قیمت و حباب سکه</h3>
      </div>
      <ul className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {coins.map((c) => {
          const pos = c.stats ? percentileOf(c.premium, c.stats) : null;
          const label = COIN_FA[c.coin] ?? String(c.coin);
          const bubbleTone = c.premium >= 0.2 ? 'warn' : c.premium <= 0.08 ? 'gain' : 'neutral';
          return (
            <li
              key={c.coin}
              className="rounded-2xl border border-divider bg-surface-2/45 p-3.5"
            >
              <div className="flex items-center gap-3">
                <IranCoinLogo coin={String(c.coin)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold text-ink">{label}</p>
                    <Badge tone={bubbleTone}>حباب {pctRatio(c.premium)}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs font-bold text-ink/90">{fmtToman(c.price)}</p>
                </div>
              </div>
              {c.stats && <PremiumBar now={c.premium} stats={c.stats} low={c.stats.p10} high={c.stats.p90} compact />}
              {c.stats && pos && (
                <p className="mt-2 text-2xs text-subtle">
                  وضعیت: <b className="text-ink/80">{POSITION_FA[pos]}</b> · میانه تاریخی: {pctRatio(c.stats.p50)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

function Growth({ rows }: { rows: Decomposition[] }) {
  const maxAbs = Math.max(
    0.01,
    ...rows.flatMap((r) => [Math.abs(r.iran), Math.abs(r.ounce), Math.abs(r.dollar), Math.abs(r.premium)])
  );
  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <BarChart3 aria-hidden className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-extrabold text-ink">تفکیک عوامل تغییر قیمت طلای ۱۸ عیار</h3>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>بازه</th>
              <th className="col-num">طلای ۱۸ عیار</th>
              <th className="col-num">سهم انس جهانی</th>
              <th className="col-num">سهم دلار آزاد</th>
              <th className="col-num">سهم تغییر حباب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.days}>
                <td className="font-bold text-ink">{toFaDigits(r.days)} روز</td>
                {[r.iran, r.ounce, r.dollar, r.premium].map((v, i) => {
                  const pctWidth = Math.min(100, Math.round((Math.abs(v) / maxAbs) * 100));
                  return (
                    <td key={i} className="col-num whitespace-nowrap">
                      <span
                        className={cn(
                          'block',
                          i === 0 && 'font-extrabold',
                          v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : 'text-muted'
                        )}
                      >
                        {Number.isFinite(v) ? pctRatio(v) : '—'}
                      </span>
                      {Number.isFinite(v) && (
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-2">
                          <span
                            className={cn('block h-full rounded-full', v >= 0 ? 'bg-gain' : 'bg-loss')}
                            style={{ width: `${Math.max(6, pctWidth)}%` }}
                          />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
