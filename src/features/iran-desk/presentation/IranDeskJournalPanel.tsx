/**
 * پنل چک‌لیست ۱۱ موردی ریسک قبل از معامله + ژورنال معاملاتی و تحلیل الگوهای اشتباه ماهانه
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckSquare, Plus, ShieldCheck } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { PRE_TRADE_CHECKLIST_ITEMS, evaluateChecklist } from '../domain/checklist';
import { JOURNAL_BEHAVIOR_TAGS, analyzeMonthlyJournal } from '../domain/journal';
import type {
  DeskAssetType,
  IranJournalEntry,
  PreTradeChecklistState,
  RiskManagerResult
} from '../domain/types';

const parseNum = (s: string, fallback = 0) => {
  const n = Number(toEnDigits(s).replace(/[,٬\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function IranDeskJournalPanel({
  activeSymbol,
  activeAssetType,
  checklist,
  onToggleCheck,
  latestRisk,
  latestThesis,
  latestBull,
  latestBear,
  journal,
  onAddJournalEntry
}: {
  activeSymbol: string;
  activeAssetType: DeskAssetType;
  checklist: PreTradeChecklistState | undefined;
  onToggleCheck: (itemId: string, checked: boolean) => void;
  latestRisk: RiskManagerResult | null;
  latestThesis: string;
  latestBull: string;
  latestBear: string;
  journal: IranJournalEntry[];
  onAddJournalEntry: (entry: IranJournalEntry) => void;
}) {
  const checkSummary = useMemo(() => evaluateChecklist(checklist), [checklist]);
  const monthlyReview = useMemo(() => analyzeMonthlyJournal(journal), [journal]);

  const [entryPriceStr, setEntryPriceStr] = useState('');
  const [exitPriceStr, setExitPriceStr] = useState('');
  const [volumeStr, setVolumeStr] = useState(latestRisk?.recommendedShares ? String(latestRisk.recommendedShares) : '');
  const [entryReason, setEntryReason] = useState('');
  const [lesson, setLesson] = useState('');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<IranJournalEntry['outcome']>('open');
  const [selectedTags, setSelectedTags] = useState<string[]>(['طبق برنامه و داده']);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const handleSaveEntry = () => {
    const entryPx = parseNum(entryPriceStr, 0);
    const exitPx = exitPriceStr.trim() ? parseNum(exitPriceStr, 0) : null;
    const vol = parseNum(volumeStr, 0);
    if (!activeSymbol || entryPx <= 0 || vol <= 0) return;
    const pnlRial = exitPx !== null ? Math.round((exitPx - entryPx) * vol) : null;
    const pnlPct = exitPx !== null && entryPx > 0 ? Number((((exitPx - entryPx) / entryPx) * 100).toFixed(2)) : null;

    onAddJournalEntry({
      id: `jr-${activeSymbol}-${Date.now()}`,
      symbol: activeSymbol,
      assetType: activeAssetType,
      date: new Date().toISOString().slice(0, 10),
      entryPriceRial: entryPx,
      exitPriceRial: exitPx,
      volume: vol,
      entryReasonFa: entryReason.trim() || 'بر اساس تحلیل میز هوشمند',
      fundamentalThesisFa: latestThesis,
      bullSummaryFa: latestBull,
      bearSummaryFa: latestBear,
      riskManagerStatus: latestRisk ? (latestRisk.approved ? 'approved' : 'rejected') : 'not_run',
      outcome,
      pnlRial,
      pnlPct,
      lessonLearnedFa: lesson.trim(),
      personalNotesFa: notes.trim(),
      checklistPassed: checkSummary.allPassed,
      tags: selectedTags,
      createdAt: Date.now()
    });
    setEntryPriceStr('');
    setExitPriceStr('');
    setEntryReason('');
    setLesson('');
    setNotes('');
  };

  return (
    <div className="space-y-4">
      {/* ۱) چک‌لیست تعاملی ۱۱ موردی ریسک قبل از هر معامله */}
      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">
              چک‌لیست ریسک قبل از معامله برای {activeSymbol}
            </h3>
          </div>
          <Badge tone={checkSummary.allPassed ? 'gain' : 'warn'}>
            {toFaDigits(checkSummary.checkedCount)} از {toFaDigits(checkSummary.totalCount)} تأیید شده
          </Badge>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {PRE_TRADE_CHECKLIST_ITEMS.map((item) => {
            const checked = Boolean(checklist?.checks[item.id]);
            return (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-field border px-3 py-2 text-xs transition',
                  checked ? 'border-gain/40 bg-gain/10 text-ink' : 'border-divider bg-card text-muted hover:text-ink'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleCheck(item.id, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--c-brand-500))]"
                />
                <span>
                  {toFaDigits(item.order)}. {item.labelFa}
                </span>
              </label>
            );
          })}
        </div>

        {checkSummary.warningFa ? (
          <Notice tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="شرایط معامله کامل نیست">
            {checkSummary.warningFa}
          </Notice>
        ) : (
          <Notice tone="info" icon={<ShieldCheck className="h-4 w-4" />} title="هر ۱۱ شرط چک‌لیست تأیید شد">
            تأیید چک‌لیست مستقل از تأیید مدیر ریسک است و تصمیم نهایی همیشه بر عهدهٔ شماست.
          </Notice>
        )}
      </Surface>

      {/* ۲) ثبت معامله / تصمیم در ژورنال + مرور الگوهای ماهانه */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">ثبت تصمیم یا معامله در ژورنال ({activeSymbol})</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Field label="قیمت ورود (ریال)">
              <Input dir="ltr" inputMode="numeric" value={entryPriceStr} onChange={(e) => setEntryPriceStr(e.target.value)} />
            </Field>
            <Field label="قیمت خروج (اختیاری)">
              <Input dir="ltr" inputMode="numeric" value={exitPriceStr} onChange={(e) => setExitPriceStr(e.target.value)} />
            </Field>
            <Field label="حجم (سهم/واحد)">
              <Input dir="ltr" inputMode="numeric" value={volumeStr} onChange={(e) => setVolumeStr(e.target.value)} />
            </Field>
            <Field label="نتیجه">
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as IranJournalEntry['outcome'])}
                className="h-10 w-full rounded-control border border-divider bg-card px-2 text-xs text-ink"
              >
                <option value="open">باز</option>
                <option value="win">موفق (سود)</option>
                <option value="loss">زیان</option>
                <option value="breakeven">سربه‌سر</option>
              </select>
            </Field>
          </div>

          <Field label="دلیل ورود (مبتنی بر داده)">
            <Input value={entryReason} onChange={(e) => setEntryReason(e.target.value)} placeholder="مثلاً شکست مقاومت ۲۰ روزه + تأیید مدیر ریسک" />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="درس آموخته‌شده">
              <Input value={lesson} onChange={(e) => setLesson(e.target.value)} />
            </Field>
            <Field label="توضیحات شخصی">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {JOURNAL_BEHAVIOR_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-bold transition',
                    active ? 'border-accent bg-accent-soft text-accent' : 'border-divider bg-card text-muted'
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={handleSaveEntry}>
            ثبت در ژورنال معاملاتی
          </Button>
        </Surface>

        {/* مرور الگوهای ماهانه و لیست سوابق */}
        <Surface className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-ink">بررسی الگوهای رفتاری ژورنال</h3>
            <Badge tone="neutral">{toFaDigits(monthlyReview.totalEntries)} رکورد</Badge>
          </div>

          {monthlyReview.detectedPatterns.length > 0 ? (
            <div className="space-y-2">
              {monthlyReview.detectedPatterns.map((p) => (
                <div
                  key={p.code}
                  className={cn(
                    'rounded-field border px-3 py-2 text-xs',
                    p.severity === 'loss'
                      ? 'border-negative/40 bg-negative/10'
                      : p.severity === 'warn'
                        ? 'border-warn/40 bg-warn/10'
                        : 'border-gain/40 bg-gain/10'
                  )}
                >
                  <p className="font-bold text-ink">{p.titleFa}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{p.detailFa}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">
              پس از ثبت معاملات (پیشنهاد راهنما: ۱ تا ۲ ماه تمرین کاغذی بدون پول واقعی)، الگوهای اشتباه شما اینجا شناسایی می‌شوند.
            </p>
          )}

          {journal.length > 0 && (
            <div className="max-h-56 space-y-1.5 overflow-y-auto pt-1">
              {journal.slice(0, 10).map((j) => (
                <div key={j.id} className="flex items-center justify-between rounded-field border border-divider/70 bg-surface-2/40 px-2.5 py-1.5 text-xs">
                  <div>
                    <span className="font-bold text-ink">{j.symbol}</span>{' '}
                    <span className="text-[11px] text-muted">{j.date} · {j.entryReasonFa}</span>
                  </div>
                  <Badge tone={j.outcome === 'win' ? 'gain' : j.outcome === 'loss' ? 'loss' : 'neutral'}>
                    {j.pnlPct !== null ? `${j.pnlPct > 0 ? '+' : ''}${toFaDigits(j.pnlPct)}٪` : 'باز'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
