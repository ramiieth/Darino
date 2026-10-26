/**
 * تب «پوزیشن برترها» — جواب «پول هوشمند کجا هم‌نظر است و آیا الان در سود است؟»
 *   بالا: جمع کل لانگ/شورت برترها · فهرست: هر بازار در یک خط با اجماع، نظر ثابت‌قدم‌ها و سود طرف غالب
 * جزئیات (نردبان لیکوئید، تک‌تک پوزیشن‌ها) در برگهٔ هر بازار. زمینه است نه سیگنال.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { usePositions } from '@/features/traders/data/useTraders';
import { HEDGE_HEAVY, againstFlow, crowdRows, crowdTotals, flowOf, steadyAgreement, type CrowdRow } from '../domain/crowd';
import { SplitBar, UsdShort, fmtPrice } from './parts';

type View = 'against' | 'consensus' | 'all';
type Scope = 'all' | 'steady';
const LIMIT = 25;
const SIDE_FA = { long: 'لانگ', short: 'شورت' } as const;

export function PositionsTab({ onCoin }: { onCoin: (coin: string) => void }) {
  const q = usePositions();
  const [picked, setView] = useState<View | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const scoped = useMemo(() => (q.data?.positions ?? []).filter((p) => scope === 'all' || p.steady), [q.data, scope]);
  const rows = useMemo(() => crowdRows(scoped), [scoped]);
  const totals = useMemo(() => crowdTotals(scoped), [scoped]);
  const agreed = rows.filter((r) => r.side);
  const flow = flowOf(totals);
  const against = againstFlow(rows, flow.side);
  // وقتی کل برترها یک‌طرفه است، پیش‌فرض «خلاف جریان» است؛ اجماع هم‌جهت با جریان چیز تازه‌ای نمی‌گوید
  const view: View = picked ?? (against.length > 0 ? 'against' : 'consensus');
  const shown = (view === 'against' ? against : view === 'consensus' ? agreed : rows).slice(0, LIMIT);

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !q.data) return <ErrorState message="پوزیشن‌های برترها دریافت نشد" onRetry={() => void q.refetch()} />;
  const net = totals.longUsd - totals.shortUsd;
  return (
    <div className="space-y-4">
      <Surface variant="focal" className="p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-ink">
            {totals.longUsd + totals.shortUsd > 0 ? (
              <>برترها روی هم <span className={net >= 0 ? 'text-positive' : 'text-negative'}>خالص {net >= 0 ? 'لانگ' : 'شورت'}</span> هستند: <UsdShort value={Math.abs(net)} /></>
            ) : (
              'پوزیشن بازی نیست'
            )}
          </p>
          <p className="text-xs text-muted">
            {toFaDigits(totals.traders)} تریدر · {toFaDigits(totals.coins)} بازار · به‌روز {fmtRelativeAge(q.data.fetchedAt)}
          </p>
        </div>
        <SplitBar long={totals.longUsd} short={totals.shortUsd} />
        {flow.side && flow.share >= HEDGE_HEAVY && (
          <Notice tone="neutral" className="mt-3">
            وقتی {toFaDigits(Math.round(flow.share * 100))}٪ پوزیشن‌ها {SIDE_FA[flow.side]} است، بخش بزرگی از آن احتمالاً پوشش داراییِ جای دیگر (هج) است، نه پیش‌بینی جهت؛
            پس «اکثراً {SIDE_FA[flow.side]}» روی تک‌تک بازارها چیز زیادی نمی‌گوید. بازارهایی که برترها <b>خلاف این جریان</b> هم‌نظرند شرط آگاهانه‌اند.
          </Notice>
        )}
      </Surface>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipGroup<View>
          label="نمایش"
          value={view}
          onChange={setView}
          options={[
            ...(flow.side ? [{ value: 'against' as const, label: `خلاف جریان (${SIDE_FA[flow.side === 'long' ? 'short' : 'long']})`, badge: against.length }] : []),
            { value: 'consensus', label: 'هم‌نظرها', badge: agreed.length },
            { value: 'all', label: 'همهٔ بازارها', badge: rows.length }
          ]}
        />
        <ChipGroup<Scope>
          label="دامنه"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'همهٔ برترها' },
            { value: 'steady', label: 'فقط ثابت‌قدم‌ها', badge: q.data.steadyTraders }
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          message={scope === 'steady' && q.data.steadyTraders === 0 ? 'هنوز کارنامهٔ تریدرها روی سرور کامل نشده' : view === 'against' ? 'الان هیچ بازاری خلاف جریان کل اجماع ندارد' : view === 'consensus' ? 'الان روی هیچ بازاری اجماع روشنی نیست' : 'پوزیشن بازی نیست'}
          hint={view !== 'all' ? 'نبود اجماع خودش یعنی جهت روشنی در کار نیست؛ «همهٔ بازارها» را ببینید.' : undefined}
        />
      ) : (
        <Surface className="divide-y divide-divider">
          {shown.map((r) => (
            <CrowdLine key={r.coin} r={r} steadyScope={scope === 'steady'} onOpen={() => onCoin(r.coin)} />
          ))}
        </Surface>
      )}

      <p className="text-xs leading-6 text-subtle">
        «هم‌نظر» یعنی هم بیشتر دلارها (۴۰٪ خالص) و هم دست‌کم ۶۰٪ تریدرها (حداقل ۳ نفر) یک طرف‌اند؛ یک نهنگ به‌تنهایی اجماع نمی‌سازد.
        بخشی از این پوزیشن‌ها جای دیگری هج شده‌اند؛ زمینه است، نه سیگنال خرید. روی هر بازار بزنید تا قیمت‌های لیکوئید و تک‌تک پوزیشن‌ها را ببینید.
      </p>
    </div>
  );
}

function CrowdLine({ r, steadyScope, onOpen }: { r: CrowdRow; steadyScope: boolean; onOpen: () => void }) {
  const lead = r.side ?? r.heavier;
  const agree = steadyScope ? 'none' : steadyAgreement(r);
  const gap = r.entryGapPct;
  return (
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-start transition-colors hover:bg-surface-2/60 md:grid-cols-[8rem_10rem_1fr_11rem_auto]">
      <div className="min-w-0">
        <p className="font-extrabold text-ink"><bdi dir="ltr">{r.coin}</bdi></p>
        <p className="text-2xs text-muted"><bdi dir="ltr">{fmtPrice(r.markPx)}</bdi></p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
        {r.side ? <Badge tone={r.side === 'long' ? 'gain' : 'loss'}>اکثراً {SIDE_FA[r.side]}</Badge> : <Badge tone="neutral">دودسته</Badge>}
        {agree === 'agree' && <span className="text-2xs font-semibold text-positive">ثابت‌قدم‌ها هم</span>}
        {agree === 'disagree' && <span className="text-2xs font-semibold text-warn">ثابت‌قدم‌ها مخالف</span>}
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <SplitBar long={r.longUsd} short={r.shortUsd} labels={false} />
        <p className="mt-1 text-2xs text-muted">
          {toFaDigits(r.traders)} تریدر · خالص <MoneyValue value={r.netUsd} compact signed tone="auto" />
        </p>
      </div>
      <p className={cn('text-xs font-semibold', gap === null ? 'text-subtle' : gap >= 0 ? 'text-positive' : 'text-negative')}>
        {gap === null
          ? '—'
          : `${SIDE_FA[lead]}‌ها ${toFaDigits(Math.abs(gap).toLocaleString('en-US', { maximumFractionDigits: 1 }))}٪ ${gap >= 0 ? 'در سود' : 'در زیان'}`}
      </p>
      <ChevronLeft className="hidden h-4 w-4 text-subtle md:block" aria-hidden />
    </button>
  );
}
