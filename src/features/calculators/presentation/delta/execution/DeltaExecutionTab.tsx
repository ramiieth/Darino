/**
 * ⑪ اجرا و پایش دلتا — دو حالت:
 *   پیش از اجرا   شبیه‌سازی اجرای ربات Tread.fi در برابر «محاسبهٔ ساده» (ExecutionPlanner)
 *   در حال اجرا   پوزیشن‌های واقعی حساب‌های لایتر/آرکوس (LiveMonitor)
 * حالت «در حال اجرا» فقط وقتی باز شود mount می‌شود تا حساب‌ها بی‌دلیل خوانده نشوند.
 */
import { useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { ExecutionPlanner, type ExecutionHandoff } from './ExecutionPlanner';
import { LiveMonitor } from './LiveMonitor';

type Mode = 'plan' | 'live';

export function DeltaExecutionTab({ handoff }: { handoff: ExecutionHandoff | null }) {
  const [mode, setMode] = useState<Mode>('plan');
  const [liveOpened, setLiveOpened] = useState(false);
  if (mode === 'live' && !liveOpened) setLiveOpened(true);
  return (
    <div className="space-y-5">
      <SegmentedControl<Mode>
        label="حالت"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'plan', label: 'پیش از اجرا (شبیه‌سازی)' },
          { value: 'live', label: 'در حال اجرا (حساب واقعی)' }
        ]}
      />
      <div className={cn(mode !== 'plan' && 'hidden')}>
        <ExecutionPlanner handoff={handoff} />
      </div>
      <div className={cn(mode !== 'live' && 'hidden')}>{liveOpened && <LiveMonitor />}</div>
    </div>
  );
}
