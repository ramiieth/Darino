import { yieldTokenIdentity } from '@/shared/domain/yieldTokenIdentity';
import { YieldTokenLabel, YieldTokenMaturity } from '@/shared/components/ui/YieldTokenLabel';
import { ProtocolBadge } from './ProtocolBadge';
import { AssetValue } from './AssetValue';
import { TokenLogo, LogoImage } from '@/shared/components/ui/EntityLogo';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { chainIdentity, tokenName, positionNames, tokenQuantity, platformName } from './identity';
import { tokenLogo } from '../domain/visibility';
import { positionRows } from '../domain/positions';
import type { WalletSnapshot } from '../domain/model';
import { ChevronDown } from 'lucide-react';

export function PositionsList({ data, groupByToken = false }: { data: WalletSnapshot; groupByToken?: boolean }) {
  const positions = positionRows(data.positions, groupByToken);
  return (
    <div className="positions-list-container">
      {!data.complete && <Notice tone="warn">{data.detailsError || 'جزئیات دارایی‌ها کامل دریافت نشده است.'}</Notice>}
      {!positions.length && data.complete && <p className="py-6 text-sm text-muted">دارایی قابل نمایش یافت نشد.</p>}
      {!!positions.length && (
        <div
          className="positions-table-header hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-4 border-b border-divider/80 px-2 py-2.5 text-[11px] font-semibold text-muted"
          aria-hidden
        >
          <span>دارایی</span>
          <span>قیمت</span>
          <span>مقدار موجودی</span>
          <span className="text-end">ارزش</span>
        </div>
      )}
      <ul className="divide-y divide-divider/70">
        {positions.map((p) => {
          const chain = chainIdentity(p.chain, data.chains);
          const multi = p.networks.length > 1;
          const receipt = yieldTokenIdentity(p.symbol, p.name);
          return (
            <li
              key={p.id}
              className="rounded-xl px-2 py-3.5 transition-colors duration-150 hover:bg-surface-2/45"
            >
              <div className="positions-grid grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
                <div className={`positions-identity flex min-w-0 gap-3 ${receipt ? 'items-start' : 'items-center'}`}>
                  <TokenLogo
                    chain={p.chain}
                    contract={p.contract}
                    logo={tokenLogo(p)}
                    symbol={p.symbol}
                    name={tokenName(p.symbol, p.name)}
                    networkLogo={multi ? null : chain.logo}
                    networkName={multi ? undefined : chain.name}
                    size={42}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {receipt ? <YieldTokenLabel symbol={p.symbol} name={p.name} /> : tokenName(p.symbol, p.name)}
                    </p>
                    <div className="mt-1 space-y-1 text-xs leading-5 text-muted">
                      <p className="flex min-w-0 items-center gap-1">
                        {multi ? (
                          <>
                            <span className="inline-flex shrink-0 -space-x-1" dir="ltr">
                              {p.networks.slice(0, 4).map((id) => {
                                const n = chainIdentity(id, data.chains);
                                return <LogoImage key={id} src={n.logo} label={n.name} size={18} />;
                              })}
                            </span>
                            {toFaDigits(p.networks.length)} شبکه
                          </>
                        ) : (
                          <span className="shrink-0">{chain.name}</span>
                        )}
                        {receipt ? (
                          p.protocol && (
                            <>
                              <span> · </span>
                              <span className="truncate">{platformName(p.protocol)}</span>
                            </>
                          )
                        ) : (
                          p.type !== 'wallet' && <span className="truncate"> · {positionNames[p.type] ?? 'پوزیشن'}</span>
                        )}
                      </p>
                      {receipt && (
                        <p className="truncate">
                          <YieldTokenMaturity symbol={p.symbol} name={p.name} />
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="positions-price hidden text-sm tabular-nums">
                  <MoneyValue value={p.price} />
                </div>
                <p
                  dir="rtl"
                  className="positions-quantity col-start-1 row-start-2 min-w-0 text-start text-xs text-muted"
                  data-receipt-quantity={receipt ? receipt.kind : undefined}
                  title={p.quantity ?? undefined}
                >
                  <span className="block truncate tabular-nums">{tokenQuantity(p.quantity)}</span>
                </p>
                <div className="positions-value col-start-2 row-start-1 min-w-0 text-end">
                  <AssetValue value={p.value} primaryClassName="text-sm font-bold" className="text-end" />
                </div>
              </div>
              <details className="group mt-2 text-xs text-muted">
                <summary className="ms-auto flex w-fit cursor-pointer list-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">
                  <span>{multi ? 'تفکیک شبکه‌ها' : 'جزئیات'}</span>
                  <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-2 space-y-2.5 rounded-xl border border-divider/70 bg-surface-2/65 p-3">
                  <p className="positions-mobile-price flex items-center justify-between border-b border-divider/60 pb-2">
                    <span>قیمت هر واحد</span>
                    <MoneyValue value={p.price} className="font-semibold text-ink" />
                  </p>
                  {p.legs.map((leg) => {
                    const n = chainIdentity(leg.chain, data.chains);
                    return (
                      <div key={leg.id} className="rounded-lg bg-card/70 px-2.5 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 font-medium text-ink">
                            <LogoImage src={n.logo} label={n.name} size={18} />
                            {n.name}
                          </span>
                          <bdi dir="rtl" className="tabular-nums text-muted">
                            {tokenQuantity(leg.quantity)}
                          </bdi>
                          <MoneyValue value={leg.value} className="font-semibold text-ink" />
                        </div>
                        {leg.protocol && (
                          <p className="mt-2 inline-flex items-center gap-2">
                            <ProtocolBadge name={leg.protocol} logo={leg.protocolIcon} />
                          </p>
                        )}
                        {leg.contract && (
                          <bdi dir="ltr" className="mt-1.5 block break-all font-latin text-[11px] text-subtle">
                            {leg.contract}
                          </bdi>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
