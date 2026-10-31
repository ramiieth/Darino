/**
 * «استاپ و هدف از مسیر قیمت» — MAE/MFE هر نماد و سه قانون شبیه‌سازی‌شده روی معاملات خود کاربر
 *
 *   استاپ  = صدک ۹۰ حرکت خلاف برنده‌ها (۹۰٪ برنده‌ها هرگز به آن نرسیدند)
 *   هدف    = میانهٔ حرکت موافق برنده‌ها
 *   سربه‌سر = بعد از سودی به اندازهٔ زیان میانهٔ بازنده‌ها، استاپ به قیمت ورود
 * زیر ۲۰ معامله یا ۸ برنده «فرضیه» است، نه پیشنهاد. همه درون‌نمونه‌اند.
 */
import type { ReactNode } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { Trade } from '../domain/types';
import { candleCoin, MIN_TRADES, MIN_WINNERS, type SymbolExcursions, type Unmeasured } from '../domain/excursions';
import { useExcursions } from '../data/useExcursions';
import { fa, pct, pnlTone, usd } from './parts';

/** فاصلهٔ قیمت: جفت‌ارز زیر ۲۰ به پیپ، بقیه به دلارِ واحد قیمت */
function dist(frac: number | null, refPx: number): string {
  if (frac === null) return '—';
  const d = frac * refPx;
  return refPx < 20 ? `${fa(d * 10_000, 0)} پیپ` : `${fa(d, refPx >= 1000 ? 1 : 2)} دلار`;
}

const REASON_FA: Record<Unmeasured['reason'], string> = {
  'no-source': 'نماد بدون پرپ هم‌نام',
  'too-old': 'قدیمی‌تر از کندل‌های در دسترس',
  'too-short': 'کوتاه‌تر از ۳ کندل',
  'no-data': 'کندل دریافت نشد'
};

function RuleLine({ title, body, delta, changed }: { title: string; body: ReactNode; delta: number; changed: number }) {
  return (
    <div className="border-t border-divider pt-2 first:border-0 first:pt-0">
      <p className="text-xs font-semibold text-ink">{title}</p>
      <p className="text-xs leading-6 text-muted">{body}</p>
      <p className="text-xs">اگر از اول این قانون را داشتید: <span className={cn('num-ltr font-bold', pnlTone(delta))}>{usd(delta, true)}</span> <span className="text-subtle">({fa(changed)} معامله نتیجهٔ دیگری می‌گرفت)</span></p>
    </div>
  );
}

function SymbolCard({ s }: { s: SymbolExcursions }) {
  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-ink" dir="ltr">{s.symbol}</span>
        <span className="text-xs text-muted">{fa(s.n)} معامله · {fa(s.winners)} برد · {fa(s.losers)} باخت</span>
        <Badge tone={s.enough ? 'info' : 'neutral'} className="ms-auto">{s.enough ? 'پیشنهاد' : 'فرضیه — نمونهٔ کم'}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {s.stop && (
          <RuleLine
            title={`استاپ: ${dist(s.stop.level, s.refPx)} (${pct(s.stop.level * 100, 2)})`}
            body={<>۹۰٪ برنده‌ها کمتر از این خلاف رفتند (میانه {dist(s.winnerMae.p50, s.refPx)}، صدک ۸۰ {dist(s.winnerMae.p80, s.refPx)}). زیان میانهٔ بازنده‌ها {dist(s.loserRealized, s.refPx)}{s.loserRealized !== null && s.loserRealized > s.stop.level ? '؛ یعنی زیان‌ها از جایی بزرگ‌تر شده‌اند که برنده‌ها تقریباً هیچ‌وقت نمی‌رسند.' : '.'}</>}
            delta={s.stop.delta}
            changed={s.stop.changed}
          />
        )}
        {s.target && (
          <RuleLine
            title={`هدف: ${dist(s.target.level, s.refPx)} (${pct(s.target.level * 100, 2)})`}
            body={<>برنده‌ها به‌طور میانه تا این حد پیش رفتند ولی خروج میانهٔ شما {dist(s.winnerRealized, s.refPx)} بود؛ از حرکت در دسترس {pct((s.capture ?? 0) * 100, 0)} را گرفتید.</>}
            delta={s.target.delta}
            changed={s.target.changed}
          />
        )}
        {s.breakeven && (
          <RuleLine
            title={`انتقال استاپ به ورود بعد از ${dist(s.breakeven.trigger, s.refPx)} سود`}
            body={<>{pct((s.losersOnceUp ?? 0) * 100, 0)} بازنده‌ها پیش از بسته‌شدن با ضرر، دست‌کم به اندازهٔ زیان میانه در سود بودند.</>}
            delta={s.breakeven.delta}
            changed={s.breakeven.changed}
          />
        )}
      </div>
    </Surface>
  );
}

export function ExcursionPanel({ trades }: { trades: readonly Trade[] }) {
  const withSource = trades.filter((t) => candleCoin(t) !== null);
  const x = useExcursions(withSource);
  if (!withSource.length) return null;
  const reasons = new Map<Unmeasured['reason'], number>();
  for (const u of x.unmeasured) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-ink md:text-lg">استاپ و هدف از مسیر قیمت معاملات خودتان</h2>
        <p className="mt-1 text-xs leading-6 text-muted">
          برای هر معامله بیشترین حرکت خلاف (MAE) و موافق (MFE) از کندل‌های پرپ هم‌نام هایپرلیکوئید اندازه‌گیری شد و سه قانون کندل‌به‌کندل روی همان معاملات اجرا شد.
          زیر {fa(MIN_TRADES)} معامله یا {fa(MIN_WINNERS)} برد در یک نماد، عدد فقط فرضیه است.
        </p>
      </div>
      {x.loading && !x.measured.length && <p className="text-xs text-muted">در حال دریافت کندل‌ها…</p>}
      {x.failed.length > 0 && <Notice tone="warn">کندل {[...new Set(x.failed)].join('، ')} دریافت نشد؛ آن معاملات اندازه‌گیری نشدند.</Notice>}
      {x.symbols.length > 0 && <div className="grid gap-3 lg:grid-cols-2">{x.symbols.map((s) => <SymbolCard key={s.symbol} s={s} />)}</div>}
      {!x.loading && !x.measured.length && <Notice tone="info">هنوز معامله‌ای با مسیر قیمت قابل اندازه‌گیری نیست.</Notice>}
      <p className="text-[11px] leading-5 text-subtle">
        {fa(x.measured.length)} معامله اندازه‌گیری شد{x.unmeasured.length ? `؛ ${fa(x.unmeasured.length)} نه (${[...reasons].map(([r, n]) => `${REASON_FA[r]}: ${fa(n)}`).join('، ')})` : ''}.
        {' '}محدودیت‌ها: مسیر از پرپ است نه قیمت بروکر (حرکت‌ها نسبی‌اند تا اختلاف پایه حذف شود)؛ کندل اول و آخر کامل شمرده می‌شوند؛ اگر استاپ و هدف در یک کندل لمس شوند استاپ فرض شده؛
        کارمزد و اسپرد در شبیه‌سازی تغییر نمی‌کند؛ قانون روی همین معاملات بهینه شده و نتیجهٔ آینده را تضمین نمی‌کند.
      </p>
    </section>
  );
}
