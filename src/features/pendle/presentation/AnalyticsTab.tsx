/**
 * Pendle Analytics & Calculator Engine — UI
 * فقط با وارد کردن سرمایه + انتخاب بازار → همه محاسبات خودکار از Pendle Core API
 * زیربخش‌ها: PT / YT / LP / Real APY / Break-even / مقایسه / امتیاز / بهترین فرصت
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calculator, Target, Scale, BadgeCheck, Scale as ScaleIcon, TrendingUp, Shield, Crown } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
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
  opportunityScore,
  riskScoreOf,
  type PtCalcResult
} from '@/features/pendle/engine/analytics';
import { fmtUSD, fmtPct, fmtInt } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type SubTab = 'pt' | 'yt' | 'lp' | 'real' | 'breakeven' | 'compare';

export function AnalyticsTab() {
  const { markets, prices } = usePendleMarkets();
  const [sub, setSub] = useState<SubTab>('pt');
  const [investment, setInvestment] = useState('10000');
  const [marketId, setMarketId] = useState('');

  const market = markets.find((m) => m.address === marketId) ?? null;

  const tabs: { key: SubTab; label: string; icon: typeof Calculator }[] = [
    { key: 'pt', label: 'PT', icon: Calculator },
    { key: 'yt', label: 'YT', icon: Target },
    { key: 'lp', label: 'LP', icon: Scale },
    { key: 'real', label: 'Real APY', icon: BadgeCheck },
    { key: 'breakeven', label: 'Break-even', icon: ScaleIcon },
    { key: 'compare', label: 'مقایسه', icon: TrendingUp }
  ];

  const invest = Number(investment) || 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)} className={cn('flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold transition-all', sub === t.key ? 'bg-accent text-white shadow-glow' : 'glass-inset text-muted hover:text-ink')}>
            <t.icon className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ورودی: فقط سرمایه + بازار (بقیه خودکار از API) */}
      <GlassCard className="flex items-center gap-2 p-3">
        <div className="w-28">
          <label className="mb-0.5 block text-[8px] font-bold text-muted">سرمایه ($)</label>
          <Input dir="ltr" inputMode="decimal" value={investment} onChange={(e) => setInvestment(e.target.value)} className="h-9 text-xs" />
        </div>
        <div className="min-w-0 flex-1">
          <label className="mb-0.5 block text-[8px] font-bold text-muted">بازار Pendle (خودکار از API)</label>
          <select value={marketId} onChange={(e) => setMarketId(e.target.value)} className="glass-inset h-9 w-full rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
            <option value="">انتخاب بازار…</option>
            {markets.slice(0, 80).map((m) => (
              <option key={m.address} value={m.address}>{m.name} · {fmtExpiry(m.expiry)}</option>
            ))}
          </select>
        </div>
      </GlassCard>

      {!market && (
        <p className="glass-soft rounded-2xl px-4 py-3 text-center text-[10px] font-bold text-muted">
          یک بازار انتخاب کنید — همه قیمت‌ها و نرخ‌ها به‌صورت خودکار از Pendle Core API دریافت می‌شوند
        </p>
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

/* ---------- گرفتن قیمت واقعی PT از API ---------- */
function ptPriceOf(market: PendleMarketView, prices: Record<string, number>): number | null {
  const p = prices[market.pt];
  return typeof p === 'number' && p > 0 ? p : null;
}

/**
 * قیمت بازخرید PT در سررسید = قیمت لحظه‌ای دارایی پایه (از API).
 * این مقدار برای محاسبه ارزش نهایی حیاتی است: برای استیبل‌ها ≈ ۱ دلار
 * است ولی برای xStocks/سهام توکن‌ایز قیمت سهم است (مثلاً ~۹۴ دلار).
 * اگر API قیمت پایه را ندهد → null (هرگز فرض نمی‌کنیم).
 */
function redemptionPriceOf(market: PendleMarketView, prices: Record<string, number>): number | null {
  const p = prices[market.underlyingAsset];
  return typeof p === 'number' && p > 0 ? p : null;
}

/* ---------- PT Calculator (مرحله ۱) ---------- */

/** آیا دارایی پایه بازار استیبل است؟ (برای فرض بازخرید ۱ دلار) */
const STABLECOIN_RE = /USDC|USDT|DAI|USDE|FDUSD|USDS|PYUSD|USD0|USR|TUSD|sUSDe|syrupUSDC|USDTB/i;

function PtSection({ investment, market, prices }: { investment: number; market: PendleMarketView; prices: Record<string, number> }) {
  const ptPrice = ptPriceOf(market, prices);
  const redemption = redemptionPriceOf(market, prices);
  const days = Math.max(1, market.daysToExpiry ?? 90);

  const r: PtCalcResult | null = useMemo(() => {
    // بدون قیمت PT → N/A (هرگز عدد ثابت نمی‌زنیم)
    if (ptPrice === null) return null;
    // بدون قیمت بازخرید: فقط برای استیبل‌ها می‌توان ۱ دلار فرض کرد؛
    // برای دارایی غیراستیبل (مثل xStocks) بدون قیمت پایه → N/A
    const redemptionKnown =
      redemption !== null || STABLECOIN_RE.test(market.name) || STABLECOIN_RE.test(market.underlyingAsset);
    if (!redemptionKnown) return null;
    return calcPt({
      investment,
      ptPrice,
      maturityIso: market.expiry,
      redemptionPrice: redemption, // null → موتور برای استیبل ۱ دلار فرض می‌کند
      gas: 5,
      swapFeePct: 0.1,
      slippagePct: 0.1
    });
  }, [investment, ptPrice, redemption, market.expiry, market.name, market.underlyingAsset]);

  return (
    <div className="space-y-3">
      <GlassCard className="p-3.5 text-[10px] font-bold text-muted">
        {market.name} · {market.protocol} · {chainName(market.chainId)}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="badge bg-accent/10 text-accent">قیمت PT (زنده): {ptPrice !== null ? fmtUSD(ptPrice) : 'N/A'}</span>
          <span className="badge bg-line/5 text-muted">قیمت بازخرید (دارایی پایه): {redemption !== null ? fmtUSD(redemption) : 'N/A'}</span>
          <span className="badge bg-line/5 text-muted">سررسید: {fmtExpiry(market.expiry)}</span>
          <span className="badge bg-line/5 text-muted">روز باقی‌مانده: {fmtInt(days)}</span>
        </div>
      </GlassCard>

      {r === null ? (
        <GlassCard className="p-4 text-center">
          <p className="text-[11px] font-black text-warn">داده ناکافی</p>
          <p className="mt-1 text-[10px] font-bold text-muted">
            قیمت زنده PT یا دارایی پایه از API در دسترس نیست؛ تا دریافت داده واقعی، اعداد محاسبه نمی‌شوند (هیچ مقداری حدس زده نمی‌شود).
          </p>
        </GlassCard>
      ) : (
        <Flow
          steps={[
            { label: 'قیمت بازخرید (هر PT در سررسید)', value: fmtUSD(r.redemptionPriceUsed), tone: 'accent' },
            { label: 'PT خریداری‌شده', value: `${fmtInt(r.ptAmount)} PT`, tone: 'accent' },
            { label: 'ارزش نهایی در سررسید', value: fmtUSD(r.redeemValueUsd), tone: 'accent' },
            { label: 'سود دلاری (ناخالص)', value: fmtUSD(r.grossProfit), tone: 'pos' },
            { label: 'سود درصدی (ROI)', value: fmtPct(r.roiPct), tone: 'pos' },
            { label: 'Fixed Yield', value: fmtPct(r.fixedYieldPct), tone: 'accent' },
            { label: 'APY (مؤثر)', value: fmtPct(r.effectiveApyPct), tone: 'accent' },
            { label: 'Annualized Return', value: fmtPct(r.annualizedPct) },
            { label: 'Real APY (پس از هزینه)', value: fmtPct(r.realApyPct), tone: 'pos' },
            { label: 'Remaining Days', value: fmtInt(r.holdingDays) }
          ]}
        />
      )}
    </div>
  );
}

/* ---------- YT Calculator (مرحله ۲) ---------- */
function YtSection({ investment, market, prices }: { investment: number; market: PendleMarketView; prices: Record<string, number> }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const underlying = market.underlyingApyPct ?? 0;
  const reward = market.rewardAprPct ?? 0;
  // قیمت YT از API — هرگز تقریب ثابت نمی‌زنیم
  const raw = prices[market.yt];
  const ytPrice = typeof raw === 'number' && raw > 0 ? raw : null;

  const r = ytPrice !== null ? calcYt(investment, ytPrice, underlying, reward, days) : null;
  const ytAmount = ytPrice !== null ? investment / ytPrice : null;

  return (
    <div className="space-y-3">
      <GlassCard className="p-3.5 text-[10px] font-bold text-muted">
        {market.name} · Underlying APY: <span className="text-positive">{fmtPct(underlying)}</span> · Reward APR: <span className="text-positive">{fmtPct(reward)}</span> · {fmtInt(days)} روز
      </GlassCard>
      {r === null || ytAmount === null ? (
        <GlassCard className="p-4 text-center">
          <p className="text-[11px] font-black text-warn">داده ناکافی</p>
          <p className="mt-1 text-[10px] font-bold text-muted">
            قیمت زنده YT از API در دسترس نیست؛ تا دریافت داده واقعی، اعداد محاسبه نمی‌شوند (هیچ مقداری حدس زده نمی‌شود).
          </p>
        </GlassCard>
      ) : (
        <Flow
          steps={[
            { label: 'قیمت YT (زنده)', value: fmtUSD(ytPrice), tone: 'accent' },
            { label: 'مقدار YT', value: `${fmtInt(ytAmount)} YT`, tone: 'accent' },
            { label: 'Underlying Yield', value: fmtUSD(r.yieldIncome), tone: 'pos' },
            { label: 'Reward', value: fmtUSD(r.rewardIncomeUsd), tone: 'pos' },
            { label: 'Total Profit', value: fmtUSD(r.totalIncome), tone: 'pos' },
            { label: 'ROI', value: fmtPct(r.totalReturnPct) },
            { label: 'APY', value: fmtPct(r.totalApyPct), tone: 'accent' },
            { label: 'Break-even APY', value: fmtPct(r.breakEvenApyPct), tone: 'warn' },
            { label: 'Maximum Loss', value: fmtUSD(r.maxLoss), tone: 'neg' }
          ]}
        />
      )}
    </div>
  );
}

/* ---------- LP Calculator (مرحله ۳) ---------- */
function LpSection({ investment, market }: { investment: number; market: PendleMarketView }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const underlying = market.underlyingApyPct ?? 0;
  const ptFixed = market.fixedApyPct ?? 0;
  const swapFee = market.swapFeeApyPct ?? 0;
  const reward = market.rewardAprPct ?? 0;

  const r = calcLp(investment, 1, underlying, ptFixed, swapFee, reward, 0, days);

  return (
    <div className="space-y-3">
      <GlassCard className="p-3.5 text-[10px] font-bold text-muted">
        {market.name}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="badge bg-line/5 text-muted">Underlying: {fmtPct(underlying)}</span>
          <span className="badge bg-line/5 text-muted">PT Fixed: {fmtPct(ptFixed)}</span>
          <span className="badge bg-line/5 text-muted">Fees: {fmtPct(swapFee)}</span>
          <span className="badge bg-line/5 text-muted">Reward: {fmtPct(reward)}</span>
        </div>
      </GlassCard>
      <Flow
        steps={[
          { label: 'LP Amount', value: `${fmtInt(r.lpTokens)} LP`, tone: 'accent' },
          { label: 'Underlying Income', value: fmtUSD(r.underlyingYieldUsd), tone: 'pos' },
          { label: 'Reward Income', value: fmtUSD(r.rewardUsd), tone: 'pos' },
          { label: 'Trading Fee Income', value: fmtUSD(r.tradingFeesUsd), tone: 'pos' },
          { label: 'Total Profit', value: fmtUSD(r.totalUsd), tone: 'pos' },
          { label: 'ROI', value: fmtPct(r.totalUsd / Math.max(investment, 1) * 100) },
          { label: 'APY', value: fmtPct(r.totalApyPct), tone: 'accent' }
        ]}
      />
    </div>
  );
}

/* ---------- Real APY (مرحله ۴ — مهم‌ترین) ---------- */
function RealApySection({ investment, market }: { investment: number; market: PendleMarketView }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const apy = market.fixedApyPct ?? market.totalApyPct ?? 0;

  const gross = (apy / 100) * investment * (days / 365);
  const gas = 5;
  const swap = swapFeeCost(investment, 0.1);
  const slip = slippageCost(investment, 0.1);
  const impact = investment * 0.0005; // 0.05% قیمت‌تأثیر
  const totalFees = gas + swap + slip + impact;
  const net = netProfit(gross, gas, swap, slip + impact);
  const realRoiPct = realRoi(net, investment) * 100;
  const realApyPct = realApy(net, investment, days) * 100;

  return (
    <div className="space-y-3">
      <GlassCard className="border border-positive/25 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-muted">APY نمایشی Pendle (تئوری)</p>
          <p className="num-ltr text-2xl font-black text-muted">{fmtPct(apy)}</p>
        </div>
        <div className="my-2 h-px bg-line/10" />
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-positive">Real APY (سود واقعی)</p>
          <p className="num-ltr text-3xl font-black text-positive">{fmtPct(realApyPct)}</p>
        </div>
        <p className="num-ltr mt-1 text-right text-[10px] font-bold text-muted">Real ROI: {fmtPct(realRoiPct)} · سود خالص: {fmtUSD(net)}</p>
      </GlassCard>

      <Flow
        steps={[
          { label: 'Gross Profit (همه درآمدها)', value: fmtUSD(gross), tone: 'pos' },
          { label: 'Total Fees', value: fmtUSD(totalFees), tone: 'neg' },
          { label: 'Gas', value: fmtUSD(gas), tone: 'neg' },
          { label: 'Swap Fee', value: fmtUSD(swap), tone: 'neg' },
          { label: 'Slippage', value: fmtUSD(slip), tone: 'neg' },
          { label: 'Price Impact', value: fmtUSD(impact), tone: 'neg' },
          { label: 'Net Profit', value: fmtUSD(net), tone: 'pos' },
          { label: 'Real ROI', value: fmtPct(realRoiPct), tone: 'pos' },
          { label: 'Real APY', value: fmtPct(realApyPct), tone: 'accent' }
        ]}
      />
    </div>
  );
}

/* ---------- Break-even (مرحله ۵) ---------- */
function BreakevenSection({ investment, market, prices }: { investment: number; market: PendleMarketView; prices: Record<string, number> }) {
  const days = Math.max(1, market.daysToExpiry ?? 90);
  const apy = market.fixedApyPct ?? 0;
  const gross = (apy / 100) * investment * (days / 365);
  const fees = 5 + swapFeeCost(investment, 0.1) + slippageCost(investment, 0.1) + investment * 0.0005;
  const costs = fees - gross; // هزینه خالص پس از درآمد

  // قیمت سر به سر بر اساس قیمت واقعی PT از API (نه عدد ثابت)
  const ptPrice = ptPriceOf(market, prices);
  const bePrice = ptPrice !== null ? breakEvenTokenPrice(investment, investment / ptPrice) : null;
  const beApy = breakEvenApyPct(Math.max(costs, 0), investment, days);

  return (
    <div className="space-y-3">
      <GlassCard className="p-4">
        <p className="text-[10px] font-bold text-muted">
          نقطه سر به سر برای {market.name} — از اینجا به بعد سود می‌کنید
        </p>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3 py-2.5">
            <span className="text-[10px] font-bold text-muted">Break-even Price (PT)</span>
            <span className="num-ltr text-[14px] font-black text-accent">{bePrice !== null ? fmtUSD(bePrice) : 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3 py-2.5">
            <span className="text-[10px] font-bold text-muted">Break-even APY (برای جبران هزینه‌ها)</span>
            <span className="num-ltr text-[14px] font-black text-warn">{fmtPct(beApy)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3 py-2.5">
            <span className="text-[10px] font-bold text-muted">درآمد پیش‌بینی‌شده ({fmtInt(days)} روز)</span>
            <span className="num-ltr text-[14px] font-black text-positive">{fmtUSD(gross)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3 py-2.5">
            <span className="text-[10px] font-bold text-muted">کل هزینه‌ها (گس/سواپ/تأثیر)</span>
            <span className="num-ltr text-[14px] font-black text-negative">{fmtUSD(fees)}</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------- مقایسه فرصت‌ها (مرحله ۶+۷) ---------- */
function CompareSection({ markets, investment }: { markets: PendleMarketView[]; investment: number }) {
  const navigate = useNavigate();
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (addr: string) => setSel((s) => (s.includes(addr) ? s.filter((x) => x !== addr) : [...s, addr].slice(-5)));

  const selected = markets.filter((m) => sel.includes(m.address));
  const metrics = useMemo(() => compareMarkets(selected, investment), [selected, investment]);

  // امتیاز برای هر بازار منتخب
  const best = metrics.find((m) => m.isBest);

  return (
    <div className="space-y-3">
      <GlassCard className="p-3.5">
        <p className="mb-2 text-[10px] font-bold text-muted">انتخاب ۲-۵ بازار برای مقایسه (با Risk Score):</p>
        <div className="flex flex-wrap gap-1.5">
          {markets.slice(0, 50).map((m) => (
            <button key={m.address} onClick={() => toggle(m.address)} className={cn('badge px-2.5 py-1 ring-1', sel.includes(m.address) ? 'bg-accent/15 text-accent ring-accent/30' : 'bg-line/5 text-muted ring-line/10')}>
              {m.name.slice(0, 14)}
            </button>
          ))}
        </div>
      </GlassCard>

      {best && (
        <GlassCard className="border border-positive/30 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-black text-positive">
            <Crown className="h-3.5 w-3.5" /> بهترین بازار (بیشترین Real APY)
          </p>
          <p className="mt-1 truncate text-[12px] font-extrabold text-ink">{best.market.name}</p>
          <p className="num-ltr text-[13px] font-black text-positive">
            Real APY: {fmtPct(best.realApyPct)} · امتیاز: {fmtInt(best.opportunityScore)}
          </p>
        </GlassCard>
      )}

      {metrics.length >= 1 && (
        <GlassCard className="overflow-hidden">
          <div className="max-h-[55dvh] overflow-auto">
            <table className="sim-table min-w-[560px] text-start">
              <thead>
                <tr>
                  <th className="!text-start">بازار</th>
                  <th className="!text-start">Profit</th>
                  <th className="!text-start">ROI</th>
                  <th className="!text-start">APY</th>
                  <th className="!text-start">Real APY</th>
                  <th className="!text-start">TVL</th>
                  <th className="!text-start">حجم</th>
                  <th className="!text-start">Reward</th>
                  <th className="!text-start">روز</th>
                  <th className="!text-start">ریسک</th>
                  <th className="!text-start">امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((mt) => (
                  <tr key={mt.market.address} onClick={() => navigate(`/pendle/${mt.market.chainId}/${mt.market.address}`)} className={cn('cursor-pointer', mt.isBest && 'bg-positive/[0.06]')}>
                    <td className="max-w-[120px]">
                      <span className="truncate text-[11px] font-extrabold text-ink">{mt.market.name.slice(0, 14)}</span>
                      {mt.isBest && <span className="badge ms-1 bg-positive/10 text-positive">★</span>}
                    </td>
                    <td className="num-ltr text-[11px] font-bold text-positive">{fmtUSD(mt.profit)}</td>
                    <td className="num-ltr text-[11px]">{fmtPct(mt.roiPct)}</td>
                    <td className="num-ltr text-[11px] font-bold text-accent">{fmtPct(mt.apyPct)}</td>
                    <td className="num-ltr text-[11px] font-black text-positive">{fmtPct(mt.realApyPct)}</td>
                    <td className="num-ltr text-[11px] text-muted">{fmtUSD(mt.tvl, true)}</td>
                    <td className="num-ltr text-[11px] text-muted">{fmtUSD(mt.volume, true)}</td>
                    <td className="num-ltr text-[11px]">{fmtPct(mt.rewardAprPct)}</td>
                    <td className="num-ltr text-[11px] text-muted">{fmtInt(mt.remainingDays)}</td>
                    <td className="num-ltr text-[11px]">{fmtInt(mt.riskScore)}</td>
                    <td className="num-ltr text-[11px] font-black text-info">{fmtInt(mt.opportunityScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

/* ---------- جریان نمایشی ---------- */
function Flow({ steps }: { steps: { label: string; value: string; tone?: 'pos' | 'neg' | 'accent' | 'warn' }[] }) {
  return (
    <GlassCard className="space-y-1.5 p-4">
      {steps.map((s, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3 py-2">
          <span className="text-[10px] font-bold text-muted">{s.label}</span>
          <span className={cn('num-ltr text-[13px] font-black', s.tone === 'pos' ? 'text-positive' : s.tone === 'neg' ? 'text-negative' : s.tone === 'accent' ? 'text-accent' : s.tone === 'warn' ? 'text-warn' : 'text-ink')}>
            {s.value}
          </span>
        </motion.div>
      ))}
    </GlassCard>
  );
}

export { opportunityScore as _os, riskScoreOf as _risk };
