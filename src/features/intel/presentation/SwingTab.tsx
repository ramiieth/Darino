/**
 * تب «سوینگ» — بازطراحی‌شده، خلوت و متصل به نمادهای زنده بازار، کمیته ایجنت‌ها و ستاپ پایان ماه:
 *   ۱) نوار وضعیت سریع بازار (بیت‌کوین vs میانگین ۲۰۰ روزه + پهنای بازار + لینک مستقیم ستاپ پایان ماه)
 *   ۲) پیشنهاد خودکار ورود سوینگ روی ارزهای ارزنده بازار (ورود، حد زیان، هدف ۲.۵R + دکمهٔ تأیید با کمیته ایجنت‌ها)
 *   ۳) محاسبهٔ سریع اندازهٔ پوزیشن سوینگ (اسپات و اهرم مجاز پرپ)
 */
import { useEffect, useMemo, useState } from 'react';
import { Bot, Calendar, Check, Sparkles, X } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { hydrateUniverse, syncUniverse, useMarketsStore } from '@/features/markets/pipeline/store';
import { useMarkets } from '@/features/markets/pipeline/useMarkets';
import { getAssetAthAndRangeInfo } from '@/features/markets/domain/athAndRangeAnalytics';
import {
  ALT_BEAT_BTC_20D,
  REGIME_BREADTH,
  pickSwingOpportunities,
  sizeFor,
  type AssetClass,
  type Horizon,
  type SwingOpportunity,
  type SwingPayload
} from '../domain/swing';
import { useSwing } from '../data/intelApi';
import { UsdShort, fmtPrice } from './parts';

const pct = (v: number, digits = 0) => `${toFaDigits((v * 100).toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`;
const num = (v: number, digits = 1) => toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }));

export function SwingTab({
  onAnalyzeWithAgents,
  onOpenEom
}: {
  onAnalyzeWithAgents: (coin: string) => void;
  onOpenEom: () => void;
}) {
  const q = useSwing();
  useMarkets('crypto_top_200');
  const cryptoAssets = useMarketsStore((s) => s.data.crypto_top_200);
  const marketLoading = useMarketsStore((s) => s.loading.crypto_top_200);

  useEffect(() => {
    void hydrateUniverse('crypto_top_200').then(() => syncUniverse('crypto_top_200'));
  }, []);

  const opportunities = useMemo(() => {
    const enriched = cryptoAssets.map((a) => {
      const info = getAssetAthAndRangeInfo({
        symbol: a.symbol,
        currentPrice: a.price,
        change30d: a.change30d,
        change7d: a.change7d,
        source: a.source
      });
      return {
        id: a.id,
        symbol: a.symbol,
        price: a.price,
        change24h: a.change24h,
        change7d: a.change7d,
        change30d: a.change30d,
        marketCap: a.marketCap,
        rank: a.rank,
        image: a.image,
        rangeStatus: info?.rangeStatus ?? null,
        drawdownFromAthPct: info?.drawdownFromAthPct ?? null,
        rangeLow: info?.rangeLow ?? null
      };
    });
    return pickSwingOpportunities(enriched, q.data ?? null, 6);
  }, [cryptoAssets, q.data]);

  return (
    <div className="space-y-5">
      {/* ۱. نوار وضعیت سریع بازار + لینک ستاپ پایان ماه */}
      {q.isLoading ? (
        <ListSkeleton rows={2} />
      ) : q.isError || !q.data ? (
        <ErrorState message="وضعیت بازار دریافت نشد" onRetry={() => void q.refetch()} />
      ) : (
        <RegimeStrip d={q.data} onOpenEom={onOpenEom} />
      )}

      {/* ۲. پیشنهاد ورود سوینگ روی ارزهای ارزنده بازار */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
              <Sparkles className="h-4 w-4 text-accent" />
              پیشنهاد ورود سوینگ (متصل به بازار)
            </h2>
            <p className="text-xs text-muted">ارزهای ارزنده بر اساس ناحیهٔ رنج، فاصله از سقف تاریخی و مومنتوم</p>
          </div>
          <Badge tone="info">{toFaDigits(opportunities.length)} ارز برتر</Badge>
        </div>

        {marketLoading && opportunities.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : opportunities.length === 0 ? (
          <Surface className="p-4 text-xs text-muted">در حال دریافت داده‌های زندهٔ بازار برای استخراج فرصت‌های سوینگ…</Surface>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {opportunities.map((op) => (
              <OpportunityCard key={op.id} op={op} onAnalyze={() => onAnalyzeWithAgents(op.symbol)} />
            ))}
          </div>
        )}
      </section>

      {/* ۳. محاسبه‌گر فشردهٔ اندازهٔ پوزیشن */}
      <CompactSizer />
    </div>
  );
}

/* ---------------- نوار وضعیت بازار ---------------- */

function RegimeStrip({ d, onOpenEom }: { d: SwingPayload; onOpenEom: () => void }) {
  const r = d.regime;
  const btcGap = d.btc?.sma200 ? d.btc.close / d.btc.sma200 - 1 : null;
  const up = r.breadth === null ? null : Math.round(r.breadth * r.counted);
  const toneBorder = r.state === 'on' ? 'border-gain/40' : r.state === 'off' ? 'border-warn/40' : 'border-divider';
  const dot = r.state === 'on' ? 'bg-gain' : r.state === 'off' ? 'bg-warn' : 'bg-ink/30';
  const title = r.state === 'on' ? 'روند بازار صعودی است' : r.state === 'off' ? 'بازار در فاز احتیاط (ورود پله‌ای)' : 'در حال محاسبهٔ وضعیت بازار';

  return (
    <Surface variant="focal" className={cn('border p-4 space-y-3', toneBorder)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} aria-hidden />
          <h3 className="text-sm font-extrabold text-ink">{title}</h3>
          <span className="text-[11px] text-subtle">· {fmtRelativeAge(d.fetchedAt)}</span>
        </div>
        <Button size="sm" variant="outline" icon={<Calendar className="h-3.5 w-3.5" />} onClick={onOpenEom}>
          ستاپ پایان ماه (EOM)
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <RegimePill
          ok={r.btcAbove200}
          label="بیت‌کوین / میانگین ۲۰۰ روزه"
          value={btcGap === null ? '—' : `${btcGap >= 0 ? pct(btcGap, 1) + ' بالا' : pct(-btcGap, 1) + ' پایین'}`}
        />
        <RegimePill
          ok={r.breadth === null ? null : r.breadth >= REGIME_BREADTH}
          label="کوین‌های بالای میانگین ۵۰ روزه"
          value={up === null ? '—' : `${toFaDigits(up)} از ${toFaDigits(r.counted)}`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/60 pt-2.5 text-[11px] text-muted">
        <span>
          واقعیت بکتست ۳ ساله: آلت‌کوین‌ها در افق ۲۰ روزه فقط{' '}
          <strong className="text-ink">{pct(ALT_BEAT_BTC_20D.low)} تا {pct(ALT_BEAT_BTC_20D.high)}</strong> مواقع از نگه‌داشتن BTC بهتر بوده‌اند.
        </span>
        {d.summary.closed > 0 && (
          <span className="font-semibold text-ink">
            کاندید آزمایشی D+E: {toFaDigits(d.summary.wins)} برد از {toFaDigits(d.summary.closed)} بسته
            {d.summary.meanNet !== null ? ` (میانگین خالص ${pct(d.summary.meanNet, 1)})` : ''}
          </span>
        )}
      </div>
    </Surface>
  );
}

function RegimePill({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-control bg-surface-2/60 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted">
        <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', ok === null ? 'bg-card text-subtle' : ok ? 'bg-gain/15 text-positive' : 'bg-negative/12 text-negative')}>
          {ok === null ? '?' : ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </span>
        {label}
      </span>
      <span className="num-ltr font-bold text-ink">{value}</span>
    </div>
  );
}

/* ---------------- کارت پیشنهاد ورود سوینگ ---------------- */

function OpportunityCard({ op, onAnalyze }: { op: SwingOpportunity; onAnalyze: () => void }) {
  const info = assetDisplayName(op.symbol);
  const badgeTone =
    op.verdict === 'entry'
      ? 'gain'
      : op.verdict === 'accumulate'
        ? 'info'
        : op.verdict === 'avoid'
          ? 'loss'
          : 'neutral';
  const img =
    op.image?.includes('coin-images.coingecko.com') && op.image.includes('/large/')
      ? op.image.replace('/large/', '/small/')
      : op.image;

  return (
    <Surface className="flex flex-col justify-between gap-3 p-4 transition-colors hover:border-accent/40">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {img ? (
              <img src={img} alt="" width={34} height={34} loading="lazy" className="h-8 w-8 shrink-0 rounded-full bg-surface-2 object-contain" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                {op.symbol.slice(0, 3)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-ink">{info.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-subtle" dir="ltr">{op.symbol}</span>
                <Badge tone={badgeTone}>{op.verdictFa}</Badge>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-end">
            <p className="whitespace-nowrap text-sm font-extrabold text-ink">
              <MoneyValue value={op.price} />
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px]">
              <PercentValue value={op.change24h} />
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink">
                امتیاز {toFaDigits(op.score)}
              </span>
            </div>
          </div>
        </div>

        {/* سطوح ورود، حد زیان و هدف سوینگ */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-divider bg-divider text-center">
          <div className="bg-card px-2 py-1.5">
            <p className="text-[10px] text-subtle">محدوده ورود</p>
            <p className="num-ltr text-xs font-bold text-ink">{fmtPrice(op.entry)}</p>
          </div>
          <div className="bg-card px-2 py-1.5">
            <p className="text-[10px] text-subtle">حد زیان (-{toFaDigits(op.stopPct)}٪)</p>
            <p className="num-ltr text-xs font-bold text-negative">{fmtPrice(op.stop)}</p>
          </div>
          <div className="bg-card px-2 py-1.5">
            <p className="text-[10px] text-subtle">هدف ۲.۵R</p>
            <p className="num-ltr text-xs font-bold text-positive">{fmtPrice(op.target2)}</p>
          </div>
        </div>

        <p className="text-xs text-muted">{op.reason}</p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-divider/60 pt-2.5">
        <span className="text-[11px] text-subtle">هدف اول (۱.۵R): <b className="num-ltr text-ink">{fmtPrice(op.target1)}</b></span>
        <Button size="sm" variant="outline" icon={<Bot className="h-3.5 w-3.5" />} onClick={onAnalyze}>
          تأیید با کمیته ایجنت‌ها
        </Button>
      </div>
    </Surface>
  );
}

/* ---------------- محاسبه‌گر فشرده اندازهٔ پوزیشن ---------------- */

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

function CompactSizer() {
  const [s, setS] = useState<SizerState>(loadSizer);
  useEffect(() => {
    try { localStorage.setItem(SIZER_KEY, JSON.stringify(s)); } catch { /* خاموش */ }
  }, [s]);
  const capital = Number(s.capital);
  const risk = Number(s.risk);
  const r = sizeFor(capital, risk, s.cls, s.h);
  const rel = sizeFor(100, risk, s.cls, s.h);
  const set = (patch: Partial<SizerState>) => setS((p) => ({ ...p, ...patch }));

  return (
    <Surface className="space-y-3.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">اندازهٔ پوزیشن سوینگ</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedControl<AssetClass>
            size="sm"
            label="نوع دارایی"
            value={s.cls}
            onChange={(cls) => set({ cls })}
            options={[{ value: 'crypto', label: 'رمزارز' }, { value: 'tradfi', label: 'سنتی/سهام' }]}
          />
          <SegmentedControl<string>
            size="sm"
            label="مدت نگه‌داری"
            value={String(s.h)}
            onChange={(v) => set({ h: v === '5' ? 5 : 20 })}
            options={[{ value: '5', label: '۱ هفته' }, { value: '20', label: '۱ ماه' }]}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="حداکثر ریسک هر ورود (٪ سرمایه)">
          <Input type="number" inputMode="decimal" dir="ltr" min={0.1} max={10} step={0.1} value={s.risk} onChange={(e) => set({ risk: e.target.value })} suffix="%" />
        </Field>
        <Field label="کل سرمایه (دلار)">
          <Input type="number" inputMode="decimal" dir="ltr" min={0} placeholder="10000" value={s.capital} onChange={(e) => set({ capital: e.target.value })} suffix="دلار" />
        </Field>
      </div>

      {rel && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-control bg-surface-2/60 p-3">
            <p className="text-[11px] text-muted">سقف حجم اسپات</p>
            <p className="mt-0.5 text-sm font-extrabold text-ink">
              {num(rel.spotMaxUsd)}٪ سرمایه {r && <span className="font-normal text-muted">(<UsdShort value={r.spotMaxUsd} />)</span>}
            </p>
          </div>
          <div className="rounded-control bg-surface-2/60 p-3">
            <p className="text-[11px] text-muted">سقف اهرم پرپ</p>
            <p className="mt-0.5 text-sm font-extrabold text-ink">
              <bdi dir="ltr">{num(rel.perpMaxLeverage)}x</bdi> {r && <span className="font-normal text-muted">(مارجین <UsdShort value={r.perpMarginUsd} />)</span>}
            </p>
          </div>
        </div>
      )}
    </Surface>
  );
}
