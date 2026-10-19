/**
 * ترکیب پیشنهادی چند بازار Derive — دستیار خودش بازارها را با هم جفت می‌کند:
 * فروش نوسان جایی که IV/HV بالاست، خرید جایی که پایین است، بیمهٔ ریزش روی بازار با بیشترین Beta.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/shared/components/ui/Badge';
import { KeyValueList, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { toFaDigits } from '@/shared/utils/formatters';
import {
  betaCorr,
  marketBreadth,
  replayScenarios,
  capitalTier,
  comboScenarios,
  monteCarlo,
  pnlZones,
  type Combo,
  COMBO_FA,
  COMBO_MIN_OI_USD,
  historicalVol,
  ivRegime,
  RISK_PCT,
  STRATEGY_FA,
  suggestCombos,
  type MarketSnap,
  type OptionLeg,
  type RiskProfile
} from '@/features/calculators/domain';
import { useComboData, type DeriveMarket } from '@/features/calculators/data/deriveOptions';
import { Chips } from '../plan/PlanWizard';
import { DeepScenarios } from './DeepScenarios';
import { AssistantExplain } from './AssistantExplain';
import { useMarkets } from '@/features/markets/pipeline/useMarkets';
import { atmIvOf, DAY, expiryMs, faDate, fmtPct, fmtQty } from './helpers';

/** حداکثر بازارهایی که برای ترکیب خوانده می‌شوند (به ترتیب Open Interest دلاری) */
const MAX_MARKETS = 5;

export function ComboPlanner({ markets, capital, risk }: { markets: readonly DeriveMarket[]; capital: number; risk: RiskProfile }) {
  const liquid = useMemo(
    () =>
      markets
        .filter((m) => m.spot !== null && m.optionOi * m.spot >= COMBO_MIN_OI_USD)
        .sort((a, b) => b.optionOi * b.spot! - a.optionOi * a.spot!)
        .slice(0, MAX_MARKETS)
        .map((m) => m.currency),
    [markets]
  );
  const { chains, histories } = useComboData(liquid, true);
  const loading = chains.some((q) => q.isLoading) || histories.some((q) => q.isLoading);
  const stamp = chains.map((q) => q.dataUpdatedAt).join() + histories.map((q) => q.dataUpdatedAt).join();
  const riskCap = (capital * RISK_PCT[risk]) / 100;
  const live = useMarkets('crypto_top_200');

  const snaps = useMemo<MarketSnap[]>(() => {
    const now = Date.now();
    const hist = new Map(histories.map((q) => [q.data?.currency, q.data?.candles ?? []]));
    const btc = hist.get('BTC') ?? [];
    const out: MarketSnap[] = [];
    chains.forEach((q, i) => {
      const c = q.data;
      const spot = c?.index ?? null;
      if (!c || !spot) return;
      const T = Math.max(0, (expiryMs(c.expiry) - now) / (365 * DAY));
      const atmIv = atmIvOf(c);
      const candles = hist.get(c.currency) ?? [];
      const hv = historicalVol(candles.map((x) => x.close).slice(-31));
      const bc = c.currency === 'BTC' ? { beta: 1, corr: 1 } : betaCorr(btc, candles);
      const mk = markets.find((m) => m.currency === liquid[i]);
      out.push({
        currency: c.currency,
        spot,
        days: T * 365,
        expiry: c.expiry,
        atmIv,
        hv,
        regime: ivRegime(atmIv, hv),
        chain: c.options,
        m: {
          forward: c.forward ?? spot,
          spot,
          T,
          atmIv,
          minAmount: c.minAmount ?? 0.1,
          amountStep: c.amountStep ?? c.minAmount ?? 0.01,
          takerFeeRate: c.takerFeeRate,
          baseFee: c.baseFee,
          feeCapRate: c.feeCapRate
        },
        beta: bc?.beta ?? null,
        corr: bc?.corr ?? null,
        oiUsd: mk?.spot ? mk.optionOi * mk.spot : null
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, markets, liquid]);

  const combos = useMemo(() => suggestCombos(snaps, riskCap), [snaps, riskCap]);
  const [pick, setPick] = useState(0);
  const combo = combos[Math.min(pick, combos.length - 1)] ?? null;

  if (loading && !snaps.length) return <Skeleton className="h-60 w-full" />;
  if (combos.length === 0)
    return (
      <Notice tone="warn" title="ترکیبی ساخته نشد">
        برای ترکیب، دست‌کم دو بازار پرمعامله لازم است (قراردادهای باز بیش از ۱۰۰ هزار دلار) که دادهٔ نوسانشان کامل باشد.
      </Notice>
    );

  const info = COMBO_FA[combo!.id];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">چرا این بازارها؟</h3>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] border-separate border-spacing-0 text-xs">
            <caption className="sr-only">مقایسهٔ بازارها</caption>
            <thead>
              <tr className="text-2xs text-subtle">
                {['بازار', 'سررسید', 'نوسان مورد انتظار (IV)', 'نوسان واقعی ۳۰ روز (HV)', 'گرانی آپشن (IV÷HV)', 'همراهی با بیت‌کوین (Beta)', 'همبستگی'].map((h, i) => (
                  <th key={h} scope="col" className={i === 0 ? 'pb-2 text-start font-semibold' : 'pb-2 text-end font-semibold'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snaps.map((s) => (
                <tr key={s.currency}>
                  <th scope="row" className="border-t border-divider py-2 text-start font-latin font-bold text-ink" dir="ltr">
                    {s.currency}
                  </th>
                  <td className="border-t border-divider py-2 text-end text-muted">{toFaDigits(Math.round(s.days))} روز</td>
                  <td className="border-t border-divider py-2 text-end">{s.atmIv === null ? '—' : fmtPct(s.atmIv * 100, 0)}</td>
                  <td className="border-t border-divider py-2 text-end">{s.hv === null ? '—' : fmtPct(s.hv * 100, 0)}</td>
                  <td className="border-t border-divider py-2 text-end">
                    {s.atmIv !== null && s.hv ? (
                      <Badge tone={s.regime === 'rich' ? 'warn' : s.regime === 'cheap' ? 'gain' : 'neutral'}>{toFaDigits((s.atmIv / s.hv).toFixed(2))}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="border-t border-divider py-2 text-end">{s.beta === null ? '—' : toFaDigits(s.beta.toFixed(2))}</td>
                  <td className="border-t border-divider py-2 text-end">{s.corr === null ? '—' : toFaDigits(s.corr.toFixed(2))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-2xs leading-5 text-subtle">
          {toFaDigits(MAX_MARKETS)} بازار پرمعامله‌تر Derive. «گرانی آپشن» بیش از ۱٫۱ یعنی آپشن‌ها گران‌اند و فروششان به‌صرفه‌تر است؛ کمتر از ۰٫۹ یعنی ارزان‌اند و خریدشان به‌صرفه‌تر است. «همراهی با بیت‌کوین» ۱٫۵ یعنی وقتی بیت‌کوین ۱٪ حرکت می‌کند، این دارایی معمولاً حدود ۱٫۵٪ حرکت می‌کند. همبستگی بالا یعنی در ریزش کل بازار با هم پایین می‌آیند و ترکیب کمتر ریسک را پخش می‌کند.
        </p>
      </div>

      <Chips label="ترکیب پیشنهادی" value={Math.min(pick, combos.length - 1)} onChange={setPick} options={combos.map((c, i) => ({ value: i, label: `${i === 0 ? 'اصلی' : `جایگزین ${toFaDigits(i)}`}: ${COMBO_FA[c.id].title}` }))} />

      <div className="space-y-2 rounded-card border border-accent/40 bg-accent-soft/40 p-3.5 text-xs leading-6">
        <p className="text-sm font-bold text-ink">{info.title}</p>
        <p className="text-muted">{info.idea}</p>
        <p>
          <b className="text-positive">سودده می‌ماند وقتی:</b> <span className="text-muted">{info.wins}</span>
        </p>
        <p>
          <b className="text-negative">ضررده می‌شود وقتی:</b> <span className="text-muted">{info.loses}</span>
        </p>
      </div>

      {combo!.belowMinimum && (
        <Notice tone="warn" title="سرمایه برای حداقل قرارداد کافی نیست">
          دست‌کم یکی از پاها با سقف ریسک هر معامله (<MoneyValue value={riskCap} digits={2} />) به حداقل اندازهٔ Derive نمی‌رسد؛ اعداد برای همان حداقل‌اند.
        </Notice>
      )}

      <ol className="space-y-2">
        {combo!.legs.map((l, i) => (
          <li key={l.currency} className="rounded-field border border-divider p-3 text-xs leading-6">
            <p className="font-bold text-ink">
              پای {toFaDigits(i + 1)}: <bdi dir="ltr">{l.currency}</bdi> — {STRATEGY_FA[l.strategy.id]}
            </p>
            <p className="text-2xs text-subtle">
              {l.role} · سررسید {faDate(l.snap.expiry)} ({toFaDigits(Math.round(l.snap.days))} روز)
            </p>
            <ul className="mt-1 space-y-0.5 text-muted">
              {l.strategy.legs
                .filter((x): x is OptionLeg => x.kind === 'option')
                .map((x) => (
                  <li key={x.name}>
                    {x.side === 'buy' ? 'خرید' : 'فروش'} {fmtQty(x.qty)} {x.type === 'C' ? 'اختیار خرید (Call)' : 'اختیار فروش (Put)'} با قیمت توافقی {toFaDigits(x.strike.toLocaleString('en-US'))} دلار — سفارش با قیمت مشخص (Limit) حدود قیمت میانه{' '}
                    <MoneyValue value={x.premium} digits={2} />
                  </li>
                ))}
            </ul>
            <p className="mt-1 text-muted">
              {l.strategy.stats.netPremium >= 0 ? 'دریافتی در شروع' : 'پرداختی در شروع'} <MoneyValue value={Math.abs(l.strategy.stats.netPremium)} digits={2} /> · بیشترین زیان{' '}
              <MoneyValue value={-(l.strategy.stats.maxLoss ?? 0)} digits={2} tone="loss" /> · حداکثر سود{' '}
              {l.strategy.stats.maxProfit === null ? 'نامحدود' : <MoneyValue value={l.strategy.stats.maxProfit} digits={2} />}
            </p>
          </li>
        ))}
      </ol>

      <KeyValueList
        dense
        rows={[
          { label: 'جمع حداکثر ضرر (اگر همه با هم ضرر بدهند)', value: <MoneyValue value={-combo!.totalMaxLoss} digits={2} tone="loss" /> },
          { label: 'سهم از سرمایه', value: capital > 0 ? fmtPct((combo!.totalMaxLoss / capital) * 100) : '—' },
          { label: combo!.totalPremium >= 0 ? 'جمع پولی که در شروع دریافت می‌کنید' : 'جمع پولی که در شروع پرداخت می‌کنید', value: <MoneyValue value={Math.abs(combo!.totalPremium)} digits={2} /> },
          { label: 'کارمزد تقریبی باز کردن', value: <MoneyValue value={combo!.totalFees} digits={2} /> }
        ]}
      />
      <p className="text-2xs leading-5 text-subtle">
        هر پا جدا به سقف ریسک هر معامله ({fmtPct(RISK_PCT[risk])} سرمایه = <MoneyValue value={riskCap} digits={2} />) محدود شده؛ بقیهٔ سرمایه نقد می‌ماند. سررسید هر بازار ۱۴ تا ۴۵ روز، نزدیک ۳۰ روز.
      </p>

      <AssistantExplain payload={() => comboPayload(combo!, { capital, risk, riskCap, live: live.assets, syncedAt: live.lastSyncAt ?? null })} />

      <DeepScenarios combo={combo!} />
    </div>
  );
}

/** همهٔ اعداد ترکیب برای دستیار، با قیمت زندهٔ بخش «بازارها» */
function comboPayload(
  c: Combo,
  ctx: { capital: number; risk: RiskProfile; riskCap: number; live: readonly { symbol: string; price: number | null; change24h: number | null; change7d: number | null; change30d: number | null; snapshot?: boolean }[]; syncedAt: number | null }
): Record<string, unknown> {
  const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  const liveOf = (sym: string) => ctx.live.find((x) => x.symbol.toUpperCase() === sym) ?? null;
  const mc = (v: 'iv' | 'hv') => {
    const x = monteCarlo(c, v);
    return x && { probabilityOfProfit: x.pProfit, meanPnl: r2(x.expected), worst5pctMean: r2(x.worst5), best5pctMean: r2(x.best5), probabilityAllLegsLose: x.pAllLose };
  };
  return {
    capitalUsd: ctx.capital,
    capitalTier: capitalTier(ctx.capital),
    riskCapPerTradeUsd: r2(ctx.riskCap),
    riskProfile: ctx.risk,
    liveMarkets: {
      source: 'بخش بازارهای دارینو',
      syncedAt: ctx.syncedAt ? new Date(ctx.syncedAt).toISOString() : null,
      breadthTop200: marketBreadth(ctx.live),
      legs: c.legs.map((l) => {
        const a = liveOf(l.currency);
        return { symbol: l.currency, price: a?.price ?? null, change24hPct: a?.change24h ?? null, change7dPct: a?.change7d ?? null, change30dPct: a?.change30d ?? null, deriveIndex: r2(l.snap.spot), snapshot: a?.snapshot === true };
      })
    },
    combo: {
      name: COMBO_FA[c.id].title,
      idea: COMBO_FA[c.id].idea,
      totalMaxLoss: r2(c.totalMaxLoss),
      totalNetPremium: r2(c.totalPremium),
      totalFees: r2(c.totalFees),
      belowMinimum: c.belowMinimum,
      legs: c.legs.map((l) => ({
        market: l.currency,
        role: l.role,
        strategy: STRATEGY_FA[l.strategy.id],
        expiry: l.snap.expiry,
        daysToExpiry: Math.round(l.snap.days),
        atmIv: l.snap.atmIv,
        historicalVol30d: l.snap.hv,
        betaToBtc: l.snap.beta,
        correlationToBtc: l.snap.corr,
        options: l.strategy.legs.filter((x): x is OptionLeg => x.kind === 'option').map((x) => ({ side: x.side, type: x.type, strike: x.strike, qty: x.qty, limitMid: r2(x.premium), instrument: x.name })),
        netPremium: r2(l.strategy.stats.netPremium),
        maxProfit: r2(l.strategy.stats.maxProfit),
        maxLoss: r2(l.strategy.stats.maxLoss),
        breakevens: l.strategy.stats.breakevens,
        probabilityOfProfit: l.strategy.stats.pop,
        profitZones: pnlZones(l.strategy.legs, l.snap.m.forward, l.snap.m.T, l.snap.atmIv).map((z) => ({ from: r2(z.lo), to: r2(z.hi), profit: z.profit, probability: z.prob })),
        liquidity: { worstSpreadPct: l.strategy.worstSpreadPct, minOpenInterest: l.strategy.minOi }
      })),
      deepScenarios: comboScenarios(c).map((r) => ({
        scenario: r.label,
        pnl: r2(r.total.total),
        priceEffect: r2(r.total.price),
        ivEffect: r2(r.total.vol),
        timeEffect: r2(r.total.time),
        perLeg: r.perLeg.map((p) => ({ market: p.currency, movePct: r2(p.move * 100), pnl: r2(p.attribution.total), why: p.why }))
      })),
      replayScenarios: replayScenarios(c, ctx.live).map((r) => ({ scenario: r.label, pnl: r2(r.total.total), perLeg: r.perLeg.map((p) => ({ market: p.currency, movePct: r2(p.move * 100), pnl: r2(p.attribution.total), why: p.why })) })),
      monteCarlo: { volEqualsIv: mc('iv'), volEqualsHv30: mc('hv') }
    },
    missingData: c.legs.flatMap((l) => [...(l.snap.hv === null ? [`HV ${l.currency}`] : []), ...(l.snap.beta === null ? [`Beta ${l.currency}`] : [])])
  };
}
