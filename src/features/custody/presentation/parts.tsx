import { SmartDateField } from '@/shared/components/ui/SmartDateField';
/**
 * اجزای مشترک رابط دارایی چندشبکه‌ای
 *  AssetChip · HoldingChip · ProviderChip · EntityPicker (جست‌وجو + لوگو) · DateTimeField
 * متن لاتین (نماد، آدرس، هش) همیشه داخل <bdi dir="ltr"> تا در RTL جابه‌جا نشود.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Landmark, Wallet, NotebookPen, Building2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Sheet } from '@/shared/components/ui/Sheet';
import { SearchField, controlBase } from '@/shared/components/ui/Input';
import { LogoImage, TokenLogo } from '@/shared/components/ui/EntityLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { normalizeForSearch } from '@/shared/utils/formatters';
import { findPlatform, OTHER_PROVIDER_ID } from '../domain/catalog';
import type { Asset, Holding, HoldingKind, Network } from '../domain/types';
import type { CustodyData } from '../data/useCustody';
import { formatUsdNumber } from '../domain/decimal';

/** مبلغ دلاری دقیق (رشتهٔ اعشاری) — عدد فارسی + «دلار» کوچک */
export function UsdDec({ v, className }: { v: string | null | undefined; className?: string }) {
  if (v === null || v === undefined) return <span className="text-muted">نامشخص</span>;
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <bdi dir="ltr" className="tabular-nums">
        {formatUsdNumber(v)}
      </bdi>
      <span className="text-[0.62em] font-medium opacity-70">دلار</span>
    </span>
  );
}

export const HOLDING_KIND_LABEL: Record<HoldingKind, string> = {
  wallet: 'کیف پول',
  manual: 'حساب دستی',
  platform: 'حساب پلتفرم',
  arcus: 'زیرحساب آرکوس'
};

export function HoldingIcon({ holding, size = 28 }: { holding: Holding | undefined; size?: number }) {
  if (!holding) return <LogoImage src={null} label="?" size={size} square />;
  if (holding.kind === 'arcus') return <LogoImage src="/logos/platform-arcus.png" label="آرکوس" size={size} square />;
  const p = holding.kind === 'platform' ? findPlatform(holding.platformId) : undefined;
  if (p) return <LogoImage src={p.logo} label={p.name} size={size} square />;
  const Icon = holding.kind === 'wallet' ? Wallet : holding.kind === 'manual' ? NotebookPen : Building2;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[28%] bg-surface-2 text-muted ring-1 ring-divider" style={{ width: size, height: size }} aria-hidden>
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}

export function AssetLogoFor({ asset, network, size = 28 }: { asset: Asset | undefined; network: Network | undefined; size?: number }) {
  if (!asset) return <LogoImage src={null} label="?" size={size} />;
  const platform = asset.platformId ? findPlatform(asset.platformId) : undefined;
  return (
    <TokenLogo
      logo={asset.logo}
      symbol={asset.name}
      name={asset.name}
      networkLogo={network?.logo ?? platform?.logo ?? null}
      networkName={network?.name ?? platform?.name ?? null}
      size={size}
    />
  );
}

export function assetSubtitle(asset: Asset | undefined, d: CustodyData): string {
  if (!asset) return '';
  if (asset.platformId) return `داخل ${findPlatform(asset.platformId)?.name ?? asset.platformId}`;
  const n = asset.networkId ? d.networkById.get(asset.networkId) : undefined;
  return n?.name ?? asset.networkId ?? '';
}

export function AssetChip({ assetId, d, size = 22 }: { assetId: string | null; d: CustodyData; size?: number }) {
  const asset = assetId ? d.assetById.get(assetId) : undefined;
  if (!asset) return <span className="text-muted">نامشخص</span>;
  const net = asset.networkId ? d.networkById.get(asset.networkId) : undefined;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <AssetLogoFor asset={asset} network={net} size={size} />
      {/* نام شبکه نوشته نمی‌شود؛ نشان شبکه روی لوگو کافی است (نام در alt و راهنمای لوگو) */}
      <span className="min-w-0 truncate font-semibold" title={assetSubtitle(asset, d)}>
        {asset.name}
      </span>
    </span>
  );
}

export function HoldingChip({ holdingId, d, size = 22 }: { holdingId: string | null; d: CustodyData; size?: number }) {
  const h = holdingId ? d.holdingById.get(holdingId) : undefined;
  if (!h) return <span className="text-muted">نامشخص</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <HoldingIcon holding={h} size={size} />
      <span className="truncate">{h.label}</span>
    </span>
  );
}

export function ProviderChip({ providerId, providerName, size = 20 }: { providerId: string | null; providerName?: string | null; size?: number }) {
  if (!providerId) return null;
  if (providerId === OTHER_PROVIDER_ID) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Landmark className="h-4 w-4 text-muted" aria-hidden />
        <span>{providerName || 'سایر'}</span>
      </span>
    );
  }
  const p = findPlatform(providerId);
  return (
    <span className="inline-flex items-center gap-1.5">
      <LogoImage src={p?.logo} label={p?.name ?? providerId} size={size} square />
      <span>{p?.name ?? providerId}</span>
    </span>
  );
}

/* ---------------- انتخابگر با جست‌وجو ---------------- */

export interface PickerOption {
  value: string;
  label: string;
  /** متن اضافی برای جست‌وجو (نماد، آدرس قرارداد، شبکه…) */
  keywords?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  group?: string;
}

export function EntityPicker({
  label,
  value,
  options,
  onChange,
  placeholder = 'انتخاب کنید',
  invalid,
  id,
  emptyText = 'گزینه‌ای یافت نشد',
  allowClear = false
}: {
  label: string;
  value: string | null;
  options: PickerOption[];
  onChange: (v: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  emptyText?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const nq = normalizeForSearch(q);
    if (!nq) return options;
    return options.filter((o) => normalizeForSearch(`${o.label} ${o.keywords ?? ''}`).includes(nq));
  }, [q, options]);

  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        onClick={() => setOpen(true)}
        className={cn(controlBase, 'flex items-center gap-2 text-start')}
      >
        {selected ? (
          <>
            {selected.icon}
            <span className="min-w-0 flex-1 truncate">{selected.label}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-subtle">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} size="sm">
        <div className="space-y-3">
          <SearchField value={q} onChange={setQ} placeholder="جست‌وجو…" label={`جست‌وجو در ${label}`} autoFocus />
          {allowClear && value && (
            <button
              type="button"
              className="w-full rounded-field px-3 py-2 text-start text-sm text-muted hover:bg-surface-2"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              بدون انتخاب
            </button>
          )}
          <ul className="max-h-[55vh] space-y-0.5 overflow-y-auto" role="listbox" aria-label={label}>
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li key={o.value}>
                {o.group && o.group !== filtered[i - 1]?.group && <p className="px-3 pb-1 pt-3 text-xs font-semibold text-subtle">{o.group}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQ('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-start hover:bg-surface-2',
                    o.value === value && 'bg-accent-soft/60'
                  )}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
                  </span>
                  {o.badge}
                  {o.value === value && <Check className="h-4 w-4 text-accent" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}

export function assetOptions(d: CustodyData, filter?: (a: Asset) => boolean): PickerOption[] {
  return d.assets.filter((a) => (filter ? filter(a) : true)).map((a) => {
    const net = a.networkId ? d.networkById.get(a.networkId) : undefined;
    return {
      value: a.id,
      label: a.name,
      // جست‌وجو با نام شبکه هم کار می‌کند، ولی نام شبکه نمایش داده نمی‌شود
      keywords: `${a.name} ${a.nameEn ?? ''} ${a.contract ?? ''} ${net?.name ?? ''} ${net?.nameEn ?? ''} ${net?.chainId ?? ''}`,
      // بدون آدرس قرارداد و نام شبکه — فقط نشان شبکه روی لوگو
      sub: a.isNative ? 'توکن اصلی شبکه' : a.platformId ? 'داخل پلتفرم' : undefined,
      icon: <AssetLogoFor asset={a} network={net} size={30} />,
      badge: a.origin === 'user' ? <Badge tone="warn">واردشده توسط شما</Badge> : undefined
    };
  });
}

export function holdingOptions(d: CustodyData, kinds?: HoldingKind[]): PickerOption[] {
  return d.holdings
    .filter((h) => !h.archivedAt && (!kinds || kinds.includes(h.kind)))
    .map((h) => ({
      value: h.id,
      label: h.label,
      keywords: `${h.address ?? ''} ${h.arcus?.address ?? ''} ${HOLDING_KIND_LABEL[h.kind]}`,
      sub: (
        <>
          {HOLDING_KIND_LABEL[h.kind]}
          {h.arcus ? ` · ${h.arcus.env === 'mainnet' ? 'شبکهٔ اصلی' : 'شبکهٔ آزمایشی'} · زیرحساب ${h.arcus.accountIndex}` : ''}
        </>
      ),
      icon: <HoldingIcon holding={h} />,
      group: HOLDING_KIND_LABEL[h.kind]
    }));
}

/* ---------------- تاریخ و ساعت با منطقهٔ زمانی ---------------- */

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function toLocalInput(ms: number | null): string {
  if (ms === null) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimeField({
  value,
  onChange,
  id
}: {
  value: number | null;
  onChange: (ms: number | null, tz: string | null) => void;
  id?: string;
}) {
  const time = value===null?'':toLocalInput(value).slice(11);
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px] gap-2"><SmartDateField id={id} value={value} compact onChange={ts=>{if(ts===null)return onChange(null,null);const d=new Date(ts);if(time){const [h,m]=time.split(':').map(Number);d.setHours(h,m,0,0);}onChange(d.getTime(),localTimeZone());}}/><input type="time" aria-label="ساعت" className={cn(controlBase,'min-w-0')} dir="ltr" value={time} onChange={e=>{if(!e.target.value)return;const d=new Date(value??Date.now());const [h,m]=e.target.value.split(':').map(Number);d.setHours(h,m,0,0);onChange(d.getTime(),localTimeZone());}}/></div>;
}

export function fmtOpTime(ms: number | null, tz: string | null): string {
  if (ms === null) return 'زمان نامعلوم';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz ?? undefined
    }).format(new Date(ms)) + (tz ? ` (${tz})` : '');
  } catch {
    return new Date(ms).toISOString();
  }
}
