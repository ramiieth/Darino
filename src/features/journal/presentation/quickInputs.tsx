/**
 * ورودی‌های سریع ژورنال (وب و PWA): لمس به‌جای تایپ — نماد، جهت، زمان، قیمت بازار
 *   قیمت بازار از هایپرلیکوئید (پرپ هم‌نام): لحظه‌ای، یا کندلِ همان لحظهٔ گذشته. با قیمت بروکر کمی فرق دارد و همیشه قابل‌ویرایش است.
 */
import { useState } from 'react';
import { Input } from '@/shared/components/ui/Input';
import { cn } from '@/shared/lib/cn';
import type { Direction } from '../domain/types';
import { planCoin } from '../domain/baseRate';
import { inWeekendGap } from '../domain/excursions';
import { priceAt, stopFractions, TIME_PRESETS, type PlanKind } from '../domain/quick';
import { useCandles, useLiveMid } from '../data/useExcursions';

const chip = (on: boolean) =>
  cn(
    'h-9 shrink-0 rounded-control border px-3 text-sm font-semibold transition-colors coarse:h-10',
    on ? 'border-ink bg-ink text-card' : 'border-divider-strong bg-card text-muted hover:text-ink'
  );

/** دکمهٔ تراشه‌ای ساده (برای گروه‌های کوچک) */
export function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn(chip(on), className)}>{children}</button>;
}

export function Label({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-muted">{children}</p>
      {aside}
    </div>
  );
}

/** نماد: پرکاربردهای کاربر به‌صورت تراشه + «دیگر…» برای تایپ */
export function SymbolPicker({ value, onChange, options }: { value: string; onChange: (s: string) => void; options: readonly string[] }) {
  const v = value.trim().toUpperCase();
  const [typing, setTyping] = useState(!!v && !options.includes(v));
  return (
    <div>
      <Label>نماد</Label>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="نماد">
        {options.map((s) => <Chip key={s} on={!typing && v === s} onClick={() => { setTyping(false); onChange(s); }}><span dir="ltr">{s}</span></Chip>)}
        <Chip on={typing} onClick={() => setTyping(true)}>دیگر…</Chip>
      </div>
      {typing && <Input className="mt-2" dir="ltr" autoFocus autoCapitalize="characters" aria-label="نماد دیگر" placeholder="مثلاً DOGE یا USDJPY" value={value} onChange={(e) => onChange(e.target.value.slice(0, 20))} />}
    </div>
  );
}

export function DirectionPicker({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  return (
    <div>
      <Label>جهت</Label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="جهت">
        {(['long', 'short'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            onClick={() => onChange(d)}
            className={cn(
              'h-11 rounded-control border text-sm font-bold transition-colors',
              value === d ? (d === 'long' ? 'border-gain bg-gain/15 text-positive' : 'border-negative bg-negative/15 text-negative') : 'border-divider-strong bg-card text-muted'
            )}
          >
            {d === 'long' ? 'لانگ (خرید) ▲' : 'شورت (فروش) ▼'}
          </button>
        ))}
      </div>
    </div>
  );
}

const toLocalInput = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** «کی؟»: الان، چند ساعت پیش، دیروز، یا زمان دقیق */
export function WhenPicker({ label, value, onChange, now }: { label: string; value: number; onChange: (t: number) => void; now: number }) {
  const preset = TIME_PRESETS.find((p) => Math.abs(now - p.ago - value) < 60_000)?.key ?? null;
  const [exact, setExact] = useState(preset === null);
  return (
    <div>
      <Label>{label}</Label>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label={label}>
        {TIME_PRESETS.map((p) => <Chip key={p.key} on={!exact && preset === p.key} onClick={() => { setExact(false); onChange(now - p.ago); }}>{p.label}</Chip>)}
        <Chip on={exact} onClick={() => setExact(true)}>زمان دقیق</Chip>
      </div>
      {exact && <Input className="mt-2" type="datetime-local" dir="ltr" aria-label={`${label} — زمان دقیق`} max={toLocalInput(now)} value={toLocalInput(value)} onChange={(e) => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) onChange(Math.min(t, now)); }} />}
    </div>
  );
}

/** ورودی عدد با یک دکمهٔ «پر کن» کنار عنوان */
export function NumInput({ label, value, onChange, fill, fillLabel, suffix, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fill?: (() => void) | null;
  fillLabel?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <Label aside={fill && <button type="button" onClick={fill} className="text-xs font-semibold text-accent hover:underline">{fillLabel}</button>}>{label}</Label>
      <Input inputMode="decimal" dir="ltr" aria-label={label} value={value} placeholder={placeholder} suffix={suffix} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** قیمت بازار: لحظه‌ای + کندل‌ها (برای قیمتِ یک لحظهٔ گذشته و نوسان) */
export function useMarket(symbol: string, kind: PlanKind) {
  const coin = planCoin(symbol, kind);
  const live = useLiveMid(coin);
  const c15 = useCandles(coin, '15m', 15 * 60_000);
  const c1h = useCandles(coin, '1h', 3_600_000);
  const sets = [c15.data, c1h.data].filter((s): s is NonNullable<typeof s> => !!s);
  const clean = (s: (typeof sets)[number]) => (kind === 'mt' ? s.candles.filter((c) => !inWeekendGap(c.t)) : s.candles);
  return {
    coin,
    live: live.data ?? null,
    /** قیمت لحظهٔ t؛ نزدیک به الان = لحظه‌ای */
    at(t: number): number | null {
      if (Date.now() - t < 5 * 60_000 && live.data) return live.data;
      for (const s of sets) {
        const p = priceAt(s.candles, t, s.intervalMs);
        if (p !== null) return p;
      }
      return null;
    },
    stops: c1h.data ? stopFractions(clean(c1h.data), c1h.data.intervalMs) : c15.data ? stopFractions(clean(c15.data), c15.data.intervalMs) : null
  };
}
