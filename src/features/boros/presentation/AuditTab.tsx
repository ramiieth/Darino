/**
 * ممیزی Boros — Breakdown کامل هر بازار (شفافیت کامل)
 *  - PnL تفکیکی: Gross Settlement / Realized / Unrealized MTM / Total Gross / Net
 *  - هزینه‌ها خط‌به‌خط با Source (API / Market Data / User Input / N/A)
 *  - Margin مستقل با پارامترهای ورودی
 *  - چهار معیار بازده جدا
 */
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { auditMarkets, type MarketAuditBreakdown } from '@/features/boros/domain/engine/audit';
import { AuditReportTable } from './AuditReportTable';
import type { BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

const SOURCE_LABEL: Record<string, string> = {
  api: 'API',
  'market-data': 'داده بازار',
  'user-input': 'ورودی کاربر',
  na: 'N/A'
};

function AuditRow({ b }: { b: MarketAuditBreakdown }) {
  return (
    <div className="rounded-2xl bg-line/5 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold text-ink">
          {b.asset} · {b.venue} <span className="num-ltr text-[9px] text-muted">({b.daysToMaturity} روز)</span>
        </p>
        <p className="num-ltr text-[9px] font-bold text-muted">
          Fixed {fmtPct(b.fixedApr * 100)} · Floating {fmtPct(b.floatingApr * 100)}
        </p>
      </div>

      {/* PnL تفکیکی */}
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-4">
        <div className="rounded-lg bg-line/5 px-2 py-1"><p className="text-muted">Gross Settlement Long</p><p className={cn('num-ltr', b.grossSettlementLong >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(b.grossSettlementLong)}</p></div>
        <div className="rounded-lg bg-line/5 px-2 py-1"><p className="text-muted">Gross Settlement Short</p><p className={cn('num-ltr', b.grossSettlementShort >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(b.grossSettlementShort)}</p></div>
        <div className="rounded-lg bg-line/5 px-2 py-1"><p className="text-muted">MTM Long (Unrealized)</p><p className="num-ltr text-ink">{fmtUSD(b.unrealizedMtmLong)}</p></div>
        <div className="rounded-lg bg-line/5 px-2 py-1"><p className="text-muted">MTM Short (Unrealized)</p><p className="num-ltr text-ink">{fmtUSD(b.unrealizedMtmShort)}</p></div>
        <div className="rounded-lg bg-line/5 px-2 py-1"><p className="text-muted">Total Gross Long</p><p className={cn('num-ltr', b.totalGrossLong >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(b.totalGrossLong)}</p></div>
        <div className="rounded-lg bg-line/5 px-2 py-1"><p className="text-muted">Total Gross Short</p><p className={cn('num-ltr', b.totalGrossShort >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(b.totalGrossShort)}</p></div>
        <div className="rounded-lg bg-positive/10 px-2 py-1"><p className="text-muted">Net Long</p><p className={cn('num-ltr font-black', b.netLong >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(b.netLong)}</p></div>
        <div className="rounded-lg bg-negative/10 px-2 py-1"><p className="text-muted">Net Short</p><p className={cn('num-ltr font-black', b.netShort >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(b.netShort)}</p></div>
      </div>

      {/* هزینه‌ها با Source */}
      <div className="mt-1.5 space-y-0.5">
        {b.feeLines.map((l) => (
          <div key={l.label} className="flex items-center justify-between text-[9px] font-bold">
            <span className="text-muted">
              {l.label}
              <span className={cn('badge ms-1.5 ring-1', l.source === 'na' ? 'bg-line/5 text-muted/60 ring-line/10' : 'bg-accent/10 text-accent ring-accent/20')}>
                {SOURCE_LABEL[l.source]}
              </span>
            </span>
            <span className="num-ltr text-ink">{l.amount === 0 && l.source === 'na' ? 'N/A' : fmtUSD(l.amount)}</span>
          </div>
        ))}
        <div className="my-1 border-t border-line/10" />
        <div className="flex justify-between text-[10px] font-black">
          <span className="text-ink">مجموع هزینه‌ها</span>
          <span className="num-ltr text-negative">{fmtUSD(b.totalCostsLong)}</span>
        </div>
      </div>

      {/* Margin مستقل */}
      <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-lg bg-line/5 p-2 text-[8px] font-bold sm:grid-cols-7">
        <span className="text-muted">Notional: <span className="num-ltr text-ink">{b.marginParams.size}</span></span>
        <span className="text-muted">Rate: <span className="num-ltr text-ink">{fmtPct(b.marginParams.rate * 100)}</span></span>
        <span className="text-muted">Floor: <span className="num-ltr text-ink">{fmtPct(b.marginParams.rateFloor * 100)}</span></span>
        <span className="text-muted">YTM: <span className="num-ltr text-ink">{b.marginParams.ytm.toFixed(3)}</span></span>
        <span className="text-muted">YTMFloor: <span className="num-ltr text-ink">{b.marginParams.ytmFloor}</span></span>
        <span className="text-muted">IM: <span className="num-ltr text-ink">{fmtPct(b.marginParams.imRatio * 100)}</span></span>
        <span className="text-muted">مارجین: <span className="num-ltr font-black text-ink">{fmtUSD(b.marginRequired)}</span></span>
      </div>

      {/* چهار معیار بازده */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-4">
        <span className="text-muted">ROI Margin Long: <span className={cn('num-ltr', b.roiLongMargin >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(b.roiLongMargin)}</span></span>
        <span className="text-muted">ROI Notional Long: <span className={cn('num-ltr', b.roiLongNotional >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(b.roiLongNotional)}</span></span>
        <span className="text-muted">Annualized Long: <span className={cn('num-ltr', b.annualizedLong >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(b.annualizedLong)}</span></span>
        <span className="text-muted">ROI Margin Short: <span className={cn('num-ltr', b.roiShortMargin >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(b.roiShortMargin)}</span></span>
      </div>
    </div>
  );
}

export function AuditTab({ markets }: { markets: BorosMarket[] }) {
  const [limit, setLimit] = useState(10);
  const audits = useMemo(() => auditMarkets(markets, 1000), [markets]);

  return (
    <div className="space-y-3">
      <AuditReportTable markets={markets} />

      <GlassCard variant="soft" className="p-3.5">
        <p className="flex items-center gap-1.5 text-[12px] font-black text-ink">
          <ShieldCheck className="h-4 w-4 text-positive" /> ممیزی موتور — Breakdown شفاف
        </p>
        <p className="mt-1 text-[10px] font-medium leading-5 text-muted">
          هر بازار با PnL تفکیکی (Settlement واقعی / MTM تحقق‌نیافته — بدون Double Counting)، هزینه‌های
          خط‌به‌خط با Source، مارجین مستقل (فقط پارامترهای Market) و چهار معیار بازده جدا.
        </p>
      </GlassCard>

      <div className="space-y-2">
        {audits.slice(0, limit).map((b) => (
          <AuditRow key={b.marketId} b={b} />
        ))}
      </div>

      {audits.length > limit && (
        <button onClick={() => setLimit((l) => l + 10)} className="w-full rounded-2xl bg-line/5 py-2.5 text-[11px] font-black text-accent">
          نمایش بیشتر ({audits.length - limit} باقی)
        </button>
      )}
    </div>
  );
}
