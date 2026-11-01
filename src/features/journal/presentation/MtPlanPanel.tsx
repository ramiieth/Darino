/**
 * حالت متاتریدر برنامهٔ معامله — پیشنهاد استاپ/هدف/جهت از تاریخچهٔ خود کاربر + حجم به لات، پیپ، ارزش پیپ و مارجین
 *
 *   قیمت ورود پیش‌فرض: میانهٔ لحظه‌ای پرپ هم‌نام (با قیمت بروکر کمی فرق دارد؛ قیمت متاتریدر را بنویسید).
 *   «اعمال پیشنهاد» استاپ و هدف را از پنل مسیر قیمت پر می‌کند؛ هر دو قابل تغییرند.
 *   اندازهٔ برنامه = لات × اندازهٔ قرارداد، تا R و نظم استاپ در حسابرسی برای پوزیشن متاتریدر درست حساب شود.
 */
import { useMemo } from 'react';
import { Wand2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { ClassifiedTrade, Direction, MtPlanParams } from '../domain/types';
import type { MtTrade } from '../domain/metatrader';
import { calcForex, contractSizeFor, suggest, type EdgeStat } from '../domain/forex';
import { useExcursions } from '../data/useExcursions';
import { CAPITALS, digitsFor } from '../domain/quick';
import { fa, parseNum, pct, usd } from './parts';
import { Chip, PresetNum, usdShort } from './quickInputs';

export function defaultMtParams(symbol: string, mt: readonly MtTrade[], accountSize: number | null, maxRiskPct: number): MtPlanParams {
  return { capital: accountSize, riskPct: maxRiskPct, leverage: 100, contractSize: contractSizeFor(symbol, mt).size, spreadPips: 0, commissionPerLot: 0 };
}

function Edge({ label, s }: { label: string; s: EdgeStat | null }) {
  if (!s) return <p className="text-xs text-subtle">{label}: معامله‌ای نیست</p>;
  return <p className="text-xs text-muted">{label}: {fa(s.n)} معامله · برد {pct(s.winRate * 100, 0)} · میانگین <span className={s.expectancy >= 0 ? 'text-positive' : 'text-negative'}>{usd(s.expectancy, true)}</span></p>;
}

export function MtPlanPanel({ symbol, direction, entry, stop, target, params, onParams, onLevels, mt, trades, tz, quoteUsd = null }: {
  symbol: string;
  direction: Direction;
  entry: string;
  stop: string;
  target: string;
  params: MtPlanParams;
  onParams: (p: MtPlanParams) => void;
  onLevels: (p: { entry?: string; stop?: string; target?: string }) => void;
  mt: readonly MtTrade[];
  trades: readonly ClassifiedTrade[];
  tz: string;
  /** ارزش دلاری ارز دوم (useQuoteUsd) */
  quoteUsd?: number | null;
}) {
  const sym = symbol.trim().toUpperCase();
  const symTrades = useMemo(() => trades.filter((t) => t.venue === 'metatrader' && t.symbol === sym), [trades, sym]);
  const ex = useExcursions(symTrades);
  const e = parseNum(entry);
  const sg = suggest({ symbol: sym, direction, entry: e, now: Date.now(), tz }, ex.symbols.find((s) => s.symbol === sym), trades);
  const c = calcForex({ symbol: sym, direction, entry: e, stop: parseNum(stop), target: parseNum(target), ...params, quoteUsd });
  const cs = contractSizeFor(sym, mt);
  const set = <K extends keyof MtPlanParams>(k: K, v: MtPlanParams[K]) => onParams({ ...params, [k]: v });
  const digits = digitsFor(e ?? 1);

  return (
    <div className="space-y-3">
      <Surface variant="subtle" className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
        <Cell label={`حجم (ریسک ${fa(params.riskPct, 2)}٪)`} value={c.lots === null ? '—' : `${fa(c.lots, 2)} لات`} strong />
        <Cell label="ریسک" value={`${usd(c.riskUsd)}${c.riskPct !== null ? ` (${pct(c.riskPct, 2)})` : ''}`} tone={c.riskPct !== null && c.riskPct > params.riskPct ? 'text-negative' : undefined} />
        <Cell label="سود در هدف" value={usd(c.rewardUsd)} tone={c.rewardUsd ? 'text-positive' : undefined} />
        <Cell label="مارجین لازم" value={usd(c.margin)} />
        <Cell label="استاپ / هدف" value={`${fa(c.stopPips, 1)} / ${fa(c.targetPips, 1)} پیپ`} />
        <Cell label="ارزش هر پیپ" value={c.pipValuePerLot === null ? '—' : c.lots ? usd(c.pipValuePerLot * c.lots) : `${usd(c.pipValuePerLot)} / لات`} />
        <Cell label="سود به ریسک" value={c.rr === null ? '—' : fa(c.rr, 2)} />
        <Cell label="اندازهٔ پیپ" value={fa(c.pip, 4)} />
      </Surface>
      {c.problems.map((p) => <Notice key={p} tone="warn">{p}</Notice>)}

      <Disclosure summary={`سرمایه، ریسک و لات — ${params.capital ? usd(params.capital) : 'سرمایه نامعلوم'} · ${fa(params.riskPct, 2)}٪ · ۱:${fa(params.leverage)}`} defaultOpen={!params.capital}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <PresetNum label="سرمایهٔ حساب متاتریدر" values={CAPITALS} value={params.capital?.toString() ?? ''} onChange={(v) => set('capital', parseNum(v))} format={usdShort} suffix="$" />
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">ریسک هر معامله</p>
              <div className="flex flex-wrap gap-1.5">
                {[0.5, 1, 2].map((r) => <Chip key={r} on={params.riskPct === r} onClick={() => set('riskPct', r)}>{fa(r, 1)}٪</Chip>)}
              </div>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">اهرم حساب</p>
            <div className="flex flex-wrap gap-1.5">
              {[30, 100, 200, 500].map((l) => <Chip key={l} on={params.leverage === l} onClick={() => set('leverage', l)}>۱:{fa(l)}</Chip>)}
            </div>
          </div>
          <Disclosure summary="اندازهٔ قرارداد، اسپرد و کمیسیون (پیش‌فرض‌ها معمولاً درست‌اند)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`اندازهٔ قرارداد هر لات${cs.source === 'statement' ? ' (از استیتمنت)' : cs.source === 'default' ? ' (پیش‌فرض رایج)' : ''}`}><Input inputMode="decimal" dir="ltr" value={params.contractSize?.toString() ?? ''} onChange={(ev) => set('contractSize', parseNum(ev.target.value))} /></Field>
              <Field label="اسپرد (پیپ)"><Input inputMode="decimal" dir="ltr" value={String(params.spreadPips)} onChange={(ev) => set('spreadPips', Math.max(0, parseNum(ev.target.value) ?? 0))} /></Field>
              <Field label="کمیسیون رفت‌وبرگشت هر لات ($)"><Input inputMode="decimal" dir="ltr" value={String(params.commissionPerLot)} onChange={(ev) => set('commissionPerLot', Math.max(0, parseNum(ev.target.value) ?? 0))} /></Field>
            </div>
          </Disclosure>
        </div>
      </Disclosure>

      {/* پیشنهاد از تاریخچه */}
      <Surface variant="subtle" className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-ink">پیشنهاد از تاریخچهٔ خودتان</p>
          <Badge tone={sg.enough ? 'info' : 'neutral'}>{sg.enough ? 'پیشنهاد' : 'فرضیه'}</Badge>
        </div>
        {sg.stop !== null && sg.target !== null ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>استاپ <b className="num-ltr text-negative">{fa(sg.stop, digits)}</b> <span className="text-subtle">({pct((sg.stopFrac ?? 0) * 100, 2)})</span></span>
            <span>هدف <b className="num-ltr text-positive">{fa(sg.target, digits)}</b> <span className="text-subtle">({pct((sg.targetFrac ?? 0) * 100, 2)})</span></span>
            <Button size="sm" variant="outline" icon={<Wand2 />} onClick={() => onLevels({ stop: sg.stop!.toFixed(digits), target: sg.target!.toFixed(digits) })}>اعمال پیشنهاد</Button>
          </div>
        ) : (
          <p className="text-xs text-muted">{e === null ? 'قیمت ورود لازم است.' : 'با استیتمنت بیشتر از همین نماد، استاپ و هدف از معامله‌های خودتان پیشنهاد می‌شود.'}</p>
        )}
        <Edge label={`${direction === 'long' ? 'لانگ' : 'شورت'}‌های قبلی شما روی ${sym || 'این نماد'}`} s={sg.direction} />
        <Edge label="جهت مخالف" s={sg.opposite} />
        <Edge label="همین ساعت روز" s={sg.hour} />
        {sg.notes.filter((n) => !n.startsWith('برای این نماد هنوز مسیر')).map((n) => <p key={n} className="text-xs text-warn">• {n}</p>)}
      </Surface>
    </div>
  );
}

function Cell({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('num-ltr font-bold', strong ? 'text-lg' : 'text-sm', tone ?? 'text-ink')}>{value}</p>
    </div>
  );
}
