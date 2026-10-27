/**
 * رژیم فاندینگ هایپرلیکوئید — نرخ فعلی در برابر ۳۰ روز گذشته
 *
 * فاندینگ‌های افراطی معمولاً به میانگین برمی‌گردند: ورود دلتا نوترال در اوج فاندینگ یعنی APR واقعی
 * کمتر از عدد امروز. صدک فقط با حداقل ۷ روز داده نمایش داده می‌شود. نرخ‌ها ساعتی‌اند. Pure.
 */

export interface FundingPoint {
  time: number;
  fundingRate: string;
}

export interface FundingStats {
  aprNow: number | null;
  avg7dApr: number | null;
  avg30dApr: number | null;
  /** صدک نرخ فعلی در توزیع نرخ‌های ساعتی بازه (۰ تا ۱۰۰) */
  percentile: number | null;
  daily: { day: string; apr: number }[];
  samples: number;
  regime: 'hot' | 'cold' | 'normal' | 'negative' | 'unknown';
}

export const hourlyToApr = (r: number) => r * 24 * 365 * 100;
const MIN_SAMPLES = 7 * 24;

export function fundingStats(history: FundingPoint[], currentHourly: number | null, now = Date.now()): FundingStats {
  const rates = history
    .map((p) => ({ t: p.time, r: Number(p.fundingRate) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.r) && p.t > now - 31 * 86_400_000)
    .sort((a, b) => a.t - b.t);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const last7 = rates.filter((p) => p.t > now - 7 * 86_400_000).map((p) => p.r);
  const all = rates.map((p) => p.r);
  const current = currentHourly ?? (rates.length ? rates[rates.length - 1].r : null);
  // صدک میانه‌رتبه: نرخ برابر نیمه حساب می‌شود؛ وگرنه فاندینگی که بیشتر ماه روی نرخ پایه (~۱۱٪) ثابت بوده «صدک ۱۰۰ / داغ» می‌شد
  const percentile =
    current !== null && all.length >= MIN_SAMPLES ? ((all.filter((r) => r < current).length + all.filter((r) => r === current).length / 2) / all.length) * 100 : null;

  const byDay = new Map<string, number[]>();
  for (const p of rates) {
    const d = new Date(p.t).toISOString().slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), p.r]);
  }
  const daily = [...byDay.entries()].map(([day, xs]) => ({ day, apr: hourlyToApr(mean(xs)!) }));
  const aprNow = current === null ? null : hourlyToApr(current);
  const regime: FundingStats['regime'] =
    percentile === null || aprNow === null ? 'unknown' : aprNow < 0 ? 'negative' : percentile >= 90 ? 'hot' : percentile <= 10 ? 'cold' : 'normal';

  const a7 = mean(last7), a30 = mean(all);
  return {
    aprNow,
    avg7dApr: a7 === null ? null : hourlyToApr(a7),
    avg30dApr: a30 === null ? null : hourlyToApr(a30),
    percentile,
    daily,
    samples: all.length,
    regime
  };
}

export const REGIME_FA: Record<FundingStats['regime'], { label: string; hint: string }> = {
  hot: { label: 'داغ', hint: 'بالاتر از ۹۰٪ ساعت‌های ماه گذشته؛ احتمال برگشت به میانگین بالاست. APR امروز را مبنای دلتا نکنید. برای معاملهٔ جهت‌دار یعنی لانگ‌ها شلوغ‌اند و هزینهٔ نگه‌داری لانگ بالاست. نشانهٔ آبشار نیست (در آزمون سه سال اخیر بیشتر آبشارها در بازار غیرشلوغ آمدند) و دلیل شورت گرفتن هم نیست؛ فاندینگ داغ می‌تواند هفته‌ها بماند.' },
  cold: { label: 'سرد', hint: 'پایین‌تر از ۹۰٪ ساعت‌های ماه گذشته.' },
  normal: { label: 'عادی', hint: 'در محدودهٔ معمول ماه گذشته.' },
  negative: { label: 'منفی', hint: 'شورت‌ها به لانگ‌ها می‌پردازند؛ پای شورت دلتا نوترال هزینه دارد. برای معاملهٔ جهت‌دار یعنی شورت‌ها شلوغ‌اند: شورت پراهرم در معرض جهش ناگهانی (short squeeze) است.' },
  unknown: { label: 'دادهٔ کافی نیست', hint: 'کمتر از ۷ روز تاریخچه.' }
};
