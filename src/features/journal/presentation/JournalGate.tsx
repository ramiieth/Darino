/**
 * گارد مسیر ژورنال: دستگاه خود کاربر (deviceAccess.ts) بدون رمز باز می‌شود؛ دستگاه تازه همان AuthGate معمولی (رمز + کد ۶ رقمی).
 *   «قفل این دستگاه» با تأیید؛ دستگاهی که خود کاربر قفل کرده روی صفحهٔ ورود ژورنال گزینهٔ «باز کردن دوباره» دارد. دستگاه تازه هیچ گزینه‌ای ندارد.
 */
import type { ReactNode } from 'react';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { AuthGate } from '@/features/auth/AuthGate';
import { useAuth } from '@/features/auth/authClient';
import { lockJournalOnDevice, unlockJournalOnDevice, useJournalDeviceAccess } from '../data/deviceAccess';

const LOCK_CONFIRM = 'ژورنال روی این دستگاه قفل شود؟ بعد از آن برای باز کردنش رمز لازم است (یا «باز کردن دوباره» روی همین دستگاه).';

export function JournalGate({ children }: { children: ReactNode }) {
  const access = useJournalDeviceAccess();
  const status = useAuth((s) => s.status);
  if (status === 'authenticated') return <>{children}</>;
  if (access === 'checking') return <PageSkeleton label="ژورنال معاملاتی" />;
  if (access === 'locked') return <AuthGate extra={<Reopen />}>{children}</AuthGate>;
  if (access === 'new') return <AuthGate>{children}</AuthGate>;
  return (
    <>
      <div className="px-gutter pt-3 md:px-8">
        <Notice tone="info">
          <span className="block">ژورنال روی این دستگاه بدون رمز باز است و دادهٔ همین دستگاه را نشان می‌دهد. برای همگام‌سازی با دستگاه‌های دیگر یک‌بار وارد شوید.</span>
          <Button size="sm" variant="ghost" className="mt-1" icon={<LockKeyhole />} onClick={() => window.confirm(LOCK_CONFIRM) && lockJournalOnDevice()}>قفل این دستگاه</Button>
        </Notice>
      </div>
      {children}
    </>
  );
}

function Reopen() {
  return (
    <div className="space-y-2 border-t border-divider pt-4">
      <p className="text-xs leading-5 text-muted">ژورنال را روی همین دستگاه خودتان قفل کرده بودید.</p>
      <Button className="w-full" variant="outline" icon={<LockKeyholeOpen />} onClick={unlockJournalOnDevice}>باز کردن دوباره روی این دستگاه</Button>
    </div>
  );
}
