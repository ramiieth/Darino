/**
 * ⑥ PERP — isolated-margin perpetual calculator on live Lighter / Arcus / QFEX / TxFlow markets.
 * INPUT (venue · market · margin · leverage · entry/target · hold · funding · fee)
 * → RESULT (position size) → LONG vs SHORT (liquidation, funding, PnL) → SCENARIOS.
 * Calculations in domain (calcPerp, perpScenarios, fundingPeriods).
 */
import { useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { SegmentedControl, ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { KeyValueList, MetricGrid, Metric, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { usePublishInsight } from '@/shared/assistant/insights';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { parseNum, priceInput } from './parse';
import {
  usePerpMarkets,
  useTxflowMarginTier,
  PERP_VENUES,
  PERP_VENUE_LABELS,
  PERP_CATEGORY_LABELS,
  type PerpCategory,
  type PerpMarket,
  type PerpVenue
} from '@/features/calculators/data/perpMarkets';
import { calcPerp, fundingPeriods, perpScenarios, type PerpInput, type PerpSideResult } from '@/features/calculators/domain';
import { fmtCompactFa, normalizeForSearch, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type HoldUnit = 'hour' | 'day';
type CatFilter = PerpCategory | 'all';

const MOVES = [-50, -25, -10, -5, -2, 0, 2, 5, 10, 25, 50];

const logoKind = (m: PerpMarket) => (m.category === 'equity' || m.category === 'index' || m.category === 'commodity' ? 'tradfi' : 'crypto');

function FundingText({ hourly, className }: { hourly: number | null; className?: string }) {
  if (hourly === null) return <span className={cn('text-subtle', className)}>—</span>;
  return <PercentValue value={hourly * 100} digits={4} className={className} />;
}

function MarketPicker({
  venue,
  value,
  onChange
}: {
  venue: PerpVenue;
  value: PerpMarket | null;
  onChange: (m: PerpMarket) => void;
}) {
  const q = usePerpMarkets(venue);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CatFilter>('all');
  const [browsing, setBrowsing] = useState(!value);

  const cats = useMemo(() => {
    const set = new Set((q.data ?? []).map((m) => m.category));
    return set.size > 1 ? (['all', ...(['crypto', 'equity', 'commodity', 'index', 'other'] as PerpCategory[]).filter((c) => set.has(c))] as CatFilter[]) : [];
  }, [q.data]);

  const list = useMemo(() => {
    const s = normalizeForSearch(query);
    return (q.data ?? [])
      .filter((m) => cat === 'all' || m.category === cat)
      .filter((m) => !s || normalizeForSearch(m.base).includes(s) || normalizeForSearch(m.display).includes(s) || normalizeForSearch(m.nameFa).includes(s))
      .slice(0, 80);
  }, [q.data, query, cat]);

  // value is already the live market (PerpCalculator reads the same query and merges the margin tier)
  const live = value;

  if (live && !browsing) {
    return (
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">بازار</p>
        <div className="flex items-center gap-3 rounded-field border border-divider-strong bg-card px-3 py-2.5">
          <AssetLogo symbol={live.base} kind={logoKind(live)} size={36} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <bdi dir="ltr">{live.display}</bdi>
              {live.maxLeverage && <Badge tone="brand" ltr>{`${live.maxLeverage}x`}</Badge>}
            </p>
            <p className="truncate text-2xs font-semibold text-muted">
              {live.nameFa} · فاندینگ ساعتی <FundingText hourly={live.fundingHourly} />
            </p>
          </div>
          <div className="text-end">
            <MoneyValue value={live.markPrice} className="text-sm font-bold" />
            <Button variant="ghost" size="sm" className="mt-0.5 text-accent" onClick={() => setBrowsing(true)}>
              تغییر
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted">بازار</p>
      {cats.length > 0 && (
        <ChipGroup<CatFilter>
          label="دسته بازار"
          value={cat}
          onChange={setCat}
          options={cats.map((c) => ({ value: c, label: c === 'all' ? 'همه' : PERP_CATEGORY_LABELS[c] }))}
        />
      )}
      <SearchField value={query} onChange={setQuery} placeholder="جستجوی نماد یا نام… (BTC، اتریوم)" />
      {q.isLoading && <Skeleton className="h-56 w-full" />}
      {q.isError && !q.data && <Notice tone="error">دریافت بازارهای {PERP_VENUE_LABELS[venue]} ممکن نشد. اتصال را بررسی کنید.</Notice>}
      {q.data && (
        <ul className="max-h-72 divide-y divide-divider overflow-auto rounded-field border border-divider" role="listbox" aria-label="بازارها">
          {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">بازاری یافت نشد</li>}
          {list.map((m) => {
            const active = value?.id === m.id && value.venue === m.venue;
            return (
              <li key={m.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m);
                    setBrowsing(false);
                  }}
                  className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  <AssetLogo symbol={m.base} kind={logoKind(m)} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                      <bdi dir="ltr">{m.base}</bdi>
                      {m.maxLeverage && <span className="num-ltr text-2xs font-semibold text-subtle">{m.maxLeverage}x</span>}
                    </span>
                    <span className="block truncate text-2xs font-semibold text-muted">{m.nameFa}</span>
                  </span>
                  <span className="shrink-0 text-end">
                    <MoneyValue value={m.markPrice} className="block text-xs font-semibold" />
                    <FundingText hourly={m.fundingHourly} className="block text-2xs" />
                  </span>
                  {active && <Check aria-hidden className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q.data && <p className="text-2xs text-subtle">عدد زیر قیمت = نرخ فاندینگ ساعتی · مثبت یعنی لانگ‌ها می‌پردازند</p>}
    </div>
  );
}

function SideCard({ r, entry, hasTarget }: { r: PerpSideResult; entry: number; hasTarget: boolean }) {
  const long = r.side === 'long';
  return (
    <Surface className={cn('space-y-4 border-t-4 p-4 md:p-5', long ? 'border-t-positive' : 'border-t-negative')}>
      <div className="flex items-center justify-between">
        <h3 className={cn('text-base font-extrabold', long ? 'text-positive' : 'text-negative')}>{long ? 'لانگ (خرید)' : 'شورت (فروش)'}</h3>
        {hasTarget && r.liquidatedAtExit && <Badge tone="loss">لیکویید در قیمت هدف</Badge>}
      </div>
      <Metric
        size="lg"
        label="قیمت لیکویید"
        value={r.liquidationPrice === null ? <span className="text-base text-muted">لیکویید نمی‌شود</span> : <MoneyValue value={r.liquidationPrice} />}
        sub={
          r.liquidationDistancePct !== null && (
            <>
              {toFaDigits(r.liquidationDistancePct.toFixed(2))}٪ {long ? 'پایین‌تر' : 'بالاتر'} از ورود
            </>
          )
        }
      />
      <KeyValueList
        dense
        rows={[
          ...(hasTarget
            ? [
                { label: 'سود / زیان خالص', value: <MoneyValue value={r.netPnl} signed tone="auto" />, emphasis: true },
                { label: 'بازده روی مارجین (ROE)', value: <PercentValue value={r.roePct} /> },
                { label: 'سود قیمتی (بدون هزینه)', value: <MoneyValue value={r.pricePnl} signed tone="auto" /> }
              ]
            : []),
          {
            label: r.funding >= 0 ? 'فاندینگ پرداختی' : 'فاندینگ دریافتی',
            value: <MoneyValue value={Math.abs(r.funding)} tone="none" className={r.funding > 0 ? 'text-negative' : r.funding < 0 ? 'text-positive' : ''} />
          },
          { label: 'کارمزد باز و بسته کردن', value: <MoneyValue value={r.openFee + (hasTarget ? r.closeFee : r.openFee)} /> },
          { label: 'قیمت سربه‌سر', value: <MoneyValue value={r.breakEvenPrice} />, hint: 'با کارمزد و فاندینگ' },
          {
            label: 'لیکویید پس از فاندینگ',
            value: r.liquidationPriceAfterFunding === null ? '—' : <MoneyValue value={r.liquidationPriceAfterFunding} />,
            hint: r.liquidationPriceAfterFunding !== null && r.liquidationPrice !== null && Math.abs(r.liquidationPriceAfterFunding - r.liquidationPrice) / entry > 0.0005 ? 'قیمت لیکویید با گذر زمان جابه‌جا می‌شود' : undefined
          }
        ]}
      />
    </Surface>
  );
}

export function PerpCalculator() {
  const [venue, setVenue] = useState<PerpVenue>('lighter');
  const [market, setMarket] = useState<PerpMarket | null>(null);
  const markets = usePerpMarkets(venue);
  const fresh = market ? (markets.data?.find((m) => m.id === market.id && m.venue === market.venue) ?? market) : null;
  // TxFlow: سقف اهرم و مارجین نگهداری واقعی از ردهٔ اول جدول مارجین همان بازار
  const tier = useTxflowMarginTier(fresh);
  const live: PerpMarket | null =
    fresh && tier.data
      ? {
          ...fresh,
          maxLeverage: tier.data.maxLeverage && fresh.maxLeverage ? Math.min(fresh.maxLeverage, tier.data.maxLeverage) : (tier.data.maxLeverage ?? fresh.maxLeverage),
          maintenanceMarginFraction: tier.data.maintenanceMarginFraction ?? fresh.maintenanceMarginFraction
        }
      : fresh;

  const [margin, setMargin] = useState('1000');
  const [lev, setLev] = useState('5');
  const [entry, setEntry] = useState('');
  const [target, setTarget] = useState('');
  const [hold, setHold] = useState('7');
  const [holdUnit, setHoldUnit] = useState<HoldUnit>('day');
  const [funding, setFunding] = useState(''); // ٪ ساعتی — خالی = نرخ بازار
  const [fee, setFee] = useState('');
  const [mmf, setMmf] = useState('');

  const pick = (m: PerpMarket) => {
    setMarket(m);
    setEntry('');
    setTarget('');
    setFunding('');
    setFee('');
    setMmf('');
    if (m.maxLeverage && parseNum(lev) > m.maxLeverage) setLev(String(m.maxLeverage));
  };
  const switchVenue = (v: PerpVenue) => {
    setVenue(v);
    setMarket(null);
  };

  const maxLev = live?.maxLeverage ?? 100;
  const entryNum = entry === '' ? (live?.markPrice ?? NaN) : parseNum(entry);
  const targetNum = target === '' ? null : parseNum(target);
  const fundingHourly = funding === '' ? (live?.fundingHourly ?? 0) : parseNum(funding) / 100;
  const feePct = fee === '' ? (live?.takerFeePct ?? 0) : parseNum(fee);
  const mmfNum = mmf === '' ? (live?.maintenanceMarginFraction ?? 0.01) : parseNum(mmf) / 100;
  const holdHours = parseNum(hold) * (holdUnit === 'day' ? 24 : 1);
  const levNum = parseNum(lev);

  const invalid =
    !live ||
    !(parseNum(margin) > 0) ||
    !(levNum >= 1) ||
    !(entryNum > 0) ||
    !Number.isFinite(fundingHourly) ||
    !(feePct >= 0) ||
    !(mmfNum >= 0 && mmfNum < 1) ||
    !(holdHours >= 0) ||
    (targetNum !== null && !(targetNum > 0));

  const input: PerpInput | null = invalid
    ? null
    : {
        margin: parseNum(margin),
        leverage: levNum,
        entryPrice: entryNum,
        exitPrice: targetNum,
        maintenanceMarginFraction: mmfNum,
        feePct,
        fundingRateHourly: fundingHourly,
        holdHours
      };

  const longR = useMemo(() => (input ? calcPerp(input, 'long') : null), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const shortR = useMemo(() => (input ? calcPerp(input, 'short') : null), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (input ? perpScenarios(input, MOVES) : []), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fp = fundingPeriods(Number.isFinite(fundingHourly) ? fundingHourly : 0);

  usePublishInsight(
    'calculatorPerp',
    live ? `پرپ ${live.display} (${PERP_VENUE_LABELS[venue]})` : 'ماشین‌حساب پرپ',
    input && longR && shortR
      ? { margin: input.margin, leverage: input.leverage, entry: input.entryPrice, target: input.exitPrice, notional: longR.notional, longLiq: longR.liquidationPrice, shortLiq: shortR.liquidationPrice, longPnl: longR.netPnl, shortPnl: shortR.netPnl, fundingHourly }
      : null,
    'simulation',
    'ready'
  );

  const levQuick = [1, 2, 3, 5, 10, 20, 25, 50].filter((x) => x <= maxLev);
  if (!levQuick.includes(maxLev)) levQuick.push(maxLev);

  const inputs = (
    <>
      <SegmentedControl<PerpVenue>
        label="صرافی"
        fill
        value={venue}
        onChange={switchVenue}
        options={PERP_VENUES.map((v) => ({ value: v, label: PERP_VENUE_LABELS[v] }))}
      />
      <MarketPicker key={venue} venue={venue} value={live} onChange={pick} />

      {live && (
        <>
          <Field label="مارجین (وثیقه)">
            <Input dir="ltr" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} suffix="دلار" />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="perp-lev" className="text-xs font-semibold text-muted">اهرم</label>
              <span className="num-ltr text-sm font-extrabold text-ink">{Number.isFinite(levNum) ? `${levNum}x` : '—'}</span>
            </div>
            <input
              id="perp-lev"
              type="range"
              min={1}
              max={maxLev}
              step={1}
              value={Math.min(Math.max(Number.isFinite(levNum) ? levNum : 1, 1), maxLev)}
              onChange={(e) => setLev(e.target.value)}
              className="w-full accent-[rgb(var(--c-brand-500))]"
              dir="ltr"
            />
            <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
              {levQuick.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setLev(String(x))}
                  className={cn(
                    'h-8 min-w-11 rounded-control px-2 text-xs font-bold transition-colors',
                    levNum === x ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink hover:bg-accent-soft'
                  )}
                >
                  {x}x
                </button>
              ))}
            </div>
            {levNum > maxLev && <p className="mt-1.5 text-xs text-negative">حداکثر اهرم این بازار {toFaDigits(maxLev)} برابر است.</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="قیمت ورود"
              labelAside={
                entry !== '' && (
                  <button type="button" className="text-2xs font-semibold text-accent" onClick={() => setEntry('')}>
                    قیمت لحظه‌ای
                  </button>
                )
              }
            >
              <Input dir="ltr" inputMode="decimal" value={entry === '' ? priceInput(live.markPrice) : entry} onChange={(e) => setEntry(e.target.value)} suffix="دلار" />
            </Field>
            <Field label="قیمت هدف / خروج">
              <Input dir="ltr" inputMode="decimal" value={target} placeholder="پیش‌بینی شما" onChange={(e) => setTarget(e.target.value)} suffix="دلار" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="مدت نگهداری">
              <Input dir="ltr" inputMode="decimal" value={hold} onChange={(e) => setHold(e.target.value)} />
            </Field>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">واحد</p>
              <SegmentedControl<HoldUnit>
                label="واحد مدت"
                fill
                value={holdUnit}
                onChange={setHoldUnit}
                options={[
                  { value: 'hour', label: 'ساعت' },
                  { value: 'day', label: 'روز' }
                ]}
              />
            </div>
          </div>

          <Field
            label="نرخ فاندینگ ساعتی"
            labelAside={
              funding !== '' && (
                <button type="button" className="text-2xs font-semibold text-accent" onClick={() => setFunding('')}>
                  نرخ بازار
                </button>
              )
            }
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={funding === '' ? (live.fundingHourly === null ? '0' : String(Number((live.fundingHourly * 100).toFixed(6)))) : funding}
              onChange={(e) => setFunding(e.target.value)}
              suffix="٪"
            />
          </Field>
          <p className="-mt-3 text-2xs leading-5 text-subtle">
            برای پیش‌بینی، نرخ مورد انتظار خود را وارد کنید. مثبت = لانگ‌ها به شورت‌ها می‌پردازند.
          </p>

          <Disclosure summary="تنظیمات پیشرفته (کارمزد و مارجین نگهداری)">
            <div className="grid grid-cols-2 gap-4">
              <Field label="کارمزد هر طرف">
                <Input dir="ltr" inputMode="decimal" value={fee === '' ? String(live.takerFeePct ?? 0) : fee} onChange={(e) => setFee(e.target.value)} suffix="٪" />
              </Field>
              <Field label="مارجین نگهداری">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={mmf === '' ? String(Number(((live.maintenanceMarginFraction ?? 0.01) * 100).toFixed(4))) : mmf}
                  onChange={(e) => setMmf(e.target.value)}
                  suffix="٪"
                />
              </Field>
            </div>
            {live.takerFeePct === null && <p className="mt-2 text-2xs text-subtle">کارمزد {PERP_VENUE_LABELS[venue]} از API عمومی در دسترس نیست؛ نرخ حساب خود را وارد کنید.</p>}
            {live.maintenanceMarginFraction === null && mmf === '' && (
              <p className="mt-2 text-2xs text-subtle">مارجین نگهداری {PERP_VENUE_LABELS[venue]} از API عمومی در دسترس نیست و ۱٪ فرض شده؛ برای قیمت لیکویید دقیق نرخ صرافی را وارد کنید.</p>
            )}
            {(fee !== '' || mmf !== '') && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-accent"
                icon={<RotateCcw />}
                onClick={() => {
                  setFee('');
                  setMmf('');
                }}
              >
                مقادیر بازار
              </Button>
            )}
          </Disclosure>
        </>
      )}
    </>
  );

  return (
    <CalcShell inputs={inputs}>
      {!live ? (
        <ResultPlaceholder>صرافی و بازار را انتخاب کنید؛ سپس مارجین و اهرم را وارد کنید تا لانگ و شورت هم‌زمان محاسبه شوند.</ResultPlaceholder>
      ) : !input || !longR || !shortR ? (
        <Notice tone="warn">ورودی‌ها را بررسی کنید — مارجین، اهرم و قیمت ورود باید عدد مثبت باشند.</Notice>
      ) : (
        <>
          <ResultHero
            label="ارزش پوزیشن"
            value={<MoneyValue value={longR.notional} />}
            sub={
              <>
                <QuantityValue value={longR.size} unit={live.base} digits={live.markPrice && live.markPrice < 1 ? 2 : 5} /> · مارجین{' '}
                <MoneyValue value={input.margin} className="font-semibold text-ink" /> × <span className="num-ltr font-semibold text-ink">{input.leverage}x</span>
              </>
            }
            aside={
              <div className="flex items-center gap-2">
                <AssetLogo symbol={live.base} kind={logoKind(live)} size={40} />
                <div>
                  <p className="text-sm font-bold text-ink"><bdi dir="ltr">{live.display}</bdi></p>
                  <p className="text-2xs text-muted">{PERP_VENUE_LABELS[venue]}</p>
                </div>
              </div>
            }
          >
            <MetricGrid cols={4}>
              <Metric label="قیمت مارک" value={<MoneyValue value={live.markPrice} />} sub={live.change24hPct !== null ? <>۲۴ساعت <PercentValue value={live.change24hPct} /></> : undefined} />
              <Metric label="مارجین نگهداری" value={<MoneyValue value={longR.maintenanceMargin} />} sub={`${toFaDigits((input.maintenanceMarginFraction * 100).toFixed(2))}٪ ارزش`} />
              <Metric label="حداکثر اهرم" value={<span className="num-ltr">{live.maxLeverage ? `${live.maxLeverage}x` : '—'}</span>} />
              <Metric label="حجم ۲۴ساعته" value={live.volume24hUsd !== null ? <span>{fmtCompactFa(live.volume24hUsd)} $</span> : '—'} />
            </MetricGrid>
          </ResultHero>

          {input.leverage > maxLev && <Notice tone="warn">اهرم واردشده از سقف این بازار ({toFaDigits(maxLev)}x) بیشتر است؛ صرافی چنین سفارشی را نمی‌پذیرد.</Notice>}
          {targetNum === null && <Notice tone="info">برای دیدن سود و زیان، «قیمت هدف / خروج» مورد انتظار خود را وارد کنید.</Notice>}

          <div className="grid gap-4 sm:grid-cols-2">
            <SideCard r={longR} entry={input.entryPrice} hasTarget={targetNum !== null} />
            <SideCard r={shortR} entry={input.entryPrice} hasTarget={targetNum !== null} />
          </div>

          <Surface className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">نرخ فاندینگ</h3>
              <Badge tone={funding === '' ? 'info' : 'warn'}>{funding === '' ? `نرخ فعلی ${PERP_VENUE_LABELS[venue]}` : 'نرخ پیش‌بینی شما'}</Badge>
            </div>
            <MetricGrid cols={4} className="mt-4">
              <Metric size="sm" label="ساعتی" value={<PercentValue value={fp.h1} digits={4} />} />
              <Metric size="sm" label="۸ ساعته" value={<PercentValue value={fp.h8} digits={4} />} />
              <Metric size="sm" label="روزانه" value={<PercentValue value={fp.day} digits={3} />} />
              <Metric size="sm" label="سالانه (APR)" value={<PercentValue value={fp.apr} />} />
            </MetricGrid>
            <p className="mt-4 text-xs leading-5 text-muted">
              {fundingHourly > 0
                ? 'نرخ مثبت است: لانگ‌ها فاندینگ می‌پردازند و شورت‌ها دریافت می‌کنند.'
                : fundingHourly < 0
                  ? 'نرخ منفی است: شورت‌ها فاندینگ می‌پردازند و لانگ‌ها دریافت می‌کنند.'
                  : 'نرخ صفر است.'}{' '}
              در {toFaDigits(Number.isFinite(holdHours) ? Math.round(holdHours) : 0)} ساعت نگهداری: لانگ{' '}
              <MoneyValue value={-longR.funding} signed tone="auto" className="font-semibold" /> · شورت{' '}
              <MoneyValue value={-shortR.funding} signed tone="auto" className="font-semibold" />
            </p>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="px-4 pt-4 md:px-5">
              <h3 className="text-sm font-bold text-ink">سناریوهای قیمت</h3>
              <p className="mt-0.5 text-xs text-muted">سود خالص با کارمزد و فاندینگ دورهٔ نگهداری؛ زیان ایزوله حداکثر به اندازهٔ مارجین است.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table is-compact mt-2">
                <caption className="sr-only">سناریوهای تغییر قیمت</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-4 md:!ps-5">تغییر</th>
                    <th scope="col" className="col-num">قیمت</th>
                    <th scope="col" className="col-num">لانگ</th>
                    <th scope="col" className="col-num !pe-4 md:!pe-5">شورت</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr key={s.movePct} className={cn(s.movePct === 0 && 'bg-surface-2')}>
                      <td className="!ps-4 md:!ps-5"><PercentValue value={s.movePct} digits={0} /></td>
                      <td className="col-num"><MoneyValue value={s.price} /></td>
                      {[s.long, s.short].map((r, i) => (
                        <td key={i} className={cn('col-num', i === 1 && '!pe-4 md:!pe-5')}>
                          {r.liquidatedAtExit ? (
                            <Badge tone="loss">لیکویید</Badge>
                          ) : (
                            <span className="inline-flex flex-col items-end">
                              <MoneyValue value={r.netPnl} signed tone="auto" />
                              <PercentValue value={r.roePct} className="text-2xs" />
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          <p className="text-2xs leading-5 text-subtle">
            محاسبه برای مارجین ایزوله است. در مارجین کراس، کل موجودی حساب پشتوانهٔ پوزیشن است و قیمت لیکویید دورتر خواهد بود. قیمت لیکویید واقعی ممکن است به‌خاطر کارمزد لیکوییدیشن، اسلیپیج و تغییر نرخ فاندینگ کمی متفاوت باشد.
          </p>
        </>
      )}
    </CalcShell>
  );
}
