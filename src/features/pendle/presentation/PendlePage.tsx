/**
 * Pendle Analytics Dashboard — فقط مشاهده و تحلیل بازار
 * تب ۱: Pendle Markets (همه بازارها + PT/YT/SY/Underlying)
 * تب ۲: Pendle Opportunities (مرتب‌سازی و فیلتر فرصت‌ها)
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Star, RefreshCw, ArrowUpDown, Gauge, CalendarRange, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/Page';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ErrorState, DeFiListSkeleton } from '@/shared/components/ui/StateViews';
import { AnalyticsTab } from './AnalyticsTab';
import { usePendleMarkets, usePendleRateStatus } from '@/features/pendle/data/usePendleMarkets';
import {
  PENDLE_SORT_LABELS,
  chainName,
  fmtExpiry,
  sortValue,
  type PendleMarketView,
  type PendleSortKey,
  type PendleMarketType
} from '@/features/pendle/domain/pendle';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { fmtUSD, fmtPct, fmtInt, pnlClass } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

export function PendlePage() {
  const [tab, setTab] = useState<'markets' | 'opportunities' | 'analytics'>('markets');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Pendle Markets"
        subtitle=""
        actions={
          <a href="https://docs.pendle.finance/pendle-v2-dev/Backend/ApiOverview" target="_blank" rel="noreferrer" className="text-[10px] font-bold text-accent">
            مستندات رسمی
          </a>
        }
      />
      <RateStatusBar />
      <SegmentedControl<'markets' | 'opportunities' | 'analytics'>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'markets', label: 'بازارها' },
          { value: 'opportunities', label: 'فرصت‌ها' },
          { value: 'analytics', label: 'تحلیل' }
        ]}
      />
      {tab === 'markets' ? <MarketsExplorer /> : tab === 'opportunities' ? <OpportunitiesExplorer /> : <AnalyticsTab />}
    </div>
  );
}

/** نوار وضعیت Rate Limit (هدرمحور) */
function RateStatusBar() {
  const s = usePendleRateStatus();
  const pct = s.limit > 0 ? (s.remaining / s.limit) * 100 : 100;
  return (
    <GlassCard variant="soft" className="flex items-center gap-2.5 px-4 py-2.5">
      <Gauge className="h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[9px] font-bold text-muted">
          <span>سهمیه لحظه‌ای: {s.remaining} / {s.limit}</span>
          <span className="num-ltr">CU: {s.cu} · هفتگی: {fmtInt(s.weeklyRemaining)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/10">
          <div className={cn('h-full rounded-full', pct > 20 ? 'bg-accent' : 'bg-warn')} style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
      </div>
      {s.errors.length > 0 && <span className="badge bg-warn/10 text-warn">{s.errors.length} خطا</span>}
    </GlassCard>
  );
}

/* ================= Markets Explorer ================= */

type MarketSubTab = 'all' | 'PT' | 'YT' | 'SY' | 'underlying';

export function MarketsExplorer() {
  const navigate = useNavigate();
  const { markets, loading, error, refresh, lastSync } = usePendleMarkets();
  const watch = useWatchlistStore((s) => s.items);
  const [sub, setSub] = useState<MarketSubTab>('all');
  const [query, setQuery] = useState('');
  const [chain, setChain] = useState<number | 'all'>('all');

  useEffect(() => {
    void useWatchlistStore.getState().hydrate();
  }, []);

  const chains = useMemo(() => [...new Set(markets.map((m) => m.chainId))], [markets]);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return markets.filter((m) => {
      if (chain !== 'all' && m.chainId !== chain) return false;
      if (sub === 'PT' && m.marketType !== 'PT') return false;
      if (sub === 'YT' && m.marketType !== 'YT') return false;
      if (sub === 'SY' && m.marketType !== 'SY') return false;
      if (sub === 'underlying' && (m.underlyingApyPct ?? 0) === 0 && !m.underlyingAsset) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.protocol.toLowerCase().includes(q);
    });
  }, [markets, query, chain, sub]);

  if (loading) return <DeFiListSkeleton rows={8} />;
  if (error) return <ErrorState message="ارتباط با Pendle API برقرار نشد" onRetry={refresh} />;

  return (
    <div className="space-y-3">
      <GlassCard variant="soft" className="flex items-center justify-between px-4 py-2">
        <p className="text-[10px] font-bold text-muted">
          {fmtInt(markets.length)} بازار · {fmtInt(chains.length)} زنجیره
          {lastSync && ` · همگام‌سازی ${new Date(lastSync).toLocaleTimeString('fa-IR')}`}
        </p>
        <button onClick={refresh} className="flex items-center gap-1 text-[10px] font-bold text-accent">
          <RefreshCw className="h-3 w-3" /> همگام‌سازی
        </button>
      </GlassCard>

      {/* زیرتب‌ها */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['all', 'PT', 'YT', 'SY', 'underlying'] as MarketSubTab[]).map((t) => (
          <button key={t} onClick={() => setSub(t)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold', sub === t ? 'bg-accent text-white' : 'glass-inset text-muted')}>
            {t === 'all' ? 'همه بازارها' : t === 'underlying' ? 'دارایی پایه' : `${t} Markets`}
          </button>
        ))}
      </div>

      {/* جستجو + فیلتر زنجیره */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی بازار یا پروتکل…" className="glass-inset h-10 w-full rounded-2xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60" />
        </div>
        <select value={chain} onChange={(e) => setChain(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="glass-inset h-10 rounded-2xl px-2 text-[10px] font-bold text-ink outline-none">
          <option value="all">همه زنجیره‌ها</option>
          {chains.map((c) => (
            <option key={c} value={c}>{chainName(c)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {visible.map((m, i) => (
          <PendleCard key={m.address} m={m} index={i} isFav={watch[`pendle:${m.address}`] !== undefined} onOpen={() => navigate(`/pendle/${m.chainId}/${m.address}`)} onFav={() => void useWatchlistStore.getState().toggle(`pendle:${m.address}`)} />
        ))}
        {visible.length === 0 && <p className="glass-soft rounded-2xl px-6 py-10 text-center text-[11px] font-bold text-muted">بازاری یافت نشد</p>}
      </div>
    </div>
  );
}

export function PendleCard({ m, index, isFav, onOpen, onFav }: { m: PendleMarketView; index: number; isFav: boolean; onOpen: () => void; onFav: () => void }) {
  const apyBadges: { label: string; v: number | null }[] = [
    { label: 'ثابت', v: m.fixedApyPct },
    { label: 'LP', v: m.lpApyPct },
    { label: 'YT', v: m.ytApyPct },
    { label: 'پایه', v: m.underlyingApyPct }
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index < 20 ? index * 0.01 : 0, duration: 0.2 }}
      onClick={onOpen}
      className="glass cursor-pointer rounded-2xl p-3.5 transition-all hover:bg-line/[0.04] active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        {m.icon ? (
          <img src={m.icon} alt={m.name} className="h-9 w-9 shrink-0 rounded-full bg-card object-contain ring-1 ring-line/10" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0')} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-black text-accent">{m.name.slice(0, 2)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold text-ink">{m.name}</p>
          <p className="flex flex-wrap items-center gap-1 text-[9px] font-medium text-muted">
            <span className="badge bg-line/5 text-muted ring-1 ring-line/10">{m.protocol}</span>
            <span className="badge bg-line/5 text-muted ring-1 ring-line/10">{chainName(m.chainId)}</span>
            <span className="badge bg-info/10 text-info ring-1 ring-info/20">{m.marketType}</span>
            {m.daysToExpiry !== null && (
              <span className="badge bg-accent/10 text-accent ring-1 ring-accent/20">
                <CalendarRange className="h-2.5 w-2.5" /> {fmtExpiry(m.expiry)} ({fmtInt(m.daysToExpiry)} روز)
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="num-ltr text-[13px] font-black text-ink">TVL {fmtUSD(m.details.totalTvl, true)}</span>
          <span className="num-ltr text-[9px] font-bold text-muted">حجم: {fmtUSD(m.details.tradingVolume, true)}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onFav(); }} className={cn('rounded-lg p-1.5', isFav ? 'text-warn' : 'text-muted hover:text-warn')} aria-label="علاقه‌مندی">
          <Star className={cn('h-3.5 w-3.5', isFav && 'fill-warn')} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 ps-[48px]">
        {apyBadges.map((b) => (
          <span key={b.label} className={cn('badge ring-1', b.v === null || b.v === 0 ? 'bg-line/5 text-muted ring-line/10' : b.v >= 0 ? 'bg-positive/10 text-positive ring-positive/20' : 'bg-negative/10 text-negative ring-negative/20')}>
            {b.label}: {b.v !== null ? fmtPct(b.v) : '—'}
          </span>
        ))}
        {m.ptDiscountPct !== null && (
          <span className={cn('badge ring-1', m.ptDiscountPct >= 0 ? 'bg-sky-400/10 text-sky-400 ring-sky-400/20' : 'bg-warn/10 text-warn ring-warn/20')}>
            تخفیف PT: {fmtPct(m.ptDiscountPct)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ================= Opportunities ================= */

const SORT_KEYS: PendleSortKey[] = ['fixedApy', 'lpApy', 'ytApy', 'totalYield', 'rewardApr', 'tvl', 'volume', 'maturity', 'ptDiscount'];

export function OpportunitiesExplorer() {
  const navigate = useNavigate();
  const { markets, loading, error, refresh } = usePendleMarkets();
  const [sort, setSort] = useState<PendleSortKey>('fixedApy');
  const [minApy, setMinApy] = useState('');
  const [minTvl, setMinTvl] = useState('');
  const [chain, setChain] = useState<number | 'all'>('all');
  const [type, setType] = useState<PendleMarketType | 'all'>('all');

  const chains = useMemo(() => [...new Set(markets.map((m) => m.chainId))], [markets]);

  const ranked = useMemo(() => {
    const minA = Number(minApy) || 0;
    const minT = Number(minTvl) || 0;
    const asc = sort === 'maturity'; // نزدیک‌ترین سررسید اول
    const list = markets
      .filter((m) => {
        if (chain !== 'all' && m.chainId !== chain) return false;
        if (type !== 'all' && m.marketType !== type) return false;
        if (minA > 0 && (m.totalApyPct ?? 0) < minA) return false;
        if (minT > 0 && m.details.totalTvl < minT) return false;
        return true;
      })
      .sort((a, b) => {
        const va = sortValue(a, sort);
        const vb = sortValue(b, sort);
        return (asc ? va - vb : vb - va);
      })
      .slice(0, 50);
    return list;
  }, [markets, sort, minApy, minTvl, chain, type]);

  if (loading) return <DeFiListSkeleton rows={8} />;
  if (error) return <ErrorState message="ارتباط با Pendle API برقرار نشد" onRetry={refresh} />;

  return (
    <div className="space-y-3">
      <GlassCard className="space-y-2 p-3.5">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-muted">مرتب‌سازی:</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as PendleSortKey)} className="glass-inset h-9 flex-1 rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>{PENDLE_SORT_LABELS[k]}</option>
            ))}
          </select>
          <ArrowUpDown className="h-3.5 w-3.5 text-muted" />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <FilterInput label="حداقل APY ٪" value={minApy} onChange={setMinApy} />
          <FilterInput label="حداقل TVL (M$)" value={minTvl} onChange={setMinTvl} />
          <div>
            <label className="mb-0.5 block text-[8px] font-bold text-muted">زنجیره</label>
            <select value={chain} onChange={(e) => setChain(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="glass-inset h-8 w-full rounded-lg px-1 text-[9px] font-bold text-ink outline-none">
              <option value="all">همه</option>
              {chains.map((c) => <option key={c} value={c}>{chainName(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[8px] font-bold text-muted">نوع</label>
            <select value={type} onChange={(e) => setType(e.target.value as PendleMarketType | 'all')} className="glass-inset h-8 w-full rounded-lg px-1 text-[9px] font-bold text-ink outline-none">
              <option value="all">همه</option>
              {(['LP', 'PT', 'YT', 'SY'] as PendleMarketType[]).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* برترین فرصت (رتبه ۱) */}
      {ranked[0] && (
        <GlassCard className="border border-positive/30 p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black text-positive">
            <ShieldCheck className="h-3.5 w-3.5" /> بهترین فرصت بر اساس «{PENDLE_SORT_LABELS[sort]}»
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            {ranked[0].icon && <img src={ranked[0].icon} alt="" className="h-8 w-8 rounded-full bg-card object-contain" loading="lazy" referrerPolicy="no-referrer" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-extrabold text-ink">{ranked[0].name}</p>
              <p className="text-[9px] font-medium text-muted">{ranked[0].protocol} · {chainName(ranked[0].chainId)}</p>
            </div>
            <p className="num-ltr text-lg font-black text-positive">{fmtPct(sortValue(ranked[0], sort))}</p>
          </div>
        </GlassCard>
      )}

      <div className="space-y-2">
        {ranked.map((m, i) => (
          <motion.div key={m.address} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i < 15 ? i * 0.008 : 0 }}>
            <PendleCard m={m} index={i} isFav={false} onOpen={() => navigate(`/pendle/${m.chainId}/${m.address}`)} onFav={() => undefined} />
          </motion.div>
        ))}
        {ranked.length === 0 && <p className="glass-soft rounded-2xl px-6 py-10 text-center text-[11px] font-bold text-muted">فرصتی با این فیلترها یافت نشد</p>}
      </div>
    </div>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-0.5 block text-[8px] font-bold text-muted">{label}</label>
      <input dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="glass-inset h-8 w-full rounded-lg px-1.5 text-center text-[9px] font-bold text-ink outline-none" />
    </div>
  );
}
