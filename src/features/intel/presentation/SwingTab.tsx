/**
 * تب «سوینگ» — برای معاملهٔ چندروزه تا چندهفته‌ای، فقط چیزهایی که آزمون پشتشان است:
 *   ۱) رژیم بازار: BTC نسبت به میانگین ۲۰۰ روزه و سهم ۶۰ پرپ پرحجم بالای میانگین ۵۰ روزه
 *   ۲) اندازهٔ پوزیشن: از ریزش واقعی وسط معامله در ۱ از ۲۰ معامله، با درصد ریسکی که کاربر تعیین می‌کند
 *   ۳) کاندید آزمایشی D+E با ثبت عملکرد زنده؛ سیگنال خرید نیست
 * عددها از scripts/swing-backtest.ts؛ جزئیات پشت بازشو.
 */
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { PercentValue } from '@/shared/components/ui/FinancialValue';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import {
  ALT_BEAT_BTC_20D, DRAWDOWN_P5, EXPERIMENT_HOLD_DAYS, REGIME_BREADTH, sizeFor,
  type AssetClass, type Horizon, type LogEntry, type Regime, type SwingPayload
} from '../domain/swing';
import { useSwing } from '../data/intelApi';
import { UsdShort, fmtPrice } from './parts';

const pct = (v: number, digits = 0) => `${toFaDigits((v * 100).toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`;
const faDate = (t: number) => new Date(t).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' });

export function SwingTab({ onCheck }: { onCheck: (coin: string) => void }) {
  const q = useSwing();
  return (
    <div className="space-y-6">
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError || !q.data ? <ErrorState message="وضعیت بازار دریافت نشد" onRetry={() => void q.refetch()} /> : <RegimeCard d={q.data} />}
      <Sizer />
      {q.data && <Experimental d={q.data} onCheck={onCheck} />}
      <Disclosure summary="این عددها از کجا آمده‌اند؟">
        <ul className="list-disc space-y-1.5 ps-5 text-xs leading-6 text-muted">
          <li>۱۸۴ پرپ هایپرلیکوئید از ژوئیهٔ ۲۰۲۳ تا اکتبر ۲۰۲۶، همراه با کوین‌های حذف‌شده مثل MATIC و FTM (امروز نمی‌دانید کدام کوین سال بعد می‌میرد)، و ۵۵ سهم، شاخص و کالا از ۲۰۱۰.</li>
          <li>هر روز ۶۰ کوین پرحجم همان روز؛ ورود با بازشدن روز بعد از سیگنال؛ ۰.۳٪ هزینه؛ مقایسه با همان معاملات در زمان‌های تصادفی؛ ۶ ماه آخر تا پایان مهروموم.</li>
          <li>از ۴۰ آزمون (روند، مومنتوم، پولبک، فاندینگ منفی، رژیم بازار و ترکیب‌هایشان) هیچ‌کدام از شانس قابل تشخیص نبود. برای همین اینجا سیگنال خرید نیست.</li>
          <li>روند، پولبک و مومنتوم آلت‌کوین در یک ماه فقط در {pct(ALT_BEAT_BTC_20D.low)} تا {pct(ALT_BEAT_BTC_20D.high)} معاملات از نگه‌داشتن BTC بهتر بودند.</li>
          <li>فاندینگ شلوغ آبشار را پیش‌بینی نکرد: از ۱۷ دورهٔ شلوغ فقط ۲ بار BTC هفتهٔ بعد ۱۰٪ ریخت، و ۸ آبشار از ۱۰ آبشار بزرگ در بازار غیرشلوغ آمد.</li>
          <li>توصیهٔ مالی نیست.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

const REGIME_FA: Record<Regime['state'], { title: string; body: string; border: string; tone: 'gain' | 'warn' | 'neutral' }> = {
  on: {
    title: 'بازار صعودی است',
    body: 'BTC بالای میانگین ۲۰۰ روزه است و بیشتر کوین‌ها بالای میانگین ۵۰ روزهٔ خودشان. در آزمون، تنها ترکیب‌هایی که از نگه‌داشتن BTC بهتر بودند فقط در همین وضعیت کار کردند؛ با این حال هیچ‌کدام اثبات نشد.',
    border: 'border-gain/50',
    tone: 'gain'
  },
  off: {
    title: 'بازار صعودی نیست',
    body: 'در این وضعیت خرید آلت‌کوین با روند، پولبک یا مومنتوم در آزمون تقریباً همیشه از نگه‌داشتن BTC بدتر بود. اگر می‌خرید، حجم کوچک‌تر و صبر تا برگشت رژیم معقول‌تر است.',
    border: 'border-warn/50',
    tone: 'warn'
  },
  unknown: {
    title: 'رژیم بازار هنوز محاسبه نشده',
    body: 'دادهٔ روزانهٔ ۶۰ کوین هر ۱۰ دقیقه روی سرور تازه می‌شود.',
    border: 'border-divider',
    tone: 'neutral'
  }
};

/** چند کوین دیگر باید بالای میانگین ۵۰ روزه بروند تا پهنای بازار به حد صعودی برسد */
function coinsToFlip(r: Regime): number | null {
  if (r.breadth === null || !r.counted) return null;
  return Math.max(0, Math.ceil(REGIME_BREADTH * r.counted) - Math.round(r.breadth * r.counted));
}

function RegimeCard({ d }: { d: SwingPayload }) {
  const r = d.regime;
  const v = REGIME_FA[r.state];
  const breadth = r.breadth === null ? null : Math.round(r.breadth * 100);
  const btcGap = d.btc?.sma200 ? d.btc.close / d.btc.sma200 - 1 : null;
  const flip = r.state === 'off' ? coinsToFlip(r) : null;
  const coinsPart = flip ? `${toFaDigits(flip)} کوین دیگر باید بالای میانگین ۵۰ روزهٔ خودشان بروند` : null;
  const gap =
    r.state !== 'off' ? null
      : r.btcAbove200 === false ? <>فاصله تا صعودی: BTC باید به بالای <bdi dir="ltr">{fmtPrice(d.btc?.sma200 ?? null)}</bdi> برگردد{coinsPart ? ` و ${coinsPart}` : ''}.</>
        : coinsPart ? <>فاصله تا صعودی: {coinsPart}.</> : null;
  return (
    <Surface variant="focal" className={cn('border-2 p-5', v.border)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold text-ink">{v.title}</h3>
        {d.day !== null && <Badge tone="neutral">کندل روزانهٔ {faDate(d.day)}</Badge>}
      </div>
      <p className="mt-1.5 text-sm leading-7 text-muted">{v.body}</p>
      {gap && <p className="mt-2 text-sm font-semibold text-ink">{gap}</p>}

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-divider pt-4 sm:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-2xs font-semibold text-muted">BTC نسبت به میانگین ۲۰۰ روزه</p>
          <p className={cn('mt-1 text-xl font-extrabold', r.btcAbove200 === null ? 'text-ink' : r.btcAbove200 ? 'text-positive' : 'text-negative')}>
            {btcGap === null ? '—' : <PercentValue value={btcGap * 100} digits={1} />}
          </p>
          {d.btc && <p className="text-2xs text-subtle"><bdi dir="ltr">{fmtPrice(d.btc.close)}</bdi></p>}
        </div>
        <div>
          <p className="text-2xs font-semibold text-muted">کوین‌های بالای میانگین ۵۰ روزه</p>
          <div dir="ltr" className="relative mt-2 h-2 rounded-full bg-surface-2" role="img" aria-label={`${breadth ?? 0}٪ از ${REGIME_BREADTH * 100}٪ لازم`}>
            <span className={cn('absolute inset-y-0 left-0 rounded-full', r.state === 'on' ? 'bg-gain' : 'bg-warn')} style={{ width: `${breadth ?? 0}%` }} />
            <span className="absolute -inset-y-1 w-0.5 rounded bg-ink/60" style={{ left: `${REGIME_BREADTH * 100}%` }} aria-hidden />
          </div>
          <p className="mt-1.5 text-2xs text-subtle">
            {breadth === null ? 'هنوز محاسبه نشده' : `${toFaDigits(breadth)}٪`} · لازم برای صعودی {toFaDigits(REGIME_BREADTH * 100)}٪ · از {toFaDigits(r.counted)} کوین
          </p>
        </div>
      </div>
      <p className="mt-3 text-2xs text-subtle">
        {d.pending > 0 ? `${toFaDigits(d.total - d.pending)} از ${toFaDigits(d.total)} کوین تازه شده؛ بقیه هر ۱۰ دقیقه روی سرور · ` : ''}
        به‌روز {fmtRelativeAge(d.fetchedAt)}
      </p>
    </Surface>
  );
}

// ─── اندازهٔ پوزیشن ─────────────────────────────────────────────────────────

const SIZER_KEY = 'intel:swing-sizer:v1';
interface SizerState { capital: string; risk: string; cls: AssetClass; h: Horizon }
const SIZER_DEFAULT: SizerState = { capital: '', risk: '1', cls: 'crypto', h: 20 };

function loadSizer(): SizerState {
  try {
    const s = JSON.parse(localStorage.getItem(SIZER_KEY) ?? 'null') as Partial<SizerState> | null;
    return {
      capital: typeof s?.capital === 'string' ? s.capital : SIZER_DEFAULT.capital,
      risk: typeof s?.risk === 'string' ? s.risk : SIZER_DEFAULT.risk,
      cls: s?.cls === 'tradfi' ? 'tradfi' : 'crypto',
      h: s?.h === 5 ? 5 : 20
    };
  } catch {
    return SIZER_DEFAULT;
  }
}

function Sizer() {
  const [s, setS] = useState<SizerState>(loadSizer);
  useEffect(() => {
    try { localStorage.setItem(SIZER_KEY, JSON.stringify(s)); } catch { /* خاموش */ }
  }, [s]);
  const capital = Number(s.capital);
  const risk = Number(s.risk);
  const r = sizeFor(capital, risk, s.cls, s.h);
  // بدون سرمایه هم جواب به‌صورت درصد معلوم است (سرمایهٔ فرضی ۱۰۰)
  const rel = sizeFor(100, risk, s.cls, s.h);
  const dd = DRAWDOWN_P5[s.cls][s.h];
  const set = (patch: Partial<SizerState>) => setS((p) => ({ ...p, ...patch }));

  return (
    <Surface className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-bold text-ink">چقدر بخرم؟</h3>
        <p className="mt-1 text-xs leading-6 text-muted">
          از هر ۲۰ معاملهٔ سوینگ، در یکی قیمت وسط کار دست‌کم این‌قدر خلاف جهت رفت. اندازه را طوری بگیرید که آن یک معامله بیش از ریسک تعیین‌شده نگیرد.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="سرمایهٔ کل (اختیاری)">
          <Input type="number" inputMode="decimal" dir="ltr" min={0} placeholder="10000" value={s.capital} onChange={(e) => set({ capital: e.target.value })} suffix="$" />
        </Field>
        <Field label="ریسک هر معامله">
          <Input type="number" inputMode="decimal" dir="ltr" min={0.1} max={10} step={0.1} value={s.risk} onChange={(e) => set({ risk: e.target.value })} suffix="%" />
        </Field>
        <Field label="بازار">
          <SegmentedControl<AssetClass> fill label="بازار" value={s.cls} onChange={(v) => set({ cls: v })} options={[{ value: 'crypto', label: 'کریپتو' }, { value: 'tradfi', label: 'سهام/کالا' }]} />
        </Field>
        <Field label="نگه‌داری">
          <SegmentedControl<string> fill label="نگه‌داری" value={String(s.h)} onChange={(v) => set({ h: v === '5' ? 5 : 20 })} options={[{ value: '5', label: '~۱ هفته' }, { value: '20', label: '~۱ ماه' }]} />
        </Field>
      </div>

      {risk > 2 && <Notice tone="warn">بیش از ۲٪ ریسک در هر معامله یعنی چند ضرر پشت‌سرهم بخش بزرگی از سرمایه را می‌برد؛ بیشتر سوینگ‌تریدرها ۰.۵ تا ۲٪ می‌گذارند.</Notice>}

      <dl className="grid grid-cols-3 gap-3 border-t border-divider pt-4 sm:gap-4">
        <div>
          <dt className="text-2xs font-semibold text-muted">ریزش ۱ از ۲۰ معامله</dt>
          <dd className="mt-1 text-lg font-extrabold text-negative sm:text-xl">−{pct(dd.close)}</dd>
          <dd className="text-2xs text-subtle">با فتیله −{pct(dd.low)}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">حداکثر خرید اسپات</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{r ? <UsdShort value={r.spotMaxUsd} /> : rel ? `${toFaDigits(rel.spotMaxUsd.toLocaleString('en-US', { maximumFractionDigits: 1 }))}٪` : '—'}</dd>
          <dd className="text-2xs text-subtle">{r ? `${toFaDigits(((r.spotMaxUsd / capital) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }))}٪ سرمایه` : rel ? 'از سرمایه' : 'ریسک را وارد کنید'}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">اهرم پرپ تا</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{rel ? <bdi dir="ltr">{toFaDigits(rel.perpMaxLeverage)}x</bdi> : '—'}</dd>
          <dd className="text-2xs text-subtle">{r ? <>مارجین ایزوله <UsdShort value={r.perpMarginUsd} /></> : 'مارجین ایزوله'}</dd>
        </div>
      </dl>
      <p className="text-2xs leading-5 text-subtle">
        عددها برای آلت‌کوین‌های پرحجم است؛ BTC و ETH معمولاً کمتر می‌ریزند. حد ضرر نزدیک‌تر از این ریزش یعنی در بسیاری از معاملات با نوسان عادی خارج می‌شوید.
        {s.cls === 'crypto' && ` یادآوری: در آزمون فقط ${pct(ALT_BEAT_BTC_20D.low)} تا ${pct(ALT_BEAT_BTC_20D.high)} خریدهای آلت‌کوین در یک ماه از نگه‌داشتن BTC بهتر بودند.`}
      </p>
    </Surface>
  );
}

// ─── کاندید آزمایشی ─────────────────────────────────────────────────────────

function Experimental({ d, onCheck }: { d: SwingPayload; onCheck: (coin: string) => void }) {
  const s = d.summary;
  const open = d.log.filter((e) => e.exit === null).reverse();
  return (
    <Surface className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted" aria-hidden />
        <h3 className="text-sm font-bold text-ink">کاندید آزمایشی: شورت‌های شلوغ در بازار صعودی</h3>
        <Badge tone="warn">اثبات نشده</Badge>
      </div>
      <p className="text-xs leading-6 text-muted">
        کل بازار صعودی، قیمت کوین بالای میانگین ۵۰ روزه، و فاندینگ ۷۲ ساعت گذشته‌اش منفی (شورت‌ها شلوغ کرده‌اند). سیگنال خرید نیست؛ ثبت می‌شود تا عملکرد واقعی‌اش دیده شود.
      </p>
      <dl className="grid grid-cols-3 gap-2">
        <TrackStat label="آزمون ۳ ساله" value="۵۳٪ برد" hint="۱۸۸ معامله" />
        <TrackStat label="۶ ماه مهروموم" value="۷۳٪ برد" hint="فقط ۲۲ معامله" />
        <TrackStat
          label="زنده، از شروع ثبت"
          value={s.closed ? `${toFaDigits(Math.round((s.wins / s.closed) * 100))}٪ برد` : '—'}
          hint={s.total ? `${toFaDigits(s.closed)} بسته از ${toFaDigits(s.total)}` : 'هنوز سیگنالی نیامده'}
        />
      </dl>

      {d.regime.state !== 'on' ? (
        <p className="rounded-field bg-surface-2/70 px-3 py-2.5 text-xs text-muted">بازار صعودی نیست؛ این کاندید فقط در رژیم صعودی فعال می‌شود.</p>
      ) : d.candidates.length === 0 ? (
        <p className="rounded-field bg-surface-2/70 px-3 py-2.5 text-xs text-muted">{d.pending > 0 ? 'جهان هنوز کامل تازه نشده؛ کاندیدها بعد از آن بررسی می‌شوند.' : 'امروز هیچ کوینی در این وضعیت نیست.'}</p>
      ) : (
        <ul className="divide-y divide-divider">
          {d.candidates.map((c) => (
            <li key={c.coin} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink"><bdi dir="ltr">{c.coin}</bdi> <span className="text-2xs font-medium text-subtle"><bdi dir="ltr">{fmtPrice(c.close)}</bdi></span></p>
                <p className="text-2xs text-muted">
                  فاندینگ ۷۲ ساعت <PercentValue value={c.fundingHourly72h * 24 * 365 * 100} digits={0} /> سالانه · <PercentValue value={(c.close / c.sma50 - 1) * 100} digits={1} /> بالای میانگین ۵۰ روزه
                </p>
              </div>
              <button type="button" onClick={() => onCheck(c.coin)} className="shrink-0 text-xs font-semibold text-brand hover:underline">چک قبل از ورود</button>
            </li>
          ))}
        </ul>
      )}

      {s.total > 0 && (
        <div className="space-y-2 border-t border-divider pt-3">
          {s.closed > 0 && (
            <p className="text-xs text-muted">
              میانگین معاملات بسته (نگه‌داری {toFaDigits(EXPERIMENT_HOLD_DAYS)} روز، ۰.۳٪ هزینه): <PercentValue value={(s.meanNet ?? 0) * 100} digits={1} />
              {s.closed < 30 && ' · زیر ۳۰ معاملهٔ بسته حکمی داده نمی‌شود'}
            </p>
          )}
          {open.length > 0 && (
            <>
              <p className="text-2xs font-semibold text-muted">در جریان</p>
              <ul className="flex flex-wrap gap-1.5">
                {open.slice(0, MAX_OPEN_CHIPS).map((e) => <OpenChip key={`${e.coin}-${e.day}`} e={e} />)}
                {open.length > MAX_OPEN_CHIPS && <li className="px-1 py-1 text-2xs text-subtle">و {toFaDigits(open.length - MAX_OPEN_CHIPS)} مورد دیگر</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </Surface>
  );
}

const MAX_OPEN_CHIPS = 12;

function TrackStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-field bg-surface-2/70 px-3 py-2">
      <dt className="text-2xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold text-ink">{value}</dd>
      <dd className="text-2xs text-subtle">{hint}</dd>
    </div>
  );
}

function OpenChip({ e }: { e: LogEntry }) {
  return (
    <li className="rounded-full bg-surface-2 px-2.5 py-1 text-2xs text-muted">
      <bdi dir="ltr" className="font-bold text-ink">{e.coin}</bdi> · {faDate(e.day)}
    </li>
  );
}
