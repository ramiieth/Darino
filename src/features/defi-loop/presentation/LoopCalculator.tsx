/**
 * DeFi Loop Calculator — «من X دلار دارم؛ Loop کنم؟»
 *  - سرمایه / مدت / Safety Level / پارامترهای کاربر (LTV، LT، Borrow APY — چون API عمومی ندارد)
 *  - Reference (مرجع DeFiLlama: ۵ حلقه / Leverage / Looped APY — بدون هزینه کاربر)
 *  - Risk (HF / سطح ریسک / فاصله لیکوییدیشن / Stress Test) — جدا از Reference
 *  - Recommendation (توصیه ایمن — جدا از Reference)
 *  - جدول Loop (Supply/Borrow/Total/HF/Safety)
 *  - Economics: Gross Yield − Net Financing − Operating Costs = Net Profit
 *  - سه سناریو (Conservative/Base/Bull) · Show Calculation Details
 * ⚠️ هیچ تضمین «امن» — همه نتایج برآورد بر اساس داده فعلی
 */
import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, AlertTriangle, ShieldCheck, Repeat, Gauge } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
import {
  runLoopStrategy,
  SAFETY_LABEL,
  RISK_LEVEL_FA,
  parseLtvInput,
  parsePercentInput,
  parseSupplyComponents,
  type SafetyLevel
} from '@/features/defi-loop/domain/loopEngine';
import type { YieldPool } from '@/features/defi-loop/data/yieldsService';
import { ensurePoolChart } from '@/features/defi-loop/data/useYieldLoops';
import { computeApyStats } from '@/features/defi-loop/domain/yieldAnalytics';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const DAYS_OPTIONS = [7, 30, 90, 180, 365];

/** نمایش Leverage مرجع با یک رقم اعشار (۳.۲۸۸ → 3.3x) */
const fmtLev = (v: number | null): string => (v === null ? 'N/A' : `${v.toFixed(1)}x`);

export function LoopCalculator({ pool, onClose }: { pool: YieldPool; onClose: () => void }) {
  const [capital, setCapital] = useState(10000);
  const [days, setDays] = useState(90);
  const [safety, setSafety] = useState<SafetyLevel>('balanced');
  const [ltv, setLtv] = useState<string>('0.75');
  const [lt, setLt] = useState<string>('0.8');
  const [borrowApy, setBorrowApy] = useState<string>('0.05');
  const [borrowReward, setBorrowReward] = useState<string>('0');
  const [gasPerLoop, setGasPerLoop] = useState('3');
  const [slippage, setSlippage] = useState('5');
  const [rewardMult, setRewardMult] = useState<1 | 0.5 | 1.5>(1);
  const [showDetails, setShowDetails] = useState(false);
  const [chart, setChart] = useState<Awaited<ReturnType<typeof ensurePoolChart>>>(null);

  // بارگذاری lazy تاریخچه برای آمار
  useMemo(() => {
    void ensurePoolChart(pool.pool).then(setChart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.pool]);

  const apyStats = useMemo(() => computeApyStats(chart ?? [], pool.apy ?? 0), [chart, pool.apy]);

  // اجزای APY — بدون double-count (پایه + Reward = کل)
  const components = useMemo(() => parseSupplyComponents(pool.apy, pool.apyBase, pool.apyReward), [pool]);

  const result = useMemo(() => {
    const ltvN = parseLtvInput(ltv);
    const ltN = parseLtvInput(lt);
    const borrowN = parsePercentInput(borrowApy);
    const borrowRewardN = parsePercentInput(borrowReward);
    return runLoopStrategy({
      initialCapital: capital,
      supplyApy: components.base,
      rewardApy: components.reward,
      borrowApy: borrowN,
      borrowRewardApy: borrowRewardN,
      ltv: ltvN,
      liquidationThreshold: ltN,
      days,
      safety,
      costPerLoopUsd: Number(gasPerLoop) || 0,
      slippageUsd: Number(slippage) || 0,
      bridgeFeeUsd: 0,
      protocolMaxLoops: null,
      availableBorrowLiquidity: null,
      rewardMultiplier: rewardMult
    });
  }, [capital, days, safety, ltv, lt, borrowApy, borrowReward, gasPerLoop, slippage, rewardMult, components]);

  const stress = result.risk.stress;

  const hfMin = safety === 'conservative' ? 2 : safety === 'balanced' ? 1.75 : 1.5;

  return (
    <div className="space-y-3">
      <GlassCard className="p-3.5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[12px] font-black text-ink">
            <Calculator className="h-4 w-4 text-accent" /> Loop Calculator — {pool.project} · {pool.symbol}
          </p>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-[10px] font-black text-muted hover:bg-line/5">بستن ✕</button>
        </div>
        <p className="mt-0.5 text-[9px] font-medium text-muted">
          {pool.chain} · Supply APY {fmtPct(pool.apy ?? 0)} (پایه {fmtPct(components.base * 100)} + Reward {fmtPct(components.reward * 100)}) · TVL {fmtUSD(pool.tvlUsd, true)}
        </p>
      </GlassCard>

      {/* ورودی‌ها */}
      <GlassCard className="space-y-2 p-3.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-muted">سرمایه اولیه ($)</label>
            <Input dir="ltr" type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} className="h-9 text-xs text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-muted">مدت (روز)</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="glass-inset h-9 w-full rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
              {DAYS_OPTIONS.map((d) => <option key={d} value={d}>{d} روز</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-muted">سطح ایمنی</label>
            <select value={safety} onChange={(e) => setSafety(e.target.value as SafetyLevel)} className="glass-inset h-9 w-full rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
              {(Object.keys(SAFETY_LABEL) as SafetyLevel[]).map((s) => (
                <option key={s} value={s}>{SAFETY_LABEL[s]} (HF≥{hfMin})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-muted">سناریو Reward</label>
            <select value={rewardMult} onChange={(e) => setRewardMult(Number(e.target.value) as 1 | 0.5 | 1.5)} className="glass-inset h-9 w-full rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
              <option value={0.5}>محافظه‌کارانه (۵۰٪)</option>
              <option value={1}>پایه (۱۰۰٪)</option>
              <option value={1.5}>خوش‌بینانه (۱۵۰٪)</option>
            </select>
          </div>
        </div>

        {/* پارامترهای کاربر — چون API عمومی ندارد */}
        <div className="rounded-xl border border-warn/15 bg-warn/5 p-2">
          <p className="mb-1.5 text-[9px] font-bold text-warn">
            ⚠ Borrow APY / LTV / Liquidation Threshold از API عمومی DeFiLlama در دسترس نیست — ورودی کاربر (برآورد بر اساس داده فعلی)
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">LTV (مثلاً 0.75 یا 75)</label>
              <Input dir="ltr" value={ltv} onChange={(e) => setLtv(e.target.value)} className="h-8 text-[10px] text-start" />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">Liquidation Threshold</label>
              <Input dir="ltr" value={lt} onChange={(e) => setLt(e.target.value)} className="h-8 text-[10px] text-start" />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">Borrow APY (درصد یا اعشار)</label>
              <Input dir="ltr" value={borrowApy} onChange={(e) => setBorrowApy(e.target.value)} className="h-8 text-[10px] text-start" />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">Borrow Incentive (پاداش)</label>
              <Input dir="ltr" value={borrowReward} onChange={(e) => setBorrowReward(e.target.value)} className="h-8 text-[10px] text-start" />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">Gas/Loop ($)</label>
              <Input dir="ltr" value={gasPerLoop} onChange={(e) => setGasPerLoop(e.target.value)} className="h-8 text-[10px] text-start" />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">Slippage ($)</label>
              <Input dir="ltr" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="h-8 text-[10px] text-start" />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ===== Reference (مرجع DeFiLlama — بدون تعدیل) ===== */}
      <GlassCard className="p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-ink">
          <Repeat className="h-3.5 w-3.5 text-accent" /> Reference — مرجع DeFiLlama ({result.reference.loops ?? '—'} حلقه)
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold sm:grid-cols-3">
          <div className="rounded-lg border border-line/10 bg-surface-2/50 p-2">
            <p className="text-muted">LTV</p>
            <p className="num-ltr text-ink">{ltv ? `${(parseLtvInput(ltv) ?? 0) * 100}٪` : 'N/A'}</p>
          </div>
          <div className="rounded-lg border border-accent/25 bg-accent-soft/50 p-2 dark:bg-accent/10">
            <p className="text-muted">Leverage مرجع</p>
            <p className="num-ltr text-[13px] font-black text-accent">{fmtLev(result.reference.leverage)}</p>
          </div>
          <div className="rounded-lg border border-line/10 bg-surface-2/50 p-2">
            <p className="text-muted">Total Supply</p>
            <p className="num-ltr text-ink">{result.reference.totalSupply !== null ? fmtUSD(result.reference.totalSupply) : 'N/A'}</p>
          </div>
          <div className="rounded-lg border border-line/10 bg-surface-2/50 p-2">
            <p className="text-muted">Total Borrow</p>
            <p className="num-ltr text-ink">{result.reference.totalBorrow !== null ? fmtUSD(result.reference.totalBorrow) : 'N/A'}</p>
          </div>
          <div className="rounded-lg border border-line/10 bg-surface-2/50 p-2">
            <p className="text-muted">Effective Supply APY</p>
            <p className="num-ltr text-ink">{fmtPct(result.reference.effectiveSupplyApy * 100)}</p>
          </div>
          <div className="rounded-lg border border-line/10 bg-surface-2/50 p-2">
            <p className="text-muted">Net Borrow APY</p>
            <p className="num-ltr text-ink">
              {result.reference.netBorrowApy !== null ? fmtPct(result.reference.netBorrowApy * 100) : 'N/A'}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-positive/8 px-2.5 py-2">
          <p className="text-[10px] font-black text-ink">Looped APY مرجع (سالانه)</p>
          <p className={cn('num-ltr text-[14px] font-black', (result.reference.loopedApy ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
            {result.reference.loopedApy !== null ? fmtPct(result.reference.loopedApy * 100) : 'N/A'}
          </p>
        </div>
        <p className="mt-1.5 text-[8px] font-medium leading-4 text-muted">
          فرمول مرجع: Supply×Leverage − NetBorrow×(Leverage−1) — بدون Gas/Slippage (خالص DeFiLlama). Reward قبلاً در Supply لحاظ شده و دوباره جمع نمی‌شود.
        </p>
      </GlassCard>

      {/* ===== Risk (جدا از Reference) ===== */}
      <GlassCard variant="soft" className="p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-ink">
          <Gauge className="h-3.5 w-3.5 text-accent" /> Risk — وضعیت در نقطه پیشنهادی
        </p>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
          <div className="rounded-lg border border-line/10 bg-card p-2 shadow-card">
            <p className="text-muted">Health Factor</p>
            <p className={cn('num-ltr text-[13px] font-black', (result.risk.healthFactor ?? 2) >= 1.5 ? 'text-ink' : 'text-negative')}>
              {result.risk.healthFactor !== null ? result.risk.healthFactor.toFixed(2) : 'N/A'}
            </p>
          </div>
          <div className="rounded-lg border border-line/10 bg-card p-2 shadow-card">
            <p className="text-muted">سطح ریسک</p>
            <p
              className={cn(
                'text-[13px] font-black',
                result.risk.riskLevel === 'low' ? 'text-positive' :
                result.risk.riskLevel === 'moderate' ? 'text-warn' :
                result.risk.riskLevel === 'unknown' ? 'text-muted' : 'text-negative'
              )}
            >
              {RISK_LEVEL_FA[result.risk.riskLevel]}
            </p>
          </div>
          <div className="rounded-lg border border-line/10 bg-card p-2 shadow-card">
            <p className="text-muted">فاصله تا لیکوییدیشن</p>
            <p className="num-ltr text-[13px] font-black text-ink">
              {result.risk.liquidationDistancePct !== null ? `${result.risk.liquidationDistancePct.toFixed(1)}٪` : 'N/A'}
            </p>
          </div>
        </div>

        {/* Stress Test */}
        {stress.length > 0 && (
          <>
            <p className="mb-1.5 mt-2.5 flex items-center gap-1.5 text-[10px] font-black text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Stress Test — افت قیمت Collateral
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {stress.map((s) => (
                <div
                  key={s.dd}
                  className={cn(
                    'rounded-lg px-1.5 py-1.5 text-center',
                    s.risk === 'ok' ? 'bg-positive/10' : s.risk === 'warning' ? 'bg-warn/10' : 'bg-negative/10'
                  )}
                >
                  <p className="text-[8px] font-bold text-muted">{s.dd === 0 ? 'فعلی' : `${s.dd}٪-`}</p>
                  <p className={cn('num-ltr text-[10px] font-black', s.risk === 'ok' ? 'text-positive' : s.risk === 'warning' ? 'text-warn' : 'text-negative')}>
                    {s.hf !== null ? s.hf.toFixed(2) : 'N/A'}
                  </p>
                  <p className={cn('text-[7px] font-bold', s.risk === 'ok' ? 'text-positive' : s.risk === 'warning' ? 'text-warn' : 'text-negative')}>
                    {s.risk === 'ok' ? 'OK' : s.risk === 'warning' ? 'هشدار' : 'لیکوییدیشن'}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[8px] font-medium text-muted">
              برای Collateral استیبل (همان واحد حساب) حساسیت قیمت صفر است؛ برای ETH/USDC افت مستقیم روی HF اثر می‌گذارد. برآورد است — تضمینی نیست.
            </p>
          </>
        )}
      </GlassCard>

      {/* ===== Recommendation (جدا از Reference) ===== */}
      <GlassCard className="p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-ink">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Recommendation — توصیه ایمن
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line/10 bg-surface-2/50 px-2.5 py-2 text-[10px] font-bold">
          <span className="text-muted">
            Loop پیشنهادی: <span className="text-positive">{result.recommendation.recommendedLoops} گام</span>
            {result.recommendation.maxSafeLoops > result.recommendation.recommendedLoops && (
              <span className="text-muted"> · حداکثر ممکن با HF≥{hfMin}: {result.recommendation.maxSafeLoops} گام</span>
            )}
          </span>
          <span className="text-muted">
            Leverage پیشنهادی: <span className="num-ltr text-accent">{fmtLev(result.recommendation.recommendedLeverage)}</span>
          </span>
          <span className="text-muted">
            در مقابل مرجع: <span className="num-ltr text-ink">{fmtLev(result.reference.leverage)}</span>
          </span>
        </div>
        <p className="mt-2 text-[8px] font-medium leading-4 text-muted">
          ⚠ «مرجع» (۵ حلقه DeFiLlama) یک عدد خالص اقتصادی است — نه تضمین ایمنی. «توصیه» بر اساس Health Factor و سطح ایمنی شما جدا محاسبه می‌شود.
        </p>
        {result.recommendation.reason && (
          <p className="mt-1 text-[8px] font-medium leading-4 text-warn/90">⛔ {result.recommendation.reason}</p>
        )}
      </GlassCard>

      {/* جدول Loop — نقطه پیشنهادی */}
      <GlassCard variant="soft" className="p-3">
        <p className="mb-2 text-[11px] font-black text-ink">جدول Loop (توصیه‌شده)</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[9px]">
            <thead>
              <tr className="text-muted">
                {['Loop', 'Supply', 'Borrow', 'Total Supply', 'Total Borrow', 'Leverage', 'HF', 'وضعیت'].map((h) => (
                  <th key={h} className="px-1.5 py-1 text-end font-black first:text-start">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.steps.map((s) => (
                <tr key={s.loop} className="border-t border-line/5">
                  <td className="px-1.5 py-1.5 font-extrabold text-ink">#{s.loop}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end">{fmtUSD(s.supply)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end">{fmtUSD(s.borrow)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end font-bold">{fmtUSD(s.totalSupply)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end">{fmtUSD(s.totalBorrow)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end font-black text-accent">{s.leverage.toFixed(2)}x</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end">{s.healthFactor !== null ? s.healthFactor.toFixed(2) : 'N/A'}</td>
                  <td className="px-1.5 py-1.5 text-end">
                    <span className={cn('badge ring-1', s.status === 'safe' ? 'bg-positive/10 text-positive ring-positive/20' : 'bg-warn/10 text-warn ring-warn/20')}>
                      {s.status === 'safe' ? 'ایمن' : 'هشدار'}
                    </span>
                  </td>
                </tr>
              ))}
              {result.steps.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-1.5 py-4 text-center text-[10px] font-bold text-muted">
                    حتی یک گام Loop با سطح ایمنی فعلی سازگار نیست — فقط Supply بدون اهرم توصیه می‌شود.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {result.stops.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {result.stops.map((s, i) => (
              <p key={i} className="text-[8px] font-medium text-warn">⛔ {s}</p>
            ))}
          </div>
        )}
        {result.warnings.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {result.warnings.map((w, i) => (
              <p key={i} className="text-[8px] font-medium text-muted">⚠ {w}</p>
            ))}
          </div>
        )}
      </GlassCard>

      {/* خلاصه سود */}
      <GlassCard className="border-accent/30 p-3.5">
        <p className="mb-2 text-[11px] font-black text-ink">خلاصه ({days} روز) — در نقطه پیشنهادی</p>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold sm:grid-cols-4">
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">درآمد Supply</p><p className="num-ltr text-ink">{fmtUSD(result.economics.supplyIncome)}</p></div>
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">درآمد Reward</p><p className="num-ltr text-ink">{fmtUSD(result.economics.rewardIncome)}</p></div>
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">هزینه Borrow</p><p className="num-ltr text-negative">{fmtUSD(result.economics.borrowCost)}</p></div>
          {result.economics.borrowRewardIncome > 0 && (
            <div className="rounded-lg bg-positive/8 p-2"><p className="text-muted">پاداش Borrow</p><p className="num-ltr text-positive">{fmtUSD(result.economics.borrowRewardIncome)}</p></div>
          )}
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">هزینه تأمین مالی (خالص)</p><p className="num-ltr text-negative">{fmtUSD(result.economics.financingCost)}</p></div>
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">هزینه‌های عملیاتی (Gas/Slippage)</p><p className="num-ltr text-negative">{fmtUSD(result.economics.operatingCosts)}</p></div>
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">سود ناخالص</p><p className="num-ltr text-ink">{fmtUSD(result.economics.grossYield)}</p></div>
          <div className="rounded-lg bg-positive/10 p-2"><p className="text-muted">سود خالص</p><p className={cn('num-ltr font-black', result.economics.netProfit >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(result.economics.netProfit)}</p></div>
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">Real ROI</p><p className={cn('num-ltr', result.economics.realRoiPct >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(result.economics.realRoiPct)}</p></div>
          <div className="rounded-lg bg-line/5 p-2"><p className="text-muted">Real APY (کاربر)</p><p className={cn('num-ltr', result.economics.realApy >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(result.economics.realApy * 100)}</p></div>
        </div>
        <p className="mt-1.5 text-[8px] font-medium text-muted">
          Looped APY مرجع ({fmtPct((result.reference.loopedApy ?? 0) * 100)}) ≠ Real APY کاربر ({fmtPct(result.economics.realApy * 100)}) — مرجع بدون هزینه‌های شماست.
        </p>

        {/* جزئیات */}
        <button onClick={() => setShowDetails((s) => !s)} className="mt-2 flex items-center gap-1 text-[9px] font-black text-accent">
          <ChevronDown className={cn('h-3 w-3 transition-transform', showDetails && 'rotate-180')} />
          Show Calculation Details
        </button>
        {showDetails && (
          <div className="mt-2 space-y-1 rounded-xl bg-line/5 p-2.5 text-[9px] font-bold">
            <p className="text-muted">Supply: پایه <span className="num-ltr text-ink">{fmtPct(components.base * 100)}</span> + Reward <span className="num-ltr text-ink">{fmtPct(components.reward * 100)}</span> (×{rewardMult}) = Effective <span className="num-ltr text-ink">{fmtPct(result.reference.effectiveSupplyApy * 100)}</span> — Reward دوباره جمع نمی‌شود</p>
            <p className="text-muted">Borrow: پایه <span className="num-ltr text-ink">{borrowApy}</span> − Incentive <span className="num-ltr text-ink">{borrowReward}</span> = خالص <span className="num-ltr text-ink">{result.reference.netBorrowApy !== null ? fmtPct(result.reference.netBorrowApy * 100) : 'N/A'}</span></p>
            <p className="text-muted">Leverage مرجع = 1 + L + L² + L³ + L⁴ + L⁵ = <span className="num-ltr text-ink">{result.reference.leverage?.toFixed(4)}x</span> (نمایش {fmtLev(result.reference.leverage)})</p>
            <p className="text-muted">Looped APY = Supply×Lev − NetBorrow×(Lev−1) = <span className="num-ltr text-ink">{result.reference.loopedApy !== null ? fmtPct(result.reference.loopedApy * 100) : 'N/A'}</span> (سالانه، بدون هزینه کاربر)</p>
            <p className="text-muted">LTV (کاربر): <span className="num-ltr text-ink">{ltv}</span> · LT (کاربر): <span className="num-ltr text-ink">{lt}</span> · Safety: <span className="text-ink">{SAFETY_LABEL[safety]}</span> (HF≥{hfMin})</p>
            <p className="text-muted">Net Profit = GrossYield − NetFinancing − Operating = <span className="num-ltr text-ink">{fmtUSD(result.economics.netProfit)}</span> · Real APY = (1+Net/Cap)^(365/days) − 1</p>
            <p className="text-muted">میانگین APY ۳۰d: <span className="num-ltr text-ink">{apyStats.avg30d !== null ? fmtPct(apyStats.avg30d) : 'N/A'}</span> · Spike: <span className={apyStats.spikeDetected ? 'text-warn' : 'text-positive'}>{apyStats.spikeDetected ? 'بله — هشدار' : 'خیر'}</span></p>
          </div>
        )}

        <p className="mt-2 flex items-start gap-1 text-[8px] font-medium leading-4 text-muted/70">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          همه نتایج برآورد بر اساس داده فعلی‌اند؛ APY، نرخ Borrow، قیمت Collateral و Health Factor می‌توانند تغییر کنند. هیچ تضمین «ایمن» یا «بدون لیکوییدیشن» وجود ندارد.
        </p>
      </GlassCard>
    </div>
  );
}
