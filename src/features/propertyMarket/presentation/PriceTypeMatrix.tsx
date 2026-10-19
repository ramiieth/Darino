/** ============================================================
 * Property Market — جدول «ردیف × سال ساخت»
 *
 *  ستون‌ها: سال ساخت — ۱۴۰۵ (نوساز) | ۱۴۰۴ (۱ سال) … ۱۳۹۸ (۷ سال) | قبل‌تر
 *  ردیف‌ها: همه مناطق یا بازه‌های متراژ (هیچ ردیفی پنهان نمی‌شود)
 *
 *  خوانایی (بازطراحی): واحد فقط یک‌بار بالای جدول؛ هر خانه = یک عدد اصلی + تعداد آگهی.
 *  بازهٔ رایج و معادل دلاری با کلید نوار ابزار (نه همیشه)؛ استثنا = نشانگر کوچک کهربایی.
 *  ⚠️ فقط نمایش — اعداد از سرویس
 * ============================================================ */
import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { PRICE_TYPES, priceTypeSub, priceTypeYear, type PriceType } from '../domain/segments';
import { MIN_SAMPLE_FOR_CHANGE } from '../domain/history';
import type { TypeCell, TypeMatrixRow } from '../service/propertyMarketService';

type Measure = 'ppm' | 'total';
type Currency = 'toman' | 'usd';
type Show = 'avg' | 'range';

/** عدد بدون واحد (واحد بالای جدول آمده): زیر ۱۰۰ با یک رقم اعشار */
function num(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return toFaDigits(r.toLocaleString('en-US'));
}

/** مقیاس هر حالت: تومان هر متر → میلیون، کل → میلیارد؛ دلار هر متر → دلار، کل → هزار دلار */
const SCALE: Record<Measure, Record<Currency, { div: number; unit: string }>> = {
  ppm: { toman: { div: 1e6, unit: 'میلیون تومان برای هر متر' }, usd: { div: 1, unit: 'دلار (تتر) برای هر متر' } },
  total: { toman: { div: 1e9, unit: 'میلیارد تومان، قیمت کل' }, usd: { div: 1e3, unit: 'هزار دلار (تتر)، قیمت کل' } }
};

function cellValue(c: TypeCell, m: Measure, cur: Currency): number | null {
  if (cur === 'toman') return m === 'ppm' ? c.ppmToman : c.totalToman;
  return m === 'ppm' ? c.ppmUsd : c.totalUsd;
}

/** بازه فقط تومانی ساخته می‌شود؛ دلار = تبدیل با همان نرخ خانه */
function cellRange(c: TypeCell, m: Measure, cur: Currency): [number, number] | null {
  const r = m === 'ppm' ? c.ppmRange : c.totalRange;
  if (!r) return null;
  if (cur === 'toman') return r;
  const toman = m === 'ppm' ? c.ppmToman : c.totalToman;
  const usd = cellValue(c, m, 'usd');
  if (!toman || !usd) return null;
  const k = usd / toman;
  return [r[0] * k, r[1] * k];
}

export function PriceTypeMatrix({
  rows,
  jalaliYear,
  rowHeader,
  caption,
  toolbar,
  onPick,
  onPickRow,
  onPickTop
}: {
  rows: TypeMatrixRow[];
  /** سال شمسی جاری — سرستون‌ها از آن ساخته می‌شوند */
  jalaliYear: number;
  /** عنوان ستون ردیف‌ها — «منطقه» / «متراژ» */
  rowHeader: string;
  caption: string;
  /** کنترل‌های اضافه در نوار بالا */
  toolbar?: ReactNode;
  /** کلیک روی یک خانه → آگهی‌های همان ردیف و نوع */
  onPick?: (rowKey: string, type: PriceType) => void;
  /** کلیک روی نام ردیف → همه آگهی‌های آن ردیف */
  onPickRow?: (rowKey: string) => void;
  /** کلیک روی «بالاترین» → آگهی‌های ردیف، گران‌ترین اول */
  onPickTop?: (rowKey: string) => void;
}) {
  const [measure, setMeasure] = useState<Measure>('ppm');
  const [currency, setCurrency] = useState<Currency>('toman');
  const [show, setShow] = useState<Show>('avg');
  const scale = SCALE[measure][currency];
  const hasExceptions = rows.some((r) => (r.top?.exceptions ?? 0) > 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-3 md:px-4">
        <SegmentedControl<Measure>
          size="sm"
          label="نوع مقدار"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'ppm', label: 'هر متر' },
            { value: 'total', label: 'قیمت کل' }
          ]}
        />
        <SegmentedControl<Show>
          size="sm"
          label="نمایش"
          value={show}
          onChange={setShow}
          options={[
            { value: 'avg', label: 'میانگین' },
            { value: 'range', label: 'بازهٔ رایج' }
          ]}
        />
        <SegmentedControl<Currency>
          size="sm"
          label="واحد پول"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'toman', label: 'تومان' },
            { value: 'usd', label: 'دلار' }
          ]}
        />
        {toolbar}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">آگهی‌ای نیست</p>
      ) : (
        <>
          <p className="px-3 pt-2.5 text-2xs text-muted md:px-4">
            اعداد: <b className="font-semibold text-ink">{scale.unit}</b>
            {show === 'range' ? ' · بازهٔ رایج = نیمهٔ میانی آگهی‌ها' : ' · زیر هر عدد: تعداد آگهی'}
          </p>
          {/* ستون نام‌ها بیرون از اسکرولر افقی (نه sticky) — در iOS/PWA سلول‌های sticky
              داخل overflow هنگام اسکرول رنگ نمی‌شوند و تا لمس بعدی ناپدید می‌مانند */}
          <div className="flex">
            <table className="data-table !w-auto max-w-[44%] shrink-0 border-e border-divider md:max-w-none">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="h-12">
                  <th scope="col" className="!ps-3 md:!ps-5">
                    {rowHeader}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="h-16">
                    <th scope="row" className="!ps-3 text-start font-semibold text-ink md:!ps-5">
                      {onPickRow ? (
                        <button type="button" onClick={() => onPickRow(r.key)} className="block max-w-full truncate text-start hover:text-accent">
                          {r.displayName}
                        </button>
                      ) : (
                        <span className="block truncate">{r.displayName}</span>
                      )}
                      <span
                        className="block whitespace-nowrap text-2xs font-normal text-muted"
                        title={r.total > r.count ? `${toFaDigits(r.total - r.count)} آگهی بدون سال ساخت` : undefined}
                      >
                        {toFaDigits(r.total)} آگهی
                        {r.top && (
                          <>
                            {' · '}
                            {onPickTop ? (
                              <button
                                type="button"
                                onClick={() => onPickTop(r.key)}
                                aria-label={`بالاترین ${num(r.top.ppm / 1e6)} میلیون`}
                                className="underline decoration-dotted underline-offset-2 hover:text-accent"
                              >
                                بالاترین {num(r.top.ppm / 1e6)}
                              </button>
                            ) : (
                              <>بالاترین {num(r.top.ppm / 1e6)}</>
                            )}
                            {r.top.exceptions > 0 && (
                              <span className="text-warn" aria-label={`${toFaDigits(r.top.exceptions)} استثنا`}>
                                {' '}
                                ●
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </th>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
              <table className="data-table !w-max min-w-full">
                <thead>
                  <tr className="h-12">
                    {PRICE_TYPES.map((t) => (
                      <th key={t.key} scope="col" className="col-num whitespace-nowrap !px-2.5 md:!px-3">
                        {priceTypeYear(t.key, jalaliYear)}
                        <span className="block text-2xs font-normal text-muted">{priceTypeSub(t.key)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="h-16">
                      {PRICE_TYPES.map((t) => {
                        const c = r.cells[t.key];
                        if (!c) return <td key={t.key} className="col-num !px-2.5 text-subtle md:!px-3">—</td>;
                        const v = cellValue(c, measure, currency);
                        const range = show === 'range' ? cellRange(c, measure, currency) : null;
                        const ex = c.exceptions;
                        const low = c.count < MIN_SAMPLE_FOR_CHANGE;
                        const exText = ex
                          ? `${toFaDigits(ex.count)} آگهی استثنایی تا ${num(((measure === 'ppm' ? ex.maxPpm : ex.maxTotal) ?? 0) / SCALE[measure].toman.div)} ${measure === 'ppm' ? 'میلیون' : 'میلیارد'} — در میانگین حساب نشده`
                          : undefined;
                        const body = (
                          <>
                            <span className={cn('block whitespace-nowrap font-semibold tabular-nums text-ink', low && 'text-muted')}>
                              {c.count === 0 ? '—' : range ? `${num(range[0] / scale.div)}–${num(range[1] / scale.div)}` : num(v === null ? null : v / scale.div)}
                              {ex && (
                                <span className="ms-1 align-super text-2xs font-bold text-warn" aria-hidden>
                                  ●
                                </span>
                              )}
                            </span>
                            <span className="block whitespace-nowrap text-2xs text-subtle">
                              {c.count > 0 ? `${toFaDigits(c.count)} آگهی` : ''}
                              {ex && <span className="text-warn">{c.count > 0 ? ' · ' : ''}+{toFaDigits(ex.count)} استثنا</span>}
                            </span>
                          </>
                        );
                        const label = `${r.displayName} · ساخت ${priceTypeYear(t.key, jalaliYear)}${exText ? ` · ${exText}` : ''}`;
                        return (
                          <td key={t.key} className="col-num !px-2.5 md:!px-3" title={low ? 'کمتر از ۳ آگهی — کم‌اعتبار' : exText}>
                            {onPick ? (
                              <button type="button" onClick={() => onPick(r.key, t.key)} className="-m-1 rounded-control p-1 text-end hover:bg-surface-2" aria-label={`آگهی‌های ${label}`}>
                                {body}
                              </button>
                            ) : (
                              body
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <ul className="space-y-0.5 border-t border-divider px-3 py-2.5 text-2xs leading-5 text-muted md:px-4">
        <li>ستون‌ها: سال ساخت · عدد کم‌رنگ: کمتر از ۳ آگهی، کم‌اعتبار · روی هر خانه بزنید تا آگهی‌ها را ببینید.</li>
        {hasExceptions && (
          <li>
            <span className="text-warn">●</span> استثنا: آگهی واقعی با قیمت خیلی دور از بقیهٔ منطقه. در فهرست آگهی‌ها هست ولی در میانگین و بازه حساب نمی‌شود. «بالاترین» گران‌ترین آگهی منطقه است.
          </li>
        )}
      </ul>
    </div>
  );
}
