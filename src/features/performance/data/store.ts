/**
 * دادهٔ کاربر «عملکرد و مقایسه سرمایه» — روی همان رکوردهای prefs «دارایی من»،
 * پس بدون جدول تازه در سرور بین وب و PWA همگام می‌شود (فقط با نشست Passkey).
 *
 *   pv:<id>        سابقهٔ ارزش کل دارایی
 *   pvf:<id>       واریز/برداشت خارجی (فقط برای محاسبهٔ بازده)
 *   pvr:<id>       گزارش ذخیره‌شدهٔ Gemini
 *   pv-settings    بازارهای فعال، خودرو، محله‌ها، CPI رسمی ایران
 *
 * هیچ رکورد پیش‌فرض یا نمونه‌ای ساخته نمی‌شود؛ نوشتن فقط با اقدام صریح کاربر.
 * حذف سخت نداریم (قاعدهٔ همگام‌سازی)؛ حذف = نسخهٔ تازه با deleted.
 * این بخش هیچ تراکنش، موجودی یا دادهٔ بخش دیگری را تغییر نمی‌دهد.
 */
import { useMemo } from 'react';
import { savePref, useCustodyStore } from '@/features/custody/data/repository';
import type { ExternalFlow, PerfSettings, SavedReport, ValueRecord } from '../domain/types';
import { DEFAULT_CAR_MODELS, DEFAULT_ENABLED, DEFAULT_NEIGHBORHOODS, DEFAULTS_VERSION } from '../domain/markets';

export const SETTINGS_ID = 'pv-settings';
const recId = (id: string) => `pv:${id}`;
const flowId = (id: string) => `pvf:${id}`;
const reportId = (id: string) => `pvr:${id}`;

export const DEFAULT_SETTINGS: PerfSettings = {
  enabledMarkets: DEFAULT_ENABLED,
  extraCoins: [],
  carModelId: null,
  carModelIds: DEFAULT_CAR_MODELS,
  manualPrices: [],
  defaultsVersion: DEFAULTS_VERSION,
  neighborhoods: DEFAULT_NEIGHBORHOODS,
  flowsComplete: false,
  iranCpi: []
};

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * تنظیمات ذخیره‌شده + پیش‌فرض‌ها. تنظیمات قدیمی (قبل از نسخهٔ ۲) یک بار خودروها (۲۰۷ دستی/اتوماتیک، تارا)
 * و محله‌های کیانپارس، کیان‌آباد، گلستان و پاداد را اضافه می‌گیرند؛ انتخاب‌های قبلی کاربر حفظ می‌شود.
 */
export function mergeSettings(saved: Partial<PerfSettings> | null): PerfSettings {
  const out: PerfSettings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  if (saved && (saved.defaultsVersion ?? 1) < DEFAULTS_VERSION) {
    out.carModelIds = uniq([...(saved.carModelIds ?? []), ...(saved.carModelId ? [saved.carModelId] : []), ...DEFAULT_CAR_MODELS]);
    out.neighborhoods = uniq([...(saved.neighborhoods ?? []), ...DEFAULT_NEIGHBORHOODS]);
    out.enabledMarkets = uniq([...(saved.enabledMarkets ?? DEFAULT_ENABLED), 'car', 'property']);
    out.defaultsVersion = DEFAULTS_VERSION;
  }
  out.carModelIds ??= [];
  out.manualPrices ??= [];
  return out;
}

export interface PerformanceData {
  loaded: boolean;
  /** امکان ذخیرهٔ دائمی روی این دستگاه */
  persistent: boolean;
  records: ValueRecord[];
  flows: ExternalFlow[];
  reports: SavedReport[];
  settings: PerfSettings;
}

export function usePerformanceData(): PerformanceData {
  const s = useCustodyStore();
  return useMemo(() => {
    const records: ValueRecord[] = [];
    const flows: ExternalFlow[] = [];
    const reports: SavedReport[] = [];
    let settings: Partial<PerfSettings> | null = null;
    for (const p of s.prefs) {
      const v = p.value as never;
      if (p.id === SETTINGS_ID) settings = v;
      else if (p.id.startsWith('pv:')) { if (!(v as ValueRecord).deleted) records.push(v); }
      else if (p.id.startsWith('pvf:')) { if (!(v as ExternalFlow).deleted) flows.push(v); }
      else if (p.id.startsWith('pvr:')) { if (!(v as SavedReport).deleted) reports.push(v); }
    }
    records.sort((a, b) => a.dateTs - b.dateTs || a.createdAt - b.createdAt);
    flows.sort((a, b) => a.dateTs - b.dateTs);
    reports.sort((a, b) => b.createdAt - a.createdAt);
    return { loaded: s.loaded, persistent: s.persistent, records, flows, reports, settings: mergeSettings(settings) };
  }, [s.prefs, s.loaded, s.persistent]);
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function saveRecord(r: ValueRecord) {
  return savePref(recId(r.id), { ...r, updatedAt: Date.now() });
}
export function deleteRecord(r: ValueRecord) {
  return savePref(recId(r.id), { ...r, deleted: true, updatedAt: Date.now() });
}
export function saveFlow(f: ExternalFlow) {
  return savePref(flowId(f.id), { ...f, updatedAt: Date.now() });
}
export function deleteFlow(f: ExternalFlow) {
  return savePref(flowId(f.id), { ...f, deleted: true, updatedAt: Date.now() });
}
export function saveReport(r: SavedReport) {
  return savePref(reportId(r.id), r);
}
export function deleteReport(r: SavedReport) {
  return savePref(reportId(r.id), { ...r, deleted: true });
}
export function saveSettings(s: PerfSettings) {
  return savePref(SETTINGS_ID, s);
}
