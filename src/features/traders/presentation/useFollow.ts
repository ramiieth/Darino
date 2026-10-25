/**
 * دکمهٔ «اعلان پوزیشن‌ها» — دنبال کردن روی حساب ذخیره می‌شود و تیک سرور اعلان می‌فرستد
 */
import { useCallback } from 'react';
import { toast } from '@/shared/store/toastStore';
import { toFaDigits } from '@/shared/utils/formatters';
import { MAX_FOLLOW, useSavedTraders } from '../data/savedTraders';

export function useFollow() {
  const saved = useSavedTraders((s) => s.saved);
  const setFollow = useSavedTraders((s) => s.setFollow);
  const isFollowing = useCallback((address: string) => saved.some((s) => s.address === address && s.follow), [saved]);
  const toggle = useCallback(
    (address: string, label?: string | null) => {
      const on = !isFollowing(address);
      const r = setFollow(address, on, label);
      if (r === 'login') toast('info', 'برای اعلان پوزیشن‌ها اول وارد حساب شوید (از تنظیمات → امنیت).');
      else if (r === 'full') toast('error', `حداکثر ${toFaDigits(MAX_FOLLOW)} تریدر را می‌شود دنبال کرد`);
      else toast('success', on ? 'هر باز و بسته کردن پوزیشن این تریدر اعلان می‌شود' : 'اعلان این تریدر خاموش شد');
    },
    [isFollowing, setFollow]
  );
  return { isFollowing, toggle };
}
