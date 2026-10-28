/**
 * تی‌اکس‌فلو — صفحهٔ مستقل مثل لایتر رابین‌هود و آرکوس (فقط‌خواندنی، فقط آدرس عمومی)
 *
 *   حساب‌ها: همان منبع کارت «سود/زیان پرپچوال» داشبورد (useHlLikeVenues): حساب ثبت‌شده، آدرس env و کیف پول EVM متصلی
 *            که روی تی‌اکس‌فلو موجودی یا پوزیشن دارد. ارزش، سود/زیان کل/بسته/باز و پوزیشن‌ها از clearinghouseState و دفتر واریز.
 *   بازارها: همان داده‌ای که ماشین‌حساب‌ها می‌خوانند (perpMeta + webData2 + فاندینگ زنده).
 *   تی‌اکس‌فلو سری سود/زیان دوره‌ای عمومی ندارد؛ ۲۴ ساعت/۷/۳۰ روز «نامعلوم» نمایش داده می‌شود، حدس زده نمی‌شود.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { faNumber } from '@/shared/utils/formatters';
import { useCustody } from '@/features/custody/data/useCustody';
import { getCustodySnapshot, saveHolding } from '@/features/custody/data/repository';
import { usePerpMarkets } from '@/features/calculators/data/perpMarkets';
import { useHlLikeVenues } from '../data/usePerpVenues';
import type { PerpVenueAccount } from '../domain/perpPortfolio';
import { MarketAssetIdentity } from './MarketAssetIdentity';

const PLATFORM = 'txflow';
const fmt = (n: number | null | undefined, d = 6) => (n === null || n === undefined || !Number.isFinite(n) ? 'نامشخص' : faNumber(n, { maximumFractionDigits: d }));
const fundingPct = (h: number | null) => (h === null ? 'نامشخص' : `${faNumber(h * 100, { maximumFractionDigits: 4 })}٪ ساعتی · ${faNumber(h * 100 * 24 * 365, { maximumFractionDigits: 1 })}٪ سالانه`);

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
    <Surface className="space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">{a.label}</h2>
          {a.address && <p dir="ltr" className="mt-1 break-all text-xs text-muted">{a.address}</p>}
        </div>
        <div className="flex items-center gap-2">
          {a.status === 'error' && <Badge tone="warn">دریافت نشد</Badge>}
          {a.stale && <Badge tone="warn">قدیمی</Badge>}
          {removable && <Button size="sm" variant="outline" loading={busy} onClick={() => void remove()}>حذف اتصال</Button>}
        </div>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      <MetricGrid cols={4}>
        <Metric label="ارزش حساب (یو‌اس‌دی‌سی)" value={<MoneyValue value={a.equity} state={state} />} />
        <Metric label="سود/زیان از ابتدا" value={<MoneyValue value={a.allTimePnl} signed tone="auto" state={state} />} sub="ارزش − خالص واریز" />
        <Metric label="بسته‌شده" value={<MoneyValue value={a.realizedPnl} signed tone="auto" state={state} />} sub="معاملات + فاندینگ − کارمزد" />
        <Metric label="باز" value={<MoneyValue value={a.unrealizedPnl} signed tone="auto" state={state} />} />
      </MetricGrid>
      {a.positions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{['نماد', 'جهت', 'تعداد', 'قیمت ورود', 'سود و زیان باز', 'قیمت لیکویید'].map((h) => <th key={h} className="whitespace-nowrap p-3 text-start">{h}</th>)}</tr></thead>
            <tbody>
              {a.positions.map((p, i) => (
                <tr key={`${p.symbol}-${i}`} className="border-t border-divider">
                  <td className="p-3"><MarketAssetIdentity symbol={p.symbol} /></td>
                  <td className="p-3">{p.side === 'long' ? 'لانگ' : 'شورت'}</td>
                  <td className="p-3">{fmt(p.size)}</td>
                  <td className="p-3">{fmt(p.entry)}</td>
                  <td className={`p-3 ${p.pnl === null ? '' : p.pnl >= 0 ? 'text-positive' : 'text-negative'}`}>{fmt(p.pnl, 2)}</td>
                  <td className="p-3">{p.liquidation ? fmt(p.liquidation) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        a.status === 'ready' && <p className="text-xs text-muted">پوزیشن بازی وجود ندارد.</p>
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
      await saveHolding({ id: existing?.id ?? crypto.randomUUID(), kind: 'platform', platformId: PLATFORM, address: a, label: label.trim() || 'حساب تی‌اکس‌فلو', createdAt: existing?.createdAt ?? now, updatedAt: now, archivedAt: null });
      setAddress('');
      setLabel('');
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

  return (
    <Page>
      <PageHeader title="تی‌اکس‌فلو" subtitle="موجودی، سود/زیان و پوزیشن‌های حساب، به‌اضافهٔ بازارها و فاندینگ زنده" />
      <Surface className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <LogoImage src="/logos/platform-txflow.png" label="تی‌اکس‌فلو" size={44} />
          <div className="min-w-0"><p className="font-bold">تی‌اکس‌فلو</p><p className="mt-1 text-xs text-muted">پرپچوال با API سازگار با هایپرلیکوئید</p></div>
        </div>
        <p className="text-sm text-muted">اتصال فقط با آدرس عمومی؛ بدون کلید خصوصی یا امضای تراکنش.</p>
        <a className="text-sm font-semibold text-accent" href="https://app.txflow.com/" target="_blank" rel="noopener noreferrer">باز کردن پلتفرم ↗</a>
      </Surface>

      <Surface className="p-5">
        <form className="grid gap-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Field label="نام حساب"><Input maxLength={80} disabled={busy} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="حساب من" /></Field>
          <Field label="آدرس عمومی کیف پول"><Input dir="ltr" autoComplete="off" maxLength={42} disabled={busy} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" /></Field>
          <Button type="submit" className="self-end" loading={busy} disabled={!custody.loaded || !address.trim()}>افزودن حساب</Button>
          {error && <div className="md:col-span-3"><Notice tone="warn">{error}</Notice></div>}
        </form>
      </Surface>

      {!venues.length ? (
        <Notice>هنوز حسابی از تی‌اکس‌فلو متصل نیست. آدرس عمومی را اضافه کنید؛ کیف پول‌های EVM متصل هم اگر روی تی‌اکس‌فلو موجودی داشته باشند خودکار نمایش داده می‌شوند.</Notice>
      ) : (
        venues.map((a) => <AccountCard key={a.id} a={a} removable={registered.has(a.id)} />)
      )}
      <Notice>
        سود/زیان ۲۴ ساعت، ۷ و ۳۰ روز برای تی‌اکس‌فلو عمومی نیست و نمایش داده نمی‌شود. برای تحلیل معاملات و استفاده در دفتر دلتا نوترال به{' '}
        <Link className="font-semibold text-accent underline" to="/journal?tab=neutral">ژورنال معاملاتی</Link> بروید.
      </Notice>

      <Surface className="space-y-4 p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-bold">بازارهای پرپچوال</h2>
          <Button size="sm" variant="outline" loading={markets.isFetching} onClick={() => void markets.refetch()}>به‌روزرسانی</Button>
        </div>
        <Input aria-label="جست‌وجوی بازار" withSearchIcon value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نماد" />
        {markets.isPending && <p className="text-sm text-muted">در حال دریافت بازارها…</p>}
        {markets.isError && <Notice tone={markets.data ? 'stale' : 'warn'}>دریافت بازارها انجام نشد{markets.data ? '؛ دادهٔ قبلی نمایش داده می‌شود.' : ''}</Notice>}
        {markets.isSuccess && !list.length && <p className="text-sm text-muted">بازاری پیدا نشد.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <div key={m.id} className="rounded-xl border border-divider p-4">
              <MarketAssetIdentity symbol={m.base} name={m.nameFa} />
              <p className="mt-2 text-sm">قیمت مارک: {fmt(m.markPrice)} دلار</p>
              <p className="mt-1 text-xs text-muted">فاندینگ: {fundingPct(m.fundingHourly)}</p>
              <p className="mt-1 text-xs text-muted">
                {m.change24hPct !== null && `تغییر ۲۴ ساعت: ${fmt(m.change24hPct, 2)}٪ · `}
                {m.maxLeverage !== null && `اهرم تا ${fmt(m.maxLeverage, 0)}x`}
              </p>
            </div>
          ))}
        </div>
      </Surface>
    </Page>
  );
}
