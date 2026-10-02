/**
 * Arcus — حساب Perpetuals (فقط‌خواندنی)
 *  خلاصهٔ حساب · پوزیشن‌ها · سفارش‌ها · تاریخچه (معاملات، سفارش‌ها، funding، واریز/برداشت) · تطبیق با دفتر
 *
 *  • هیچ سفارش، لغو، تغییر اهرم، برداشت یا انتقالی از این صفحه ممکن نیست.
 *  • فیلد ناموجود = «در دسترس نیست»؛ دادهٔ نامعلوم صفر نمی‌شود.
 *  • با شکست sync آخرین دادهٔ معتبر با برچسب «قدیمی» می‌ماند.
 *  • این اتصال برای Perpetuals است و به Spot/Stock Tokens تعمیم داده نشده.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Radio, Link2, FilePlus2 } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { ChipGroup, Tabs } from '@/shared/components/ui/SegmentedControl';
import { Field, Select } from '@/shared/components/ui/Input';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { toast } from '@/shared/store/toastStore';
import { fmtDateTime, fmtRelativeAge } from '@/shared/utils/formatters';
import { useCustody } from '@/features/custody/data/useCustody';
import { saveOperation } from '@/features/custody/data/repository';
import { HoldingForm } from '@/features/custody/presentation/HoldingsManager';
import { formatAmount, cmp } from '@/features/custody/domain/decimal';
import { UsdDec } from '@/features/custody/presentation/parts';
import { linkTransfer, operationFromTransfer, reconcileTransfers, type ExternalTransfer } from '@/features/custody/domain/reconcile';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import type { Holding } from '@/features/custody/domain/types';
import { ERROR_TEXT, type ArcusError } from '../api/client';
import type { HistoryKind } from '../api/paginate';
import { toUs, usToMsNumber, type ArcusMarket, type ArcusOrder, type ArcusPosition } from '../api/types';
import { allTimePnl, summarizeHistory, totalMarginUsed } from '../domain/summary';
import { isStale, loadHistory, useArcusAccount, useMarkets, type AccountRef, type Res } from '../data/useArcusAccount';

const NA = <span className="text-muted">در دسترس نیست</span>;

type RangeKey = '24h' | '7d' | '30d' | 'all';
const RANGES: { value: RangeKey; label: string }[] = [
  { value: '24h', label: '۲۴ ساعت' },
  { value: '7d', label: '۷ روز' },
  { value: '30d', label: '۳۰ روز' },
  { value: 'all', label: 'همه' }
];

function rangeFromUs(r: RangeKey): string | null {
  if (r === 'all') return null;
  const ms = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }[r];
  return ((BigInt(Date.now()) - BigInt(ms)) * 1000n).toString();
}

function Usd({ v }: { v: string | null | undefined }) {
  if (v === null || v === undefined || v === '') return NA;
  return <UsdDec v={v} />;
}

function Num({ v, frac = 8 }: { v: string | null | undefined; frac?: number }) {
  if (v === null || v === undefined || v === '') return NA;
  return (
    <bdi dir="ltr" className="tabular-nums" title={v}>
      {formatAmount(v, frac)}
    </bdi>
  );
}

function tsCell(v: unknown) {
  const ms = usToMsNumber(v as string | number);
  return ms ? fmtDateTime(ms) : '—';
}

function errorText(e: ArcusError | null): string | null {
  if (!e) return null;
  if (e.kind === 'rate_limited' && e.retryAfterMs) return `${ERROR_TEXT.rate_limited} (حدود ${Math.ceil(e.retryAfterMs / 1000)} ثانیه)`;
  return e.message || ERROR_TEXT[e.kind];
}

/** نام فارسی بازار بر اساس دارایی پایه (مثل «بیت‌کوین» به‌جای BTC-USD) */
function marketNameFa(m: ArcusMarket | undefined, displayName: string): string {
  const base = m?.baseAsset ?? displayName.split('-')[0];
  return assetDisplayName(base, m?.fullAssetName).name;
}

function MarketLogo({ m, name, size = 28 }: { m: ArcusMarket | undefined; name: string; size?: number }) {
  const base = m?.baseAsset ?? name.split('-')[0];
  // لوگوی بازار بر اساس دارایی پایه (نه هویت توکن روی زنجیره)
  return <AssetLogo symbol={base} kind="crypto" size={size} />;
}

export default function ArcusPage() {
  const d = useCustody();
  const arcusHoldings = d.holdings.filter((h) => h.kind === 'arcus' && h.arcus && !h.archivedAt);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [section, setSection] = useState<'positions' | 'orders' | 'history' | 'reconcile'>('positions');
  const [range, setRange] = useState<RangeKey>('30d');

  const holding = arcusHoldings.find((h) => h.id === selectedId) ?? arcusHoldings[0] ?? null;
  const ref: AccountRef | null = holding?.arcus ?? null;
  const historyRange = useMemo(() => ({ fromUs: rangeFromUs(range), key: range }), [range]);
  const { state, refresh } = useArcusAccount(ref, { live, historyRange });
  const markets = useMarkets(ref?.env ?? null);
  const marketById = useMemo(() => new Map((markets.data ?? []).map((m) => [m.marketId, m])), [markets.data]);

  if (!d.loaded) return <PageSkeleton label="آرکوس" />;

  const acc = state?.account;
  const positions = state?.positions.data ?? [];
  const anyLoading = !!(state && (state.account.loading || state.positions.loading || state.openOrders.loading));
  const stale = acc ? isStale(acc) : false;

  return (
    <Page>
      <PageHeader
        title="آرکوس"
        eyebrow={<span className="inline-flex items-center gap-1.5"><LogoImage src="/logos/platform-arcus.png" label="آرکوس" size={16} square /> حساب قراردادهای دائمی — فقط‌خواندنی</span>}
        subtitle="موجودی، پوزیشن‌ها، سفارش‌ها و تاریخچهٔ حساب. هیچ معامله، لغو سفارش، تغییر اهرم یا برداشتی از دارینو انجام نمی‌شود."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<Plus />} onClick={() => setFormOpen(true)}>
              افزودن زیرحساب
            </Button>
            {holding && (
              <Button variant="secondary" icon={<RefreshCw className={anyLoading ? 'animate-spin' : ''} />} onClick={refresh} disabled={anyLoading}>
                تازه‌سازی
              </Button>
            )}
          </div>
        }
      />

      {arcusHoldings.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            message="هنوز زیرحساب آرکوس ذخیره نشده"
            hint="آدرس عمومی کیف پول، شمارهٔ زیرحساب (۰ تا ۹) و محیط (شبکهٔ اصلی یا آزمایشی) را وارد و ذخیره کنید. کلید خصوصی یا کلید دسترسی لازم نیست."
            action={
              <Button icon={<Plus />} onClick={() => setFormOpen(true)}>
                افزودن زیرحساب آرکوس
              </Button>
            }
          />
          <PrivacyNote />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            {arcusHoldings.length > 1 && (
              <Field label="زیرحساب" className="min-w-[220px]">
                <Select value={holding?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
                  {arcusHoldings.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label} — {h.arcus!.env === 'mainnet' ? 'اصلی' : 'آزمایشی'} · زیرحساب {h.arcus!.accountIndex}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <Radio className="h-4 w-4" aria-hidden /> دریافت زنده هنگام باز بودن صفحه
            </label>
            {live && state && <Badge tone={state.live === 'open' ? 'gain' : state.live === 'paused' ? 'neutral' : 'warn'}>{LIVE_LABEL[state.live]}</Badge>}
          </div>

          {holding && (
            <p className="text-xs text-muted">
              {holding.label} · {holding.arcus!.env === 'mainnet' ? 'شبکهٔ اصلی' : 'شبکهٔ آزمایشی'} · زیرحساب {holding.arcus!.accountIndex}
              {acc?.fetchedAt ? ` · آخرین به‌روزرسانی ${fmtRelativeAge(acc.fetchedAt)}` : ''}
              {stale && ' · '}
              {stale && <Badge tone="warn">قدیمی</Badge>}
            </p>
          )}

          {acc?.error && !acc.data && acc.error.kind !== 'no_activity' && <Notice tone="error">{errorText(acc.error)}</Notice>}
          {acc?.error && acc.data && <Notice tone="stale">آخرین تلاش ناموفق بود ({errorText(acc.error)}) — داده‌های نمایش‌داده‌شده مربوط به {fmtRelativeAge(acc.fetchedAt)} است.</Notice>}

          {acc?.fetchedAt && acc.data === null ? (
            <EmptyState message="این زیرحساب هنوز هیچ فعالیتی ندارد" hint="آرکوس برای حساب بدون واریز یا معامله پاسخ «بدون فعالیت» می‌دهد. محیط (شبکهٔ اصلی یا آزمایشی) و شمارهٔ زیرحساب را بررسی کنید." />
          ) : (
            <Surface className="p-4 md:p-6">
              <MetricGrid cols={4}>
                <Metric size="lg" label="ارزش حساب" value={acc?.data ? <Usd v={acc.data.equity} /> : acc?.loading ? '…' : NA} sub="موجودی نقدی خالص + Σ(اندازه × قیمت اوراکل)" />
                <Metric size="md" label="وثیقهٔ آزاد" value={acc?.data ? <Usd v={acc.data.freeCollateral} /> : NA} />
                <Metric size="md" label="مارجین درگیر" value={state?.positions.data ? <Usd v={totalMarginUsed(positions)} /> : NA} sub="جمع مارجین پوزیشن‌ها" />
                <Metric
                  size="md"
                  label="سود/زیان کل"
                  value={acc?.data ? <Usd v={allTimePnl(acc.data.equity, acc.data.netDeposits)} /> : NA}
                  sub="ارزش حساب − خالص واریز (تعریف آرکوس)"
                />
                <Metric size="sm" label="موجودی نقدی خالص" value={acc?.data ? <Usd v={acc.data.netQuoteBalance} /> : NA} />
                <Metric size="sm" label="خالص واریز تا امروز" value={acc?.data ? <Usd v={acc.data.netDeposits} /> : NA} />
                <Metric size="sm" label="واریز در انتظار" value={acc?.data ? <Usd v={acc.data.pendingDeposits} /> : NA} />
                <Metric size="sm" label="برداشت در انتظار" value={acc?.data ? <Usd v={acc.data.pendingWithdrawals} /> : NA} />
              </MetricGrid>
              <p className="mt-4 text-xs leading-5 text-muted">
                مقادیر به دلار (واحد حساب؛ تسویه با USDG) و طبق تعریف رسمی آرکوس است. ارزش اسمی پوزیشن‌های اهرمی دارایی جداگانه نیست و به ارزش حساب اضافه نمی‌شود؛ وثیقه و سود/زیان داخل ارزش حساب هستند.
              </p>
            </Surface>
          )}

          <Tabs
            label="بخش‌های آرکوس"
            options={[
              { value: 'positions', label: 'پوزیشن‌ها', badge: positions.length || undefined },
              { value: 'orders', label: 'سفارش‌ها', badge: state?.openOrders.data?.length || undefined },
              { value: 'history', label: 'تاریخچه' },
              { value: 'reconcile', label: 'واریز و برداشت' }
            ]}
            value={section}
            onChange={setSection}
          />

          {section === 'positions' && state && <PositionsList res={state.positions} orders={state.openOrders.data ?? []} marketById={marketById} />}
          {section === 'orders' && state && <OrdersList res={state.openOrders} marketById={marketById} />}
          {section === 'history' && state && ref && (
            <HistorySection refAcc={ref} state={state} range={range} setRange={setRange} historyRange={historyRange} marketById={marketById} markets={markets.data ?? []} />
          )}
          {section === 'reconcile' && state && ref && holding && <ReconcileSection refAcc={ref} holding={holding} state={state} d={d} />}

          <PrivacyNote />
        </div>
      )}

      {formOpen && <HoldingForm open={formOpen} presetKind="arcus" d={d} onClose={() => setFormOpen(false)} />}
    </Page>
  );
}

const LIVE_LABEL: Record<string, string> = {
  idle: 'غیرفعال',
  connecting: 'در حال اتصال',
  open: 'زنده',
  reconnecting: 'اتصال مجدد…',
  paused: 'متوقف (صفحه پنهان است)',
  closed: 'بسته'
};

function PrivacyNote() {
  return (
    <Disclosure summary="حریم خصوصی و نحوهٔ اتصال">
      <ul className="list-disc space-y-1.5 ps-5 text-xs leading-5 text-muted">
        <li>اطلاعات حساب در آرکوس عمومی است: هر کسی که آدرس را بداند می‌تواند موجودی، پوزیشن و معاملات را بخواند. دارینو نمی‌تواند این را مسدود کند.</li>
        <li>مرورگر شما مستقیم از سرور رسمی آرکوس می‌خواند؛ آدرس به سرور دارینو ارسال نمی‌شود و هیچ کلید یا امضایی استفاده نمی‌شود.</li>
        <li>تنظیمات (آدرس عمومی، زیرحساب، محیط) فقط پس از «ذخیره» روی همین دستگاه نگه داشته می‌شود. دادهٔ دریافتی فقط در حافظهٔ همین جلسه است و دائمی ذخیره نمی‌شود، مگر خودتان رکوردی را به عملیات اضافه کنید.</li>
        <li>دریافت زنده فقط وقتی صفحه باز و دیده می‌شود کار می‌کند؛ با بستن اپ یا پنهان شدن آن قطع می‌شود و ثبت پیوستهٔ رویدادها در پس‌زمینه در این نسخه وجود ندارد.</li>
        <li>این بخش فقط قراردادهای دائمی را نشان می‌دهد؛ معاملات نقدی (اسپات) و توکن‌های سهام پوشش داده نشده‌اند.</li>
      </ul>
    </Disclosure>
  );
}

function ResState({ res, empty }: { res: Res<unknown>; empty: string }) {
  if (res.loading && !res.data) return <p className="py-6 text-center text-sm text-muted">در حال دریافت…</p>;
  if (res.error && !res.data) return <Notice tone="error">{errorText(res.error)}</Notice>;
  return <EmptyState message={empty} />;
}

function PositionsList({ res, orders, marketById }: { res: Res<ArcusPosition[]>; orders: ArcusOrder[]; marketById: Map<number, ArcusMarket> }) {
  const list = res.data ?? [];
  if (list.length === 0) return <ResState res={res} empty="پوزیشن بازی وجود ندارد" />;
  return (
    <div className="space-y-3">
      {res.error && <Notice tone="stale">{errorText(res.error)} — آخرین دادهٔ معتبر نمایش داده می‌شود.</Notice>}
      {list.map((p) => {
        const m = marketById.get(p.marketId);
        // TP/SL فقط وقتی ارتباطش مستند است: سفارش TPSL با isPositionTPSL روی همین بازار
        const tpsl = orders.filter((o) => o.marketId === p.marketId && o.tpslType && o.isPositionTPSL);
        const tp = tpsl.find((o) => o.tpslType === 'TAKE_PROFIT');
        const sl = tpsl.find((o) => o.tpslType === 'STOP_LOSS');
        const markOk = p.markPx && cmp(p.markPx, '0') !== 0;
        return (
          <Surface key={p.marketId} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <MarketLogo m={m} name={p.marketDisplayName} />
              <div className="min-w-0">
                <p className="font-bold text-ink">{marketNameFa(m, p.marketDisplayName)}</p>
              </div>
              <Badge tone={p.side === 'LONG' ? 'gain' : 'loss'}>{p.side === 'LONG' ? 'لانگ (خرید)' : 'شورت (فروش)'}</Badge>
              <Badge tone="neutral">{p.marginMode === 'CROSS' ? 'مارجین متقاطع' : 'مارجین ایزوله'}</Badge>
              <Badge tone="brand">
                اهرم <bdi dir="ltr">{p.leverage}x</bdi>
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <KV k="اندازه (طبق آرکوس)" v={<Num v={p.size} />} />
              <KV k="قیمت ورود" v={<Num v={p.averageEntryPrice} />} />
              <KV k="قیمت مارک" v={markOk ? <Num v={p.markPx} /> : NA} />
              <KV k="ارزش اسمی (اطلاعاتی)" v={<Usd v={p.positionValueNotional} />} />
              <KV k="سود و زیان باز (طبق آرکوس)" v={<Usd v={p.unrealizedPnl} />} />
              <KV k="مارجین" v={<Usd v={p.marginUsed} />} />
              <KV k="فاندینگ از زمان باز شدن" v={p.cumulativeFunding ? <Usd v={p.cumulativeFunding.sinceOpen} /> : NA} />
              <KV k="قیمت لیکوئید" v={NA} />
              <KV k="حد سود" v={tp?.triggerPrice ? <Num v={tp.triggerPrice} /> : NA} />
              <KV k="حد ضرر" v={sl?.triggerPrice ? <Num v={sl.triggerPrice} /> : NA} />
            </dl>
            {!markOk && <p className="mt-2 text-xs text-muted">قیمت مارک در دسترس نبوده؛ طبق مستندات، ارزش اسمی و سود/زیان با قیمت ورود محاسبه شده‌اند.</p>}
          </Surface>
        );
      })}
      <p className="text-xs text-muted">
        قیمت لیکوئید در دادهٔ عمومی آرکوس منتشر نمی‌شود و دارینو آن را تخمین نمی‌زند. «سود و زیان باز» طبق تعریف آرکوس تفاوت مارجین قفل‌شده هنگام ورود با مارجین لازم در قیمت فعلی است. حد سود و حد ضرر فقط برای سفارش‌هایی نمایش داده می‌شود که کل پوزیشن را می‌بندند.
      </p>
    </div>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{v}</dd>
    </div>
  );
}

const ORDER_STATUS_FA: Record<string, string> = {
  OPEN: 'باز',
  UNTRIGGERED: 'در انتظار فعال‌سازی',
  FILLED: 'اجراشده',
  CANCELED: 'لغوشده',
  REJECTED: 'ردشده',
  LIQUIDATED: 'لیکوئیدشده',
  ADL: 'کاهش خودکار اهرم'
};

const ORDER_TONE: Record<string, Tone> = { OPEN: 'info', UNTRIGGERED: 'warn', FILLED: 'gain', CANCELED: 'neutral', REJECTED: 'loss', LIQUIDATED: 'loss', ADL: 'loss' };

function OrderRow({ o, m }: { o: ArcusOrder; m: ArcusMarket | undefined }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
      <MarketLogo m={m} name={o.marketDisplayName} size={24} />
      <span className="font-semibold">{marketNameFa(m, o.marketDisplayName)}</span>
      <Badge tone={o.side === 'BUY' ? 'gain' : 'loss'}>{o.side === 'BUY' ? 'خرید' : 'فروش'}</Badge>
      <Badge tone={ORDER_TONE[o.status] ?? 'neutral'}>{ORDER_STATUS_FA[o.status] ?? o.status}</Badge>
      {o.tpslType && <Badge tone="warn">{o.tpslType === 'TAKE_PROFIT' ? 'حد سود' : 'حد ضرر'}</Badge>}
      {o.reduceOnly && <Badge tone="neutral">فقط کاهشی</Badge>}
      <span className="text-muted">
        قیمت <Num v={o.price} /> {o.triggerPrice && <>· قیمت فعال‌سازی <Num v={o.triggerPrice} /></>} · مقدار <Num v={o.remainingSize} /> از <Num v={o.originalSize} />
        {o.avgFillPrice && <> · میانگین اجرا <Num v={o.avgFillPrice} /></>}
      </span>
      <span className="ms-auto text-xs text-muted">{tsCell(o.updatedAt)}</span>
    </li>
  );
}

function OrdersList({ res, marketById }: { res: Res<ArcusOrder[]>; marketById: Map<number, ArcusMarket> }) {
  const list = res.data ?? [];
  if (list.length === 0) return <ResState res={res} empty="سفارش باز یا در انتظار فعال‌سازی وجود ندارد" />;
  const open = list.filter((o) => o.status !== 'UNTRIGGERED');
  const untrig = list.filter((o) => o.status === 'UNTRIGGERED');
  return (
    <div className="space-y-4">
      {res.error && <Notice tone="stale">{errorText(res.error)} — آخرین دادهٔ معتبر.</Notice>}
      <Surface className="p-4">
        <h3 className="mb-2 text-sm font-bold text-ink">سفارش‌های باز ({open.length})</h3>
        {open.length ? <ul className="divide-y divide-divider">{open.map((o) => <OrderRow key={o.orderId} o={o} m={marketById.get(o.marketId)} />)}</ul> : <p className="text-xs text-muted">ندارد</p>}
      </Surface>
      <Surface className="p-4">
        <h3 className="mb-2 text-sm font-bold text-ink">سفارش‌های در انتظار فعال‌سازی — حد سود و حد ضرر ({untrig.length})</h3>
        {untrig.length ? <ul className="divide-y divide-divider">{untrig.map((o) => <OrderRow key={o.orderId} o={o} m={marketById.get(o.marketId)} />)}</ul> : <p className="text-xs text-muted">ندارد</p>}
      </Surface>
      <p className="text-xs text-muted">لغو یا تغییر سفارش از دارینو ممکن نیست.</p>
    </div>
  );
}

type AccState = NonNullable<ReturnType<typeof useArcusAccount>['state']>;

function HistorySection({
  refAcc,
  state,
  range,
  setRange,
  historyRange,
  marketById,
  markets
}: {
  refAcc: AccountRef;
  state: AccState;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  historyRange: { fromUs: string | null; key: string };
  marketById: Map<number, ArcusMarket>;
  markets: ArcusMarket[];
}) {
  const [kind, setKind] = useState<HistoryKind>('fills');
  const [market, setMarket] = useState('');
  const h = state.history[kind];
  const loadedForRange = h.data && h.rangeKey === historyRange.key;
  const rows = (loadedForRange ? h.data!.rows : []) as unknown as Record<string, unknown>[];
  const filtered = market ? rows.filter((r) => String(r.marketId ?? '') === market) : rows;

  const fills = state.history.fills.rangeKey === historyRange.key ? state.history.fills.data?.rows ?? [] : [];
  const funding = state.history.funding.rangeKey === historyRange.key ? state.history.funding.data?.rows ?? [] : [];
  const filterByMarket = <T extends { marketId: number }>(xs: T[]) => (market ? xs.filter((x) => String(x.marketId) === market) : xs);
  const totals = summarizeHistory(filterByMarket(fills), filterByMarket(funding));
  const bothLoaded = state.history.fills.rangeKey === historyRange.key && state.history.funding.rangeKey === historyRange.key && !!state.history.fills.data && !!state.history.funding.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <ChipGroup
          label="نوع تاریخچه"
          options={[
            { value: 'fills', label: 'معاملات اجراشده' },
            { value: 'orders', label: 'سفارش‌ها' },
            { value: 'funding', label: 'فاندینگ' },
            { value: 'transfers', label: 'واریز/برداشت' }
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <ChipGroup label="بازهٔ زمانی" options={RANGES} value={range} onChange={setRange} />
        {kind !== 'transfers' && (
          <Field label="بازار" className="min-w-[160px]">
            <Select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="">همه</option>
              {markets.map((m) => (
                <option key={m.marketId} value={String(m.marketId)}>
                  {marketNameFa(m, m.marketDisplayName)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button variant="secondary" loading={h.loading} onClick={() => void loadHistory(refAcc, kind, historyRange)}>
          {loadedForRange ? 'دریافت دوباره' : 'دریافت تاریخچه'}
        </Button>
      </div>

      {h.loading && h.progress && <p className="text-xs text-muted">در حال دریافت… صفحهٔ {h.progress.pages} · {h.progress.rows} رکورد</p>}
      {h.error && <Notice tone={h.data ? 'stale' : 'error'}>{errorText(h.error)}</Notice>}
      {loadedForRange && !h.data!.complete && <Notice tone="warn" title="تاریخچه ممکن است کامل نباشد">{h.data!.limitation}</Notice>}
      {loadedForRange && h.data!.complete && <p className="text-xs text-muted">تاریخچهٔ این بازه کامل دریافت شد ({h.data!.rows.length} رکورد، {h.data!.pages} صفحه). فقط در حافظهٔ این جلسه نگه داشته می‌شود.</p>}

      {(kind === 'fills' || kind === 'funding') && (
        <Surface className="p-4">
          {bothLoaded ? (
            <MetricGrid cols={4}>
              <Metric size="md" label="سود و زیان بسته‌شده" value={<Usd v={totals.closedPnl} />} sub="خالص کارمزد معاملاتی" />
              <Metric size="md" label="فاندینگ" value={<Usd v={totals.funding} />} sub="مثبت = دریافت" />
              <Metric size="md" label="جریمهٔ لیکوئید" value={<Usd v={totals.liquidationFees} />} sub={`${totals.liquidationCount} مورد — از سود/زیان کم نشده`} />
              <Metric size="md" label="جمع سود و زیان بازه" value={<Usd v={totals.realized} />} sub="سود و زیان بسته‌شده + فاندینگ − جریمه" />
            </MetricGrid>
          ) : (
            <p className="text-xs text-muted">برای جمع‌بندی سود/زیان، تاریخچهٔ «معاملات اجراشده» و «فاندینگ» همین بازه را دریافت کنید.</p>
          )}
          {bothLoaded && (
            <p className="mt-3 text-xs text-muted">
              جمع کارمزدهای معاملاتی <Usd v={totals.feesInfo} /> فقط برای اطلاع است؛ داخل سود و زیان بسته‌شده لحاظ شده و دوباره کم نمی‌شود.
              {totals.missingClosedPnl > 0 && ` ${totals.missingClosedPnl} معامله سود/زیان ثبت‌شده ندارد و در جمع نیامده (صفر فرض نشده).`}
            </p>
          )}
        </Surface>
      )}

      {loadedForRange && filtered.length === 0 && <EmptyState message="رکوردی در این بازه نیست" />}
      {filtered.length > 0 && (
        <Surface className="p-4">
          <ul className="divide-y divide-divider">
            {filtered.slice(0, 500).map((r, i) => (
              <HistoryRow key={i} kind={kind} r={r} m={marketById.get(Number(r.marketId))} />
            ))}
          </ul>
          {filtered.length > 500 && <p className="mt-2 text-xs text-muted">۵۰۰ رکورد اول از {filtered.length} نمایش داده شد.</p>}
        </Surface>
      )}
    </div>
  );
}

function HistoryRow({ kind, r, m }: { kind: HistoryKind; r: Record<string, unknown>; m: ArcusMarket | undefined }) {
  const s = (k: string) => (r[k] === undefined || r[k] === null ? null : String(r[k]));
  if (kind === 'fills') {
    const liq = r.liquidation as { method?: string } | undefined;
    return (
      <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
        <MarketLogo m={m} name={s('marketDisplayName') ?? ''} size={22} />
        <span className="font-semibold">{marketNameFa(m, s('marketDisplayName') ?? '')}</span>
        <Badge tone={s('side') === 'BUY' ? 'gain' : 'loss'}>{s('side') === 'BUY' ? 'خرید' : 'فروش'}</Badge>
        <Badge tone="neutral">{s('role') === 'MAKER' ? 'میکر (سفارش‌گذار)' : 'تیکر (برداشت‌کنندهٔ نقدینگی)'}</Badge>
        {liq?.method && <Badge tone="loss">{liq.method === 'LIQUIDATION' ? 'لیکوئید' : 'کاهش خودکار اهرم'}</Badge>}
        <span className="text-muted">
          <Num v={s('size')} /> @ <Num v={s('price')} /> · کارمزد <Num v={s('fee')} /> دلار · سود/زیان {s('closedPnl') ? <Usd v={s('closedPnl')} /> : NA}
        </span>
        <span className="ms-auto text-xs text-muted">{tsCell(r.createdAt)}</span>
      </li>
    );
  }
  if (kind === 'orders') return <OrderRow o={r as unknown as ArcusOrder} m={m} />;
  if (kind === 'funding') {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
        <MarketLogo m={m} name={s('marketDisplayName') ?? ''} size={22} />
        <span className="font-semibold">{marketNameFa(m, s('marketDisplayName') ?? '')}</span>
        <span className="text-muted">
          نرخ ساعتی <Num v={s('fundingRate')} frac={10} /> · اندازه <Num v={s('size')} /> · پرداخت <Usd v={s('payment')} />
        </span>
        <span className="ms-auto text-xs text-muted">{tsCell(r.time)}</span>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <Badge tone={s('type') === 'DEPOSIT' ? 'gain' : s('type') === 'WITHDRAWAL' ? 'loss' : 'neutral'}>{TRANSFER_LABEL[s('type') ?? ''] ?? s('type')}</Badge>
      <Badge tone={s('status') === 'APPLIED' ? 'neutral' : 'loss'}>{s('status') === 'APPLIED' ? 'اعمال‌شده' : 'ردشده'}</Badge>
      <Usd v={s('amount')} />
      <bdi dir="ltr" className="text-xs text-muted">{s('id')}</bdi>
      <span className="ms-auto text-xs text-muted">{tsCell(r.createdAt)}</span>
    </li>
  );
}

const TRANSFER_LABEL: Record<string, string> = {
  DEPOSIT: 'واریز',
  WITHDRAWAL: 'برداشت',
  INTERNAL_TRANSFER: 'انتقال بین زیرحساب‌ها',
  SELF_ACCOUNT_TRANSFER: 'انتقال بین کاربران',
  REFERRAL_CLAIM: 'جایزهٔ معرفی'
};

function ReconcileSection({
  refAcc,
  holding,
  state,
  d
}: {
  refAcc: AccountRef;
  holding: Holding;
  state: AccState;
  d: ReturnType<typeof useCustody>;
}) {
  const h = state.history.transfers;
  const allRange = { fromUs: null, key: 'all' };
  const loaded = h.data && h.rangeKey === 'all';
  const transfers: ExternalTransfer[] = (loaded ? h.data!.rows : []).map((t) => ({
    env: refAcc.env,
    address: refAcc.address,
    accountIndex: refAcc.accountIndex,
    id: t.id,
    type: t.type,
    status: t.status,
    amount: t.amount,
    createdAtUs: toUs(t.createdAt) ?? '0'
  }));
  const items = reconcileTransfers(transfers, d.operations, d.holdings);

  return (
    <div className="space-y-4">
      <Notice tone="info">
        واریز و برداشت‌های Arcus این‌جا با عملیات ثبت‌شده مقایسه می‌شوند. ربط‌دادن یا افزودن فقط با انتخاب شما انجام می‌شود؛ یادداشت و فیلدهای دستی حفظ می‌شوند. چون موجودی Arcus از equity همگام خوانده می‌شود، سپرده دوباره به آن اضافه نمی‌شود.
      </Notice>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" loading={h.loading} onClick={() => void loadHistory(refAcc, 'transfers', allRange)}>
          {loaded ? 'دریافت دوباره' : 'دریافت واریز/برداشت‌ها'}
        </Button>
        <Link to="/holdings?tab=operations" className="text-sm text-accent hover:underline">
          رفتن به فهرست عملیات
        </Link>
      </div>
      {h.error && <Notice tone={h.data ? 'stale' : 'error'}>{errorText(h.error)}</Notice>}
      {loaded && !h.data!.complete && <Notice tone="warn">{h.data!.limitation}</Notice>}
      {loaded && items.length === 0 && <EmptyState message="واریز یا برداشتی برای این زیرحساب ثبت نشده" />}
      <ul className="space-y-2">
        {items.map((it) => {
          const linkedOp = it.linkedOperationId ? d.operations.find((o) => o.id === it.linkedOperationId) : undefined;
          return (
            <li key={it.key}>
              <Surface className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={it.transfer.type === 'DEPOSIT' ? 'gain' : it.transfer.type === 'WITHDRAWAL' ? 'loss' : 'neutral'}>{TRANSFER_LABEL[it.transfer.type] ?? it.transfer.type}</Badge>
                  <Usd v={it.transfer.amount} />
                  <bdi dir="ltr" className="text-xs text-muted">{it.transfer.id}</bdi>
                  <span className="ms-auto text-xs text-muted">{tsCell(it.transfer.createdAtUs)}</span>
                </div>
                {linkedOp && (
                  <p className="text-xs text-positive">
                    <Link2 className="me-1 inline h-3.5 w-3.5" aria-hidden />
                    ربط‌داده‌شده به عملیات ثبت‌شده ({linkedOp.source === 'arcus_import' ? 'ایجادشده از همین رکورد' : 'ثبت دستی'})
                  </p>
                )}
                {it.note && <p className="text-xs text-muted">{it.note}</p>}
                {it.suggestions.map((sg) => {
                  const op = d.operations.find((o) => o.id === sg.operationId)!;
                  return (
                    <div key={sg.operationId} className="flex flex-wrap items-center gap-2 rounded-field bg-surface-2/70 px-3 py-2 text-xs">
                      <Badge tone={sg.confidence === 'strong' ? 'info' : 'neutral'}>{sg.confidence === 'strong' ? 'تطابق محتمل' : 'تطابق ضعیف'}</Badge>
                      <span className="text-muted">{sg.reasons.join('، ')}</span>
                      <span className="text-muted">— ثبت دستی {op.occurredAt ? fmtDateTime(op.occurredAt) : 'بدون زمان'}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Link2 />}
                        className="ms-auto"
                        onClick={async () => {
                          await saveOperation(linkTransfer(op, it.transfer));
                          toast('success', 'ربط داده شد — عملیات تکراری ساخته نشد');
                        }}
                      >
                        ربط به این ثبت
                      </Button>
                    </div>
                  );
                })}
                {it.importable && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<FilePlus2 />}
                      onClick={async () => {
                        const op = operationFromTransfer(it.transfer, holding);
                        if (!op) return;
                        await saveOperation(op);
                        toast('success', 'به عملیات اضافه شد — سمت کیف پول را در صورت نیاز تکمیل کنید');
                      }}
                    >
                      افزودن به‌عنوان عملیات جدید
                    </Button>
                  </div>
                )}
              </Surface>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
