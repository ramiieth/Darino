import { toFaDigits } from '@/shared/utils/formatters';

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function fmtHold(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${toFaDigits(Math.max(1, Math.round(hours * 60)))} دقیقه`;
  if (hours < 48) return `${toFaDigits(Math.round(hours))} ساعت`;
  return `${toFaDigits(Math.round(hours / 24))} روز`;
}

export const fmtRatio = (v: number | null) => (v === null ? '—' : v === Infinity ? '∞' : toFaDigits(v.toFixed(2)));

export function fmtDate(ts: number | null): string {
  if (ts === null) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ts));
  } catch {
    return '';
  }
}

export function fmtMonth(month: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { month: 'numeric', year: '2-digit' }).format(new Date(`${month}-15T00:00:00Z`));
  } catch {
    return month;
  }
}

export const explorerUrl = (a: string) => `https://app.hyperliquid.xyz/explorer/address/${a}`;
