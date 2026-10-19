/**
 * کارت «وضعیت امروز» — بالای نتیجهٔ دلتا نوترال
 *  🟢 وارد شوید / 🟡 صبر کنید / 🔴 وارد نشوید (اگر موقعیت دارید خارج شوید)
 *  اختلاف فاندینگ ۷ روزه و ۲۴ ساعته از تاریخچهٔ «پرداخت‌شده» همان دو بازار؛ بقیه از نتیجهٔ ماشین‌حساب.
 *  تصمیم از چک‌لیست (domain/deltaChecklist)؛ دستیار فقط توضیح می‌دهد.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CircleCheck, CircleHelp } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { DELTA_VENUE_LABELS, type VenueQuote } from '@/features/calculators/data/deltaMarkets';
import { fetchFundingHistory } from '@/features/calculators/data/fundingHistory';
import {
  alignSpread,
  deltaChecklist,
  MAX_BASIS_PCT,
  MIN_LIQ_DISTANCE_PCT,
  MIN_PROFITABLE_SHARE_24H,
  MIN_SPREAD_APR_7D,
  spreadStats,
  type CheckItem,
  type CheckState,
  type Checklist,
  type SpreadStats
} from '@/features/calculators/domain';
import { AssistantExplain } from '../options/AssistantExplain';

const VERDICT = {
  enter: { emoji: '🟢', title: 'شرایط ورود امروز برقرار است', tone: 'border-positive/50 bg-positive/10' },
  wait: { emoji: '🟡', title: 'صبر کنید', tone: 'border-warn/50 bg-warn/10' },
  avoid: { emoji: '🔴', title: 'وارد نشوید؛ اگر موقعیت باز دارید، خارج شوید', tone: 'border-negative/50 bg-negative/10' }
} as const;

const fmt = (v: number | null, d = 1) => (v === null ? '—' : toFaDigits(v.toFixed(d)));

function itemText(it: CheckItem, v: Inputs): string {
  switch (it.key) {
    case 'spread7d':
      return `میانگین اختلاف فاندینگ ۷ روز اخیر: ${fmt(v.spread7d)}٪ سالانه (حداقل ${toFaDigits(MIN_SPREAD_APR_7D)}٪)`;
    case 'stable24h':
      return `۲۴ ساعت اخیر: ${v.share24h === null ? '—' : toFaDigits(Math.round(v.share24h * 100))}٪ ساعت‌ها به نفع شما (حداقل ${toFaDigits(MIN_PROFITABLE_SHARE_24H * 100)}٪؛ یعنی اختلاف برعکس نشده)`;
    case 'net':
      return `سود خالص دورهٔ نگهداری بدون پوینت: ${fmt(v.net, 2)} دلار`;
    case 'liquidation':
      return `فاصله تا بسته شدن اجباری: ${fmt(v.liq)}٪ حرکت قیمت (حداقل ${toFaDigits(MIN_LIQ_DISTANCE_PCT)}٪)`;
    case 'basis':
      return `اختلاف قیمت دو صرافی: ${fmt(v.basis, 2)}٪ (حداکثر ${toFaDigits(MAX_BASIS_PCT)}٪ برای ورود و خروج ارزان)`;
    case 'liquidity':
      return v.lowLiq ? 'حجم معاملات یکی از دو بازار کم است' : 'حجم معاملات هر دو بازار کافی است';
  }
}

function Icon({ s }: { s: CheckState }) {
  if (s === 'ok') return <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-positive" />;
  if (s === 'bad') return <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />;
  return <CircleHelp aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />;
}

interface Inputs {
  spread7d: number | null;
  share24h: number | null;
  net: number;
  liq: number | null;
  basis: number | null;
  lowLiq: boolean;
}

/** تاریخچهٔ اختلاف فاندینگ پرداخت‌شده (Short − Long) برای همان دو بازار */
function useSpreadHistory(shortQ: VenueQuote, longQ: VenueQuote): { d7: SpreadStats | null; h24: SpreadStats | null; loading: boolean } {
  const [state, setState] = useState<{ d7: SpreadStats | null; h24: SpreadStats | null; loading: boolean }>({ d7: null, h24: null, loading: true });
  const key = `${shortQ.venue}:${shortQ.ref}|${longQ.venue}:${longQ.ref}`;
  useEffect(() => {
    let alive = true;
    setState({ d7: null, h24: null, loading: true });
    Promise.all([fetchFundingHistory(shortQ.venue, shortQ.ref), fetchFundingHistory(longQ.venue, longQ.ref)])
      .then(([s, l]) => {
        if (!alive) return;
        const series = alignSpread(s, l);
        const now = Date.now();
        setState({ d7: spreadStats(series, 168, now), h24: spreadStats(series, 24, now), loading: false });
      })
      .catch(() => alive && setState({ d7: null, h24: null, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function TodayStatusCard({
  base,
  shortQ,
  longQ,
  net,
  liquidationDistancePct,
  basisPct,
  lowLiquidity,
  context
}: {
  base: string;
  shortQ: VenueQuote;
  longQ: VenueQuote;
  net: number;
  liquidationDistancePct: number | null;
  basisPct: number | null;
  lowLiquidity: boolean;
  /** سرمایه، اهرم و مدت — فقط برای توضیح دستیار */
  context: Record<string, unknown>;
}) {
  const hist = useSpreadHistory(shortQ, longQ);
  const v: Inputs = {
    spread7d: hist.d7?.avgApr ?? null,
    share24h: hist.h24?.profitableShare ?? null,
    net,
    liq: liquidationDistancePct,
    basis: basisPct,
    lowLiq: lowLiquidity
  };
  const c: Checklist = deltaChecklist({
    spreadApr7d: v.spread7d,
    profitableShare24h: v.share24h,
    netWithoutPoints: net,
    liquidationDistancePct,
    basisPct,
    lowLiquidity
  });
  const head = VERDICT[c.verdict];

  return (
    <Surface className={cn('space-y-3 border p-4', head.tone)} aria-label="وضعیت امروز">
      <div>
        <p className="text-2xs font-semibold text-muted">
          وضعیت امروز · <bdi dir="ltr">{base}</bdi> · فروش در {DELTA_VENUE_LABELS[shortQ.venue]}، خرید در {DELTA_VENUE_LABELS[longQ.venue]}
        </p>
        <p className="mt-1 text-base font-bold text-ink">
          <span aria-hidden>{head.emoji}</span> {head.title}
        </p>
        {hist.loading && <p className="text-2xs text-subtle">در حال خواندن تاریخچهٔ فاندینگ…</p>}
      </div>
      <ul className="space-y-1.5">
        {c.items.map((it) => (
          <li key={it.key} className="flex items-start gap-2 text-xs leading-6 text-muted">
            <Icon s={it.state} />
            <span>
              <span className="sr-only">{it.state === 'ok' ? 'برقرار: ' : it.state === 'bad' ? 'برقرار نیست: ' : 'نامشخص: '}</span>
              {itemText(it, v)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-2xs leading-5 text-subtle">پوینت در این تصمیم حساب نمی‌شود. اگر موقعیت باز دارید، هر روز همین کارت را ببینید: با قرمز شدن خارج شوید.</p>
      <AssistantExplain
        op="analyze-delta"
        payload={() => ({
          verdict: c.verdict,
          base,
          shortVenue: DELTA_VENUE_LABELS[shortQ.venue],
          longVenue: DELTA_VENUE_LABELS[longQ.venue],
          items: c.items.map((it) => ({ key: it.key, state: it.state, text: itemText(it, v) })),
          ...context
        })}
      />
    </Surface>
  );
}
