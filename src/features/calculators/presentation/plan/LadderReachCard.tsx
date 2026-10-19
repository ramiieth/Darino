/**
 * «این قیمت‌های خرید چقدر در دسترس‌اند؟» — زیر جدول خرید پله‌ای (برنامهٔ من)
 *  تاریخچهٔ ۱۸۰ روزهٔ قیمت → نوسان واقعی → احتمال لمس هر پله در ۳۰ و ۹۰ روز + آخرین بار که قیمت آن‌جا بود.
 *  دستیار AI فقط همین اعداد را توضیح می‌دهد و پیشنهاد تنظیم پله‌ها را می‌گوید.
 */
import { useEffect, useState } from 'react';
import { Badge } from '@/shared/components/ui/Badge';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { toFaDigits } from '@/shared/utils/formatters';
import { getHistoricalSeries, type PricePoint } from '@/features/calculators/data/historical';
import { useMarkets } from '@/features/markets/pipeline/useMarkets';
import { ladderReach, type Reach, type LadderPlan } from '@/features/calculators/domain';
import { AssistantExplain } from '../options/AssistantExplain';

const REACH: Record<Reach, { label: string; tone: 'gain' | 'neutral' | 'warn' | 'loss' }> = {
  near: { label: 'نزدیک', tone: 'gain' },
  possible: { label: 'ممکن', tone: 'neutral' },
  far: { label: 'دور', tone: 'warn' },
  'very-far': { label: 'خیلی دور', tone: 'loss' }
};
const pct = (p: number) => `${toFaDigits(Math.round(p * 100))}٪`;
const DAY = 86_400_000;

export function LadderReachCard({ symbol, price, plan }: { symbol: string; price: number; plan: LadderPlan }) {
  const [hist, setHist] = useState<PricePoint[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setHist(undefined);
    const now = Date.now();
    getHistoricalSeries('crypto', symbol, now - 180 * DAY, now)
      .then((h) => alive && setHist(h))
      .catch(() => alive && setHist(null));
    return () => {
      alive = false;
    };
  }, [symbol]);
  const live = useMarkets('crypto_top_200').assets.find((a) => a.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;

  if (hist === undefined) return <Skeleton className="h-32 w-full" />;
  const r = hist ? ladderReach(price, plan.steps, hist) : null;
  if (!r) {
    return <p className="rounded-field bg-surface-2/60 px-3 py-2 text-xs text-muted">تاریخچهٔ قیمت این دارایی در دسترس نیست؛ نمی‌توان گفت پله‌ها چقدر در دسترس‌اند.</p>;
  }

  return (
    <section className="space-y-3 rounded-card border border-divider p-3.5" aria-label="دسترسی‌پذیری قیمت‌های خرید">
      <div>
        <h3 className="text-sm font-bold text-ink">این قیمت‌ها چقدر در دسترس‌اند؟</h3>
        <p className="mt-1 text-xs leading-6 text-muted">
          از نوسان واقعی ۱۸۰ روز اخیر (حدود {toFaDigits((r.dailyVol * 100).toFixed(1))}٪ در روز). کمترین قیمت ۳۰ روز اخیر <MoneyValue value={r.low30} /> و ۹۰ روز اخیر{' '}
          <MoneyValue value={r.low90} /> بوده است.
        </p>
      </div>
      <ul className="space-y-2">
        {r.steps.map((st, i) => (
          <li key={st.price} className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-divider px-3 py-2 text-xs">
            <span className="min-w-0">
              <b className="text-ink">
                پلهٔ {toFaDigits(i + 1)}: <MoneyValue value={st.price} />
              </b>
              <span className="text-muted"> (−{toFaDigits(st.dropPct)}٪)</span>
              <span className="block text-2xs text-muted">
                احتمال تقریبی رسیدن: ۳۰ روز {pct(st.p30)} · ۹۰ روز {pct(st.p90)} ·{' '}
                {st.lastSeenDaysAgo === null ? 'در ۱۸۰ روز اخیر به این قیمت نرسیده' : st.lastSeenDaysAgo === 0 ? 'همین امروز این قیمت بود' : `آخرین بار ${toFaDigits(st.lastSeenDaysAgo)} روز پیش`}
              </span>
            </span>
            <Badge tone={REACH[st.reach].tone}>{REACH[st.reach].label}</Badge>
          </li>
        ))}
      </ul>
      <p className="text-2xs leading-5 text-subtle">احتمال‌ها از مدل ساده و بدون روند به دست آمده‌اند؛ پیش‌بینی نیستند. اگر هیچ پله‌ای پر نشود، پول آن پله نقد می‌ماند.</p>
      <AssistantExplain
        op="analyze-plan"
        payload={() => ({
          asset: symbol,
          currentPrice: price,
          live: live && { change24hPct: live.change24h, change7dPct: live.change7d, change30dPct: live.change30d, snapshot: live.snapshot === true },
          dailyVolPct: Math.round(r.dailyVol * 10000) / 100,
          low30: r.low30,
          low90: r.low90,
          steps: r.steps.map((st, i) => ({ step: i + 1, price: Math.round(st.price * 100) / 100, dropPct: st.dropPct, usd: plan.steps[i]?.usd ?? null, p30: Math.round(st.p30 * 100) / 100, p90: Math.round(st.p90 * 100) / 100, lastSeenDaysAgo: st.lastSeenDaysAgo, reach: st.reach }))
        })}
      />
    </section>
  );
}
