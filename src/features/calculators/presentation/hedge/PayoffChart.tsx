/**
 * منحنی ارزش پرتفوی با و بدون هج در هر تغییر قیمت — Chart.js روی تم مشترک نمودار
 *
 * رنگ‌ها توکن‌اند و با اسکریپت dataviz اعتبارسنجی شده‌اند (هر دو حالت، همهٔ چک‌ها PASS):
 *   با هج    chart-1 (پیوسته)          — حالت تیره با شفافیت ۰٫۹ روی کارت
 *   بدون هج  gold (نقطه‌چین، کدگذاری دوم) — حالت تیره با شفافیت ۰٫۸ روی کارت
 * سناریوهای کاربر نقطه‌گذاری (≥۸px) می‌شوند؛ نسخهٔ جدولی برای دسترسی‌پذیری.
 */
import { Chart as ChartJS, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { axisUsd, baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { useThemeStore } from '@/shared/store/themeStore';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import type { PayoffPoint } from '@/features/calculators/domain';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const moveLabel = (m: number) => `${m > 0 ? '+' : ''}${toFaDigits(m)}٪`;

export function PayoffChart({ points, marks }: { points: PayoffPoint[]; marks: number[] }) {
  const dark = useThemeStore((s) => s.theme) === 'dark';
  const hedgedColor = cssColor('chart-1', dark ? 0.9 : 1);
  const plainColor = cssColor('gold', dark ? 0.8 : 1);
  const isMark = (m: number) => marks.includes(m);
  const base = baseChartOptions({ legend: true, formatTooltip: (v) => fmtUSD(v), formatY: axisUsd, maxXTicks: 7 }) as ChartOptions<'line'>;
  const xs = points.map((p) => p.movePct);
  // محور x عددی خطی: فاصلهٔ ۱۰ تا ۱۸ واقعاً کوتاه‌تر از ۱۸ تا ۳۰ است (محور دسته‌ای شیب را کج نشان می‌داد)
  const options: ChartOptions<'line'> = {
    ...base,
    scales: {
      ...base.scales,
      // همان ظاهر محور x تم مشترک، ولی عددی
      x: {
        type: 'linear',
        min: Math.min(...xs),
        max: Math.max(...xs),
        grid: { display: false },
        border: { color: cssColor('chart-grid') },
        ticks: { color: cssColor('chart-axis'), stepSize: 25, maxTicksLimit: 7, maxRotation: 0, font: { size: 11 }, callback: (v) => moveLabel(Number(v)) }
      }
    },
    plugins: {
      ...base.plugins,
      tooltip: { ...base.plugins?.tooltip, callbacks: { ...base.plugins?.tooltip?.callbacks, title: (items) => (items[0] ? moveLabel(items[0].parsed.x as number) : '') } }
    }
  };
  const liquidatedFrom = points.find((p) => p.liquidated && p.movePct > 0)?.movePct ?? null;

  return (
    <div className="space-y-3">
      <div className="h-[240px]" dir="ltr" role="img" aria-label="ارزش پرتفوی با هج و بدون هج در تغییر قیمت‌های مختلف">
        <Line
          data={{
            datasets: [
              {
                label: 'با هج',
                data: points.map((p) => ({ x: p.movePct, y: p.hedged })),
                borderColor: hedgedColor,
                backgroundColor: hedgedColor,
                borderWidth: 2,
                pointRadius: points.map((p) => (isMark(p.movePct) ? 4 : 0)),
                pointHoverRadius: 5,
                pointBorderColor: cssColor('card'),
                pointBorderWidth: 2,
                tension: 0
              },
              {
                label: 'بدون هج (همان سرمایه)',
                data: points.map((p) => ({ x: p.movePct, y: p.unhedged })),
                borderColor: plainColor,
                backgroundColor: plainColor,
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: points.map((p) => (isMark(p.movePct) ? 4 : 0)),
                pointHoverRadius: 5,
                pointBorderColor: cssColor('card'),
                pointBorderWidth: 2,
                tension: 0
              }
            ]
          }}
          options={options}
        />
      </div>
      <p className="text-xs leading-6 text-muted">
        خط آبی (با هج) کم‌شیب‌تر از خط طلایی نقطه‌چین (بدون هج) است: در ریزش کمتر پایین می‌آید و در رشد کمتر بالا می‌رود. نقطه‌ها دو سناریوی شما هستند.
        {liquidatedFrom !== null && <> از رشد {moveLabel(liquidatedFrom)} به بعد، Short لیکویید فرض شده و خط آبی شکسته می‌شود.</>}
      </p>
      <Disclosure summary="نمایش به‌صورت جدول">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
            <caption className="sr-only">ارزش پرتفوی با هج و بدون هج</caption>
            <thead>
              <tr>
                <th scope="col" className="w-[28%] pb-2 text-start text-2xs font-semibold text-subtle">
                  تغییر قیمت
                </th>
                <th scope="col" className="pb-2 text-end text-2xs font-semibold text-subtle">
                  با هج
                </th>
                <th scope="col" className="pb-2 text-end text-2xs font-semibold text-subtle">
                  بدون هج
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.movePct} className={isMark(p.movePct) ? 'bg-accent-soft' : undefined}>
                  <th scope="row" className="border-t border-divider py-1.5 text-start font-normal text-muted">
                    <bdi dir="ltr">{moveLabel(p.movePct)}</bdi>
                    {p.liquidated && <span className="ms-1 text-2xs text-negative">لیکویید</span>}
                  </th>
                  <td className="border-t border-divider py-1.5 text-end font-semibold text-ink">
                    <MoneyValue value={p.hedged} digits={0} />
                  </td>
                  <td className="border-t border-divider py-1.5 text-end font-semibold text-ink">
                    <MoneyValue value={p.unhedged} digits={0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
