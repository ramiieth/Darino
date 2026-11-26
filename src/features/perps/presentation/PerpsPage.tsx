import { VenueTabs } from '@/shared/components/layout/SectionTabs';
import { persianTicker } from '@/shared/domain/yieldTokenIdentity';
import { faNumber, toFaDigits } from '@/shared/utils/formatters';
import { MarketAssetIdentity, marketAssetName } from './MarketAssetIdentity';
import { PerpsIdentity } from './PerpsIdentity';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { useCustody } from '@/features/custody/data/useCustody';
import { saveHolding, getCustodySnapshot } from '@/features/custody/data/repository';
import { lighterAccountQuery } from '../data/lighterAccount';
import { lighterAccounts, lighterMarkets, ondoMarkets, type PerpMarket } from '../domain/model';

const fmt = (n: number | null) => (n === null || !Number.isFinite(n) ? 'نامشخص' : faNumber(n, { maximumFractionDigits: 6 }));
const message = (e: unknown) =>
  e instanceof HttpError && e.status === 429 ? 'درخواست‌های زیادی ارسال شده؛ کمی بعد دوباره تلاش کنید' : 'دریافت اطلاعات انجام نشد';

function Account({
  address,
  label,
  onRemove,
  mainnet = false
}: {
  address: string;
  label: string;
  onRemove: () => Promise<void>;
  mainnet?: boolean;
}) {
  const q = useQuery(lighterAccountQuery(address, mainnet ? 'mainnet' : 'robinhood'));
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const accounts = lighterAccounts(q.data, address);
  const unit = mainnet ? 'یو‌اس‌دی‌سی' : 'یو‌اس‌دی‌جی';

  return (
    <Surface variant="focal" className="relative space-y-4 overflow-hidden p-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent via-gain/60 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-ink">{label}</h2>
            <p dir="ltr" className="mt-0.5 break-all font-latin text-xs text-muted">
              {address}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={q.isFetching} onClick={() => void q.refetch()}>
            به‌روزرسانی
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            loading={removing}
            onClick={async () => {
              setRemoving(true);
              try {
                await onRemove();
              } catch {
                setError('حذف اتصال انجام نشد');
              } finally {
                setRemoving(false);
              }
            }}
          >
            حذف اتصال
          </Button>
        </div>
      </div>

      {error && <Notice tone="warn">{error}</Notice>}
      {q.isPending && <p className="text-sm text-muted">در حال دریافت حساب…</p>}
      {q.isError && (
        <Notice tone={q.data ? 'stale' : 'warn'}>
          {message(q.error)}
          {q.data ? '؛ دادهٔ قبلی نمایش داده می‌شود.' : ''}
        </Notice>
      )}
      {q.isSuccess && !accounts.length && <Notice>حساب فعالی برای این آدرس در این شبکه پیدا نشد.</Notice>}

      {accounts.map((a) => (
        <section key={a.index} className="space-y-4 border-t border-divider/80 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">حساب {fmt(a.index)}</h3>
            <Badge tone="neutral">{toFaDigits(a.positions.length)} پوزیشن باز</Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-divider/80 bg-surface-2/55 p-3.5">
              <p className="text-xs font-medium text-muted">ارزش حساب ({unit})</p>
              <p className="num-ltr mt-1.5 text-2xl font-extrabold text-ink">{fmt(a.equity)}</p>
            </div>
            <div className="rounded-xl border border-divider/80 bg-surface-2/55 p-3.5">
              <p className="text-xs font-medium text-muted">موجودی قابل استفاده ({unit})</p>
              <p className="num-ltr mt-1.5 text-2xl font-extrabold text-ink">{fmt(a.available)}</p>
            </div>
          </div>

          {mainnet && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-muted">دارایی‌های اسپات و وثیقه</h4>
              {a.assets.length ? (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {a.assets.map((t) => (
                    <div key={t.symbol} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider/80 bg-card p-3">
                      <MarketAssetIdentity symbol={t.symbol} />
                      <div className="space-y-0.5 text-end text-xs tabular-nums">
                        <p className="font-semibold text-ink">موجودی: {fmt(t.balance)}</p>
                        <p className="text-muted">قفل‌شده: {fmt(t.locked)} · وثیقه: {fmt(t.margin)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">دارایی با موجودی مثبت یافت نشد.</p>
              )}
            </div>
          )}

          {a.positions.length ? (
            <div className="overflow-x-auto rounded-xl border border-divider/80">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr>
                    {['نماد', 'جهت', 'تعداد', 'قیمت ورود', `سود و زیان تحقق‌نیافته (${unit})`, 'قیمت لیکویید'].map((h) => (
                      <th key={h} className="whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.positions.map((p, i) => (
                    <tr key={`${p.symbol}-${i}`}>
                      <td>
                        <MarketAssetIdentity symbol={p.symbol} robinhood={!mainnet} />
                      </td>
                      <td>
                        <Badge tone={p.side === 'long' ? 'gain' : 'loss'}>{p.side === 'long' ? 'لانگ' : 'شورت'}</Badge>
                      </td>
                      <td className="num-ltr">{fmt(p.size)}</td>
                      <td className="num-ltr">{fmt(p.entry)}</td>
                      <td className={cn('num-ltr font-bold', p.pnl === null ? 'text-muted' : p.pnl >= 0 ? 'text-positive' : 'text-negative')}>
                        {fmt(p.pnl)}
                      </td>
                      <td className="num-ltr text-muted">{p.liquidation === 0 ? '—' : fmt(p.liquidation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-2/40 px-3.5 py-2.5 text-xs text-muted">پوزیشن بازی وجود ندارد.</p>
          )}
        </section>
      ))}
    </Surface>
  );
}

type LighterTab = 'perp' | 'spot' | 'assets' | 'robinhood';

function PerpsContent({
  provider,
  network = 'robinhood',
  mode = 'perp',
  lighterTab,
  onLighterTab
}: {
  provider: 'lighter' | 'ondo';
  network?: 'mainnet' | 'robinhood';
  mode?: 'perp' | 'spot' | 'assets';
  lighterTab?: LighterTab;
  onLighterTab?: (t: LighterTab) => void;
}) {
  const lighter = provider === 'lighter';
  const mainnet = lighter && network === 'mainnet';
  const showAccounts = lighter && (!mainnet || mode === 'assets');
  const title = lighter
    ? mainnet
      ? mode === 'spot'
        ? 'بازار اسپات لایتر'
        : mode === 'assets'
          ? 'دارایی‌های لایتر'
          : 'بازار پرپچوال لایتر'
      : 'لایتر — شبکهٔ رابین‌هود'
    : 'اوندو پرپس';
  const platformId = mainnet ? 'lighter-mainnet' : 'lighter-robinhood';
  const custody = useCustody();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const holdings = custody.holdings.filter((h) => h.kind === 'platform' && h.platformId === platformId && !h.archivedAt && h.address);
  const q = useQuery({
    queryKey: mainnet ? ['perps-markets', 'lighter-mainnet', mode] : ['perps-markets', provider],
    queryFn: async () => {
      if (lighter)
        return lighterMarkets(
          await fetchJson<unknown>(`/api/integrations?op=${mainnet ? 'lighter-mainnet-markets' : 'lighter-markets'}`, { timeoutMs: 15000 }),
          mode === 'spot' ? 'spot' : 'perp'
        );
      const data = await fetchJson<{ markets: unknown; prices: unknown }>('/api/integrations?op=ondo-markets', { timeoutMs: 15000 });
      return ondoMarkets(data.markets, data.prices);
    },
    enabled: mode !== 'assets',
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1
  });

  async function add() {
    setError('');
    setBusy(true);
    try {
      const a = address.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw Error('آدرس عمومی کیف پول معتبر وارد کنید');
      const existing = getCustodySnapshot().holdings.find(
        (h) => h.kind === 'platform' && h.platformId === platformId && h.address?.toLowerCase() === a.toLowerCase()
      );
      if (existing && !existing.archivedAt) throw Error('این حساب قبلاً اضافه شده است');
      const now = Date.now();
      await saveHolding({
        id: existing?.id ?? crypto.randomUUID(),
        kind: 'platform',
        platformId,
        address: a,
        label: label.trim() || (mainnet ? 'حساب لایتر' : 'حساب لایتر رابین‌هود'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        archivedAt: null
      });
      setAddress('');
      setLabel('');
      setAddOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیره انجام نشد');
    } finally {
      setBusy(false);
    }
  }

  const markets: PerpMarket[] = (q.data ?? []).filter((m) =>
    [m.symbol, m.name ?? '', persianTicker(m.symbol), marketAssetName(m.symbol, m.name)].some((value) =>
      value.toLowerCase().includes(search.trim().toLowerCase())
    )
  );
  const showForm = holdings.length === 0 || addOpen;

  return (
    <Page>
      <PageHeader
        eyebrow="حساب‌های صرافی · فقط‌خواندنی"
        title={title}
        subtitle={
          lighter
            ? mainnet
              ? 'لایتر اصلی؛ موجودی، بازارها و پوزیشن‌ها بدون نیاز به کلید خصوصی'
              : 'موجودی و پوزیشن‌های حساب روی شبکهٔ رابین‌هود'
            : 'بازارهای قرارداد دائمی اوندو'
        }
      />
      <VenueTabs />

      {/* نوار بخش‌های داخلی لایتر — در جای درست (زیر نوار صرافی‌ها) */}
      {lighter && lighterTab && onLighterTab && (
        <div role="tablist" aria-label="بخش‌های لایتر" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-divider/80 bg-surface-2/65 p-1.5 sm:grid-cols-4">
          {(
            [
              ['perp', 'بازار پرپچوال'],
              ['spot', 'بازار اسپات'],
              ['assets', 'دارایی‌ها'],
              ['robinhood', 'رابین‌هود']
            ] as const
          ).map(([value, tabLabel]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={lighterTab === value}
              className={cn(
                'min-h-10 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-150 sm:text-sm',
                lighterTab === value ? 'bg-card text-accent shadow-sm ring-1 ring-divider/80' : 'text-muted hover:text-ink'
              )}
              onClick={() => onLighterTab(value)}
            >
              {tabLabel}
            </button>
          ))}
        </div>
      )}

      {/* بنر هویت صرافی */}
      <Surface className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden p-4 md:p-5">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l from-accent/80 via-gain/50 to-transparent" />
        <div className="flex flex-wrap items-center gap-3">
          <PerpsIdentity provider={mainnet ? 'lighter-mainnet' : provider} />
          <Badge tone="neutral">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            فقط‌خواندنی
          </Badge>
        </div>
        <p className="text-xs text-muted">
          {lighter ? 'اتصال فقط با آدرس عمومی؛ بدون کلید خصوصی یا امضای تراکنش.' : 'قیمت‌ها از رابط رسمی اوندو دریافت می‌شوند.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {showAccounts && holdings.length > 0 && (
            <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? 'بستن فرم' : 'افزودن حساب'}
            </Button>
          )}
          <a
            className={buttonClass('outline', 'sm')}
            href={
              lighter
                ? mainnet
                  ? mode === 'spot'
                    ? 'https://app.lighter.xyz/trade/LIT_USDC'
                    : 'https://app.lighter.xyz/trade/LIT'
                  : 'https://robinhoodchain.lighter.xyz/trade/LIT'
                : 'https://app.ondoperps.xyz/'
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>باز کردن پلتفرم</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </Surface>

      {showAccounts ? (
        <>
          {showForm && (
            <Surface className="p-4 md:p-5">
              <form
                className="grid gap-4 md:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add();
                }}
              >
                <Field label="نام حساب">
                  <Input maxLength={80} disabled={busy} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="حساب من" />
                </Field>
                <Field label="آدرس عمومی کیف پول">
                  <Input dir="ltr" autoComplete="off" maxLength={42} disabled={busy} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" />
                </Field>
                <Button type="submit" className="self-end" loading={busy} disabled={!custody.loaded || !address.trim()}>
                  افزودن حساب
                </Button>
                {error && (
                  <div className="md:col-span-3">
                    <Notice tone="warn">{error}</Notice>
                  </div>
                )}
              </form>
            </Surface>
          )}
          {holdings.map((h) => (
            <Account
              mainnet={mainnet}
              key={h.id}
              address={h.address!}
              label={h.label}
              onRemove={() => saveHolding({ ...h, archivedAt: Date.now(), updatedAt: Date.now() })}
            />
          ))}
          <Notice>
            مبالغ این حساب با واحد {mainnet ? 'یو‌اس‌دی‌سی' : 'یو‌اس‌دی‌جی'} نمایش داده می‌شوند.
          </Notice>
        </>
      ) : !lighter ? (
        <Notice title="اتصال حساب شخصی">
          این صفحه بازارهای عمومی را نمایش می‌دهد. برای مشاهدهٔ موجودی شخصی از پلتفرم رسمی اوندو وارد شوید.
        </Notice>
      ) : null}

      {mode !== 'assets' && (
        <Surface className="space-y-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-ink">{mode === 'spot' ? 'بازارهای اسپات' : 'بازارهای پرپچوال'}</h2>
              {q.isSuccess && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted tabular-nums">
                  {toFaDigits(markets.length)}
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={q.isFetching} onClick={() => void q.refetch()}>
              به‌روزرسانی قیمت‌ها
            </Button>
          </div>
          <Input aria-label="جست‌وجوی بازار" withSearchIcon value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نماد…" />
          {q.isPending && <p className="text-sm text-muted">در حال دریافت بازارها…</p>}
          {q.isError && (
            <Notice tone={q.data ? 'stale' : 'warn'}>
              {message(q.error)}
              {q.data ? '؛ قیمت‌های قبلی نمایش داده می‌شوند.' : ''}
            </Notice>
          )}
          {q.isSuccess && !markets.length && <p className="text-sm text-muted">بازاری پیدا نشد.</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {markets.map((m) => (
              <div key={m.symbol} className="rounded-xl border border-divider/80 bg-card p-4 transition-all duration-150 hover:border-accent/35 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <MarketAssetIdentity symbol={m.symbol} name={m.name} logo={m.logo} robinhood={lighter && !mainnet} />
                  {m.change !== null && (
                    <Badge tone={m.change >= 0 ? 'gain' : 'loss'}>
                      <bdi dir="ltr" className="num-ltr">
                        {m.change > 0 ? '+' : ''}
                        {fmt(m.change)}٪
                      </bdi>
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-sm font-bold text-ink tabular-nums">
                  {mode === 'spot' ? 'قیمت:' : 'قیمت مارک:'} {fmt(m.price)}{' '}
                  {mainnet && mode === 'spot' && m.quote ? persianTicker(m.quote) : lighter ? (mainnet ? 'یو‌اس‌دی‌سی' : 'یو‌اس‌دی‌جی') : 'دلار'}
                </p>
              </div>
            ))}
          </div>
        </Surface>
      )}
    </Page>
  );
}

export default function PerpsPage({
  provider,
  initialTab = 'robinhood'
}: {
  provider: 'lighter' | 'ondo';
  initialTab?: LighterTab;
}) {
  const [tab, setTab] = useState<LighterTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  if (provider === 'ondo') return <PerpsContent provider="ondo" />;
  return (
    <PerpsContent
      key={tab}
      provider="lighter"
      mode={tab === 'robinhood' ? 'perp' : tab}
      network={tab === 'robinhood' ? 'robinhood' : 'mainnet'}
      lighterTab={tab}
      onLighterTab={setTab}
    />
  );
}
