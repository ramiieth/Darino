/**
 * تب «پوزیشن برترها» — برترین‌های هایپرلیکوئید همین الان چه دارند (تجمیع به تفکیک دارایی)
 * زمینه است نه سیگنال: بخشی از پوزیشن‌ها جای دیگری هج شده‌اند.
 */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { aggregatePositions, type CoinPositioning } from '@/features/traders/domain/positions';
import { usePositions } from '@/features/traders/data/useTraders';
import { LiqLadder, SplitBar, fmtPrice } from './parts';

type Scope = 'all' | 'steady';

export function PositionsTab({ onCoin }: { onCoin: (coin: string) => void }) {
  const q = usePositions();
  const [scope, setScope] = useState<Scope>('all');
  const coins = useMemo(() => aggregatePositions((q.data?.positions ?? []).filter((p) => scope === 'all' || p.steady)), [q.data, scope]);

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !q.data) return <ErrorState message="پوزیشن‌های برترها دریافت نشد" onRetry={() => void q.refetch()} />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ChipGroup<Scope>
          label="دامنه"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: `همهٔ برترها (${toFaDigits(q.data.traders)})` },
            { value: 'steady', label: `فقط ثابت‌قدم‌ها (${toFaDigits(q.data.steadyTraders)})` }
          ]}
        />
        <p className="text-xs text-muted">به‌روز {fmtRelativeAge(q.data.fetchedAt)} · هر ۵ دقیقه</p>
      </div>
      <Notice tone="neutral" className="mb-5">
        زمینه است، نه سیگنال خرید: بخشی از این پوزیشن‌ها جای دیگری هج شده‌اند. نقطه‌های قرمز و سبز روی نوار، قیمت لیکوئید پوزیشن‌ها نسبت به قیمت فعلی است — تجمع نزدیک قیمت یعنی احتمال آبشار لیکوئید.
      </Notice>
      {coins.length === 0 ? (
        <EmptyState message={scope === 'steady' && q.data.steadyTraders === 0 ? 'هنوز کارنامهٔ تریدرها روی سرور کامل نشده' : 'پوزیشن بازی نیست'} hint={scope === 'steady' ? 'تحلیل کارنامه‌ها چند دقیقه طول می‌کشد؛ «همهٔ برترها» را ببینید.' : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {coins.slice(0, 30).map((c) => (
            <CoinCard key={c.coin} c={c} onOpen={() => onCoin(c.coin)} />
          ))}
        </div>
      )}
    </>
  );
}

function CoinCard({ c, onOpen }: { c: CoinPositioning; onOpen: () => void }) {
  const bias = c.longUsd + c.shortUsd > 0 ? c.netUsd / (c.longUsd + c.shortUsd) : 0;
  return (
    <Surface as="article" className="h-full p-4 transition-shadow hover:shadow-card">
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-extrabold text-ink"><bdi dir="ltr">{c.coin}</bdi></p>
            <p className="text-xs text-muted">قیمت <bdi dir="ltr">{fmtPrice(c.markPx)}</bdi> · {toFaDigits(c.longCount + c.shortCount)} تریدر</p>
          </div>
          {Math.abs(bias) >= 0.4 && <Badge tone={bias > 0 ? 'gain' : 'loss'}>{bias > 0 ? 'اکثراً لانگ' : 'اکثراً شورت'}</Badge>}
        </div>
        <SplitBar long={c.longUsd} short={c.shortUsd} />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div><dt className="text-muted">لانگ ({toFaDigits(c.longCount)})</dt><dd className="font-bold text-ink"><MoneyValue value={c.longUsd} compact /></dd></div>
          <div><dt className="text-muted">شورت ({toFaDigits(c.shortCount)})</dt><dd className="font-bold text-ink"><MoneyValue value={c.shortUsd} compact /></dd></div>
          <div><dt className="text-muted">میانگین ورود لانگ</dt><dd className="font-semibold text-ink"><bdi dir="ltr">{fmtPrice(c.avgEntryLong)}</bdi></dd></div>
          <div><dt className="text-muted">میانگین ورود شورت</dt><dd className="font-semibold text-ink"><bdi dir="ltr">{fmtPrice(c.avgEntryShort)}</bdi></dd></div>
        </dl>
        {c.liqLevels.length > 0 && (
          <div className="mt-4">
            <LiqLadder levels={c.liqLevels} />
          </div>
        )}
      </button>
    </Surface>
  );
}
