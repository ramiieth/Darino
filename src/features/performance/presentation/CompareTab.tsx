/**
 * مقایسه با بازارهای موازی — «اگر همان سرمایه در تاریخ شروع آنجا بود، امروز چقدر بود؟»
 *  سرمایهٔ اولیه، تاریخ شروع و پایان برای همهٔ بازارها یکسان است؛ بازار بدون دادهٔ معتبر
 *  با برچسب «داده کافی موجود نیست» می‌ماند. منبع و زمان به‌روزرسانی هر بازار کنار آن است.
 */
import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { formatJalali } from '@/shared/utils/jalali';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import type { CompareRow } from '../domain/engine';
import type { PeriodAnalysis, YearlyTable } from '../domain/analysis';
import { BASE_MARKETS, EXTRA_COIN_RE, MAX_EXTRA_COINS } from '../domain/markets';
import type { ManualPricePoint, PerfSettings, ValueRecord } from '../domain/types';
import { newId, saveSettings } from '../data/store';
import type { MarketSeries } from '../data/useMarketSeries';
import { ReturnBars } from './charts';
import { PeriodPicker } from './PeriodPicker';
import { NoData, Pct, SourceLine, Toman, Usd, faInt } from './parts';

const GROUP_FA = { iran: 'بازارهای ایران', global: 'بازارهای بین‌المللی و کریپتو' } as const;

function RowCard({ r }: { r: CompareRow }) {
  const ok = r.status === 'ok';
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
            {r.name}
            {r.kind === 'inflation' && <Badge tone="info">تورم رسمی</Badge>}
          </p>
          {r.detail && <p className="text-2xs text-muted">{r.detail}</p>}
        </div>
        {ok ? (
          <div className="text-end">
            <Usd v={r.endUsd} className="text-sm font-bold" />
            <div className="text-xs"><Pct v={r.returnUsd} /> <span className="text-subtle">دلاری</span></div>
          </div>
        ) : (
          <NoData />
        )}
      </div>
      {ok ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <div><dt className="text-subtle">ارزش شروع</dt><dd><Usd v={r.startUsd} compact /> · <Toman v={r.startToman} /></dd></div>
          <div><dt className="text-subtle">ارزش فرضی امروز</dt><dd><Toman v={r.endToman} /></dd></div>
          <div><dt className="text-subtle">سود/زیان</dt><dd><Usd v={r.pnlUsd} signed compact /> · <Toman v={r.pnlToman} signed /></dd></div>
          <div><dt className="text-subtle">بازده تومانی</dt><dd><Pct v={r.returnToman} /></dd></div>
          <div className="col-span-2"><dt className="text-subtle">اختلاف با پرتفوی شما</dt><dd><Usd v={r.vsPortfolioUsd} signed compact /> · <Toman v={r.vsPortfolioToman} signed /> <span className="text-subtle">{(r.vsPortfolioUsd ?? 0) >= 0 ? '(شما جلوترید)' : '(شما عقب‌ترید)'}</span></dd></div>
          <div className="col-span-2"><dt className="text-subtle">هزینهٔ فرصت</dt><dd>{(r.opportunityUsd ?? 0) > 0 ? <><Usd v={r.opportunityUsd} compact /> · <Toman v={r.opportunityToman} /></> : <span className="text-muted">ندارد</span>}</dd></div>
        </dl>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">{r.reason}</p>
          {r.sinceDataStart && (
            <p className="mt-1 text-xs text-muted">
              از اولین دادهٔ موجود ({formatJalali(r.sinceDataStart.from)}) تا {formatJalali(r.sinceDataStart.to)}: <Pct v={r.sinceDataStart.change} />{' '}
              <span className="text-subtle">(بازهٔ کوتاه‌تر؛ هم‌بازه با بقیه نیست)</span>
            </p>
          )}
        </>
      )}
      {r.dataFrom && <p className="mt-1 text-2xs text-subtle">داده از {formatJalali(r.dataFrom)}</p>}
      {r.units && (
        <p className="mt-2 rounded-control bg-surface-2 px-3 py-2 text-xs leading-6 text-muted">
          با <Toman v={r.startToman} /> در {r.priceStart ? formatJalali(r.priceStart.at) : 'تاریخ شروع'} می‌شد حدود{' '}
          <b className="text-ink">{toFaDigits(r.units.count.toLocaleString('en-US', { maximumFractionDigits: r.units.label === 'دستگاه' ? 1 : 0 }))} {r.units.label}</b> خرید
          (هر {r.units.label === 'دستگاه' ? 'دستگاه' : 'مترمربع'} <Toman v={r.units.priceStart} />)؛ فروش همان مقدار در {r.priceEnd ? formatJalali(r.priceEnd.at) : 'تاریخ پایان'} (هر {r.units.label === 'دستگاه' ? 'دستگاه' : 'مترمربع'} <Toman v={r.units.priceEnd} />):{' '}
          <b className="text-ink"><Toman v={r.endToman} /></b> · سود/زیان <Toman v={r.pnlToman} signed />
        </p>
      )}
      {ok && r.priceStart && r.priceEnd && (
        <p className="mt-1.5 text-2xs text-subtle">
          قیمت‌ها: {formatJalali(r.priceStart.at)}{r.priceStart.interpolated ? ' (درون‌یابی)' : ''} ← {formatJalali(r.priceEnd.at)}{r.priceEnd.interpolated ? ' (درون‌یابی)' : ''}
        </p>
      )}
      <SourceLine source={r.source} url={r.sourceUrl} updatedAt={r.updatedAt} />
    </li>
  );
}

export function YearlyGrowth({ tables }: { tables: YearlyTable[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[34rem] text-xs">
        <thead>
          <tr className="text-subtle">
            <th scope="col" className="py-2 text-start font-semibold">بازار</th>
            {tables[0]?.rows.map((r) => (
              <th key={r.year} scope="col" className="py-2 text-end font-semibold">{r.year ? `فروردین ${toFaDigits(r.year)}` : 'امروز'}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {tables.map((t) => (
            <tr key={t.id}>
              <th scope="row" className="py-2 text-start font-semibold text-ink">
                {t.name}
                <span className="block text-2xs font-normal text-subtle">{t.unit}</span>
              </th>
              {t.rows.map((r) => (
                <td key={r.year} className="py-2 text-end">
                  {r.value === null ? <span className="text-subtle">—</span> : <span className="text-ink">{faInt(r.value)}</span>}
                  {r.change !== null && <span className="block"><Pct v={r.change} digits={0} /></span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-2xs leading-5 text-subtle">«—» یعنی برای آن تاریخ دادهٔ معتبر در اپ نیست (مسکن و خودرو از زمانی که بخش مربوط Snapshot ثبت کرده‌اند یا قیمت دستی وارد کرده‌اید). خودرو = قیمت بازار، نه کارخانه؛ مسکن = چارک بالای قیمت هر مترمربع.</p>
    </div>
  );
}

export function CompareTab({
  records,
  startId,
  endId,
  onPeriod,
  analysis,
  yearly,
  market,
  settings
}: {
  records: ValueRecord[];
  startId: string;
  endId: string;
  onPeriod: (s: string, e: string) => void;
  analysis: PeriodAnalysis | null;
  yearly: YearlyTable[];
  market: MarketSeries;
  settings: PerfSettings;
}) {
  const [setup, setSetup] = useState(false);
  const rows = analysis?.rows ?? [];
  const bars = useMemo(() => {
    if (!analysis || analysis.portfolio.returnUsd === null) return null;
    const ok = rows.filter((r) => r.status === 'ok' && r.returnUsd !== null).sort((a, b) => (b.returnUsd as number) - (a.returnUsd as number));
    const items = [{ name: 'پرتفوی شما', v: analysis.portfolio.returnUsd }, ...ok.map((r) => ({ name: r.name, v: r.returnUsd as number }))].sort((a, b) => b.v - a.v);
    return { labels: items.map((i) => i.name), values: items.map((i) => i.v * 100), highlight: items.findIndex((i) => i.name === 'پرتفوی شما') };
  }, [analysis, rows]);

  if (records.length < 2) {
    return <Notice tone="info">برای مقایسه حداقل دو سابقهٔ ارزش (شروع و پایان دوره) لازم است.</Notice>;
  }

  const s = analysis?.summary;
  return (
    <div className="space-y-5">
      <Surface className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">بازهٔ مقایسه</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<RefreshCw />} aria-label="دریافت دوبارهٔ قیمت‌ها" loading={market.loading} onClick={market.refetch} />
            <Button size="sm" variant="outline" icon={<Settings2 />} onClick={() => setSetup(true)}>بازارها</Button>
          </div>
        </div>
        <PeriodPicker records={records} startId={startId} endId={endId} onChange={onPeriod} />
        {market.error && <Notice tone="warn" className="mt-3">قیمت‌های تاریخی از سرور نرسید ({market.error})؛ فقط بازارهای محلی (دلار، خودرو، مسکن) نمایش داده می‌شوند.</Notice>}
      </Surface>

      {analysis && (
        <Surface variant="focal" className="p-4 md:p-5">
          <MetricGrid cols={4}>
            <Metric size="sm" label="پرتفوی شما (دلاری)" value={<Pct v={analysis.portfolio.returnUsd} />} sub={<Usd v={analysis.portfolio.pnlUsd} signed compact />} />
            <Metric size="sm" label="پرتفوی شما (تومانی)" value={<Pct v={analysis.portfolio.returnToman} />} sub={<Toman v={analysis.portfolio.pnlToman} signed />} />
            <Metric size="sm" label="بهترین بازار دوره" value={s?.best ? s.best.name : '—'} sub={s?.best ? <Pct v={s.best.returnUsd} /> : undefined} />
            <Metric size="sm" label="جلوتر / عقب‌تر از" value={`${faInt(s?.beaten.length ?? 0)} / ${faInt(s?.lagged.length ?? 0)} بازار`} sub={`${faInt(s?.insufficient ?? 0)} بازار بدون دادهٔ کافی`} />
          </MetricGrid>
          {analysis.returns && !analysis.returns.qualified && (
            <p className="mt-4 text-2xs leading-5 text-subtle">
              عدد پرتفوی «تغییر ارزش» است؛ چون فهرست واریز/برداشت خارجی تأیید نشده، بازده واقعی سرمایه‌گذاری اعلام نمی‌شود (سوابق ← واریز و برداشت خارجی).
            </p>
          )}
          {analysis.returns?.qualified && (
            <p className="mt-4 text-xs leading-6 text-muted">
              بازده سرمایه‌گذاری (TWR): <Pct v={analysis.returns.twr} /> · XIRR سالانه: <Pct v={analysis.returns.xirr} /> · خالص واریز/برداشت: <Usd v={analysis.returns.netFlowsUsd} signed compact />
            </p>
          )}
          {s && (s.beaten.length > 0 || s.lagged.length > 0) && (
            <div className="mt-4 grid gap-3 border-t border-divider pt-4 text-xs leading-6 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-positive">جلوتر از</p>
                <p className="text-muted">{s.beaten.map((r) => r.name).join('، ') || '—'}</p>
              </div>
              <div>
                <p className="font-semibold text-negative">عقب‌تر از</p>
                <p className="text-muted">
                  {s.lagged.map((r) => r.name).join('، ') || '—'}
                  {s.lagged[0] && <> — بیشترین فاصله با {s.lagged[0].name}: <Usd v={-(s.lagged[0].vsPortfolioUsd ?? 0)} compact /> · <Toman v={s.lagged[0].opportunityToman} /></>}
                </p>
              </div>
            </div>
          )}
        </Surface>
      )}

      {bars && bars.labels.length > 1 && (
        <Surface className="p-4">
          <h2 className="mb-3 text-sm font-bold text-ink">بازده دلاری هر بازار در همین بازه</h2>
          <ReturnBars labels={bars.labels} values={bars.values} highlight={bars.highlight} />
        </Surface>
      )}

      {(['iran', 'global'] as const).map((g) => {
        const list = rows.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <Surface key={g} className="p-0">
            <h2 className="border-b border-divider p-4 text-sm font-bold text-ink">{GROUP_FA[g]}</h2>
            <ul className={cn('divide-y divide-divider', market.loading && 'opacity-60')}>
              {list.map((r) => <RowCard key={r.id} r={r} />)}
            </ul>
          </Surface>
        );
      })}

      {yearly.length > 0 && (
        <Surface className="p-4">
          <h2 className="mb-1 text-sm font-bold text-ink">رشد سال‌به‌سال از ۱۴۰۲ تا امروز</h2>
          <p className="mb-3 text-xs text-muted">قیمت در اول فروردین هر سال (تومان) و درصد تغییر نسبت به سال قبل</p>
          <YearlyGrowth tables={yearly} />
        </Surface>
      )}

      <MarketSetup open={setup} onClose={() => setSetup(false)} settings={settings} market={market} />
    </div>
  );
}

function MarketSetup({ open, onClose, settings, market }: { open: boolean; onClose: () => void; settings: PerfSettings; market: MarketSeries }) {
  const [coin, setCoin] = useState('');
  const toggle = (id: string) => {
    const on = settings.enabledMarkets.includes(id);
    void saveSettings({ ...settings, enabledMarkets: on ? settings.enabledMarkets.filter((x) => x !== id) : [...settings.enabledMarkets, id] });
  };
  const toggleCar = (id: string) => {
    const on = settings.carModelIds.includes(id);
    void saveSettings({ ...settings, carModelIds: on ? settings.carModelIds.filter((x) => x !== id) : [...settings.carModelIds, id] });
  };
  const toggleN = (k: string) => {
    const on = settings.neighborhoods.includes(k);
    void saveSettings({ ...settings, neighborhoods: on ? settings.neighborhoods.filter((x) => x !== k) : [...settings.neighborhoods, k] });
  };
  const chip = (id: string, label: string, on: boolean, fn: () => void) => (
    <button key={id} type="button" aria-pressed={on} onClick={fn} className={cn('min-h-10 rounded-control border px-3 text-xs font-semibold transition-colors', on ? 'border-accent bg-accent/10 text-accent' : 'border-divider bg-surface-2 text-muted')}>
      {label}
    </button>
  );
  const sym = coin.trim().toUpperCase();
  return (
    <Sheet open={open} onClose={onClose} title="بازارهای مقایسه" description="فقط بازارهای روشن در مقایسه و گزارش Gemini می‌آیند.">
      <div className="space-y-5">
        {(['iran', 'global'] as const).map((g) => (
          <div key={g}>
            <p className="mb-2 text-xs font-bold text-ink">{GROUP_FA[g]}</p>
            <div className="flex flex-wrap gap-2">
              {BASE_MARKETS.filter((m) => m.group === g).map((m) => chip(m.id, m.name, settings.enabledMarkets.includes(m.id), () => toggle(m.id)))}
              {g === 'iran' && chip('property', 'مسکن (محله‌های منتخب)', settings.enabledMarkets.includes('property'), () => toggle('property'))}
            </div>
          </div>
        ))}

        <Disclosure summary={`مدل‌های خودرو — قیمت بازار (${faInt(settings.carModelIds.length)})`} defaultOpen>
          <div className="flex flex-wrap gap-2 py-2">
            {market.carOptions.length
              ? [...market.carOptions]
                  .sort((a, b) => Number(settings.carModelIds.includes(b.modelId)) - Number(settings.carModelIds.includes(a.modelId)))
                  .map((o) => chip(`car-${o.modelId}`, o.name.trim(), settings.carModelIds.includes(o.modelId), () => toggleCar(o.modelId)))
              : <p className="text-2xs text-subtle">قیمت خودرو هنوز در اپ ثبت نشده؛ یک بار صفحهٔ «خودرو» را باز کنید.</p>}
          </div>
          <p className="text-2xs text-subtle">هر مدل یک ردیف جدا؛ با دو مدل یا بیشتر ردیف «میانگین» هم اضافه می‌شود.</p>
        </Disclosure>

        <Disclosure summary={`محله‌های مسکن اهواز (${faInt(settings.neighborhoods.length)})`} defaultOpen>
          <div className="flex flex-wrap gap-2 py-2">
            {market.neighborhoodOptions.length
              ? market.neighborhoodOptions.map((n) => chip(n.key, n.name, settings.neighborhoods.includes(n.key), () => toggleN(n.key)))
              : <p className="text-2xs text-subtle">آمار محله‌ها هنوز در اپ نیست؛ یک بار در «بازار املاک» داده جمع‌آوری کنید.</p>}
          </div>
        </Disclosure>

        <ManualPrices settings={settings} market={market} />

        <div>
          <p className="mb-2 text-xs font-bold text-ink">ارزهای دیجیتال منتخب دیگر</p>
          <div className="flex flex-wrap gap-2">
            {settings.extraCoins.map((c) => chip(c, `${c} ✕`, true, () => void saveSettings({ ...settings, extraCoins: settings.extraCoins.filter((x) => x !== c) })))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input dir="ltr" value={coin} onChange={(e) => setCoin(e.target.value)} placeholder="AAVE" aria-label="نماد ارز" maxLength={10} />
            <Button
              variant="outline"
              disabled={!EXTRA_COIN_RE.test(sym) || settings.extraCoins.includes(sym) || settings.extraCoins.length >= MAX_EXTRA_COINS}
              onClick={() => { void saveSettings({ ...settings, extraCoins: [...settings.extraCoins, sym] }); setCoin(''); }}
            >
              افزودن
            </Button>
          </div>
          <p className="mt-1 text-2xs text-subtle">نماد بازار هایپرلیکوئید؛ حداکثر {faInt(MAX_EXTRA_COINS)} ارز.</p>
        </div>
      </div>
    </Sheet>
  );
}

const parseNum = (v: string): number | null => {
  const n = Number(toEnDigits(v).replace(/[,\s٬]/g, ''));
  return v.trim() && Number.isFinite(n) ? n : null;
};

/**
 * قیمت‌های تاریخی دستی (برای تاریخ‌های قبل از Snapshotهای اپ): کاربر قیمت معتبری را که در منبعی پیدا کرده با
 * تاریخ و نام منبع ثبت می‌کند؛ همان محاسبهٔ مقایسه و گزارش Gemini از آن استفاده می‌کند. Snapshot اپ در همان روز مقدم است.
 */
function ManualPrices({ settings, market }: { settings: PerfSettings; market: MarketSeries }) {
  const targets = [
    ...settings.carModelIds.map((id) => ({ key: `car:${id}`, label: `خودرو — ${market.carOptions.find((c) => c.modelId === id)?.name.trim() ?? id}`, unit: 'تومان (قیمت بازار)' })),
    ...settings.neighborhoods.map((k) => ({ key: `prop:${k}`, label: `مسکن — ${market.neighborhoodOptions.find((n) => n.key === k)?.name ?? k}`, unit: 'تومان بر مترمربع' }))
  ];
  const [target, setTarget] = useState('');
  const [date, setDate] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [source, setSource] = useState('');
  const tKey = target || targets[0]?.key || '';
  const t = targets.find((x) => x.key === tKey);
  const priceN = parseNum(price);
  const list = [...(settings.manualPrices ?? [])].sort((a, b) => a.market.localeCompare(b.market) || a.dateTs - b.dateTs);
  const labelOf = (k: string) => targets.find((x) => x.key === k)?.label ?? k;
  const add = () => {
    if (!tKey || date === null || !priceN || priceN <= 0 || !source.trim()) return;
    const p: ManualPricePoint = { id: newId(), market: tKey, dateTs: date, price: priceN, source: source.trim().slice(0, 160) };
    void saveSettings({ ...settings, manualPrices: [...(settings.manualPrices ?? []), p] });
    setPrice('');
  };
  const remove = (id: string) => void saveSettings({ ...settings, manualPrices: (settings.manualPrices ?? []).filter((x) => x.id !== id) });
  return (
    <Disclosure summary={`قیمت‌های تاریخی دستی (${faInt(list.length)})`}>
      <div className="space-y-3 py-2">
        <p className="text-2xs leading-5 text-subtle">
          برای تاریخ‌هایی که اپ هنوز قیمت جمع نکرده بود (مثلاً ۱۴۰۳/۱۰/۱۲)، قیمتی را که در یک منبع معتبر دیده‌اید با تاریخ و نام منبع وارد کنید.
          خودرو: قیمت بازار همان مدل، نه قیمت کارخانه. مسکن: قیمت هر مترمربع. از امروز به بعد اپ خودش هر روز ثبت می‌کند.
        </p>
        {targets.length ? (
          <>
            <Field label="بازار">
              <Select value={tKey} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </Select>
            </Field>
            <SmartDateField label="تاریخ (شمسی · میلادی)" value={date} onChange={setDate} max={Date.now()} />
            <Field label="قیمت">
              <Input inputMode="numeric" dir="ltr" suffix={t?.unit ?? 'تومان'} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="مثلاً 1450000000" />
            </Field>
            <Field label="منبع">
              <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={160} placeholder="مثلاً همراه مکانیک، ۱۲ دی ۱۴۰۳" />
            </Field>
            <Button variant="outline" icon={<Plus />} disabled={date === null || !priceN || priceN <= 0 || !source.trim()} onClick={add}>افزودن قیمت</Button>
          </>
        ) : (
          <p className="text-2xs text-subtle">اول مدل خودرو یا محلهٔ مسکن را انتخاب کنید.</p>
        )}
        {list.length > 0 && (
          <ul className="divide-y divide-divider rounded-control border border-divider">
            {list.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{labelOf(p.market)}</p>
                  <p className="text-muted">{formatJalali(p.dateTs)} · <Toman v={p.price} /></p>
                  <p className="truncate text-2xs text-subtle">{p.source}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label="حذف قیمت" onClick={() => remove(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Disclosure>
  );
}
