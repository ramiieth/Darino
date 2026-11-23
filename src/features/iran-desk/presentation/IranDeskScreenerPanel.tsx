/**
 * پنل غربالگر حرفه‌ای بازار سهام و صندوق‌های ایران:
 *   ۱) وضعیت تجمیعی ۶ اندیکاتور (RSI · MACD · CCI · MFI · BB · ADX) با تفکیک گاوی و خرسی
 *   ۲) ۱۲ فیلتر کاربردی بازار (حجم مشکوک، چکش صعودی، اشباع فروش، رنج مثبت + ورود پول، سرانه > ۲۵۰ م.ت، کدبه‌کد و…)
 *   ۳) اسکنر اصلی و اطلاعیه‌های کدال (ورود پول ۳ روزه، جهش حجم ۲×، شکست ۲۰ روزه، تخفیف/حباب NAV)
 */
import { useMemo, useState } from 'react';
import { Radar, TrendingDown, TrendingUp } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import type { IranMarketInstrument } from '@/features/markets/data/iranMarketCatalog';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { ASSET_TYPE_LABELS } from '../domain/agents';
import { buildSixIndicatorMatrix, runTwelvePracticalFilters } from '../domain/indicatorsAndFilters';
import type { ScannerResult, UploadedCodalDocument, UploadedPriceDataset } from '../domain/types';

type ScreenerView = 'filters12' | 'indicators6' | 'core_codal';

export function IranDeskScreenerPanel({
  datasets,
  documents,
  liveItems,
  scannerResult,
  onRunCoreScan,
  onSelectSymbol
}: {
  datasets: readonly UploadedPriceDataset[];
  documents: readonly UploadedCodalDocument[];
  liveItems: readonly IranMarketInstrument[];
  scannerResult: ScannerResult | null;
  onRunCoreScan: () => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [view, setView] = useState<ScreenerView>('filters12');

  const indicatorCards = useMemo(() => buildSixIndicatorMatrix(datasets), [datasets]);
  const practicalFilters = useMemo(
    () => runTwelvePracticalFilters({ datasets, liveItems }),
    [datasets, liveItems]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<ScreenerView>
          label="نمای غربالگر بازار"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'filters12', label: '۱۲ فیلتر کاربردی' },
            { value: 'indicators6', label: '۶ اندیکاتور تجمیعی' },
            { value: 'core_codal', label: 'اسکنر اصلی و کدال' }
          ]}
        />
        <Button size="sm" variant="outline" icon={<Radar className="h-3.5 w-3.5" />} onClick={onRunCoreScan}>
          اجرای اسکن ({toFaDigits(datasets.length)} فایل · {toFaDigits(documents.length)} کدال)
        </Button>
      </div>

      {/* ۱) ۱۲ فیلتر کاربردی بازار سهام */}
      {view === 'filters12' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {practicalFilters.map((f) => (
              <Surface key={f.id} className="flex flex-col justify-between gap-2.5 p-3.5">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={cn(
                        'text-xs font-extrabold leading-5',
                        f.tone === 'gain'
                          ? 'text-positive'
                          : f.tone === 'loss'
                            ? 'text-negative'
                            : 'text-ink'
                      )}
                    >
                      {f.titleFa}
                    </h4>
                    <Badge tone={f.hits.length > 0 ? f.tone : 'neutral'}>{toFaDigits(f.hits.length)}</Badge>
                  </div>

                  {f.hits.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {f.hits.slice(0, 18).map((h) => (
                        <button
                          key={h.symbol}
                          type="button"
                          title={h.metricFa}
                          onClick={() => onSelectSymbol(h.symbol)}
                          className="rounded-md border border-divider/80 bg-surface-2/70 px-2 py-0.5 text-[11px] font-bold text-ink transition hover:border-accent hover:text-accent"
                        >
                          {h.symbol}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-subtle">—</p>
                  )}
                </div>

                <p className="border-t border-divider/50 pt-1.5 text-[10px] text-muted">{f.formulaFa}</p>
              </Surface>
            ))}
          </div>

          <p className="text-[11px] text-muted">
            هیچ فیلتری به‌تنهایی سیگنال خرید یا فروش نیست؛ روی هر نماد کلیک کنید تا به تیم ۶ نفره (بنیادی، کدال، خوشبین، بدبین و مدیر ریسک) ارسال شود.
          </p>
        </div>
      )}

      {/* ۲) وضعیت تجمیعی ۶ اندیکاتور (RSI · MACD · CCI · MFI · BB · ADX) */}
      {view === 'indicators6' && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {indicatorCards.map((card) => (
              <Surface key={card.id} className="overflow-hidden border border-divider">
                <div className="grid grid-cols-[1fr_5.5rem]">
                  <div className="divide-y divide-divider/60 p-3 space-y-2">
                    {/* گاوی: خروج از اشباع فروشندگان */}
                    <div className="space-y-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-positive">
                        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                        خروج از اشباع فروشندگان ({toFaDigits(card.bullishHits.length)})
                      </span>
                      {card.bullishHits.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {card.bullishHits.map((h) => (
                            <button
                              key={h.symbol}
                              type="button"
                              title={h.valueLabel}
                              onClick={() => onSelectSymbol(h.symbol)}
                              className="rounded-md bg-gain/12 px-2 py-0.5 text-[11px] font-bold text-positive hover:ring-1 hover:ring-gain"
                            >
                              {h.symbol}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-subtle">—</p>
                      )}
                    </div>

                    {/* خرسی: خروج از اشباع خریداران */}
                    <div className="space-y-1.5 pt-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-negative">
                        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                        خروج از اشباع خریداران ({toFaDigits(card.bearishHits.length)})
                      </span>
                      {card.bearishHits.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {card.bearishHits.map((h) => (
                            <button
                              key={h.symbol}
                              type="button"
                              title={h.valueLabel}
                              onClick={() => onSelectSymbol(h.symbol)}
                              className="rounded-md bg-negative/12 px-2 py-0.5 text-[11px] font-bold text-negative hover:ring-1 hover:ring-negative"
                            >
                              {h.symbol}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-subtle">—</p>
                      )}
                    </div>
                  </div>

                  {/* نوار عنوان اندیکاتور */}
                  <div className="flex flex-col items-center justify-center bg-accent/15 px-2 text-center border-s border-divider">
                    <span dir="ltr" className="text-sm font-black text-accent">{card.titleEn}</span>
                    <span dir="ltr" className="mt-1 text-[9px] leading-tight text-muted">{card.subtitleEn}</span>
                  </div>
                </div>
              </Surface>
            ))}
          </div>

          <p className="text-[11px] text-muted">
            اندیکاتورها بر اساس آخرین قیمت روزانه محاسبه می‌شوند (برای محاسبه دقیق ۶ اندیکاتور، حداقل ۲۱ تا ۳۶ روز سابقه قیمت در بخش داده‌ها لازم است).
          </p>
        </div>
      )}

      {/* ۳) اسکنر اصلی (ورود پول ۳ روزه، جهش حجم ۲×، شکست ۲۰ روزه، کدال و NAV) */}
      {view === 'core_codal' && (
        <Surface className="p-4 space-y-3">
          {scannerResult ? (
            scannerResult.emptyMessageFa ? (
              <Notice tone="neutral" title="نتیجه اسکنر">{scannerResult.emptyMessageFa}</Notice>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-2">نماد</th>
                      <th className="pb-2">نوع دارایی</th>
                      <th className="pb-2">سیگنال</th>
                      <th className="pb-2">مقدار دقیق</th>
                      <th className="pb-2">قدرت</th>
                      <th className="pb-2">منبع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60">
                    {scannerResult.rows.map((r, idx) => (
                      <tr key={`${r.symbol}-${r.signalCode}-${idx}`} className="hover:bg-surface-2/40">
                        <td className="py-2 font-extrabold text-accent">
                          <button type="button" onClick={() => onSelectSymbol(r.symbol)}>
                            {r.symbol}
                          </button>
                        </td>
                        <td className="py-2 text-muted">{ASSET_TYPE_LABELS[r.assetType]}</td>
                        <td className="py-2 font-bold text-ink">{r.signalTitleFa}</td>
                        <td className="py-2">{r.exactValueFa}</td>
                        <td className="py-2">
                          <Badge tone={r.strength === 'strong' ? 'gain' : r.strength === 'medium' ? 'warn' : 'neutral'}>
                            {r.strength === 'strong' ? 'قوی' : r.strength === 'medium' ? 'متوسط' : 'ضعیف'}
                          </Badge>
                        </td>
                        <td className="py-2 text-[11px] text-muted">{r.sourceName} ({r.dataDate})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <p className="text-xs text-muted">برای بررسی سیگنال‌های ۳ روزه حقیقی، جهش حجم ۲×، شکست ۲۰ روزه و کدال روی دکمه «اجرای اسکن» کلیک کنید.</p>
          )}
        </Surface>
      )}
    </div>
  );
}
