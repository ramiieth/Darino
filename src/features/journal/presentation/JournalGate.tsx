/**
 * گارد مسیر ژورنال: دستگاه قبلاً مجاز (deviceAccess.ts) بدون رمز باز می‌شود؛ بقیه همان AuthGate معمولی (رمز + کد ۶ رقمی).
 *   صفحهٔ ورود هیچ گزینهٔ «بدون رمز» ندارد؛ با ورود، همه‌چیز مثل بقیهٔ صفحه‌های خصوصی.
 */
import type { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { AuthGate } from '@/features/auth/AuthGate';
import { useAuth } from '@/features/auth/authClient';
import { lockJournalOnDevice, useJournalOpenOnDevice } from '../data/deviceAccess';

export function JournalGate({ children }: { children: ReactNode }) {
  const open = useJournalOpenOnDevice();
  const status = useAuth((s) => s.status);
  if (!open || status === 'authenticated') return <AuthGate>{children}</AuthGate>;
  return (
    <>
      <div className="px-gutter pt-3 md:px-8">
        <Notice tone="info">
          <span className="block">این دستگاه بدون رمز به ژورنال دسترسی دارد. دادهٔ همین دستگاه نمایش داده می‌شود؛ برای همگام‌سازی با دستگاه‌های دیگر یک‌بار وارد شوید.</span>
          <Button size="sm" variant="ghost" className="mt-1" icon={<LockKeyhole />} onClick={lockJournalOnDevice}>قفل این دستگاه</Button>
        </Notice>
      </div>
      {children}
    </>
  );
}
