import { ActivityList } from './ActivityList';
import { walletActivities } from '../domain/activity';
import { visibleTransaction,visibleWalletValue } from '../domain/visibility';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, RefreshCw, Plus, Archive, ArrowLeftRight } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { saveHolding, savePref, getPref } from '@/features/custody/data/repository';
import { useCustodySync } from '@/features/custody/data/sync';
import { CONNECTED_PREF, useConnectedPortfolio } from '../data/useConnectedPortfolio';
import { refreshTransactions, useConnectedStore } from '../data/store';
import { validAddress, addressKey, obj, finite, type WalletSnapshot } from '../domain/model';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { PositionsList } from './PositionsList';
import { chainIdentity, operationNames } from './identity';
export const providerError = (e: unknown) => e instanceof HttpError ? e.code ?? 'ارتباط با سرور برقرار نشد' : e instanceof Error ? e.message : 'دریافت داده انجام نشد';
export const dateTime = (at: number) => new Date(at).toLocaleString('fa-IR', { dateStyle:'short', timeStyle:'short' });
export default function ConnectedPage() {
  useCustodySync();
  const portfolio = useConnectedPortfolio();
  const [address,setAddress] = useState(''), [label,setLabel] = useState('');
  const [preview,setPreview] = useState<WalletSnapshot|null>(null), [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null);
  const [status,setStatus] = useState<{zerion:boolean;gemini:boolean}|null>(null);
  const [selected,setSelected] = useState('');
  const [pnl,setPnl] = useState<{address:string;body:unknown}|null>(null), [pnlBusy,setPnlBusy] = useState(false), [pnlError,setPnlError] = useState<string|null>(null);
  useEffect(() => { void fetchJson<{zerion:boolean;gemini:boolean}>('/api/integrations').then(setStatus).catch(e => setError(providerError(e))); },[]);
  async function inspect() {
    setError(null); setPreview(null);
    if(!validAddress(address.trim())) { setError('آدرس عمومی معتبر EVM یا سولانا وارد کنید'); return; }
    setBusy(true);
    try { setPreview(await fetchJson<WalletSnapshot>(`/api/integrations?op=wallet&address=${encodeURIComponent(address.trim())}`,{timeoutMs:58000})); }
    catch(e) { setError(providerError(e)); } finally { setBusy(false); }
  }
  async function confirm() {
    if(!preview) return; setBusy(true);
    try {
      const { getCustodySnapshot } = await import('@/features/custody/data/repository');
      const existing = getCustodySnapshot().holdings.find(h => h.kind === 'wallet' && h.address && addressKey(h.address) === addressKey(preview.address));
      const now = Date.now(); const id = existing?.id ?? crypto.randomUUID();
      await saveHolding({ ...existing, id, kind:'wallet', address:preview.address, label:label.trim() || existing?.label || 'کیف پول من', createdAt:existing?.createdAt ?? now, updatedAt:now, archivedAt:null });
      const enabled = getPref<string[]>(CONNECTED_PREF)?.value ?? [];
      await savePref(CONNECTED_PREF,[...new Set([...enabled,id])]);
      useConnectedStore.setState(s => ({wallets:{...s.wallets,[addressKey(preview.address)]:{data:preview,loading:false,error:null,history:[],historyLoaded:false,historyAt:null,next:null,historyLoading:false,historyError:null}}}));
      setSelected(id); setPreview(null); setAddress(''); setLabel('');
    } catch(e) { setError(providerError(e)); } finally { setBusy(false); }
  }
  async function disconnect(id:string) { const ids = getPref<string[]>(CONNECTED_PREF)?.value ?? []; try { await savePref(CONNECTED_PREF,ids.filter(x => x !== id)); } catch(e) { setError(providerError(e)); } }
  const active = portfolio.wallets.find(s => s.holding.id === selected) ?? portfolio.wallets[0];
  useEffect(() => { if(active?.holding.address) void refreshTransactions(active.holding.address); },[active?.holding.address]);
  async function loadPnl() { if(!active) return; const a = active.holding.address!; setPnlBusy(true);setPnlError(null);try { setPnl({address:a,body:await fetchJson(`/api/integrations?op=pnl&address=${encodeURIComponent(a)}`,{timeoutMs:25000})}); } catch(e) {setPnlError(providerError(e));} finally {setPnlBusy(false);} }
  const p = pnl && pnl.address === active?.holding.address ? obj(obj(obj(pnl.body).data).attributes) : {};
  const allAddresses = new Set(portfolio.wallets.map(w => addressKey(w.holding.address!)));
  return <Page><PageHeader title="کیف پول‌های متصل" eyebrow={<span className="inline-flex items-center gap-2"><LogoImage src="/logos/platform-zerion.png" label="زریون" size={20} square />زریون · فقط‌خواندنی</span>} subtitle="آدرس عمومی، موجودی و تراکنش‌های واقعی" actions={<Button variant="outline" icon={<RefreshCw />} onClick={() => void portfolio.refresh()}>به‌روزرسانی</Button>} />
    {status && !status.zerion && <Notice tone="warn">اتصال زریون تنظیم نشده است.</Notice>}
    {error && <Notice tone="warn">{error}</Notice>}
    <Section title="افزودن کیف پول" id="connect-wallet"><Surface className="space-y-4 p-4 md:p-5"><div className="grid gap-4 md:grid-cols-2"><Field label="نام کیف پول"><Input disabled={busy} value={label} maxLength={80} placeholder="مثلاً کیف پول اصلی" onChange={e => setLabel(e.target.value)} /></Field><Field label="آدرس عمومی" hint="EVM یا سولانا · بدون امضا"><Input disabled={busy} dir="ltr" value={address} maxLength={100} autoComplete="off" placeholder="0x…" onChange={e => {setAddress(e.target.value);setPreview(null);}} /></Field></div><Button icon={<Plus />} loading={busy} disabled={status?.zerion === false || !address.trim()} onClick={() => void inspect()}>دریافت پیش‌نمایش</Button>
      {preview && <Surface variant="subtle" className="p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold text-ink">پیش‌نمایش دارایی‌ها</h3><p className="text-xs text-muted">{dateTime(preview.fetchedAt)} · پوشش زریون</p></div><MoneyValue value={visibleWalletValue(preview)} className="text-xl font-bold" /></div>{(!preview.complete || preview.unpriced>0) && <Notice tone="warn">برخی جزئیات یا قیمت‌ها دریافت نشده‌اند.</Notice>}<div className="max-h-96 overflow-y-auto"><PositionsList data={preview} /></div><Button loading={busy} onClick={() => void confirm()}>تأیید و اتصال</Button></Surface>}
    </Surface></Section>
    <Section title="منابع تأییدشده" id="wallet-sources"><div className="grid gap-3 md:grid-cols-2">{portfolio.wallets.map(s => <Surface key={s.holding.id} className="space-y-3 p-4"><div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-accent" /><div className="min-w-0 flex-1"><p className="font-bold text-ink">{s.holding.label}</p><bdi dir="ltr" className="block break-all text-xs text-muted">{s.holding.address}</bdi></div><MoneyValue value={s.value} state={s.stale?'stale':'ready'} /></div><p className="text-xs text-muted">{s.state?.data ? `دریافت ${dateTime(s.state.data.fetchedAt)}` : 'در انتظار دریافت'}</p>{s.state?.error && <Notice tone="warn">{s.state.error}</Notice>}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(s.holding.id)}>دارایی‌ها و فعالیت</Button><Button size="sm" variant="ghost" icon={<Archive />} onClick={() => void disconnect(s.holding.id)}>قطع همگام‌سازی</Button></div></Surface>)}</div>{!portfolio.wallets.length && <Notice>هنوز کیف پولی متصل نشده است.</Notice>}</Section>
    {active && <><Section title={`دارایی‌های ${active.holding.label}`} id="wallet-assets"><Surface className="p-4 md:p-5">{active.state?.data ? <PositionsList data={active.state.data} /> : <p className="text-muted">در انتظار دریافت موجودی…</p>}</Surface></Section>
    <Section title="تراکنش‌های واقعی" id="wallet-transactions" action={<Button size="sm" variant="outline" icon={<ArrowLeftRight />} loading={active.state?.historyLoading} onClick={() => void refreshTransactions(active.holding.address!)}>دریافت / به‌روزرسانی</Button>}><Surface className="p-4 md:p-5">{active.state?.historyError && <Notice tone="warn">{active.state.historyError}</Notice>}{!active.state?.historyLoaded && <p className="text-sm text-muted">برای نمایش تاریخچه، «دریافت / به‌روزرسانی» را بزنید.</p>}<ActivityList rows={walletActivities([{address:active.holding.address!,label:active.holding.label,history:active.state?.history??[]}])} addresses={[...allAddresses]} chains={active.state?.data?.chains??[]}/>{active.state?.historyLoaded && !active.state.history.some(visibleTransaction) && <p className="py-4 text-sm text-muted">تراکنشی در پوشش این سرویس یافت نشد.</p>}{active.state?.next && <Button variant="outline" loading={active.state.historyLoading} onClick={() => void refreshTransactions(active.holding.address!,true)}>تراکنش‌های قدیمی‌تر</Button>}</Surface></Section>
    <Section title="سود و زیان طبق زریون" id="wallet-pnl" action={<Button size="sm" variant="outline" loading={pnlBusy} onClick={() => void loadPnl()}>دریافت تحلیل عددی</Button>}><Surface className="space-y-3 p-4"><Disclosure summary="روش محاسبه"><p className="text-xs leading-6 text-muted">سود و زیان زریون، جدا از دفتر دستی؛ انتقال داخلی و خرید خارج از زنجیره ممکن است بهای تمام‌شده را تغییر دهند.</p></Disclosure>{pnlError && <Notice tone="warn">{pnlError}</Notice>}{Object.keys(p).length>0 && <div className="grid gap-3 sm:grid-cols-3">{[['realized_gain','تحقق‌یافته'],['unrealized_gain','تحقق‌نیافته'],['total_fee','کارمزد']].map(([key,label]) => <div key={key}><p className="text-xs text-muted">{label}</p><MoneyValue value={finite(p[key])} signed={key!=='total_fee'} tone="auto" /></div>)}</div>}</Surface></Section></>}
    <div className="flex flex-wrap gap-4 text-sm"><Link to="/arcus" className="text-accent">آرکوس</Link><Link to="/holdings" className="text-accent">فعالیت شبکه‌ای</Link><Link to="/dashboard" className="text-accent">داشبورد</Link></div><Disclosure summary="زمان‌بندی و پوشش"><p className="text-xs leading-6 text-muted">هنگام بازبودن صفحه، موجودی هر ۱۵ دقیقه و تاریخچهٔ دریافت‌شده هر ۵ دقیقه تازه می‌شوند. همهٔ شبکه‌ها و پروتکل‌ها در پوشش زریون نیستند.</p></Disclosure>
  </Page>;
}
