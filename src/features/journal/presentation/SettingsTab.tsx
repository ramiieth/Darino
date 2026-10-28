/**
 * تب «تنظیمات» ژورنال — نقش هر حساب (خودکار/جهت‌دار/نوترال)، اندازهٔ حساب، سقف ریسک، تگ‌ها، چک‌لیست، سؤال‌های مرور، پاک‌کردن کش
 */
import { useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import type { AccountRole, ChecklistItem, JournalAccount, JournalSettings } from '../domain/types';
import { VENUE_FA } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { roleOf } from '../domain/classify';
import { saveSettings } from '../data/journalStore';
import { clearHistoryCache } from '../data/historyCache';
import type { JournalState } from '../data/useJournal';
import { faDateTime, parseNum, usd } from './parts';

const ROLE_FA: Record<AccountRole, string> = { auto: 'خودکار (تشخیص پوشش)', directional: 'جهت‌دار', neutral: 'دلتا نوترال / فارم' };

function ListField({ label, value, onSave, lines = false }: { label: string; value: string[]; onSave: (v: string[]) => void; lines?: boolean }) {
  const [text, setText] = useState(value.join(lines ? '\n' : '، '));
  return (
    <Field label={label}>
      <textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onSave([...new Set(text.split(lines ? /\n/ : /[،,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 40))} />
    </Field>
  );
}

export function SettingsTab({ settings, accounts, histories, liveEquity, onRefetch }: { settings: JournalSettings; accounts: JournalAccount[]; histories: JournalState['histories']; liveEquity: number | null; onRefetch: () => void }) {
  const [size, setSize] = useState(settings.accountSize?.toString() ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const save = (patch: Partial<JournalSettings>) => void saveSettings({ ...settings, ...patch }).then(() => setMsg('ذخیره شد'));
  return (
    <div className="space-y-4">
      {msg && <Notice tone="success">{msg}</Notice>}
      <Surface className="p-4 md:p-5">
        <h3 className="text-sm font-bold text-ink">حساب‌ها و دفترشان</h3>
        <p className="mt-1 text-xs leading-6 text-muted">حساب‌ها از «مدیریت کیف پول‌ها»، «دارایی من» و آدرس‌های تنظیم‌شده خوانده می‌شوند. نقش هر حساب تعیین می‌کند معاملاتش در حسابرسی جهت‌دار بیاید یا در دفتر نوترال. «خودکار» یعنی اگر پای مخالف هم‌زمان روی حساب دیگر بود، نوترال.</p>
        {!accounts.length && <Notice tone="info" className="mt-2">هنوز حساب پرپچوالی متصل نیست. از «مدیریت کیف پول‌ها» حساب هایپرلیکوئید، لایتر یا آرکوس را اضافه کنید.</Notice>}
        <div className="mt-3 divide-y divide-divider">
          {accounts.map((a) => {
            const h = histories.find((x) => x.account.key === a.key);
            return (
              <div key={a.key} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{a.label}</p>
                  <p className="text-xs text-muted">{VENUE_FA[a.venue]} · <span dir="ltr">{a.address.slice(0, 6)}…{a.address.slice(-4)}</span> · {h?.status === 'loading' ? 'در حال دریافت…' : h?.status === 'error' ? <span className="text-negative">خطا در دریافت</span> : `${h?.history?.fills.length ?? 0} اجرا · ${faDateTime(h?.history?.syncedAt)}`}</p>
                </div>
                <Select className="ms-auto w-auto" value={settings.roles[a.key] ?? ''} onChange={(e) => save({ roles: { ...settings.roles, [a.key]: (e.target.value || undefined) as AccountRole } })}>
                  <option value="">پیش‌فرض ({ROLE_FA[roleOf(a.key, a.venue, {})]})</option>
                  {(Object.keys(ROLE_FA) as AccountRole[]).map((r) => <option key={r} value={r}>{ROLE_FA[r]}</option>)}
                </Select>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onRefetch}>دریافت دوباره</Button>
          <Button size="sm" variant="ghost" onClick={() => void clearHistoryCache().then(() => { onRefetch(); setMsg('کش تاریخچه پاک شد؛ یادداشت‌ها و برنامه‌ها دست نخوردند.'); })}>پاک‌کردن کش تاریخچه روی این دستگاه</Button>
        </div>
      </Surface>

      <Surface className="grid gap-3 p-4 sm:grid-cols-2 md:p-5">
        <Field label="اندازهٔ حساب جهت‌دار (دلار)" labelAside={liveEquity !== null && <Badge tone="neutral">موجودی فعلی ≈ {usd(liveEquity)}</Badge>}>
          <Input inputMode="decimal" dir="ltr" placeholder="خالی = موجودی فعلی حساب‌های جهت‌دار" value={size} onChange={(e) => setSize(e.target.value)} onBlur={() => save({ accountSize: parseNum(size) && parseNum(size)! > 0 ? parseNum(size) : null })} />
        </Field>
        <Field label="سقف ریسک هر معامله (٪ حساب)">
          <Input inputMode="decimal" dir="ltr" defaultValue={String(settings.maxRiskPct)} onBlur={(e) => { const v = parseNum(e.target.value); if (v && v > 0 && v <= 20) save({ maxRiskPct: v }); }} />
        </Field>
        <Field label="حد زیان روزانه (٪ حساب)">
          <Input inputMode="decimal" dir="ltr" defaultValue={String(settings.dailyLossPct)} onBlur={(e) => { const v = parseNum(e.target.value); if (v && v > 0 && v <= 50) save({ dailyLossPct: v }); }} />
        </Field>
        <Field label="روزهای تاریخچهٔ اجرای حساب‌های نوترال لایتر/هایپرلیکوئید">
          <Input inputMode="numeric" dir="ltr" defaultValue={String(settings.neutralFillDays)} onBlur={(e) => { const v = parseNum(e.target.value); if (v && v >= 1 && v <= 180) save({ neutralFillDays: Math.round(v) }); }} />
        </Field>
        <Field label="تشخیص پوشش: حداقل هم‌پوشانی زمانی (۰ تا ۱)">
          <Input inputMode="decimal" dir="ltr" defaultValue={String(settings.hedge.minOverlap)} onBlur={(e) => { const v = parseNum(e.target.value); if (v !== null && v > 0 && v <= 1) save({ hedge: { ...settings.hedge, minOverlap: v } }); }} />
        </Field>
        <Field label="تشخیص پوشش: حداکثر نسبت اندازهٔ دو پا">
          <Input inputMode="decimal" dir="ltr" defaultValue={String(settings.hedge.maxSizeRatio)} onBlur={(e) => { const v = parseNum(e.target.value); if (v && v >= 1 && v <= 5) save({ hedge: { ...settings.hedge, maxSizeRatio: v } }); }} />
        </Field>
      </Surface>

      <Surface className="space-y-3 p-4 md:p-5">
        <h3 className="text-sm font-bold text-ink">تگ‌ها (با «،» جدا کنید)</h3>
        <ListField label="چرا وارد شدم (نوع ورود)" value={settings.whyTags} onSave={(v) => save({ whyTags: v.length ? v : DEFAULT_SETTINGS.whyTags })} />
        <ListField label="اشتباه‌ها" value={settings.mistakeTags} onSave={(v) => save({ mistakeTags: v.length ? v : DEFAULT_SETTINGS.mistakeTags })} />
        <ListField label="کار درست" value={settings.goodTags} onSave={(v) => save({ goodTags: v.length ? v : DEFAULT_SETTINGS.goodTags })} />
      </Surface>

      <Surface className="space-y-3 p-4 md:p-5">
        <h3 className="text-sm font-bold text-ink">چک‌لیست چشم‌انداز بازار</h3>
        {(['context', 'mapping', 'tpo'] as const).map((g) => (
          <ListField key={g} label={g === 'context' ? 'زمینه' : g === 'mapping' ? 'نگاشت سطوح' : 'TPO و کامپوزیت'} value={settings.checklist.filter((i) => i.group === g).map((i) => i.label)} onSave={(labels) => {
            const keep = settings.checklist.filter((i) => i.group !== g);
            const items: ChecklistItem[] = labels.map((label) => settings.checklist.find((i) => i.group === g && i.label === label) ?? { id: `${g}-${label}`.replace(/[^\w-]/g, '').slice(0, 24) + Math.random().toString(36).slice(2, 6), label, group: g });
            save({ checklist: [...keep, ...items] });
          }} />
        ))}
      </Surface>

      <Surface className="space-y-3 p-4 md:p-5">
        <h3 className="text-sm font-bold text-ink">سؤال‌های سفارشی مرور هفتگی</h3>
        <ListField lines label="هر سؤال در یک خط" value={settings.questions.map((q) => q.title)} onSave={(titles) => save({ questions: titles.map((title) => settings.questions.find((q) => q.title === title) ?? { id: `q${Math.random().toString(36).slice(2, 8)}`, title, sub: '' }) })} />
        <Button size="sm" variant="ghost" onClick={() => save({ whyTags: DEFAULT_SETTINGS.whyTags, mistakeTags: DEFAULT_SETTINGS.mistakeTags, goodTags: DEFAULT_SETTINGS.goodTags, checklist: DEFAULT_SETTINGS.checklist, questions: DEFAULT_SETTINGS.questions })}>بازگشت تگ‌ها، چک‌لیست و سؤال‌ها به پیش‌فرض</Button>
      </Surface>
    </div>
  );
}
