import { TokenLogo, LogoImage } from '@/shared/components/ui/EntityLogo';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Badge } from '@/shared/components/ui/Badge';
import { chainIdentity, tokenName, positionNames } from './identity';
import type { WalletSnapshot } from '../domain/model';
export function PositionsList({ data }: { data:WalletSnapshot }) {
  if(!data.positions.length && data.complete) return <p className="py-6 text-sm text-muted">دارایی قابل نمایش در شبکه‌های پشتیبانی‌شده یافت نشد.</p>;
  return <>{!data.complete && <Notice tone="warn">{data.detailsError || 'جزئیات دارایی‌ها کامل دریافت نشده است؛ مجموع رسمی کیف پول جداگانه نمایش داده می‌شود.'}</Notice>}<ul className="divide-y divide-divider">{data.positions.map(p => { const chain = chainIdentity(p.chain,data.chains); return <li key={p.id} className="flex items-start gap-3 py-4">
    <TokenLogo logo={p.icon} symbol={p.symbol} name={tokenName(p.symbol,p.name)} networkLogo={chain.logo} networkName={chain.name} />
    <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 font-semibold text-ink">{tokenName(p.symbol,p.name)} <bdi dir="ltr" className="text-xs font-normal text-muted">{p.symbol}</bdi></p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{chain.name}</span><Badge>{positionNames[p.type] ?? p.type}</Badge>{p.protocol && <span className="inline-flex items-center gap-1"><LogoImage src={p.protocolIcon} label={p.protocol} size={16} square />{p.protocol}</span>}</div><p className="mt-1 break-all text-xs text-muted"><bdi dir="ltr">{p.quantity ?? 'نامشخص'} {p.symbol}</bdi></p>{p.contract && <details className="mt-1 text-xs text-muted"><summary>شناسهٔ قرارداد</summary><bdi dir="ltr" className="break-all">{p.contract}</bdi></details>}</div>
    <div className="text-end"><MoneyValue value={p.value} className="text-sm font-semibold" /><p className="mt-1 text-xs text-muted">قیمت <MoneyValue value={p.price} /></p></div>
  </li>; })}</ul></>;
}
