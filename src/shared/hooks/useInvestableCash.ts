/** سرمایهٔ فرضی دستی؛ مستقل از حسابداری و کیف پول‌های متصل. */
import { useEffect } from 'react';
import { getPref, savePref, useCustodyStore, loadCustody } from '@/features/custody/data/repository';
export const SCENARIO_CASH_PREF = 'scenario-cash';
export interface ScenarioCashPref { mode: 'manual'; manualUsd: number | null }
export function readScenarioCash(): ScenarioCashPref {
  const p = getPref<{ mode?: string; manualUsd?: number | null }>(SCENARIO_CASH_PREF)?.value;
  return { mode: 'manual', manualUsd: p?.mode === 'manual' && typeof p.manualUsd === 'number' && p.manualUsd > 0 ? p.manualUsd : null };
}
export async function saveScenarioCash(pref: ScenarioCashPref): Promise<void> { await savePref(SCENARIO_CASH_PREF, pref); }
export function useInvestableCash() {
  useEffect(() => { void loadCustody(); }, []);
  const state = useCustodyStore();
  const pref = readScenarioCash();
  return { cash: pref.manualUsd, loading: !state.loaded, mode: 'manual' as const, manualUsd: pref.manualUsd };
}
