import { useEffect } from 'react';
import { create } from 'zustand';
import type { InsightRow } from './schema';
export const useAssistantInsights = create<{
    rows: Record<string, InsightRow[]>;
    scopes: Record<string,string|undefined>;
    put: (key: string, rows: InsightRow[], scope?:string) => void;
}>(set => ({
    rows: {}, scopes:{}, put: (key, rows, scope) => set(s => ({ rows: { ...s.rows, [key]: rows },scopes:{...s.scopes,[key]:scope} }))
}));
/** Only derived financial metrics enter this session store, never full form/provider objects. */
export function usePublishInsight(key: string, name: string, metrics: Record<string, number | null> | null, source: InsightRow['source'] = 'simulation', status: InsightRow['status'] = 'ready', observedAt?:number, scope?:string) {
    const serialized = JSON.stringify(metrics);
    useEffect(() => {
        const safe = metrics && Object.fromEntries(Object.entries(metrics).filter(([k]) => /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(k)).map(([k, v]) => [k, typeof v === 'number' && Number.isFinite(v) ? v : null]));
        useAssistantInsights.getState().put(key, safe ? [{ name, kind: key, source, status, asOf: observedAt??Date.now(), metrics: safe }] : [],scope);
        // Values are primitive; equal renders must not republish and change the observation time.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, name, serialized, source, status, observedAt, scope]);
}
