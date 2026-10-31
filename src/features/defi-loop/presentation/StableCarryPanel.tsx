/**
 * درآمد استیبل — مقایسهٔ استراتژی‌های اهرمی روی وثیقهٔ دلاری (Kamino Multiply، لوپ PT پندل، …)
 * داده: DeFiLlama /pools + /lendBorrow · اهرم: Multiply = 1/(1 − LTV)
 */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Notice, ListSkeleton, EmptyState } from '@/shared/components/ui/StateViews';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { SegmentedControl, ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { MoneyValue, PercentValue, KeyValueList } from '@/shared/components/ui/FinancialValue';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { computeCarry, daysToMaturity, type CarryMarket } from '@/features/defi-loop/domain/carry';
import { calculateLoopLeverage } from '@/features/defi-loop/domain/reference/leverage';
import { useStableCarry } from '@/features/defi-loop/data/useStableCarry';
import { BuyingPowerCard } from './BuyingPowerCard';

type LtvShare = '0.7' | '0.8' | '0.9' | '0.97';
type MinLiq = '0' | '100000' | '1000000';
type SortKey = 'net' | 'spread' | 'liquidity';

const PAGE = 30;
const OVERRIDES_KEY = 'darino:carry:yieldOverrides';
/** PT نزدیک سررسید: بازده ضمنی پرنوسان و نیاز به تمدید */
const NEAR_MATURITY_DAYS = 14;
const HIGH_UTILIZATION = 95;

function readOverrides(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
  } catch {
    return {};
  }
}
function writeOverrides(v: Record<string, number>): void {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(v));
  } catch {
    /* خاموش */
  }
}

const parseNum = (s: string): number | null => {
  const t = toEnDigits(s).replace(/[,٬\s%٪]/g, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

const YIELD_SOURCE_FA: Record<NonNullable<CarryMarket['collateralYieldSource']>, string> = {
  'pendle-pt': 'بازده ثابت PT در پندل',
  supply: 'نرخ سپرده در همین پروتکل',
  issuer: 'بازده خزانهٔ صادرکنندهٔ توکن'
};

const llamaUrl = (poolId: string) => `https://defillama.com/yields/pool/${poolId}`;

export function StableCarryPanel() {
  const { markets, loading, empty, loadedAt, refresh } = useStableCarry();
  const [capitalText, setCapitalText] = useState('10000');
  const [share, setShare] = useState<LtvShare>('0.9');
  const [minLiq, setMinLiq] = useState<MinLiq>('100000');
  const [sort, setSort] = useState<SortKey>('net');
  const [query, setQuery] = useState('');
  const [showNearMaturity, setShowNearMaturity] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>(readOverrides);

  const capital = parseNum(capitalText) ?? 0;
  const ltvShare = Number(share);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const min = Number(minLiq);
    const list = markets
      .map((m) => (m.id in overrides ? { ...m, collateralYield: overrides[m.id], collateralYieldSource: null } : m))
      .filter((m) => min === 0 || (m.liquidityUsd ?? 0) >= min)
      .filter((m) => showNearMaturity || (daysToMaturity(m.maturity) ?? Infinity) > NEAR_MATURITY_DAYS)
      .filter((m) => !q || `${m.collateral} ${m.debt} ${m.project} ${m.chain}`.toUpperCase().includes(q))
      .map((m) => ({ m, r: computeCarry(m, ltvShare) }));
    const key = (x: (typeof list)[number]) =>
      sort === 'net' ? x.r.netApy : sort === 'spread' ? x.r.spread : x.m.liquidityUsd;
    // ناشناخته‌ها آخر — بدون حدس
    return list.sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
  }, [markets, overrides, minLiq, query, ltvShare, sort, showNearMaturity]);

  const selected = rows.find((x) => x.m.id === selectedId) ?? null;

  const setOverride = (id: string, v: number | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (v === null) delete next[id];
      else next[id] = v;
      writeOverrides(next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Notice tone="info" title="درآمد اهرمی روی دلار">
        وثیقهٔ دلاری بازده‌دار (مثل AUTO در کامینو یا PT پندل) سپرده می‌شود و در برابرش استیبل‌کوین قرض گرفته می‌شود.
        سود از اختلاف «بازده وثیقه − نرخ وام» × اهرم می‌آید. ریسک به قیمت کریپتو ربطی ندارد، ولی صفر نیست:
        اهرم، ریسک اعتباری وثیقه، نرخ وام متغیر و نقدینگی خروج.
      </Notice>

      <FreshnessBar loadedAt={loadedAt} syncing={loading} sourceLabel="DeFiLlama" onRefresh={refresh} />

      <Surface className="space-y-4 p-4 md:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="سرمایهٔ شما">
            <Input dir="ltr" inputMode="decimal" value={capitalText} onChange={(e) => setCapitalText(e.target.value)} suffix="$" />
          </Field>
          <Field label="LTV هدف (سهم از سقف بازار)">
            <SegmentedControl<LtvShare>
              label="LTV هدف"
              fill
              value={share}
              onChange={setShare}
              options={[
                { value: '0.7', label: '۷۰٪' },
                { value: '0.8', label: '۸۰٪' },
                { value: '0.9', label: '۹۰٪' },
                { value: '0.97', label: '۹۷٪' }
              ]}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ChipGroup<MinLiq>
            label="کمینهٔ نقدینگی قابل‌قرض"
            value={minLiq}
            onChange={(v) => { setMinLiq(v); setLimit(PAGE); }}
            options={[
              { value: '0', label: 'همهٔ بازارها' },
              { value: '100000', label: 'نقدینگی ≥ ۱۰۰ هزار $' },
              { value: '1000000', label: 'نقدینگی ≥ ۱ میلیون $' }
            ]}
          />
          <SegmentedControl<SortKey>
            label="مرتب‌سازی"
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'net', label: 'Net APY' },
              { value: 'spread', label: 'اختلاف' },
              { value: 'liquidity', label: 'نقدینگی' }
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showNearMaturity} onChange={(e) => setShowNearMaturity(e.target.checked)} />
          نمایش PTهایی که کمتر از {toFaDigits(NEAR_MATURITY_DAYS)} روز تا سررسید دارند
        </label>
        <SearchField value={query} onChange={(v) => { setQuery(v); setLimit(PAGE); }} placeholder="جست‌وجو: AUTO، PT، kamino، USDC…" />
      </Surface>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : empty ? (
        <EmptyState message="داده‌ای دریافت نشد" hint="ارتباط با DeFiLlama برقرار نشد یا بازاری با این شرایط نیست." />
      ) : (
        <Surface className="overflow-hidden">
          <table className="data-table">
            <caption className="sr-only">بازارهای درآمد استیبل</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-4 md:!ps-5">بازار</th>
                <th scope="col" className="col-num hidden sm:table-cell">بازده وثیقه</th>
                <th scope="col" className="col-num hidden sm:table-cell">نرخ وام</th>
                <th scope="col" className="col-num">Net APY</th>
                <th scope="col" className="col-num hidden md:table-cell">اختلاف</th>
                <th scope="col" className="col-num !pe-4 md:!pe-5">نقدینگی</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map(({ m, r }) => {
                const days = daysToMaturity(m.maturity);
                const active = m.id === selectedId;
                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(active ? null : m.id)}
                    className={cn('cursor-pointer', active && 'bg-accent-soft')}
                    aria-selected={active}
                  >
                    <td className="!ps-4 md:!ps-5">
                      <button type="button" className="min-w-0 text-start" onClick={(e) => { e.stopPropagation(); setSelectedId(active ? null : m.id); }}>
                        <p className="font-semibold text-ink">
                          <bdi dir="ltr">{m.collateral} → {m.debt}</bdi>
                        </p>
                        <p className="text-xs text-muted">
                          <bdi dir="ltr">{m.project} · {m.chain}{m.market ? ` · ${m.market}` : ''}</bdi>
                        </p>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {days !== null && (
                            <Badge tone={days <= NEAR_MATURITY_DAYS ? 'warn' : 'neutral'}>{toFaDigits(days)} روز تا سررسید</Badge>
                          )}
                          {(m.utilization ?? 0) >= HIGH_UTILIZATION && <Badge tone="warn">ظرفیت پر</Badge>}
                          {m.collateralYield === null && <Badge tone="neutral">بازده نامعلوم</Badge>}
                        </span>
                      </button>
                    </td>
                    <td className="col-num hidden sm:table-cell">
                      <PercentValue value={m.collateralYield} signed={false} tone="none" />
                    </td>
                    <td className="col-num hidden sm:table-cell">
                      <PercentValue value={m.borrowRate} signed={false} tone="none" />
                    </td>
                    <td className="col-num font-semibold">
                      <PercentValue value={r.netApy} />
                      <span className="block text-2xs font-normal text-muted num-ltr">
                        {r.leverage === null ? '—' : `${toFaDigits(r.leverage.toFixed(2))}x`}
                      </span>
                    </td>
                    <td className="col-num hidden md:table-cell">
                      <PercentValue value={r.spread} />
                    </td>
                    <td className="col-num !pe-4 text-muted md:!pe-5">
                      <MoneyValue value={m.liquidityUsd} compact />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > limit && (
            <div className="border-t border-divider p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                نمایش بیشتر ({toFaDigits(rows.length - limit)})
              </Button>
            </div>
          )}
        </Surface>
      )}

      {selected && (
        <MarketDetail
          key={selected.m.id}
          market={selected.m}
          ltvShare={ltvShare}
          capital={capital}
          overridden={selected.m.id in overrides}
          onOverride={(v) => setOverride(selected.m.id, v)}
        />
      )}

      <BuyingPowerCard
        defaultCapital={capital}
        marketApy={selected?.r.netApy ?? null}
        marketLabel={selected ? `${selected.m.collateral} → ${selected.m.debt}` : null}
      />
    </div>
  );
}

function LiqDrop({ value, lowerBound }: { value: number | null; lowerBound: boolean }) {
  if (value === null) return <span className="text-subtle">—</span>;
  return (
    <span className={cn('num-ltr', value < 5 ? 'font-semibold text-negative' : value < 10 ? 'text-warn' : 'text-muted')}>
      {lowerBound ? '≥ ' : ''}
      {toFaDigits(value.toFixed(1))}٪
    </span>
  );
}

function MarketDetail({
  market: m,
  ltvShare,
  capital,
  overridden,
  onOverride
}: {
  market: CarryMarket;
  ltvShare: number;
  capital: number;
  overridden: boolean;
  onOverride: (v: number | null) => void;
}) {
  const [yieldText, setYieldText] = useState(m.collateralYield === null ? '' : String(m.collateralYield));
  const r = computeCarry(m, ltvShare);
  const reference5 = calculateLoopLeverage(r.targetLtv, 5);
  const days = daysToMaturity(m.maturity);
  const annual = r.netApy === null ? null : (capital * r.netApy) / 100;
  const shocks = [1, 2, 3].map((s) => ({ s, net: computeCarry(m, ltvShare, s).netApy }));

  return (
    <Surface className="space-y-5 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-ink">
            <bdi dir="ltr">{m.collateral} → {m.debt}</bdi>
          </h3>
          <p className="text-sm text-muted">
            <bdi dir="ltr">{m.project} · {m.chain}{m.market ? ` · ${m.market}` : ''}</bdi>
          </p>
        </div>
        <a href={llamaUrl(m.poolId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent">
          DeFiLlama <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <KeyValueList
          rows={[
            { label: 'LTV هدف', value: <PercentValue value={r.targetLtv * 100} signed={false} tone="none" digits={1} />, hint: `سقف بازار ${toFaDigits((m.maxLtv * 100).toFixed(1))}٪` },
            {
              label: 'اهرم Multiply',
              value: <span className="num-ltr">{r.leverage === null ? '—' : `${toFaDigits(r.leverage.toFixed(2))}x`}</span>,
              hint: `مدل مرجع ۵ حلقه در همین LTV: ${toFaDigits(reference5.toFixed(2))}x`
            },
            { label: 'Net APY', value: <PercentValue value={r.netApy} />, emphasis: true },
            { label: 'سود سالانه روی سرمایهٔ شما', value: <MoneyValue value={annual} signed tone="auto" /> },
            { label: 'سود ماهانه (تقریبی)', value: <MoneyValue value={annual === null ? null : annual / 12} signed tone="auto" /> },
            {
              label: 'تا لیکوییدیشن',
              value: <LiqDrop value={r.liquidationDropPct} lowerBound={r.liquidationIsLowerBound} />,
              hint: r.liquidationIsLowerBound ? 'آستانهٔ لیکوییدیشن در داده نیست؛ با سقف LTV حساب شده (حداقل فاصله)' : 'افت ارزش وثیقه تا رسیدن به LLTV'
            }
          ]}
        />
        <KeyValueList
          rows={[
            {
              label: 'بازده وثیقه',
              value: <PercentValue value={m.collateralYield} signed={false} tone="none" />,
              hint: overridden ? 'دستی وارد شده' : m.collateralYieldSource ? YIELD_SOURCE_FA[m.collateralYieldSource] : 'در داده نیست — دستی وارد کنید'
            },
            { label: 'نرخ وام (لحظه‌ای)', value: <PercentValue value={m.borrowRate} signed={false} tone="none" /> },
            { label: 'اختلاف بازده و وام', value: <PercentValue value={r.spread} /> },
            {
              label: 'اثر ۱٪ افزایش نرخ وام',
              value: <PercentValue value={r.rateSensitivity === null ? null : -r.rateSensitivity} />,
              hint: 'کاهش Net APY'
            },
            { label: 'نرخ وام سربه‌سر', value: <PercentValue value={r.breakEvenBorrow} signed={false} tone="none" />, hint: 'بالاتر از این، پوزیشن زیان می‌دهد' },
            { label: 'ظرفیت قرض‌داده‌شده', value: <PercentValue value={m.utilization} signed={false} tone="none" digits={1} />, hint: <MoneyValue value={m.liquidityUsd} compact unavailableLabel="—" /> }
          ]}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-muted">اگر نرخ وام بالا برود (مثلاً بعد از دورهٔ نرخ ثابت)</p>
        <div className="grid grid-cols-3 gap-2">
          {shocks.map(({ s, net }) => (
            <div key={s} className="rounded-lg bg-surface-2 p-3 text-center">
              <p className="text-xs text-muted">+{toFaDigits(s)}٪ نرخ وام</p>
              <PercentValue value={net} className="font-semibold" />
            </div>
          ))}
        </div>
      </div>

      <Field label="بازده وثیقه (دستی، ٪ سالانه)">
        <div className="flex gap-2">
          <Input dir="ltr" inputMode="decimal" value={yieldText} onChange={(e) => setYieldText(e.target.value)} suffix="٪" />
          <Button size="sm" onClick={() => onOverride(parseNum(yieldText))}>اعمال</Button>
          {overridden && (
            <Button size="sm" variant="ghost" onClick={() => { onOverride(null); setYieldText(''); }}>
              بازگشت به داده
            </Button>
          )}
        </div>
      </Field>

      <div className="space-y-2">
        {days !== null && days <= NEAR_MATURITY_DAYS && (
          <Notice tone="warn">
            {toFaDigits(days)} روز تا سررسید PT. بازده ضمنی نزدیک سررسید پرنوسان است و بعد از سررسید باید پوزیشن را به PT بعدی منتقل کنید.
          </Notice>
        )}
        {(m.utilization ?? 0) >= HIGH_UTILIZATION && (
          <Notice tone="warn">
            {toFaDigits((m.utilization ?? 0).toFixed(1))}٪ ظرفیت این بازار قرض داده شده؛ ورود جدید محدود است و خروج به برگشت نقدینگی بستگی دارد.
          </Notice>
        )}
        {m.project.startsWith('kamino') && (
          <Notice tone="neutral">
            نرخ وام از DeFiLlama لحظه‌ای است. اگر در کامینو نرخ ثابت دوره‌ای گرفته‌اید، آن را با سناریوهای بالا مقایسه کنید.
          </Notice>
        )}
        {m.collateralYieldSource === 'issuer' && !overridden && (
          <Notice tone="neutral">
            بازده وثیقه از خزانهٔ صادرکنندهٔ توکن آمده و ممکن است با عددی که پروتکل وام نشان می‌دهد فرق داشته باشد.
          </Notice>
        )}
      </div>
    </Surface>
  );
}
