/**
 * تب «برنامهٔ معامله» — ترکیب کامل «Market Outlook» و «Trade Plan» (هیچ فیلدی حذف نشده) + محاسبه و ذخیرهٔ همگام
 *
 *   چشم‌انداز: شمارهٔ هفته/تاریخ (خودکار)، سوگیری هفتگی و روزانه، هم‌جهت با روند، چک‌لیست نگاشت و TPO (قابل‌ویرایش در تنظیمات)، اخبار مهم
 *   برنامه: نماد، جهت، حساب، محیط (رنج/روند)، نوع ورود (تگ «چرا» — همان که تحلیل ستاپ می‌خواند)، ورود/استاپ/هدف و «چرا»ی هرکدام،
 *           R، ریسک دلار و درصد، اندازهٔ پیشنهادی از سقف ریسک، داخل سقف؟، همگرایی‌ها، دلایل نگرفتن معامله
 *   اتصال خودکار به معاملهٔ واقعی در بازهٔ اعتبار؛ بعد از بسته‌شدن: R برنامه در برابر R واقعی.
 *   ورود از «چک قبل از ورود»: ?tab=plan&m=BTC&side=long&lev=5
 *   دو حالت: کریپتو (اندازه به واحد دارایی، اهرم) و متاتریدر (پیشنهاد از تاریخچه + لات، پیپ، مارجین — MtPlanPanel)
 *   در هر دو: نرخ پایهٔ همین استاپ و هدف روی کندل‌های اخیر بازار (BaseRatePanel)
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { Bias, ClassifiedTrade, JournalAccount, JournalSettings, NewsItem, TradePlan, YesNo } from '../domain/types';
import type { MtTrade } from '../domain/metatrader';
import { calcForex, contractSizeFor } from '../domain/forex';
import { defaultMtParams, MtPlanPanel } from './MtPlanPanel';
import { BaseRatePanel } from './BaseRatePanel';
import { calcPlan, newPlan } from '../domain/plan';
import { isoWeekKey } from '../domain/time';
import { savePlan } from '../data/journalStore';
import { fa, faDateTime, parseNum, pct, pnlTone, TagPicker, usd } from './parts';

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
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const o = d.outlook;
  const setO = (patch: Partial<Draft['outlook']>) => setD((x) => ({ ...x, outlook: { ...x.outlook, ...patch } }));
  const plan = fromDraft(d);
  const c = calcPlan(plan, accountSize, settings.maxRiskPct);
  const kind = d.kind ?? 'crypto';
  const mtParams = d.mt ?? defaultMtParams(d.symbol, mt, accountSize, settings.maxRiskPct);
  function switchKind(k: 'crypto' | 'mt') {
    setD((x) => {
      const symbol = k === 'mt' && (!x.symbol || x.symbol === 'BTC') ? 'XAUUSD' : x.symbol;
      return { ...x, kind: k, symbol, mt: k === 'mt' ? x.mt ?? defaultMtParams(symbol, mt, accountSize, settings.maxRiskPct) : x.mt };
    });
  }
  const checked = settings.checklist.filter((i) => o.checklist[i.id] && o.checklist[i.id] !== '-').length;
  const checklistDone = checked === settings.checklist.length;
  async function save() {
    setBusy(true);
    try {
      // متاتریدر: اندازه = لات × قرارداد تا R حسابرسی با پوزیشن واقعی هم‌واحد باشد
      const fx = kind === 'mt' ? calcForex({ symbol: plan.symbol.trim().toUpperCase(), direction: plan.direction, entry: plan.entry, stop: plan.stop, target: plan.target, ...mtParams }) : null;
      const sized = fx ? { kind, mt: mtParams, size: fx.units, leverage: mtParams.leverage } : {};
      await savePlan({ ...plan, ...sized, symbol: plan.symbol.trim().toUpperCase() || 'BTC', confluences: plan.confluences.filter(Boolean), reasonsAgainst: plan.reasonsAgainst.filter(Boolean) });
      onDone();
    } finally {
      setBusy(false);
    }
  }
  const groups = [['context', 'زمینه'], ['mapping', 'نگاشت سطوح'], ['tpo', 'TPO و کامپوزیت']] as const;
  return (
    <Surface variant="focal" className="space-y-5 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">برنامهٔ معامله · {isoWeekKey(d.createdAt, Intl.DateTimeFormat().resolvedOptions().timeZone).replace('-W', ' · هفتهٔ ')} · {faDateTime(d.createdAt)}</p>
        <Badge tone={plan.direction === 'long' ? 'gain' : 'loss'}>{plan.direction === 'long' ? 'لانگ' : 'شورت'}</Badge>
      </div>

      {/* چشم‌انداز بازار */}
      <Disclosure summary={`چشم‌انداز بازار — چک‌لیست ${fa(checked)} از ${fa(settings.checklist.length)}${checklistDone ? ' ✓' : ''}`} defaultOpen={!initial.symbol || initial.createdAt === initial.updatedAt}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(['weekly', 'daily'] as const).map((k) => (
              <div key={k} className="space-y-2">
                <p className="text-xs font-semibold text-ink">{k === 'weekly' ? 'سوگیری هفتگی' : 'سوگیری روزانه'}</p>
                <SegmentedControl size="sm" label={k} options={BIAS} value={o[`${k}Bias`]} onChange={(v) => setO({ [`${k}Bias`]: v } as never)} />
                <Input placeholder="توضیح…" value={o[`${k}Note`]} onChange={(e) => setO({ [`${k}Note`]: e.target.value.slice(0, 300) } as never)} />
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
                      <Input placeholder="سطح یا توضیح…" value={o.checklistNotes[i.id] ?? ''} onChange={(e) => setO({ checklistNotes: { ...o.checklistNotes, [i.id]: e.target.value.slice(0, 200) } })} />
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
                <Input placeholder="روز" value={n.day} onChange={(e) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, day: e.target.value.slice(0, 12) } : x)) })} />
                <Input placeholder="۱۴:۳۰" value={n.time} dir="ltr" onChange={(e) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, time: e.target.value.slice(0, 8) } : x)) })} />
                <Input placeholder="رویداد" value={n.event} onChange={(e) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, event: e.target.value.slice(0, 120) } : x)) })} />
                <Select value={n.impact} onChange={(e) => setO({ news: o.news.map((x, j) => (j === i ? { ...x, impact: e.target.value as NewsItem['impact'] } : x)) })}><option value="high">زیاد</option><option value="med">متوسط</option><option value="low">کم</option></Select>
                <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => setO({ news: o.news.filter((_, j) => j !== i) })}><Trash2 /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setO({ news: [...o.news, { day: '', time: '', event: '', impact: 'high' }] })}>افزودن رویداد</Button>
          </div>
        </div>
      </Disclosure>

      {/* برنامه */}
      <Field label="نوع حساب"><SegmentedControl label="نوع حساب" options={[{ value: 'crypto', label: 'کریپتو' }, { value: 'mt', label: 'متاتریدر (فارکس، طلا، نفت)' }]} value={kind} onChange={switchKind} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="نماد"><Input dir="ltr" value={d.symbol} placeholder={kind === 'mt' ? 'XAUUSD' : 'BTC'} onChange={(e) => {
          const symbol = e.target.value.slice(0, 20);
          // متاتریدر: اندازهٔ قرارداد نماد تازه از استیتمنت یا پیش‌فرض
          setD((x) => ({ ...x, symbol, mt: kind === 'mt' ? { ...mtParams, contractSize: contractSizeFor(symbol.trim().toUpperCase(), mt).size } : x.mt }));
        }} /></Field>
        <Field label="جهت"><SegmentedControl label="جهت" fill options={[{ value: 'long', label: 'لانگ' }, { value: 'short', label: 'شورت' }]} value={d.direction} onChange={(v) => set('direction', v)} /></Field>
        <Field label="حساب (اختیاری)">
          <Select value={d.account ?? ''} onChange={(e) => set('account', e.target.value || null)}>
            <option value="">هر حساب</option>
            {accounts.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </Select>
        </Field>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-ink">نوع ورود (چرا) — همین تگ در تحلیل «کدام ورود سود می‌دهد» به‌عنوان «قبل از نتیجه» شمرده می‌شود</p>
        <TagPicker label="نوع ورود" tags={settings.whyTags} value={d.setupTags} onChange={(v) => set('setupTags', v)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="قیمت ورود"><Input inputMode="decimal" dir="ltr" value={d.entry} onChange={(e) => set('entry', e.target.value)} /></Field>
        <Field label="استاپ"><Input inputMode="decimal" dir="ltr" value={d.stop} onChange={(e) => set('stop', e.target.value)} /></Field>
        <Field label="هدف (FTA)"><Input inputMode="decimal" dir="ltr" value={d.target} onChange={(e) => set('target', e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="چرا اینجا وارد می‌شوم"><textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={d.entryWhy} onChange={(e) => set('entryWhy', e.target.value.slice(0, 1000))} /></Field>
        <Field label="چرا استاپ اینجاست"><textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={d.stopWhy} onChange={(e) => set('stopWhy', e.target.value.slice(0, 1000))} /></Field>
        <Field label="چرا هدف اینجاست"><textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={d.targetWhy} onChange={(e) => set('targetWhy', e.target.value.slice(0, 1000))} /></Field>
      </div>
      {kind === 'mt' ? (
        <>
          <MtPlanPanel
            symbol={d.symbol} direction={d.direction} entry={d.entry} stop={d.stop} target={d.target}
            params={mtParams} onParams={(p) => set('mt', p)}
            onLevels={(l) => setD((x) => ({ ...x, ...l }))}
            mt={mt} trades={trades} tz={tz}
          />
          <Field label="اعتبار برای اتصال خودکار (ساعت)"><Input inputMode="numeric" dir="ltr" value={String(d.validHours)} onChange={(e) => set('validHours', Math.min(240, Math.max(1, Number(e.target.value) || 24)))} /></Field>
        </>
      ) : (<>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="اندازه (واحد دارایی)"><Input inputMode="decimal" dir="ltr" value={d.size} placeholder={c.suggestedSize ? c.suggestedSize.toPrecision(4) : ''} onChange={(e) => set('size', e.target.value)} /></Field>
        <Field label="اهرم"><Input inputMode="decimal" dir="ltr" value={d.leverage} onChange={(e) => set('leverage', e.target.value)} /></Field>
        <Field label="اعتبار برای اتصال خودکار (ساعت)"><Input inputMode="numeric" dir="ltr" value={String(d.validHours)} onChange={(e) => set('validHours', Math.min(240, Math.max(1, Number(e.target.value) || 24)))} /></Field>
      </div>

      <Surface variant="subtle" className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
        <div><p className="text-[11px] text-muted">R هدف</p><p className="num-ltr text-base font-bold text-ink">{c.rTarget === null ? '—' : `${fa(c.rTarget, 2)}R`}</p></div>
        <div><p className="text-[11px] text-muted">فاصلهٔ استاپ</p><p className="num-ltr text-base font-bold text-ink">{pct(c.stopPct, 2)}</p></div>
        <div><p className="text-[11px] text-muted">ریسک</p><p className={cn('num-ltr text-base font-bold', c.withinLimit === false ? 'text-negative' : 'text-ink')}>{usd(c.riskUsd)} {c.riskPct !== null && `(${pct(c.riskPct, 2)})`}</p></div>
        <div><p className="text-[11px] text-muted">اندازهٔ مجاز با سقف {fa(settings.maxRiskPct, 2)}٪</p><p className="num-ltr text-base font-bold text-ink">{c.suggestedSize === null ? (accountSize ? '—' : 'اندازهٔ حساب لازم است') : `${c.suggestedSize.toPrecision(4)} · ${usd(c.suggestedNotional)}`}</p></div>
      </Surface>
      {c.withinLimit !== null && <p className={cn('text-xs font-semibold', c.withinLimit ? 'text-positive' : 'text-negative')}>{c.withinLimit ? '✓ داخل سقف ریسک کلی' : '✕ خارج از سقف ریسک کلی'}</p>}
      {c.problems.map((p, i) => <Notice key={i} tone="warn">{p}</Notice>)}
      </>)}
      <BaseRatePanel symbol={plan.symbol} kind={kind} direction={plan.direction} entry={plan.entry} stop={plan.stop} target={plan.target} />
      {!checklistDone && <p className="text-xs text-warn">چک‌لیست چشم‌انداز کامل نشده.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="mb-1 text-xs font-semibold text-positive">همگرایی‌ها</p><ListEditor tone="gain" ph="همگرایی…" items={d.confluences.length ? d.confluences : ['', '', '']} onChange={(v) => set('confluences', v)} /></div>
        <div><p className="mb-1 text-xs font-semibold text-negative">دلایل نگرفتن این معامله</p><ListEditor tone="loss" ph="دلیل مخالف…" items={d.reasonsAgainst.length ? d.reasonsAgainst : ['', '']} onChange={(v) => set('reasonsAgainst', v)} /></div>
      </div>
      <Field label="وضعیت"><SegmentedControl size="sm" label="وضعیت" options={(Object.keys(STATUS_FA) as (keyof typeof STATUS_FA)[]).map((k) => ({ value: k, label: STATUS_FA[k] }))} value={d.status} onChange={(v) => set('status', v)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} icon={<Save />} onClick={() => void save()}>ذخیرهٔ برنامه</Button>
        <Button variant="ghost" onClick={onDone}>انصراف</Button>
        {initial.createdAt !== initial.updatedAt && <Button variant="destructive" className="ms-auto" onClick={() => void savePlan({ ...plan, deleted: true }).then(onDone)}>حذف برنامه</Button>}
      </div>
    </Surface>
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
