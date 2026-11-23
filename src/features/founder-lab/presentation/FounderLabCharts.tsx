import { formatMoney, formatNum, formatPct, type CfoResult, type VwResult } from '../domain/engines';
import type { CurrencyCode } from '../domain/types';

export function VanWestendorpChart({
  vw,
  proposedPrice,
  currency
}: {
  vw: VwResult;
  proposedPrice: number;
  currency: CurrencyCode;
}) {
  if (!vw.valid || vw.points.length < 2) {
    return (
      <div className="rounded-field border border-divider bg-surface-2/60 p-4 text-center text-sm text-muted">
        داده کافی برای رسم نمودار Van Westendorp وجود ندارد.
      </div>
    );
  }

  const W = 680;
  const H = 280;
  const padL = 56;
  const padR = 24;
  const padT = 24;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minP = vw.points[0].price;
  const maxP = vw.points[vw.points.length - 1].price;
  const spanP = Math.max(1, maxP - minP);

  const xOf = (p: number) => padL + ((p - minP) / spanP) * plotW;
  const yOf = (pct: number) => padT + plotH - (pct / 100) * plotH;

  const pathFor = (key: 'tooCheap' | 'notCheap' | 'notExpensive' | 'tooExpensive') =>
    vw.points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xOf(pt.price).toFixed(1)},${yOf(pt[key]).toFixed(1)}`).join(' ');

  const xPmc = xOf(vw.pmc);
  const xPme = xOf(vw.pme);
  const xOpp = xOf(vw.opp);
  const xProp = proposedPrice > 0 ? Math.max(padL, Math.min(padL + plotW, xOf(proposedPrice))) : null;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[720px]" role="img" aria-label="نمودار Van Westendorp">
        <rect
          x={Math.min(xPmc, xPme)}
          y={padT}
          width={Math.max(2, Math.abs(xPme - xPmc))}
          height={plotH}
          fill="rgb(var(--c-brand-500))"
          opacity={0.1}
        />
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={padL}
              y1={yOf(pct)}
              x2={W - padR}
              y2={yOf(pct)}
              stroke="rgb(var(--c-divider))"
              strokeDasharray="3,3"
            />
            <text x={padL - 8} y={yOf(pct) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--c-ink-subtle))">
              {formatNum(pct)}٪
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const p = minP + f * spanP;
          return (
            <text key={f} x={xOf(p)} y={H - 12} textAnchor="middle" fontSize="10.5" fill="rgb(var(--c-ink-subtle))">
              {formatNum(p)}
            </text>
          );
        })}

        <path d={pathFor('tooCheap')} fill="none" stroke="rgb(var(--c-info))" strokeWidth="2.4" />
        <path d={pathFor('notCheap')} fill="none" stroke="rgb(var(--c-gain))" strokeWidth="2.4" />
        <path d={pathFor('notExpensive')} fill="none" stroke="rgb(var(--c-warn))" strokeWidth="2.4" />
        <path d={pathFor('tooExpensive')} fill="none" stroke="rgb(var(--c-loss))" strokeWidth="2.4" />

        <line x1={xOpp} y1={padT} x2={xOpp} y2={padT + plotH} stroke="rgb(var(--c-brand-500))" strokeWidth="1.5" strokeDasharray="4,3" />
        <circle cx={xOpp} cy={yOf(vw.oppPct)} r="5" fill="rgb(var(--c-brand-500))" />
        <text x={xOpp} y={padT - 7} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgb(var(--c-brand-500))">
          OPP: {formatNum(vw.opp)}
        </text>

        {xProp !== null && (
          <g>
            <line x1={xProp} y1={padT} x2={xProp} y2={padT + plotH} stroke="rgb(var(--c-ink))" strokeWidth="2" />
            <text x={xProp} y={padT + 14} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="rgb(var(--c-ink))">
              قیمت شما
            </text>
          </g>
        )}
      </svg>

      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-info" /> خیلی ارزان (مشکوک)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gain" /> دیگر ارزان نیست
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warn" /> هنوز گران نیست
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-loss" /> خیلی گران (عدم خرید)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-500/25" /> بازه قابل‌قبول: {formatMoney(vw.pmc, currency)} تا {formatMoney(vw.pme, currency)}
        </span>
      </div>
    </div>
  );
}

export function CfoMonthlyChart({ cfo, currency }: { cfo: CfoResult; currency: CurrencyCode }) {
  if (!cfo.months.length) return null;
  const W = 680;
  const H = 250;
  const padL = 68;
  const padR = 20;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const vals = cfo.months.flatMap((m) => [m.opProfit, m.cumCash, 0]);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(1, maxV - minV);

  const yOf = (v: number) => padT + plotH - ((v - minV) / span) * plotH;
  const yZero = yOf(0);
  const barW = (plotW / 12) * 0.54;

  const cumPath = cfo.months
    .map((m, idx) => {
      const cx = padL + (idx + 0.5) * (plotW / 12);
      return `${idx === 0 ? 'M' : 'L'}${cx.toFixed(1)},${yOf(m.cumCash).toFixed(1)}`;
    })
    .join(' ');

  const ticks = Array.from(new Set([minV, 0, maxV]));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[720px]" role="img" aria-label="نمودار سود عملیاتی و جریان نقد">
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              y1={yOf(v)}
              x2={W - padR}
              y2={yOf(v)}
              stroke={v === 0 ? 'rgb(var(--c-ink-muted))' : 'rgb(var(--c-divider))'}
              strokeDasharray={v === 0 ? undefined : '3,3'}
            />
            <text x={padL - 8} y={yOf(v) + 4} textAnchor="end" fontSize="10" fill="rgb(var(--c-ink-subtle))">
              {formatNum(v)}
            </text>
          </g>
        ))}

        {cfo.months.map((m, idx) => {
          const cx = padL + (idx + 0.5) * (plotW / 12);
          const yVal = yOf(m.opProfit);
          const top = Math.min(yVal, yZero);
          const h = Math.max(2, Math.abs(yVal - yZero));
          return (
            <g key={m.month}>
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={3}
                fill={m.opProfit >= 0 ? 'rgb(var(--c-gain))' : 'rgb(var(--c-loss))'}
                opacity={0.85}
              >
                <title>
                  ماه {formatNum(m.month)} — سود عملیاتی: {formatMoney(m.opProfit, currency)}
                </title>
              </rect>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="rgb(var(--c-ink-subtle))">
                م{formatNum(m.month)}
              </text>
            </g>
          );
        })}

        <path d={cumPath} fill="none" stroke="rgb(var(--c-brand-500))" strokeWidth="2.5" />
        {cfo.months.map((m, idx) => {
          const cx = padL + (idx + 0.5) * (plotW / 12);
          return (
            <circle key={m.month} cx={cx} cy={yOf(m.cumCash)} r="3.5" fill="rgb(var(--c-brand-500))">
              <title>
                نقدینگی تجمعی ماه {formatNum(m.month)}: {formatMoney(m.cumCash, currency)}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gain" /> سود عملیاتی ماهانه
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-loss" /> زیان عملیاتی ماهانه
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> جریان نقد تجمعی (با سرمایه اولیه)
        </span>
      </div>
    </div>
  );
}

export function PanelDistributionBar({
  buyers,
  maybes,
  nonBuyers,
  total
}: {
  buyers: number;
  maybes: number;
  nonBuyers: number;
  total: number;
}) {
  if (total <= 0) return null;
  const buyPct = (buyers / total) * 100;
  const maybePct = (maybes / total) * 100;
  const noPct = (nonBuyers / total) * 100;
  return (
    <div className="space-y-2.5">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="bg-gain transition-all" style={{ width: `${buyPct.toFixed(1)}%` }} />
        <div className="bg-warn transition-all" style={{ width: `${maybePct.toFixed(1)}%` }} />
        <div className="bg-loss transition-all" style={{ width: `${noPct.toFixed(1)}%` }} />
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gain" /> احتمال خرید (فرضی): {formatNum(buyers)} نفر ({formatPct(buyPct)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warn" /> مشروط: {formatNum(maybes)} نفر ({formatPct(maybePct)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-loss" /> عدم خرید: {formatNum(nonBuyers)} نفر ({formatPct(noPct)})
        </span>
      </div>
    </div>
  );
}
