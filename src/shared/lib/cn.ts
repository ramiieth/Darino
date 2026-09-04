import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** ترکیب کلاس‌های Tailwind با رفع تداخل */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
