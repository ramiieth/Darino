/**
 * تب «اسپات» — سواپ‌های همهٔ کیف پول‌ها در DEXها، خودکار از زریون؛ بدون تایپ
 *
 *   بالا: سود محقق، سود باز (قیمت لحظه‌ای کیف پول)، حجم، گاز و هزینهٔ سواپ، نرخ برد فروش‌ها
 *   پوزیشن‌های باز: موجودی واقعی کیف پول ≥ ۱۰ دلار، میانگین بها، سود محقق و باز (فقط بخش با بهای معلوم)
 *   تسویه‌شده: کامل فروخته‌شده یا خرد (Dust) — سود محققشان در جمع می‌ماند
 *   سواپ‌ها: خط زمان «چه رفت → چه آمد» با پروتکل، شبکه و هزینه
 *   توکن اسپم، مخفی، تأییدنشده یا بی‌قیمت اصلاً نمی‌آید (domain/spot.ts)
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Coins, Flame, Layers, RefreshCw, Repeat, Trophy, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { useSpot } from '../data/useSpot';
import type { SpotAsset, SpotLeg, SpotSwap } from '../domain/spot';
import { fa, faDateTime, pct, pnlTone, usd } from './parts';

type View = 'assets' | 'closed' | 'swaps';

export function SpotTab({ from }: { from: number }) {
  const s = useSpot(from);
  const [view, setView] = useState<View>('assets');
  const [limit, setLimit] = useState(30);

  if (!s.wallets.length) {
    return (
      <EmptyState
        message="هنوز کیف پولی در «دارایی من» نیست"
        hint="آدرس عمومی کیف پول‌هایی را که با آن‌ها در DEXها سواپ می‌کنید (EVM یا سولانا) یک‌بار اضافه کنید؛ از آن به بعد همهٔ سواپ‌ها خودکار این‌جا ثبت می‌شوند."
        action={<Link to="/wallets"><Button>افزودن کیف پول</Button></Link>}
      />
    );
  }
  const b = s.book;
  return (
    <div className="space-y-4">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {s.wallets.map((w) => (
          <span key={w.address} className="flex shrink-0 items-center gap-1.5 rounded-full border border-divider bg-card px-3 py-1.5 text-xs">
            <Wallet className="h-3.5 w-3.5 text-muted" />
            <span className="font-semibold text-ink">{w.label}</span>
            <span className="text-subtle">{w.status === 'loading' ? '…' : w.status === 'error' ? 'خطا' : `${fa(w.swaps)} سواپ`}</span>
            {w.hasMore && w.status !== 'loading' && <button type="button" onClick={() => s.loadMore(w.address)} className="font-semibold text-accent hover:underline">قدیمی‌تر</button>}
          </span>
        ))}
        <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={s.refetch} className="shrink-0">تازه‌سازی</Button>
      </div>
      {s.wallets.some((w) => w.status === 'error') && <Notice tone="warn">سواپ‌های {s.wallets.filter((w) => w.status === 'error').map((w) => w.label).join('، ')} دریافت نشد (احتمالاً سقف سهمیهٔ زریون). کمی بعد «تازه‌سازی» را بزنید.</Notice>}

      {!b ? (
        s.loading ? <ListSkeleton rows={5} /> : <Notice tone="info">در این کیف پول‌ها سواپی پیدا نشد.</Notice>
      ) : (
        <>
          <SpotHero b={b} />
          <div className="flex flex-wrap items-center gap-2">
            <ChipGroup label="نمایش" value={view} onChange={setView} options={[
              { value: 'assets', label: 'پوزیشن‌های باز', badge: b.open.length },
              { value: 'closed', label: 'تسویه‌شده و خرد', badge: b.closed.length || undefined },
              { value: 'swaps', label: 'سواپ‌ها', badge: b.totals.swaps }
            ]} />
            {b.totals.protocols.length > 0 && (
              <p className="ms-auto text-[11px] text-muted">بیشترین: {b.totals.protocols.slice(0, 3).map((p) => `${p.name} (${fa(p.n)})`).join('، ')}</p>
            )}
          </div>
          {view === 'assets' || view === 'closed' ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(view === 'assets' ? b.open : b.closed).map((a) => <AssetCard key={a.asset} a={a} />)}
              </div>
              {!(view === 'assets' ? b.open : b.closed).length && <p className="text-sm text-muted">{view === 'assets' ? 'پوزیشن اسپات بازی (بالای ۱۰ دلار) نیست.' : 'توکن تسویه‌شده یا خردی نیست.'}</p>}
              {view === 'closed' && b.closed.length > 0 && <p className="text-xs text-muted">توکن‌های کامل فروخته‌شده و موجودی‌های زیر ۱۰ دلار؛ سود محقق آن‌ها همچنان در جمع بالا حساب می‌شود.</p>}
            </>
          ) : (
            <Surface className="divide-y divide-divider">
              {b.swaps.slice(0, limit).map((x) => <SwapRow key={x.id} s={x} />)}
              {b.swaps.length > limit && <div className="p-3"><Button variant="outline" onClick={() => setLimit((l) => l + 30)}>۳۰ سواپ بیشتر ({fa(b.swaps.length - limit)} باقی‌مانده)</Button></div>}
            </Surface>
          )}
          {b.totals.unknownProceeds > 1 && (
            <p className="text-xs leading-6 text-muted">{usd(b.totals.unknownProceeds)} از فروش‌ها مربوط به توکنی بود که از راهی جز سواپ (واریز، ایردراپ، پل) به کیف پول آمده؛ بهای آن معلوم نیست و در سود محقق نیامده.</p>
          )}
        </>
      )}
    </div>
  );
}

function SpotHero({ b }: { b: NonNullable<ReturnType<typeof useSpot>['book']> }) {
  const t = b.totals;
  const decided = t.wins + t.losses;
  return (
    <Surface variant="focal" className="overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <div className="border-b border-divider bg-surface-2/50 p-5 md:border-b-0 md:border-e">
          <p className="text-xs font-semibold text-muted">سود محقق اسپات</p>
          <p className={cn('num-ltr mt-1 text-4xl font-black tracking-tight', pnlTone(t.realized))}>{usd(t.realized, true)}</p>
          <p className="mt-2 text-xs text-muted">
            باز: <b className={cn('num-ltr', pnlTone(t.unrealized))}>{t.unrealized === null ? '—' : usd(t.unrealized, true)}</b>
            {' · '}خالص پس از گاز: <b className={cn('num-ltr', pnlTone(t.realized - t.gas))}>{usd(t.realized - t.gas, true)}</b>
          </p>
          {t.chains.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{t.chains.slice(0, 6).map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}</div>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Tile icon={<Repeat />} label="سواپ‌ها" value={fa(t.swaps)} sub={`حجم ${usd(t.volume)}`} />
          <Tile icon={<Trophy />} label="نرخ برد فروش‌ها" value={decided ? pct((t.wins / decided) * 100, 0) : '—'} sub={`${fa(t.wins)} سود · ${fa(t.losses)} زیان`} />
          <Tile icon={<Flame />} label="گاز" value={usd(t.gas)} sub={t.volume ? `${pct((t.gas / t.volume) * 100, 2)} حجم` : undefined} />
          <Tile icon={<Layers />} label="لغزش و کارمزد استخر" value={usd(t.swapCost)} sub={t.volume ? `${pct((t.swapCost / t.volume) * 100, 2)} حجم` : undefined} tone={t.volume && t.swapCost / t.volume > 0.01 ? 'text-negative' : undefined} />
        </div>
      </div>
    </Surface>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-divider p-4 sm:border-b-0 sm:border-e sm:last:border-e-0 [&:nth-child(odd)]:border-e">
      <div className="flex items-center gap-1.5 text-muted [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}<p className="truncate text-[11px] font-semibold">{label}</p></div>
      <p className={cn('num-ltr mt-2 text-2xl font-extrabold', tone ?? 'text-ink')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

function TokenIcon({ symbol, icon, size = 32 }: { symbol: string; icon: string | null; size?: number }) {
  const [bad, setBad] = useState(false);
  return icon && !bad ? (
    <img src={icon} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="shrink-0 rounded-full bg-surface-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent" style={{ width: size, height: size }}>{symbol.slice(0, 3)}</span>
  );
}

function AssetCard({ a }: { a: SpotAsset }) {
  const total = a.realized + (a.unrealized ?? 0);
  const unknownPart = a.qty > 0 ? a.unknownQty / a.qty : 0;
  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <TokenIcon symbol={a.symbol} icon={a.icon} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink" dir="ltr">{a.symbol}</p>
          <p className="text-[11px] text-muted">{fa(a.buysAll)} خرید · {fa(a.sellsAll)} فروش{a.buysAll + a.sellsAll > a.buys + a.sells ? ` (${fa(a.buys + a.sells)} در بازه)` : ''}</p>
        </div>
        <div className="ms-auto text-end">
          <p className={cn('num-ltr text-base font-extrabold', pnlTone(total))}>{usd(total, true)}</p>
          <p className="text-[10px] text-subtle">محقق + باز</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-divider bg-divider text-center">
        <Cell label="محقق" value={usd(a.realized, true)} tone={pnlTone(a.realized)} />
        <Cell label="باز" value={a.unrealized === null ? '—' : usd(a.unrealized, true)} tone={pnlTone(a.unrealized)} />
        <Cell label="میانگین بها" value={a.avgCost === null ? 'نامعلوم' : `$${fa(a.avgCost, a.avgCost < 1 ? 6 : 2)}`} />
      </div>
      <p className="text-[11px] text-muted">
        خرید {usd(a.boughtUsd)} · فروش {usd(a.soldUsd)}{a.qty > 0 ? <> · موجودی <span className="num-ltr">{fa(a.qty, a.qty < 1 ? 6 : 2)}</span>{a.value !== null ? ` (${usd(a.value)})` : ''}{a.dust ? ' · خرد' : ''}</> : ' · کامل فروخته شد'}
      </p>
      {unknownPart > 0.01 && (
        <p className="text-[11px] leading-5 text-subtle">
          {unknownPart >= 0.99 ? 'کل این موجودی' : <><span className="num-ltr">{fa(a.unknownQty, a.unknownQty < 1 ? 6 : 2)}</span> از موجودی</>} از راهی جز سواپ آمده (واریز، ایردراپ یا پل)؛ بهایش معلوم نیست و در سود باز حساب نشده.
        </p>
      )}
    </Surface>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-2 py-1.5">
      <p className="text-[10px] text-subtle">{label}</p>
      <p className={cn('num-ltr truncate text-xs font-bold', tone ?? 'text-ink')}>{value}</p>
    </div>
  );
}

const legText = (ls: readonly SpotLeg[]) => !ls.length ? '—' : ls.map((l) => `${fa(l.qty, l.qty < 1 ? 6 : l.qty < 100 ? 3 : 0)} ${l.symbol}`).join(' + ');

function SwapRow({ s }: { s: SpotSwap }) {
  const sold = s.sold[0], bought = s.bought[0];
  const buy = !!sold?.stable && !bought?.stable;
  const sell = !sold?.stable && !!bought?.stable;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative flex shrink-0 items-center">
        <TokenIcon symbol={sold?.symbol ?? '?'} icon={sold?.icon ?? null} size={28} />
        <span className="-ms-2 rounded-full ring-2 ring-card"><TokenIcon symbol={bought?.symbol ?? '?'} icon={bought?.icon ?? null} size={28} /></span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1 text-sm text-ink">
          <span className="num-ltr truncate" dir="ltr">{legText(s.sold)}</span>
          <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-subtle" />
          <span className="num-ltr truncate font-semibold" dir="ltr">{legText(s.bought)}</span>
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">{faDateTime(s.time)}{s.protocol ? ` · ${s.protocol}` : ''}{s.chain ? ` · ${s.chain}` : ''}{s.gas !== null ? ` · گاز ${usd(s.gas)}` : ''}{s.cost !== null && s.cost > 0 && s.usd ? ` · لغزش ${pct((s.cost / s.usd) * 100, 2)}` : ''}</p>
      </div>
      <div className="shrink-0 text-end">
        <p className="num-ltr text-sm font-bold text-ink">{usd(s.usd)}</p>
        {buy ? <Badge tone="gain"><Coins />خرید</Badge> : sell ? <Badge tone="loss">فروش</Badge> : <Badge tone="info">تبدیل</Badge>}
      </div>
    </div>
  );
}
