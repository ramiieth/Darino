/**
 * داشبورد یکپارچه «طلای ایران»
 *
 * شامل ۵ بخش تمیز و مرتبط به هم (با استفاده از نرخ زنده و ذخیره‌شده مشترک):
 * ۱. بازار و روند (قیمت روز طلای ۱۸ عیار، پلتفرم‌ها، سکه‌ها، تحلیل تاریخی ۷/۳۰/۶۰ روزه + نمودار تعاملی، اسنپ‌شات مستقل)
 * ۲. طلای آنلاین (ملی‌گلد و پلتفرم‌ها + افزودن پلتفرم سفارشی، محاسبه خرید، فروش، هزینه نگهداری و سربه‌سر)
 * ۳. طلای زینتی و مقایسه (محاسبه فاکتور خرید مصنوعات، فروش مجدد بدون اجرت/مالیات/سنگ، مقایسه با طلای آنلاین و سناریوی آینده)
 * ۴. صندوق‌های طلای بورسی (۶ صندوق با مرجع ثابت ۱۰ مرداد ۱۴۰۵ + ماشین‌حساب سرمایه‌گذاری با کارمزد ۰.۱۲٪)
 * ۵. دلار و تتر (تحلیل تاریخی دلار آزاد و تتر و مقایسه بازده با طلا)
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
  evaluateFxHistorical,
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

const STORE_KEY = 'darino:iran-gold-suite:v1';
const LAST_PAYLOAD_KEY = 'darino:iran-gold-last-payload:v1';
const HISTORY_CACHE_KEY = 'darino:iran-gold-history18k:v1';

type SectionTab = 'market' | 'online' | 'jewelry' | 'etf' | 'fx';

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
  /* تحلیل تاریخی دلار و تتر */
  fxRefDateLabel: string;
  fxRefDollar: string;
  fxRefUsdt: string;
  fxCurrentDollarManual: string;
  fxCurrentUsdtManual: string;
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
  etfFuturePrice: '65000',
  fxRefDateLabel: '۱۰ مرداد ۱۴۰۵',
  fxRefDollar: '60000',
  fxRefUsdt: '60500',
  fxCurrentDollarManual: '',
  fxCurrentUsdtManual: ''
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

const fmtToman = (v: number | null | undefined, signed = false): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Math.round(v);
  const abs = Math.abs(r).toLocaleString('en-US');
  const prefix = r > 0 && signed ? '+' : r < 0 ? '−' : '';
  return `${prefix}${toFaDigits(abs)} تومان`;
};

const fmtPct = (v: number | null | undefined, digits = 2, signed = true): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const prefix = v > 0 && signed ? '+' : v < 0 ? '−' : '';
  return `${prefix}${toFaDigits(abs)}٪`;
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
const million = (toman: number) =>
  `${toFaDigits((toman / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }))} میلیون`;
const year = (t: number) => toFaDigits(new Date(t).getUTCFullYear());

/* ============================================================
   کامپوننت اصلی GoldTab
   ============================================================ */

export function GoldTab() {
  const q = useGold();
  const [s, setS] = useState<SavedGoldState>(() => {
    const saved = jsonGet<Partial<SavedGoldState> | null>(STORE_KEY, null) ?? {};
    return {
      ...DEFAULTS,
      ...saved,
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
      {/* نوار بالا: قیمت روز طلای ۱۸ عیار + شاخص‌های ۷/۳۰/۶۰ روزه + اسنپ‌شات انتخابی */}
      <Surface variant="focal" className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-muted">قیمت روز هر گرم طلای ۱۸ عیار</span>
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
              {d && (
                <span className="text-2xs text-subtle">
                  منبع: {d.bazaar ? 'بازار (TGJU) و ۴ پلتفرم' : 'میانه پلتفرم‌های آنلاین'} · {fmtRelativeAge(d.fetchedAt)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-ink sm:text-3xl">
              {live18kToman ? fmtToman(live18kToman) : q.isLoading ? 'در حال بارگذاری نرخ روز...' : '—'}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={q.isFetching}
            onClick={() => void q.refetch()}
          >
            به‌روزرسانی
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-divider pt-3.5 sm:grid-cols-4">
          {horizons.map((h) => (
            <button
              key={h.days}
              type="button"
              onClick={() => {
                set('horizonDays', h.days);
                set('tab', 'market');
              }}
              className={cn(
                'rounded-field border p-2.5 text-start transition-colors',
                s.horizonDays === h.days && s.tab === 'market'
                  ? 'border-accent bg-accent-soft/40'
                  : 'border-divider bg-card hover:border-divider-strong'
              )}
            >
              <p className="text-2xs font-semibold text-muted">تغییر {toFaDigits(h.days)} روز گذشته</p>
              {h.available ? (
                <>
                  <p className={cn('mt-1 text-sm font-extrabold', (h.changePct ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtPct(h.changePct)}
                  </p>
                  <p className="text-2xs text-subtle">{fmtToman(h.changeToman, true)}</p>
                </>
              ) : (
                <p className="mt-1 text-2xs text-subtle">داده تاریخی ناکافی</p>
              )}
            </button>
          ))}

          <div className="rounded-field border border-accent/30 bg-accent-soft/20 p-2.5">
            <p className="truncate text-2xs font-semibold text-accent">
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
      </Surface>

      {/* ناوبری بخش‌های ۵گانه ماژول طلای ایران */}
      <SegmentedControl<SectionTab>
        label="بخش‌های طلای ایران"
        value={s.tab}
        onChange={(t) => set('tab', t)}
        options={[
          { value: 'market', label: 'بازار، تاریخچه و اسنپ‌شات' },
          { value: 'online', label: 'خرید طلای آنلاین' },
          { value: 'jewelry', label: 'طلای زینتی و مقایسه' },
          { value: 'etf', label: 'صندوق‌های طلا' },
          { value: 'fx', label: 'دلار و تتر' }
        ]}
      />

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

      {s.tab === 'fx' && (
        <FxHistoricalSection
          s={s}
          set={set}
          liveDollarToman={d?.dollarToman ?? null}
          liveUsdtToman={d?.usdtToman ?? d?.dollarToman ?? null}
          gold30dPct={horizons.find((h) => h.days === 30)?.changePct ?? null}
        />
      )}
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
      {/* جدول و نمودار تغییرات ۷، ۳۰ و ۶۰ روزه */}
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">تحلیل تاریخی قیمت طلای ۱۸ عیار (۷، ۳۰ و ۶۰ روز گذشته)</h3>
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
              {horizons.map((h) => (
                <tr key={h.days} className={cn(h.days === selectedHorizon.days && 'bg-accent-soft/20')}>
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
                      <td className="col-num">{fmtToman(h.startPriceToman)}</td>
                      <td className="col-num font-semibold">{fmtToman(h.currentPriceToman)}</td>
                      <td className={cn('col-num font-bold', (h.changeToman ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                        {fmtToman(h.changeToman, true)}
                      </td>
                      <td className={cn('col-num font-bold', (h.changePct ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                        {fmtPct(h.changePct)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="text-center text-subtle">
                      اطلاعات تاریخی کافی در دسترس نیست
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* نمودار تعاملی SVG بر اساس داده‌های تاریخی واقعی */}
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
      </Surface>

      {/* بخش مستقل قیمت مرجع (Snapshot) */}
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">قیمت مرجع (Snapshot)</h3>
          <span className="text-2xs text-subtle">ثابت و مستقل از تاریخچه خودکار بازار</span>
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
                  'inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors',
                  active ? 'border-accent bg-accent-soft text-accent' : 'border-divider bg-card text-muted hover:text-ink'
                )}
              >
                <span>{sn.title}</span>
                <span className="text-2xs opacity-80">({sn.dateLabelFa})</span>
              </button>
            );
          })}
        </div>

        {snapshotComparison && (
          <div className="grid grid-cols-2 gap-3 rounded-field border border-divider bg-surface-2/40 p-3.5 sm:grid-cols-4">
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

      {/* کارت‌های ارزش‌گذاری ذاتی، پلتفرم‌ها، سکه‌ها و تجزیه رشد */}
      {!d && isLoading && <ListSkeleton rows={3} />}
      {!d && !isLoading && (
        <ErrorState
          message="نرخ زنده پلتفرم‌ها و حباب سکه در حال حاضر دریافت نشد؛ محاسبه‌گرها و صندوق‌های طلا در تب‌های بالا فعال هستند."
          onRetry={onRetry}
        />
      )}
      {d && (
        <>
          <ValueCard d={d} />
          <Platforms d={d} />
          {coins.length > 0 && <Coins coins={coins} />}
          {decomposition.length > 0 && <Growth rows={decomposition} />}
        </>
      )}
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
  const prices = series.map((x) => x.close);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = Math.max(1, maxP - minP);
  const w = 640;
  const h = 150;
  const padY = 14;

  const points = series.map((pt, i) => {
    const x = (i / Math.max(1, series.length - 1)) * w;
    const y = h - padY - ((pt.close - minP) / range) * (h - 2 * padY);
    return { x, y, pt };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const activePoint = hoverIdx != null && points[hoverIdx] ? points[hoverIdx] : points[points.length - 1];
  const strokeClass = isUp ? 'stroke-positive' : 'stroke-negative';

  return (
    <div className="space-y-2 rounded-field border border-divider bg-surface-2/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          تاریخ: <b className="text-ink">{fmtFaDate(activePoint.pt.t)}</b>
        </span>
        <span className="font-extrabold text-ink">{fmtToman(activePoint.pt.close)}</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-36 w-full overflow-visible"
        onMouseLeave={() => onHover(null)}
      >
        <polyline
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={strokeClass}
          points={polyline}
        />
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
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r={4.5}
            className="fill-ink stroke-surface stroke-2"
          />
        )}
      </svg>
      <div className="flex justify-between text-2xs text-subtle">
        <span>کف بازه: {fmtToman(minP)}</span>
        <span>سقف بازه: {fmtToman(maxP)}</span>
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
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">خرید و فروش طلای آنلاین</h3>
          <Badge tone={calc.isEstimatedQuote ? 'warn' : 'gain'}>
            {calc.isEstimatedQuote ? 'نرخ تخمینی / دستی' : 'نرخ زنده API پلتفرم'}
          </Badge>
        </div>

        {/* انتخاب پلتفرم */}
        <div className="flex flex-wrap gap-2">
          {s.onlinePlatforms.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set('selectedPlatformId', p.id)}
              className={cn(
                'rounded-control border px-3 py-1.5 text-xs font-bold transition-colors',
                p.id === activeProfile.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-divider bg-card text-muted hover:text-ink'
              )}
            >
              {p.name}
            </button>
          ))}
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
          <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
            <div className="rounded-field border border-divider bg-card p-3">
              <p className="text-2xs text-muted">مبلغ کل پرداختی خرید</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.totalBuyCostToman)}</p>
              <p className="text-2xs text-subtle">کارمزد خرید: {fmtToman(calc.buyFeeToman)}</p>
            </div>
            <div className="rounded-field border border-divider bg-card p-3">
              <p className="text-2xs text-muted">مبلغ خالص دریافتی فروش</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.netSellProceedsToman)}</p>
              <p className="text-2xs text-subtle">کارمزد فروش: {fmtToman(calc.sellFeeToman)}</p>
            </div>
            <div className="rounded-field border border-divider bg-card p-3">
              <p className="text-2xs text-muted">سود یا زیان خالص لحظه‌ای</p>
              <p className={cn('mt-1 text-sm font-extrabold', calc.netProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                {fmtToman(calc.netProfitToman, true)} ({fmtPct(calc.roiPct)})
              </p>
              <p className="text-2xs text-subtle">هزینه رفت‌وبرگشت و اسپرد</p>
            </div>
            <div className="rounded-field border border-accent/30 bg-accent-soft/20 p-3">
              <p className="text-2xs font-semibold text-accent">قیمت سربه‌سر هر گرم</p>
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
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">محاسبه خرید و فروش مجدد طلای زینتی</h3>
          <span className="text-2xs text-subtle">نرخ پایه ۱۸ عیار: {fmtToman(marketPx)}</span>
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
            <div className="rounded-field border border-divider bg-card p-3">
              <p className="text-2xs text-muted">ارزش طلای خام داخل محصول</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.rawGoldValueToman)}</p>
              <p className="text-2xs text-subtle">وزن خالص طلا: {toFaDigits(j.netGoldWeightGrams)} گرم</p>
            </div>
            <div className="rounded-field border border-warn/40 bg-warn/5 p-3">
              <p className="text-2xs font-semibold text-warn">مبلغ کل فاکتور خرید</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.totalBuyInvoiceToman)}</p>
              <p className="text-2xs text-subtle">
                اجرت+سود+مالیات: {fmtToman(j.totalOverheadToman)} ({fmtPct(j.overheadPctOfRaw, 1, false)})
              </p>
            </div>
            <div className="rounded-field border border-divider bg-card p-3">
              <p className="text-2xs text-muted">مبلغ دریافتی فروش مجدد امروز</p>
              <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(j.resaleNetProceedsToman)}</p>
              <p className="text-2xs text-negative">
                اختلاف با خرید: {fmtToman(j.netProfitOrLossToman, true)} ({fmtPct(j.roiPct, 1)})
              </p>
            </div>
            <div className="rounded-field border border-accent/30 bg-accent-soft/20 p-3">
              <p className="text-2xs font-semibold text-accent">قیمت سربه‌سر هر گرم ۱۸ عیار</p>
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
      </Surface>

      {/* داشبورد مقایسه طلای آنلاین با طلای زینتی */}
      {cmp.online.valid && cmp.jewelry.valid && (
        <Surface className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">
              مقایسه سرمایه‌گذاری در طلا ({toFaDigits(cmp.weightGrams)} گرم · عیار ۷۵۰)
            </h3>
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
                  <td className="col-num">{fmtToman(cmp.online.baseGoldValueToman)}</td>
                  <td className="col-num">{fmtToman(cmp.jewelry.rawGoldValueToman)}</td>
                </tr>
                <tr>
                  <td>مجموع اجرت، سود، مالیات و کارمزد خرید</td>
                  <td className="col-num">{fmtToman(cmp.online.buyFeeToman + cmp.online.extraBuyCostsToman)}</td>
                  <td className="col-num text-warn font-semibold">{fmtToman(cmp.jewelry.totalOverheadToman)}</td>
                </tr>
                <tr>
                  <td className="font-bold text-ink">مبلغ کل پرداختی در زمان خرید</td>
                  <td className="col-num font-bold">{fmtToman(cmp.online.totalBuyCostToman)}</td>
                  <td className="col-num font-bold">{fmtToman(cmp.jewelry.totalBuyInvoiceToman)}</td>
                </tr>
                <tr>
                  <td className="font-bold text-ink">مبلغ خالص دریافتی هنگام فروش مجدد</td>
                  <td className="col-num font-bold">{fmtToman(cmp.online.netSellProceedsToman)}</td>
                  <td className="col-num font-bold">{fmtToman(cmp.jewelry.resaleNetProceedsToman)}</td>
                </tr>
                <tr>
                  <td>سود یا زیان خالص در قیمت امروز</td>
                  <td className={cn('col-num font-bold', cmp.online.netProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(cmp.online.netProfitToman, true)} ({fmtPct(cmp.online.roiPct, 1)})
                  </td>
                  <td className={cn('col-num font-bold', cmp.jewelry.netProfitOrLossToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(cmp.jewelry.netProfitOrLossToman, true)} ({fmtPct(cmp.jewelry.roiPct, 1)})
                  </td>
                </tr>
                <tr>
                  <td>رشد لازم قیمت طلا برای رسیدن به سربه‌سر</td>
                  <td className="col-num">{fmtPct(cmp.onlineRequiredGrowthPctToBreakEven, 1)}</td>
                  <td className="col-num font-semibold text-warn">{fmtPct(cmp.jewelryRequiredGrowthPctToBreakEven, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-subtle">
            اختلاف هزینهٔ خرید اولیه: <b className="text-ink">{fmtToman(cmp.initialCostDiffToman)}</b> به نفع{' '}
            {cmp.lowerInitialCostMethod === 'online' ? 'طلای آنلاین' : 'طلای زینتی'} · این مقایسه صرفاً مالی است و ارزش مصرفی و زینتی مصنوعات طلا جداگانه است.
          </p>
        </Surface>
      )}

      {/* سناریوسازی قیمت آینده طلا */}
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">سناریوی قیمت آینده طلا (هر گرم ۱۸ عیار)</h3>
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
              variant="ghost"
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
                  <td className="font-bold text-ink">{fmtToman(r.future18kPriceToman)}</td>
                  <td className={cn('col-num', r.changeVsCurrentPct >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtPct(r.changeVsCurrentPct, 1)}
                  </td>
                  <td className={cn('col-num font-bold', r.onlineNetProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(r.onlineNetProfitToman, true)}
                  </td>
                  <td className={cn('col-num font-bold', r.onlineRoiPct >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtPct(r.onlineRoiPct, 1)}
                  </td>
                  <td className={cn('col-num font-bold', r.jewelryNetProfitToman >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtToman(r.jewelryNetProfitToman, true)}
                  </td>
                  <td className={cn('col-num font-bold', r.jewelryRoiPct >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmtPct(r.jewelryRoiPct, 1)}
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

  return (
    <div className="space-y-5">
      {/* داشبورد ۶ صندوق طلای بورسی با قیمت مرجع ثابت ۱۰ مرداد ۱۴۰۵ */}
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">صندوق‌های طلای بورسی</h3>
          <Badge tone="info">مرجع ثابت اسنپ‌شات: {GOLD_ETF_SNAPSHOT_DATE_FA}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.etf.id}
              className={cn(
                'rounded-card border p-3.5 space-y-3 transition-colors',
                s.selectedEtfId === c.etf.id ? 'border-accent bg-accent-soft/20' : 'border-divider bg-card'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-ink">{c.etf.nameFa}</p>
                  <p className="text-2xs text-muted">نماد بورسی: {c.etf.tickerFa}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    set('selectedEtfId', c.etf.id);
                    set('etfBuyPrice', String(c.currentPriceToman ?? c.etf.snapshotPriceToman));
                    if (c.currentPriceToman) set('etfCurrentPrice', String(c.currentPriceToman));
                    if (c.futurePriceToman) set('etfFuturePrice', String(c.futurePriceToman));
                  }}
                  className="text-2xs font-bold text-accent underline"
                >
                  انتخاب در ماشین‌حساب
                </button>
              </div>

              <div className="rounded-field bg-surface-2/60 px-2.5 py-2 text-xs">
                <span className="text-muted">قیمت مرجع ({GOLD_ETF_SNAPSHOT_DATE_FA}): </span>
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
          ))}
        </div>
      </Surface>

      {/* ماشین‌حساب سرمایه‌گذاری صندوق طلا */}
      <Surface className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">ماشین‌حساب سرمایه‌گذاری صندوق طلا</h3>
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
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-field border border-divider bg-card p-3">
                <p className="text-2xs text-muted">تعداد واحد و هزینه واقعی ورود</p>
                <p className="mt-1 text-sm font-extrabold text-ink">
                  {toFaDigits(calc.unitsPurchased.toLocaleString('en-US'))} واحد
                </p>
                <p className="text-2xs text-subtle">ورود: {fmtToman(calc.totalEntryCostToman)}</p>
              </div>
              <div className="rounded-field border border-divider bg-card p-3">
                <p className="text-2xs text-muted">مبلغ نهایی دریافتی پس از فروش</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.netFinalProceedsToman)}</p>
                <p className="text-2xs text-subtle">هزینه کارمزد معاملات: {fmtToman(calc.totalTradingFeesToman)}</p>
              </div>
              <div className="rounded-field border border-divider bg-card p-3">
                <p className="text-2xs text-muted">سود یا زیان خالص و بازدهی</p>
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
              <div className="rounded-field border border-accent/30 bg-accent-soft/20 p-3">
                <p className="text-2xs font-semibold text-accent">قیمت سربه‌سر هر واحد</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{fmtToman(calc.breakEvenUnitPriceToman)}</p>
                <p className="text-2xs text-subtle">
                  نسبت به مرجع {GOLD_ETF_SNAPSHOT_DATE_FA}: {fmtPct(calc.futureChangeVsSnapshotPct, 1)}
                </p>
              </div>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}

/* ============================================================
   بخش ۵: تحلیل تاریخی دلار آزاد و تتر
   ============================================================ */

function FxHistoricalSection({
  s,
  set,
  liveDollarToman,
  liveUsdtToman,
  gold30dPct
}: {
  s: SavedGoldState;
  set: <K extends keyof SavedGoldState>(k: K, v: SavedGoldState[K]) => void;
  liveDollarToman: number | null;
  liveUsdtToman: number | null;
  gold30dPct: number | null;
}) {
  const curDollar = parseCleanNum(s.fxCurrentDollarManual) || liveDollarToman || 0;
  const curUsdt = parseCleanNum(s.fxCurrentUsdtManual) || liveUsdtToman || curDollar;

  const fx = useMemo(
    () =>
      evaluateFxHistorical({
        referenceDateLabelFa: s.fxRefDateLabel,
        referenceDollarToman: parseCleanNum(s.fxRefDollar),
        referenceUsdtToman: parseCleanNum(s.fxRefUsdt),
        currentDollarToman: curDollar,
        currentUsdtToman: curUsdt,
        goldGrowthPctInSamePeriod: gold30dPct
      }),
    [s.fxRefDateLabel, s.fxRefDollar, s.fxRefUsdt, curDollar, curUsdt, gold30dPct]
  );

  return (
    <Surface className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">تحلیل تاریخی دلار آزاد و تتر</h3>
        <span className="text-2xs text-subtle">مقایسه نرخ مرجع ثبت‌شده با نرخ روز و اسپرد تتر</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="عنوان / تاریخ مرجع">
          <Input value={s.fxRefDateLabel} onChange={(e) => set('fxRefDateLabel', e.target.value)} />
        </Field>
        <Field label="دلار آزاد در تاریخ مرجع (تومان)">
          <Input dir="ltr" inputMode="numeric" value={s.fxRefDollar} onChange={(e) => set('fxRefDollar', e.target.value)} />
        </Field>
        <Field label="تتر در تاریخ مرجع (تومان)">
          <Input dir="ltr" inputMode="numeric" value={s.fxRefUsdt} onChange={(e) => set('fxRefUsdt', e.target.value)} />
        </Field>
        <Field label="دلار آزاد فعلی (تومان)">
          <Input
            dir="ltr"
            inputMode="numeric"
            value={s.fxCurrentDollarManual}
            onChange={(e) => set('fxCurrentDollarManual', e.target.value)}
            placeholder={liveDollarToman ? String(Math.round(liveDollarToman)) : 'ورود دستی'}
          />
        </Field>
        <Field label="تتر فعلی (تومان)">
          <Input
            dir="ltr"
            inputMode="numeric"
            value={s.fxCurrentUsdtManual}
            onChange={(e) => set('fxCurrentUsdtManual', e.target.value)}
            placeholder={liveUsdtToman ? String(Math.round(liveUsdtToman)) : 'ورود دستی'}
          />
        </Field>
      </div>

      {fx.valid && (
        <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
          <div className="rounded-field border border-divider bg-card p-3">
            <p className="text-2xs text-muted">تغییر دلار آزاد نسبت به مرجع</p>
            <p className={cn('mt-1 text-sm font-extrabold', fx.dollarChangePct >= 0 ? 'text-positive' : 'text-negative')}>
              {fmtPct(fx.dollarChangePct)}
            </p>
            <p className="text-2xs text-subtle">{fmtToman(fx.dollarDiffToman, true)}</p>
          </div>
          <div className="rounded-field border border-divider bg-card p-3">
            <p className="text-2xs text-muted">تغییر تتر نسبت به مرجع</p>
            <p className={cn('mt-1 text-sm font-extrabold', fx.usdtChangePct >= 0 ? 'text-positive' : 'text-negative')}>
              {fmtPct(fx.usdtChangePct)}
            </p>
            <p className="text-2xs text-subtle">{fmtToman(fx.usdtDiffToman, true)}</p>
          </div>
          <div className="rounded-field border border-divider bg-card p-3">
            <p className="text-2xs text-muted">اختلاف (اسپرد) تتر با دلار آزاد</p>
            <p className="mt-1 text-sm font-extrabold text-ink">{fmtPct(fx.currentUsdtSpreadPct)}</p>
            <p className="text-2xs text-subtle">در تاریخ مرجع: {fmtPct(fx.referenceUsdtSpreadPct)}</p>
          </div>
          <div className="rounded-field border border-accent/30 bg-accent-soft/20 p-3">
            <p className="text-2xs font-semibold text-accent">عملکرد طلا نسبت به دلار</p>
            <p className="mt-1 text-sm font-extrabold text-ink">
              {fx.goldOutperformanceVsDollarPct !== null ? fmtPct(fx.goldOutperformanceVsDollarPct) : '—'}
            </p>
            <p className="text-2xs text-subtle">سهم رشد انس جهانی و حباب</p>
          </div>
        </div>
      )}
    </Surface>
  );
}

/* ============================================================
   کامپوننت‌های موجود ارزش‌گذاری، پلتفرم‌ها، سکه‌ها و تجزیه رشد
   ============================================================ */

const VALUE_FA: Record<Valuation, { title: (p: number) => string; border: string }> = {
  cheap: {
    title: (p) => `حباب طلای ۱۸ عیار ${pctRatio(p)} · پایین‌تر از محدودهٔ معمول`,
    border: 'border-gain/50'
  },
  rich: {
    title: (p) => `حباب طلای ۱۸ عیار ${pctRatio(p)} · بالاتر از محدودهٔ معمول`,
    border: 'border-warn/50'
  },
  fair: {
    title: (p) => `حباب طلای ۱۸ عیار ${pctRatio(p)} · در محدودهٔ متعادل بازار`,
    border: 'border-divider'
  },
  unknown: {
    title: () => 'حباب در انتظار دریافت نرخ انس و دلار',
    border: 'border-divider'
  }
};

function ValueCard({ d }: { d: GoldPayload }) {
  const rows = d.rows ?? [];
  const v = valuation(d.premium, rows, d.stats, d.dollarSource);
  const t = VALUE_FA[v.state];
  return (
    <Surface className={cn('border p-4 sm:p-5', t.border)}>
      <h3 className="text-sm font-extrabold text-ink">{t.title(d.premium ?? 0)}</h3>
      {d.dollarSource === 'usdt' && (
        <p className="mt-1 text-2xs text-warn">مبنای محاسبه: نرخ تتر (در غیاب نرخ دلار آزاد).</p>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-divider pt-3">
        <div>
          <dt className="text-2xs font-semibold text-muted">ارزش ذاتی هر گرم ۱۸ عیار</dt>
          <dd className="mt-1 text-base font-extrabold text-ink sm:text-lg">{d.intrinsic ? million(d.intrinsic) : '—'}</dd>
          <dd className="text-2xs text-subtle">تومان (انس × دلار)</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">انس جهانی طلا</dt>
          <dd className="mt-1 text-base font-extrabold text-ink sm:text-lg">
            {d.ounceUsd ? `${toFaDigits(d.ounceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 }))} دلار` : '—'}
          </dd>
          <dd className="text-2xs text-subtle">هر انس</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">{d.dollarSource === 'free' ? 'دلار آزاد' : 'دلار تتر'}</dt>
          <dd className="mt-1 text-base font-extrabold text-ink sm:text-lg">
            {d.dollarToman ? fmtToman(d.dollarToman) : '—'}
          </dd>
          <dd className="text-2xs text-subtle">نرخ لحظه‌ای</dd>
        </div>
      </dl>

      {d.premium !== null && (
        <PremiumBar now={d.premium} stats={d.dollarSource === 'free' ? d.stats : null} low={v.low} high={v.high} />
      )}
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
    <div className={compact ? 'mt-2' : 'mt-3 border-t border-divider pt-3'}>
      {!compact && (
        <p className="text-2xs font-semibold text-muted">
          {stats
            ? `بازهٔ متعادل تاریخی (از ${year(stats.since)}): بین ${pctRatio(stats.p10)} تا ${pctRatio(stats.p90)} · میانه ${pctRatio(stats.p50)}`
            : `محدودهٔ هزینهٔ رفت‌وبرگشت: ±${pctRatio(high, 1, false)}`}
        </p>
      )}
      <div dir="ltr" className="relative mt-2.5 h-2 rounded-full bg-surface-2" role="img" aria-label={`حباب ${pctRatio(now)}`}>
        <span
          className="absolute inset-y-0 rounded-full bg-brand/25"
          style={{ left: x(low), right: `calc(100% - ${x(high)})` }}
          aria-hidden
        />
        <span className="absolute -inset-y-1 w-px bg-ink/40" style={{ left: x(stats?.p50 ?? 0) }} aria-hidden />
        <span
          className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-surface bg-ink"
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
    <Surface className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">نرخ زنده پلتفرم‌های آنلاین طلای ۱۸ عیار</h3>
        {d.bazaar && vsBazaar !== null && (
          <span className="text-2xs text-muted">
            پلتفرم‌ها {pctRatio(Math.abs(vsBazaar), 1, false)} {vsBazaar < 0 ? 'ارزان‌تر' : 'گران‌تر'} از بازار
          </span>
        )}
      </div>
      <ul className="mt-2 divide-y divide-divider">
        {rows.map((r, i) => {
          const meta = PLATFORM_FA[r.platform] ?? { name: String(r.platform), url: '#' };
          return (
            <li key={r.platform} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-bold text-ink">
                  {meta.name}
                  {i === 0 && <Badge tone="gain">ارزان‌ترین خرید</Badge>}
                  {bestSell?.platform === r.platform && rows.length > 1 && <Badge tone="info">بهترین فروش</Badge>}
                </p>
                <p className="text-2xs text-muted">
                  خرید {fmtToman(r.buy)} · فروش {fmtToman(r.sell)}
                  {r.buy !== r.sell && ` · اسپرد ${pctRatio(r.spread, 1, false)}`}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold text-ink">{Number.isFinite(r.premium) ? pctRatio(r.premium) : '—'}</p>
                <p className="text-2xs text-subtle">حباب</p>
              </div>
              <a
                href={meta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-subtle hover:text-brand"
                aria-label={`باز کردن ${meta.name}`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
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
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">قیمت و حباب سکه</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {coins.map((c) => {
          const pos = c.stats ? percentileOf(c.premium, c.stats) : null;
          const label = COIN_FA[c.coin] ?? String(c.coin);
          return (
            <li key={c.coin} className="rounded-field bg-surface-2/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-ink">{label}</p>
                <p className="text-sm font-extrabold text-ink">{pctRatio(c.premium)}</p>
              </div>
              <p className="text-2xs text-muted">{fmtToman(c.price)}</p>
              {c.stats && <PremiumBar now={c.premium} stats={c.stats} low={c.stats.p10} high={c.stats.p90} compact />}
              {c.stats && pos && (
                <p className="mt-1.5 text-2xs text-subtle">
                  {POSITION_FA[pos]} · میانه تاریخی: {pctRatio(c.stats.p50)}
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
  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">تفکیک عوامل تغییر قیمت طلای ۱۸ عیار</h3>
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
                {[r.iran, r.ounce, r.dollar, r.premium].map((v, i) => (
                  <td
                    key={i}
                    className={cn('col-num', i === 0 && 'font-bold', v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : '')}
                  >
                    {Number.isFinite(v) ? pctRatio(v) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
