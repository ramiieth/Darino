/**
 * تب «تریدرهای برتر» — جواب «چه کسی ارزش دنبال کردن دارد و الان چه می‌کند؟»
 *  - برترین‌ها: پیش‌فرض فقط «شایسته‌ها» (امتیاز ثبات ≥ ۶۵)، به ترتیب امتیاز، با پوزیشن فعلی هر نفر
 *  - آدرس‌های من: همگام بین دستگاه‌ها
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Cloud, CloudOff, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { toast } from '@/shared/store/toastStore';
import { toFaDigits } from '@/shared/utils/formatters';
import { isHlAddress } from '../domain/candidates';
import { GOOD_SCORE, booksByAddress, qualityScore } from '../domain/quality';
import { usePositions, useSummaries, useTradersList } from '../data/useTraders';
import { MAX_SAVED, useSavedTraders } from '../data/savedTraders';
import { TraderRow } from './TraderRow';
import { useFollow } from './useFollow';

type View = 'top' | 'mine';
type Filter = 'good' | 'copy' | 'all';
const PAGE = 12;

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
  const positions = usePositions();
  const [filter, setFilter] = useState<Filter>('good');
  const [shown, setShown] = useState(PAGE);
  const { isFollowing, toggle } = useFollow();
  const candidates = list.data?.candidates ?? [];
  const summaries = useSummaries(candidates.map((c) => c.address));
  const map = summaries.data?.summaries ?? {};
  const pending = summaries.isLoading || (summaries.data?.pending ?? 0) > 0;
  const books = useMemo(() => booksByAddress(positions.data?.positions ?? []), [positions.data]);

  const scored = useMemo(
    () =>
      candidates
        .map((c) => ({ c, s: map[c.address], score: qualityScore(map[c.address]) }))
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.c.windows.allTime.pnl - a.c.windows.allTime.pnl),
    [candidates, map]
  );
  const good = scored.filter((x) => x.score !== null && x.score >= GOOD_SCORE);
  const copy = good.filter((x) => x.s?.copyability === 'manual');
  const rows = filter === 'good' ? good : filter === 'copy' ? copy : scored;

  if (list.isLoading) return <ListSkeleton rows={6} />;
  if (list.isError) return <ErrorState message="فهرست تریدرهای برتر دریافت نشد" hint="در «آدرس‌های من» هر آدرسی را دستی بررسی کنید." onRetry={() => void list.refetch()} />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ChipGroup<Filter>
          label="فیلتر"
          value={filter}
          onChange={(v) => { setFilter(v); setShown(PAGE); }}
          options={[
            { value: 'good', label: 'شایستهٔ دنبال کردن', badge: good.length || undefined },
            { value: 'copy', label: 'قابل کپی دستی', badge: copy.length || undefined },
            { value: 'all', label: 'همه', badge: candidates.length || undefined }
          ]}
        />
        {pending && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-subtle" aria-hidden />
            تحلیل کارنامه‌ها {toFaDigits(Object.keys(map).length)} از {toFaDigits(candidates.length)}
          </p>
        )}
      </div>
      <Disclosure className="mb-4" summary="امتیاز ثبات چیست و این فهرست چطور ساخته می‌شود؟">
        <div className="space-y-2 text-xs leading-6 text-muted">
          <p>
            سود دلاری کل فقط اندازهٔ حساب را نشان می‌دهد، نه مهارت را. امتیاز ثبات (۰ تا ۱۰۰) از چیزهایی ساخته می‌شود که یک ماه خوش‌شانس آن‌ها را نمی‌سازد:
            ۴۰ امتیاز سهم ماه‌های سودده، ۳۰ امتیاز کم بودن بدترین افت ۱۲ ماه، ۱۵ امتیاز طول سابقه (تا ۱۲ ماه) و ۱۵ امتیاز نسبت سود به ضرر معاملات.
            {' '}{toFaDigits(GOOD_SCORE)} و بالاتر «شایستهٔ دنبال کردن» است. مارکت‌میکرها و حساب‌های زیر ۳ ماه امتیاز نمی‌گیرند.
          </p>
          <p>
            از {toFaDigits((list.data?.totalAccounts ?? 0).toLocaleString('en-US'))} حساب هایپرلیکوئید فقط حساب‌های بالای ۱۰۰ هزار دلار که هم در کل سابقه و هم در ۳۰ روز اخیر سودده‌اند بررسی می‌شوند.
            «قابل کپی دستی» یعنی معامله‌ها چند ساعت یا بیشتر باز می‌مانند و با چند دقیقه تأخیر هم می‌شود دنبالشان کرد. کارنامه‌ها هر ۶ ساعت و پوزیشن‌ها هر ۵ دقیقه به‌روز می‌شوند.
            عملکرد گذشته تضمین آینده نیست.
          </p>
        </div>
      </Disclosure>
      {rows.length === 0 ? (
        pending ? (
          <EmptyState
            message="کارنامه‌ها هنوز در حال تحلیل‌اند"
            hint="امتیاز هر تریدر بعد از تحلیل کامل سابقه‌اش محاسبه می‌شود (معمولاً چند دقیقه). تا آن موقع فهرست «همه» را ببینید."
            action={<Button size="sm" variant="outline" onClick={() => setFilter('all')}>نمایش همه</Button>}
          />
        ) : (
          <EmptyState message="الان هیچ تریدری این شرط را ندارد" hint="فیلتر «همه» را ببینید؛ امتیازها با به‌روز شدن کارنامه‌ها تغییر می‌کنند." />
        )
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.slice(0, shown).map(({ c, s }, i) => (
            <TraderRow
              key={c.address}
              rank={i + 1}
              address={c.address}
              name={c.displayName}
              leader={c}
              summary={s}
              book={positions.data ? books.get(c.address) ?? null : undefined}
              loading={pending}
              following={isFollowing(c.address)}
              onToggleFollow={() => toggle(c.address, c.displayName)}
              onOpen={() => onOpen(c.address)}
            />
          ))}
        </div>
      )}
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
  const positions = usePositions();
  const books = useMemo(() => booksByAddress(positions.data?.positions ?? []), [positions.data]);
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
        <EmptyState message="هنوز آدرسی اضافه نکرده‌اید" hint="آدرس هر تریدری را که می‌شناسید وارد کنید، یا در کارنامهٔ یکی از برترین‌ها «افزودن به آدرس‌های من» یا زنگولهٔ اعلان را بزنید." />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {saved.map((s) => (
            <TraderRow
              key={s.address}
              address={s.address}
              name={s.label}
              summary={summaries.data?.summaries[s.address]}
              book={books.get(s.address)}
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
