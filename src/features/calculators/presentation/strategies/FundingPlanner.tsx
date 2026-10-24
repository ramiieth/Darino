/**
 * ⑬ برنامه‌ریز فاندینگ — کاربر فقط نماد و سرمایه را انتخاب می‌کند؛
 * همهٔ راه‌های قابل اجرا روی صرافی‌های دارینو (+ قفل نرخ Boros) با دادهٔ زنده ساخته، محاسبه و رتبه‌بندی می‌شوند.
 * فقط محاسبه؛ هیچ سفارشی ثبت نمی‌شود.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { normalizeForSearch, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { borosVenueName } from '@/features/boros/presentation/borosLabels';
import type { BorosMarket } from '@/features/boros/domain/types';
import { ResultHero } from '../StatCard';
import { numOr } from '../parse';
import { evaluatePlan, rankPlans, type PlanInputs, type PlanKind, type FundingPlanResult, type PlanWarning } from '@/features/calculators/domain';
import { useDeltaBooks } from '@/features/calculators/data/deltaMarkets';
import {
  activeBoros,
  buildPlans,
  isPlannerBoros,
  isSpread,
  legLabel,
  listSymbols,
  SYMBOL_GROUP_LABELS,
  useBorosPlannerMarkets,
  useSymbolLegs,
  withSlippage,
  type FeeMode,
  type LegData,
  type PlannerSymbol,
  type PlanOption,
  type SymbolGroup
} from '@/features/calculators/data/fundingPlanner';

const KIND: Record<PlanKind, { label: string; note: string; tone: Tone }> = {
  perpPerp: { label: 'پرپ–پرپ بین دو صرافی', note: 'شورت روی فاندینگ بیشتر، لانگ روی فاندینگ کمتر؛ سود = اختلاف فاندینگ (شناور).', tone: 'neutral' },
  spotPerp: { label: 'اسپات + شورت پرپ', note: 'دارایی را بخرید و هم‌اندازه شورت بزنید؛ فاندینگ مثبت را می‌گیرید (شناور).', tone: 'neutral' },
  borosSpot: { label: 'اسپات + شورت پرپ + قفل Boros', note: 'فاندینگ شورت را در Boros به نرخ ثابت می‌فروشید؛ کل درآمد تا سررسید ثابت است.', tone: 'gain' },
  borosPair: { label: 'پرپ–پرپ + قفل Boros', note: 'یک یا هر دو پای پرپ در Boros به نرخ ثابت قفل می‌شود.', tone: 'gain' },
  borosSpread: { label: 'بازار اسپرد Boros (HL − Gate)', note: 'شورت هایپرلیکوئید + لانگ گیت + Short YU اسپرد؛ نرخ ثابت روی اختلاف دو صرافی.', tone: 'warn' }
};

const WARN: Record<PlanWarning, { text: string; tone: 'warn' | 'error' }> = {
  netNegative: { text: 'سود خالص منفی است؛ هزینه‌ها از درآمد بیشترند.', tone: 'error' },
  overLeverage: { text: 'اهرم انتخابی از سقف اهرم یکی از صرافی‌ها بیشتر است.', tone: 'error' },
  liquidationNear: { text: 'فاصلهٔ لیکوئید پرپ کمتر از ۱۵٪ است؛ اهرم را کم یا بافر را زیاد کنید.', tone: 'warn' },
  borosRateNear: { text: 'اگر نرخ ضمنی Boros کمتر از ۳ واحد درصد علیه شما حرکت کند، پوزیشن Boros لیکوئید می‌شود؛ ضریب وثیقه را زیاد کنید.', tone: 'warn' },
  slipAssumed: { text: 'دفتر سفارش یکی از پاها در دسترس نبود یا عمقش کافی نیست؛ اسلیپیج پیش‌فرض شما فرض شد.', tone: 'warn' },
  external: { text: 'پای گیت در دارینو نیست؛ برای اجرا حساب Gate لازم است. کارمزد گیت را در تنظیمات پیشرفته بررسی کنید.', tone: 'warn' },
  shortHold: { text: 'کمتر از ۳ روز تا سررسید Boros مانده؛ کارمزد ثابت پرپ روی مدت کوتاه سنگین است.', tone: 'warn' },
  floating: { text: 'بخشی از درآمد شناور است و با تغییر فاندینگ عوض می‌شود؛ عدد بر مبنای میانگین ۷ روز (یا نرخ الان) است.', tone: 'warn' }
};

type KindFilter = 'all' | 'locked' | 'floating';
type Form = Record<'capital' | 'leverage' | 'holdDays' | 'bufferPct' | 'borosCollateralX' | 'spotFeePct' | 'fallbackSlipPct' | 'transferUsd' | 'gateFeePct', string>;

const DEFAULT_FORM: Form = {
  capital: '10000',
  leverage: '3',
  holdDays: '30',
  bufferPct: '10',
  borosCollateralX: '2',
  spotFeePct: '0.1',
  fallbackSlipPct: '0.05',
  transferUsd: '10',
  gateFeePct: '0.05'
};

const SCENARIOS = [
  { factor: 1, label: 'مثل مبنا' },
  { factor: 0.5, label: 'نصف شود' },
  { factor: 0, label: 'صفر شود' },
  { factor: -1, label: 'برعکس شود' }
];

const fmtDate = (sec: number) => {
  try {
    return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(sec * 1000));
  } catch {
    return '';
  }
};
const logoKind = (g: SymbolGroup) => (g === 'crypto' ? 'crypto' : 'tradfi');
const pct = (rate: number) => rate * 100;

interface Row {
  option: PlanOption;
  result: FundingPlanResult;
  scenario: PlanInputs;
}

export function FundingPlanner() {
  const books = useDeltaBooks();
  const borosQ = useBorosPlannerMarkets();
  const boros = useMemo(() => borosQ.data?.markets ?? [], [borosQ.data]);
  const nowSec = Math.floor(Date.now() / 60_000) * 60;
  const symbols = useMemo(() => listSymbols(books, boros, nowSec), [books, boros, nowSec]);
  const [base, setBase] = useState<string | null>(null);
  const symbol = symbols.find((s) => s.base === base) ?? null;
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [feeMode, setFeeMode] = useState<FeeMode>('taker');
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const loadingVenues = Object.values(books).every((b) => b.status === 'loading');

  return (
    <div className="space-y-5">
      <Step n={1} title="نماد را انتخاب کنید">
        {loadingVenues ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <SymbolPicker symbols={symbols} value={symbol} onChange={(s) => setBase(s?.base ?? null)} />
        )}
      </Step>

      <Step n={2} title="سرمایه و شرایط">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="سرمایهٔ کل">
            <Input dir="ltr" inputMode="decimal" value={form.capital} onChange={(e) => set('capital')(e.target.value)} suffix="دلار" />
          </Field>
          <Field label="اهرم پرپ">
            <Input dir="ltr" inputMode="decimal" value={form.leverage} onChange={(e) => set('leverage')(e.target.value)} suffix="x" />
          </Field>
          <Field label="مدت (بدون Boros)">
            <Input dir="ltr" inputMode="decimal" value={form.holdDays} onChange={(e) => set('holdDays')(e.target.value)} suffix="روز" />
          </Field>
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-muted">نوع سفارش پرپ</p>
          <SegmentedControl<FeeMode>
            label="نوع سفارش"
            fill
            size="sm"
            value={feeMode}
            onChange={setFeeMode}
            options={[
              { value: 'taker', label: 'فوری (taker) + اسلیپیج' },
              { value: 'maker', label: 'لیمیت (maker)' }
            ]}
          />
        </div>
        <Disclosure summary="تنظیمات پیشرفته" className="mt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="بافر مارجین پرپ">
              <Input dir="ltr" inputMode="decimal" value={form.bufferPct} onChange={(e) => set('bufferPct')(e.target.value)} suffix="٪" />
            </Field>
            <Field label="وثیقهٔ Boros (× مارجین اولیه)">
              <Input dir="ltr" inputMode="decimal" value={form.borosCollateralX} onChange={(e) => set('borosCollateralX')(e.target.value)} suffix="x" />
            </Field>
            <Field label="کارمزد خرید/فروش اسپات">
              <Input dir="ltr" inputMode="decimal" value={form.spotFeePct} onChange={(e) => set('spotFeePct')(e.target.value)} suffix="٪" />
            </Field>
            <Field label="اسلیپیج پیش‌فرض (بدون دفتر سفارش)">
              <Input dir="ltr" inputMode="decimal" value={form.fallbackSlipPct} onChange={(e) => set('fallbackSlipPct')(e.target.value)} suffix="٪" />
            </Field>
            <Field label="انتقال، گس و برداشت">
              <Input dir="ltr" inputMode="decimal" value={form.transferUsd} onChange={(e) => set('transferUsd')(e.target.value)} suffix="دلار" />
            </Field>
            <Field label="کارمزد هر معامله در گیت">
              <Input dir="ltr" inputMode="decimal" value={form.gateFeePct} onChange={(e) => set('gateFeePct')(e.target.value)} suffix="٪" />
            </Field>
          </div>
        </Disclosure>
      </Step>

      {symbol ? (
        <SymbolPlans key={symbol.base} symbol={symbol} boros={boros} borosStatus={borosQ.isError ? 'error' : borosQ.data ? 'ready' : 'loading'} form={form} feeMode={feeMode} nowSec={nowSec} />
      ) : (
        <Notice tone="info">یک نماد انتخاب کنید تا همهٔ راه‌های گرفتن فاندینگ آن روی صرافی‌های شما محاسبه و مقایسه شود.</Notice>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Surface as="section" className="p-4 md:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-2xs text-on-accent">{toFaDigits(n)}</span>
        {title}
      </h3>
      {children}
    </Surface>
  );
}

/* ---------------- انتخاب نماد ---------------- */

function SymbolPicker({ symbols, value, onChange }: { symbols: PlannerSymbol[]; value: PlannerSymbol | null; onChange: (s: PlannerSymbol | null) => void }) {
  const [group, setGroup] = useState<SymbolGroup>('crypto');
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(!value);
  const groups = (Object.keys(SYMBOL_GROUP_LABELS) as SymbolGroup[]).filter((g) => symbols.some((s) => s.group === g));
  const list = useMemo(() => {
    const q = normalizeForSearch(query);
    const pool = q ? symbols : symbols.filter((s) => s.group === group);
    return (q ? pool.filter((s) => normalizeForSearch(s.base).includes(q) || normalizeForSearch(s.nameFa).includes(q)) : pool).slice(0, 48);
  }, [symbols, group, query]);

  if (value && !browsing) {
    return (
      <div className="flex items-center gap-3 rounded-field border border-divider-strong bg-card px-3 py-2.5">
        <AssetLogo symbol={value.base} kind={logoKind(value.group)} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            <bdi dir="ltr" className="font-latin">{value.base}</bdi> · {value.nameFa}
          </p>
          <p className="text-2xs text-muted">
            {toFaDigits(value.venues.length)} صرافی · {SYMBOL_GROUP_LABELS[value.group]}
            {value.hasBoros && ' · قفل نرخ Boros دارد'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-accent" onClick={() => setBrowsing(true)}>
          تغییر
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ChipGroup<SymbolGroup> label="نوع دارایی" value={group} onChange={setGroup} options={groups.map((g) => ({ value: g, label: SYMBOL_GROUP_LABELS[g] }))} />
      <SearchField value={query} onChange={setQuery} placeholder="جست‌وجوی نماد یا نام (BTC، تسلا، طلا…)" />
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">نمادی پیدا نشد.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((s) => (
            <li key={s.base}>
              <button
                type="button"
                onClick={() => {
                  onChange(s);
                  setBrowsing(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-field border px-2.5 py-2 text-start transition-colors hover:border-accent',
                  value?.base === s.base ? 'border-accent bg-surface-2' : 'border-divider bg-card'
                )}
              >
                <AssetLogo symbol={s.base} kind={logoKind(s.group)} size={26} />
                <span className="min-w-0 flex-1">
                  <bdi dir="ltr" className="block truncate font-latin text-sm font-bold text-ink">
                    {s.base}
                  </bdi>
                  <span className="block truncate text-2xs text-muted">
                    {toFaDigits(s.venues.length)} صرافی{s.hasBoros ? ' · Boros' : ''}
                  </span>
                </span>
                {value?.base === s.base && <Check aria-hidden className="size-4 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-2xs text-subtle">نمادهایی که در بیش از یک صرافی هستند اول آمده‌اند؛ برای پرپ–پرپ دست‌کم دو صرافی لازم است.</p>
    </div>
  );
}

/* ---------------- برنامه‌های یک نماد ---------------- */

function SymbolPlans({
  symbol,
  boros,
  borosStatus,
  form,
  feeMode,
  nowSec
}: {
  symbol: PlannerSymbol;
  boros: BorosMarket[];
  borosStatus: 'loading' | 'ready' | 'error';
  form: Form;
  feeMode: FeeMode;
  nowSec: number;
}) {
  const legs = useSymbolLegs(symbol.quotes);
  const symbolBoros = useMemo(() => activeBoros(boros, symbol.base, nowSec).filter(isPlannerBoros), [boros, symbol.base, nowSec]);
  const inputs: PlanInputs = {
    capital: numOr(form.capital, 0),
    leverage: numOr(form.leverage, 1),
    holdDays: numOr(form.holdDays, 30),
    bufferPct: numOr(form.bufferPct, 0),
    borosCollateralX: numOr(form.borosCollateralX, 1),
    spotFeePct: numOr(form.spotFeePct, 0),
    fallbackSlipPct: numOr(form.fallbackSlipPct, 0),
    transferUsd: numOr(form.transferUsd, 0),
    fundingFactor: 1
  };
  const inputKey = JSON.stringify(inputs);
  const gateFeePct = numOr(form.gateFeePct, 0.05);

  const rows = useMemo<Row[]>(() => {
    const options = buildPlans(legs, symbolBoros, { nowSec, feeMode, gateFeePct });
    return rankPlans(
      options.map((option) => {
        const n = evaluatePlan(option.spec, inputs).notional;
        const spec = withSlippage(option, n);
        return { option: { ...option, spec }, result: evaluatePlan(spec, inputs), scenario: inputs };
      })
    );
    // inputs در inputKey آمده است
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, symbolBoros, nowSec, feeMode, gateFeePct, inputKey]);

  const [filter, setFilter] = useState<KindFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = rows.filter((r) => filter === 'all' || (filter === 'locked' ? r.option.spec.boros.length > 0 : r.option.spec.boros.length === 0));
  const visible = showAll ? filtered : filtered.slice(0, 8);
  const selected = rows.find((r) => r.option.spec.id === selectedId) ?? filtered[0] ?? null;
  const historyLoading = legs.some((l) => l.historyStatus === 'loading');

  return (
    <>
      <Step n={3} title={`نرخ‌های ${symbol.base} در صرافی‌های شما`}>
        <VenueTable legs={legs} />
        {borosStatus === 'loading' ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : borosStatus === 'error' ? (
          <p className="mt-3 text-xs text-warn">دادهٔ Boros دریافت نشد؛ برنامه‌های قفل نرخ نمایش داده نمی‌شوند.</p>
        ) : symbolBoros.length > 0 ? (
          <BorosTable markets={symbolBoros} />
        ) : (
          <p className="mt-3 text-xs text-muted">Boros برای {symbol.base} بازار نرخ ثابت ندارد (فقط BTC، ETH و HYPE روی هایپرلیکوئید و لایتر).</p>
        )}
      </Step>

      <Step n={4} title="برنامه‌ها — مرتب بر اساس سود خالص سالانه روی سرمایه">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <ChipGroup<KindFilter>
            label="فیلتر برنامه"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `همه (${toFaDigits(rows.length)})` },
              { value: 'locked', label: 'نرخ ثابت Boros' },
              { value: 'floating', label: 'بدون Boros' }
            ]}
          />
          {historyLoading && <span className="text-2xs text-subtle">در حال دریافت میانگین ۷ روز…</span>}
        </div>
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            {symbol.venues.length < 2 && filter !== 'locked' ? 'این نماد فقط در یک صرافی است و فاندینگ مثبت هم ندارد.' : 'برنامه‌ای در این دسته نیست.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((r, k) => (
              <PlanRow key={r.option.spec.id} rank={k + 1} row={r} active={selected?.option.spec.id === r.option.spec.id} onSelect={() => setSelectedId(r.option.spec.id)} />
            ))}
          </ul>
        )}
        {filtered.length > 8 && (
          <Button variant="ghost" size="sm" className="mt-2 text-accent" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'نمایش کمتر' : `نمایش همهٔ ${toFaDigits(filtered.length)} برنامه`}
          </Button>
        )}
      </Step>

      {selected && <PlanDetail row={selected} base={symbol.base} />}
    </>
  );
}

function VenueTable({ legs }: { legs: LegData[] }) {
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5">
      <table className="data-table is-compact">
        <caption className="sr-only">فاندینگ صرافی‌ها</caption>
        <thead>
          <tr>
            <th scope="col" className="!ps-4 md:!ps-5">صرافی</th>
            <th scope="col" className="col-num">فاندینگ الان</th>
            <th scope="col" className="col-num">میانگین ۷ روز</th>
            <th scope="col" className="col-num">کارمزد taker</th>
            <th scope="col" className="col-num">سقف اهرم</th>
            <th scope="col" className="col-num !pe-4 md:!pe-5">حجم ۲۴ساعته</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l) => (
            <tr key={`${l.quote.venue}:${l.quote.ref}`}>
              <td className="!ps-4 md:!ps-5">{legLabel(l.quote)}</td>
              <td className="col-num"><PercentValue value={l.currentApr} digits={1} /></td>
              <td className="col-num">
                {l.historyStatus === 'loading' ? <Skeleton className="ms-auto h-4 w-10" /> : <PercentValue value={l.avg7dApr} digits={1} />}
              </td>
              <td className="col-num"><PercentValue value={l.quote.takerFeePct} digits={3} signed={false} tone="none" /></td>
              <td className="col-num">{l.quote.maxLeverage ? `${toFaDigits(l.quote.maxLeverage)}x` : '—'}</td>
              <td className="col-num !pe-4 md:!pe-5"><MoneyValue value={l.quote.volume24hUsd} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-4 text-2xs text-subtle md:px-5">فاندینگ به ٪ سالانه؛ مثبت = لانگ به شورت می‌پردازد.</p>
    </div>
  );
}

function BorosTable({ markets }: { markets: BorosMarket[] }) {
  const sorted = [...markets].sort((a, b) => a.venue.localeCompare(b.venue) || a.maturity - b.maturity);
  return (
    <div className="-mx-4 mt-4 overflow-x-auto md:-mx-5">
      <p className="mb-1 px-4 text-xs font-bold text-ink md:px-5">
        <Lock aria-hidden className="me-1 inline size-3.5" />
        نرخ ثابت Boros
      </p>
      <table className="data-table is-compact">
        <caption className="sr-only">بازارهای Boros</caption>
        <thead>
          <tr>
            <th scope="col" className="!ps-4 md:!ps-5">بازار</th>
            <th scope="col" className="col-num">سررسید</th>
            <th scope="col" className="col-num">فروش ثابت (bid)</th>
            <th scope="col" className="col-num">خرید ثابت (ask)</th>
            <th scope="col" className="col-num !pe-4 md:!pe-5">شناور الان</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.marketId}>
              <td className="!ps-4 md:!ps-5">
                {borosVenueName(m.venue)}
                {isSpread(m) && <Badge tone="warn" className="ms-1">نیاز به Gate</Badge>}
                {m.collateralSymbol && <span className="text-2xs text-subtle"> · وثیقه {m.collateralSymbol}</span>}
              </td>
              <td className="col-num">{fmtDate(m.maturity)}</td>
              <td className="col-num"><PercentValue value={m.bestBid > 0 ? pct(m.bestBid) : null} digits={2} /></td>
              <td className="col-num"><PercentValue value={m.bestAsk > 0 ? pct(m.bestAsk) : null} digits={2} /></td>
              <td className="col-num !pe-4 md:!pe-5"><PercentValue value={pct(m.floatingApr)} digits={2} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- ردیف و جزئیات ---------------- */

function legsText(o: PlanOption): string {
  const p = o.spec;
  const parts: string[] = [];
  if (p.spot) parts.push('خرید اسپات');
  for (const l of p.perps) parts.push(`${l.side === 'short' ? 'شورت' : 'لانگ'} ${l.venue}`);
  o.borosMarkets.forEach((m, k) => parts.push(`${p.boros[k].side === 'short' ? 'فروش' : 'خرید'} نرخ ثابت ${borosVenueName(m.venue)} تا ${fmtDate(m.maturity)}`));
  return parts.join(' · ');
}

function PlanRow({ row, rank, active, onSelect }: { row: Row; rank: number; active: boolean; onSelect: () => void }) {
  const { option, result } = row;
  const kind = KIND[option.spec.kind];
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={cn('flex w-full items-center gap-3 rounded-card border p-3 text-start transition-colors hover:border-accent', active ? 'border-accent bg-surface-2' : 'border-divider')}
      >
        <span className="w-5 shrink-0 text-center text-xs font-bold text-subtle">{toFaDigits(rank)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-ink">{kind.label}</span>
            {result.fullyLocked && <Badge tone="gain">ثابت تا سررسید</Badge>}
            {option.spec.perps.some((l) => l.external) && <Badge tone="warn">نیاز به حساب Gate</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">{legsText(option)}</span>
        </span>
        <span className="shrink-0 text-end">
          <PercentValue value={result.netAprPct} digits={1} className="block text-sm font-bold" />
          <span className="block text-2xs text-subtle">
            <MoneyValue value={result.net} signed tone="auto" digits={0} /> · {toFaDigits(Math.round(result.holdDays))} روز
          </span>
        </span>
      </button>
    </li>
  );
}

const qty = (usd: number, price: number | null | undefined) => (price && price > 0 ? usd / price : null);
const fmtQty = (v: number | null) => (v === null ? '—' : toFaDigits(Number(v.toPrecision(4))));

function PlanDetail({ row, base }: { row: Row; base: string }) {
  const { option, result, scenario } = row;
  const p = option.spec;
  const N = result.notional;
  const price = option.legs.find((l) => l?.quote.markPrice)?.quote.markPrice ?? option.borosMarkets[0]?.assetMarkPrice ?? null;
  const lev = Math.max(1, scenario.leverage);
  const perpMargin = p.perps.length ? result.capital.perpMargin / p.perps.length : 0;
  const scenarios = result.fullyLocked ? [] : SCENARIOS.map((s) => ({ ...s, r: evaluatePlan(p, { ...scenario, fundingFactor: s.factor }) }));

  const steps: string[] = [];
  if (p.spot) steps.push(`${fmtQty(qty(N, price))} ${base} اسپات بخرید (هر صرافی یا کیف پول؛ حدود ${Math.round(N).toLocaleString('fa-IR')} دلار).`);
  p.perps.forEach((l) =>
    steps.push(
      `روی ${l.venue} ${l.side === 'short' ? 'شورت' : 'لانگ'} پرپ ${base} به اندازهٔ ${fmtQty(qty(N, price))} (حدود ${Math.round(N).toLocaleString('fa-IR')} دلار) با اهرم ${toFaDigits(lev)}x و وثیقهٔ حدود ${Math.round(perpMargin).toLocaleString('fa-IR')} دلار باز کنید.`
    )
  );
  option.borosMarkets.forEach((m, k) => {
    const b = p.boros[k];
    steps.push(
      `در Boros بازار «${m.name}» ${b.side === 'short' ? 'Short YU' : 'Long YU'} به اندازهٔ ${fmtQty(qty(N, m.assetMarkPrice))} ${base} با نرخ ${b.side === 'short' ? 'حداقل' : 'حداکثر'} ${toFaDigits((b.fixedRate * 100).toFixed(2))}٪ بگیرید${m.collateralSymbol ? ` (وثیقه به ${m.collateralSymbol})` : ''}.`
    );
  });
  steps.push(
    p.boros.length
      ? 'تا سررسید نگه دارید؛ Boros خودکار تسویه می‌شود. بعد پاها را ببندید یا با سررسید بعدی رول کنید (نرخ بعدی معلوم نیست).'
      : 'هر روز فاندینگ دو طرف را بررسی کنید؛ اگر اختلاف چند روز علیه شما ماند، خارج شوید.'
  );

  return (
    <Surface as="section" aria-labelledby="plan-detail" className="space-y-5 p-4 md:p-5">
      <div>
        <h3 id="plan-detail" className="text-sm font-bold text-ink">{KIND[p.kind].label}</h3>
        <p className="mt-0.5 text-xs text-muted">{KIND[p.kind].note}</p>
      </div>
      {result.warnings.map((w) => (
        <Notice key={w} tone={WARN[w].tone}>{WARN[w].text}</Notice>
      ))}
      <ResultHero
        label={result.fullyLocked ? 'سود خالص قفل‌شده تا سررسید' : 'سود خالص برآوردی'}
        value={<MoneyValue value={result.net} signed tone="auto" />}
        sub={
          <>
            سالانه روی سرمایه <PercentValue value={result.netAprPct} className="font-semibold" /> · ROI <PercentValue value={result.roiPct} className="font-semibold" /> ·{' '}
            {toFaDigits(Math.round(result.holdDays))} روز
          </>
        }
      >
        <MetricGrid cols={3}>
          <Metric label="ارزش هر پا" value={<MoneyValue value={N} />} sub={`${fmtQty(qty(N, price))} ${base}`} />
          <Metric label="سرمایهٔ لازم" value={<MoneyValue value={result.capital.total} />} />
          <Metric label="نرخ سربه‌سر" value={<PercentValue value={result.breakEvenAprPct} tone="none" />} sub="سالانه روی ارزش هر پا" />
        </MetricGrid>
      </ResultHero>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-bold text-ink">درآمد و هزینه</h4>
          <KeyValueList
            dense
            rows={[
              { label: 'فاندینگ شناور (برآورد)', value: <MoneyValue value={result.income.floating} signed tone="auto" /> },
              { label: 'درآمد ثابت Boros', value: <MoneyValue value={result.income.locked} signed tone="auto" /> },
              { label: 'کارمزد پرپ (ورود + خروج)', value: <MoneyValue value={-result.costs.perpFees} signed tone="auto" /> },
              { label: 'اسلیپیج پرپ (دفتر سفارش)', value: <MoneyValue value={-result.costs.perpSlippage} signed tone="auto" /> },
              { label: 'کارمزد و اسلیپیج اسپات', value: <MoneyValue value={-result.costs.spot} signed tone="auto" /> },
              { label: 'کارمزد Boros (ورود + تسویه)', value: <MoneyValue value={-result.costs.boros} signed tone="auto" /> },
              { label: 'انتقال و گس', value: <MoneyValue value={-result.costs.transfer} signed tone="auto" /> },
              { label: 'سود خالص', value: <MoneyValue value={result.net} signed tone="auto" />, emphasis: true }
            ]}
          />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-bold text-ink">سرمایه و ریسک</h4>
          <KeyValueList
            dense
            rows={[
              { label: 'خرید اسپات', value: <MoneyValue value={result.capital.spot} /> },
              { label: 'وثیقهٔ پرپ‌ها', value: <MoneyValue value={result.capital.perpMargin} /> },
              { label: 'وثیقهٔ Boros', value: <MoneyValue value={result.capital.borosMargin} /> },
              ...p.perps.map((l, k) => ({
                label: `لیکوئید ${l.side === 'short' ? 'شورت' : 'لانگ'} ${l.venue}`,
                value: result.perpLiquidationPct[k] === null ? '—' : <span>حرکت <PercentValue value={result.perpLiquidationPct[k]} signed={false} tone="none" /></span>
              })),
              ...(result.borosRateTolerancePp === null
                ? []
                : [{ label: 'تحمل حرکت نرخ Boros (تقریبی)', value: `${toFaDigits(result.borosRateTolerancePp.toFixed(1))} واحد درصد` }])
            ]}
          />
        </div>
      </div>

      {scenarios.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-bold text-ink">اگر فاندینگ شناور…</h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {scenarios.map((s) => (
              <div key={s.factor} className="rounded-card border border-divider p-2.5 text-center">
                <dt className="text-2xs text-subtle">{s.label}</dt>
                <dd className="mt-0.5 text-sm">
                  <MoneyValue value={s.r.net} signed tone="auto" digits={0} className="font-bold" />
                  <span className="block text-2xs"><PercentValue value={s.r.netAprPct} digits={1} /> سالانه</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h4 className="mb-1 text-xs font-bold text-ink">مراحل اجرا</h4>
        <ol className="list-decimal space-y-1 ps-5 text-sm leading-7 text-muted">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>

      {p.boros.length > 0 && (
        <Disclosure summary="Boros چطور نرخ را قفل می‌کند؟">
          <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
            <li>Short YU یعنی فاندینگ شناور همان بازار را می‌پردازید و نرخ ثابت می‌گیرید. چون پای شورت پرپ همان فاندینگ را دریافت می‌کند، شناور دو طرف هم را خنثی می‌کند و فقط نرخ ثابت می‌ماند.</li>
            <li>نرخ فقط تا سررسید قفل است. برای ادامه باید با نرخ آن روز رول کنید.</li>
            <li>پیش از سررسید، اگر نرخ ضمنی علیه شما حرکت کند، زیان کاغذی دارید و ممکن است لیکوئید شوید. برای همین وثیقهٔ Boros چند برابر مارجین اولیه در نظر گرفته شده است.</li>
            <li>عمق دفتر سفارش Boros در این محاسبه نیست؛ سفارش بزرگ نرخ بدتری از bid/ask می‌گیرد.</li>
            <li>اگر وثیقهٔ بازار ETH یا BTC است، ارزش دلاری وثیقه با قیمت نوسان دارد.</li>
          </ul>
        </Disclosure>
      )}
    </Surface>
  );
}
