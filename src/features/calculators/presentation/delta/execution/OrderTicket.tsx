/**
 * برگهٔ سفارش دستی — تعداد دقیق هر طرف، تقسیم به تکه‌ها و ترتیب سفارش‌ها برای باز/بستن دستی دلتا نوترال.
 * هیچ سفارشی ارسال نمی‌شود؛ پیشرفت از پوزیشن‌های واقعی حساب‌های لایتر/آرکوس خوانده می‌شود (فقط‌خواندنی).
 * محاسبات در domain (buildOrderTicket، ticketProgress).
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { Badge } from '@/shared/components/ui/Badge';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { faNumber, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { useDeltaBooks, DELTA_VENUE_LABELS, type DeltaVenue } from '@/features/calculators/data/deltaMarkets';
import { useLinkedDeltaLegs } from '@/features/calculators/data/deltaPositions';
import { buildOrderTicket, fundingSpreads, ticketProgress, type TicketMode, type TicketSide, type TicketWarning } from '@/features/calculators/domain';
import { parseNum } from '../../parse';
import { DELTA_PAIRS, pairVenues, type DeltaPair } from '../pairs';

const READABLE: DeltaVenue[] = ['arcus', 'lighter', 'lighterRh'];
const WARNING: Record<TicketWarning, string> = {
  noPrice: 'قیمت یکی از دو صرافی در دسترس نیست؛ تعداد را مستقیم وارد کنید.',
  roundedToZero: 'با گام سفارش، تعداد به صفر گرد شد؛ اندازه را بیشتر کنید.',
  belowMin: 'تعداد هر طرف از حداقل سفارش صرافی کمتر است.',
  chunkBelowMin: 'بعضی تکه‌ها از حداقل سفارش کوچک‌ترند؛ تعداد تکه‌ها را کم کنید.'
};
const qty = (n: number) => faNumber(n, { maximumFractionDigits: 8 });
/** باز کردن لانگ = خرید · بستن لانگ = فروش (reduce-only) */
const verb = (side: TicketSide, mode: TicketMode) => ((side === 'long') === (mode === 'open') ? 'خرید' : 'فروش');

export function OrderTicket() {
  const books = useDeltaBooks();
  const live = useLinkedDeltaLegs();
  const [pair, setPair] = useState<DeltaPair>('arcus-lighterRh');
  const [base, setBase] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<TicketMode>('open');
  const [notional, setNotional] = useState('1000');
  const [closeQty, setCloseQty] = useState('');
  const [chunks, setChunks] = useState('4');
  const [step, setStep] = useState({ long: '', short: '' });
  const [min, setMin] = useState({ long: '', short: '' });
  const [start, setStart] = useState<{ long: number; short: number } | null>(null);
  const [manual, setManual] = useState<Set<number>>(new Set());

  const [va, vb] = pairVenues(pair);
  const spreads = useMemo(() => fundingSpreads(books[va].quotes, books[vb].quotes), [books, va, vb]);
  const selected = spreads.find((s) => s.base === base) ?? spreads[0] ?? null;
  const shortSide = selected ? (flipped ? (selected.shortOn === 'a' ? 'b' : 'a') : selected.shortOn) : 'a';
  const shortQ = selected ? selected[shortSide] : null;
  const longQ = selected ? selected[shortSide === 'a' ? 'b' : 'a'] : null;

  // پوزیشن فعلی همین دارایی در حساب‌های ثبت‌شدهٔ همین دو صرافی
  const current = useMemo(() => {
    if (!longQ || !shortQ) return null;
    const sum = (venue: DeltaVenue, side: TicketSide) =>
      live.legs.filter((l) => l.venue === venue && l.side === side && l.base === selected!.base.toUpperCase()).reduce((s, l) => (s === null || l.quantity === null ? null : s + l.quantity), 0 as number | null);
    return { long: sum(longQ.venue, 'long'), short: sum(shortQ.venue, 'short') };
  }, [live.legs, longQ, shortQ, selected]);
  const readable = !!longQ && !!shortQ && READABLE.includes(longQ.venue) && READABLE.includes(shortQ.venue);
  const liveReady = readable && current?.long !== null && current?.short !== null && live.accounts.every((a) => a.status !== 'loading');
  const livePos = liveReady ? { long: current!.long!, short: current!.short! } : null;

  const ticket = useMemo(() => {
    if (!longQ || !shortQ) return null;
    const leg = (q: typeof longQ, s: 'long' | 'short') => ({ venue: q.venue, price: q.markPrice, stepQty: parseNum(step[s]) || 0, minQty: parseNum(min[s]) || 0, volume24hUsd: q.volume24hUsd });
    const defaultClose = livePos ? Math.min(livePos.long, livePos.short) : null;
    return buildOrderTicket({
      mode,
      notionalPerSide: parseNum(notional) || 0,
      qtyPerSide: mode === 'close' ? parseNum(closeQty) || defaultClose : null,
      chunks: parseNum(chunks) || 1,
      long: leg(longQ, 'long'),
      short: leg(shortQ, 'short')
    });
  }, [longQ, shortQ, mode, notional, closeQty, chunks, step, min, livePos?.long, livePos?.short]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = ticket && start && livePos ? ticketProgress(ticket, start, livePos) : null;
  const reset = () => {
    setStart(null);
    setManual(new Set());
  };
  const venueOf = (side: TicketSide) => DELTA_VENUE_LABELS[(side === 'long' ? longQ : shortQ)!.venue];
  const other = (s: TicketSide): TicketSide => (s === 'long' ? 'short' : 'long');
  const sym = selected?.base ?? '';

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <section aria-label="ورودی‌ها" className="min-w-0 lg:col-span-5">
        <Surface className="space-y-5 p-4 md:p-5 lg:sticky lg:top-8">
          <h2 className="text-sm font-bold text-ink">برگهٔ سفارش دستی</h2>
          <SegmentedControl<TicketMode>
            label="باز یا بستن"
            fill
            size="sm"
            value={mode}
            onChange={(m) => {
              setMode(m);
              reset();
            }}
            options={[
              { value: 'open', label: 'باز کردن' },
              { value: 'close', label: 'بستن' }
            ]}
          />
          <Field label="دو صرافی">
            <Select
              value={pair}
              onChange={(e) => {
                setPair(e.target.value as DeltaPair);
                setBase(null);
                setFlipped(false);
                reset();
              }}
            >
              {DELTA_PAIRS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="بازار">
            <Select
              value={selected?.base ?? ''}
              disabled={!spreads.length}
              onChange={(e) => {
                setBase(e.target.value);
                setFlipped(false);
                reset();
              }}
            >
              {!spreads.length && <option value="">—</option>}
              {spreads.map((s) => (
                <option key={s.base} value={s.base}>
                  {s.base} · {s.a.nameFa}
                </option>
              ))}
            </Select>
          </Field>
          {longQ && shortQ && (
            <div className="flex items-center justify-between gap-3 rounded-field bg-surface-2/70 px-3.5 py-2.5 text-sm">
              <span>
                <span className="font-semibold text-positive">لانگ</span> {DELTA_VENUE_LABELS[longQ.venue]} ·{' '}
                <span className="font-semibold text-negative">شورت</span> {DELTA_VENUE_LABELS[shortQ.venue]}
              </span>
              <Button size="sm" variant="ghost" onClick={() => (setFlipped((f) => !f), reset())}>
                جابه‌جا
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {mode === 'open' ? (
              <Field label="ارزش هر طرف">
                <Input dir="ltr" inputMode="decimal" value={notional} onChange={(e) => setNotional(e.target.value)} suffix="دلار" />
              </Field>
            ) : (
              <Field label="تعداد هر طرف برای بستن">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={closeQty}
                  placeholder={livePos ? qty(Math.min(livePos.long, livePos.short)) : ''}
                  onChange={(e) => setCloseQty(e.target.value)}
                  suffix={sym}
                />
              </Field>
            )}
            <Field label="تعداد تکه">
              <Input dir="ltr" inputMode="numeric" value={chunks} onChange={(e) => setChunks(e.target.value)} />
            </Field>
            {(['long', 'short'] as const).map((s) => (
              <Field key={`step-${s}`} label={`گام سفارش ${longQ && shortQ ? venueOf(s) : ''}`}>
                <Input dir="ltr" inputMode="decimal" value={step[s]} placeholder="مثلاً 0.001" onChange={(e) => setStep((v) => ({ ...v, [s]: e.target.value }))} suffix={sym} />
              </Field>
            ))}
            {(['long', 'short'] as const).map((s) => (
              <Field key={`min-${s}`} label={`حداقل سفارش ${longQ && shortQ ? venueOf(s) : ''}`}>
                <Input dir="ltr" inputMode="decimal" value={min[s]} onChange={(e) => setMin((v) => ({ ...v, [s]: e.target.value }))} suffix={sym} />
              </Field>
            ))}
          </div>
          <p className="text-2xs leading-5 text-muted">گام و حداقل سفارش را از صفحهٔ معاملهٔ هر صرافی بردارید؛ تعداد هر دو طرف به گام درشت‌تر گرد می‌شود تا دقیقاً برابر باشند.</p>
        </Surface>
      </section>

      <section aria-label="برگهٔ سفارش" aria-live="polite" className="min-w-0 space-y-5 lg:col-span-7">
        <Notice tone="info">این برگه سفارشی ارسال نمی‌کند؛ سفارش‌ها را خودتان در هر صرافی ثبت کنید. توصیهٔ مالی نیست.</Notice>
        {!ticket || !longQ || !shortQ ? (
          <Notice tone="neutral">{books[va].status === 'loading' || books[vb].status === 'loading' ? 'در حال دریافت بازارها…' : 'بازار مشترکی برای این دو صرافی پیدا نشد.'}</Notice>
        ) : (
          <>
            {ticket.warnings.map((w) => (
              <Notice key={w} tone="warn">
                {WARNING[w]}
                {w === 'chunkBelowMin' && ticket.maxChunks !== null && ` حداکثر ${toFaDigits(ticket.maxChunks)} تکه.`}
              </Notice>
            ))}
            <Surface variant="focal" className="p-5">
              <p className="text-sm font-semibold text-muted">{mode === 'open' ? 'باز کردن' : 'بستن'} — تعداد هر طرف</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
                <bdi dir="ltr">{qty(ticket.qtyPerSide)}</bdi> <span className="text-base font-semibold text-muted">{sym}</span>
              </p>
              <KeyValueList
                dense
                className="mt-4"
                rows={[
                  { label: `ارزش طرف لانگ (${venueOf('long')})`, value: <MoneyValue value={longQ.markPrice ? ticket.qtyPerSide * longQ.markPrice : null} /> },
                  { label: `ارزش طرف شورت (${venueOf('short')})`, value: <MoneyValue value={shortQ.markPrice ? ticket.qtyPerSide * shortQ.markPrice : null} /> },
                  { label: 'اختلاف قیمت دو صرافی', hint: 'مثبت = شورت را گران‌تر می‌فروشید', value: <PercentValue value={ticket.basisPct} digits={3} /> },
                  ...(ticket.roundingLeftoverUsd > 0.01 ? [{ label: 'کنار گذاشته با گرد کردن', value: <MoneyValue value={ticket.roundingLeftoverUsd} /> }] : [])
                ]}
              />
            </Surface>

            {progress?.next && (
              <Notice tone={progress.next.reason === 'rebalance' ? 'warn' : 'info'} title={progress.next.reason === 'rebalance' ? 'اول توازن را برگردانید' : 'قدم بعدی'}>
                {venueOf(progress.next.side)}: {verb(progress.next.side, mode)} <bdi dir="ltr">{qty(progress.next.qty)}</bdi> {sym}
                {progress.next.reason === 'rebalance' && progress.imbalancePct !== null && ` — اختلاف دو طرف ${toFaDigits(progress.imbalancePct.toFixed(1))}٪`}
              </Notice>
            )}
            {progress?.complete && <Notice tone="success">هر دو طرف کامل و برابرند.</Notice>}

            <Surface className="space-y-3 p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">ترتیب سفارش‌ها</h3>
                {readable ? (
                  start ? (
                    <Button size="sm" variant="ghost" onClick={reset}>
                      شروع دوباره
                    </Button>
                  ) : (
                    <Button size="sm" disabled={!livePos} onClick={() => livePos && setStart(livePos)}>
                      {livePos ? 'شروع و پایش از حساب' : 'در حال خواندن حساب‌ها…'}
                    </Button>
                  )
                ) : (
                  <Badge tone="warn">این دو صرافی خواندنی نیستند؛ تکه‌ها را دستی علامت بزنید</Badge>
                )}
              </div>
              <p className="text-xs leading-6 text-muted">
                در هر تکه اول در {venueOf(ticket.firstLeg)} سفارش <b>limit</b> بگذارید
                {ticket.firstLegByVolume ? ' (حجم کمتر، اسلیپیج بیشتر)' : ''}؛ به محض پر شدن، همان تعداد را در {venueOf(other(ticket.firstLeg))} با <b>market</b> بزنید.
                {mode === 'close' && ' سفارش‌های بستن را reduce-only بزنید.'}
              </p>
              <ol className="space-y-2">
                {ticket.chunks.map((c, k) => {
                  const done = progress ? k < progress.doneChunks : manual.has(c.n);
                  const isNext = progress ? k === progress.doneChunks && progress.next?.reason === 'chunk' : false;
                  return (
                    <li key={c.n} className={cn('rounded-card border p-3', isNext ? 'border-accent bg-accent-soft' : 'border-divider', done && 'opacity-60')}>
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          disabled={!!progress}
                          aria-label={done ? 'انجام شد' : 'علامت انجام'}
                          className="mt-0.5 text-accent disabled:cursor-default"
                          onClick={() => setManual((s) => new Set(s.has(c.n) ? [...s].filter((x) => x !== c.n) : [...s, c.n]))}
                        >
                          {done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Circle className="h-5 w-5 text-subtle" aria-hidden />}
                        </button>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="font-semibold text-ink">
                            تکهٔ {toFaDigits(c.n)} · <bdi dir="ltr">{qty(c.qty)}</bdi> {sym}
                            <span className="ms-2 text-2xs font-normal text-muted">
                              تجمعی <bdi dir="ltr">{qty(c.cumQty)}</bdi>
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            ۱) {venueOf(ticket.firstLeg)}: limit {verb(ticket.firstLeg, mode)} ← ۲) {venueOf(other(ticket.firstLeg))}: market {verb(other(ticket.firstLeg), mode)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {progress && (
                <KeyValueList
                  dense
                  rows={[
                    { label: `اجراشدهٔ لانگ (${venueOf('long')})`, value: <bdi dir="ltr">{qty(progress.doneLong)}</bdi> },
                    { label: `اجراشدهٔ شورت (${venueOf('short')})`, value: <bdi dir="ltr">{qty(progress.doneShort)}</bdi> }
                  ]}
                />
              )}
            </Surface>
          </>
        )}
      </section>
    </div>
  );
}
