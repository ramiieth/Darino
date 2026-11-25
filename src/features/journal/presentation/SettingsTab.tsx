/**
 * تب «تنظیمات» ژورنال — ساده و خلوت:
 * بالا فقط حساب‌های متصل و سقف ریسک پایه؛ تمام تنظیمات تخصصی و تگ‌ها داخل بخش بازشوندهٔ «تنظیمات پیشرفته» جمع شده‌اند.
 */
import { useState } from 'react';
import { RefreshCw, Shield, Wallet } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
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

const ROLE_FA: Record<AccountRole, string> = {
  auto: 'تشخیص خودکار',
  directional: 'معامله معمولی',
  neutral: 'فاندینگ / خنثی'
};

function ListField({ label, value, onSave, lines = false }: { label: string; value: string[]; onSave: (v: string[]) => void; lines?: boolean }) {
  const [text, setText] = useState(value.join(lines ? '\n' : '، '));
  return (
    <Field label={label}>
      <textarea
        className="min-h-16 w-full rounded-xl border border-divider bg-surface-2/40 p-2.5 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onSave(
            [
              ...new Set(
                text
                  .split(lines ? /\n/ : /[،,\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            ].slice(0, 40)
          )
        }
      />
    </Field>
  );
}

export function SettingsTab({
  settings,
  accounts,
  histories,
  liveEquity,
  onRefetch
}: {
  settings: JournalSettings;
  accounts: JournalAccount[];
  histories: JournalState['histories'];
  liveEquity: number | null;
  onRefetch: () => void;
}) {
  const [size, setSize] = useState(settings.accountSize?.toString() ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const save = (patch: Partial<JournalSettings>) => void saveSettings({ ...settings, ...patch }).then(() => setMsg('تنظیمات ذخیره شد'));

  return (
    <div className="space-y-4">
      {msg && <Notice tone="success">{msg}</Notice>}

      <Surface className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Wallet className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink">حساب‌های متصل</h3>
              <p className="text-xs text-muted">معاملات این حساب‌ها خودکار خوانده می‌شوند؛ معمولاً نیازی به تغییر نقش نیست.</p>
            </div>
          </div>
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRefetch}>
            به‌روزرسانی خودکار
          </Button>
        </div>

        {!accounts.length && (
          <Notice tone="info">هنوز حسابی وصل نیست. از بخش «کیف پول‌ها» حساب صرافی خودت را اضافه کن تا همه چیز خودکار شود.</Notice>
        )}

        <div className="divide-y divide-divider/70">
          {accounts.map((a) => {
            const h = histories.find((x) => x.account.key === a.key);
            return (
              <div key={a.key} className="flex flex-wrap items-center gap-2.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{a.label}</p>
                  <p className="text-xs text-muted">
                    {VENUE_FA[a.venue]} · <span dir="ltr">{a.address.slice(0, 6)}…{a.address.slice(-4)}</span> ·{' '}
                    {h?.status === 'loading' ? (
                      'در حال دریافت…'
                    ) : h?.status === 'error' ? (
                      <span className="text-negative">خطا در دریافت</span>
                    ) : (
                      `${h?.history?.fills.length ?? 0} معامله · ${faDateTime(h?.history?.syncedAt)}`
                    )}
                  </p>
                </div>
                <Select
                  className="ms-auto w-auto"
                  value={settings.roles[a.key] ?? ''}
                  onChange={(e) => save({ roles: { ...settings.roles, [a.key]: (e.target.value || undefined) as AccountRole } })}
                >
                  <option value="">پیش‌فرض ({ROLE_FA[roleOf(a.key, a.venue, {})]})</option>
                  {(Object.keys(ROLE_FA) as AccountRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_FA[r]}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>

        <div className="border-t border-divider/70 pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void clearHistoryCache().then(() => {
                onRefetch();
                setMsg('حافظه موقت پاک شد و معاملات دوباره دریافت می‌شوند.');
              })
            }
          >
            پاک‌کردن حافظه موقت و دریافت مجدد
          </Button>
        </div>
      </Surface>

      <Surface className="space-y-4 p-4 md:p-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gain/10 text-gain-text">
            <Shield className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-bold text-ink">سقف ریسک و سرمایه</h3>
            <p className="text-xs text-muted">برای اینکه گزارش‌ها بفهمند چقدر ریسک روی هر معامله منطقی است.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="سرمایهٔ کل حساب (دلار)"
            labelAside={liveEquity !== null && <Badge tone="neutral">موجودی فعلی ≈ {usd(liveEquity)}</Badge>}
          >
            <Input
              inputMode="decimal"
              dir="ltr"
              placeholder="خودکار از موجودی"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              onBlur={() => save({ accountSize: parseNum(size) && parseNum(size)! > 0 ? parseNum(size) : null })}
            />
          </Field>
          <Field label="حداکثر ریسک هر معامله (٪)">
            <Input
              inputMode="decimal"
              dir="ltr"
              defaultValue={String(settings.maxRiskPct)}
              onBlur={(e) => {
                const v = parseNum(e.target.value);
                if (v && v > 0 && v <= 20) save({ maxRiskPct: v });
              }}
            />
          </Field>
          <Field label="حد ضرر روزانه (٪)">
            <Input
              inputMode="decimal"
              dir="ltr"
              defaultValue={String(settings.dailyLossPct)}
              onBlur={(e) => {
                const v = parseNum(e.target.value);
                if (v && v > 0 && v <= 50) save({ dailyLossPct: v });
              }}
            />
          </Field>
        </div>
      </Surface>

      <Disclosure summary="تنظیمات پیشرفته (تگ‌ها، چک‌لیست و پارامترهای تشخیص خودکار)">
        <div className="space-y-4 pt-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="روزهای تاریخچه حساب‌های فاندینگ">
              <Input
                inputMode="numeric"
                dir="ltr"
                defaultValue={String(settings.neutralFillDays)}
                onBlur={(e) => {
                  const v = parseNum(e.target.value);
                  if (v && v >= 1 && v <= 180) save({ neutralFillDays: Math.round(v) });
                }}
              />
            </Field>
            <Field label="حداقل هم‌پوشانی زمانی (۰ تا ۱)">
              <Input
                inputMode="decimal"
                dir="ltr"
                defaultValue={String(settings.hedge.minOverlap)}
                onBlur={(e) => {
                  const v = parseNum(e.target.value);
                  if (v !== null && v > 0 && v <= 1) save({ hedge: { ...settings.hedge, minOverlap: v } });
                }}
              />
            </Field>
            <Field label="حداکثر اختلاف حجم دو طرف">
              <Input
                inputMode="decimal"
                dir="ltr"
                defaultValue={String(settings.hedge.maxSizeRatio)}
                onBlur={(e) => {
                  const v = parseNum(e.target.value);
                  if (v && v >= 1 && v <= 5) save({ hedge: { ...settings.hedge, maxSizeRatio: v } });
                }}
              />
            </Field>
          </div>

          <ListField label="برچسب‌های دلیل ورود (با «،» جدا کنید)" value={settings.whyTags} onSave={(v) => save({ whyTags: v.length ? v : DEFAULT_SETTINGS.whyTags })} />
          <ListField label="برچسب‌های اشتباه‌ها" value={settings.mistakeTags} onSave={(v) => save({ mistakeTags: v.length ? v : DEFAULT_SETTINGS.mistakeTags })} />
          <ListField label="برچسب‌های کارهای درست" value={settings.goodTags} onSave={(v) => save({ goodTags: v.length ? v : DEFAULT_SETTINGS.goodTags })} />

          {(['context', 'mapping', 'tpo'] as const).map((g) => (
            <ListField
              key={g}
              label={g === 'context' ? 'موارد بررسی زمینه بازار' : g === 'mapping' ? 'موارد بررسی سطوح' : 'موارد بررسی تکمیلی'}
              value={settings.checklist.filter((i) => i.group === g).map((i) => i.label)}
              onSave={(labels) => {
                const keep = settings.checklist.filter((i) => i.group !== g);
                const items: ChecklistItem[] = labels.map(
                  (label) =>
                    settings.checklist.find((i) => i.group === g && i.label === label) ?? {
                      id: `${g}-${label}`.replace(/[^\w-]/g, '').slice(0, 24) + Math.random().toString(36).slice(2, 6),
                      label,
                      group: g
                    }
                );
                save({ checklist: [...keep, ...items] });
              }}
            />
          ))}

          <ListField
            lines
            label="سؤال‌های مرور هفتگی (هر سؤال در یک خط)"
            value={settings.questions.map((q) => q.title)}
            onSave={(titles) =>
              save({
                questions: titles.map(
                  (title) =>
                    settings.questions.find((q) => q.title === title) ?? {
                      id: `q${Math.random().toString(36).slice(2, 8)}`,
                      title,
                      sub: ''
                    }
                )
              })
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              save({
                whyTags: DEFAULT_SETTINGS.whyTags,
                mistakeTags: DEFAULT_SETTINGS.mistakeTags,
                goodTags: DEFAULT_SETTINGS.goodTags,
                checklist: DEFAULT_SETTINGS.checklist,
                questions: DEFAULT_SETTINGS.questions
              })
            }
          >
            بازگشت همه به حالت پیش‌فرض
          </Button>
        </div>
      </Disclosure>
    </div>
  );
}
