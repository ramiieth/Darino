/** خروجی CSV از ردیف‌های شبیه‌سازی (ممیزی §۵ Export) */
import type { SimAssetRow } from '@/shared/types';

export function rowsToCsv(rows: SimAssetRow[], baseCapital: number): string {
  const header = [
    'Asset',
    'Name',
    'Buy/Reference Price',
    'Current Price',
    'Value (USD)',
    'Profit/Loss (USD)',
    'Vs ETH (USD)',
    'Return %',
    'Source'
  ].join(',');

  const lines = rows.map((r) =>
    [
      csvCell(r.symbol),
      csvCell(r.nameFa),
      r.buyPrice ?? '',
      r.currentPrice ?? '',
      r.valueUsd ?? '',
      r.profitLoss ?? '',
      r.vsEth ?? '',
      r.changePct ?? '',
      r.source
    ].join(',')
  );

  // BOM برای باز شدن صحیح فارسی در Excel
  return '\uFEFF' + [header, ...lines].join('\n');
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
