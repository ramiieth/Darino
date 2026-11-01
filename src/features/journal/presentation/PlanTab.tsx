/**
 * تب «برنامهٔ معامله» — ترکیب کامل «Market Outlook» و «Trade Plan» (هیچ فیلدی حذف نشده) + محاسبه و ذخیرهٔ همگام
 *
 *   چشم‌انداز: شمارهٔ هفته/تاریخ (خودکار)، سوگیری هفتگی و روزانه، هم‌جهت با روند، چک‌لیست نگاشت و TPO (قابل‌ویرایش در تنظیمات)، اخبار مهم
 *   برنامه: نماد، جهت، حساب، محیط (رنج/روند)، نوع ورود (تگ «چرا» — همان که تحلیل ستاپ می‌خواند)، ورود/استاپ/هدف و «چرا»ی هرکدام،
 *           R، ریسک دلار و درصد، اندازهٔ پیشنهادی از سقف ریسک، داخل سقف؟، همگرایی‌ها، دلایل نگرفتن معامله
 *   اتصال خودکار به معاملهٔ واقعی در بازهٔ اعتبار؛ بعد از بسته‌شدن: R برنامه در برابر R واقعی.
 *   ورود از «چک قبل از ورود»: ?tab=plan&m=BTC&side=long&lev=5
 *   حداقل تایپ: نماد و جهت با لمس، ورود = قیمت لحظه‌ای، استاپ از نوسان بازار (تنگ/معمولی/باز)، هدف به مضرب R،
 *   حجم از سقف ریسک؛ بقیه (چشم‌انداز، دلیل‌ها، حساب و اعتبار) جمع‌شده و اختیاری.
 *   دو حالت: کریپتو (اندازه به واحد دارایی، اهرم) و متاتریدر (پیشنهاد از تاریخچه + لات، پیپ، مارجین — MtPlanPanel)
 *   در هر دو: نرخ پایهٔ همین استاپ و هدف روی کندل‌های اخیر بازار (BaseRatePanel)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { Bias, ClassifiedTrade, Direction, JournalAccount, JournalSettings, NewsItem, TradePlan, YesNo } from '../domain/types';
import type { MtTrade } from '../domain/metatrader';
import { calcForex, contractSizeFor } from '../domain/forex';
import { defaultMtParams, MtPlanPanel } from './MtPlanPanel';
import { BaseRatePanel } from './BaseRatePanel';
import { calcPlan, newPlan } from '../domain/plan';
import { baseOf } from '../domain/roundTrips';
import { CAPITALS, digitsFor, kindOf, R_PRESETS, recentSymbols, roundPx, STOP_PRESETS, stopFrom, targetFrom, toPips, type PlanKind, type StopPreset } from '../domain/quick';
import { savePlan, saveSettings } from '../data/journalStore';
import { fa, faDateTime, parseNum, pct, pnlTone, TagPicker, usd } from './parts';
import { Chip, DirectionPicker, Label, NumInput, PresetNum, SymbolPicker, useMarket, useQuoteUsd, usdShort } from './quickInputs';

const BIAS: { value: Bias; label: string }[] = [{ value: 'neutral', label: 'خنثی' }, { value: 'bullish', label: 'صعودی' }, { value: 'bearish', label: 'نزولی' }];
const YN: { value: YesNo; label: string }[] = [{ value: '-', label: '—' }, { value: 'y', label: 'بله' }, { value: 'n', label: 'خیر' }];
const STATUS_FA = { planned: 'برنامه‌ریزی‌شده', taken: 'گرفته شد', skipped: 'رد شد', cancelled: 'لغو' } as const;

type Num = string;
interface Draft extends Omit<TradePlan, 'entry' | 'stop' | 'target' | 'size' | 'leverage'> { entry: Num; stop: Num; target: Num; size: Num; leverage: Num }
const toDraft = (p: TradePlan): Draft => ({ ...p, entry: p.entry?.toString() ?? '', stop: p.stop?.toString() ?? '', target: p.target?.toString() ?? '', size: p.size?.toString() ?? '', leverage: p.leverage?.toString() ?? '' });
const fromDraft = (d: Draft): TradePlan => ({ ...d, entry: parseNum(d.entry), stop: parseNum(d.stop), target: parseNum(d.target), size: parseNum(d.size), leverage: parseNum(d.leverage) });

function ListEditor({ items, onChange, ph, tone }: { items: string[]; onChange: (v: string[]) => void; ph: string; tone: 'gain' | 'loss' }) {
  return (
    <div className="space-y-1.5">
      {items.map((x, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={tone === 'gain' ? 'text-positive' : 'text-negative'}>–</span>
          <Input value={x} placeholder={ph} onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value.slice(0, 200) : y)))} />
          <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" icon={<Plus />} onClick={() => onChange([...items, ''])}>افزودن</Button>
    </div>
  );
}

function PlanEditor({ initial, settings, accounts, accountSize, mt, trades, tz, onDone }: { initial: TradePlan; settings: JournalSettings; accounts: JournalAccount[]; accountSize: number | null; mt: MtTrade[]; trades: ClassifiedTrade[]; tz: string; onDone: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<StopPreset | null>(null);
  const [rPick, setRPick] = useState<number | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const o = d.outlook;
  const setO = (patch: Partial<Draft['outlook']>) => setD((x) => ({ ...x, outlook: { ...x.outlook, ...patch } }));
  const plan = fromDraft(d);
  const c = calcPlan(plan, accountSize, settings.maxRiskPct);
  const kind = d.kind ?? 'crypto';
  const mtParams = d.mt ?? defaultMtParams(d.symbol, mt, accountSize, settings.maxRiskPct);
  const market = useMarket(d.symbol, kind);
  const symbols = useMemo(() => recentSymbols(trades.map((t) => t.symbol), null, 20), [trades]);
  const isNew = initial.createdAt === initial.updatedAt;

  function setKind(k: PlanKind, symbol?: string) {
    setD((x) => {
      const sym = symbol ?? (k === 'mt' && kindOf(x.symbol) !== 'mt' ? 'XAUUSD' : k === 'crypto' && kindOf(x.symbol) !== 'crypto' ? 'BTC' : x.symbol);
      const changed = sym !== x.symbol;
      return {
        ...x,
        kind: k,
        symbol: sym,
        ...(changed ? { entry: '', stop: '', target: '' } : {}),
        mt: k === 'mt' ? { ...(x.mt ?? defaultMtParams(sym, mt, accountSize, settings.maxRiskPct)), contractSize: contractSizeFor(sym.trim().toUpperCase(), mt).size } : x.mt
      };
    });
    setPreset(null);
  }
  const pickSymbol = (s: string) => setKind(kindOf(s) === 'mt' || kind === 'mt' ? kindOf(s) : 'crypto', s);

  // قیمت ورود خالی → قیمت لحظه‌ای بازار (یک‌بار برای هر نماد)
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (d.entry === '' && market.live && filledFor.current !== d.symbol) {
      filledFor.current = d.symbol;
      set('entry', String(roundPx(market.live)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.live, d.symbol, d.entry]);

  const e = plan.entry;
  const stops = market.stops(e);
  const quoteUsd = useQuoteUsd(d.symbol, e, kind === 'mt');
  function applyStop(k: StopPreset) {
    if (!e || !stops) return;
    const st = roundPx(stopFrom(e, stops.fracs[k], d.direction));
    const r = rPick ?? 2;
    setPreset(k);
    setRPick(r);
    setD((x) => ({ ...x, stop: String(st), target: String(roundPx(targetFrom(e, st, r, x.direction))) }));
  }
  function applyR(r: number) {
    if (!e || plan.stop === null) return;
    setRPick(r);
    set('target', String(roundPx(targetFrom(e, plan.stop, r, d.direction))));
  }
  // استاپ و هدف خالی → پیشنهاد «معمولی» و ۲R از نوسان بازار (با لمس عوض می‌شود)
  useEffect(() => {
    if (isNew && e && stops && d.stop === '' && d.target === '') applyStop('normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, !!stops, d.stop, d.target]);
  function flip(dir: Direction) {
    if (dir === d.direction) return;
    // جهت عوض شد: استاپ و هدف به طرف دیگر ورود منعکس می‌شوند
    setD((x) => {
      const en = parseNum(x.entry), st = parseNum(x.stop), tg = parseNum(x.target);
      return { ...x, direction: dir, stop: en !== null && st !== null ? String(roundPx(2 * en - st)) : x.stop, target: en !== null && tg !== null ? String(roundPx(2 * en - tg)) : x.target };
    });
  }

  const checked = settings.checklist.filter((i) => o.checklist[i.id] && o.checklist[i.id] !== '-').length;
  const checklistDone = checked === settings.checklist.length;
  async function save() {
    setBusy(true);
    try {
      // متاتریدر: اندازه = لات × قرارداد تا R حسابرسی با پوزیشن واقعی هم‌واحد باشد
      const fx = kind === 'mt' ? calcForex({ symbol: plan.symbol.trim().toUpperCase(), direction: plan.direction, entry: plan.entry, stop: plan.stop, target: plan.target, ...mtParams, quoteUsd }) : null;
      const sized = fx ? { kind, mt: mtParams, size: fx.units, leverage: mtParams.leverage } : {};
      await savePlan({ ...plan, ...sized, symbol: plan.symbol.trim().toUpperCase() || 'BTC', confluences: plan.confluences.filter(Boolean), reasonsAgainst: plan.reasonsAgainst.filter(Boolean) });
      onDone();
    } finally {
      setBusy(false);
    }
  }
  const groups = [['context', 'زمینه'], ['mapping', 'نگاشت سطوح'], ['tpo', 'TPO و کامپوزیت']] as const;
  const stopPct = c.stopPct;
  // بدون اندازهٔ دلخواه، ریسک = سقف ریسک حساب (همان حجم مجاز)
  const riskBase = plan.size ? c.riskUsd : accountSize ? (accountSize * settings.maxRiskPct) / 100 : null;
  return (
    <Surface variant="focal" className="max-w-3xl space-y-5 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{isNew ? 'برنامهٔ تازه' : 'ویرایش برنامه'} <span className="font-normal text-muted">· {faDateTime(d.createdAt)}</span></p>
      </div>

      <SymbolPicker value={d.symbol} onChange={pickSymbol} options={symbols} kind={kind} onKind={(k) => setKind(k)} />
      <DirectionPicker value={d.direction} onChange={flip} />

      {/* قیمت‌ها */}
      <div className="space-y-4">
        <NumInput label="قیمت ورود" value={d.entry} onChange={(v) => set('entry', v)} placeholder={market.covered ? 'در حال دریافت قیمت…' : 'قیمت بازار این نماد را نداریم؛ بنویسید'} fill={market.live ? () => set('entry', String(roundPx(market.live!))) : null} fillLabel={market.live ? `قیمت فعلی ${fa(market.live, digitsFor(market.live))}` : undefined} />
        <div>
          <NumInput label="استاپ" value={d.stop} onChange={(v) => { setPreset(null); set('stop', v); }} suffix={stopPct !== null ? pct(stopPct, 2) : undefined} />
          {stops && e ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-subtle">{stops.source === 'vol' ? 'از نوسان بازار:' : 'فاصلهٔ رایج:'}</span>
              {STOP_PRESETS.map((p) => <Chip key={p.key} on={preset === p.key} onClick={() => applyStop(p.key)} className="h-8 px-2.5 text-xs">{p.label} {kind === 'mt' ? `${fa(toPips(d.symbol, stops.fracs[p.key], e), 0)} پیپ` : pct(stops.fracs[p.key] * 100, 1)}</Chip>)}
            </div>
          ) : !e ? <p className="mt-1 text-[11px] text-subtle">با قیمت ورود، استاپ پیشنهادی این‌جا می‌آید.</p> : null}
        </div>
        <div>
          <NumInput label="هدف" value={d.target} onChange={(v) => { setRPick(null); set('target', v); }} suffix={c.rTarget !== null ? `${fa(c.rTarget, 1)}R` : undefined} />
          {e && plan.stop !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-subtle">چند برابر ریسک:</span>
              {R_PRESETS.map((r) => <Chip key={r} on={rPick === r} onClick={() => applyR(r)} className="h-8 px-2.5 text-xs">{fa(r, 1)}R</Chip>)}
            </div>
          )}
        </div>
        {preset && stops && <p className="text-[11px] text-subtle">{stops.source === 'vol' ? `استاپ «${STOP_PRESETS.find((p) => p.key === preset)!.label}» = ${fa(STOP_PRESETS.find((p) => p.key === preset)!.mult)} برابر نوسان معمول یک ساعت همین بازار.` : 'فاصلهٔ رایج معامله‌گرهای این نماد (دادهٔ نوسان این جفت‌ارز را نداریم).'} با لمس عوض کنید یا عدد خودتان را بنویسید.</p>}
      </div>

      {kind === 'mt' ? (
        <MtPlanPanel
          symbol={d.symbol} direction={d.direction} entry={d.entry} stop={d.stop} target={d.target}
          params={mtParams} onParams={(p) => set('mt', p)}
          onLevels={(l) => { setPreset(null); setD((x) => ({ ...x, ...l })); }}
          mt={mt} trades={trades} tz={tz} quoteUsd={quoteUsd}
        />
      ) : (
        <>
          {!accountSize && <AccountSizeAsk settings={settings} />}
          <Surface variant="subtle" className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <Cell label={`حجم مجاز (ریسک ${fa(settings.maxRiskPct, 2)}٪)`} strong value={c.suggestedSize === null ? '—' : `${usd(c.suggestedNotional)}`} sub={c.suggestedSize !== null ? `${c.suggestedSize.toPrecision(4)} ${baseLabel(d.symbol)}` : undefined} />
            <Cell label="ریسک" value={`${usd(riskBase)}${plan.size && c.riskPct !== null ? ` (${pct(c.riskPct, 2)})` : ''}`} tone={c.withinLimit === false ? 'text-negative' : undefined} />
            <Cell label="سود در هدف" tone="text-positive" value={usd(riskBase !== null && c.rTarget !== null ? riskBase * c.rTarget : null)} />
            <Cell label="فاصلهٔ استاپ" value={pct(c.stopPct, 2)} />
          </Surface>
          <Disclosure summary={plan.size || plan.leverage ? `اندازه و اهرم: ${plan.size ? fa(plan.size, 4) : 'مجاز'}${plan.leverage ? ` · ${fa(plan.leverage)}x` : ''}` : 'اندازه و اهرم دلخواه (اختیاری)'}>
            <div className="space-y-3">
              <NumInput label={`اندازه (${baseLabel(d.symbol)})`} value={d.size} onChange={(v) => set('size', v)} placeholder={c.suggestedSize ? c.suggestedSize.toPrecision(4) : ''} fill={c.suggestedSize ? () => set('size', c.suggestedSize!.toPrecision(4)) : null} fillLabel="همان حجم مجاز" />
              <div>
                <Label>اهرم</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 3, 5, 10, 20].map((l) => <Chip key={l} on={plan.leverage === l} onClick={() => set('leverage', plan.leverage === l ? '' : String(l))}>{fa(l)}x</Chip>)}
                </div>
              </div>
            </div>
          </Disclosure>
          {c.withinLimit !== null && <p className={cn('text-xs font-semibold', c.withinLimit ? 'text-positive' : 'text-negative')}>{c.withinLimit ? '✓ داخل سقف ریسک' : '✕ بیشتر از سقف ریسک'}</p>}
          {c.problems.map((p, i) => <Notice key={i} tone="warn">{p}</Notice>)}
        </>
      )}

      <div>
        <Label>چرا وارد می‌شوم؟ (تگ — در تحلیل ستاپ «قبل از نتیجه» شمرده می‌شود)</Label>
        <TagPicker label="نوع ورود" tags={settings.whyTags} value={d.setupTags} onChange={(v) => set('setupTags', v)} />
      </div>

      <div className="divide-y divide-divider rounded-card border border-divider px-3">
        <Disclosure summary="شانس رسیدن به هدف در بازار اخیر">
          <BaseRatePanel symbol={plan.symbol} kind={kind} direction={plan.direction} entry={plan.entry} stop={plan.stop} target={plan.target} />
          {!(plan.entry && plan.stop && plan.target) && <p className="text-xs text-muted">ورود، استاپ و هدف لازم است.</p>}
        </Disclosure>

        <Disclosure summary="دلیل‌ها و یادداشت (اختیاری)">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="چرا اینجا وارد می‌شوم"><textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={d.entryWhy} onChange={(ev) => set('entryWhy', ev.target.value.slice(0, 1000))} /></Field>
              <Field label="چرا استاپ اینجاست"><textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={d.stopWhy} onChange={(ev) => set('stopWhy', ev.target.value.slice(0, 1000))} /></Field>
              <Field label="چرا هدف اینجاست"><textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={d.targetWhy} onChange={(ev) => set('targetWhy', ev.target.value.slice(0, 1000))} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="mb-1 text-xs font-semibold text-positive">همگرایی‌ها</p><ListEditor tone="gain" ph="همگرایی…" items={d.confluences.length ? d.confluences : ['']} onChange={(v) => set('confluences', v)} /></div>
              <div><p className="mb-1 text-xs font-semibold text-negative">دلایل نگرفتن این معامله</p><ListEditor tone="loss" ph="دلیل مخالف…" items={d.reasonsAgainst.length ? d.reasonsAgainst : ['']} onChange={(v) => set('reasonsAgainst', v)} /></div>
            </div>
          </div>
        </Disclosure>

        <Disclosure summary={`چشم‌انداز بازار و چک‌لیست (اختیاری)${checked ? ` — ${fa(checked)} از ${fa(settings.checklist.length)}${checklistDone ? ' ✓' : ''}` : ''}`}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {(['weekly', 'daily'] as const).map((k) => (
                <div key={k} className="space-y-2">
                  <p className="text-xs font-semibold text-ink">{k === 'weekly' ? 'سوگیری هفتگی' : 'سوگیری روزانه'}</p>
                  <SegmentedControl size="sm" label={k} options={BIAS} value={o[`${k}Bias`]} onChange={(v) => setO({ [`${k}Bias`]: v } as never)} />
                  <Input placeholder="توضیح…" value={o[`${k}Note`]} onChange={(ev) => setO({ [`${k}Note`]: ev.target.value.slice(0, 300) } as never)} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="هم‌جهت با روند؟"><SegmentedControl size="sm" label="هم‌جهت با روند" options={YN} value={o.proTrend} onChange={(v) => setO({ proTrend: v })} /></Field>
              <Field label="محیط معامله"><SegmentedControl size="sm" label="محیط" options={[{ value: 'unknown', label: '—' }, { value: 'range', label: 'رنج' }, { value: 'trend', label: 'روند' }]} value={o.env} onChange={(v) => setO({ env: v })} /></Field>
            </div>
            {groups.map(([g, label]) => {
              const items = settings.checklist.filter((i) => i.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
                  <div className="divide-y divide-divider rounded-control border border-divider">
                    {items.map((i) => (
                      <div key={i.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <span className="text-xs text-ink">{i.label}</span>
                        <SegmentedControl size="sm" label={i.label} options={YN} value={o.checklist[i.id] ?? '-'} onChange={(v) => setO({ checklist: { ...o.checklist, [i.id]: v } })} />
                        <Input placeholder="سطح یا توضیح…" value={o.checklistNotes[i.id] ?? ''} onChange={(ev) => setO({ checklistNotes: { ...o.checklistNotes, [i.id]: ev.target.value.slice(0, 200) } })} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div>
              <p className="mb-1 text-xs font-semibold text-ink">اخبار مهم پیش رو</p>
              {o.news.map((n, i) => (
                <div key={i} className="mb-1.5 grid grid-cols-[4.5rem_4.5rem_1fr_5rem_auto] items-center gap-1.5">
                  <Input placeholder="روز" value={n.day} onChange={(ev) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, day: ev.target.value.slice(0, 12) } : x)) })} />
                  <Input placeholder="۱۴:۳۰" value={n.time} dir="ltr" onChange={(ev) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, time: ev.target.value.slice(0, 8) } : x)) })} />
                  <Input placeholder="رویداد" value={n.event} onChange={(ev) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, event: ev.target.value.slice(0, 120) } : x)) })} />
                  <Select value={n.impact} onChange={(ev) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, impact: ev.target.value as NewsItem['impact'] } : x)) })}><option value="high">زیاد</option><option value="med">متوسط</option><option value="low">کم</option></Select>
                  <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => setO({ news: o.news.filter((_, j) => j !== i) })}><Trash2 /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setO({ news: [...o.news, { day: '', time: '', event: '', impact: 'high' }] })}>افزودن رویداد</Button>
            </div>
          </div>
        </Disclosure>

        <Disclosure summary={`حساب، اعتبار و وضعیت — ${STATUS_FA[d.status]}`}>
          <div className="space-y-3">
            <Field label="حساب">
              <Select value={d.account ?? ''} onChange={(ev) => set('account', ev.target.value || null)}>
                <option value="">هر حساب</option>
                {accounts.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </Select>
            </Field>
            <div>
              <Label>اتصال خودکار به معامله‌ای که تا … باز شود</Label>
              <div className="flex flex-wrap gap-1.5">
                {[4, 24, 72, 168].map((h) => <Chip key={h} on={d.validHours === h} onClick={() => set('validHours', h)}>{h < 24 ? `${fa(h)} ساعت` : h === 24 ? '۱ روز' : `${fa(h / 24)} روز`}</Chip>)}
              </div>
            </div>
            <Field label="وضعیت"><SegmentedControl size="sm" label="وضعیت" options={(Object.keys(STATUS_FA) as (keyof typeof STATUS_FA)[]).map((k) => ({ value: k, label: STATUS_FA[k] }))} value={d.status} onChange={(v) => set('status', v)} /></Field>
          </div>
        </Disclosure>
      </div>

      <div className="sticky bottom-[var(--bottomnav-h)] z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-divider bg-card/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <p className="w-full text-xs leading-5 text-muted">
          <b className={d.direction === 'long' ? 'text-positive' : 'text-negative'}>{d.direction === 'long' ? 'لانگ' : 'شورت'}</b> <b className="text-ink" dir="ltr">{d.symbol.toUpperCase() || '—'}</b>
          {' · '}ورود <span className="num-ltr">{fa(plan.entry, 5)}</span> · استاپ <span className="num-ltr text-negative">{fa(plan.stop, 5)}</span> · هدف <span className="num-ltr text-positive">{fa(plan.target, 5)}</span>
          {c.rTarget !== null && <> · {fa(c.rTarget, 1)}R</>}
        </p>
        <Button loading={busy} icon={<Save />} className="flex-1 md:flex-none" onClick={() => void save()}>ذخیرهٔ برنامه</Button>
        <Button variant="ghost" onClick={onDone}>انصراف</Button>
        {!isNew && <Button variant="destructive" className="ms-auto" onClick={() => void savePlan({ ...plan, deleted: true }).then(onDone)}>حذف</Button>}
      </div>
    </Surface>
  );
}

/** اندازهٔ حساب نامعلوم → یک‌بار پرسیده و در تنظیمات ذخیره می‌شود */
function AccountSizeAsk({ settings }: { settings: JournalSettings }) {
  const [v, setV] = useState('');
  const n = parseNum(v);
  return (
    <div className="space-y-2 rounded-card border border-dashed border-divider-strong p-3">
      <PresetNum label="سرمایهٔ حسابتان حدوداً چقدر است؟ (یک‌بار؛ برای حساب حجم مجاز)" values={CAPITALS} value={v} onChange={setV} format={usdShort} suffix="$" />
      <Button size="sm" disabled={!n || n <= 0} onClick={() => void saveSettings({ ...settings, accountSize: n })}>ذخیره</Button>
    </div>
  );
}

const baseLabel = (symbol: string) => (symbol.trim() ? baseOf(symbol).slice(0, 8) : 'واحد');

function Cell({ label, value, sub, strong, tone }: { label: string; value: string; sub?: string; strong?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('num-ltr font-bold', strong ? 'text-lg' : 'text-sm', tone ?? 'text-ink')}>{value}</p>
      {sub && <p className="num-ltr text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

export function PlanTab({ plans, trades, links, settings, accounts, accountSize, prefill, onPrefillUsed, mt = [], tz = 'UTC' }: {
  plans: TradePlan[];
  trades: ClassifiedTrade[];
  links: Map<string, TradePlan>;
  settings: JournalSettings;
  accounts: JournalAccount[];
  accountSize: number | null;
  prefill: { symbol: string; direction: 'long' | 'short'; leverage: number | null } | null;
  onPrefillUsed: () => void;
  mt?: MtTrade[];
  tz?: string;
}) {
  const [editing, setEditing] = useState<TradePlan | null>(null);
  useEffect(() => {
    if (prefill) {
      setEditing(newPlan(Date.now(), { symbol: prefill.symbol, direction: prefill.direction, leverage: prefill.leverage }));
      onPrefillUsed();
    }
  }, [prefill, onPrefillUsed]);
  const tradeOfPlan = useMemo(() => {
    const m = new Map<string, ClassifiedTrade>();
    for (const t of trades) { const p = links.get(t.id); if (p) m.set(p.id, t); }
    return m;
  }, [trades, links]);

  if (editing) return <PlanEditor initial={editing} settings={settings} accounts={accounts} accountSize={accountSize} mt={mt} trades={trades} tz={tz} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">قبل از هر ورود ۶۰ ثانیه. برنامه به‌طور خودکار به معاملهٔ واقعی وصل می‌شود و R، ریسک هر معامله و نظم استاپ را در حسابرسی فعال می‌کند.</p>
        <Button icon={<Plus />} className="ms-auto" onClick={() => setEditing(newPlan(Date.now()))}>برنامهٔ تازه</Button>
        <Button variant="outline" icon={<Plus />} onClick={() => setEditing(newPlan(Date.now(), { kind: 'mt', symbol: 'XAUUSD', mt: defaultMtParams('XAUUSD', mt, accountSize, settings.maxRiskPct) }))}>برنامهٔ متاتریدر</Button>
      </div>
      {!plans.length && <Notice tone="info">هنوز برنامه‌ای ثبت نشده. از «میز معامله ← چک قبل از ورود» هم می‌توانید مستقیم برنامه بسازید.</Notice>}
      {plans.map((p) => {
        const t = tradeOfPlan.get(p.id);
        const c = calcPlan(p, accountSize, settings.maxRiskPct);
        const actualR = t && !t.open && p.entry !== null && p.stop !== null && t.maxSize > 0 ? t.netPnl / (t.maxSize * Math.abs(p.entry - p.stop)) : null;
        return (
          <Surface key={p.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-ink" dir="ltr">{p.symbol}</span>
              <Badge tone={p.direction === 'long' ? 'gain' : 'loss'}>{p.direction === 'long' ? 'لانگ' : 'شورت'}</Badge>
              <Badge tone={p.status === 'planned' ? 'warn' : p.status === 'taken' ? 'gain' : 'neutral'}>{STATUS_FA[p.status]}</Badge>
              {t ? <Badge tone="brand">متصل به معامله</Badge> : p.status === 'planned' && <span className="text-xs text-subtle">در انتظار معامله تا {faDateTime(p.createdAt + p.validHours * 3_600_000)}</span>}
              <span className="ms-auto text-xs text-muted">{faDateTime(p.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{p.kind === 'mt' && <>متاتریدر · {p.size && p.mt?.contractSize ? `${fa(p.size / p.mt.contractSize, 2)} لات · ` : ''}</>}ورود {fa(p.entry, 5)} · استاپ {fa(p.stop, 5)} · هدف {fa(p.target, 5)} · R هدف {c.rTarget === null ? '—' : fa(c.rTarget, 2)}{p.setupTags.length ? ` · ${p.setupTags.join('، ')}` : ''}</p>
            {t && !t.open && <p className="mt-1 text-xs">نتیجه: <b className={pnlTone(t.netPnl)}>{usd(t.netPnl, true)}</b>{actualR !== null && <> · R واقعی <b className={pnlTone(actualR)}>{fa(actualR, 2)}R</b> در برابر R هدف {c.rTarget === null ? '—' : fa(c.rTarget, 2)}</>}{actualR !== null && actualR < -1.1 && <span className="text-negative"> — زیان از استاپ برنامه بیشتر شد</span>}</p>}
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => setEditing(p)}>ویرایش</Button>
          </Surface>
        );
      })}
    </div>
  );
}
