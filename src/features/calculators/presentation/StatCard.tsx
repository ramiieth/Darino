import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';

/** کارت آماری شیشه‌ای برای نتایج */
export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  delay = 0
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="glass-soft rounded-2xl p-3.5"
    >
      <p className="text-[10px] font-bold text-muted">{label}</p>
      <p
        className={cn(
          'num-ltr mt-1.5 text-lg font-black leading-6',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'accent' && 'text-accent',
          tone === 'neutral' && 'text-ink'
        )}
      >
        {value}
      </p>
      {sub && <p className="num-ltr mt-0.5 text-[10px] font-semibold text-muted">{sub}</p>}
    </motion.div>
  );
}
