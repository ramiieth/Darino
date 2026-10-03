import { borosAssetName, borosVenueName } from './borosLabels';
/**
 * Risk monitor — market-level alerts (not position liquidation risk)
 *  - extreme funding (deviation from the 7-day mean / z-score)
 *  - low liquidity (OI / volume)
 *  - high volatility
 * Position metrics (liquidation APR, health factor) need a real Boros position → N/A.
 */
import { useMemo } from 'react';
import { Activity, AlertTriangle, Droplets, ShieldCheck } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { KeyValueList, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { fmtPct, fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { BorosCalculationEngine } from '@/features/boros/domain/calc';
import type { BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

interface AlertRow {
  m: BorosMarket;
  type: 'extreme' | 'liquidity' | 'volatility';
  message: string;
  severity: 'high' | 'medium' | 'low';
  riskLevel: string;
  riskScore: number;
}

const SEVERITY: Record<AlertRow['severity'], { label: string; tone: Tone }> = {
  high: { label: 'شدید', tone: 'loss' },
  medium: { label: 'متوسط', tone: 'warn' },
  low: { label: 'خفیف', tone: 'neutral' }
};

const TYPE_META = {
  extreme: { label: 'انحراف نرخ ضمنی', icon: AlertTriangle },
  liquidity: { label: 'نقدشوندگی پایین', icon: Droplets },
  volatility: { label: 'نوسان بالا', icon: Activity }
};

export function RiskMonitorTab({ markets }: { markets: BorosMarket[] }) {
  const alerts = useMemo<AlertRow[]>(() => {
    const out: AlertRow[] = [];
    for (const m of markets) {
      // analyse once per market (the old view re-ran it twice per alert on every render)
      const a = BorosCalculationEngine.analyze({ m, size: 1000 });
      const base = { m, riskLevel: a.riskLevel, riskScore: a.riskScore };
      const dev = a.relDev7d;
      if (a.extreme === 'high' || a.extreme === 'low') {
        out.push({
          ...base,
          type: 'extreme',
          message: `امتیاز انحراف ${a.zScore?.toFixed(1)} — نرخ سالانه ${a.extreme === 'high' ? 'بسیار بالاتر' : 'بسیار پایین‌تر'} از میانگین تاریخی`,
          severity: Math.abs(a.zScore ?? 0) > 3 ? 'high' : 'medium'
        });
      } else if (dev !== null && Math.abs(dev) > 25) {
        out.push({
          ...base,
          type: 'extreme',
          message: `انحراف ${fmtPct(dev)} از میانگین ۷ روزه`,
          severity: Math.abs(dev) > 50 ? 'high' : 'medium'
        });
      }
      if (a.liquidityScore < 0.3) {
        out.push({
          ...base,
          type: 'liquidity',
          message: `تعهدات باز ${fmtUSD(m.notionalOI * (m.collateralPriceUsd ?? m.assetMarkPrice), true)} · حجم ۲۴ ساعت ${fmtUSD(m.volume24h * (m.collateralPriceUsd ?? m.assetMarkPrice), true)}`,
          severity: a.liquidityScore < 0.15 ? 'high' : 'medium'
        });
      }
      if (a.volatility !== null && a.volatility > 0.015) {
        out.push({
          ...base,
          type: 'volatility',
          message: `نوسان روزانه ${fmtPct(a.volatility * 100)} — بالاتر از حد طبیعی`,
          severity: a.volatility > 0.03 ? 'high' : 'low'
        });
      }
    }
    const rank = { high: 0, medium: 1, low: 2 };
    return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
  }, [markets]);

  const counts = {
    high: alerts.filter((a) => a.severity === 'high').length,
    medium: alerts.filter((a) => a.severity === 'medium').length,
    low: alerts.filter((a) => a.severity === 'low').length
  };

  return (
    <div className="space-y-8">
      <Section id="market-alerts" title="هشدارهای بازار" description="تشخیص خودکار — فقط تحلیلی، بدون هیچ اقدام خودکار">
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone="loss">{toFaDigits(counts.high)} شدید</Badge>
          <Badge tone="warn">{toFaDigits(counts.medium)} متوسط</Badge>
          <Badge tone="neutral">{toFaDigits(counts.low)} خفیف</Badge>
        </div>
        {alerts.length === 0 ? (
          <Notice tone="success" icon={<ShieldCheck />}>هشدار فعالی وجود ندارد.</Notice>
        ) : (
          <Surface className="px-4 md:px-5">
            <ul className="divide-y divide-divider">
              {alerts.slice(0, 40).map((a, i) => {
                const Icon = TYPE_META[a.type].icon;
                const sev = SEVERITY[a.severity];
                return (
                  <li key={i} className="flex items-start gap-3 py-3.5">
                    <span
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        a.severity === 'high' ? 'bg-negative/10 text-negative' : a.severity === 'medium' ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-muted'
                      )}
                    >
                      <Icon aria-hidden className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        <bdi dir="ltr" className="truncate">{`${borosAssetName(a.m.asset)} · ${borosVenueName(a.m.venue)}`}</bdi>
                        <Badge tone={sev.tone}>{sev.label}</Badge>
                      </p>
                      <p className="text-sm text-muted">
                        {TYPE_META[a.type].label}: <span className="num-ltr">{a.message}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        ریسک {a.riskLevel} ({toFaDigits(Math.round(a.riskScore))}/۱۰۰) · APR{' '}
                        <PercentValue value={a.m.markApr * 100} signed={false} tone="none" /> · شناور{' '}
                        <PercentValue value={a.m.floatingApr * 100} signed={false} tone="none" />
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Surface>
        )}
      </Section>

      <Section
        id="position-layer"
        title="ریسک پوزیشن واقعی"
        description="بدون پوزیشن واقعی در بوروس، این شاخص‌ها از داده بازار حدس زده نمی‌شوند"
      >
        <Surface className="px-4 md:px-5">
          <KeyValueList
            rows={[
              { label: 'پوزیشن فعال', value: <Badge tone="neutral">ندارد</Badge> },
              { label: 'وثیقه واقعی', value: <span className="text-subtle">N/A</span> },
              { label: 'ارزش اسمی واقعی', value: <span className="text-subtle">N/A</span> },
              { label: 'نرخ لیکوئید ضمنی', value: <span className="text-subtle">N/A</span> },
              { label: 'ضریب سلامت', value: <span className="text-subtle">N/A</span> },
              { label: 'مارجین نگهداری', value: <span className="text-subtle">N/A</span> }
            ]}
          />
        </Surface>
      </Section>
    </div>
  );
}
