/**
 * ورودی‌های سریع ژورنال (وب و PWA): انتخاب به‌جای تایپ — بازار، نماد، جهت، زمان، عدد آماده، قیمت بازار
 *   قیمت بازار از هایپرلیکوئید (کریپتو، طلا و نقره از بازار xyz): لحظه‌ای،
 *   یا کندلِ همان لحظهٔ گذشته؛ همیشه قابل‌ویرایش است.
 *   تایپ فقط آخرین راه است («دیگر…» / «عدد دیگر»).
 */
import { useState } from 'react';
import { Input } from '@/shared/components/ui/Input';
import { cn } from '@/shared/lib/cn';
import type { Direction } from '../domain/types';
import { planCoin } from '../domain/baseRate';
import { ALL_SYMBOLS, priceAt, stopFractions, SYMBOL_FA, type StopPreset } from '../domain/quick';
import { useCandles, useLiveMid } from '../data/useExcursions';
import { fa } from './parts';
import { usdText } from '@/shared/utils/formatters';

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

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label={label}>{children}</div>
);

/** نمادهای پرکاربرد + «همه» (فهرست کامل انتخابی) + تایپ فقط برای نماد ناموجود */
export function SymbolPicker({ value, onChange, options }: {
  value: string;
  onChange: (s: string) => void;
  /** پرکاربردهای کاربر */
  options: readonly string[];
}) {
  const v = value.trim().toUpperCase();
  const quick = [...new Set([...options, ...ALL_SYMBOLS])].slice(0, 7);
  const [more, setMore] = useState(false);
  const [typing, setTyping] = useState(!!v && !ALL_SYMBOLS.includes(v) && !options.includes(v));
  const pick = (s: string) => { setTyping(false); setMore(false); onChange(s); };
  return (
    <div className="space-y-2">
      <Label>نماد {v && SYMBOL_FA[v] ? <span className="font-normal text-subtle">· {SYMBOL_FA[v]}</span> : null}</Label>
      <Row label="نماد">
        {quick.map((s) => <Chip key={s} on={!typing && v === s} onClick={() => pick(s)}><span dir="ltr">{s}</span></Chip>)}
        {!quick.includes(v) && v && !typing && <Chip on onClick={() => setMore(true)}><span dir="ltr">{v}</span></Chip>}
        <Chip on={more} onClick={() => setMore((x) => !x)}>همه…</Chip>
      </Row>
      {more && (
        <div className="rounded-card border border-divider p-2">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {ALL_SYMBOLS.map((s) => (
              <button key={s} type="button" onClick={() => pick(s)} className={cn('rounded-control border px-2 py-1.5 text-start', v === s ? 'border-ink bg-ink text-card' : 'border-divider hover:border-accent')}>
                <span className="block text-sm font-bold" dir="ltr">{s}</span>
                {SYMBOL_FA[s] && <span className={cn('block truncate text-[10px]', v === s ? 'text-card/70' : 'text-subtle')}>{SYMBOL_FA[s]}</span>}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setTyping(true); setMore(false); }} className="mt-2 text-xs font-semibold text-accent hover:underline">نماد در فهرست نیست؟ بنویسید</button>
        </div>
      )}
      {typing && <Input dir="ltr" autoFocus autoCapitalize="characters" aria-label="نماد دیگر" placeholder="مثلاً PENGU" value={value} onChange={(e) => onChange(e.target.value.slice(0, 20))} />}
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

/** عددهای آماده به‌صورت تراشه + «عدد دیگر» (تایپ فقط وقتی لازم است) */
export function PresetNum({ label, values, value, onChange, format, suffix, aside }: {
  label: string;
  values: readonly number[];
  value: string;
  onChange: (v: string) => void;
  format: (n: number) => string;
  suffix?: string;
  aside?: React.ReactNode;
}) {
  const n = Number(value);
  const isPreset = value !== '' && values.includes(n);
  const [custom, setCustom] = useState(value !== '' && !isPreset);
  return (
    <div>
      <Label aside={aside}>{label}</Label>
      <Row label={label}>
        {values.map((x) => <Chip key={x} on={!custom && n === x && value !== ''} onClick={() => { setCustom(false); onChange(String(x)); }}><span dir="ltr">{format(x)}</span></Chip>)}
        <Chip on={custom} onClick={() => { setCustom(true); if (isPreset) onChange(''); }}>عدد دیگر</Chip>
      </Row>
      {custom && <Input className="mt-2" inputMode="decimal" dir="ltr" autoFocus aria-label={label} suffix={suffix} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

/** قیمت بازار: لحظه‌ای + کندل‌ها (قیمتِ یک لحظهٔ گذشته و نوسان) + استاپ پیشنهادی */
export function useMarket(symbol: string) {
  const coin = planCoin(symbol);
  const live = useLiveMid(coin);
  const c15 = useCandles(coin, '15m', 15 * 60_000);
  const c1h = useCandles(coin, '1h', 3_600_000);
  const sets = [c15.data, c1h.data].filter((s): s is NonNullable<typeof s> => !!s);
  const livePx = live.data ?? null;
  const volStops = c1h.data ? stopFractions(c1h.data.candles, c1h.data.intervalMs) : c15.data ? stopFractions(c15.data.candles, c15.data.intervalMs) : null;
  return {
    /** منبع قیمت داریم؟ */
    covered: !!coin,
    live: livePx,
    /** قیمت لحظهٔ t؛ نزدیک به الان = لحظه‌ای */
    at(t: number): number | null {
      if (Date.now() - t < 5 * 60_000 && livePx) return livePx;
      for (const s of sets) {
        const p = priceAt(s.candles, t, s.intervalMs);
        if (p !== null) return p;
      }
      return null;
    },
    /** استاپ پیشنهادی (کسر قیمت) از نوسان بازار */
    stops(entry: number | null): { fracs: Record<StopPreset, number>; source: 'vol' } | null {
      return volStops && entry ? { fracs: volStops, source: 'vol' } : null;
    }
  };
}

export const usdShort = (n: number) => usdText(n, { compact: true });
