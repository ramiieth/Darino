/**
 * فرصت‌های Boros (Part 33/18) — Long و Short کاملاً جدا (هرگز PnL یکسان)
 *  - Best Long / Best Short فقط با Expected Net PnL > 0 (Status = Potential)
 *  - اگر Net منفی → Status: Not Attractive — در Best قرار نمی‌گیرد
 *  - نمایش: Fixed APR / Current Underlying / Rate Edge / Gross / Costs / Net / Break-Even / Margin / Risk / Confidence / Status
 *  - هیچ BUY/SELL/ENTER — فقط تحلیلی
 */
import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { fmtPct, fmtUSD, fmtInt } from '@/shared/utils/formatters';
import {
  rankUserCapitalOpportunities,
  DEFAULT_SIMULATION_COLLATERAL_ETH
} from '@/features/boros/domain/collateral';
import { UserCapitalCard } from './UserCapitalCard';
import { BorosCalculationEngine, explainOpportunity, type MarketAnalysis } from '@/features/boros/domain/calc';
import type { BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

const STATUS_LABEL: Record<string, string> = {
  potential: 'فرصت بالقوه',
  conditional: 'فرصت مشروط',
  'not-attractive': 'جذاب نیست',
  'insufficient-data': 'داده ناکافی',
  'anomaly-detected': 'ناهنجاری نرخ'
};

const STATUS_CLASS: Record<string, string> = {
  potential: 'bg-positive/10 text-positive ring-positive/20',
  conditional: 'bg-info/10 text-info ring-info/20',
  'not-attractive': 'bg-warn/10 text-warn ring-warn/20',
  'insufficient-data': 'bg-line/5 text-muted ring-line/10',
  'anomaly-detected': 'bg-negative/10 text-negative ring-negative/20'
};

function OppCard({
  rank,
  a,
  side
}: {
  rank: number;
  a: MarketAnalysis;
  side: 'long' | 'short';
}) {
  const isLong = side === 'long';
  const score = isLong ? a.longScore : a.shortScore;
  const spread = isLong ? a.longSpread : a.shortSpread;
  const gross = isLong ? a.grossLongPnl : a.grossShortPnl;
  const net = isLong ? a.totalLongPnl : a.totalShortPnl;
  const be = isLong ? a.breakEvenLong : a.breakEvenShort;
  const status = isLong ? a.statusLong : a.statusShort;
  const roiMargin = isLong ? a.roiLongMargin : a.roiShortMargin;
  const fixedApr = a.impliedApr;
  const underlying = a.underlyingApr;
  const feesTotal = a.fees?.total ?? null;

  const positive = spread >= 0;
  const why: string[] = [];
  if (Math.abs(spread) > 0.005) {
    why.push(
      isLong
        ? `نرخ شناور ${positive ? 'بالاتر' : 'پایین‌تر'} از نرخ ثابت (${fmtPct(spread * 100)})`
        : `نرخ ثابت ${positive ? 'بالاتر' : 'پایین‌تر'} از نرخ شناور (${fmtPct(spread * 100)})`
    );
  }
  if (a.liquidityScore > 0.6) why.push('نقدشوندگی خوب');
  if ((a.volatility ?? 1) < 0.01) why.push('نوسان پایدار');
  if (a.zScore !== null && Math.abs(a.zScore) > 2) why.push(`Z-Score ${a.zScore.toFixed(1)} (Extreme)`);
  if (a.riskLevel === 'کم') why.push('ریسک پایین');

  return (
    <GlassCard variant="soft" className="p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="tnum w-6 shrink-0 text-center text-[14px] font-black text-muted/60">#{rank}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-extrabold text-ink">
            {a.asset} <span className="text-muted">· {a.venue}</span>
          </p>
          <p className="num-ltr text-[9px] font-medium text-muted">
            سررسید {new Date(a.maturity * 1000).toLocaleDateString('fa-IR')} · {a.daysToMaturity} روز
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="num-ltr text-[15px] font-black text-accent">{Math.round(score)}/100</p>
          <p className="text-[8px] font-bold text-muted">{isLong ? 'Long Score' : 'Short Score'}</p>
        </div>
      </div>

      {/* Part 18 — فیلدهای کلیدی */}
      <div className="mt-2 space-y-1 rounded-2xl bg-line/5 p-2.5 text-[10px] font-bold">
        <div className="flex justify-between text-muted"><span>نرخ ثابت (Fixed APR)</span><span className="num-ltr text-ink">{fmtPct(fixedApr * 100)}</span></div>
        <div className="flex justify-between text-muted"><span>نرخ شناور فعلی (Underlying)</span><span className="num-ltr text-ink">{fmtPct(underlying * 100)}</span></div>
        <div className="flex justify-between">
          <span className="text-muted">Rate Edge ({isLong ? 'Long' : 'Short'} Spread)</span>
          <span className={cn('num-ltr font-black', positive ? 'text-positive' : 'text-negative')}>
            {positive ? '+' : ''}{fmtPct(spread * 100)}
          </span>
        </div>
        <div className="flex justify-between text-muted">
          <span>سود ناخالص پایه (Gross)</span>
          <span className={cn('num-ltr font-black', gross >= 0 ? 'text-positive' : 'text-negative')}>
            {gross >= 0 ? '+' : ''}{fmtUSD(gross)}
          </span>
        </div>
        <div className="flex justify-between text-muted">
          <span>هزینه‌های تخمینی</span>
          <span className="num-ltr text-ink">{feesTotal !== null ? fmtUSD(feesTotal) : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink">سود خالص پایه (Net)</span>
          <span className={cn('num-ltr font-black', net >= 0 ? 'text-positive' : 'text-negative')}>
            {net >= 0 ? '+' : ''}{fmtUSD(net)}
          </span>
        </div>
        <div className="flex justify-between text-muted">
          <span>حداقل لبه اقتصادی (Min Edge)</span>
          <span className="num-ltr text-warn">{fmtUSD(a.minEconomicEdge)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">لبه اقتصادی (Net − Min Edge)</span>
          <span className={cn('num-ltr font-black', net - a.minEconomicEdge >= 0 ? 'text-positive' : 'text-negative')}>
            {net - a.minEconomicEdge >= 0 ? '+' : ''}{fmtUSD(net - a.minEconomicEdge)}
          </span>
        </div>
        <div className="flex justify-between text-muted">
          <span>نقطه سر به سر</span>
          <span className="num-ltr text-ink">{be !== null ? fmtPct(be * 100) : 'N/A'}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>مارجین</span>
          <span className="num-ltr text-ink">{fmtUSD(a.marginRequired)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>ROI مارجین (پایه)</span>
          <span className={cn('num-ltr font-black', (roiMargin ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(roiMargin)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>ریسک / اطمینان</span>
          <span className={cn('num-ltr font-black', a.riskLevel === 'کم' ? 'text-positive' : a.riskLevel === 'متوسط' ? 'text-warn' : 'text-negative')}>
            {a.riskLevel} · {a.confidence}٪
          </span>
        </div>
        {/* Liquidation APR ویژگی Position است — بدون Position واقعی N/A */}
        <div
          className="flex justify-between"
          title="Liquidation Implied APR فقط با Position و Collateral واقعی در Boros قابل محاسبه است — در Scanner بازار همیشه N/A است"
        >
          <span className="text-muted">Liquidation APR (Position)</span>
          <span className="badge bg-line/5 text-muted ring-1 ring-line/10">N/A — نیازمند Position</span>
        </div>
      </div>

      {/* سناریو Stress (Bear/Base/Bull) */}
      {a.stress.available && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-[8px] font-bold">
          {[
            { l: 'Bear', v: a.stress.bearNet },
            { l: 'Base', v: a.stress.baseNet },
            { l: 'Bull', v: a.stress.bullNet }
          ].map((x) => (
            <div key={x.l} className="rounded-lg bg-line/5 px-1.5 py-1 text-center">
              <p className="text-muted">{x.l}</p>
              <p className={cn('num-ltr', (x.v ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                {x.v !== null ? `${x.v >= 0 ? '+' : ''}${fmtUSD(x.v)}` : 'N/A'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Status + Robustness + Anomaly */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn('badge ring-1', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
        <span className="badge bg-line/5 text-muted ring-1 ring-line/10">
          {a.robustness === 'robust' ? 'پایدار' : a.robustness === 'conditional' ? 'مشروط' : a.robustness === 'not-attractive' ? 'ناپایدار' : 'N/A'}
        </span>
        {a.anomaly.detected && (
          <span className="badge bg-negative/10 text-negative ring-1 ring-negative/20">
            ⚠ {a.anomaly.kind === 'extreme-dislocation' ? 'انحراف شدید نرخ' : a.anomaly.kind === 'thin-liquidity' ? 'نقدشوندگی کم' : a.anomaly.kind === 'near-expiry' ? 'نزدیک سررسید' : 'داده کهنه'}
          </span>
        )}
        {!a.liquidity.executable && a.liquidity.available && (
          <span className="badge bg-warn/10 text-warn ring-1 ring-warn/20">قابل اجرا نیست (حجم)</span>
        )}
        {why.map((w, i) => (
          <span key={i} className="badge bg-line/5 text-muted ring-1 ring-line/10">{w}</span>
        ))}
      </div>

      {/* دلایل Anomaly */}
      {a.anomaly.detected && a.anomaly.reasons.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {a.anomaly.reasons.map((r, i) => (
            <p key={i} className="text-[8px] font-medium leading-4 text-negative/80">⚠ {r}</p>
          ))}
        </div>
      )}

      {/* چرا؟ — Reason Engine */}
      <div className="mt-2 rounded-2xl bg-line/5 p-2">
        <p className="text-[9px] font-black text-ink">
          {status === 'potential' || status === 'conditional' ? 'چرا این بازار؟' : 'چرا جذاب نیست؟'}
        </p>
        <div className="mt-1 space-y-0.5">
          {explainOpportunity(a).positive.slice(0, 3).map((r, i) => (
            <p key={'p' + i} className="flex items-start gap-1 text-[8px] font-medium leading-4 text-positive/90">
              <span>✓</span> {r.text}
            </p>
          ))}
          {explainOpportunity(a).negative.slice(0, 3).map((r, i) => (
            <p key={'n' + i} className="flex items-start gap-1 text-[8px] font-medium leading-4 text-negative/80">
              <span>✗</span> {r.text}
            </p>
          ))}
        </div>
        <p className="mt-1 text-[8px] font-medium leading-4 text-muted/80">{explainOpportunity(a).summary}</p>
      </div>
    </GlassCard>
  );
}

export function OpportunitiesTab({ markets }: { markets: BorosMarket[] }) {
  const [assetFilter, setAssetFilter] = useState('همه');
  const [venueFilter, setVenueFilter] = useState('همه');
  /** Simulation Collateral (ETH) — فقط شبیه‌سازی، هرگز واقعی نمایش داده نمی‌شود */
  const [simCollateral, setSimCollateral] = useState(DEFAULT_SIMULATION_COLLATERAL_ETH);
  const [userDir, setUserDir] = useState<'long' | 'short' | 'both'>('both');
  /** قیمت Collateral از اولین بازار ETH (برای تبدیل واحد) — فالبک ۰ */
  const ethPrice = markets.find((m) => m.asset === 'ETH')?.assetMarkPrice ?? 0;

  /** فرصت‌های کاربر-آگاه: با Collateral شبیه‌سازی (رتبه‌بندی چندبعدی) */
  const userOpps = useMemo(() => {
    if (!(simCollateral > 0) || !(ethPrice > 0)) return [];
    return rankUserCapitalOpportunities(markets, simCollateral, ethPrice, {
      direction: userDir === 'both' ? undefined : userDir
    });
  }, [markets, simCollateral, ethPrice, userDir]);

  const assets = useMemo(() => ['همه', ...new Set(markets.map((m) => m.asset))], [markets]);
  const venues = useMemo(() => ['همه', ...new Set(markets.map((m) => m.venue))], [markets]);

  const rows = useMemo(() => {
    const filtered = markets.filter(
      (m) => (assetFilter === 'همه' || m.asset === assetFilter) && (venueFilter === 'همه' || m.venue === venueFilter)
    );
    // analyzeAll: فقط موارد valid (Eligibility Filter — Part 17)
    return BorosCalculationEngine.analyzeAll(filtered, 1000);
  }, [markets, assetFilter, venueFilter]);

  // Best Long: فقط Status = potential (Net > 0)
  const bestLong = useMemo(
    () =>
      rows
        .filter((a) => a.statusLong === 'potential' && !a.anomaly.detected)
        .sort((x, y) => y.longScore - x.longScore)
        .slice(0, 3),
    [rows]
  );
  const bestShort = useMemo(
    () =>
      rows
        .filter((a) => a.statusShort === 'potential' && !a.anomaly.detected)
        .sort((x, y) => y.shortScore - x.shortScore)
        .slice(0, 3),
    [rows]
  );

  const noPositiveLong = rows.length > 0 && bestLong.length === 0;
  const noPositiveShort = rows.length > 0 && bestShort.length === 0;

  return (
    <div className="space-y-4">
      {/* ===== Simulation Collateral — ورودی کاربر ===== */}
      <GlassCard className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-[9px] font-bold text-muted">
              Simulation Collateral <ProvenanceBadge kind="simulated" />
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.001"
                min="0"
                value={simCollateral}
                onChange={(e) => setSimCollateral(Number(e.target.value) || 0)}
                className="h-9 w-28 rounded-xl border border-line/15 bg-card px-2 text-[11px] font-bold text-ink shadow-card outline-none hover:border-line/25 focus:border-accent/50"
              />
              <span className="text-[11px] font-black text-ink">ETH</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">جهت ارزیابی</label>
            <div className="flex gap-1 rounded-xl bg-surface-2/70 p-0.5">
              {(['both', 'long', 'short'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setUserDir(d)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[9px] font-black transition-colors',
                    userDir === d ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
                  )}
                >
                  {d === 'both' ? 'هر دو' : d === 'long' ? 'لانگ' : 'شورت'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 ps-0 sm:ms-auto">
            <select value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)} className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
              {assets.map((a) => <option key={a}>{a}</option>)}
            </select>
            <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
              {venues.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-1.5 text-[8px] font-medium leading-4 text-muted">
          ⚠ این مقدار فقط «Simulation Collateral» است — نه واریز واقعی، نه موجودی آن‌چین. برای هر بازار، Max Notional قابل‌دستیابی، Margin، Fees و PnL با همین Collateral محاسبه می‌شود.
        </p>
      </GlassCard>

      {/* ===== بهترین فرصت‌ها برای سرمایه شما (User Capital) ===== */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink">
          <Wallet className="h-4 w-4 text-accent" /> بهترین فرصت‌ها برای سرمایه شما ({simCollateral.toFixed(3)} ETH)
        </h3>
        {userOpps.length === 0 ? (
          <GlassCard variant="soft" className="p-5 text-center text-[11px] font-bold text-muted">
            {simCollateral <= 0 || !(ethPrice > 0)
              ? 'Collateral معتبر وارد کنید (ETH)'
              : 'با این Collateral هیچ فرصت قابل‌اجرایی با Net PnL مثبت یافت نشد (فیلترها: بدون ناهنجاری + قابل اجرا + Edge مثبت)'}
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {userOpps.slice(0, 5).map((o, i) => <UserCapitalCard key={`${o.marketId}-${o.direction}`} o={o} rank={i + 1} />)}
          </div>
        )}
      </section>

      {/* ===== Market Intelligence (بدون Collateral — همیشه فعال) ===== */}
      <section className="border-t border-line/10 pt-3">
        <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <Sparkles className="h-4 w-4 text-muted" /> فرصت‌های بازار (Market Intelligence — بدون Collateral)
        </h3>
        <p className="mb-2 text-[8px] font-medium text-muted">
          تحلیل خالص بازار (Spread/PnL/ریسک) — مستقل از سرمایه شما؛ Liquidation APR در این سطح N/A است.
        </p>
      </section>

      {/* ===== Best Long ===== */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink">
          <TrendingUp className="h-4 w-4 text-positive" /> بهترین فرصت‌های لانگ
        </h3>
        {bestLong.length === 0 ? (
          <GlassCard variant="soft" className="p-5 text-center text-[11px] font-bold text-muted">
            {noPositiveLong ? 'No Positive Expected Opportunity — فرصت لانگ با سود خالص مثبت وجود ندارد' : 'بازاری یافت نشد'}
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {bestLong.map((a, i) => <OppCard key={a.marketId} rank={i + 1} a={a} side="long" />)}
          </div>
        )}
      </section>

      {/* ===== Best Short ===== */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink">
          <TrendingDown className="h-4 w-4 text-negative" /> بهترین فرصت‌های شورت
        </h3>
        {bestShort.length === 0 ? (
          <GlassCard variant="soft" className="p-5 text-center text-[11px] font-bold text-muted">
            {noPositiveShort ? 'No Positive Expected Opportunity — فرصت شورت با سود خالص مثبت وجود ندارد' : 'بازاری یافت نشد'}
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {bestShort.map((a, i) => <OppCard key={a.marketId} rank={i + 1} a={a} side="short" />)}
          </div>
        )}
      </section>

      {/* ===== جدول کامل ===== */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <Sparkles className="h-4 w-4 text-accent" /> همه بازارها ({fmtInt(rows.length)})
        </h3>
        <GlassCard variant="soft" className="overflow-x-auto p-2">
          <table className="w-full min-w-[760px] text-[9px]">
            <thead>
              <tr className="text-muted">
                <th className="px-1.5 py-1 text-start font-black">بازار</th>
                <th className="px-1.5 py-1 text-end font-black">Fixed</th>
                <th className="px-1.5 py-1 text-end font-black">Underlying</th>
                <th className="px-1.5 py-1 text-end font-black">Long Spread</th>
                <th className="px-1.5 py-1 text-end font-black">Short Spread</th>
                <th className="px-1.5 py-1 text-end font-black">Long Net</th>
                <th className="px-1.5 py-1 text-end font-black">Short Net</th>
                <th className="px-1.5 py-1 text-end font-black">Long</th>
                <th className="px-1.5 py-1 text-end font-black">Short</th>
                <th className="px-1.5 py-1 text-end font-black">ریسک</th>
                <th className="px-1.5 py-1 text-end font-black">وضعیت Long</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((a) => (
                <tr key={a.marketId} className="border-t border-line/5">
                  <td className="px-1.5 py-1.5">
                    <p className="font-extrabold text-ink">{a.asset} · {a.venue}</p>
                    <p className="num-ltr text-[7px] text-muted">{a.daysToMaturity} روز · {new Date(a.maturity * 1000).toLocaleDateString('fa-IR')}</p>
                  </td>
                  <td className="num-ltr px-1.5 py-1.5 text-end text-ink">{fmtPct(a.impliedApr * 100)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end text-ink">{fmtPct(a.underlyingApr * 100)}</td>
                  <td className={cn('num-ltr px-1.5 py-1.5 text-end font-black', a.longSpread >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(a.longSpread * 100)}</td>
                  <td className={cn('num-ltr px-1.5 py-1.5 text-end font-black', a.shortSpread >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(a.shortSpread * 100)}</td>
                  <td className={cn('num-ltr px-1.5 py-1.5 text-end font-black', a.totalLongPnl >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(a.totalLongPnl)}</td>
                  <td className={cn('num-ltr px-1.5 py-1.5 text-end font-black', a.totalShortPnl >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(a.totalShortPnl)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end font-black text-accent">{Math.round(a.longScore)}</td>
                  <td className="num-ltr px-1.5 py-1.5 text-end font-black text-info">{Math.round(a.shortScore)}</td>
                  <td className={cn('px-1.5 py-1.5 text-end font-black', a.riskLevel === 'کم' ? 'text-positive' : a.riskLevel === 'متوسط' ? 'text-warn' : 'text-negative')}>{a.riskLevel}</td>
                  <td className="px-1.5 py-1.5 text-end">
                    <span className={cn('badge ring-1', STATUS_CLASS[a.statusLong])}>{STATUS_LABEL[a.statusLong]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </section>

      {/* چرا این رتبه؟ — برای ۳ بازار برتر Economic Edge */}
      <section>
        <h3 className="mb-2 text-[12px] font-black text-ink">چرا این رتبه؟ (بر اساس Economic Edge — نه Spread)</h3>
        <div className="space-y-2">
          {rows
            .slice()
            .sort((x, y) => (y.totalLongPnl - y.minEconomicEdge) - (x.totalLongPnl - x.minEconomicEdge))
            .slice(0, 3)
            .map((a) => {
              const ex = explainOpportunity(a);
              return (
                <GlassCard key={a.marketId} variant="soft" className="p-3">
                  <p className="text-[11px] font-extrabold text-ink">
                    {a.asset} · {a.venue}{' '}
                    <span className={cn('badge ms-1 ring-1', STATUS_CLASS[a.statusLong])}>{STATUS_LABEL[a.statusLong]}</span>
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {ex.positive.slice(0, 2).map((r, i) => (
                      <p key={'p' + i} className="flex items-start gap-1 text-[8px] font-medium leading-4 text-positive/90">
                        <span>✓</span> {r.text}
                      </p>
                    ))}
                    {ex.negative.slice(0, 2).map((r, i) => (
                      <p key={'n' + i} className="flex items-start gap-1 text-[8px] font-medium leading-4 text-negative/80">
                        <span>✗</span> {r.text}
                      </p>
                    ))}
                  </div>
                  <p className="mt-1 text-[8px] font-medium leading-4 text-muted/80">{ex.summary}</p>
                </GlassCard>
              );
            })}
          {rows.length === 0 && (
            <GlassCard variant="soft" className="p-5 text-center text-[11px] font-bold text-muted">
              بازاری یافت نشد
            </GlassCard>
          )}
        </div>
      </section>

      <p className="text-center text-[9px] font-medium text-muted/70">
        Long و Short کاملاً جدا محاسبه می‌شوند (جهت مخالف) · Break-Even خارج از محدوده معتبر → N/A ·
        لبه اقتصادی قابل تنظیم (پیش‌فرض: ۱ دلار یا ۰.۱٪ نotional) · این امتیازها احتمال موفقیت نیستند؛ فقط تحلیل‌اند.
      </p>
    </div>
  );
}
