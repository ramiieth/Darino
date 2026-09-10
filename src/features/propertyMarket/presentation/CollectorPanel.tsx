/** ============================================================
 * Property Market — پنل کلکشنر دیوار
 *
 *  - اجرای کلکشن از مسیر سرور (مرورگر مستقیم به دیوار نمی‌زند)
 *  - نمایش پیشرفت + قیف پاک‌سازی آخرین Snapshot (شفافیت §۱۸)
 * ============================================================ */
import { Download, Loader2, Radar } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { fmtInt, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import type { PropertyMarketSnapshot } from '../domain/types';
import type { CollectState } from '../data/store';

function FunnelStep({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-line/10 px-2 py-1.5 text-center', dim && 'opacity-60')}>
      <p className="num-ltr text-[12px] font-extrabold text-ink">{fmtInt(value)}</p>
      <p className="text-[7px] font-bold text-muted">{label}</p>
    </div>
  );
}

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
    <GlassCard className="p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold text-ink">
          <Radar className="h-3.5 w-3.5 text-accent" />
          کلکشنر دیوار — آپارتمان‌های فروشی اهواز
        </h3>
        <Button onClick={onCollect} disabled={busy} className="h-8 gap-1.5 px-3 text-[9px] font-extrabold">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {busy ? collect.message ?? 'در حال اجرا…' : 'جمع‌آوری از دیوار'}
        </Button>
      </div>

      {collect.status === 'unavailable' && (
        <p className="mt-2 rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-1.5 text-[8px] font-bold leading-4 text-muted">
          {collect.message}
        </p>
      )}
      {collect.status === 'error' && (
        <p className="mt-2 rounded-lg border border-negative/20 bg-negative/5 px-2.5 py-1.5 text-[8px] font-bold leading-4 text-negative">
          خطا در کلکشن: {collect.message}
        </p>
      )}
      {busy && (
        <p className="mt-2 text-[8px] font-bold text-muted">
          تکه‌های پردازش‌شده: {toFaDigits(collect.chunks)} · آگهی جدید: {fmtInt(collect.listingsAdded)} · جزئیات
          واکشی‌شده: {fmtInt(collect.detailsFetched)}
        </p>
      )}
      {collect.status === 'done' && collect.message && (
        <p className="mt-2 rounded-lg border border-positive/20 bg-positive/5 px-2.5 py-1.5 text-[8px] font-bold text-positive">
          {collect.message}
        </p>
      )}

      {c && (
        <div className="mt-3">
          <p className="mb-1.5 text-[8px] font-extrabold text-muted">
            قیف پاک‌سازی آخرین داده بازار
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            <FunnelStep label="خام" value={c.raw} />
            <FunnelStep label="معتبر" value={c.valid} />
            <FunnelStep label="بدون تکراری" value={c.market + c.outliersRemoved} dim />
            <FunnelStep label="حذف پرت" value={c.outliersRemoved} />
            <FunnelStep label="نهایی" value={c.market} />
          </div>
        </div>
      )}
    </GlassCard>
  );
}
