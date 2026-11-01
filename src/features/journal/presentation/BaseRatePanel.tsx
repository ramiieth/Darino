/**
 * «نرخ پایهٔ همین استاپ و هدف» در برنامهٔ معامله — ورود تصادفی با همین هندسه روی کندل‌های اخیر همین بازار
 *   (منطق در domain/baseRate.ts). برای هر دو حالت کریپتو و متاتریدر؛ متاتریدر کندل‌های آخر هفته را کنار می‌گذارد.
 */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { Direction } from '../domain/types';
import { inWeekendGap } from '../domain/excursions';
import { baseRate, HORIZONS, MIN_EFFECTIVE, planCoin, splitEdge, type HorizonKey } from '../domain/baseRate';
import { useCandles } from '../data/useExcursions';
import { duration, fa, faDate, pct } from './parts';

/** امید ریاضی کمتر از این (به R) «≈ صفر» */
const FLAT_EV = 0.05;
const signedR = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fa(Math.abs(v), 2)}R`;
const signTone = (v: number) => (v > FLAT_EV ? 'text-positive' : v < -FLAT_EV ? 'text-negative' : 'text-ink');

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('num-ltr text-base font-bold', tone ?? 'text-ink')}>{value}</p>
      {sub && <p className="text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

export function BaseRatePanel({ symbol, kind, direction, entry, stop, target }: {
  symbol: string;
  kind: 'crypto' | 'mt';
  direction: Direction;
  entry: number | null;
  stop: number | null;
  target: number | null;
}) {
  const [hk, setHk] = useState<HorizonKey>('24h');
  const h = HORIZONS.find((x) => x.key === hk)!;
  const coin = planCoin(symbol, kind);
  const valid = entry !== null && stop !== null && target !== null && entry > 0
    && (direction === 'long' ? stop < entry && target > entry : stop > entry && target < entry);
  const q = useCandles(valid ? coin : null, h.interval, h.ms);
  const { r, edge } = useMemo(() => {
    if (!valid || !q.data) return { r: null, edge: null };
    const candles = kind === 'mt' ? q.data.candles.filter((c) => !inWeekendGap(c.t)) : q.data.candles;
    const args = {
      stopFrac: Math.abs(entry! - stop!) / entry!,
      targetFrac: Math.abs(target! - entry!) / entry!,
      horizonBars: Math.round((h.hours * 3_600_000) / h.ms),
      intervalMs: h.ms
    };
    const mine = baseRate(candles, { ...args, direction });
    const opp = baseRate(candles, { ...args, direction: direction === 'long' ? 'short' : 'long' });
    return { r: mine, edge: mine && opp ? splitEdge(mine.evR, opp.evR) : null };
  }, [valid, q.data, kind, direction, entry, stop, target, h]);

  if (!valid) return null;
  return (
    <Surface variant="subtle" className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-ink">نرخ پایهٔ همین استاپ و هدف — اگر در هر لحظهٔ اخیر تصادفی وارد می‌شدید</p>
        {r && <Badge tone={r.enough ? 'info' : 'neutral'} className="ms-auto">{r.enough ? 'نمونهٔ کافی' : 'فرضیه — نمونهٔ کم'}</Badge>}
      </div>
      <SegmentedControl size="sm" label="افق نگه‌داری" options={HORIZONS.map((x) => ({ value: x.key, label: `تا ${x.label}` }))} value={hk} onChange={setHk} />
      {!coin && <Notice tone="info">برای نماد {symbol || '—'} کندل هم‌نامی در هایپرلیکوئید نداریم{kind === 'mt' ? ' (فعلاً طلا، یورو، برنت و WTI)' : ''}.</Notice>}
      {coin && q.isPending && <p className="text-xs text-muted">در حال دریافت کندل‌های {coin}…</p>}
      {coin && q.isError && <Notice tone="warn">کندل {coin} دریافت نشد.</Notice>}
      {coin && q.data && !r && <Notice tone="info">کندل کافی برای این افق نیست.</Notice>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="اول هدف" value={pct(r.pTarget * 100, 0)} sub={`بازهٔ ۹۰٪: ${pct(r.pTargetLo * 100, 0)} تا ${pct(r.pTargetHi * 100, 0)}`} tone="text-positive" />
            <Stat label="اول استاپ" value={pct(r.pStop * 100, 0)} sub={r.medianToStopMs !== null ? `میانه ${duration(r.medianToStopMs)}` : undefined} tone="text-negative" />
            <Stat label={`هیچ‌کدام تا ${h.label}`} value={pct(r.pTimeout * 100, 0)} sub="بسته با قیمت پایان افق" />
            <Stat label="امید ریاضی هر معامله" value={signedR(r.evR)} sub={`پس از کارمزد ${fa(r.feeR, 2)}R`} tone={signTone(r.evR)} />
          </div>
          {edge && (
            <div className="space-y-1 text-xs leading-6 text-muted">
              <p>
                <span className="font-semibold text-ink">ساختار و کارمزد: <span className={cn('num-ltr', signTone(edge.structureR))}>{signedR(edge.structureR)}</span></span>
                {' — '}
                {edge.structureR < -FLAT_EV
                  ? <>این هندسه مستقل از جهت بازار ضرر می‌دهد{r.feeR > 0.1 ? `؛ ${signedR(-r.feeR)} آن فقط کارمزد است چون استاپ نزدیک است` : ''}.</>
                  : <>هندسه به‌تنهایی مزیت یا ضرری ندارد؛ هرچه هست باید از ستاپ شما بیاید.</>}
              </p>
              <p>
                <span className="font-semibold text-ink">روند اخیر بازار: <span className={cn('num-ltr', signTone(edge.trendR))}>{signedR(edge.trendR)}</span></span>
                {' — '}
                {Math.abs(edge.trendR) <= FLAT_EV
                  ? <>در این دوره روند قابل‌توجهی نبود.</>
                  : <>در این دوره بازار {edge.trendR > 0 ? 'به نفع' : 'خلاف'} جهت شما رفت. این سهم با عوض شدن روند از بین می‌رود؛ رویش حساب نکنید.</>}
              </p>
              <p>برای سود، ستاپ شما باید نرخ برد را از <b className="text-ink">{pct(r.breakevenWin * 100, 0)}</b> (برد سربه‌سر با R {fa(r.rTarget, 2)} و کارمزد) بالاتر ببرد.</p>
            </div>
          )}
          {r.stopVsHourRange !== null && r.stopVsHourRange < 1 && (
            <Notice tone="warn">استاپ شما {fa(r.stopVsHourRange, 2)} برابر دامنهٔ معمول یک ساعتِ این بازار است — داخل نوسان عادی؛ احتمالاً بدون اشتباه بودن ایده استاپ می‌خورید.</Notice>
          )}
          <p className="text-[11px] leading-5 text-subtle">
            {coin} · کندل {h.interval} از {faDate(r.from)} تا {faDate(r.to)} · {fa(r.trials)} شروع، نمونهٔ مؤثر {fa(r.effective)} (شروع‌های هم‌پوشان مستقل نیستند؛ زیر {fa(MIN_EFFECTIVE)} فرضیه).
            {' '}فاصله‌ها با نوسان هر لحظه نسبت به امروز مقیاس شده‌اند؛ استاپ و هدف در یک کندل = استاپ؛ لغزش و فاندینگ لحاظ نشده؛ کارمزد تیکر ۰٫۰۴۵٪ هر طرف.
            {' '}این ورود تصادفی است نه پیش‌بینی ستاپ شما، و فقط دورهٔ اخیر را می‌بیند.
          </p>
        </>
      )}
    </Surface>
  );
}
