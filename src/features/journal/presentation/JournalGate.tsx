/**
 * گارد مسیر ژورنال: روی دستگاهی که «بدون رمز» شده مستقیم باز می‌شود، وگرنه همان AuthGate با یک گزینهٔ اضافه.
 *   بدون ورود فقط دادهٔ محلی همین مرورگر است (deviceAccess.ts)؛ با ورود، همه‌چیز مثل قبل.
 */
import type { ReactNode } from 'react';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { AuthGate } from '@/features/auth/AuthGate';
import { useAuth } from '@/features/auth/authClient';
import { setJournalOpenOnDevice, useJournalOpenOnDevice } from '../data/deviceAccess';

export function JournalGate({ children }: { children: ReactNode }) {
  const open = useJournalOpenOnDevice();
  const status = useAuth((s) => s.status);
  if (!open) return <AuthGate extra={<OpenHere />}>{children}</AuthGate>;
  return (
    <>
      {status !== 'authenticated' && (
        <div className="px-gutter pt-3 md:px-8">
          <Notice tone="info">
            <span className="block">
              ژورنال روی این دستگاه بدون رمز باز است. فقط دادهٔ ذخیره‌شده در همین مرورگر نمایش داده می‌شود و همگام نمی‌شود؛
              تاریخچهٔ لایتر و رابین‌هود بدون ورود دریافت نمی‌شود.
            </span>
            <Button size="sm" variant="ghost" className="mt-1" icon={<LockKeyhole />} onClick={() => setJournalOpenOnDevice(false)}>
              قفل دوباره روی این دستگاه
            </Button>
          </Notice>
        </div>
      )}
      {children}
    </>
  );
}

function OpenHere() {
  return (
    <div className="space-y-2 border-t border-divider pt-4">
      <p className="text-xs leading-5 text-muted">
        فقط ژورنال معاملاتی، فقط روی همین دستگاه: بدون رمز باز می‌شود و دادهٔ ذخیره‌شده در همین مرورگر را نشان می‌دهد.
        سرور و بقیهٔ صفحه‌ها قفل می‌مانند. هر کسی که به این مرورگر دسترسی داشته باشد ژورنال را می‌بیند.
      </p>
      <Button className="w-full" variant="outline" icon={<LockKeyholeOpen />} onClick={() => setJournalOpenOnDevice(true)}>
        باز کردن ژورنال روی این دستگاه بدون رمز
      </Button>
    </div>
  );
}
