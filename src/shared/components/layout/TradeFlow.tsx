/**
 * جریان کار معامله در دارینو — یک نوار مشترک تا جای هر بخش روشن باشد:
 *
 *   ۱. چک قبل از ورود (میز معامله)  ← «قبل» از معامله، برای «یک» پوزیشن پیشنهادی: با این بازار، جهت و اهرم چقدر احتمال لیکوئید دارم؟
 *   ۲. برنامهٔ معامله (ژورنال)        ← هنگام ورود: استاپ، هدف و ریسک دلاری (خودکار از سفارش‌های صرافی)
 *   ۳. معاملات (ژورنال)               ← ثبت خودکار اجراها؛ تگ «چرا» اختیاری
 *   ۴. حسابرسی (ژورنال)               ← «بعد» از معامله‌ها، روی «همهٔ» معاملات بسته: رفتار و نتیجه در برابر معیار حرفه‌ای
 *   ۵. مرور هفتگی (ژورنال)            ← جمع‌بندی هفته و تعهدهای قابل‌سنجش برای هفتهٔ بعد
 *
 * چک قبل از ورود به گذشتهٔ شما نگاه نمی‌کند و حسابرسی دربارهٔ پوزیشن بعدی حکم نمی‌دهد؛ این دو مکمل‌اند، نه تکرار.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';

export type FlowStep = 'check' | 'plan' | 'trades' | 'audit' | 'review';

const STEPS: { id: FlowStep; label: string; when: string; to: string }[] = [
  { id: 'check', label: 'چک قبل از ورود', when: 'قبل · یک پوزیشن', to: '/desk' },
  { id: 'plan', label: 'برنامه', when: 'هنگام ورود', to: '/journal?tab=plan' },
  { id: 'trades', label: 'معاملات', when: 'ثبت خودکار', to: '/journal?tab=trades' },
  { id: 'audit', label: 'حسابرسی', when: 'بعد · همهٔ معاملات', to: '/journal' },
  { id: 'review', label: 'مرور هفتگی', when: 'پایان هفته', to: '/journal?tab=review' }
];

export const FLOW_ROLE: Record<'check' | 'audit', string> = {
  check: 'چک قبل از ورود به آینده نگاه می‌کند: قبل از باز کردن «یک» پوزیشن، با همین بازار، جهت و اهرم احتمال لیکوئید و اهرم معقول را می‌گوید. به سابقهٔ شما کاری ندارد.',
  audit: 'حسابرسی به گذشته نگاه می‌کند: بعد از معامله‌ها، «همهٔ» معاملات بستهٔ جهت‌دار شما را با معیار حرفه‌ای می‌سنجد (نتیجه، اجرا، رفتار) و می‌گوید اول چه چیزی را درست کنید. دربارهٔ پوزیشن بعدی حکم نمی‌دهد.'
};

export function TradeFlow({ current, className }: { current: FlowStep; className?: string }) {
  return (
    <nav aria-label="جریان کار معامله" className={cn('no-scrollbar -mx-1 flex items-stretch gap-1 overflow-x-auto px-1', className)}>
      {STEPS.map((s, i) => {
        const on = s.id === current;
        return (
          <Link
            key={s.id}
            to={s.to}
            aria-current={on ? 'step' : undefined}
            className={cn(
              'flex min-w-[7.5rem] shrink-0 flex-1 flex-col rounded-control border px-2.5 py-1.5 text-start transition-colors',
              on ? 'border-accent bg-accent-soft' : 'border-divider bg-card hover:border-accent/50'
            )}
          >
            <span className={cn('text-[11px] font-bold', on ? 'text-accent' : 'text-ink')}>{(i + 1).toLocaleString('fa-IR')}. {s.label}</span>
            <span className="text-[10px] text-subtle">{s.when}</span>
          </Link>
        );
      })}
    </nav>
  );
}
