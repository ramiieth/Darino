/**
 * Pendle analytics & calculators — UI
 * Enter capital + pick a market → everything else comes from the Pendle Core API.
 *
 * Every calculator follows: INPUT → ASSUMPTIONS → RESULT → SECONDARY → DETAILS.
 * Calculations are the engine's (features/pendle/engine/analytics) — unchanged.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { usePendleMarkets } from '@/features/pendle/data/usePendleMarkets';
import { fmtExpiry, chainName, type PendleMarketView } from '@/features/pendle/domain/pendle';
import {
  calcPt,
  calcYt,
  calcLp,
  netProfit,
  realApy,
  realRoi,
  swapFeeCost,
  slippageCost,
  breakEvenTokenPrice,
  breakEvenApyPct,
  compareMarkets,
  type PtCalcResult
} from '@/features/pendle/engine/analytics';
import { fmtIntLatin as fmtInt, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type SubTab = 'pt' | 'yt' | 'lp' | 'real' | 'breakeven' | 'compare';

const TABS: { value: SubTab; label: string }[] = [
  { value: 'pt', label: 'PT' },
  { value: 'yt', label: 'YT' },
  { value: 'lp', label: 'LP' },
  { value: 'real', label: 'پس از هزینه' },
  { value: 'breakeven', label: 'سر‌به‌سر' },
  { value: 'compare', label: 'مقایسه' }
];

/** Fixed cost assumptions used by the calculators (shown to the user) */
const ASSUME = { gas: 5, swapFeePct: 0.1, slippagePct: 0.1, priceImpactPct: 0.05 };

export function AnalyticsTab() {
  const { markets, prices } = usePendleMarkets();
  const [sub, setSub] = useState<SubTab>('pt');
  const [investment, setInvestment] = useState('10000');
  const [marketId, setMarketId] = useState('');

  const market = markets.find((m) => m.address === marketId) ?? null;
  const invest = Number(investment) || 0;

  return (
    <div className="space-y-5">
      {/* INPUT */}
      <Surface className="p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="سرمایه" className="md:col-span-3">
            <Input dir="ltr" inputMode="decimal" value={investment} onChange={(e) => setInvestment(e.target.value)} suffix="دلار" />
          </Field>
          <Field label="بازار پندل" hint="قیمت‌ها و نرخ‌ها خودکار از سرویس رسمی پندل" className="md:col-span-9">
            <Select value={marketId} onChange={(e) => setMarketId(e.target.value)}>
              <option value="">انتخاب بازار…</option>
              {markets.slice(0, 80).map((m) => (
                <option key={m.address} value={m.address}>
                  {m.name} · {chainName(m.chainId)} · {fmtExpiry(m.expiry)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <SegmentedControl label="ماشین‌حساب" options={TABS} value={sub} onChange={setSub} />
        </div>
      </Surface>

      {sub !== 'compare' && !market && (
        <EmptyState message="یک بازار انتخاب کنید" hint="همه قیمت‌ها و نرخ‌ها پس از انتخاب بازار از سرویس دریافت و محاسبه می‌شوند." />
      )}
      {sub === 'pt' && market && <PtSection investment={invest} market={market} prices={prices} />}
      {sub === 'yt' && market && <YtSection investment={invest} market={market} prices={prices} />}
      {sub === 'lp' && market && <LpSection investment={invest} market={market} />}
      {sub === 'real' && market && <RealApySection investment={invest} market={market} />}
      {sub === 'breakeven' && market && <BreakevenSection investment={invest} market={market} prices={prices} />}
      {sub === 'compare' && <CompareSection markets={markets} investment={invest} />}
    </div>
  );
}

/* ---------- live prices from the API (never assumed) ---------- */
function ptPriceOf(market: PendleMarketView, prices: Record<string, number>): number | null {
  const p = prices[market.pt];
  return typeof p === 'number' && p > 0 ? p : null;
}

/**
 * PT redemption price at maturity = underlying spot (from the API).
 * ≈ $1 for stables; the share price for tokenized stocks. Unknown → null (never assumed).
 */
function redemptionPriceOf(market: PendleMarketView, prices: Record<string, number>): number | null {
  const p = prices[market.underlyingAsset];
  return typeof p === 'number' && p > 0 ? p : null;
}

const STABLECOIN_RE = /USDC|USDT|DAI|USDE|FDUSD|USDS|PYUSD|USD0|USR|TUSD|sUSDe|syrupUSDC|USDTB/i;

/* ---------- layout ---------- */

function ResultLayout({
  market,
  assumptions,
  primary,
  secondary,
  details
}: {
  market: PendleMarketView;
  assumptions: { label: ReactNode; value: ReactNode }[];
  primary: ReactNode;
  secondary: { label: ReactNode; value: ReactNode; emphasis?: boolean }[];
  details?: ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-8">
        {/* RESULT */}
        <Surface variant="focal" className="p-4 md:p-6">
          <p className="mb-4 truncate text-xs text-muted">
            <bdi dir="ltr" className="font-semibold text-ink">{market.name}</bdi> · {market.protocol} · {chainName(market.chainId)}
          </p>
          {primary}
        </Surface>
        {/* SECONDARY */}
        <Surface className="px-4 md:px-6">
          <KeyValueList rows={secondary} />
        </Surface>
        {details}
      </div>
      {/* ASSUMPTIONS */}
      <aside className="lg:col-span-4">
        <Surface variant="subtle" className="p-4 lg:sticky lg:top-8">
          <h3 className="text-sm font-bold text-ink">فرض‌ها و داده‌ها</h3>
          <KeyValueList className="mt-1" dense rows={assumptions} />
        </Surface>
      </aside>
    </div>
  );
}

function PrimaryPair({ a, b }: { a: { label: string; value: ReactNode }; b: { label: string; value: ReactNode } }) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <Metric size="hero" label={a.label} value={a.value} />
      <Metric size="lg" label={b.label} value={b.value} />
    </div>
  );
}

function Insufficient({ text }: { text: string }) {
  return (
    <Notice tone="warn" title="داده ناکافی">
      {text} تا دریافت داده واقعی، عددی محاسبه نمی‌شود — هیچ مقداری حدس زده نمی‌شود.
    </Notice>
  );
}

const baseAssumptions = (m: PendleMarketView, days: number) => [
  { label: 'سررسید', value: fmtExpiry(m.expiry) },
  { label: 'روزهای باقی‌مانده', value: <span className="num-ltr">{fmtInt(days)}</span> },
  { label: 'گس', value: <MoneyValue value={ASSUME.gas} /> },
  { label: 'کارمزد سواپ', value: <span className="num-ltr">{ASSUME.swapFeePct}%</span> },
  { label: 'لغزش قیمت', value: <span className="num-ltr">{ASSUME.slippagePct}%</span> }
];

/* ---------- PT ---------- */
function PtSection({ investment, market, prices }: { investment: number; market: PendleMarketView; prices: Record<string, number> }) {
  const ptPrice = ptPriceOf(market, prices);
  const redemption = redemptionPriceOf(market, prices);
  const days = Math.max(1, market.daysToExpiry ?? 90);

  const r: PtCalcResult | null = useMemo(() => {
    if (ptPrice === null) return null;
    // without a redemption price only stablecoin underlyings may assume $1
    const redemptionKnown = redemption !== null || STABLECOIN_RE.test(market.name) || STABLECOIN_RE.test(market.underlyingAsset);
    if (!redemptionKnown) return null;
    return calcPt({
      investment,
      ptPrice,
      maturityIso: market.expiry,
      redemptionPrice: redemption,
      gas: ASSUME.gas,
      swapFeePct: ASSUME.swapFeePct,
      slippagePct: ASSUME.slippagePct
    });
  }, [investment, ptPrice, redemption, market.expiry, market.name, market.underlyingAsset]);

  if (r === null) return <Insufficient text="قیمت زنده توکن اصل یا دارایی پایه از سرویس در دسترس نیست؛" />;

  return (
    <ResultLayout
      market={market}
      primary={
        <PrimaryPair
          a={{ label: 'ارزش در سررسید', value: <MoneyValue value={r.redeemValueUsd} /> }}
          b={{ label: 'بازده سالانه پس از هزینه', value: <PercentValue value={r.realApyPct} tone="auto" /> }}
        />
      }
      secondary={[
        { label: 'سود ناخالص', value: <MoneyValue value={r.grossProfit} signed tone="auto" />, emphasis: true },
        { label: 'بازده کل دوره', value: <PercentValue value={r.roiPct} /> },
        { label: 'بازده ثابت', value: <PercentValue value={r.fixedYieldPct} signed={false} tone="none" /> },
        { label: 'بازده سالانه مؤثر', value: <PercentValue value={r.effectiveApyPct} signed={false} tone="none" /> },
        { label: 'بازده سالانه‌شده', value: <PercentValue value={r.annualizedPct} signed={false} tone="none" /> },
        { label: 'تعداد توکن اصل', value: <span className="num-ltr">{fmtInt(r.ptAmount)} PT</span> },
        { label: 'روز نگهداری', value: <span className="num-ltr">{fmtInt(r.holdingDays)}</span> }
      ]}
      assumptions={[
        { label: 'قیمت توکن اصل (زنده)', value: <MoneyValue value={ptPrice} /> },
        { label: 'قیمت بازخرید', value: redemption !== null ? <MoneyValue value={redemption} /> : <span className="text-muted">۱ دلار (استیبل)</span> },
        ...baseAssumptions(market, days)
      ]}
    />
  );
}

/* ---------- YT ---------- */
function YtSection({ investment, market, prices }: { investment: number; market: PendleMarketView; prices: Record<string, number> }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const underlying = market.underlyingApyPct ?? 0;
  const reward = market.rewardAprPct ?? 0;
  const raw = prices[market.yt];
  const ytPrice = typeof raw === 'number' && raw > 0 ? raw : null;
  const r = ytPrice !== null ? calcYt(investment, ytPrice, underlying, reward, days) : null;
  const ytAmount = ytPrice !== null ? investment / ytPrice : null;

  if (r === null || ytAmount === null) return <Insufficient text="قیمت زنده توکن بازده از سرویس در دسترس نیست؛" />;

  return (
    <ResultLayout
      market={market}
      primary={
        <PrimaryPair
          a={{ label: 'سود کل تا سررسید', value: <MoneyValue value={r.totalIncome} signed tone="auto" /> }}
          b={{ label: 'بازده سالانه', value: <PercentValue value={r.totalApyPct} tone="auto" /> }}
        />
      }
      secondary={[
        { label: 'درآمد بازده پایه', value: <MoneyValue value={r.yieldIncome} signed tone="auto" /> },
        { label: 'پاداش', value: <MoneyValue value={r.rewardIncomeUsd} signed tone="auto" /> },
        { label: 'بازده کل دوره', value: <PercentValue value={r.totalReturnPct} /> },
        { label: 'بازده سالانه سر‌به‌سر', value: <PercentValue value={r.breakEvenApyPct} signed={false} tone="none" />, emphasis: true },
        { label: 'حداکثر زیان', value: <MoneyValue value={-Math.abs(r.maxLoss)} tone="loss" /> },
        { label: 'تعداد توکن بازده', value: <span className="num-ltr">{fmtInt(ytAmount)} YT</span> }
      ]}
      assumptions={[
        { label: 'قیمت توکن بازده (زنده)', value: <MoneyValue value={ytPrice} /> },
        { label: 'بازده سالانه پایه', value: <PercentValue value={underlying} signed={false} tone="none" /> },
        { label: 'نرخ پاداش سالانه', value: <PercentValue value={reward} signed={false} tone="none" /> },
        ...baseAssumptions(market, days).slice(0, 2)
      ]}
      details={
        <Notice tone="warn">
          YT در سررسید بی‌ارزش می‌شود؛ اگر بازده پایه از «APY سر‌به‌سر» کمتر شود، بخشی یا تمام سرمایه از دست می‌رود.
        </Notice>
      }
    />
  );
}

/* ---------- LP ---------- */
function LpSection({ investment, market }: { investment: number; market: PendleMarketView }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const underlying = market.underlyingApyPct ?? 0;
  const ptFixed = market.fixedApyPct ?? 0;
  const swapFee = market.swapFeeApyPct ?? 0;
  const reward = market.rewardAprPct ?? 0;
  const r = calcLp(investment, 1, underlying, ptFixed, swapFee, reward, 0, days);

  return (
    <ResultLayout
      market={market}
      primary={
        <PrimaryPair
          a={{ label: 'سود کل تا سررسید', value: <MoneyValue value={r.totalUsd} signed tone="auto" /> }}
          b={{ label: 'بازده سالانه', value: <PercentValue value={r.totalApyPct} tone="auto" /> }}
        />
      }
      secondary={[
        { label: 'درآمد بازده پایه', value: <MoneyValue value={r.underlyingYieldUsd} signed tone="auto" /> },
        { label: 'پاداش', value: <MoneyValue value={r.rewardUsd} signed tone="auto" /> },
        { label: 'کارمزد معاملات', value: <MoneyValue value={r.tradingFeesUsd} signed tone="auto" /> },
        { label: 'بازده کل دوره', value: <PercentValue value={(r.totalUsd / Math.max(investment, 1)) * 100} /> },
        { label: 'تعداد نقدینگی', value: <span className="num-ltr">{fmtInt(r.lpTokens)} LP</span> }
      ]}
      assumptions={[
        { label: 'بازده سالانه پایه', value: <PercentValue value={underlying} signed={false} tone="none" /> },
        { label: 'بازده سالانه ثابت توکن اصل', value: <PercentValue value={ptFixed} signed={false} tone="none" /> },
        { label: 'بازده سالانه کارمزد سواپ', value: <PercentValue value={swapFee} signed={false} tone="none" /> },
        { label: 'نرخ پاداش سالانه', value: <PercentValue value={reward} signed={false} tone="none" /> },
        { label: 'زیان ناپایدار', value: 'لحاظ نشده' },
        ...baseAssumptions(market, days).slice(0, 2)
      ]}
    />
  );
}

/* ---------- after costs ---------- */
function RealApySection({ investment, market }: { investment: number; market: PendleMarketView }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const apy = market.fixedApyPct ?? market.totalApyPct ?? 0;
  const gross = (apy / 100) * investment * (days / 365);
  const gas = ASSUME.gas;
  const swap = swapFeeCost(investment, ASSUME.swapFeePct);
  const slip = slippageCost(investment, ASSUME.slippagePct);
  const impact = investment * (ASSUME.priceImpactPct / 100);
  const totalFees = gas + swap + slip + impact;
  const net = netProfit(gross, gas, swap, slip + impact);
  const realRoiPct = realRoi(net, investment) * 100;
  const realApyPct = realApy(net, investment, days) * 100;

  return (
    <ResultLayout
      market={market}
      primary={
        <div className="grid grid-cols-2 gap-6">
          <Metric size="hero" label="بازده سالانه پس از هزینه" value={<PercentValue value={realApyPct} tone="auto" />} />
          <Metric size="lg" label="بازده سالانه اعلام‌شده" value={<PercentValue value={apy} signed={false} tone="none" />} sub="تئوری، پیش از هزینه" />
        </div>
      }
      secondary={[
        { label: 'سود ناخالص', value: <MoneyValue value={gross} signed tone="auto" /> },
        { label: 'گس', value: <MoneyValue value={-gas} /> },
        { label: 'کارمزد سواپ', value: <MoneyValue value={-swap} /> },
        { label: 'لغزش قیمت', value: <MoneyValue value={-slip} /> },
        { label: 'اثر قیمتی', value: <MoneyValue value={-impact} /> },
        { label: 'جمع هزینه‌ها', value: <MoneyValue value={-totalFees} tone="loss" /> },
        { label: 'سود خالص', value: <MoneyValue value={net} signed tone="auto" />, emphasis: true },
        { label: 'بازده خالص دوره', value: <PercentValue value={realRoiPct} /> }
      ]}
      assumptions={[
        { label: 'اثر قیمتی', value: <span className="num-ltr">{ASSUME.priceImpactPct}%</span> },
        ...baseAssumptions(market, days)
      ]}
    />
  );
}

/* ---------- break-even ---------- */
function BreakevenSection({ investment, market, prices }: { investment: number; market: PendleMarketView; prices: Record<string, number> }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const apy = market.fixedApyPct ?? 0;
  const gross = (apy / 100) * investment * (days / 365);
  const fees =
    ASSUME.gas + swapFeeCost(investment, ASSUME.swapFeePct) + slippageCost(investment, ASSUME.slippagePct) + investment * (ASSUME.priceImpactPct / 100);
  const costs = fees - gross;
  const ptPrice = ptPriceOf(market, prices);
  const bePrice = ptPrice !== null ? breakEvenTokenPrice(investment, investment / ptPrice) : null;
  const beApy = breakEvenApyPct(Math.max(costs, 0), investment, days);

  return (
    <ResultLayout
      market={market}
      primary={
        <PrimaryPair
          a={{ label: 'بازده سالانه سر‌به‌سر', value: <PercentValue value={beApy} signed={false} tone="none" /> }}
          b={{ label: 'قیمت سر‌به‌سر توکن اصل', value: <MoneyValue value={bePrice} /> }}
        />
      }
      secondary={[
        { label: `درآمد پیش‌بینی‌شده (${toFaDigits(days)} روز)`, value: <MoneyValue value={gross} signed tone="auto" /> },
        { label: 'جمع هزینه‌ها', value: <MoneyValue value={-fees} tone="loss" /> },
        { label: 'خالص', value: <MoneyValue value={gross - fees} signed tone="auto" />, emphasis: true }
      ]}
      assumptions={[
        { label: 'بازده سالانه ثابت بازار', value: <PercentValue value={apy} signed={false} tone="none" /> },
        { label: 'قیمت توکن اصل (زنده)', value: <MoneyValue value={ptPrice} /> },
        ...baseAssumptions(market, days)
      ]}
      details={<p className="text-xs text-muted">از نقطه سر‌به‌سر به بعد، بازده دوره هزینه‌های ورود و خروج را پوشش می‌دهد.</p>}
    />
  );
}

/* ---------- compare ---------- */
function CompareSection({ markets, investment }: { markets: PendleMarketView[]; investment: number }) {
  const navigate = useNavigate();
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (addr: string) => setSel((s) => (s.includes(addr) ? s.filter((x) => x !== addr) : [...s, addr].slice(-5)));

  const selected = markets.filter((m) => sel.includes(m.address));
  const metrics = useMemo(() => compareMarkets(selected, investment), [selected, investment]);
  const best = metrics.find((m) => m.isBest);

  return (
    <div className="space-y-5">
      <Surface className="p-4 md:p-5">
        <p className="mb-3 text-sm font-semibold text-ink">
          ۲ تا ۵ بازار انتخاب کنید <span className="font-normal text-muted">({toFaDigits(sel.length)} انتخاب‌شده)</span>
        </p>
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {markets.slice(0, 50).map((m) => {
            const on = sel.includes(m.address);
            return (
              <button
                key={m.address}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(m.address)}
                className={cn(
                  'h-8 max-w-[12rem] truncate rounded-control border px-2.5 text-xs font-semibold transition-colors',
                  on ? 'border-ink bg-ink text-card' : 'border-divider-strong bg-card text-muted hover:text-ink'
                )}
              >
                <bdi dir="ltr">{m.name}</bdi>
              </button>
            );
          })}
        </div>
      </Surface>

      {best && (
        <Notice tone="success" icon={<Crown />} title={`بیشترین بازده پس از هزینه: ${best.market.name}`}>
          بازده سالانه پس از هزینه <PercentValue value={best.realApyPct} className="font-semibold" /> · امتیاز فرصت{' '}
          <span className="num-ltr font-semibold">{fmtInt(best.opportunityScore)}</span>
        </Notice>
      )}

      {metrics.length >= 1 && (
        <Surface className="overflow-hidden">
          <div className="max-h-[60dvh] overflow-auto">
            <table className="data-table min-w-[720px]">
              <caption className="sr-only">مقایسه بازارها</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky start-0 z-20 !ps-5">بازار</th>
                  <th scope="col" className="col-num">سود</th>
                  <th scope="col" className="col-num">بازده</th>
                  <th scope="col" className="col-num">بازده سالانه</th>
                  <th scope="col" className="col-num">پس از هزینه</th>
                  <th scope="col" className="col-num">ارزش قفل‌شده</th>
                  <th scope="col" className="col-num">حجم</th>
                  <th scope="col" className="col-num">پاداش</th>
                  <th scope="col" className="col-num">روز</th>
                  <th scope="col" className="col-num">ریسک</th>
                  <th scope="col" className="col-num !pe-5">امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((mt) => (
                  <tr
                    key={mt.market.address}
                    onClick={() => navigate(`/pendle/${mt.market.chainId}/${mt.market.address}`)}
                    className={cn('cursor-pointer', mt.isBest && 'bg-gain/5')}
                  >
                    <td className="sticky start-0 z-10 max-w-[12rem] bg-card !ps-5">
                      <span className="block truncate font-semibold text-ink">
                        {mt.isBest && <Crown aria-label="بهترین" className="me-1 inline h-3.5 w-3.5 text-gold" />}
                        <bdi dir="ltr">{mt.market.name}</bdi>
                      </span>
                    </td>
                    <td className="col-num"><MoneyValue value={mt.profit} signed tone="auto" /></td>
                    <td className="col-num"><PercentValue value={mt.roiPct} /></td>
                    <td className="col-num"><PercentValue value={mt.apyPct} signed={false} tone="none" /></td>
                    <td className="col-num font-semibold"><PercentValue value={mt.realApyPct} /></td>
                    <td className="col-num text-muted"><MoneyValue value={mt.tvl} compact /></td>
                    <td className="col-num text-muted"><MoneyValue value={mt.volume} compact /></td>
                    <td className="col-num"><PercentValue value={mt.rewardAprPct} signed={false} tone="none" /></td>
                    <td className="col-num text-muted"><span className="num-ltr">{fmtInt(mt.remainingDays)}</span></td>
                    <td className="col-num"><span className="num-ltr">{fmtInt(mt.riskScore)}</span></td>
                    <td className="col-num !pe-5 font-semibold text-ink"><span className="num-ltr">{fmtInt(mt.opportunityScore)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}
