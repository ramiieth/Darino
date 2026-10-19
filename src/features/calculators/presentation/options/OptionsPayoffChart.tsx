/**
 * نمودار سود و زیان آپشن — در سررسید (پیوسته، chart-1) و امروز با IV فعلی (نقطه‌چین، gold)
 * همان رنگ‌های اعتبارسنجی‌شده و محور x عددی نمودار هج؛ نسخهٔ جدولی برای دسترسی‌پذیری.
 */
import { Chart as ChartJS, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { axisUsd, baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { useThemeStore } from '@/shared/store/themeStore';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { payoffAt, valueAt, type Leg } from '@/features/calculators/domain';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const usd = (v: number) => toFaDigits(Math.round(v).toLocaleString('en-US'));

export function OptionsPayoffChart({ legs, spot, T, breakevens }: { legs: Leg[]; spot: number; T: number; breakevens: number[] }) {
  const dark = useThemeStore((s) => s.theme) === 'dark';
  const expiryColor = cssColor('chart-1', dark ? 0.9 : 1);
  const todayColor = cssColor('gold', dark ? 0.8 : 1);
  const lo = spot * 0.6;
  const hi = spot * 1.4;
  const xs = Array.from({ length: 61 }, (_, i) => lo + ((hi - lo) * i) / 60);
  const base = baseChartOptions({ legend: true, formatTooltip: (v) => fmtUSD(v), formatY: axisUsd }) as ChartOptions<'line'>;
  const options: ChartOptions<'line'> = {
    ...base,
    scales: {
      ...base.scales,
      x: {
        type: 'linear',
        min: lo,
        max: hi,
        grid: { display: false },
        border: { color: cssColor('chart-grid') },
        ticks: { color: cssColor('chart-axis'), maxTicksLimit: 6, maxRotation: 0, font: { size: 11 }, callback: (v) => usd(Number(v)) }
      }
    },
    plugins: {
      ...base.plugins,
      tooltip: { ...base.plugins?.tooltip, callbacks: { ...base.plugins?.tooltip?.callbacks, title: (items) => (items[0] ? `قیمت ${usd(items[0].parsed.x as number)}` : '') } }
    }
  };
  const table = [0.8, 0.9, 1, 1.1, 1.2].map((k) => ({ price: spot * k, expiry: payoffAt(legs, spot * k), today: valueAt(legs, spot * k, T) }));

  return (
    <div className="space-y-3">
      <div className="h-[240px]" dir="ltr" role="img" aria-label="نمودار سود و زیان در سررسید و امروز">
        <Line
          data={{
            datasets: [
              {
                label: 'در سررسید',
                data: xs.map((x) => ({ x, y: payoffAt(legs, x) })),
                borderColor: expiryColor,
                backgroundColor: expiryColor,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                tension: 0
              },
              {
                label: 'ارزش امروز (با نوسان فعلی بازار)',
                data: xs.map((x) => ({ x, y: valueAt(legs, x, T) })),
                borderColor: todayColor,
                backgroundColor: todayColor,
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 5,
                tension: 0.2
              }
            ]
          }}
          options={options}
        />
      </div>
      <p className="text-xs leading-6 text-muted">
        خط آبی سود یا زیان در روز سررسید است. خط طلایی نقطه‌چین ارزش امروز معامله است، اگر نوسان مورد انتظار بازار (IV) تغییر نکند. بالای صفر یعنی سود و پایین صفر یعنی زیان.
        {breakevens.length > 0 && <> سربه‌سر: {breakevens.map((b) => usd(b)).join(' و ')} دلار.</>}
      </p>
      <Disclosure summary="نمایش به‌صورت جدول">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
            <caption className="sr-only">سود و زیان در چند قیمت</caption>
            <thead>
              <tr className="text-2xs text-subtle">
                <th scope="col" className="pb-2 text-start font-semibold">
                  قیمت
                </th>
                <th scope="col" className="pb-2 text-end font-semibold">
                  در سررسید
                </th>
                <th scope="col" className="pb-2 text-end font-semibold">
                  امروز
                </th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.price}>
                  <th scope="row" className="border-t border-divider py-1.5 text-start font-normal text-muted">
                    <MoneyValue value={r.price} digits={0} />
                  </th>
                  <td className="border-t border-divider py-1.5 text-end font-semibold">
                    <MoneyValue value={Math.round(r.expiry * 100) / 100} signed tone="auto" digits={0} />
                  </td>
                  <td className="border-t border-divider py-1.5 text-end font-semibold">
                    <MoneyValue value={Math.round(r.today * 100) / 100} signed tone="auto" digits={0} />
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
