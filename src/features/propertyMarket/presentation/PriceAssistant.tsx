/** ============================================================
 * Property Market — دستیار قیمت
 *
 *  ۱) پیشنهاد برتر نوساز و یک‌ساله: ارزان‌ترین آگهی‌ها «نسبت به آگهی‌های مشابه خودشان»
 *  ۲) خلاصه: چند آگهی زیر قیمت، منصفانه، گران و مشکوک
 *  همهٔ اعداد از domain/valuation؛ هیچ عددی حدس زده نمی‌شود.
 * ============================================================ */
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { areaKeyOf, neighborhoodDisplayName } from '../data/catalog';
import { percentile } from '../domain/stats';
import { FAIR_BAND, MIN_PEERS, SUSPECT_RATIO, topPicks, type Valuation, type Verdict } from '../domain/valuation';
import type { ListingView } from '../service/propertyMarketService';
import { fmtMillionToman, fmtTotalToman } from './format';

const VERDICT: Record<Verdict, { label: string; tone: 'gain' | 'neutral' | 'loss' | 'warn' }> = {
  below: { label: 'زیر قیمت مشابه‌ها', tone: 'gain' },
  fair: { label: 'قیمت منصفانه', tone: 'neutral' },
  above: { label: 'گران‌تر از مشابه‌ها', tone: 'loss' },
  suspect: { label: 'خیلی ارزان؛ بررسی کنید', tone: 'warn' },
  unknown: { label: 'آگهی مشابه کافی نیست', tone: 'neutral' },
  exception: { label: 'استثنا؛ در میانگین حساب نشده', tone: 'warn' }
};

const pctDiff = (ratio: number) => {
  const d = Math.round((ratio - 1) * 100);
  return d === 0 ? 'هم‌قیمت' : `${toFaDigits(Math.abs(d))}٪ ${d < 0 ? 'ارزان‌تر' : 'گران‌تر'}`;
};

/** برچسب کوتاه هر آگهی + توضیح یک‌خطی (در فهرست آگهی‌ها هم استفاده می‌شود) */
export function VerdictBadge({ v }: { v: Valuation | undefined }) {
  if (!v || v.verdict === 'unknown') return null;
  return <Badge tone={VERDICT[v.verdict].tone}>{VERDICT[v.verdict].label}</Badge>;
}

export function verdictLine(v: Valuation): string | null {
  if (v.ratio === null || v.peerMedian === null) return null;
  return `${pctDiff(v.ratio)} از میانهٔ ${toFaDigits(v.peerCount)} آگهی مشابه (${fmtMillionToman(v.peerMedian)} هر متر${v.basis === 'near-year' ? '، با یک سال اختلاف ساخت' : ''})`;
}

function PickList({ title, picks }: { title: string; picks: ReturnType<typeof topPicks<ListingView>> }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {picks.length === 0 ? (
        <p className="text-xs text-muted">آگهی منصفانه یا زیر قیمتی با حداقل {toFaDigits(MIN_PEERS)} آگهی مشابه پیدا نشد.</p>
      ) : (
        <ol className="space-y-2">
          {picks.map(({ listing: l, valuation: v }, i) => (
            <li key={l.token} className="rounded-field border border-divider p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="group inline-flex max-w-full items-center gap-1 text-sm font-semibold text-ink hover:text-accent">
                    <span className="truncate">
                      {toFaDigits(i + 1)}. {l.title ?? 'آگهی بدون عنوان'}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
                  </a>
                  <p className="mt-0.5 text-xs text-muted">
                    {neighborhoodDisplayName(l.neighborhoodKey)}
                    {l.areaSqm !== null && <> · {toFaDigits(l.areaSqm)} متر</>}
                    {l.yearBuilt !== null && <> · ساخت {toFaDigits(l.yearBuilt)}</>}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-sm font-bold text-ink">{fmtMillionToman(l.pricePerSqmToman)}</p>
                  <p className="text-2xs text-muted">کل {fmtTotalToman(l.totalPriceToman)}</p>
                </div>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs leading-6 text-muted">
                <VerdictBadge v={v} />
                {verdictLine(v)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function PriceAssistant({
  views,
  valuations,
  jalaliYear,
  exceptions = 0,
  exceptionViews = []
}: {
  /** آگهی‌های استثنایی — جدا نمایش، با فاصله از بازهٔ عادی منطقه */
  exceptionViews?: ListingView[];
  views: ListingView[];
  valuations: ReadonlyMap<string, Valuation>;
  jalaliYear: number;
  /** آگهی‌های استثنایی که در مقایسه و میانگین حساب نشدند */
  exceptions?: number;
}) {
  const counts: Record<Verdict, number> = { below: 0, fair: 0, above: 0, suspect: 0, unknown: 0, exception: 0 };
  for (const l of views) counts[valuations.get(l.token)?.verdict ?? 'unknown'] += 1;
  const judged = views.length - counts.unknown;

  return (
    <div className="space-y-5 p-4 md:p-5">
      <div className="space-y-1.5">
        <h2 className="text-base font-bold text-ink">دستیار قیمت آگهی‌ها</h2>
        <p className="text-xs leading-6 text-muted">
          هر آگهی فقط با آگهی‌های مشابه خودش مقایسه می‌شود: همان منطقه و همان سال ساخت. اگر قیمت هر متر تا {toFaDigits(FAIR_BAND * 100)}٪ با میانهٔ مشابه‌ها فاصله داشته باشد «منصفانه» است؛ ارزان‌تر از آن «زیر قیمت» و گران‌تر از آن «گران». کمتر از {toFaDigits(SUSPECT_RATIO * 100)}٪ مشابه‌ها «مشکوک» است و پیشنهاد نمی‌شود.
        </p>
      </div>

      {judged > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {(['below', 'fair', 'above', 'suspect'] as const).map((k) => (
            <Badge key={k} tone={VERDICT[k].tone}>
              {VERDICT[k].label}: {toFaDigits(counts[k])}
            </Badge>
          ))}
          {counts.unknown > 0 && <span className="text-2xs text-subtle">{toFaDigits(counts.unknown)} آگهی بدون سال ساخت یا مشابه کافی قضاوت نشد.</span>}
          {exceptions > 0 && (
            <span className="text-2xs text-subtle">
              {toFaDigits(exceptions)} آگهی استثنایی (قیمت خیلی دور از بقیهٔ منطقه) در فهرست آگهی‌ها هست ولی در میانگین و مقایسه حساب نشد.
            </span>
          )}
        </div>
      )}

      <PickList title={`پیشنهاد برتر نوساز (ساخت ${toFaDigits(jalaliYear)})`} picks={topPicks(views, valuations, 0, jalaliYear)} />
      <PickList title={`پیشنهاد برتر یک‌ساله (ساخت ${toFaDigits(jalaliYear - 1)})`} picks={topPicks(views, valuations, 1, jalaliYear)} />

      {exceptionViews.length > 0 && <ExceptionList exceptions={exceptionViews} regular={views} />}

      <Notice tone="info" title="این مقایسه حکم نهایی نیست">
        قیمت آگهی، قیمت پیشنهادی فروشنده است، نه قیمت معامله‌شده. طبقه، نما، کیفیت ساخت، خیابان و امکانات در قیمت هر متر دیده نمی‌شوند. پیش از تصمیم، آگهی را باز کنید و با فروشنده و یک کارشناس بررسی کنید.
      </Notice>
    </div>
  );
}

/**
 * آگهی‌های استثنایی: دیده می‌شوند (نه حذف)، ولی جدا از پیشنهادها و میانگین. برای هر کدام فاصله از
 * سقف بازهٔ عادی منطقه (۷۵٪) گفته می‌شود تا کاربر خودش ببیند آیا امکانات/پروژه این فاصله را توجیه می‌کند.
 */
function ExceptionList({ exceptions, regular }: { exceptions: ListingView[]; regular: ListingView[] }) {
  const rows = [...exceptions].sort((a, b) => (b.pricePerSqmToman ?? 0) - (a.pricePerSqmToman ?? 0));
  const boundsOf = (l: ListingView) => {
    const area = areaKeyOf(l.neighborhoodKey);
    const v = regular.filter((r) => areaKeyOf(r.neighborhoodKey) === area).map((r) => r.pricePerSqmToman).filter((x): x is number => x !== null && x > 0);
    return { p25: percentile(v, 25), p75: percentile(v, 75) };
  };
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-ink">آگهی‌های استثنایی (جدا از میانگین)</h3>
      <p className="text-xs leading-6 text-muted">
        قیمت این آگهی‌ها خیلی دور از بقیهٔ منطقه است. واقعی‌اند و حذف نشده‌اند، ولی چون چند آگهی می‌توانند میانگین کل منطقه را جابه‌جا کنند، جدا نشان داده می‌شوند. معمولاً پروژهٔ خاص، متراژ خیلی بزرگ یا امکانات ویژه دارند؛ پیش از مقایسه، توضیح آگهی را ببینید.
      </p>
      <ul className="space-y-2">
        {rows.map((l) => {
          const { p25, p75 } = boundsOf(l);
          const ppm = l.pricePerSqmToman;
          // گران: نسبت به مرز ۲۵٪ گران‌تر؛ ارزان: نسبت به مرز ۲۵٪ ارزان‌تر
          const high = ppm !== null && p75 !== null && ppm > p75;
          const ref = high ? p75 : p25;
          const gap = ref && ppm ? Math.round(Math.abs(ppm / ref - 1) * 100) : null;
          return (
            <li key={l.token} className="flex items-start justify-between gap-3 rounded-field border border-warn/40 p-3">
              <div className="min-w-0">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="group inline-flex max-w-full items-center gap-1 text-sm font-semibold text-ink hover:text-accent">
                  <span className="truncate">{l.title ?? 'آگهی بدون عنوان'}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
                </a>
                <p className="mt-0.5 text-xs text-muted">
                  {neighborhoodDisplayName(l.neighborhoodKey)}
                  {l.areaSqm !== null && <> · {toFaDigits(l.areaSqm)} متر</>}
                  {l.yearBuilt !== null && <> · ساخت {toFaDigits(l.yearBuilt)}</>}
                </p>
                {gap !== null && ref !== null && (
                  <p className="mt-0.5 text-2xs text-muted">
                    {high ? `${toFaDigits(gap)}٪ بالاتر از مرز ۲۵٪ گران‌تر منطقه` : `${toFaDigits(gap)}٪ پایین‌تر از مرز ۲۵٪ ارزان‌تر منطقه`} ({fmtMillionToman(ref)})
                  </p>
                )}
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold text-ink">{fmtMillionToman(ppm)}</p>
                <p className="text-2xs text-muted">کل {fmtTotalToman(l.totalPriceToman)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
