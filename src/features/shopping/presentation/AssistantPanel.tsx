/** ============================================================
 * دستیار خرید — یک درخواست فارسی، یک پاسخ:
 *  ۱۰ گزینهٔ برتر از چند پلتفرم در یک جدول + «پیشنهاد برتر» با دلیل
 *  همه‌چیز فقط‌خواندنی است؛ خرید، رزرو و پرداخت در خود سایت انجام می‌شود.
 * ============================================================ */
import { type FormEvent, useRef, useState } from 'react';
import { ExternalLink, Sparkles, Trophy } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Input';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { fmtPrice } from '../digikala/presentation/format';
import { askShop, errorText, loadHome, saveHome } from '../data/api';
import { CITIES } from '../domain/cities';
import { SERVICE } from '../domain/services';
import type { Intent, ShopAnswer } from '../domain/types';
import { ResultsTable, Thumb } from './ResultsTable';
import { ServiceLogo, ServiceTag } from './ServiceLogo';

const EXAMPLES = [
  'بهترین پلی‌استیشن ۵ اسلیم کارکرده در اهواز',
  'ارزان‌ترین پرواز یا قطار از اهواز به مشهد',
  'ویلا در شمال شبی حداکثر ۳ میلیون برای ۴ نفر',
  'متخصص پوست با نوبت خالی در اهواز بر اساس نظرات',
  'کرم ضد آفتاب برای پوست چرب',
  'ارزان‌ترین پیتزای تخفیف‌دار در اهواز'
];

const INTENT_LABEL: Record<Intent, string> = {
  product: 'کالا', fashion: 'پوشاک', beauty: 'آرایشی', food: 'غذا', grocery: 'سوپرمارکت', flight: 'پرواز', train: 'قطار', stay: 'اقامت', tour: 'تور', doctor: 'پزشک', book: 'کتاب'
};

function Understood({ a }: { a: ShopAnswer }) {
  const q = a.query;
  const chips = [
    q.intents.map((i) => INTENT_LABEL[i]).join(' + '),
    q.keywords && `«${q.keywords}»`,
    q.origin && q.destinations.length ? `${q.origin.name} ← ${q.destinations.map((d) => d.name).join('، ')}` : q.destinations.length ? q.destinations.slice(0, 3).map((d) => d.name).join('، ') + (q.destinations.length > 3 ? '…' : '') : q.city?.name,
    q.used && 'کارکرده',
    q.maxPrice != null && `تا ${fmtPrice(q.maxPrice)}`,
    q.minPrice != null && `از ${fmtPrice(q.minPrice)}`,
    q.sort === 'cheapest' ? 'ارزان‌ترین' : 'بهترین'
  ].filter(Boolean) as string[];
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="برداشت دستیار از درخواست">
      {chips.map((c) => <li key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">{toFaDigits(c)}</li>)}
      <li className="text-[11px] text-subtle">به‌روزرسانی {fmtRelativeAge(a.fetchedAt)}</li>
    </ul>
  );
}

function TopPick({ a }: { a: ShopAnswer }) {
  if (!a.top) return null;
  const i = a.top.item;
  return (
    <Surface variant="focal" className="relative overflow-hidden p-4 md:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-accent-soft to-transparent" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <Thumb src={i.image} className="h-28 w-28 self-center shadow-card" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-warn"><Trophy aria-hidden className="h-4 w-4" /> پیشنهاد برتر</p>
          <p className="text-base font-bold leading-7 text-ink">{i.title}</p>
          <p className="text-sm leading-6 text-muted">{a.top.why}</p>
          <div className="flex flex-wrap items-center gap-3">
            {i.priceToman != null && <span className="text-lg font-extrabold text-ink">{i.priceToman === 0 ? 'رایگان' : fmtPrice(i.priceToman)}</span>}
            <ServiceTag id={i.service} />
          </div>
        </div>
        <a href={i.url} target="_blank" rel="noopener noreferrer" className={cn(buttonClass('primary', 'md'), 'gap-1.5 self-stretch sm:self-center')}>
          ورود به {SERVICE[i.service].name} <ExternalLink aria-hidden className="h-4 w-4" />
        </a>
      </div>
    </Surface>
  );
}

function DirectLinks({ a }: { a: ShopAnswer }) {
  if (!a.links.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{a.items.length ? 'جستجوی همین درخواست در سایت‌های دیگر:' : 'این درخواست را مستقیم در این سایت‌ها ببینید:'}</p>
      <ul className="flex flex-wrap gap-2">
        {a.links.map((l) => (
          <li key={l.service}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-divider bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent">
              <ServiceLogo id={l.service} className="h-5 w-5" /> {SERVICE[l.service].name} <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesLine({ a }: { a: ShopAnswer }) {
  if (!a.sources.length) return null;
  return (
    <p className="text-[11px] leading-5 text-subtle">
      منابع: {a.sources.map((s, n) => (
        <span key={s.service}>
          {n > 0 && ' · '}
          {SERVICE[s.service].name} {s.count ? `(${toFaDigits(s.count)})` : `— ${s.note ?? 'بدون نتیجه'}`}
        </span>
      ))}
    </p>
  );
}

export function AssistantPanel() {
  const [text, setText] = useState('');
  const [home, setHome] = useState(loadHome);
  const [answer, setAnswer] = useState<ShopAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  async function run(q: string) {
    if (q.trim().length < 3) { setError('درخواست را کمی کامل‌تر بنویسید'); return; }
    const id = ++runId.current;
    setLoading(true); setError(null);
    try {
      const a = await askShop(q.trim(), home);
      if (id === runId.current) setAnswer(a);
    } catch (e) {
      if (id === runId.current) setError(errorText(e));
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void run(text); };
  const example = (q: string) => { setText(q); void run(q); };
  const changeHome = (slug: string) => { setHome(slug); saveHome(slug); };

  return (
    <div className="space-y-5 md:space-y-6">
      <Surface variant="focal" className="space-y-3 p-4 md:p-5">
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="shop-ask" className="sr-only">درخواست خرید</label>
          <textarea
            id="shop-ask"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(text); } }}
            rows={2}
            maxLength={300}
            placeholder="مثلاً: ارزان‌ترین پرواز به کیش از اهواز، یا یک دندان‌پزشک خوب با نوبت خالی در تهران"
            className="w-full resize-none rounded-field border border-divider-strong bg-card px-3.5 py-2.5 text-sm leading-7 text-ink placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 coarse:text-base"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              شهر من
              <Select value={home} onChange={(e) => changeHome(e.target.value)} className="h-9 w-32 text-xs coarse:h-10" aria-label="شهر من (مبدأ پیش‌فرض)">
                {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </Select>
            </label>
            <Button type="submit" loading={loading} className="ms-auto" icon={<Sparkles aria-hidden className="h-4 w-4" />}>پیدا کن</Button>
          </div>
        </form>
        {!answer && !loading && (
          <ul className="flex flex-wrap gap-1.5" aria-label="نمونه درخواست‌ها">
            {EXAMPLES.map((q) => (
              <li key={q}>
                <button type="button" onClick={() => example(q)} className="rounded-full border border-divider px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent">{q}</button>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      {error && <Notice tone="error" title="پاسخی دریافت نشد" action={<Button size="sm" variant="outline" onClick={() => void run(text)}>تلاش دوباره</Button>}>{error}</Notice>}

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="در حال جستجو در چند سایت">
          {/غذا|رستوران|کافه|پیتزا|برگر|کباب|جوجه|قهوه|لاته|کیک|شیرینی|کترینگ|اسنپ ?فود|ساندویچ|سوشی|خورش|قورمه|بستنی/.test(text) && (
            <p className="text-xs text-muted">رستوران‌ها از طریق پل مک شما از اسنپ‌فود خوانده می‌شوند؛ تا حدود ۲۰ ثانیه طول می‌کشد.</p>
          )}
          <Skeleton className="h-7 w-2/3 rounded-full" />
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 rounded-card" />)}
        </div>
      )}

      {!loading && !error && !answer && (
        <EmptyState icon={<Sparkles />} message="هر چه می‌خواهید بخرید یا رزرو کنید، به فارسی بنویسید" hint="کالای نو و کارکرده، پرواز و قطار، اقامت، پزشک، کتاب و آرایشی را از چند سایت مقایسه می‌کنیم؛ قیمت‌ها به تومان." />
      )}

      {answer && !loading && (
        <div className="space-y-4">
          <Understood a={answer} />
          {answer.hints.map((h) => <Notice key={h} tone="warn">{h}</Notice>)}
          {answer.items.length > 0 ? (
            <Section title={`${toFaDigits(answer.items.length)} گزینهٔ برتر`}>
              <ResultsTable items={answer.items} topId={answer.top?.item.id ?? null} />
            </Section>
          ) : (
            !answer.hints.length && <Notice tone="info" title="نتیجهٔ مستقیمی پیدا نشد">این منابع از سرور دارینو پاسخ ندادند یا نتیجه‌ای نداشتند؛ از لینک‌های زیر مستقیم ببینید.</Notice>
          )}
          <TopPick a={answer} />
          <DirectLinks a={answer} />
          <SourcesLine a={answer} />
        </div>
      )}
    </div>
  );
}
