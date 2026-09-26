/** ============================================================
 * Property Market — پنل کلکشنر دیوار
 *
 *  - اجرای کلکشن از مسیر سرور (مرورگر مستقیم به دیوار نمی‌زند)
 *  - نمایش پیشرفت + قیف پاک‌سازی آخرین Snapshot (شفافیت §۱۸)
 * ============================================================ */
import { Download } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { fmtInt, toFaDigits } from '@/shared/utils/formatters';
import type { PropertyMarketSnapshot } from '../domain/types';
import type { CollectState } from '../data/store';

export function CollectorPanel({
  collect,
  lastSnapshot,
  onCollect
}: {
  collect: CollectState;
  lastSnapshot: PropertyMarketSnapshot | null;
  onCollect: () => void;
}) {
  const busy = collect.status === 'running' || collect.status === 'finalizing';
  const c = lastSnapshot?.cleaning;

  return (
    <Surface className="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">کلکشنر دیوار</h2>
          <p className="text-xs text-muted">آپارتمان‌های فروشی اهواز — از مسیر سرور (مرورگر مستقیم به دیوار درخواست نمی‌دهد)</p>
        </div>
        <Button onClick={onCollect} loading={busy} icon={<Download />} size="sm">
          {busy ? collect.message ?? 'در حال اجرا…' : 'جمع‌آوری از دیوار'}
        </Button>
      </div>

      {collect.status === 'unavailable' && <Notice tone="warn" className="mt-4">{collect.message}</Notice>}
      {collect.status === 'error' && <Notice tone="error" className="mt-4" title="خطا در کلکشن">{collect.message}</Notice>}
      {busy && (
        <p className="mt-3 text-xs text-muted" role="status">
          تکه‌های پردازش‌شده {toFaDigits(collect.chunks)} · آگهی جدید {fmtInt(collect.listingsAdded)} · جزئیات واکشی‌شده{' '}
          {fmtInt(collect.detailsFetched)}
        </p>
      )}
      {collect.status === 'done' && collect.message && <Notice tone="success" className="mt-4">{collect.message}</Notice>}

      {c && (
        <div className="mt-5 border-t border-divider pt-4">
          <p className="mb-2 text-xs font-semibold text-muted">قیف پاک‌سازی آخرین داده</p>
          <ol className="grid grid-cols-5 gap-2 text-center">
            {[
              ['خام', c.raw],
              ['معتبر', c.valid],
              ['یکتا', c.market + c.outliersRemoved],
              ['پرت حذف‌شده', c.outliersRemoved],
              ['نهایی', c.market]
            ].map(([label, value]) => (
              <li key={label as string} className="rounded-field bg-surface-2 px-1 py-2">
                <p className="text-sm font-bold text-ink">{fmtInt(value as number)}</p>
                <p className="text-2xs text-muted">{label}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Surface>
  );
}
