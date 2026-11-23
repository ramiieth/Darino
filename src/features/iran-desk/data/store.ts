/**
 * مخزن ذخیره‌سازی «میز تحلیل هوشمند بازار سرمایه ایران»
 *
 * هماهنگ با معماری فعلی دارینو:
 *   • از `savePref('iran-desk-v1', ...)` در مخزن `custody` استفاده می‌کند تا برای کاربران واردشده
 *     به‌طور خودکار با دیتابیس Neon PostgreSQL همگام‌سازی و ایزوله (per-user) شود
 *   • برای حالت آفلاین یا کاربر مهمان نیز در IndexedDB / localStorage ذخیره می‌شود
 *   • بدون ساخت جدول تکراری یا تغییر مخرب در اسکیما
 */
import { useCallback, useEffect, useState } from 'react';
import { getPref, savePref, useCustodyStore } from '@/features/custody/data/repository';
import type { IranDeskPersistedState } from '../domain/types';

export const IRAN_DESK_PREF_ID = 'iran-desk-v1';
const LOCAL_FALLBACK_KEY = 'darino:iran-desk:state:v1';

export const EMPTY_IRAN_DESK_STATE: IranDeskPersistedState = {
  datasets: [],
  documents: [],
  agentRuns: {},
  reports: [],
  backtests: [],
  journal: [],
  checklists: {}
};

function loadLocalFallback(): IranDeskPersistedState {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return EMPTY_IRAN_DESK_STATE;
    const parsed = JSON.parse(raw) as Partial<IranDeskPersistedState>;
    return {
      datasets: Array.isArray(parsed.datasets) ? parsed.datasets : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      agentRuns: parsed.agentRuns && typeof parsed.agentRuns === 'object' ? parsed.agentRuns : {},
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      backtests: Array.isArray(parsed.backtests) ? parsed.backtests : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
      checklists: parsed.checklists && typeof parsed.checklists === 'object' ? parsed.checklists : {}
    };
  } catch {
    return EMPTY_IRAN_DESK_STATE;
  }
}

export function useIranDeskState() {
  const custody = useCustodyStore();
  const [state, setState] = useState<IranDeskPersistedState>(() => {
    const pref = getPref<IranDeskPersistedState>(IRAN_DESK_PREF_ID)?.value;
    return pref ?? loadLocalFallback();
  });

  useEffect(() => {
    if (!custody.loaded) return;
    const pref = getPref<IranDeskPersistedState>(IRAN_DESK_PREF_ID)?.value;
    if (pref) setState(pref);
  }, [custody.loaded, custody.prefs]);

  const updateState = useCallback((updater: (prev: IranDeskPersistedState) => IranDeskPersistedState) => {
    setState((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      void savePref(IRAN_DESK_PREF_ID, next);
      return next;
    });
  }, []);

  return { state, updateState };
}
