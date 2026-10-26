/**
 * تب «میم‌کوین» — دو حالت، هر دو بر پایهٔ آزمون یک سال میم‌کوین‌های سولانا:
 *   محافظ سرمایه (پیش‌فرض): یک حکم روشن برای امروز (رژیم بازار + تعداد آماده‌ها) و فهرست فشرده با دلیل رد هر کوین؛
 *     فهرست انتظار کاربر هم یک دستهٔ جداست تا گم نشود
 *   بلیت بخت‌آزمایی: آگاهانه و محدود — بودجهٔ حداکثر ۵٪ در دست‌کم ۲۰ بلیت، فقط توکن‌های بدون خطر امنیتی،
 *     امن‌تر و نقدشونده‌تر اول
 * فهرست «تازه‌ها» حذف شد: از ۴۸ توکن تازهٔ معامله‌شده، یک ساعت بعد هیچ‌کدام معامله نداشت.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ShieldCheck, Ticket, X } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { IconButton } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { toast } from '@/shared/store/toastStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { useAuth } from '@/features/auth/authClient';
import { useMemes, useMemeScreen, type MemeRow } from '../data/intelApi';
import { useMemeWatch } from '../data/memeWatch';
import {
  EXIT_PLAN,
  LOTTERY,
  LOTTERY_FLAG_FA,
  REGIME_BREADTH,
  exitPlan,
  firstFailure,
  groupOf,
  lotteryFlags,
  lotteryPlan,
  rankLottery,
  todayVerdict,
  type CoinScreen,
  type Regime,
  type ScreenGroup,
  type Verdict
} from '../domain/memeScreen';
import { SplitBar, VerdictBadge, fmtAge, fmtPrice } from './parts';

type Mode = 'guard' | 'lottery';

export function MemesTab({ onToken }: { onToken: (address: string) => void }) {
  const [mode, setMode] = useState<Mode>('guard');
  const authStatus = useAuth((s) => s.status);
  const hydrate = useMemeWatch((s) => s.hydrate);
  useEffect(() => {
    if (authStatus !== 'unknown') void hydrate(authStatus === 'authenticated');
  }, [authStatus, hydrate]);

  return (
    <>
      <SegmentedControl<Mode>
        className="mb-4"
        label="حالت"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'guard', label: 'محافظ سرمایه', icon: <ShieldCheck /> },
          { value: 'lottery', label: 'بلیت بخت‌آزمایی', icon: <Ticket /> }
        ]}
      />
      {mode === 'guard' ? <GuardView onToken={onToken} authed={authStatus === 'authenticated'} /> : <LotteryView onToken={onToken} />}
    </>
  );
}

/* ---------------- محافظ سرمایه ---------------- */

type View = ScreenGroup | 'mine';

const VERDICT: Record<Verdict, { tone: Tone; border: string; title: (ready: number) => string; body: string }> = {
  buy: {
    tone: 'gain',
    border: 'border-gain/50',
    title: (n) => `${toFaDigits(n)} کوین آمادهٔ خرید با برنامهٔ خروج`,
    body: 'بازار میم صعودی است و این کوین‌ها همهٔ فیلترها را رد کرده‌اند. فقط با حجمی بخرید که صفر شدنش برایتان مهم نیست، و حد ضرر را همان لحظه بگذارید.'
  },
  wait: {
    tone: 'warn',
    border: 'border-warn/50',
    title: () => 'صبر کنید: بازار صعودی است، ولی هیچ کوینی همهٔ فیلترها را رد نکرده',
    body: 'کوین‌های فهرست انتظار را دنبال کنید؛ وقتی یکی آماده شد اعلان می‌گیرید.'
  },
  avoid: {
    tone: 'loss',
    border: 'border-negative/40',
    title: () => 'امروز نخرید: بازار میم نزولی است',
    body: 'در آزمون، خرید در این حالت حتی با همهٔ فیلترها به‌طور میانگین ضرر داد. بهترین کار ساختن فهرست انتظار برای روز برگشت بازار است.'
  },
  unknown: {
    tone: 'neutral',
    border: 'border-divider',
    title: () => 'هنوز دادهٔ کافی برای حکم امروز نیست',
    body: 'رژیم بازار وقتی مشخص می‌شود که دست‌کم ۱۰ کوین ۵۰ روز تاریخچه داشته باشند.'
  }
};

function GuardView({ onToken, authed }: { onToken: (address: string) => void; authed: boolean }) {
  const q = useMemeScreen();
  const watchIds = useMemeWatch((s) => s.ids);
  const [picked, setPicked] = useState<View | null>(null);
  const coins = q.data?.coins ?? [];
  const groups = useMemo(() => {
    const g: Record<View, CoinScreen[]> = { ready: [], watch: [], rejected: [], mine: [] };
    for (const c of coins) g[groupOf(c)].push(c);
    g.mine = coins.filter((c) => watchIds.includes(c.id));
    return g;
  }, [coins, watchIds]);

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !q.data) return <ErrorState message="غربال میم‌کوین دریافت نشد" onRetry={() => void q.refetch()} />;
  const d = q.data;
  const order: View[] = ['ready', 'watch', 'mine', 'rejected'];
  const view: View = picked ?? order.find((v) => groups[v].length > 0) ?? 'ready';
  const rows = groups[view];

  return (
    <div className="space-y-4">
      <VerdictCard regime={d.regime} ready={groups.ready.length} watch={groups.watch.length} pending={d.pending} total={d.total} fetchedAt={d.fetchedAt} />

      <ChipGroup<View>
        label="دسته"
        value={view}
        onChange={setPicked}
        options={[
          { value: 'ready', label: 'آماده', badge: groups.ready.length },
          { value: 'watch', label: 'فهرست انتظار پیشنهادی', badge: groups.watch.length },
          { value: 'mine', label: 'فهرست من', badge: groups.mine.length },
          { value: 'rejected', label: 'ردشده‌ها', badge: groups.rejected.length }
        ]}
      />
      <p className="text-xs leading-6 text-muted">
        {view === 'ready' && 'از هر چهار فیلتر گذشته‌اند: بقا، روند، بدون نشانهٔ نقدینگی خروج، امنیت.'}
        {view === 'watch' && 'زنده و از نظر امنیت سالم، ولی روندشان هنوز برنگشته. زنگ را بزنید تا وقتی آماده شدند و بازار هم صعودی بود اعلان بگیرید.'}
        {view === 'mine' && 'کوین‌هایی که دنبال می‌کنید، با وضعیت امروزشان.'}
        {view === 'rejected' && 'دست‌کم یک فیلتر را رد نکرده‌اند؛ اولین دلیل کنار هر کوین آمده است.'}
        {(view === 'watch' || view === 'mine') && !authed && ' اعلان فقط بعد از ورود به حساب فعال می‌شود.'}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          message={view === 'ready' ? 'امروز هیچ کوینی همهٔ فیلترها را رد نکرد' : view === 'mine' ? 'هنوز کوینی را دنبال نمی‌کنید' : 'فعلاً کوینی در این دسته نیست'}
          hint={view === 'ready' ? 'این خودش یک جواب است: سیستم می‌گوید نخرید.' : view === 'mine' ? 'در «فهرست انتظار پیشنهادی» روی زنگ کوین‌ها بزنید.' : undefined}
        />
      ) : (
        <Surface className="divide-y divide-divider">
          {rows.map((c) => <CoinLine key={c.id} c={c} regime={d.regime} onToken={onToken} />)}
        </Surface>
      )}

      <Disclosure summary="این فیلترها از کجا آمده‌اند؟">
        <p className="text-xs leading-6 text-muted">
          آزمون روی ۱۴۸ میم‌کوین تصادفی سولانا از CoinGecko (شامل مرده‌ها)، اکتبر ۲۰۲۵ تا اکتبر ۲۰۲۶، با ۴٪ هزینهٔ رفت‌وبرگشت.
          خرید روز لیست: ۱۳٪ معاملات سودده، میانه ‎−۶۲٪، و ۶۸٪ بیش از نصف سرمایه را باختند. با همهٔ این فیلترها و برنامهٔ خروج: ۲۴٪ سودده، میانه ‎−۹٪، و هیچ معامله‌ای بیش از ۵۰٪ نباخت.
          در آن سال شاخص میم‌ها ۹۲٪ سقوط کرد و هیچ پروفایلی روی دادهٔ دیده‌نشده سود نساخت؛ کار این غربال مهار ضرر و آماده نگه داشتن فهرست سالم برای برگشت بازار است.
          هرچه کوین مسن‌تر بود ضرر کمتر بود (حداقل ۳ روز ‎−۱۴٪، ۶۰ روز ‎−۵٪). رژیم بازار «دست‌کم ۷۰٪ کوین‌ها بالای میانگین ۵۰ روزهٔ خودشان» است؛ کمی خوش‌بین‌تر از شاخص آزموده (در یک سال ۳۲ روز روشن در برابر ۲۴). توصیهٔ مالی نیست.
        </p>
      </Disclosure>
    </div>
  );
}

function VerdictCard({ regime, ready, watch, pending, total, fetchedAt }: { regime: Regime; ready: number; watch: number; pending: number; total: number; fetchedAt: number }) {
  const v = VERDICT[todayVerdict(regime, ready)];
  const breadth = regime.breadth === null ? null : Math.round(regime.breadth * 100);
  return (
    <Surface variant="focal" className={cn('border-2 p-5', v.border)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold text-ink">{v.title(ready)}</h3>
      </div>
      <p className="mt-1.5 text-sm leading-7 text-muted">{v.body}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-divider pt-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 sm:col-span-1">
          <p className="text-2xs font-semibold text-muted">رژیم بازار میم: کوین‌های بالای میانگین ۵۰ روزه</p>
          <div dir="ltr" className="relative mt-2 h-2 rounded-full bg-surface-2" role="img" aria-label={`${breadth ?? 0}٪ از ۷۰٪ لازم`}>
            <span className={cn('absolute inset-y-0 left-0 rounded-full', regime.state === 'on' ? 'bg-gain' : 'bg-warn')} style={{ width: `${breadth ?? 0}%` }} />
            <span className="absolute -inset-y-1 w-0.5 rounded bg-ink/60" style={{ left: `${REGIME_BREADTH * 100}%` }} aria-hidden />
          </div>
          <p className="mt-1.5 text-2xs text-subtle">
            {breadth === null ? 'هنوز محاسبه نشده' : `${toFaDigits(breadth)}٪`} · لازم برای صعودی {toFaDigits(REGIME_BREADTH * 100)}٪
            {regime.state === 'unknown' && ` · ${toFaDigits(regime.counted)} کوین با تاریخچهٔ کافی`}
          </p>
        </div>
        <div>
          <p className="text-2xs font-semibold text-muted">آماده</p>
          <p className="mt-1 text-xl font-extrabold text-ink">{toFaDigits(ready)}</p>
        </div>
        <div>
          <p className="text-2xs font-semibold text-muted">فهرست انتظار</p>
          <p className="mt-1 text-xl font-extrabold text-ink">{toFaDigits(watch)}</p>
        </div>
      </div>
      <p className="mt-3 text-2xs text-subtle">
        {pending > 0 ? `${toFaDigits(total - pending)} از ${toFaDigits(total)} کوین تحلیل شده؛ بقیه هر ۱۰ دقیقه روی سرور تازه می‌شوند · ` : ''}
        به‌روز {fmtRelativeAge(fetchedAt)}
      </p>
    </Surface>
  );
}

const FILTERS = (c: CoinScreen) => [
  { label: 'بقا', ok: c.gate },
  { label: 'روند', ok: c.trend },
  { label: 'خروج', ok: c.exitLiq.ok },
  { label: 'امنیت', ok: c.safety.ok }
];

function CoinLogo({ image, symbol }: { image: string | null; symbol: string }) {
  return image ? (
    <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full bg-surface-2 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-bold text-muted" aria-hidden>{symbol.slice(0, 3)}</span>
  );
}

function CoinLine({ c, regime, onToken }: { c: CoinScreen; regime: Regime; onToken: (address: string) => void }) {
  const watching = useMemeWatch((s) => s.ids.includes(c.id));
  const toggle = useMemeWatch((s) => s.toggle);
  const fail = firstFailure(c);
  const plan = c.passes && c.price ? exitPlan(c.price) : null;
  return (
    <article className="px-4 py-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[auto_12rem_9rem_1fr_auto]">
        <CoinLogo image={c.image} symbol={c.symbol} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-extrabold text-ink">
            <bdi dir="ltr">{c.symbol}</bdi>
            {c.passes && <Badge tone={regime.state === 'on' ? 'gain' : 'warn'}>{regime.state === 'on' ? 'آماده' : 'آماده؛ بازار نزولی'}</Badge>}
          </p>
          <p className="truncate text-2xs text-muted"><bdi dir="ltr">{c.name}</bdi> · <MoneyValue value={c.marketCap} compact /></p>
        </div>
        <div className="flex shrink-0 items-center gap-1 md:order-last">
          <IconButton
            size="sm"
            aria-label={watching ? 'حذف از فهرست انتظار' : 'افزودن به فهرست انتظار'}
            className={cn(watching && 'text-accent hover:text-accent')}
            onClick={() => { if (toggle(c.id) === 'full') toast('error', 'حداکثر ۳۰ کوین در فهرست انتظار'); }}
          >
            <Bell className={cn(watching && 'fill-current')} />
          </IconButton>
          {c.mint && (
            <IconButton size="sm" aria-label="کارنامهٔ امنیت" onClick={() => onToken(c.mint!)}>
              <ShieldCheck />
            </IconButton>
          )}
        </div>
        <div className="col-span-3 flex items-center gap-4 text-xs md:col-span-1">
          <span><span className="text-2xs text-muted">۳۰ روز </span><PercentValue value={c.ret30Pct} digits={0} className="font-bold" /></span>
          <span><span className="text-2xs text-muted">تا قله </span><PercentValue value={c.athChangePct} digits={0} tone="none" className="font-bold text-ink" /></span>
        </div>
        <div className="col-span-3 min-w-0 md:col-span-1">
          <ul className="flex flex-wrap gap-1.5" aria-label="فیلترها">
            {FILTERS(c).map((f) => (
              <li key={f.label} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold', f.ok ? 'bg-gain/10 text-positive' : f.ok === null ? 'bg-surface-2 text-muted' : 'bg-negative/10 text-negative')}>
                {f.ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                {f.label}
                <span className="sr-only">{f.ok ? 'رد شد' : 'رد نشد'}</span>
              </li>
            ))}
          </ul>
          {fail && <p className="mt-1 truncate text-2xs text-muted" title={fail.why}><span className="font-semibold text-ink">{fail.filter}:</span> {fail.why}</p>}
        </div>
      </div>
      {plan && (
        <p className="mt-2 rounded-field bg-surface-2/70 px-3 py-2 text-2xs leading-6 text-muted">
          <span className="font-semibold text-ink">برنامهٔ خروج: </span>
          حد ضرر <bdi dir="ltr">{fmtPrice(plan.stop)}</bdi> (‎−{toFaDigits(EXIT_PLAN.stopPct)}٪) · فروش نصف در <bdi dir="ltr">{fmtPrice(plan.takeHalf)}</bdi> ({toFaDigits(EXIT_PLAN.halfAtMultiple)} برابر) · خروج کامل با بسته شدن زیر میانگین {toFaDigits(EXIT_PLAN.trendMa)} روزه
        </p>
      )}
    </article>
  );
}

/* ---------------- بلیت بخت‌آزمایی ---------------- */

function LotteryView({ onToken }: { onToken: (address: string) => void }) {
  const [capital, setCapital] = useState('1000');
  const [tickets, setTickets] = useState(String(25));
  const plan = lotteryPlan(Number(capital) || 0, Number(tickets));
  const q = useMemes('trending');
  const { shown, dropped } = useMemo(() => {
    const all = q.data?.tokens ?? [];
    const ok = all.filter((t) => t.dex !== 'pump-fun' && t.safety.verdict !== 'danger');
    return { shown: rankLottery(ok), dropped: all.length - ok.length };
  }, [q.data]);

  return (
    <div className="space-y-4">
      <Notice tone="warn" title="قمار آگاهانه است، نه سرمایه‌گذاری">
        در آزمون، خرید بعد از یک روز +۱۰۰٪ میانهٔ ‎−۶۰٪ داشت و کل سود سبد فقط از ۳ معامله از ۶۵ آمد. بدون آن ۳ برنده، سود صفر بود.
      </Notice>

      <Surface variant="focal" className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
        <div>
          <h3 className="mb-3 text-sm font-bold text-ink">برنامهٔ بلیت شما</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="کل سرمایهٔ شما (دلار)">
              <Input type="number" inputMode="decimal" dir="ltr" min={0} value={capital} onChange={(e) => setCapital(e.target.value)} suffix="$" />
            </Field>
            <Field label={`تعداد بلیت (${toFaDigits(LOTTERY.minTickets)} تا ${toFaDigits(LOTTERY.maxTickets)})`}>
              <Input type="number" inputMode="numeric" dir="ltr" min={LOTTERY.minTickets} max={LOTTERY.maxTickets} value={tickets} onChange={(e) => setTickets(e.target.value)} />
            </Field>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-divider pt-4">
            <div>
              <dt className="text-2xs font-semibold text-muted">بودجهٔ کل ({toFaDigits(LOTTERY.maxBudgetPct)}٪ سرمایه)</dt>
              <dd className="mt-1 text-xl font-extrabold text-ink"><MoneyValue value={plan.budget} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-semibold text-muted">هر بلیت ({toFaDigits(plan.tickets)} بلیت)</dt>
              <dd className="mt-1 text-xl font-extrabold text-ink"><MoneyValue value={plan.perTicket} /></dd>
            </div>
          </dl>
        </div>
        <ol className="list-inside list-decimal space-y-1.5 self-center rounded-field bg-surface-2/70 p-4 text-xs leading-6 text-muted">
          <li>همهٔ بلیت‌ها هم‌اندازه؛ به بلیت بازنده هرگز اضافه نکنید.</li>
          <li>بودجه را بعد از باخت دوباره شارژ نکنید.</li>
          <li>بلیتی که ۲ برابر شد، نصفش را بفروشید تا سرمایه‌اش برگردد.</li>
          <li>ترند بودن یعنی قبلاً رشد کرده، نه این‌که رشد خواهد کرد.</li>
        </ol>
      </Surface>

      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.isError || !q.data ? (
        <ErrorState message="فهرست میم‌کوین‌ها دریافت نشد" onRetry={() => void q.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState message="هیچ توکن ترندی از فیلتر امنیت رد نشد" />
      ) : (
        <>
          <p className="text-xs text-muted">
            داغ‌ترین‌های سولانا، بدون خطر شناخته‌شده و نقدشونده‌تر اول · {dropped > 0 && `${toFaDigits(dropped)} توکن پرخطر یا روی بوندینگ‌کرو pump.fun حذف شد · `}به‌روز {fmtRelativeAge(q.data.fetchedAt)}
          </p>
          <Surface className="divide-y divide-divider">
            {shown.map((t) => <TicketLine key={t.address} t={t} onOpen={() => onToken(t.address)} />)}
          </Surface>
          <p className="text-2xs leading-6 text-subtle">
            «پامپ ۲۴ ساعته» یعنی بیش از ۱۰۰٪ رشد در یک روز؛ در آزمون بیشتر خریدهای بعد از چنین روزی ظرف یک ماه بیش از نصف ارزششان را از دست دادند.
            «نقدینگی کم» یعنی زیر ۵۰ هزار دلار؛ فروش همان بلیت کوچک هم قیمت را می‌شکند.
          </p>
        </>
      )}
    </div>
  );
}

function TicketLine({ t, onOpen }: { t: MemeRow; onOpen: () => void }) {
  const buyers = t.buyers24h ?? 0, sellers = t.sellers24h ?? 0;
  const flags = lotteryFlags(t);
  return (
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-start transition-colors hover:bg-surface-2/60 md:grid-cols-[auto_11rem_minmax(0,1fr)_7rem_auto_auto]">
      <CoinLogo image={t.image} symbol={t.symbol} />
      <div className="min-w-0">
        <p className="truncate font-extrabold text-ink"><bdi dir="ltr">{t.symbol}</bdi></p>
        <p className="truncate text-2xs text-muted"><bdi dir="ltr">{t.name}</bdi> · {fmtAge(t.createdAt)}</p>
      </div>
      <span className="md:order-last"><VerdictBadge verdict={t.safety.verdict} /></span>
      <div className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:col-span-1 md:flex-nowrap md:whitespace-nowrap">
        <span><span className="text-2xs text-muted">ارزش </span><MoneyValue value={t.marketCap} compact className="font-bold" /></span>
        <span><span className="text-2xs text-muted">نقدینگی </span><MoneyValue value={t.liquidityUsd} compact className="font-bold" /></span>
        <span><span className="text-2xs text-muted">۲۴ ساعت </span><PercentValue value={t.change24h} digits={0} className="font-bold" /></span>
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        {buyers + sellers > 0 ? (
          <>
            <SplitBar long={buyers} short={sellers} labels={false} />
            <p className="mt-1 text-[10px] text-subtle">خریدار {toFaDigits(Math.round((buyers / (buyers + sellers)) * 100))}٪</p>
          </>
        ) : (
          <span className="text-2xs text-subtle">—</span>
        )}
      </div>
      <div className="flex max-w-[15rem] flex-wrap justify-end gap-1 md:justify-start">
        {flags.map((f) => <Badge key={f} tone={f === 'fresh' ? 'neutral' : 'warn'}>{LOTTERY_FLAG_FA[f]}</Badge>)}
      </div>
    </button>
  );
}
