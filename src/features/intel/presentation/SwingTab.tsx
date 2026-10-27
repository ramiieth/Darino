/**
 * تب «سوینگ» — برای خریدهای چندروزه تا یک‌ماهه، به زبان ساده و در سه قدم:
 *   ۱) «امروز وضع بازار چطور است؟» یک جواب روشن + دو شرط تیک‌خورده/نخورده + چه چیزی باید عوض شود
 *   ۲) «هر خرید چقدر باشد؟» یک جملهٔ جواب از سرمایه و حداکثر ضرر قابل‌قبول کاربر
 *   ۳) جزئیات (الگوی آزمایشی، منبع عددها) پشت بازشو
 * بازطراحی پس از بازخورد «مبهم و نامفهوم»: بدون اصطلاح (رژیم، پهنا، صدک)، هر عدد با معنی‌اش.
 * عددها از scripts/swing-backtest.ts؛ سیگنال خرید نمی‌دهد.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { ALT_BEAT_BTC_20D, DRAWDOWN_P5, REGIME_BREADTH, sizeFor, type AssetClass, type Horizon, type Regime, type SwingPayload } from '../domain/swing';
import { useSwing } from '../data/intelApi';
import { UsdShort, fmtPrice } from './parts';

/** ۰.۳۷ ← «۳۷٪» */
const pct = (v: number, digits = 0) => `${toFaDigits((v * 100).toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`;
const num = (v: number, digits = 1) => toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }));

export function SwingTab({ onCheck }: { onCheck: (coin: string) => void }) {
  const q = useSwing();
  return (
    <div className="space-y-6">
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError || !q.data ? <ErrorState message="وضعیت بازار دریافت نشد" onRetry={() => void q.refetch()} /> : <Today d={q.data} />}
      <HowMuch />
      {q.data && <Experiment d={q.data} onCheck={onCheck} />}
      <Disclosure summary="این حرف‌ها از کجا آمده؟">
        <ul className="list-disc space-y-1.5 ps-5 text-xs leading-6 text-muted">
          <li>سه سال قیمت ۱۸۴ کوین هایپرلیکوئید (همراه با کوین‌هایی که بعداً مردند) و ۱۶ سال قیمت سهام و طلا و نفت بررسی شد.</li>
          <li>هیچ قانون سادهٔ خرید (دنبال کردن روند، خرید در افت، خرید پرشتاب‌ترین‌ها) بهتر از خرید در یک روز تصادفی نبود. برای همین این صفحه نمی‌گوید «چه بخرید»؛ می‌گوید «الان وقتش خوب است یا نه» و «چقدر بخرید».</li>
          <li>در یک ماه، خریدهای آلت‌کوین فقط در {pct(ALT_BEAT_BTC_20D.low)} تا {pct(ALT_BEAT_BTC_20D.high)} موارد از نگه‌داشتن بیت‌کوین بهتر بودند.</li>
          <li>توصیهٔ مالی نیست.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

// ─── ۱) امروز ────────────────────────────────────────────────────────────────

const TODAY: Record<Regime['state'], { title: string; body: string; border: string; dot: string }> = {
  on: {
    title: 'بازار صعودی است',
    body: 'بیت‌کوین و بیشتر کوین‌ها رو به بالا هستند. در گذشته خرید آلت‌کوین فقط در چنین روزهایی شانس بهتری داشت؛ با این حال هیچ تضمینی نیست، پس اندازهٔ خرید را از بخش پایین بگیرید.',
    border: 'border-gain/50',
    dot: 'bg-gain'
  },
  off: {
    title: 'بازار صعودی نیست؛ خرید آلت‌کوین را کوچک نگه دارید یا صبر کنید',
    body: 'در گذشته، در چنین روزهایی خرید آلت‌کوین تقریباً همیشه از نگه‌داشتن بیت‌کوین بدتر بود.',
    border: 'border-warn/50',
    dot: 'bg-warn'
  },
  unknown: {
    title: 'وضعیت بازار در حال محاسبه است',
    body: 'قیمت روزانهٔ ۶۰ کوین هر ۱۰ دقیقه روی سرور تازه می‌شود؛ کمی بعد دوباره سر بزنید.',
    border: 'border-divider',
    dot: 'bg-ink/30'
  }
};

function Today({ d }: { d: SwingPayload }) {
  const r = d.regime;
  const t = TODAY[r.state];
  const btcGap = d.btc?.sma200 ? d.btc.close / d.btc.sma200 - 1 : null;
  const up = r.breadth === null ? null : Math.round(r.breadth * r.counted);
  const need = r.breadth === null ? null : Math.max(0, Math.ceil(REGIME_BREADTH * r.counted) - (up ?? 0));
  return (
    <Surface variant="focal" className={cn('border-2 p-5', t.border)}>
      <p className="text-2xs font-semibold text-muted">امروز وضع بازار چطور است؟</p>
      <h3 className="mt-1 flex items-start gap-2 text-lg font-extrabold leading-8 text-ink">
        <span className={cn('mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full', t.dot)} aria-hidden />
        {t.title}
      </h3>
      <p className="mt-1 text-sm leading-7 text-muted">{t.body}</p>

      <ul className="mt-4 space-y-2.5 border-t border-divider pt-4">
        <Condition
          ok={r.btcAbove200}
          label="بیت‌کوین در روند صعودی بلندمدت است"
          detail={btcGap === null ? 'هنوز محاسبه نشده' : `${btcGap >= 0 ? pct(btcGap, 1) + ' بالاتر' : pct(-btcGap, 1) + ' پایین‌تر'} از میانگین ۲۰۰ روز گذشته‌اش (${fmtPrice(d.btc!.close)} دلار)`}
        />
        <Condition
          ok={r.breadth === null ? null : r.breadth >= REGIME_BREADTH}
          label="بیشتر کوین‌ها رو به بالا هستند"
          detail={up === null ? 'هنوز محاسبه نشده' : `${toFaDigits(up)} از ${toFaDigits(r.counted)} کوین بزرگ بالای میانگین ۵۰ روز اخیرشان‌اند؛ دست‌کم نیمی لازم است`}
        />
      </ul>

      {r.state === 'off' && need !== null && need > 0 && (
        <p className="mt-3 rounded-field bg-surface-2/70 px-3 py-2 text-xs leading-6 text-ink">
          برای صعودی شدن: {r.btcAbove200 === false && 'بیت‌کوین باید به بالای میانگین ۲۰۰ روزه‌اش برگردد و '}{toFaDigits(need)} کوین دیگر باید رو به بالا بروند.
        </p>
      )}
      <p className="mt-3 text-2xs text-subtle">
        {d.pending > 0 ? `${toFaDigits(d.total - d.pending)} از ${toFaDigits(d.total)} کوین تازه شده · ` : ''}به‌روز {fmtRelativeAge(d.fetchedAt)}
      </p>
    </Surface>
  );
}

function Condition({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', ok === null ? 'bg-surface-2 text-muted' : ok ? 'bg-gain/15 text-positive' : 'bg-negative/10 text-negative')}
        aria-label={ok === null ? 'نامشخص' : ok ? 'بله' : 'نه'}
      >
        {ok === null ? '?' : ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs leading-6 text-muted">{detail}</p>
      </div>
    </li>
  );
}

// ─── ۲) چقدر بخرم ────────────────────────────────────────────────────────────

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

function HowMuch() {
  const [s, setS] = useState<SizerState>(loadSizer);
  useEffect(() => {
    try { localStorage.setItem(SIZER_KEY, JSON.stringify(s)); } catch { /* خاموش */ }
  }, [s]);
  const capital = Number(s.capital);
  const risk = Number(s.risk);
  const r = sizeFor(capital, risk, s.cls, s.h);
  const rel = sizeFor(100, risk, s.cls, s.h);
  const dd = DRAWDOWN_P5[s.cls][s.h];
  const set = (patch: Partial<SizerState>) => setS((p) => ({ ...p, ...patch }));
  const what = s.cls === 'crypto' ? 'یک آلت‌کوین' : 'یک سهم یا کالا';

  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <div>
        <h3 className="text-base font-bold text-ink">هر خرید چقدر باشد؟</h3>
        <p className="mt-1 text-xs leading-6 text-muted">بگویید در بدترین حالت حاضرید چند درصد کل سرمایه را در یک خرید از دست بدهید؛ اندازهٔ مناسب حساب می‌شود.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="حداکثر ضرر در یک خرید (درصد کل سرمایه)">
          <Input type="number" inputMode="decimal" dir="ltr" min={0.1} max={10} step={0.1} value={s.risk} onChange={(e) => set({ risk: e.target.value })} suffix="%" />
        </Field>
        <Field label="کل سرمایه (اختیاری)">
          <Input type="number" inputMode="decimal" dir="ltr" min={0} placeholder="10000" value={s.capital} onChange={(e) => set({ capital: e.target.value })} suffix="$" />
        </Field>
        <Field label="چه می‌خرید؟">
          <SegmentedControl<AssetClass> fill label="چه می‌خرید" value={s.cls} onChange={(v) => set({ cls: v })} options={[{ value: 'crypto', label: 'کریپتو' }, { value: 'tradfi', label: 'سهام یا کالا' }]} />
        </Field>
        <Field label="چقدر نگه می‌دارید؟">
          <SegmentedControl<string> fill label="مدت نگه‌داری" value={String(s.h)} onChange={(v) => set({ h: v === '5' ? 5 : 20 })} options={[{ value: '5', label: 'حدود یک هفته' }, { value: '20', label: 'حدود یک ماه' }]} />
        </Field>
      </div>

      {risk > 2 && <Notice tone="warn">بیش از ۲٪ در هر خرید یعنی چند ضرر پشت‌سرهم بخش بزرگی از سرمایه را می‌برد؛ بیشتر معامله‌گرها ۰.۵ تا ۲٪ می‌گذارند.</Notice>}

      {rel ? (
        <div className="space-y-2 rounded-card bg-surface-2/60 p-4">
          <Answer>
            حداکثر <strong className="text-ink">{num(rel.spotMaxUsd)}٪ سرمایه</strong>
            {r && <> (<UsdShort value={r.spotMaxUsd} />)</>} را در {what} بگذارید.
          </Answer>
          <Answer>
            اگر با اهرم (پرپ) معامله می‌کنید، اهرم <strong className="text-ink"><bdi dir="ltr">{num(rel.perpMaxLeverage)}x</bdi></strong> یا کمتر{r && <> و مارجین حداکثر <UsdShort value={r.perpMarginUsd} /></>}.
          </Answer>
          <p className="border-t border-divider pt-2 text-xs leading-6 text-muted">
            چرا؟ در گذشته از هر ۲۰ خرید، در یکی قیمت وسط کار <strong className="text-negative">{pct(dd.close)}</strong> پایین رفت (با نوسان لحظه‌ای {pct(dd.low)}).
            با این اندازه، حتی آن خریدِ بد هم بیش از {num(risk)}٪ سرمایه‌تان را نمی‌برد.
            {s.cls === 'crypto' && ' بیت‌کوین و اتریوم معمولاً کمتر از این می‌ریزند.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">درصد ضرر قابل‌قبول را وارد کنید.</p>
      )}
    </Surface>
  );
}

function Answer({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-2 text-sm leading-7 text-muted"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden /><span>{children}</span></p>;
}

// ─── ۳) الگوی آزمایشی (پشت بازشو) ─────────────────────────────────────────────

function Experiment({ d, onCheck }: { d: SwingPayload; onCheck: (coin: string) => void }) {
  const s = d.summary;
  const n = d.candidates.length;
  return (
    <Disclosure summary={`الگوی آزمایشی${n ? ` · امروز ${toFaDigits(n)} کوین` : ''}`}>
      <div className="space-y-3 pt-1">
        <p className="text-xs leading-6 text-muted">
          یک الگو در گذشته کمی بهتر از خرید تصادفی بود ولی <strong className="text-ink">هنوز اثبات نشده</strong>: وقتی بازار صعودی است، کوینی که خودش هم رو به بالاست ولی
          بیشتر معامله‌گرها روی ریزشش شرط بسته‌اند (فاندینگ منفی). دارینو هر بار که پیش بیاید ثبت می‌کند تا عملکرد واقعی‌اش معلوم شود. این پیشنهاد خرید نیست.
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="در ۳ سال گذشته" value="۵۳٪" hint="سودده" />
          <Stat label="در ۶ ماه اخیر" value="۷۳٪" hint="سودده، فقط ۲۲ بار" />
          <Stat label="از وقتی دارینو ثبت می‌کند" value={s.closed ? pct(s.wins / s.closed) : '—'} hint={s.total ? `${toFaDigits(s.closed)} از ${toFaDigits(s.total)} تمام‌شده` : 'هنوز پیش نیامده'} />
        </dl>
        {d.regime.state !== 'on' ? (
          <p className="text-xs text-muted">امروز فعال نیست، چون بازار صعودی نیست.</p>
        ) : n === 0 ? (
          <p className="text-xs text-muted">امروز هیچ کوینی در این وضعیت نیست.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {d.candidates.map((c) => (
              <li key={c.coin}>
                <button type="button" onClick={() => onCheck(c.coin)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-accent-soft">
                  <bdi dir="ltr">{c.coin}</bdi> <span className="font-normal text-muted">· چک قبل از ورود</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Badge tone="warn">آزمایشی</Badge>
      </div>
    </Disclosure>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-field bg-surface-2/70 px-2 py-2">
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-extrabold text-ink">{value}</dd>
      <dd className="text-2xs text-subtle">{hint}</dd>
    </div>
  );
}
