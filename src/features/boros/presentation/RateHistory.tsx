import { Surface } from '@/shared/components/ui/GlassCard';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { PercentValue } from '@/shared/components/ui/FinancialValue';
import type { BorosMarket } from '../domain/types';
function Series({ points, title, color }: { points: { ts: number; c: number }[]; title: string; color: string }) {
  const sorted = [...points].filter(p => Number.isFinite(p.ts) && Number.isFinite(p.c)).sort((a, b) => a.ts - b.ts).slice(-90);
  if (sorted.length < 2) return <p className="text-xs text-muted">{title}: تاریخچه کافی نیست</p>;
  const min = Math.min(...sorted.map(p => p.c)), max = Math.max(...sorted.map(p => p.c));
  const range = Math.max(max - min, .002);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const coordinates = sorted.map(p => `${12 + (p.ts - first.ts) / Math.max(1, last.ts - first.ts) * 576},${130 - (p.c - min) / range * 108}`).join(' ');
  return <section className="space-y-2"><div className="flex items-center justify-between gap-3 text-xs"><h3 className="font-semibold">{title}</h3><PercentValue value={last.c * 100} signed={false} tone="none" /></div><svg viewBox="0 0 600 150" role="img" aria-label={`${title}؛ از ${new Date(first.ts * 1000).toLocaleDateString('fa-IR')} تا ${new Date(last.ts * 1000).toLocaleDateString('fa-IR')}`} className="w-full" preserveAspectRatio="none" style={{ height: 150 }}><path d="M12 130 H588" stroke="currentColor" opacity=".12" /><polyline points={coordinates} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg><div className="flex justify-between text-xs text-muted"><span>{new Date(first.ts * 1000).toLocaleDateString('fa-IR')}</span><span>{new Date(last.ts * 1000).toLocaleDateString('fa-IR')}</span></div><Disclosure summary="داده‌های نمودار"><div className="max-h-52 overflow-auto py-2"><table className="data-table w-full"><thead><tr><th scope="col">تاریخ</th><th scope="col">نرخ</th></tr></thead><tbody>{sorted.map((p, i) => <tr key={`${p.ts}:${i}`}><td>{new Date(p.ts * 1000).toLocaleDateString('fa-IR')}</td><td><PercentValue value={p.c * 100} signed={false} tone="none" /></td></tr>)}</tbody></table></div></Disclosure></section>;
}
export function RateHistory({ market }: { market: BorosMarket }) {
  return <Surface className="p-4 md:p-5 space-y-5"><h2 className="text-base font-bold">تاریخچه نرخ</h2><div className="grid gap-6 lg:grid-cols-2"><Series title="نرخ ضمنی معامله‌شده" points={market.ohlcv} color="#6284ff" /><Series title="نرخ شناور ثبت‌شده" points={market.fundingHistory ?? []} color="#16a085" /></div></Surface>;
}
