/** ابزارهای مشترک تب آپشن */
import { pickAtm } from '@/features/calculators/domain';
import type { DeriveChain } from '@/features/calculators/data/deriveOptions';
import { toFaDigits } from '@/shared/utils/formatters';

export const DAY = 86_400_000;
/** سررسید Derive ساعت ۰۸:۰۰ UTC همان روز */
export const expiryMs = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), 8);
export const daysTo = (ymd: string, now: number) => (expiryMs(ymd) - now) / DAY;
export const faDate = (ymd: string) => toFaDigits(`${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`);
export const fmtPct = (v: number, d = 1) => `${toFaDigits(v.toFixed(d))}٪`;
export const fmtQty = (v: number) => toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: 4 }));
export const cents = (v: number) => Math.round(v * 100) / 100;

/** میانگین IV دو گزینهٔ در پول (Call و Put) */
export function atmIvOf(chain: DeriveChain | undefined): number | null {
  if (!chain) return null;
  const F = chain.forward ?? chain.index;
  if (!F) return null;
  const c = pickAtm(chain.options, 'C', F);
  const p = pickAtm(chain.options, 'P', F);
  const ivs = [c?.iv, p?.iv].filter((v): v is number => v !== null && v !== undefined && v > 0);
  return ivs.length ? ivs.reduce((s, x) => s + x, 0) / ivs.length : null;
}
