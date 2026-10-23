/**
 * ⑪ اجرا و پایش دلتا — سه حالت:
 *   پیش از اجرا   شبیه‌سازی اجرای ربات Tread.fi در برابر «محاسبهٔ ساده» (ExecutionPlanner)
 *   برگهٔ سفارش   تعداد، تکه‌ها و ترتیب سفارش برای باز/بستن دستی + پیشرفت از حساب (OrderTicket)
 *   در حال اجرا   پوزیشن‌های واقعی حساب‌های لایتر/آرکوس (LiveMonitor)
 * حالت‌های حساب‌خوان فقط وقتی باز شوند mount می‌شوند تا حساب‌ها بی‌دلیل خوانده نشوند.
 */
import { useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { ExecutionPlanner, type ExecutionHandoff } from './ExecutionPlanner';
import { LiveMonitor } from './LiveMonitor';
import { OrderTicket } from './OrderTicket';

type Mode = 'plan' | 'ticket' | 'live';

export function DeltaExecutionTab({ handoff }: { handoff: ExecutionHandoff | null }) {
  const [mode, setMode] = useState<Mode>('plan');
  const [liveOpened, setLiveOpened] = useState(false);
  if (mode === 'live' && !liveOpened) setLiveOpened(true);
  const [ticketOpened, setTicketOpened] = useState(false);
  if (mode === 'ticket' && !ticketOpened) setTicketOpened(true);
  return (
    <div className="space-y-5">
      <SegmentedControl<Mode>
        label="حالت"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'plan', label: 'پیش از اجرا (شبیه‌سازی)' },
          { value: 'ticket', label: 'برگهٔ سفارش دستی' },
          { value: 'live', label: 'در حال اجرا (حساب واقعی)' }
        ]}
      />
      <div className={cn(mode !== 'plan' && 'hidden')}>
        <ExecutionPlanner handoff={handoff} />
      </div>
      <div className={cn(mode !== 'ticket' && 'hidden')}>{ticketOpened && <OrderTicket />}</div>
      <div className={cn(mode !== 'live' && 'hidden')}>{liveOpened && <LiveMonitor />}</div>
    </div>
  );
}
