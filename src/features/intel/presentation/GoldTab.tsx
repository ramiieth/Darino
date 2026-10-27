/**
 * محتوای صفحهٔ «طلای ایران» — قیمت ۱۸ عیار و سکه در برابر ارزش طلای خالصشان (انس × دلار آزاد):
 *   ۱) کارت ارزش‌گذاری: حباب امروز در برابر ۸۰٪ میانی حباب از ۲۰۱۳ و هزینهٔ رفت‌وبرگشت
 *   ۲) پلتفرم‌ها: ارزان‌ترین برای خرید، بهترین برای فروش، اسپرد و حباب هر کدام
 *   ۳) سکه‌ها: حباب امامی، نیم و ربع در برابر تاریخچهٔ خودشان
 *   ۴) تجزیهٔ رشد ۷ و ۳۰ روزه: انس + دلار آزاد + حباب
 * «بخر/نخر» نمی‌دهد؛ آزمون ۱۳ ساله قبول نشد (scripts/gold-backtest.ts).
 */
import { ExternalLink } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { COIN_FA, PLATFORM_FA, percentileOf, platformsVsBazaar, valuation, type CoinRow, type Decomposition, type GoldPayload, type PlatformRow, type PremiumStats, type Valuation } from '../domain/gold';
import { useGold } from '../data/intelApi';

/** ۰.۰۱۲ ← «+۱٫۲٪» */
const pct = (v: number, digits = 1, signed = true) => {
  const s = (Math.abs(v) * 100).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return `${signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : ''}${toFaDigits(s)}٪`;
};
const million = (toman: number) => `${toFaDigits((toman / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }))} میلیون`;
const year = (t: number) => toFaDigits(new Date(t).getUTCFullYear());

export function GoldTab() {
  const q = useGold();
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError || !q.data) return <ErrorState message="قیمت طلا دریافت نشد" onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <ValueCard d={d} />
      <Platforms d={d} />
      {d.coins.length > 0 && <Coins coins={d.coins} />}
      {d.decomposition.length > 0 && <Growth rows={d.decomposition} />}
      <Notice tone="neutral">
        طلای پلتفرم‌های آنلاین در دست شما نیست و نزد خود شرکت نگه‌داری می‌شود (ریسک طرف مقابل). کارمزد خرید و فروش در قیمت‌ها نیست و معمولاً حدود ۰.۵٪ است.
      </Notice>
      <Disclosure summary="روش محاسبه، آزمون و منبع">
        <ul className="list-disc space-y-1.5 ps-5 text-xs leading-6 text-muted">
          <li>ارزش طلای خالص = انس به دلار (xyz:GOLD هایپرلیکوئید) ÷ ۳۱.۱ × گرم طلای خالص × دلار آزاد (tgju). هر گرم ۱۸ عیار ۰.۷۵ گرم و سکهٔ امامی ۷.۳۲ گرم طلای خالص دارد.</li>
          <li>«ارزان» یا «گران» فقط وقتی گفته می‌شود که حباب هم بیرون از ۸۰٪ میانی روزهای گذشته باشد و هم از هزینهٔ یک خرید و فروش بزرگ‌تر.</li>
          <li>آزمون ۱۳ ساله (۲۰۱۳ تا ۲۰۲۶، دو سال آخر مهروموم): خرید طلای ۱۸ عیار وقتی حباب زیر ۳٪- بود، در ۲۰ روز ۶۸٪ برد داشت و ۲.۳٪ بهتر از خرید در روزهای عادی بود، ولی با ۳۱ معامله از شانس قابل تشخیص نبود. خرید سکه در حباب پایین حتی بدتر از روزهای عادی بود. برای همین پیشنهاد خرید داده نمی‌شود.</li>
          <li>دارینو حباب روزانه را هم ثبت می‌کند{d.recordedDays > 0 && ` (${toFaDigits(d.recordedDays)} روز تا حالا)`}. تالین فقط به اینترنت ایران قیمت می‌دهد و اینجا نیست.</li>
          <li>نشانی‌ها از پروژه‌های متن‌باز iran-gold-mcp و tgju-mcp سپهر رادمرد (github.com/sepehr071). توصیهٔ مالی نیست.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

const VALUE_FA: Record<Valuation, { title: (p: number) => string; body: string; border: string }> = {
  cheap: {
    title: (p) => `حباب طلای ۱۸ عیار ${pct(p)}، پایین‌تر از معمول`,
    body: 'حباب امروز در ۱۰٪ پایین روزهای گذشته است و فاصله‌اش از هزینهٔ یک خرید و فروش بیشتر است. در آزمون ۱۳ ساله خرید در چنین روزهایی کمی بهتر بود، ولی از شانس قابل تشخیص نبود.',
    border: 'border-gain/50'
  },
  rich: {
    title: (p) => `حباب طلای ۱۸ عیار ${pct(p)}، بالاتر از معمول`,
    body: 'حباب امروز در ۱۰٪ بالای روزهای گذشته است. اگر به حد معمول برگردد، همین مقدار از قیمت کم می‌شود حتی اگر انس و دلار تکان نخورند.',
    border: 'border-warn/50'
  },
  fair: {
    title: (p) => `حباب طلای ۱۸ عیار ${pct(p)}، در محدودهٔ معمول`,
    body: 'قیمت با ارزش طلای خالصش (انس × دلار آزاد) هم‌خوان است؛ از این نظر نه ارزان است نه گران. قیمت از اینجا با انس و دلار حرکت می‌کند.',
    border: 'border-divider'
  },
  unknown: {
    title: () => 'حباب هنوز محاسبه نشد',
    body: 'قیمت انس یا دلار دریافت نشد؛ قیمت پلتفرم‌ها پایین آمده است.',
    border: 'border-divider'
  }
};

function ValueCard({ d }: { d: GoldPayload }) {
  const v = valuation(d.premium, d.rows, d.stats, d.dollarSource);
  const t = VALUE_FA[v.state];
  return (
    <Surface variant="focal" className={cn('border-2 p-5', t.border)}>
      <h3 className="text-lg font-extrabold text-ink">{t.title(d.premium ?? 0)}</h3>
      <p className="mt-1.5 text-sm leading-7 text-muted">{t.body}</p>
      {d.dollarSource === 'usdt' && <p className="mt-2 text-xs text-warn">دلار آزاد دریافت نشد؛ با تتر حساب شده که معمولاً ۱ تا ۲٪ با دلار آزاد فرق دارد.</p>}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-divider pt-4 sm:gap-4">
        <div>
          <dt className="text-2xs font-semibold text-muted">ارزش طلای خالص</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{d.intrinsic ? million(d.intrinsic) : '—'}</dd>
          <dd className="text-2xs text-subtle">تومان، هر گرم ۱۸ عیار</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">انس طلا</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl"><bdi dir="ltr">{d.ounceUsd ? `$${d.ounceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}</bdi></dd>
          <dd className="text-2xs text-subtle">دلار</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">{d.dollarSource === 'free' ? 'دلار آزاد' : 'دلار تتر'}</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{d.dollarToman ? toFaDigits(Math.round(d.dollarToman).toLocaleString('en-US')) : '—'}</dd>
          <dd className="text-2xs text-subtle">تومان</dd>
        </div>
      </dl>

      {d.premium !== null && <PremiumBar now={d.premium} stats={d.dollarSource === 'free' ? d.stats : null} low={v.low} high={v.high} />}
      <p className="mt-3 text-2xs text-subtle">به‌روز {fmtRelativeAge(d.fetchedAt)}</p>
    </Surface>
  );
}

/** نوار حباب: صفر وسط، ۸۰٪ میانی تاریخچه، میانه و نقطهٔ امروز */
function PremiumBar({ now, stats, low, high, compact = false }: { now: number; stats: PremiumStats | null; low: number; high: number; compact?: boolean }) {
  const span = Math.max(0.05, Math.abs(now), Math.abs(low), Math.abs(high)) * 1.15;
  const x = (v: number) => `${((v + span) / (2 * span)) * 100}%`;
  return (
    <div className={compact ? 'mt-2' : 'mt-4 border-t border-divider pt-4'}>
      {!compact && (
        <p className="text-2xs font-semibold text-muted">
          {stats ? `از ${year(stats.since)}: ۸۰٪ روزها حباب بین ${pct(stats.p10)} و ${pct(stats.p90)}، میانه ${pct(stats.p50)}` : `بی‌حباب ± ${pct(high, 1, false)} (هزینهٔ رفت‌وبرگشت)`}
        </p>
      )}
      <div dir="ltr" className="relative mt-3 h-2 rounded-full bg-surface-2" role="img" aria-label={`حباب ${pct(now)}`}>
        <span className="absolute inset-y-0 rounded-full bg-brand/25" style={{ left: x(low), right: `calc(100% - ${x(high)})` }} aria-hidden />
        <span className="absolute -inset-y-1 w-px bg-ink/40" style={{ left: x(stats?.p50 ?? 0) }} aria-hidden />
        <span className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-surface bg-ink" style={{ left: x(now) }} aria-hidden />
      </div>
      {!compact && (
        <div dir="ltr" className="mt-1.5 flex justify-between text-2xs text-subtle">
          <span>ارزان‌تر از معمول</span>
          <span>گران‌تر از معمول</span>
        </div>
      )}
    </div>
  );
}

function Platforms({ d }: { d: GoldPayload }) {
  const bestSell = d.rows.reduce<PlatformRow | null>((b, r) => (!b || r.sell > b.sell ? r : b), null);
  const vsBazaar = platformsVsBazaar(d.rows, d.bazaar);
  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">طلای ۱۸ عیار آب‌شده، هر گرم</h3>
      {d.bazaar && (
        <p className="mt-1 text-xs leading-6 text-muted">
          قیمت بازار (tgju): {million(d.bazaar)} تومان
          {vsBazaar !== null && ` · پلتفرم‌های آنلاین امروز ${pct(Math.abs(vsBazaar), 1, false)} ${vsBazaar < 0 ? 'ارزان‌تر' : 'گران‌تر'} از بازار`}
        </p>
      )}
      <ul className="mt-2 divide-y divide-divider">
        {d.rows.map((r, i) => (
          <li key={r.platform} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 font-bold text-ink">
                {PLATFORM_FA[r.platform].name}
                {i === 0 && <Badge tone="gain">ارزان‌ترین خرید</Badge>}
                {bestSell?.platform === r.platform && d.rows.length > 1 && <Badge tone="info">بهترین فروش</Badge>}
              </p>
              <p className="text-2xs text-muted">
                خرید {million(r.buy)} · فروش {million(r.sell)}{r.buy !== r.sell && ` · اسپرد ${pct(r.spread, 1, false)}`}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-sm font-bold text-ink">{Number.isFinite(r.premium) ? pct(r.premium) : '—'}</p>
              <p className="text-2xs text-subtle">حباب</p>
            </div>
            <a href={PLATFORM_FA[r.platform].url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-subtle hover:text-brand" aria-label={`باز کردن ${PLATFORM_FA[r.platform].name}`}>
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      {d.failed.length > 0 && <p className="mt-2 text-2xs text-subtle">جواب نداد: {d.failed.map((p) => PLATFORM_FA[p].name).join('، ')}</p>}
      <p className="mt-1 text-2xs text-subtle">میلی، وال‌گلد و ملی‌گلد یک قیمت برای خرید و فروش دارند و هزینه‌شان در کارمزد است.</p>
    </Surface>
  );
}

const POSITION_FA = { low: 'پایین‌تر از معمول', mid: 'در محدودهٔ معمول', high: 'بالاتر از معمول' } as const;

function Coins({ coins }: { coins: CoinRow[] }) {
  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">حباب سکه</h3>
      <p className="mt-1 text-xs leading-6 text-muted">قیمت هر سکه در برابر ارزش طلای خالص داخلش. سکه‌های کوچک‌تر همیشه حباب بیشتری دارند؛ برای همین هر کدام با تاریخچهٔ خودش مقایسه می‌شود.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {coins.map((c) => {
          const pos = c.stats ? percentileOf(c.premium, c.stats) : null;
          return (
            <li key={c.coin} className="rounded-field bg-surface-2/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-ink">{COIN_FA[c.coin]}</p>
                <p className="text-sm font-extrabold text-ink">{pct(c.premium)}</p>
              </div>
              <p className="text-2xs text-muted">{million(c.price)} تومان</p>
              {c.stats && <PremiumBar now={c.premium} stats={c.stats} low={c.stats.p10} high={c.stats.p90} compact />}
              {c.stats && pos && (
                <p className="mt-1.5 text-2xs text-subtle">
                  {POSITION_FA[pos]} · میانه از {year(c.stats.since)}: {pct(c.stats.p50)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

function Growth({ rows }: { rows: Decomposition[] }) {
  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">رشد طلای ایران از کجا آمد؟</h3>
      <p className="mt-1 text-xs leading-6 text-muted">تغییر قیمت طلای ۱۸ عیار بازار، تقسیم به سهم انس جهانی، دلار آزاد، و بزرگ یا کوچک شدن حباب.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>بازه</th>
              <th className="col-num">طلای ۱۸</th>
              <th className="col-num">انس</th>
              <th className="col-num">دلار آزاد</th>
              <th className="col-num">حباب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.days}>
                <td className="font-bold text-ink">{toFaDigits(r.days)} روز</td>
                {[r.iran, r.ounce, r.dollar, r.premium].map((v, i) => (
                  <td key={i} className={cn('col-num', i === 0 && 'font-bold', v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : '')}>{pct(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
