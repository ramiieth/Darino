/**
 * تی‌اکس‌فلو — صفحهٔ مستقل مثل لایتر رابین‌هود و آرکوس (فقط‌خواندنی، فقط آدرس عمومی)
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { VenueTabs } from '@/shared/components/layout/SectionTabs';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { cn } from '@/shared/lib/cn';
import { faNumber, toFaDigits } from '@/shared/utils/formatters';
import { useCustody } from '@/features/custody/data/useCustody';
import { getCustodySnapshot, saveHolding } from '@/features/custody/data/repository';
import { usePerpMarkets } from '@/features/calculators/data/perpMarkets';
import { useHlLikeVenues } from '../data/usePerpVenues';
import type { PerpVenueAccount } from '../domain/perpPortfolio';
import { MarketAssetIdentity } from './MarketAssetIdentity';

const PLATFORM = 'txflow';
const fmt = (n: number | null | undefined, d = 6) => (n === null || n === undefined || !Number.isFinite(n) ? 'نامشخص' : faNumber(n, { maximumFractionDigits: d }));
const fundingPct = (h: number | null) =>
  h === null ? 'نامشخص' : `${faNumber(h * 100, { maximumFractionDigits: 4 })}٪ ساعتی · ${faNumber(h * 100 * 24 * 365, { maximumFractionDigits: 1 })}٪ سالانه`;

function AccountCard({ a, removable }: { a: PerpVenueAccount; removable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = a.status === 'loading' ? 'loading' : a.stale ? 'stale' : 'ready';

  async function remove() {
    const h = getCustodySnapshot().holdings.find((x) => x.id === a.id);
    if (!h) return;
    setBusy(true);
    try {
      await saveHolding({ ...h, archivedAt: Date.now(), updatedAt: Date.now() });
    } catch {
      setError('حذف اتصال انجام نشد');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface variant="focal" className="relative space-y-4 overflow-hidden p-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent via-gain/60 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-ink">{a.label}</h2>
            {a.address && (
              <p dir="ltr" className="mt-0.5 break-all font-latin text-xs text-muted">
                {a.address}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {a.status === 'error' && <Badge tone="warn">دریافت نشد</Badge>}
          {a.stale && <Badge tone="warn">قدیمی</Badge>}
          {removable && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} loading={busy} onClick={() => void remove()}>
              حذف اتصال
            </Button>
          )}
        </div>
      </div>

      {error && <Notice tone="warn">{error}</Notice>}

      <MetricGrid cols={4} className="!gap-3">
        <div className="rounded-xl border border-divider/80 bg-surface-2/55 p-3">
          <Metric label="ارزش حساب (یو‌اس‌دی‌سی)" value={<MoneyValue value={a.equity} state={state} />} />
        </div>
        <div className="rounded-xl border border-divider/80 bg-surface-2/55 p-3">
          <Metric label="سود/زیان از ابتدا" value={<MoneyValue value={a.allTimePnl} signed tone="auto" state={state} />} sub="ارزش − خالص واریز" />
        </div>
        <div className="rounded-xl border border-divider/80 bg-surface-2/55 p-3">
          <Metric label="بسته‌شده" value={<MoneyValue value={a.realizedPnl} signed tone="auto" state={state} />} sub="معاملات + فاندینگ − کارمزد" />
        </div>
        <div className="rounded-xl border border-divider/80 bg-surface-2/55 p-3">
          <Metric label="باز" value={<MoneyValue value={a.unrealizedPnl} signed tone="auto" state={state} />} />
        </div>
      </MetricGrid>

      {a.positions.length ? (
        <div className="overflow-x-auto rounded-xl border border-divider/80">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                {['نماد', 'جهت', 'تعداد', 'قیمت ورود', 'سود و زیان باز', 'قیمت لیکویید'].map((h) => (
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
                    <MarketAssetIdentity symbol={p.symbol} />
                  </td>
                  <td>
                    <Badge tone={p.side === 'long' ? 'gain' : 'loss'}>{p.side === 'long' ? 'لانگ' : 'شورت'}</Badge>
                  </td>
                  <td className="num-ltr">{fmt(p.size)}</td>
                  <td className="num-ltr">{fmt(p.entry)}</td>
                  <td className={cn('num-ltr font-bold', p.pnl === null ? 'text-muted' : p.pnl >= 0 ? 'text-positive' : 'text-negative')}>
                    {fmt(p.pnl, 2)}
                  </td>
                  <td className="num-ltr text-muted">{p.liquidation ? fmt(p.liquidation) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        a.status === 'ready' && <p className="rounded-xl bg-surface-2/40 px-3.5 py-2.5 text-xs text-muted">پوزیشن بازی وجود ندارد.</p>
      )}
    </Surface>
  );
}

export default function TxflowPage() {
  const custody = useCustody();
  const venues = useHlLikeVenues().filter((v) => v.venue === 'txflow');
  const markets = usePerpMarkets('txflow');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const registered = new Set(custody.holdings.filter((h) => h.kind === 'platform' && h.platformId === PLATFORM && !h.archivedAt).map((h) => h.id));

  async function add() {
    setError('');
    setBusy(true);
    try {
      const a = address.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw Error('آدرس عمومی EVM معتبر وارد کنید');
      const existing = getCustodySnapshot().holdings.find((h) => h.kind === 'platform' && h.platformId === PLATFORM && h.address?.toLowerCase() === a.toLowerCase());
      if (existing && !existing.archivedAt) throw Error('این حساب قبلاً اضافه شده است');
      const now = Date.now();
      await saveHolding({
        id: existing?.id ?? crypto.randomUUID(),
        kind: 'platform',
        platformId: PLATFORM,
        address: a,
        label: label.trim() || 'حساب تی‌اکس‌فلو',
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

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (markets.data ?? []).filter((m) => !q || [m.base, m.display, m.nameFa].some((v) => v.toLowerCase().includes(q)));
  }, [markets.data, search]);

  const showForm = venues.length === 0 || addOpen;

  return (
    <Page>
      <PageHeader eyebrow="حساب‌های صرافی · فقط‌خواندنی" title="تی‌اکس‌فلو" subtitle="موجودی، سود/زیان، پوزیشن‌ها و بازارهای زنده" />
      <VenueTabs />

      <Surface className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden p-4 md:p-5">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l from-accent/80 via-gain/50 to-transparent" />
        <div className="flex min-w-0 items-center gap-3">
          <LogoImage src="/logos/platform-txflow.png" label="تی‌اکس‌فلو" size={44} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-ink">تی‌اکس‌فلو</p>
              <Badge tone="neutral">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                فقط‌خواندنی
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">اتصال فقط با آدرس عمومی؛ بدون کلید خصوصی یا امضای تراکنش.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {venues.length > 0 && (
            <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? 'بستن فرم' : 'افزودن حساب'}
            </Button>
          )}
          <a className={buttonClass('outline', 'sm')} href="https://app.txflow.com/" target="_blank" rel="noopener noreferrer">
            <span>باز کردن پلتفرم</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </Surface>

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

      {!venues.length ? (
        <Notice>هنوز حسابی از تی‌اکس‌فلو متصل نیست. آدرس عمومی را اضافه کنید؛ کیف پول‌های EVM متصل هم اگر موجودی داشته باشند خودکار نمایش داده می‌شوند.</Notice>
      ) : (
        venues.map((a) => <AccountCard key={a.id} a={a} removable={registered.has(a.id)} />)
      )}

      <Notice>
        برای دفتر دلتا نوترال و فارم پوینت به{' '}
        <Link className="font-semibold text-accent underline" to="/funding?tab=ledger">
          دفتر جفت‌ها در درآمد فاندینگ
        </Link>{' '}
        بروید.
      </Notice>

      <Surface className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-ink">بازارهای پرپچوال</h2>
            {markets.isSuccess && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted tabular-nums">
                {toFaDigits(list.length)}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={markets.isFetching} onClick={() => void markets.refetch()}>
            به‌روزرسانی
          </Button>
        </div>
        <Input aria-label="جست‌وجوی بازار" withSearchIcon value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نماد…" />
        {markets.isPending && <p className="text-sm text-muted">در حال دریافت بازارها…</p>}
        {markets.isError && <Notice tone={markets.data ? 'stale' : 'warn'}>دریافت بازارها انجام نشد{markets.data ? '؛ دادهٔ قبلی نمایش داده می‌شود.' : ''}</Notice>}
        {markets.isSuccess && !list.length && <p className="text-sm text-muted">بازاری پیدا نشد.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <div key={m.id} className="rounded-xl border border-divider/80 bg-card p-4 transition-all duration-150 hover:border-accent/35 hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <MarketAssetIdentity symbol={m.base} name={m.nameFa} />
                {m.change24hPct !== null && (
                  <Badge tone={m.change24hPct >= 0 ? 'gain' : 'loss'}>
                    <bdi dir="ltr" className="num-ltr">
                      {m.change24hPct > 0 ? '+' : ''}
                      {fmt(m.change24hPct, 2)}٪
                    </bdi>
                  </Badge>
                )}
              </div>
              <p className="mt-3 text-sm font-bold text-ink tabular-nums">قیمت مارک: {fmt(m.markPrice)} دلار</p>
              <p className="mt-1 text-xs text-muted">فاندینگ: {fundingPct(m.fundingHourly)}</p>
              {m.maxLeverage !== null && (
                <div className="mt-2">
                  <Badge tone="neutral">اهرم تا {fmt(m.maxLeverage, 0)}x</Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </Surface>
    </Page>
  );
}
