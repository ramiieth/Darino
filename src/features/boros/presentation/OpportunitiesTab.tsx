import { borosAssetName, borosVenueName } from './borosLabels';
/**
 * Boros opportunities — Long and Short computed separately (never the same PnL)
 *  - Best Long / Best Short only with expected Net PnL > 0 (status = potential)
 *  - Net < 0 → «not attractive», never in "best"
 *  - primary: net PnL · spread · score; full breakdown behind «جزئیات»
 *  - analysis only — no BUY / SELL / ENTER
 */
import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { rankUserCapitalOpportunities, DEFAULT_SIMULATION_COLLATERAL_ETH } from '@/features/boros/domain/collateral';
import { UserCapitalCard } from './UserCapitalCard';
import { BorosCalculationEngine, explainOpportunity, type MarketAnalysis } from '@/features/boros/domain/calc';
import type { BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

export const STATUS_LABEL: Record<string, string> = {
  potential: 'فرصت بالقوه',
  conditional: 'فرصت مشروط',
  'not-attractive': 'جذاب نیست',
  'insufficient-data': 'داده ناکافی',
  'anomaly-detected': 'ناهنجاری نرخ'
};

export const STATUS_TONE: Record<string, Tone> = {
  potential: 'gain',
  conditional: 'info',
  'not-attractive': 'warn',
  'insufficient-data': 'neutral',
  'anomaly-detected': 'loss'
};

const ANOMALY_FA: Record<string, string> = {
  'extreme-dislocation': 'انحراف شدید نرخ',
  'thin-liquidity': 'نقدشوندگی کم',
  'near-expiry': 'نزدیک سررسید'
};

const riskTone = (r: string): Tone => (r === 'کم' ? 'gain' : r === 'متوسط' ? 'warn' : 'loss');

function Reasons({ a, limit = 3 }: { a: MarketAnalysis; limit?: number }) {
  const ex = explainOpportunity(a);
  return (
    <div className="space-y-1 text-sm">
      {ex.positive.slice(0, limit).map((r, i) => (
        <p key={'p' + i} className="flex items-start gap-2 text-ink">
          <span aria-hidden className="text-positive">✓</span>
          {r.text}
        </p>
      ))}
      {ex.negative.slice(0, limit).map((r, i) => (
        <p key={'n' + i} className="flex items-start gap-2 text-ink">
          <span aria-hidden className="text-negative">✗</span>
          {r.text}
        </p>
      ))}
      <p className="pt-1 text-xs text-muted">{ex.summary}</p>
    </div>
  );
}

function OppCard({ rank, a, side }: { rank: number; a: MarketAnalysis; side: 'long' | 'short' }) {
  const isLong = side === 'long';
  const score = isLong ? a.longScore : a.shortScore;
  const spread = isLong ? a.longSpread : a.shortSpread;
  const gross = isLong ? a.grossLongPnl : a.grossShortPnl;
  const net = isLong ? a.totalLongPnl : a.totalShortPnl;
  const be = isLong ? a.breakEvenLong : a.breakEvenShort;
  const status = isLong ? a.statusLong : a.statusShort;
  const roiMargin = isLong ? a.roiLongMargin : a.roiShortMargin;

  return (
    <Surface className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="num-ltr text-sm font-bold text-subtle">#{rank}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-ink">
              <bdi dir="ltr">{borosAssetName(a.asset)}</bdi>
              <span className="text-sm font-normal text-muted">· {borosVenueName(a.venue)}</span>
              <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
              {a.anomaly.detected && <Badge tone="loss">{ANOMALY_FA[a.anomaly.kind ?? ''] ?? 'داده کهنه'}</Badge>}
            </p>
            <p className="text-xs text-muted">
              سررسید {new Date(a.maturity * 1000).toLocaleDateString('fa-IR')} · {toFaDigits(Math.ceil(a.daysToMaturity))} روز
            </p>
          </div>
        </div>
        <div className="text-end">
          <p className="num-ltr text-lg font-bold text-ink">{Math.round(score)}<span className="text-xs text-muted">/100</span></p>
          <p className="text-2xs text-muted">امتیاز {isLong ? 'لانگ' : 'شورت'}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-divider pt-4">
        <Metric size="md" label="سود خالص پایه" value={<MoneyValue value={net} signed tone="auto" />} />
        <Metric size="md" label="اسپرد نرخ" value={<PercentValue value={spread * 100} />} />
        <Metric size="md" label="بازده مارجین" value={<PercentValue value={roiMargin} />} />
      </div>

      <Disclosure summary="جزئیات و دلایل" className="mt-3 border-t border-divider pt-1">
        <KeyValueList
          dense
          rows={[
            { label: 'نرخ ثابت (نرخ ثابت سالانه)', value: <PercentValue value={a.impliedApr * 100} signed={false} tone="none" /> },
            { label: 'نرخ شناور', value: <PercentValue value={a.underlyingApr * 100} signed={false} tone="none" /> },
            { label: 'سود ناخالص پایه', value: <MoneyValue value={gross} signed tone="auto" /> },
            { label: 'هزینه‌های تخمینی', value: <MoneyValue value={a.fees?.total ?? null} /> },
            { label: 'حداقل لبه اقتصادی', value: <MoneyValue value={a.minEconomicEdge} /> },
            { label: 'لبه اقتصادی (خالص − حداقل مزیت)', emphasis: true, value: <MoneyValue value={net - a.minEconomicEdge} signed tone="auto" /> },
            { label: 'نقطه سر‌به‌سر', value: <PercentValue value={be !== null ? be * 100 : null} signed={false} tone="none" /> },
            { label: 'مارجین', value: <MoneyValue value={a.marginRequired} /> },
            { label: 'ریسک / اطمینان', value: <Badge tone={riskTone(a.riskLevel)}>{a.riskLevel} · {toFaDigits(a.confidence)}٪</Badge> },
            {
              label: 'پایداری',
              value: a.robustness === 'robust' ? 'پایدار' : a.robustness === 'conditional' ? 'مشروط' : a.robustness === 'not-attractive' ? 'ناپایدار' : 'N/A'
            },
            { label: 'نرخ لیکوئید', hint: 'ویژگی پوزیشن است — در اسکنر بازار همیشه نامشخص', value: <span className="text-subtle">N/A</span> }
          ]}
        />
        {a.stress.available && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-field bg-surface-2 p-3 text-center">
            {[
              { l: 'بدبینانه', v: a.stress.bearNet },
              { l: 'پایه', v: a.stress.baseNet },
              { l: 'خوش‌بینانه', v: a.stress.bullNet }
            ].map((x) => (
              <div key={x.l}>
                <p className="text-xs text-muted">{x.l}</p>
                <p className="text-sm font-semibold"><MoneyValue value={x.v} signed tone="auto" /></p>
              </div>
            ))}
          </div>
        )}
        {!a.liquidity.executable && a.liquidity.available && (
          <Notice tone="warn" className="mt-3">حجم موردنظر از ظرفیت تخمینی بازار بیشتر است.</Notice>
        )}
        {a.anomaly.detected && a.anomaly.reasons.length > 0 && (
          <Notice tone="error" className="mt-3" title="ناهنجاری">
            {a.anomaly.reasons.join(' · ')}
          </Notice>
        )}
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-muted">
            {status === 'potential' || status === 'conditional' ? 'چرا این بازار؟' : 'چرا جذاب نیست؟'}
          </p>
          <Reasons a={a} />
        </div>
      </Disclosure>
    </Surface>
  );
}

export function OpportunitiesTab({ markets }: { markets: BorosMarket[] }) {
  const [assetFilter, setAssetFilter] = useState('همه');
  const [venueFilter, setVenueFilter] = useState('همه');
  /** simulation collateral (ETH) — simulation only, never shown as real */
  const [simCollateral, setSimCollateral] = useState(DEFAULT_SIMULATION_COLLATERAL_ETH);
  const [userDir, setUserDir] = useState<'long' | 'short' | 'both'>('both');
  const ethPrice = markets.find((m) => m.collateralSymbol === 'ETH')?.collateralPriceUsd ?? 0;

  const userOpps = useMemo(() => {
    if (!(simCollateral > 0) || !(ethPrice > 0)) return [];
    return rankUserCapitalOpportunities(markets.filter((m) => m.collateralSymbol === 'ETH' && m.status === 'GOOD'), simCollateral, ethPrice, {
      direction: userDir === 'both' ? undefined : userDir
    });
  }, [markets, simCollateral, ethPrice, userDir]);

  const assets = useMemo(() => ['همه', ...new Set(markets.map((m) => m.asset))], [markets]);
  const venues = useMemo(() => ['همه', ...new Set(markets.map((m) => m.venue))], [markets]);

  const rows = useMemo(() => {
    const filtered = markets.filter(
      (m) => (assetFilter === 'همه' || m.asset === assetFilter) && (venueFilter === 'همه' || m.venue === venueFilter)
    );
    return BorosCalculationEngine.analyzeAll(filtered, 1000);
  }, [markets, assetFilter, venueFilter]);

  const bestLong = useMemo(
    () => rows.filter((a) => a.statusLong === 'potential' && !a.anomaly.detected).sort((x, y) => y.longScore - x.longScore).slice(0, 3),
    [rows]
  );
  const bestShort = useMemo(
    () => rows.filter((a) => a.statusShort === 'potential' && !a.anomaly.detected).sort((x, y) => y.shortScore - x.shortScore).slice(0, 3),
    [rows]
  );

  return (
    <div className="space-y-8">
      {/* controls */}
      <Surface className="p-4 md:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={<span className="inline-flex items-center gap-1.5">وثیقه شبیه‌سازی <ProvenanceBadge kind="simulated" /></span>}
            hint="فقط برای شبیه‌سازی — نه واریز یا موجودی واقعی"
          >
            <Input
              dir="ltr"
              type="number"
              step="0.001"
              min="0"
              value={simCollateral}
              onChange={(e) => setSimCollateral(Number(e.target.value) || 0)}
              suffix="اتریوم"
            />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">جهت ارزیابی</p>
            <SegmentedControl
              label="جهت ارزیابی"
              fill
              value={userDir}
              onChange={setUserDir}
              options={[
                { value: 'both', label: 'هر دو' },
                { value: 'long', label: 'لانگ' },
                { value: 'short', label: 'شورت' }
              ]}
            />
          </div>
          <Field label="دارایی">
            <Select value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}>
              {assets.map((a) => (
                <option key={a} value={a}>{borosAssetName(a)}</option>
              ))}
            </Select>
          </Field>
          <Field label="صرافی">
            <Select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
              {venues.map((v) => (
                <option key={v} value={v}>{borosVenueName(v)}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Surface>

      <Section
        id="user-capital"
        title="بهترین فرصت‌ها برای سرمایه شما"
        description={`سرمایهٔ فرضی: ${simCollateral.toFixed(3)} اتریوم`}
      >
        {userOpps.length === 0 ? (
          <EmptyState
            message={simCollateral <= 0 || !(ethPrice > 0) ? 'مقدار معتبر وثیقه وارد کنید' : 'فرصت قابل‌اجرایی با سود خالص مثبت یافت نشد'}
            hint="فیلترها: بدون ناهنجاری، قابل اجرا و لبه اقتصادی مثبت"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {userOpps.slice(0, 4).map((o, i) => (
              <UserCapitalCard key={`${o.marketId}-${o.direction}`} o={o} rank={i + 1} />
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-8 xl:grid-cols-2">
        <Section
          id="best-long"
          title={<span className="inline-flex items-center gap-1.5"><TrendingUp aria-hidden className="h-4 w-4 text-positive" /> بهترین فرصت‌های لانگ</span>}
          description="تحلیل بازار مستقل از سرمایه شما"
        >
          {bestLong.length === 0 ? (
            <EmptyState message={rows.length > 0 ? 'فرصت لانگ با سود خالص مثبت وجود ندارد' : 'بازاری یافت نشد'} />
          ) : (
            <div className="space-y-4">
              {bestLong.map((a, i) => <OppCard key={a.marketId} rank={i + 1} a={a} side="long" />)}
            </div>
          )}
        </Section>
        <Section
          id="best-short"
          title={<span className="inline-flex items-center gap-1.5"><TrendingDown aria-hidden className="h-4 w-4 text-negative" /> بهترین فرصت‌های شورت</span>}
          description="تحلیل بازار مستقل از سرمایه شما"
        >
          {bestShort.length === 0 ? (
            <EmptyState message={rows.length > 0 ? 'فرصت شورت با سود خالص مثبت وجود ندارد' : 'بازاری یافت نشد'} />
          ) : (
            <div className="space-y-4">
              {bestShort.map((a, i) => <OppCard key={a.marketId} rank={i + 1} a={a} side="short" />)}
            </div>
          )}
        </Section>
      </div>

      <Section id="all-markets" title="همه بازارها" description={`${toFaDigits(rows.length)} بازار واجد شرایط`}>
        {rows.length === 0 ? (
          <EmptyState message="بازاری یافت نشد" />
        ) : (
          <Surface className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[820px]">
                <caption className="sr-only">همه بازارهای بوروس</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky start-0 z-20 !ps-5">بازار</th>
                    <th scope="col" className="col-num">ثابت</th>
                    <th scope="col" className="col-num">شناور</th>
                    <th scope="col" className="col-num">اسپرد لانگ</th>
                    <th scope="col" className="col-num">اسپرد شورت</th>
                    <th scope="col" className="col-num">خالص لانگ</th>
                    <th scope="col" className="col-num">خالص شورت</th>
                    <th scope="col" className="col-num">امتیاز L / S</th>
                    <th scope="col">ریسک</th>
                    <th scope="col" className="!pe-5">وضعیت لانگ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 40).map((a) => (
                    <tr key={a.marketId}>
                      <td className="sticky start-0 z-10 bg-card !ps-5">
                        <p className="font-semibold text-ink"><bdi dir="ltr">{borosAssetName(a.asset)}</bdi> · {borosVenueName(a.venue)}</p>
                        <p className="text-xs text-muted">{toFaDigits(Math.ceil(a.daysToMaturity))} روز</p>
                      </td>
                      <td className="col-num"><PercentValue value={a.impliedApr * 100} signed={false} tone="none" /></td>
                      <td className="col-num"><PercentValue value={a.underlyingApr * 100} signed={false} tone="none" /></td>
                      <td className="col-num"><PercentValue value={a.longSpread * 100} /></td>
                      <td className="col-num"><PercentValue value={a.shortSpread * 100} /></td>
                      <td className="col-num"><MoneyValue value={a.totalLongPnl} signed tone="auto" /></td>
                      <td className="col-num"><MoneyValue value={a.totalShortPnl} signed tone="auto" /></td>
                      <td className="col-num num-ltr text-muted">{Math.round(a.longScore)} / {Math.round(a.shortScore)}</td>
                      <td><Badge tone={riskTone(a.riskLevel)}>{a.riskLevel}</Badge></td>
                      <td className="!pe-5"><Badge tone={STATUS_TONE[a.statusLong]}>{STATUS_LABEL[a.statusLong]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        )}
      </Section>

      <Section id="why-rank" title="چرا این رتبه؟" description="سه بازار برتر بر اساس لبه اقتصادی (نه فقط اسپرد)">
        <div className="grid gap-4 lg:grid-cols-3">
          {rows
            .slice()
            .sort((x, y) => y.totalLongPnl - y.minEconomicEdge - (x.totalLongPnl - x.minEconomicEdge))
            .slice(0, 3)
            .map((a) => (
              <Surface key={a.marketId} className="p-4">
                <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                  <bdi dir="ltr">{borosAssetName(a.asset)}</bdi> · {borosVenueName(a.venue)}
                  <Badge tone={STATUS_TONE[a.statusLong]}>{STATUS_LABEL[a.statusLong]}</Badge>
                </p>
                <Reasons a={a} limit={2} />
              </Surface>
            ))}
        </div>
      </Section>

      <p className={cn('text-xs leading-5 text-muted')}>
        لانگ و شورت کاملاً جدا محاسبه می‌شوند · نقطه سر‌به‌سر خارج از محدوده معتبر → N/A · لبه اقتصادی پیش‌فرض: ۱ دلار یا
        ۰٫۱٪ notional · امتیازها احتمال موفقیت نیستند؛ فقط تحلیل‌اند.
      </p>
    </div>
  );
}
