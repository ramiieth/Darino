import { cn } from '@/shared/lib/cn';

export function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-100"
      aria-hidden
    >
      {/* هاله‌های بسیار ملایم — بدون بلاک‌های رنگی برجسته */}
      <div
        className="absolute -top-40 start-1/4 h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'rgb(var(--c-accent) / 0.05)' }}
      />
      <div
        className="absolute bottom-0 end-0 h-72 w-72 rounded-full blur-3xl"
        style={{ background: 'rgb(var(--c-info) / 0.04)' }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // در عرض‌های باریک: Actions به خط دوم می‌روند (بدون فشار بر عنوان)
        'anim-fade-up mb-5 flex flex-wrap items-start justify-between gap-x-3 gap-y-2',
        className
      )}
    >
      <div className="min-w-0 flex-1 basis-48">
        <h1 className="text-lg font-extrabold leading-snug tracking-tight text-ink md:text-2xl md:font-black">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[12px] font-medium leading-5 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
