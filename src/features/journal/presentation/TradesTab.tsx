/**
 * تب «معاملات» — ۱۰ ثانیه برای هر معامله: تگ «چرا»، طبق قانون بود؟، اشتباه/نقطهٔ قوت، یادداشت، دفتر
 *
 *   معامله‌های باز اول نمایش داده می‌شوند: تگ «چرا» روی معاملهٔ باز «قبل از نتیجه» حساب می‌شود و در تحلیل ستاپ بی‌طرف است.
 *   فیلتر «بدون تگ» برای کارِ عقب‌افتاده. معاملهٔ دستی برای پلتفرمی که اتصال ندارد.
 */
import { useMemo, useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Field, Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { ClassifiedTrade, JournalSettings, TradeNote, TradePlan } from '../domain/types';
import { VENUE_FA } from '../domain/types';
import { saveNote, type ManualTrade } from '../data/journalStore';
import type { MtTrade } from '../domain/metatrader';
import { MetaTraderImport } from './MetaTraderImport';
import { ManualTradeSheet } from './ManualTradeSheet';
import { duration, fa, faDateTime, pnlTone, TagPicker, usd } from './parts';

type Filter = 'all' | 'open' | 'untagged' | 'directional' | 'neutral';

function TradeCard({ t, note, plan, settings }: { t: ClassifiedTrade; note: TradeNote | undefined; plan: TradePlan | undefined; settings: JournalSettings }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = (patch: Partial<TradeNote>) => void saveNote(note, t.id, patch, t.open).catch(() => setErr('ذخیره نشد'));
  const tagged = (note?.whyTags.length ?? 0) > 0;
  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-ink" dir="ltr">{t.symbol}</span>
        <Badge tone={t.direction === 'long' ? 'gain' : 'loss'}>{t.direction === 'long' ? 'لانگ' : 'شورت'}</Badge>
        <Badge tone={t.book === 'neutral' ? 'info' : 'brand'}>{t.book === 'neutral' ? 'دلتا نوترال' : 'جهت‌دار'}</Badge>
        {t.open && <Badge tone="warn">باز</Badge>}
        {t.truncated && <Badge tone="neutral">شروع خارج از تاریخچه</Badge>}
        {plan && <Badge tone="gain">برنامه‌دار</Badge>}
        <span className={cn('num-ltr ms-auto text-sm font-bold', pnlTone(t.netPnl))}>{t.open ? 'باز' : usd(t.netPnl, true)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {VENUE_FA[t.venue]} · {faDateTime(t.openTime)}{t.closeTime ? ` · ${duration(t.closeTime - t.openTime)}` : ''} · ارزش {usd(t.maxNotional)}{t.entryPx ? ` · ورود ${fa(t.entryPx, 4)}` : ''}{t.exitPx && !t.open ? ` · خروج ${fa(t.exitPx, 4)}` : ''}
        {t.fees !== null ? ` · کارمزد ${usd(t.fees)}` : ''}{t.funding !== null ? ` · فاندینگ ${usd(t.funding, true)}` : ''}
      </p>
      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold text-ink">چرا وارد شدم؟ {tagged && <span className="font-normal text-subtle">{note?.whyTaggedBeforeClose ? '(قبل از نتیجه)' : '(بعد از نتیجه)'}</span>}</p>
        <TagPicker label="چرا وارد شدم" tags={settings.whyTags} value={note?.whyTags ?? []} onChange={(v) => save({ whyTags: v })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink">طبق قوانینم بود؟</span>
        {([[true, 'بله'], [false, 'خیر'], [null, 'نامشخص']] as const).map(([v, label]) => (
          <button key={label} type="button" aria-pressed={note?.followedRules === v} onClick={() => save({ followedRules: v })} className={cn('rounded-full border px-2.5 py-1 text-xs', note?.followedRules === v ? (v === true ? 'border-gain bg-gain/10 text-positive' : v === false ? 'border-negative bg-negative/10 text-negative' : 'border-accent bg-accent-soft text-accent') : 'border-divider text-muted')}>
            {label}
          </button>
        ))}
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setOpen((o) => !o)}>{open ? 'بستن' : 'اشتباه، نقطهٔ قوت، یادداشت، دفتر'}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-divider pt-3">
          <div><p className="mb-1 text-xs font-semibold text-negative">اشتباه‌ها</p><TagPicker label="اشتباه‌ها" tone="loss" tags={settings.mistakeTags} value={note?.mistakeTags ?? []} onChange={(v) => save({ mistakeTags: v })} /></div>
          <div><p className="mb-1 text-xs font-semibold text-positive">کار درست</p><TagPicker label="کار درست" tone="gain" tags={settings.goodTags} value={note?.goodTags ?? []} onChange={(v) => save({ goodTags: v })} /></div>
          <Field label="یادداشت (انگیزه، شرایط، چه چیزی را دیدم)">
            <textarea className="min-h-20 w-full rounded-control border border-divider bg-card p-2 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== (note?.note ?? '') && save({ note: draft.slice(0, 2000) })} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">دفتر: {t.bookReason}</span>
            <Select className="w-auto" value={note?.book ?? ''} onChange={(e) => save({ book: (e.target.value || undefined) as TradeNote['book'] })}>
              <option value="">خودکار</option>
              <option value="directional">جهت‌دار</option>
              <option value="neutral">دلتا نوترال</option>
            </Select>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-negative">{err}</p>}
    </Surface>
  );
}

function AddButton({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 rounded-card border border-divider bg-card p-3 text-start transition-colors hover:border-accent [&_svg]:h-5 [&_svg]:w-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0"><span className="block text-sm font-bold text-ink">{title}</span><span className="block truncate text-[11px] text-muted">{sub}</span></span>
    </button>
  );
}

export function TradesTab({ trades, notes, links, settings, manual, mt = [] }: { trades: ClassifiedTrade[]; notes: Map<string, TradeNote>; links: Map<string, TradePlan>; settings: JournalSettings; manual: ManualTrade[]; mt?: MtTrade[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(30);
  const [manualOpen, setManualOpen] = useState(false);
  const [mtOpen, setMtOpen] = useState(false);
  const list = useMemo(() => {
    const base = [...trades].sort((a, b) => Number(b.open) - Number(a.open) || (b.closeTime ?? b.openTime) - (a.closeTime ?? a.openTime));
    return base.filter((t) => filter === 'all' || (filter === 'open' ? t.open : filter === 'untagged' ? !(notes.get(t.id)?.whyTags.length) : t.book === filter));
  }, [trades, notes, filter]);
  const untagged = trades.filter((t) => t.book === 'directional' && !notes.get(t.id)?.whyTags.length).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <AddButton icon={<FileUp />} title="استیتمنت متاتریدر" sub="یک فایل، همهٔ معامله‌ها" onClick={() => setMtOpen(true)} />
        <AddButton icon={<Plus />} title="معاملهٔ دستی" sub="چند لمس، بدون جزئیات" onClick={() => setManualOpen(true)} />
      </div>
      <ChipGroup label="فیلتر معاملات" bleed value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'همه', badge: trades.length },
        { value: 'open', label: 'باز', badge: trades.filter((t) => t.open).length },
        { value: 'untagged', label: 'بدون تگ «چرا»', badge: trades.filter((t) => !notes.get(t.id)?.whyTags.length).length },
        { value: 'directional', label: 'جهت‌دار' },
        { value: 'neutral', label: 'دلتا نوترال' }
      ]} />
      {untagged > 0 && <Notice tone="info">{fa(untagged)} معاملهٔ جهت‌دار هنوز تگ «چرا» ندارد. بدون تگ، ستاپ سودده از دل داده بیرون نمی‌آید. برای معامله‌های باز همین حالا بزنید — قبل از دیدن نتیجه.</Notice>}
      {manual.length > 0 && <p className="text-xs text-muted">{fa(manual.length)} معاملهٔ دستی ثبت شده (پلتفرم: {[...new Set(manual.map((m) => m.venueLabel || 'نامشخص'))].join('، ')}).</p>}
      {!list.length ? <p className="text-sm text-muted">معامله‌ای در این فیلتر نیست.</p> : list.slice(0, limit).map((t) => <TradeCard key={t.id} t={t} note={notes.get(t.id)} plan={links.get(t.id)} settings={settings} />)}
      {list.length > limit && <Button variant="outline" onClick={() => setLimit((l) => l + 30)}>نمایش ۳۰ معاملهٔ بیشتر ({fa(list.length - limit)} باقی‌مانده)</Button>}
      <ManualTradeSheet open={manualOpen} onClose={() => setManualOpen(false)} manual={manual} mt={mt} usedSymbols={trades.map((t) => t.symbol)} />
      <MetaTraderImport open={mtOpen} onClose={() => setMtOpen(false)} existing={mt} />
    </div>
  );
}

