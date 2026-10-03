import { useActivity } from '../data/useActivity';
import { buildAppContext } from '../assistant/context';
import { prepareAssistantData, waitForAssistantData } from '../assistant/load';
import { appContextSchema, type AppContext } from '@/shared/assistant/schema';
import { AssistantResponse } from './AssistantResponse';
import { isBitcoinAddress } from '../domain/bitcoinAddress';
import { visiblePositions } from '../domain/visibility';
import { useEffect, useState, useRef } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { Sparkles, Send, RefreshCw } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface, Section } from '@/shared/components/ui/GlassCard';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { fetchJson } from '@/repositories/remoteClient';
import { useCustodySync } from '@/features/custody/data/sync';
import { getPref, savePref } from '@/features/custody/data/repository';
import { useConnectedPortfolio } from '../data/useConnectedPortfolio';
import { chainIdentity, tokenName } from './identity';
import { providerError, dateTime } from './ConnectedPage';
const questions = [{label:'فرصت‌های بوروس',text:'حساب واقعی بوروس و مارجین آزاد هر وثیقه را بررسی کن؛ اگر پیشنهاد با پیش‌نمایش رسمی موجود است سود دلاری برآوردی و ریسک آن را توضیح بده. سناریوی فرضی را جدا نشان بده و با داده ناقص ورود قطعی پیشنهاد نده.'},{label:'عملکرد بازارها',text:'بیشترین و کمترین سود و زیان بازارها در ۱، ۷، ۳۰، ۶۰ و ۹۰ روز گذشته را با پوشش داده مقایسه کن؛ بر اساس نقد واقعی و شرایط من گزینه‌های خرید مشروط پیشنهاد بده.'},{label:'ترکیب دارایی‌ها',text:'ترکیب دارایی‌ها و ریسک‌های اصلی پرتفولیوی من را توضیح بده.'},{label:'تمرکز و اهرم',text:'تمرکز دارایی و اهرم آرکوس من چقدر است؟'},{label:'کاهش ریسک',text:'برای کاهش ریسک، چند سناریو با مزایا و معایب پیشنهاد بده.'}];
const dataStatus = {ready:'آماده',partial:'ناقص',stale:'قدیمی',loading:'در حال دریافت',unavailable:'ناموجود',reference:'مرجع',empty:'خالی',interface:'رابط'};
interface Message { role:'user'|'assistant'; text:string; at:number }
export default function AssistantPage() {
  const [search]=useSearchParams();const marketQuery=search.get('borosMarket');
  const selectedMarket=marketQuery&&/^\d+$/.test(marketQuery)?Number(marketQuery):null;
  useCustodySync(); const p = useConnectedPortfolio();
  const activity = useActivity(p);
  const portfolioRef = useRef(p); portfolioRef.current = p;
  const activityRef = useRef(activity.links); activityRef.current = activity.links;
  const [status,setStatus] = useState<boolean|null>(null), [error,setError] = useState<string|null>(null), [busy,setBusy] = useState(false);
  const [question,setQuestion] = useState(selectedMarket!==null?`پیشنهاد ورود بوروس برای بازار شمارهٔ ${new Intl.NumberFormat('fa-IR').format(selectedMarket)} را با داده‌های پیش‌نمایش موجود توضیح بده: سود خالص تخمینی، سررسید، هزینه‌ها، سناریوی نامساعد و نرخ لیکوییدشدن. اگر پیش‌نمایش منقضی یا داده ناقص است، صریح بگو و ورود قطعی پیشنهاد نده. گزینه‌ها مستقل‌اند و قرار نیست هم‌زمان باز شوند.`:''), [messages,setMessages] = useState<Message[]>([]);
  const saved = getPref<{horizon:string;risk:string;liquidity:string}>('ai-profile')?.value;
  const [lastContext,setLastContext] = useState<AppContext|null>(null);
  const [profile,setProfile] = useState(saved ?? { horizon:'',risk:'',liquidity:'' });
  useEffect(() => { void prepareAssistantData(); },[]);
  useEffect(() => { if(saved) setProfile(saved); },[saved]);
  useEffect(() => { void fetchJson<{gemini:boolean}>('/api/integrations').then(s => setStatus(s.gemini)).catch(e => setError(providerError(e))); },[]);
  async function ask(text = question) {
    if(!text.trim() || busy || !status) return;
    setBusy(true);setError(null);
    try {
      await savePref('ai-profile',profile);
      await waitForAssistantData();
      const portfolio = portfolioRef.current;
    const sources = [...portfolio.wallets.map(s => ({provider:isBitcoinAddress(s.holding.address!)?'bitcoin' as const:'zerion' as const,fetchedAt:s.state?.data?.fetchedAt ?? 0,stale:s.stale,value:s.value})),...portfolio.arcus.filter(s => s.holding.arcus!.env==='mainnet').map(s => ({provider:'arcus' as const,fetchedAt:s.state?.account.fetchedAt ?? 0,stale:s.stale,value:s.value}))];
    // Financial summaries only: exclude addresses, account labels, transaction hashes and credentials.
    const positions = portfolio.wallets.flatMap(s => visiblePositions(s.state?.data?.positions ?? []).map(x => ({symbol:x.symbol.slice(0,40),name:tokenName(x.symbol,x.name).slice(0,120),chain:chainIdentity(x.chain,s.state?.data?.chains).name.slice(0,80),protocol:x.protocol?.slice(0,120) ?? null,value:x.value,type:x.type.slice(0,40),quantity:x.quantity?.slice(0,120) ?? null,price:x.price})));
    const arcus = portfolio.arcus.filter(s => s.holding.arcus!.env==='mainnet').map(s => ({equity:s.value,freeCollateral:s.state?.account.data?.freeCollateral ?? null,positions:(s.state?.positions.data ?? []).map(x => ({symbol:x.marketDisplayName,side:x.side,leverage:x.leverage,unrealizedPnl:x.unrealizedPnl,marginUsed:x.marginUsed,borrowedCapital:x.borrowedCapital,notional:x.positionValueNotional,size:x.size,entryPrice:x.averageEntryPrice,markPrice:x.markPx,marginMode:x.marginMode}))}));
    if(positions.length>300 || sources.length>50 || arcus.length>20 || arcus.some(a => a.positions.length>100)) {setError('پرتفولیو برای یک درخواست تحلیل بزرگ است؛ تعداد منابع را کاهش دهید. هیچ داده‌ای ارسال نشد.');setBusy(false);return;}

      const app = appContextSchema.parse(buildAppContext(portfolio,Date.now(),activityRef.current));
      setLastContext(app);
      const answer = await fetchJson<{answer:string;generatedAt:number}>('/api/integrations?op=analyze',{method:'POST',body:{question:text.trim(),history:messages.slice(-8).map(m => ({role:m.role,text:m.text.slice(0,14000)})),context:{total:portfolio.total,partial:portfolio.partial||portfolio.arcus.some(s=>s.holding.arcus!.env==='mainnet'&&(!s.state?.positions.fetchedAt||!!s.state.positions.error)),sources,positions,arcus,profile,app}},timeoutMs:55000});
      setMessages(m => [...m,{role:'user',text:text.trim(),at:Date.now()},{role:'assistant',text:answer.answer,at:answer.generatedAt}]);setQuestion('');
    } catch(e) {setError(providerError(e));} finally {setBusy(false);}
  }
  return <Page><PageHeader title="دستیار پرتفولیو" eyebrow={<span className="inline-flex items-center gap-2"><LogoImage src="/logos/platform-gemini.png" label="جمینای" size={22}/>تحلیل فارسی · جمینای</span>} subtitle="تحلیل پرتفولیو و بازارهای دارینو"/>
    {status===false && <Notice tone="warn">اتصال دستیار تنظیم نشده است.</Notice>}
    <Surface className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs text-muted">ارزش پرتفولیوی مبنای تحلیل</p><MoneyValue value={p.total} state={p.stale?'stale':'ready'} className="text-xl font-bold"/></div><Button variant="outline" icon={<RefreshCw/>} onClick={() => { void p.refresh(); void prepareAssistantData(true); }}>تازه‌سازی داده</Button></Surface>
    {(p.partial || p.stale) && <Notice tone="warn">تحلیل بر پایهٔ داده‌های ناقص یا قدیمی انجام می‌شود.</Notice>}
    {p.total===null && <Notice>برای تحلیل موجودی شخصی، کیف پول اضافه کنید؛ تحلیل بازارها در دسترس است. <Link to="/wallets" className="text-accent">افزودن کیف پول</Link></Notice>}
    {lastContext && <Disclosure summary="داده‌های مبنای پاسخ"><ul className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">{lastContext.sections.filter(s=>s.status!=='interface').map(s=><li key={s.key} className="flex min-w-0 justify-between gap-2 rounded-lg bg-surface-2 p-2"><span className="truncate">{s.name}</span><span className="shrink-0 text-muted">{dataStatus[s.status]}</span></li>)}</ul></Disclosure>}
    <details className="assistant-profile rounded-card border border-divider bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">هدف و شرایط شما</summary><div className="mt-4 grid gap-4 md:grid-cols-3">{([['horizon','افق سرمایه‌گذاری','مثلاً یک سال'],['risk','ریسک‌پذیری','مثلاً متوسط'],['liquidity','نیاز به نقدینگی','مثلاً هزینهٔ شش ماه آینده']] as const).map(([key,label,placeholder]) => <Field key={key} label={label}><Input maxLength={key==='liquidity'?200:100} value={profile[key]} placeholder={placeholder} onChange={e => setProfile(x => ({...x,[key]:e.target.value}))}/></Field>)}</div></details>
    <Section title="گفت‌وگو" id="assistant-chat"><Surface className="assistant-chat space-y-4 p-4 md:p-5"><div className="flex flex-wrap gap-2">{questions.map(q => <Button key={q.label} size="sm" variant="outline" disabled={busy || !status} onClick={() => setQuestion(q.text)}>{q.label}</Button>)}</div><div className="space-y-4" aria-live="polite" aria-busy={busy}>{!messages.length && <div className="flex items-start gap-3 py-6 text-muted"><Sparkles className="h-5 w-5 shrink-0 text-accent"/><p className="text-sm leading-7">دربارهٔ دارایی‌ها، عملکرد بازارها یا فرصت‌های بوروس بپرسید.</p></div>}{messages.map((m,i) => <article key={i} className={`assistant-message ${m.role==='assistant'?'assistant-answer':'assistant-question'}`}><header className="mb-3 flex items-center gap-2 text-xs text-muted">{m.role==='assistant'&&<span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent"><Sparkles className="h-4 w-4"/></span>}<span className="font-semibold">{m.role==='user'?'شما':'دستیار دارینو'}</span><time className="ms-auto text-[10px]" dateTime={new Date(m.at).toISOString()}>{new Date(m.at).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</time></header><AssistantResponse text={m.text}/></article>)}</div>{busy&&<div role="status" className="flex items-center gap-2 text-xs text-muted"><Sparkles className="h-4 w-4 animate-pulse text-accent"/>در حال بررسی داده‌های دارینو…</div>}{error && <Notice tone="warn">{error}</Notice>}<Field label="پرسش شما"><textarea className="w-full rounded-field border border-divider bg-surface-2 p-3 text-sm leading-7 text-ink outline-none focus:ring-2 focus:ring-accent" rows={3} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="پرتفولیوی من را تحلیل کن…"/></Field><div className="flex flex-wrap justify-between gap-3"><Button loading={busy} icon={<Send/>} disabled={!question.trim() || !status} onClick={() => void ask()}>ارسال برای تحلیل</Button>{messages.length>0 && <Button variant="ghost" onClick={() => setMessages([])}>پاک‌کردن گفت‌وگو</Button>}</div><p className="text-xs leading-6 text-muted">با ارسال پرسش، خلاصهٔ داده‌های مالی دارینو به جمینای ارسال می‌شود.</p><Disclosure summary="حریم خصوصی"><p className="text-xs leading-6 text-muted">پرسش، شرایط شما و پیام‌های اخیر ارسال می‌شوند. خلاصهٔ بازارها، بوروس، دیفای، خریدها، تراکنش‌ها و سناریوهای موجود نیز ارسال می‌شوند. آدرس، کلید، شناسهٔ تراکنش و اطلاعات امنیتی ارسال نمی‌شود. سناریوها از دارایی واقعی جدا هستند؛ هیچ معامله‌ای اجرا نمی‌شود. گفت‌وگو با بستن صفحه پاک می‌شود.</p></Disclosure></Surface></Section>
  </Page>;
}
