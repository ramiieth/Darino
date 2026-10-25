/**
 * تب «میم‌کوین» — دو حالت، هر دو بر پایهٔ آزمون یک سال میم‌کوین‌های سولانا:
 *   محافظ سرمایه (پیش‌فرض): رژیم بازار + غربال آزموده (بقا، روند، ضد نقدینگی خروج، امنیت) + فهرست انتظار با اعلان
 *   بلیت بخت‌آزمایی: آگاهانه و محدود — بودجهٔ حداکثر ۵٪ در دست‌کم ۲۰ بلیت، فقط توکن‌های بدون خطر امنیتی
 * فهرست «تازه‌ها» حذف شد: از ۴۸ توکن تازهٔ معامله‌شده، یک ساعت بعد هیچ‌کدام معامله نداشت.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, Check, ShieldCheck, Ticket, X } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { toast } from '@/shared/store/toastStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { useAuth } from '@/features/auth/authClient';
import { useMemes, useMemeScreen, type MemeRow } from '../data/intelApi';
import { useMemeWatch } from '../data/memeWatch';
import { EXIT_LIQ_FA, EXIT_PLAN, LOTTERY, exitPlan, lotteryPlan, type CoinScreen, type Regime } from '../domain/memeScreen';
import { SplitBar, Stat, VerdictBadge, fmtAge, fmtPrice } from './parts';

type Mode = 'guard' | 'lottery';
const pct = (v: number | null, digits = 0) => (v === null ? '—' : `${v > 0 ? '+' : ''}${toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`);

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

function GuardView({ onToken, authed }: { onToken: (address: string) => void; authed: boolean }) {
  const q = useMemeScreen();
  const [showRest, setShowRest] = useState(false);
  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !q.data) return <ErrorState message="غربال میم‌کوین دریافت نشد" onRetry={() => void q.refetch()} />;
  const d = q.data;
  const ready = d.coins.filter((c) => c.passes);
  const watch = d.coins.filter((c) => c.watchWorthy);
  const rest = d.coins.filter((c) => !c.passes && !c.watchWorthy);

  return (
    <div className="space-y-6">
      <RegimeNotice regime={d.regime} />
      {d.pending > 0 && (
        <Notice tone="neutral">
          {toFaDigits(d.total - d.pending)} از {toFaDigits(d.total)} کوین آماده است؛ بقیه هر ۱۰ دقیقه چند تا چند تا روی سرور تازه می‌شوند.
        </Notice>
      )}

      <section>
        <h3 className="mb-1 text-base font-extrabold text-ink">همهٔ فیلترها را رد کرده‌اند ({toFaDigits(ready.length)})</h3>
        <p className="mb-3 text-xs text-muted">بقا + روند + بدون نشانهٔ نقدینگی خروج + امنیت.{d.regime.state !== 'on' && ' بازار میم نزولی است؛ حتی این‌ها در آزمون در این حالت ضرر دادند.'}</p>
        {ready.length ? <CoinGrid coins={ready} regime={d.regime} onToken={onToken} /> : <EmptyState message="امروز هیچ کوینی همهٔ فیلترها را رد نکرد" hint="این خودش یک جواب است: سیستم می‌گوید نخرید. کوین‌های فهرست انتظار را دنبال کنید." />}
      </section>

      <section>
        <h3 className="mb-1 text-base font-extrabold text-ink">فهرست انتظار پیشنهادی ({toFaDigits(watch.length)})</h3>
        <p className="mb-3 text-xs text-muted">
          زنده و از نظر امنیت سالم، ولی روندشان هنوز برنگشته. با دکمهٔ زنگ اضافه کنید تا وقتی همهٔ فیلترها را رد کردند و بازار هم صعودی بود، اعلان بگیرید.
          {!authed && ' اعلان فقط بعد از ورود به حساب فعال می‌شود.'}
        </p>
        {watch.length ? <CoinGrid coins={watch} regime={d.regime} onToken={onToken} /> : <p className="text-sm text-muted">فعلاً کوینی در این دسته نیست.</p>}
      </section>

      {rest.length > 0 && (
        <section>
          <Button size="sm" variant="outline" onClick={() => setShowRest((v) => !v)}>
            {showRest ? 'پنهان کردن ردشده‌ها' : `ردشده‌ها و دلیلشان (${toFaDigits(rest.length)})`}
          </Button>
          {showRest && <div className="mt-3"><CoinGrid coins={rest} regime={d.regime} onToken={onToken} /></div>}
        </section>
      )}

      <Surface variant="subtle" className="p-4 text-xs leading-6 text-muted">
        <p className="mb-1 font-semibold text-ink">این فیلترها از کجا آمده‌اند</p>
        آزمون روی ۱۴۸ میم‌کوین تصادفی سولانا از CoinGecko (شامل مرده‌ها)، اکتبر ۲۰۲۵ تا اکتبر ۲۰۲۶، با ۴٪ هزینهٔ رفت‌وبرگشت.
        خرید روز لیست: ۱۳٪ معاملات سودده، میانه ‎−۶۲٪، و ۶۸٪ بیش از نصف سرمایه را باختند. با همهٔ این فیلترها و برنامهٔ خروج: ۲۴٪ سودده، میانه ‎−۹٪، و هیچ معامله‌ای بیش از ۵۰٪ نباخت.
        در آن سال شاخص میم‌ها ۹۲٪ سقوط کرد و هیچ پروفایلی روی دادهٔ دیده‌نشده سود نساخت؛ کار این غربال مهار ضرر و آماده نگه داشتن فهرست سالم برای برگشت بازار است.
        هرچه کوین مسن‌تر بود ضرر کمتر بود (حداقل ۳ روز ‎−۱۴٪، ۶۰ روز ‎−۵٪). توصیهٔ مالی نیست. به‌روز {fmtRelativeAge(d.fetchedAt)}.
      </Surface>
    </div>
  );
}

function RegimeNotice({ regime }: { regime: Regime }) {
  const breadth = regime.breadth === null ? '—' : `${toFaDigits(Math.round(regime.breadth * 100))}٪`;
  if (regime.state === 'unknown') return <Notice tone="neutral" title="رژیم بازار میم: دادهٔ کافی نیست">هنوز کمتر از ۱۰ کوین با ۵۰ روز تاریخچه آماده است.</Notice>;
  return regime.state === 'on' ? (
    <Notice tone="success" title={`بازار میم صعودی است · ${breadth} کوین‌ها بالای میانگین ۵۰ روزه`}>
      در آزمون، فیلتر رژیم بیشترین اثر را داشت. حالا فقط کوین‌هایی را بخرید که همهٔ فیلترها را رد کرده‌اند، با برنامهٔ خروج و حجمی که صفر شدنش برایتان مهم نیست.
    </Notice>
  ) : (
    <Notice tone="warn" title={`بازار میم نزولی است · فقط ${breadth} کوین‌ها بالای میانگین ۵۰ روزه (لازم: ۷۰٪)`}>
      در آزمون، خرید در این حالت به‌طور میانگین ضرر داد. بهترین کار نخریدن و ساختن فهرست انتظار است. این معیار کمی خوش‌بین‌تر از شاخص آزموده است (در یک سال ۳۲ روز روشن در برابر ۲۴).
    </Notice>
  );
}

function CoinGrid({ coins, regime, onToken }: { coins: CoinScreen[]; regime: Regime; onToken: (address: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {coins.map((c) => <ScreenCard key={c.id} c={c} regime={regime} onToken={onToken} />)}
    </div>
  );
}

function Check1({ ok, label, why }: { ok: boolean | null; label: string; why?: string }) {
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <span className={cn('mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full', ok ? 'bg-gain/15 text-positive' : ok === null ? 'bg-surface-2 text-muted' : 'bg-loss/15 text-negative')} aria-hidden>
        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span><span className="font-semibold text-ink">{label}</span>{why && <span className="text-muted"> · {why}</span>}</span>
    </li>
  );
}

function ScreenCard({ c, regime, onToken }: { c: CoinScreen; regime: Regime; onToken: (address: string) => void }) {
  const watching = useMemeWatch((s) => s.ids.includes(c.id));
  const toggle = useMemeWatch((s) => s.toggle);
  const s = c.safety.info;
  const plan = c.price ? exitPlan(c.price) : null;
  return (
    <Surface as="article" className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-3">
        {c.image ? (
          <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full bg-surface-2 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted" aria-hidden>{c.symbol.slice(0, 3)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink"><bdi dir="ltr">{c.symbol}</bdi></p>
          <p className="truncate text-xs text-muted"><bdi dir="ltr">{c.name}</bdi> · {toFaDigits(c.days)} روز داده</p>
        </div>
        {c.passes && <Badge tone={regime.state === 'on' ? 'gain' : 'warn'}>{regime.state === 'on' ? 'آماده' : 'آماده؛ بازار نزولی'}</Badge>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="ارزش بازار"><MoneyValue value={c.marketCap} compact /></Stat>
        <Stat label="۳۰ روز"><PercentValue value={c.ret30Pct} digits={0} /></Stat>
        <Stat label="تا میانگین ۲۰"><PercentValue value={c.vsMa20Pct} digits={0} /></Stat>
        <Stat label="تا قله">{pct(c.athChangePct)}</Stat>
      </div>
      <ul className="mt-3 space-y-1.5">
        <Check1 ok={c.gate} label="بقا" why={c.gate ? undefined : `ارزش بازار ≥ ۵ میلیون، حجم ≥ ۱۰۰ هزار دلار و ۳۰ روز سابقه`} />
        <Check1 ok={c.trend} label="روند" why={c.trend ? undefined : 'قیمت زیر میانگین ۲۰ روزه یا ۳۰ روزهٔ منفی'} />
        <Check1 ok={c.exitLiq.ok} label="بدون نشانهٔ نقدینگی خروج" why={c.exitLiq.reasons.map((r) => EXIT_LIQ_FA[r]).join('، ') || undefined} />
        <Check1 ok={c.safety.ok} label="امنیت" why={c.safety.reasons.join('، ') || (s ? `۱۰ هولدر بزرگ ${s.top10Pct === null ? '—' : `${toFaDigits(Math.round(s.top10Pct))}٪`} · قفل نقدینگی ${s.lpLockedPct === null ? '—' : `${toFaDigits(Math.round(s.lpLockedPct))}٪`}` : undefined)} />
      </ul>
      {c.passes && plan && (
        <div className="mt-3 rounded-field bg-surface-2/70 p-3 text-xs leading-6">
          <p className="font-semibold text-ink">برنامهٔ خروج (آزموده)</p>
          حد ضرر <bdi dir="ltr">{fmtPrice(plan.stop)}</bdi> (‎−{toFaDigits(EXIT_PLAN.stopPct)}٪) · فروش نصف در <bdi dir="ltr">{fmtPrice(plan.takeHalf)}</bdi> ({toFaDigits(EXIT_PLAN.halfAtMultiple)} برابر) · خروج کامل با بسته شدن زیر میانگین {toFaDigits(EXIT_PLAN.trendMa)} روزه.
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <Button
          size="sm"
          variant={watching ? 'secondary' : 'outline'}
          icon={watching ? <BellRing /> : <Bell />}
          onClick={() => { if (toggle(c.id) === 'full') toast('error', 'حداکثر ۳۰ کوین در فهرست انتظار'); }}
        >
          {watching ? 'در فهرست انتظار' : 'فهرست انتظار'}
        </Button>
        {c.mint && <Button size="sm" variant="outline" icon={<ShieldCheck />} onClick={() => onToken(c.mint!)}>کارنامهٔ امنیت</Button>}
      </div>
    </Surface>
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
    return { shown: ok, dropped: all.length - ok.length };
  }, [q.data]);

  return (
    <div className="space-y-5">
      <Notice tone="warn" title="این حالت قمار آگاهانه است، نه سرمایه‌گذاری">
        در آزمون، «خرید بعد از یک روز +۱۰۰٪» میانهٔ ‎−۶۰٪ داشت و ۶۶٪ معاملات بیش از نصفشان را باختند. سود کل سبد فقط از ۳ معامله از ۶۵ آمد.
        با ۵ بلیت فقط ۲۶٪ احتمال سود کلی بود و با ۵۰ بلیت ۷۵٪؛ ولی بدون آن ۲ برندهٔ بزرگ ۲۴٪ و بدون ۳ برنده ۰٪. در واقعیت بدتر است، چون کوین‌های کاملاً مرده از CoinGecko حذف می‌شوند.
      </Notice>

      <Surface className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="کل سرمایهٔ شما (دلار)">
          <Input type="number" inputMode="decimal" dir="ltr" min={0} value={capital} onChange={(e) => setCapital(e.target.value)} suffix="$" />
        </Field>
        <Field label={`تعداد بلیت (${toFaDigits(LOTTERY.minTickets)} تا ${toFaDigits(LOTTERY.maxTickets)})`}>
          <Input type="number" inputMode="numeric" dir="ltr" min={LOTTERY.minTickets} max={LOTTERY.maxTickets} value={tickets} onChange={(e) => setTickets(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2 self-end">
          <Stat label={`بودجهٔ کل (${toFaDigits(LOTTERY.maxBudgetPct)}٪)`}><MoneyValue value={plan.budget} /></Stat>
          <Stat label={`هر بلیت (${toFaDigits(plan.perTicketPct.toLocaleString('en-US', { maximumFractionDigits: 2 }))}٪)`}><MoneyValue value={plan.perTicket} /></Stat>
        </div>
      </Surface>

      <Surface variant="subtle" className="p-4 text-xs leading-7 text-muted">
        <p className="mb-1 font-semibold text-ink">قواعد این حالت</p>
        ۱. کل بودجه حداکثر {toFaDigits(LOTTERY.maxBudgetPct)}٪ سرمایه، تقسیم بر دست‌کم {toFaDigits(LOTTERY.minTickets)} بلیت مساوی ({toFaDigits(plan.tickets)} بلیت ← هر کدام <MoneyValue value={plan.perTicket} />).
        ۲. به بلیت بازنده هرگز اضافه نکنید و بودجه را بعد از باخت شارژ نکنید.
        ۳. هر بلیتی که ۲ برابر شد، نصفش را بفروشید تا سرمایهٔ اولیه‌اش برگردد.
        ۴. فقط توکن‌های زیر: توکن‌های روی بوندینگ‌کرو pump.fun و توکن‌هایی که خطر امنیتی دارند حذف شده‌اند{dropped > 0 ? ` (${toFaDigits(dropped)} مورد)` : ''}.
        ۵. این فهرست «بازماندگانِ» امروز است؛ ترند بودن یعنی قبلاً رشد کرده، نه این‌که رشد خواهد کرد.
      </Surface>

      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.isError || !q.data ? (
        <ErrorState message="فهرست میم‌کوین‌ها دریافت نشد" onRetry={() => void q.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState message="هیچ توکن ترندی از فیلتر امنیت رد نشد" />
      ) : (
        <>
          <p className="text-xs text-muted">داغ‌ترین‌های سولانا · به‌روز {fmtRelativeAge(q.data.fetchedAt)}</p>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {shown.map((t) => <MemeCard key={t.address} t={t} onOpen={() => onToken(t.address)} />)}
          </div>
        </>
      )}
    </div>
  );
}

function MemeCard({ t, onOpen }: { t: MemeRow; onOpen: () => void }) {
  const buyers = t.buyers24h ?? 0, sellers = t.sellers24h ?? 0;
  return (
    <Surface as="article" className="h-full p-4 transition-shadow hover:shadow-card">
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <div className="mb-3 flex items-center gap-3">
          {t.image ? (
            <img src={t.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full bg-surface-2 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted" aria-hidden>{t.symbol.slice(0, 3)}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold text-ink"><bdi dir="ltr">{t.symbol}</bdi></p>
            <p className="truncate text-xs text-muted"><bdi dir="ltr">{t.name}</bdi> · {fmtAge(t.createdAt)}</p>
          </div>
          <VerdictBadge verdict={t.safety.verdict} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="ارزش بازار"><MoneyValue value={t.marketCap} compact /></Stat>
          <Stat label="نقدینگی"><MoneyValue value={t.liquidityUsd} compact /></Stat>
          <Stat label="حجم ۲۴ ساعت"><MoneyValue value={t.volume24h} compact /></Stat>
          <Stat label="۱ ساعت"><PercentValue value={t.change1h} digits={1} /></Stat>
          <Stat label="۲۴ ساعت"><PercentValue value={t.change24h} digits={1} /></Stat>
          <Stat label="ریسک‌ها">{t.safety.verdict === 'unknown' ? '—' : `${toFaDigits(t.safety.dangers)} خطر · ${toFaDigits(t.safety.warns)} هشدار`}</Stat>
        </div>
        {(t.change24h ?? 0) > 100 && <p className="mt-2 text-2xs font-semibold text-negative">بیش از ۱۰۰٪ رشد در ۲۴ ساعت: در آزمون، بیشتر خریدهای بعد از چنین روزی ظرف یک ماه بیش از نصف ارزششان را از دست دادند.</p>}
        {buyers + sellers > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-2xs font-semibold text-muted">خریداران {toFaDigits(buyers.toLocaleString('en-US'))} · فروشندگان {toFaDigits(sellers.toLocaleString('en-US'))} (۲۴ ساعت)</p>
            <SplitBar long={buyers} short={sellers} labels={false} />
          </div>
        )}
      </button>
    </Surface>
  );
}
