/**
 * دفتر جفت‌های دلتا نوترال و فارم پوینت — مستقل از صفحهٔ ژورنال تا در «درآمد فاندینگ» بنشیند
 *   همان useJournal و همان NeutralTab (حجم، فاندینگ، کارمزد، هزینه به‌ازای هر ۱ میلیون دلار حجم، تعادل پوشش‌ها)
 *   نقش هر حساب (جهت‌دار یا نوترال) همچنان در تنظیمات ژورنال تعیین می‌شود.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { usePlatformPerpVenues } from '@/features/perps/data/usePerpVenues';
import { DEFAULT_ROLE_BY_VENUE } from '../domain/classify';
import { RANGE_FA, useJournal, type RangeKey } from '../data/useJournal';
import { NeutralTab } from './NeutralTab';

const RANGES: RangeKey[] = ['30', '90', '180', 'all'];

/** اندازهٔ حساب پیش‌فرض ژورنال: موجودی حساب‌هایی که پلتفرمشان پیش‌فرض نوترال نیست */
export function useLiveEquity(): number | null {
  const venues = usePlatformPerpVenues();
  return useMemo(() => {
    const vals = venues.filter((v) => DEFAULT_ROLE_BY_VENUE[v.venue as keyof typeof DEFAULT_ROLE_BY_VENUE] !== 'neutral').map((v) => v.equity).filter((x): x is number => x !== null && x > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [venues]);
}

export function NeutralLedger() {
  const [params, setParams] = useSearchParams();
  const range = (RANGES.includes(params.get('range') as RangeKey) ? params.get('range') : '90') as RangeKey;
  const liveEquity = useLiveEquity();
  const j = useJournal(range, liveEquity);
  const failed = j.histories.filter((h) => h.status === 'error');

  return (
    <div className="space-y-4">
      <ChipGroup
        label="بازهٔ زمانی"
        value={range}
        onChange={(v) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p);
              if (v === '90') next.delete('range');
              else next.set('range', v);
              return next;
            },
            { replace: true }
          )
        }
        options={RANGES.map((r) => ({ value: r, label: RANGE_FA[r] }))}
      />
      {failed.length > 0 && (
        <Notice tone="warn" title="تاریخچهٔ بعضی حساب‌ها دریافت نشد">
          {failed.map((h) => h.account.label).join('، ')} — نتیجه بدون آن‌هاست.{' '}
          <button type="button" className="underline" onClick={j.refetch}>
            تلاش دوباره
          </button>
        </Notice>
      )}
      {!j.audit ? <ListSkeleton rows={6} /> : <NeutralTab nb={j.audit.neutral} fillDays={j.data.settings.neutralFillDays} accounts={j.accounts} settings={j.data.settings} />}
      <p className="text-xs leading-6 text-muted">
        کدام حساب جهت‌دار است و کدام نوترال؟ در{' '}
        <Link to="/journal?tab=settings" className="font-semibold text-accent underline">
          تنظیمات ژورنال
        </Link>{' '}
        تعیین می‌شود.
      </p>
    </div>
  );
}
