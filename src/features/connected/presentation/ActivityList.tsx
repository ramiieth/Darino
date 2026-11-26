import { yieldTokenIdentity } from '@/shared/domain/yieldTokenIdentity';
import { YieldTokenLabel, YieldTokenMaturity } from '@/shared/components/ui/YieldTokenLabel';
import { ProtocolBadge } from './ProtocolBadge';
import { Fragment, useState, useCallback } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ShieldCheck, ChevronLeft, Clock, CalendarDays } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Badge } from '@/shared/components/ui/Badge';
import { TokenLogo, LogoImage } from '@/shared/components/ui/EntityLogo';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { AssetValue } from './AssetValue';
import { chainIdentity, tokenName, operationNames, tokenQuantity } from './identity';
import { dateTime } from './ConnectedPage';
import { activityDay } from '../domain/activityView';
import { isInternal, type Activity, type ActivityLink } from '../domain/activity';
import { visibleTransaction, visibleTransfer, tokenLogo } from '../domain/visibility';
import type { ChainInfo } from '../domain/model';
import { cn } from '@/shared/lib/cn';

const labels: Record<string, string> = {
  DEPOSIT: 'واریز به آرکوس',
  WITHDRAWAL: 'برداشت از آرکوس',
  TRANSFER: 'انتقال زیرحساب',
  bridge_swap: 'بریج همراه سواپ',
  bridge: 'بریج بین شبکه‌ها',
  arcus_withdrawal: 'برداشت آرکوس',
  arcus_deposit: 'واریز آرکوس'
};

export function ActivityList({
  rows,
  links = [],
  addresses = [],
  chains = [],
  preview = false
}: {
  rows: Activity[];
  links?: ActivityLink[];
  addresses?: string[];
  chains?: ChainInfo[];
  preview?: boolean;
}) {
  const [selected, setSelected] = useState<Activity | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const visible = rows.filter((r) => !r.tx || visibleTransaction(r.tx));
  const byKey = new Map(visible.map((r) => [r.key, r]));
  const children = new Set(links.filter((l) => byKey.has(l.from) && byKey.has(l.to)).map((l) => l.to));

  function name(row: Activity) {
    return row.provider === 'arcus' ? labels[row.kind] ?? 'فعالیت آرکوس' : operationNames[row.kind] ?? 'فعالیت قرارداد';
  }
  function flows(row: Activity) {
    return (row.tx?.transfers.length ? row.tx.transfers : row.tx?.approvals ?? []).filter((t) =>
      visibleTransfer(t, row.tx?.chain ?? '')
    );
  }

  function card(row: Activity, nested = false) {
    const tx = row.tx;
    const chain = tx ? chainIdentity(tx.chain, chains) : null;
    const assets = flows(row);
    const receiving = tx?.type === 'receive' || row.kind === 'DEPOSIT';
    const sending = tx?.type === 'send' || row.kind === 'WITHDRAWAL';
    const isApprove = ['approve', 'revoke'].includes(row.kind);
    const Icon = receiving ? ArrowDownLeft : sending ? ArrowUpRight : isApprove ? ShieldCheck : ArrowLeftRight;
    const main = assets.find((t) => t.direction === 'in') ?? assets[0];
    const confirmed = ['confirmed', 'APPLIED'].includes(row.status);

    const isIn = main ? main.direction === 'in' : receiving;
    const isOut = main ? main.direction === 'out' : sending;
    const sign = isIn ? '+' : isOut ? '-' : '';
    const amountTone = isIn ? 'text-positive' : isOut ? 'text-negative' : 'text-ink';
    const badgeTone = receiving || isIn ? 'gain' : sending || isOut ? 'loss' : isApprove ? 'warn' : 'info';
    const timeLabel =
      Number.isFinite(row.at) && row.at > 0
        ? preview
          ? new Date(row.at).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })
          : new Date(row.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
      <button
        type="button"
        onClick={() => setSelected(row)}
        aria-label={`جزئیات ${name(row)} · ${row.label}`}
        className={cn(
          'activity-native-row group flex min-h-20 w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition-all duration-150 hover:bg-surface-2/75 active:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          nested && 'mt-1 border-s-2 border-accent/35 bg-surface-2/30'
        )}
      >
        {/* آیکون توکن یا نوع عملیات */}
        {main ? (
          <div className="relative shrink-0">
            <TokenLogo
              chain={main.chain ?? tx?.chain}
              contract={main.contract}
              logo={tokenLogo({ ...main, chain: main.chain ?? tx?.chain ?? '' })}
              symbol={main.symbol}
              name={tokenName(main.symbol, main.name ?? main.symbol)}
              networkLogo={chain?.logo}
              networkName={chain?.name}
              size={38}
            />
          </div>
        ) : (
          <span
            className={cn(
              'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              receiving
                ? 'bg-gain/12 text-positive'
                : sending
                  ? 'bg-negative/12 text-negative'
                  : 'bg-surface-2 text-muted'
            )}
          >
            <Icon className="h-4.5 w-4.5" />
            <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-px">
              <LogoImage src={chain?.logo ?? '/logos/platform-arcus.png'} label={chain?.name ?? 'آرکوس'} size={18} />
            </span>
          </span>
        )}

        {/* ستون عنوان و دارایی */}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold text-ink">{name(row)}</span>
            {!preview && (
              <Badge tone={badgeTone} className="hidden sm:inline-flex">
                <Icon className="h-3 w-3" aria-hidden />
                {receiving ? 'ورودی' : sending ? 'خروجی' : isApprove ? 'مجوز' : 'تبدیل / قرارداد'}
              </Badge>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {main ? (
              yieldTokenIdentity(main.symbol, main.name) ? (
                <YieldTokenLabel symbol={main.symbol} name={main.name} />
              ) : (
                tokenName(main.symbol, main.name ?? main.symbol)
              )
            ) : (
              row.label
            )}
          </span>
          {main && yieldTokenIdentity(main.symbol, main.name) && (
            <span className="mt-0.5 block text-xs text-muted">
              <YieldTokenMaturity symbol={main.symbol} name={main.name} />
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle md:hidden">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {timeLabel}
            </span>
            {chain && <span>· {chain.name}</span>}
            {!confirmed && (
              <span className="font-semibold text-warn">
                {['pending', 'PENDING'].includes(row.status) ? 'در انتظار' : 'ناموفق'}
              </span>
            )}
          </span>
        </span>

        {/* ستون میانی روی دسکتاپ (پر کردن فضای خالی وسط در نمای کامل) */}
        {!preview && (
          <span className="hidden min-w-[11rem] flex-col items-start gap-1 text-xs text-muted md:flex">
            <span className="flex flex-wrap items-center gap-1.5">
              {chain && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-divider/80 bg-card px-2 py-0.5 text-[11px] font-medium text-ink">
                  <LogoImage src={chain.logo} label={chain.name} size={14} />
                  {chain.name}
                </span>
              )}
              {tx?.protocol && <ProtocolBadge name={tx.protocol} logo={tx.protocolIcon} />}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-subtle">
              <Clock className="h-3 w-3" aria-hidden />
              <span className="tabular-nums">{timeLabel}</span>
              {!confirmed && (
                <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                  {['pending', 'PENDING'].includes(row.status) ? 'در انتظار' : 'ناموفق'}
                </span>
              )}
            </span>
          </span>
        )}

        {/* ستون مقدار و ارزش — علامت + و - همیشه سمت چپ عدد (قبل از ارقام) با <bdi dir="ltr"> */}
        <span className="min-w-0 max-w-[49%] shrink-0 text-end">
          {main ? (
            <>
              <span className={cn('inline-flex flex-wrap items-baseline justify-end gap-1 text-xs font-extrabold sm:text-sm', amountTone)}>
                <bdi dir="ltr" className="num-ltr">
                  {sign}
                  {tokenQuantity(main.quantity)}
                </bdi>
                <span className="font-semibold">{tokenName(main.symbol)}</span>
              </span>
              <AssetValue value={main.value} className="mt-0.5 text-end" primaryClassName="text-xs font-semibold text-ink/85" />
            </>
          ) : (
            <AssetValue value={row.amount ? Number(row.amount) : null} className="text-end" primaryClassName="text-sm font-bold" />
          )}
        </span>

        <ChevronLeft className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" />
      </button>
    );
  }

  const top = visible.filter((r) => !children.has(r.key));
  const selectedFlows = selected ? flows(selected) : [];

  // در نمای کامل، تراکنش‌ها را بر اساس روز گروه‌بندی می‌کنیم تا هر روز یک کارت تمیز داشته باشد
  const dayGroups: { day: string; items: Activity[] }[] = [];
  if (!preview) {
    for (const row of top) {
      const day = activityDay(row.at);
      const last = dayGroups[dayGroups.length - 1];
      if (last && last.day === day) last.items.push(row);
      else dayGroups.push({ day, items: [row] });
    }
  }

  return (
    <>
      {preview ? (
        <ul className="native-activity-list space-y-0.5">
          {top.map((row) => {
            const link = links.find((l) => l.from === row.key && byKey.has(l.to));
            return (
              <li key={row.key} className="border-b border-divider/60 pb-0.5 last:border-b-0">
                {link && (
                  <p className="px-3 pt-2 text-[11px] font-semibold text-accent">
                    {labels[link.kind]} · {link.proof ? 'تطبیق خودکار' : 'تأییدشده'}
                  </p>
                )}
                {card(row)}
                {link && card(byKey.get(link.to)!, true)}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="native-activity-list space-y-4">
          {dayGroups.map(({ day, items }) => (
            <section key={day} className="overflow-hidden rounded-2xl border border-divider/85 bg-card shadow-card">
              <div className="flex items-center justify-between gap-2 border-b border-divider/70 bg-surface-2/50 px-4 py-2.5">
                <h3 className="flex items-center gap-2 text-xs font-bold text-ink">
                  <CalendarDays className="h-3.5 w-3.5 text-accent" aria-hidden />
                  {day}
                </h3>
                <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-divider/70 tabular-nums">
                  {new Intl.NumberFormat('fa-IR').format(items.length)} تراکنش
                </span>
              </div>
              <ul className="divide-y divide-divider/60 p-1.5">
                {items.map((row) => {
                  const link = links.find((l) => l.from === row.key && byKey.has(l.to));
                  return (
                    <li key={row.key}>
                      {link && (
                        <p className="px-3 pt-2 text-[11px] font-semibold text-accent">
                          {labels[link.kind]} · {link.proof ? 'تطبیق خودکار' : 'تأییدشده'}
                        </p>
                      )}
                      {card(row)}
                      {link && card(byKey.get(link.to)!, true)}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onClose={close} title={selected ? name(selected) : 'جزئیات تراکنش'}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={selected && ['confirmed', 'APPLIED'].includes(selected.status) ? 'gain' : 'warn'}>
              {selected && ['confirmed', 'APPLIED'].includes(selected.status) ? 'تأییدشده' : 'در حال بررسی'}
            </Badge>
            {selected?.tx && isInternal(selected.tx, addresses) && <Badge tone="info">انتقال داخلی</Badge>}
          </div>
          <p className="text-xs text-muted">
            {selected?.label} · {selected && Number.isFinite(selected.at) ? dateTime(selected.at) : '—'}
          </p>
          <ul className="divide-y divide-divider">
            {selectedFlows.map((t, i) => {
              const n = chainIdentity(t.chain ?? selected?.tx?.chain ?? '', chains);
              const flowSign = t.direction === 'in' ? '+' : t.direction === 'out' ? '-' : '';
              return (
                <li key={i} className="flex flex-wrap items-center gap-3 py-3">
                  <TokenLogo
                    chain={t.chain ?? selected?.tx?.chain}
                    contract={t.contract}
                    logo={tokenLogo({ ...t, chain: t.chain ?? selected?.tx?.chain ?? '' })}
                    symbol={t.symbol}
                    name={tokenName(t.symbol, t.name ?? t.symbol)}
                    networkLogo={n.logo}
                    networkName={n.name}
                    size={38}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {yieldTokenIdentity(t.symbol, t.name) ? (
                        <YieldTokenLabel symbol={t.symbol} name={t.name} />
                      ) : (
                        tokenName(t.symbol, t.name ?? t.symbol)
                      )}
                    </p>
                    {yieldTokenIdentity(t.symbol, t.name) && (
                      <p className="mt-1 text-xs text-muted">
                        <YieldTokenMaturity symbol={t.symbol} name={t.name} />
                      </p>
                    )}
                    <p
                      className={cn(
                        'inline-flex items-baseline gap-1 text-xs font-semibold',
                        t.direction === 'in' ? 'text-positive' : t.direction === 'out' ? 'text-negative' : 'text-muted'
                      )}
                    >
                      <bdi dir="ltr" className="num-ltr">
                        {flowSign}
                        {tokenQuantity(t.quantity)}
                      </bdi>
                      <span>{tokenName(t.symbol)}</span>
                    </p>
                  </div>
                  <AssetValue value={t.value} primaryClassName="text-sm font-semibold" className="text-end" />
                </li>
              );
            })}
          </ul>
          {selected?.tx?.protocol && (
            <p className="flex items-center gap-2 text-sm">
              <ProtocolBadge name={selected.tx.protocol} logo={selected.tx.protocolIcon} size={24} />
            </p>
          )}
          {selected?.tx && (
            <div className="space-y-3 rounded-xl border border-divider/70 bg-surface-2/70 p-3 text-xs">
              <p>
                کارمزد{' '}
                {selected.tx.feeToken?.quantity ? (
                  <bdi dir="rtl">
                    {tokenQuantity(selected.tx.feeToken.quantity)} {tokenName(selected.tx.feeToken.symbol)}
                  </bdi>
                ) : (
                  <MoneyValue value={selected.tx.fee} />
                )}
              </p>
              {[
                ['شناسهٔ تراکنش', selected.tx.hash || selected.tx.id],
                ['آدرس مبدأ', selected.tx.from || selectedFlows.find((t) => t.direction === 'in')?.sender || selectedFlows.find((t) => t.direction === 'in')?.address],
                ['آدرس مقصد', selected.tx.to || selectedFlows.find((t) => t.direction === 'out')?.recipient || selectedFlows.find((t) => t.direction === 'out')?.address]
              ].map(
                ([label, value]) =>
                  value && (
                    <div key={label}>
                      <p className="mb-1 text-muted">{label}</p>
                      <bdi dir="ltr" className="block break-all font-latin text-ink">
                        {value}
                      </bdi>
                    </div>
                  )
              )}
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
