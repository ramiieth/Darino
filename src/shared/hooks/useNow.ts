/**
 * useNow — ساعت زنده سبک برای نمایش «سن نسبی داده»
 * هر `intervalMs` (پیش‌فرض ۱۰ ثانیه) re-render می‌کند تا متن «X ثانیه پیش» به‌روز بماند.
 */
import { useEffect, useState } from 'react';

export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}
