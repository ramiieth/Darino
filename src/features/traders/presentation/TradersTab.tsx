/**
 * تب «تریدرهای برتر» — برترین‌های هایپرلیکوئید با خلاصهٔ سرور + «آدرس‌های من» (همگام بین دستگاه‌ها)
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Cloud, CloudOff, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { toast } from '@/shared/store/toastStore';
import { toFaDigits } from '@/shared/utils/formatters';
import { isHlAddress, type Candidate } from '../domain/candidates';
import { isSteady, type TraderSummary } from '../domain/summary';
import { useSummaries, useTradersList } from '../data/useTraders';
import { MAX_SAVED, useSavedTraders } from '../data/savedTraders';
import { LIST_MIN_TRADES, TraderRow } from './TraderRow';
import { useFollow } from './useFollow';

type View = 'top' | 'mine';
type Sort = 'months' | 'allTime' | 'month' | 'winRate';
const PAGE = 20;

const BY: Record<Sort, (c: Candidate, s: TraderSummary | undefined) => number> = {
  allTime: (c) => c.windows.allTime.pnl,
  month: (c) => c.windows.month.pnl,
  // ثبات: درصد ماه‌های سودده (حداقل ۶ ماه)، هم‌امتیازها با افت کمتر
  months: (_c, s) => (s && s.months >= 6 ? (s.positiveMonths / s.months) * 1000 - (s.maxDrawdownPct ?? 100) : -Infinity),
  winRate: (_c, s) => (s && s.closedCount >= LIST_MIN_TRADES && s.winRate !== null ? s.winRate * 1000 + Math.min(s.profitFactor ?? (s.allWins ? 999 : 0), 999) : -Infinity)
};

export function TradersTab({ view, onView, onOpen }: { view: View; onView: (v: View) => void; onOpen: (address: string) => void }) {
  const saved = useSavedTraders((s) => s.saved);
  return (
    <>
      <SegmentedControl<View>
        className="mb-5"
        label="بخش"
        value={view}
        onChange={onView}
        options={[
          { value: 'top', label: 'برترین‌ها' },
          { value: 'mine', label: 'آدرس‌های من', badge: saved.length || undefined }
        ]}
      />
      {view === 'top' ? <TopList onOpen={onOpen} /> : <MineList onOpen={onOpen} />}
    </>
  );
}

function TopList({ onOpen }: { onOpen: (a: string) => void }) {
  const list = useTradersList();
  const [sort, setSort] = useState<Sort>('months');
  const [shown, setShown] = useState(PAGE);
  const { isFollowing, toggle } = useFollow();
  const candidates = list.data?.candidates ?? [];
  const summaries = useSummaries(candidates.map((c) => c.address));
  const map = summaries.data?.summaries ?? {};
  const analyzed = Object.keys(map).length;
  const rows = useMemo(
    () => [...candidates].sort((a, b) => BY[sort](b, map[b.address]) - BY[sort](a, map[a.address]) || b.windows.allTime.pnl - a.windows.allTime.pnl),
    [candidates, map, sort]
  );
  const steady = candidates.filter((c) => isSteady(map[c.address])).length;

  if (list.isLoading) return <ListSkeleton rows={6} />;
  if (list.isError) return <ErrorState message="فهرست تریدرهای برتر دریافت نشد" hint="در «آدرس‌های من» هر آدرسی را دستی بررسی کنید." onRetry={() => void list.refetch()} />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ChipGroup<Sort>
          label="مرتب‌سازی"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'months', label: 'ثبات (ماه‌های سودده)' },
            { value: 'winRate', label: 'نرخ برد معاملات' },
            { value: 'allTime', label: 'سود کل' },
            { value: 'month', label: 'سود ۳۰ روز' }
          ]}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted">
          {(summaries.data?.pending ?? 0) > 0 && <RefreshCw className="h-3.5 w-3.5 animate-spin text-subtle" aria-hidden />}
          <span>تحلیل‌شده {toFaDigits(analyzed)} از {toFaDigits(candidates.length)}</span>
          <span aria-hidden>·</span>
          <span>{toFaDigits(steady)} ثابت‌قدم</span>
        </p>
      </div>
      <p className="mb-4 text-xs leading-6 text-muted">
        از {toFaDigits((list.data?.totalAccounts ?? 0).toLocaleString('en-US'))} حساب، فقط بالای ۱۰۰ هزار دلار و سودده در کل سابقه و ۳۰ روز اخیر؛ مارکت‌میکرها حذف شده‌اند.
        «ثابت‌قدم» یعنی حداقل ۶ ماه سابقه، ۶۰٪ ماه‌ها سودده و افت کمتر از ۵۰٪. کارنامه‌ها روی سرور محاسبه و هر ۶ ساعت به‌روز می‌شوند.
      </p>
      <div className="grid gap-3 xl:grid-cols-2">
        {rows.slice(0, shown).map((c, i) => (
          <TraderRow
            key={c.address}
            rank={i + 1}
            address={c.address}
            name={c.displayName}
            leader={c}
            summary={map[c.address]}
            loading={summaries.isLoading || (summaries.data?.pending ?? 0) > 0}
            following={isFollowing(c.address)}
            onToggleFollow={() => toggle(c.address, c.displayName)}
            onOpen={() => onOpen(c.address)}
          />
        ))}
      </div>
      {shown < rows.length && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setShown((n) => n + PAGE)}>
          نمایش {toFaDigits(Math.min(PAGE, rows.length - shown))} تریدر دیگر
        </Button>
      )}
    </>
  );
}

function MineList({ onOpen }: { onOpen: (a: string) => void }) {
  const { saved, add, remove, sync } = useSavedTraders();
  const { isFollowing, toggle } = useFollow();
  const summaries = useSummaries(saved.map((s) => s.address));
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const valid = isHlAddress(address);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = add(address, label);
    if (result === 'invalid') return setError('آدرس باید با 0x شروع شود و ۴۲ کاراکتر باشد');
    if (result === 'full') return setError(`حداکثر ${toFaDigits(MAX_SAVED)} آدرس ذخیره می‌شود`);
    toast(result === 'exists' ? 'info' : 'success', result === 'exists' ? 'این آدرس از قبل در فهرست است' : 'آدرس اضافه شد');
    setAddress('');
    setLabel('');
    setError('');
  };

  return (
    <>
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted">
        {sync === 'synced' || sync === 'syncing' ? (
          <><Cloud className="h-4 w-4 text-positive" aria-hidden /> {sync === 'syncing' ? 'در حال همگام‌سازی…' : 'همگام با حساب شما در همهٔ دستگاه‌ها'}</>
        ) : sync === 'error' ? (
          <><CloudOff className="h-4 w-4 text-warn" aria-hidden /> همگام‌سازی انجام نشد؛ روی این دستگاه ذخیره است و بعداً دوباره تلاش می‌شود</>
        ) : (
          <><CloudOff className="h-4 w-4 text-subtle" aria-hidden /> فقط روی این دستگاه؛ برای همگام‌سازی بین گوشی و کامپیوتر و اعلان‌ها وارد حساب شوید</>
        )}
      </p>
      <form onSubmit={submit} className="mb-6 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="آدرس کیف پول هایپرلیکوئید" error={error || undefined}>
          <Input dir="ltr" className="font-latin" autoComplete="off" spellCheck={false} placeholder="0x…" value={address} onChange={(e) => { setAddress(e.target.value); setError(''); }} />
        </Field>
        <Field label="نام (اختیاری)">
          <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="outline" icon={<Search />} disabled={!valid} onClick={() => onOpen(address.trim().toLowerCase())}>بررسی</Button>
          <Button type="submit" icon={<Plus />} disabled={!address.trim()}>افزودن</Button>
        </div>
      </form>
      {saved.length === 0 ? (
        <EmptyState message="هنوز آدرسی اضافه نکرده‌اید" hint="آدرس هر تریدری را که می‌شناسید وارد کنید، یا از «برترین‌ها» روی «افزودن به آدرس‌های من» یا زنگولهٔ اعلان بزنید." />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {saved.map((s) => (
            <TraderRow
              key={s.address}
              address={s.address}
              name={s.label}
              summary={summaries.data?.summaries[s.address]}
              loading={summaries.isLoading || (summaries.data?.pending ?? 0) > 0}
              following={isFollowing(s.address)}
              onToggleFollow={() => toggle(s.address, s.label)}
              onOpen={() => onOpen(s.address)}
              onRemove={() => remove(s.address)}
            />
          ))}
        </div>
      )}
    </>
  );
}
