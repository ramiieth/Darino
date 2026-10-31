/**
 * دادهٔ کاربر ژورنال — روی همان رکوردهای «prefs» دارایی من، پس بدون تغییر سرور بین دستگاه‌ها همگام می‌شود
 *
 *   journal-settings   تنظیمات (نقش حساب‌ها، سقف ریسک، تگ‌ها، چک‌لیست، سؤال‌ها)
 *   jn:<tradeId>       یادداشت هر معامله
 *   jp:<planId>        برنامهٔ معامله
 *   jr:<YYYY-Www>      مرور هفتگی
 *   jm:<id>            معاملهٔ دستی (پلتفرمی که اتصال ندارد)
 *   jt:<login>.<ticket> پوزیشن واردشده از استیتمنت متاتریدر (ورود دوباره همان رکورد را بازنویسی می‌کند)
 * حذف سخت نداریم (قاعدهٔ همگام‌سازی)؛ حذف = نسخهٔ تازه با deleted.
 */
import { useMemo } from 'react';
import { savePref, useCustodyStore } from '@/features/custody/data/repository';
import type { Direction, JournalSettings, TradeNote, TradePlan, WeeklyReview } from '../domain/types';
import { withDefaults } from '../domain/defaults';
import type { MtTrade } from '../domain/metatrader';

export const SETTINGS_ID = 'journal-settings';
export const noteId = (tradeId: string) => `jn:${tradeId}`;
export const planId = (id: string) => `jp:${id}`;
export const reviewId = (week: string) => `jr:${week}`;
export const manualId = (id: string) => `jm:${id}`;

export interface ManualTrade {
  id: string;
  venueLabel: string;
  symbol: string;
  direction: Direction;
  openTime: number;
  closeTime: number | null;
  entryPx: number;
  exitPx: number | null;
  size: number;
  fees: number | null;
  funding: number | null;
  deleted?: boolean;
}

export interface JournalData {
  loaded: boolean;
  settings: JournalSettings;
  notes: Map<string, TradeNote>;
  plans: TradePlan[];
  reviews: Map<string, WeeklyReview>;
  manual: ManualTrade[];
  mt: MtTrade[];
}

export function useJournalData(): JournalData {
  const s = useCustodyStore();
  return useMemo(() => {
    const notes = new Map<string, TradeNote>();
    const reviews = new Map<string, WeeklyReview>();
    const plans: TradePlan[] = [];
    const manual: ManualTrade[] = [];
    const mt: MtTrade[] = [];
    let settings: Partial<JournalSettings> | null = null;
    for (const p of s.prefs) {
      const v = p.value as never;
      if (p.id === SETTINGS_ID) settings = v;
      else if (p.id.startsWith('jn:')) notes.set(p.id.slice(3), v);
      else if (p.id.startsWith('jp:')) { if (!(v as TradePlan).deleted) plans.push(v); }
      else if (p.id.startsWith('jr:')) reviews.set(p.id.slice(3), v);
      else if (p.id.startsWith('jm:')) { if (!(v as ManualTrade).deleted) manual.push(v); }
      else if (p.id.startsWith('jt:')) { if (!(v as MtTrade).deleted) mt.push(v); }
    }
    plans.sort((a, b) => b.createdAt - a.createdAt);
    return { loaded: s.loaded, settings: withDefaults(settings), notes, plans, reviews, manual, mt };
  }, [s.prefs, s.loaded]);
}

export const saveSettings = (v: JournalSettings) => savePref(SETTINGS_ID, v);

export function saveNote(prev: TradeNote | undefined, tradeId: string, patch: Partial<TradeNote>, tradeOpen: boolean) {
  const base: TradeNote = prev ?? { tradeId, whyTags: [], whyTaggedBeforeClose: false, mistakeTags: [], goodTags: [], note: '', followedRules: null, updatedAt: 0 };
  const next: TradeNote = { ...base, ...patch, tradeId, updatedAt: Date.now() };
  // «قبل از بسته‌شدن» فقط وقتی اولین تگ «چرا» روی معاملهٔ باز زده شود؛ بعداً عوض نمی‌شود
  if (patch.whyTags && !base.whyTags.length && patch.whyTags.length) next.whyTaggedBeforeClose = tradeOpen;
  return savePref(noteId(tradeId), next);
}

export const savePlan = (p: TradePlan) => savePref(planId(p.id), { ...p, updatedAt: Date.now() });
export const saveReview = (r: WeeklyReview) => savePref(reviewId(r.week), { ...r, updatedAt: Date.now() });
export const saveManual = (m: ManualTrade) => savePref(manualId(m.id), m);

const sameMt = (a: MtTrade, b: MtTrade) => JSON.stringify(a) === JSON.stringify(b);

/** فقط رکوردهای تازه یا تغییرکرده ذخیره می‌شوند تا ورود دوباره همگام‌سازی بی‌مورد نسازد */
export async function saveMtTrades(list: readonly MtTrade[], existing: readonly MtTrade[]): Promise<number> {
  const prev = new Map(existing.map((m) => [m.id, m]));
  let n = 0;
  for (const m of list) {
    const old = prev.get(m.id);
    if (old && sameMt(old, m)) continue;
    await savePref(m.id, m);
    n++;
  }
  return n;
}

export async function deleteMtAccount(login: string, existing: readonly MtTrade[]): Promise<void> {
  for (const m of existing) if (m.login === login) await savePref(m.id, { ...m, deleted: true });
}
