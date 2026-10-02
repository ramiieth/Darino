/** ============================================================
 * TradFiTable — traditional markets (reference data, no heavy requests)
 *
 * ⚠️ Reference prices / market caps only, clearly labelled; unknown = N/A.
 * No live provider here (server key optional) — never guesses.
 * ============================================================ */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { SearchField } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { AssetName } from '@/shared/components/ui/AssetName';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { TRADFI_ASSETS, TRADFI_NAMES, TRADFI_JUL_2026 } from '@/features/simulation/domain/constants';
import { referenceMarketCap, hasReferenceMarketCap } from '@/features/market/data/marketCapReference';
import { assetSearchText } from '@/shared/i18n/assetDisplayName';
import { toFaDigits } from '@/shared/utils/formatters';

const PAGE = 30;

export function TradFiTable() {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const all = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRADFI_ASSETS.filter((a) => !q || assetSearchText(a.symbol, TRADFI_NAMES[a.symbol] ?? a.nameFa).includes(q));
  }, [query]);
  const rows = all.slice(0, limit);

  return (
    <section aria-label="بازار سنتی" className="space-y-4">
      <Notice tone="neutral" title="قیمت مرجع — نه زنده">
        سهام، ETF، شاخص، کالا و اوراق با قیمت مرجع ژوئیه ۲۰۲۶ نمایش داده می‌شوند. داده زنده برای این بخش در دسترس نیست و
        موارد بدون مرجع «N/A» هستند.
      </Notice>

      <div className="flex items-center gap-2">
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setLimit(PAGE);
          }}
          placeholder="جستجوی نماد…"
          className="flex-1 md:max-w-sm"
        />
        <p className="ms-auto hidden text-xs text-muted md:block">{toFaDigits(TRADFI_ASSETS.length)} دارایی</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="نتیجه‌ای یافت نشد" hint="موردی با این جستجو پیدا نشد." />
      ) : (
        <Surface className="overflow-hidden">
          <table className="data-table">
            <caption className="sr-only">دارایی‌های بازار سنتی — قیمت مرجع</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-4 md:!ps-5">دارایی</th>
                <th scope="col" className="col-num">قیمت مرجع</th>
                <th scope="col" className="col-num hidden sm:table-cell">ارزش بازار</th>
                <th scope="col" className="!pe-4 md:!pe-5"><span className="sr-only">وضعیت</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const price = TRADFI_JUL_2026[a.symbol] ?? null;
                const mcap = hasReferenceMarketCap(a.symbol) ? referenceMarketCap(a.symbol) : null;
                return (
                  <tr key={a.symbol}>
                    <td className="!ps-4 md:!ps-5">
                      <div className="flex items-center gap-3">
                        <AssetLogo symbol={a.symbol} kind="tradfi" size={28} />
                        <AssetName
                          symbol={a.symbol}
                          fallbackName={TRADFI_NAMES[a.symbol] ?? a.nameFa}
                          className="max-w-[10rem] sm:max-w-[16rem]"
                        />
                      </div>
                    </td>
                    <td className="col-num font-semibold text-ink">
                      {price ? <MoneyValue value={price} /> : <span className="text-subtle">N/A</span>}
                      <span className="block text-2xs font-normal text-muted sm:hidden">
                        {mcap ? <MoneyValue value={mcap} compact /> : '—'}
                      </span>
                    </td>
                    <td className="col-num hidden text-muted sm:table-cell">
                      {mcap ? <MoneyValue value={mcap} compact /> : <span className="text-subtle">N/A</span>}
                    </td>
                    <td className="!pe-4 text-end md:!pe-5">
                      <Badge tone={price ? 'warn' : 'neutral'}>{price ? '≈ مرجع' : '—'}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {all.length > limit && (
            <div className="border-t border-divider p-2">
              <Button variant="ghost" size="sm" className="w-full text-accent" onClick={() => setLimit((l) => l + PAGE)}>
                نمایش بیشتر ({toFaDigits(all.length - limit)} باقی‌مانده)
              </Button>
            </div>
          )}
        </Surface>
      )}
    </section>
  );
}
