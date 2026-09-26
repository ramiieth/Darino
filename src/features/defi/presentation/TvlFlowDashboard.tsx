/**
 * TVL flow analytics — where DeFi capital is moving (DefiLlama API only)
 *
 *   خلاصه          largest inflow / outflow per period (table)
 *   زنجیره‌ها       TVL + change per period, trend line, on-demand history
 *   نقشه حرارتی     chains coloured by % change (level legend, value always printed)
 *   پروتکل‌ها       TVL + 1d/7d change, sortable
 *   جریان هوشمند   top absolute in/outflows (chains 7d, protocols 7d)
 */
import { useMemo, useState } from 'react';
import { Activity, Flame, Grid3X3, Layers, TrendingDown, TrendingUp, Waypoints } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { SearchField, Select } from '@/shared/components/ui/Input';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState, EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { useTvlFlow, loadTvlFlow, ensureChainHistory, resetTvlFlowLoad } from '@/features/defi/data/useTvlFlow';
import { Sparkline } from './Sparkline';
import {
  FLOW_PERIODS,
  FLOW_LABEL,
  flowLevel,
  rankByUsd,
  downsample,
  type FlowPeriod,
  type PeriodChange
} from '@/features/defi/domain/tvlFlow';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type PeriodKey = '7' | '30' | '90' | '180' | '365';
type View = 'summary' | 'chains' | 'heatmap' | 'protocols' | 'smart';

const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7': '۷ روز',
  '30': '۳۰ روز',
  '90': '۹۰ روز',
  '180': '۱۸۰ روز',
  '365': '۱ سال'
};
const PERIOD_OPTS = (Object.keys(PERIOD_LABEL) as PeriodKey[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }));
const periodNum = (k: PeriodKey): FlowPeriod => Number(k) as FlowPeriod;
const periodLabel = (p: FlowPeriod) => PERIOD_LABEL[String(p) as PeriodKey];

/** Heat scale — financial semantics (gain / loss), readable in both themes */
const HEAT: Record<number, string> = {
  4: 'bg-gain text-white',
  3: 'bg-gain/15 text-positive',
  0: 'bg-surface-2 text-muted',
  2: 'bg-negative/12 text-negative',
  1: 'bg-negative text-white'
};

function Change({ c }: { c: PeriodChange | null | undefined }) {
  if (!c) return <span className="text-subtle">—</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <PercentValue value={c.pct} className="text-sm font-semibold" />
      <MoneyValue value={c.usd} signed compact className="text-2xs text-muted" />
    </span>
  );
}

export function TvlFlowDashboard() {
  const { chains, protocols, loading, error, syncProgress, loadedAt } = useTvlFlow();
  const [view, setView] = useState<View>('summary');
  const [period, setPeriod] = useState<PeriodKey>('7');
  const [chainQuery, setChainQuery] = useState('');
  const [protoQuery, setProtoQuery] = useState('');
  const [protoSort, setProtoSort] = useState<'tvl' | 'grow7' | 'drop7' | 'grow1' | 'drop1'>('tvl');

  const summaries = useMemo(() => {
    const withHist = chains.filter((c) => c.history);
    return FLOW_PERIODS.map((p) => {
      const { inflow, outflow } = rankByUsd(withHist, (c) => c.changes[p]);
      const top = inflow[0];
      const bot = outflow[0];
      return {
        period: p,
        inflow: top ? { name: top.name, c: top.changes[p] as PeriodChange } : null,
        outflow: bot ? { name: bot.name, c: bot.changes[p] as PeriodChange } : null
      };
    });
  }, [chains]);

  const chainRows = useMemo(() => {
    const q = chainQuery.trim().toLowerCase();
    const list = chains.filter((c) => !q || c.name.toLowerCase().includes(q));
    const pn = periodNum(period);
    return [...list]
      .sort((a, b) => (b.changes[pn]?.usd ?? -Infinity) - (a.changes[pn]?.usd ?? -Infinity))
      .slice(0, 60);
  }, [chains, period, chainQuery]);

  const heatChains = useMemo(() => chains.filter((c) => c.history && c.tvl > 1_000_000).slice(0, 80), [chains]);

  const protoRows = useMemo(() => {
    const q = protoQuery.trim().toLowerCase();
    const list = protocols.filter((p) => p.t > 0 && (!q || p.n.toLowerCase().includes(q) || p.s.includes(q)));
    return [...list]
      .sort((a, b) => {
        switch (protoSort) {
          case 'grow7':
            return (b.c7 ?? -Infinity) - (a.c7 ?? -Infinity);
          case 'drop7':
            return (a.c7 ?? Infinity) - (b.c7 ?? Infinity);
          case 'grow1':
            return (b.c1 ?? -Infinity) - (a.c1 ?? -Infinity);
          case 'drop1':
            return (a.c1 ?? Infinity) - (b.c1 ?? Infinity);
          default:
            return b.t - a.t;
        }
      })
      .slice(0, 60);
  }, [protocols, protoSort, protoQuery]);

  const smart = useMemo(() => {
    const withHist = chains.filter((c) => c.history && c.tvl > 5_000_000);
    const { inflow, outflow } = rankByUsd(withHist, (c) => c.changes[7]);
    const protos = protocols.filter((p) => p.t > 10_000_000 && p.c7 !== null);
    return {
      chainIn: inflow.slice(0, 5),
      chainOut: outflow.slice(0, 5),
      protoIn: [...protos].sort((a, b) => (b.c7 ?? 0) - (a.c7 ?? 0)).slice(0, 5),
      protoOut: [...protos].sort((a, b) => (a.c7 ?? 0) - (b.c7 ?? 0)).slice(0, 5)
    };
  }, [chains, protocols]);

  if (loading && chains.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (error && chains.length === 0) {
    return <ErrorState message="اتصال به DefiLlama برقرار نشد" onRetry={() => void loadTvlFlow()} />;
  }

  return (
    <div className="space-y-5">
      <FreshnessBar
        loadedAt={loadedAt}
        error={error}
        syncing={syncProgress !== null}
        sourceLabel="DefiLlama"
        autoMs={5 * 60_000}
        onRefresh={() => {
          resetTvlFlowLoad();
          void loadTvlFlow();
        }}
      />

      {syncProgress && (
        <div className="flex items-center gap-3 text-xs text-muted" role="status">
          <span className="shrink-0">
            تاریخچه زنجیره‌ها {toFaDigits(syncProgress.done)}/{toFaDigits(syncProgress.total)}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-slow"
              style={{ width: `${(syncProgress.done / Math.max(1, syncProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      <SegmentedControl<View>
        label="نمای تحلیل"
        value={view}
        onChange={setView}
        options={[
          { value: 'summary', label: 'خلاصه', icon: <Activity /> },
          { value: 'chains', label: 'زنجیره‌ها', icon: <Layers /> },
          { value: 'heatmap', label: 'نقشه حرارتی', icon: <Grid3X3 /> },
          { value: 'protocols', label: 'پروتکل‌ها', icon: <Flame /> },
          { value: 'smart', label: 'جریان هوشمند', icon: <Waypoints /> }
        ]}
      />

      {/* ================= summary ================= */}
      {view === 'summary' && (
        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <table className="data-table">
              <caption className="px-4 pt-4 text-start text-sm font-bold text-ink md:px-5">
                بیشترین ورود و خروج سرمایه در هر بازه
                <span className="block text-xs font-normal text-muted">بر اساس تغییر دلاری TVL زنجیره‌ها</span>
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4 md:!ps-5">بازه</th>
                  <th scope="col">بیشترین ورود</th>
                  <th scope="col" className="!pe-4 md:!pe-5">بیشترین خروج</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.period}>
                    <th scope="row" className="!ps-4 text-start font-semibold text-ink md:!ps-5">{periodLabel(s.period)}</th>
                    <td>
                      {s.inflow ? (
                        <span className="flex items-center gap-2">
                          <TrendingUp aria-hidden className="h-4 w-4 shrink-0 text-positive" />
                          <bdi dir="ltr" className="truncate font-semibold text-ink">{s.inflow.name}</bdi>
                          <MoneyValue value={s.inflow.c.usd} signed compact tone="auto" className="text-xs" />
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="!pe-4 md:!pe-5">
                      {s.outflow ? (
                        <span className="flex items-center gap-2">
                          <TrendingDown aria-hidden className="h-4 w-4 shrink-0 text-negative" />
                          <bdi dir="ltr" className="truncate font-semibold text-ink">{s.outflow.name}</bdi>
                          <MoneyValue value={s.outflow.c.usd} signed compact tone="auto" className="text-xs" />
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
          <Notice tone="neutral" title="چرخش سرمایه چطور خوانده می‌شود؟">
            ورود مداوم در بازه‌های ۷، ۳۰ و ۹۰ روزه نشانه روند پایدار است؛ خروج هم‌زمان در چند بازه یعنی خروج واقعی سرمایه، نه
            فقط نوسان قیمت. این تحلیل توصیه سرمایه‌گذاری نیست.
          </Notice>
        </div>
      )}

      {/* ================= chains ================= */}
      {view === 'chains' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={chainQuery} onChange={setChainQuery} placeholder="جستجوی زنجیره…" className="min-w-0 flex-1 md:max-w-xs" />
            <SegmentedControl label="بازه" options={PERIOD_OPTS} value={period} onChange={setPeriod} size="sm" />
          </div>
          {chainRows.length === 0 ? (
            <EmptyState message="زنجیره‌ای یافت نشد" />
          ) : (
            <Surface className="px-4 md:px-5">
              <ul className="divide-y divide-divider">
                {chainRows.map((c) => {
                  const ch = c.changes[periodNum(period)];
                  const positive = ch ? ch.trend !== 'down' : true;
                  return (
                    <li key={c.name}>
                      <button
                        type="button"
                        onClick={() => void ensureChainHistory(c.name)}
                        className="flex w-full items-center gap-3 py-3 text-start"
                        aria-label={`${c.name} — ${c.history ? 'تاریخچه بارگذاری شده' : 'بارگذاری تاریخچه'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink"><bdi dir="ltr">{c.name}</bdi></p>
                          <p className="text-xs text-muted">
                            TVL <MoneyValue value={c.tvl} compact />
                          </p>
                        </div>
                        <span className="hidden w-24 shrink-0 sm:block">
                          {c.history ? (
                            <Sparkline points={downsample(c.history, 40)} positive={positive} />
                          ) : (
                            <span className="block text-center text-2xs text-subtle">{c.loadingHist ? '…' : 'بارگذاری روند'}</span>
                          )}
                        </span>
                        <span className="w-24 shrink-0 text-end">
                          <Change c={ch} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          )}
          <p className="text-xs text-muted">
            {toFaDigits(chains.length)} زنجیره فعال · برای زنجیره‌های بدون تاریخچه، روی ردیف بزنید تا روند بارگذاری شود.
          </p>
        </div>
      )}

      {/* ================= heatmap ================= */}
      {view === 'heatmap' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl label="بازه" options={PERIOD_OPTS} value={period} onChange={setPeriod} size="sm" />
            <ul className="flex flex-wrap items-center gap-3" aria-label="راهنمای رنگ">
              {([4, 3, 0, 2, 1] as const).map((l) => (
                <li key={l} className="flex items-center gap-1.5 text-xs text-muted">
                  <span aria-hidden className={cn('h-3 w-3 rounded-sm', HEAT[l].split(' ')[0])} />
                  {FLOW_LABEL[l]}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {heatChains.map((c) => {
              const ch = c.changes[periodNum(period)];
              const level = flowLevel(ch?.pct ?? null);
              return (
                <div
                  key={c.name}
                  className={cn('flex min-w-0 flex-col items-center gap-0.5 rounded-control px-1.5 py-2.5', HEAT[level])}
                  title={`${c.name} — ${FLOW_LABEL[level]}`}
                >
                  <bdi dir="ltr" className="w-full truncate text-center text-xs font-semibold">{c.name}</bdi>
                  <span className="num-ltr text-2xs font-semibold opacity-90">
                    {ch ? `${ch.pct > 0 ? '+' : ''}${ch.pct.toFixed(1)}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= protocols ================= */}
      {view === 'protocols' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={protoQuery} onChange={setProtoQuery} placeholder="جستجوی پروتکل…" className="min-w-0 flex-1 md:max-w-xs" />
            <div className="w-48">
              <Select aria-label="مرتب‌سازی" value={protoSort} onChange={(e) => setProtoSort(e.target.value as typeof protoSort)}>
                <option value="tvl">بیشترین TVL</option>
                <option value="grow7">بیشترین رشد ۷ روزه</option>
                <option value="drop7">بیشترین افت ۷ روزه</option>
                <option value="grow1">سریع‌ترین ورود ۱ روزه</option>
                <option value="drop1">سریع‌ترین خروج ۱ روزه</option>
              </Select>
            </div>
          </div>
          {protoRows.length === 0 ? (
            <EmptyState message="پروتکلی یافت نشد" />
          ) : (
            <Surface className="overflow-hidden">
              <table className="data-table">
                <caption className="sr-only">پروتکل‌ها</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-4 md:!ps-5">پروتکل</th>
                    <th scope="col" className="col-num hidden sm:table-cell">TVL</th>
                    <th scope="col" className="col-num">۷ روز</th>
                    <th scope="col" className="col-num !pe-4 md:!pe-5">۱ روز</th>
                  </tr>
                </thead>
                <tbody>
                  {protoRows.map((p) => (
                    <tr key={p.s}>
                      <td className="!ps-4 md:!ps-5">
                        <div className="flex items-center gap-3">
                          {p.lg ? (
                            <img
                              src={p.lg}
                              alt=""
                              loading="lazy"
                              className="h-7 w-7 shrink-0 rounded-full bg-card object-contain ring-1 ring-divider"
                              onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
                            />
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-bold text-muted">
                              {p.n.slice(0, 1)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="max-w-[10rem] truncate font-semibold text-ink sm:max-w-[16rem]"><bdi dir="ltr">{p.n}</bdi></p>
                            <p className="max-w-[10rem] truncate text-xs text-muted sm:max-w-[16rem]">
                              {p.cat} · {p.ch}
                              <span className="sm:hidden"> · <MoneyValue value={p.t} compact /></span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="col-num hidden font-semibold text-ink sm:table-cell"><MoneyValue value={p.t} compact /></td>
                      <td className="col-num"><PercentValue value={p.c7} /></td>
                      <td className="col-num !pe-4 md:!pe-5"><PercentValue value={p.c1} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
          )}
          <p className="text-xs text-muted">
            API عمومی DefiLlama برای پروتکل‌ها فقط تغییر ۱ و ۷ روزه را می‌دهد؛ برای بازه‌های بلندتر، تحلیل زنجیره‌ها را ببینید.
          </p>
        </div>
      )}

      {/* ================= smart money ================= */}
      {view === 'smart' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FlowList
              title="ورود سرمایه — زنجیره‌ها (۷ روز)"
              tone="up"
              rows={smart.chainIn.map((c) => ({ key: c.name, name: c.name, usd: (c.changes[7] as PeriodChange).usd, pct: (c.changes[7] as PeriodChange).pct }))}
            />
            <FlowList
              title="خروج سرمایه — زنجیره‌ها (۷ روز)"
              tone="down"
              rows={smart.chainOut.map((c) => ({ key: c.name, name: c.name, usd: (c.changes[7] as PeriodChange).usd, pct: (c.changes[7] as PeriodChange).pct }))}
            />
            <FlowList title="ورود سرمایه — پروتکل‌ها (۷ روز)" tone="up" rows={smart.protoIn.map((p) => ({ key: p.s, name: p.n, usd: null, pct: p.c7 }))} />
            <FlowList title="خروج سرمایه — پروتکل‌ها (۷ روز)" tone="down" rows={smart.protoOut.map((p) => ({ key: p.s, name: p.n, usd: null, pct: p.c7 }))} />
          </div>
          <p className="text-xs text-muted">
            «سرمایه هوشمند» اینجا یعنی بزرگ‌ترین تغییرات مطلق TVL — ورود و خروج واقعی سرمایه، نه نوسان قیمت.
          </p>
        </div>
      )}
    </div>
  );
}

function FlowList({
  title,
  tone,
  rows
}: {
  title: string;
  tone: 'up' | 'down';
  rows: { key: string; name: string; usd: number | null; pct: number | null }[];
}) {
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  return (
    <Surface className="px-4 py-3 md:px-5">
      <h3 className={cn('flex items-center gap-1.5 text-sm font-bold', tone === 'up' ? 'text-positive' : 'text-negative')}>
        <Icon aria-hidden className="h-4 w-4" />
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">داده کافی نیست.</p>
      ) : (
        <ol className="mt-1 divide-y divide-divider">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="num-ltr w-4 shrink-0 text-xs text-subtle">{i + 1}</span>
              <bdi dir="ltr" className="min-w-0 flex-1 truncate text-start font-semibold text-ink">{r.name}</bdi>
              {r.usd !== null && <MoneyValue value={r.usd} signed compact tone="auto" className="shrink-0 text-xs" />}
              <PercentValue value={r.pct} className="w-16 shrink-0 text-end text-xs font-semibold" />
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
