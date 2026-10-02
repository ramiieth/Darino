import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
const questions = [{label:'ترکیب دارایی‌ها',text:'ترکیب دارایی‌ها و ریسک‌های اصلی پرتفولیوی من را توضیح بده.'},{label:'تمرکز و اهرم',text:'تمرکز دارایی و اهرم آرکوس من چقدر است؟'},{label:'کاهش ریسک',text:'برای کاهش ریسک، چند سناریو با مزایا و معایب پیشنهاد بده.'}];
interface Message { role:'user'|'assistant'; text:string; at:number }
export default function AssistantPage() {
  useCustodySync(); const p = useConnectedPortfolio();
  const [status,setStatus] = useState<boolean|null>(null), [error,setError] = useState<string|null>(null), [busy,setBusy] = useState(false);
  const [question,setQuestion] = useState(''), [messages,setMessages] = useState<Message[]>([]);
  const saved = getPref<{horizon:string;risk:string;liquidity:string}>('ai-profile')?.value;
  const [profile,setProfile] = useState(saved ?? { horizon:'',risk:'',liquidity:'' });
  useEffect(() => { if(saved) setProfile(saved); },[saved]);
  useEffect(() => { void fetchJson<{gemini:boolean}>('/api/integrations').then(s => setStatus(s.gemini)).catch(e => setError(providerError(e))); },[]);
  async function ask(text = question) {
    if(!text.trim() || busy || p.total===null || !status) return;
    setBusy(true);setError(null);
    const sources = [...p.wallets.map(s => ({provider:'zerion' as const,fetchedAt:s.state?.data?.fetchedAt ?? 0,stale:s.stale,value:s.value})),...p.arcus.filter(s => s.holding.arcus!.env==='mainnet').map(s => ({provider:'arcus' as const,fetchedAt:s.state?.account.fetchedAt ?? 0,stale:s.stale,value:s.value}))];
    // Send only analysis fields: no addresses, account labels, transaction hashes, API keys, or manual scenarios.
    const positions = p.wallets.flatMap(s => (s.state?.data?.positions ?? []).map(x => ({symbol:x.symbol.slice(0,40),name:tokenName(x.symbol,x.name).slice(0,120),chain:chainIdentity(x.chain,s.state?.data?.chains).name.slice(0,80),protocol:x.protocol?.slice(0,120) ?? null,value:x.value,type:x.type.slice(0,40),quantity:x.quantity?.slice(0,120) ?? null,price:x.price})));
    const arcus = p.arcus.filter(s => s.holding.arcus!.env==='mainnet').map(s => ({equity:s.value,freeCollateral:s.state?.account.data?.freeCollateral ?? null,positions:(s.state?.positions.data ?? []).map(x => ({symbol:x.marketDisplayName,side:x.side,leverage:x.leverage,unrealizedPnl:x.unrealizedPnl,marginUsed:x.marginUsed,borrowedCapital:x.borrowedCapital,notional:x.positionValueNotional,size:x.size,entryPrice:x.averageEntryPrice,markPrice:x.markPx,marginMode:x.marginMode}))}));
    if(positions.length>300 || sources.length>50 || arcus.length>20 || arcus.some(a => a.positions.length>100)) {setError('پرتفولیو برای یک درخواست تحلیل بزرگ است؛ تعداد منابع را کاهش دهید. هیچ داده‌ای ارسال نشد.');setBusy(false);return;}
    try {
      await savePref('ai-profile',profile);
      const answer = await fetchJson<{answer:string;generatedAt:number}>('/api/integrations?op=analyze',{method:'POST',body:{question:text.trim(),history:messages.slice(-8).map(m => ({role:m.role,text:m.text.slice(0,14000)})),context:{total:p.total,partial:p.partial,sources,positions,arcus,profile}},timeoutMs:55000});
      setMessages(m => [...m,{role:'user',text:text.trim(),at:Date.now()},{role:'assistant',text:answer.answer,at:answer.generatedAt}]);setQuestion('');
    } catch(e) {setError(providerError(e));} finally {setBusy(false);}
  }
  return <Page><PageHeader title="دستیار پرتفولیو" eyebrow={<span className="inline-flex items-center gap-2"><LogoImage src="/logos/platform-gemini.png" label="جمینای" size={22}/>تحلیل فارسی · جمینای</span>} subtitle="تحلیل دارایی‌های زریون و آرکوس"/>
    {status===false && <Notice tone="warn">اتصال دستیار تنظیم نشده است.</Notice>}
    <Surface className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs text-muted">ارزش پرتفولیوی مبنای تحلیل</p><MoneyValue value={p.total} state={p.stale?'stale':'ready'} className="text-xl font-bold"/></div><Button variant="outline" icon={<RefreshCw/>} onClick={() => void p.refresh()}>تازه‌سازی داده</Button></Surface>
    {(p.partial || p.stale) && <Notice tone="warn">تحلیل بر پایهٔ داده‌های ناقص یا قدیمی انجام می‌شود.</Notice>}
    {p.total===null && <Notice>ابتدا یک منبع واقعی را متصل کنید. <Link to="/wallets" className="text-accent">افزودن کیف پول</Link></Notice>}
    <Section title="هدف و شرایط شما" id="assistant-profile"><Surface className="grid gap-4 p-4 md:grid-cols-3">{([['horizon','افق سرمایه‌گذاری','مثلاً یک سال'],['risk','ریسک‌پذیری','مثلاً متوسط'],['liquidity','نیاز به نقدینگی','مثلاً هزینهٔ شش ماه آینده']] as const).map(([key,label,placeholder]) => <Field key={key} label={label}><Input maxLength={key==='liquidity'?200:100} value={profile[key]} placeholder={placeholder} onChange={e => setProfile(x => ({...x,[key]:e.target.value}))}/></Field>)}</Surface></Section>
    <Section title="گفت‌وگو" id="assistant-chat"><Surface className="space-y-5 p-4 md:p-5"><div className="flex flex-wrap gap-2">{questions.map(q => <Button key={q.label} size="sm" variant="outline" disabled={busy || !status || p.total===null} onClick={() => setQuestion(q.text)}>{q.label}</Button>)}</div><div className="space-y-4" aria-live="polite">{!messages.length && <div className="flex items-start gap-3 py-6 text-muted"><Sparkles className="h-5 w-5 shrink-0 text-accent"/><p className="text-sm leading-7">دربارهٔ ترکیب دارایی‌ها یا ریسک پرتفولیوی خود بپرسید.</p></div>}{messages.map((m,i) => <Surface key={i} variant="subtle" className="space-y-2 p-4"><p className="text-xs font-semibold text-muted">{m.role==='user'?'شما':'دستیار دارینو · جمینای'} · {dateTime(m.at)}</p><p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-8 text-ink">{m.text}</p></Surface>)}</div>{error && <Notice tone="warn">{error}</Notice>}<Field label="پرسش شما"><textarea className="w-full rounded-field border border-divider bg-surface-2 p-3 text-sm leading-7 text-ink outline-none focus:ring-2 focus:ring-accent" rows={4} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="پرتفولیوی من را تحلیل کن…"/></Field><div className="flex flex-wrap justify-between gap-3"><Button loading={busy} icon={<Send/>} disabled={!question.trim() || !status || p.total===null} onClick={() => void ask()}>ارسال برای تحلیل</Button>{messages.length>0 && <Button variant="ghost" onClick={() => setMessages([])}>پاک‌کردن گفت‌وگو</Button>}</div><p className="text-xs leading-6 text-muted">با ارسال پرسش، خلاصهٔ پرتفولیو به Gemini فرستاده می‌شود. پیشنهادها تضمین بازده نیستند.</p><Disclosure summary="حریم خصوصی"><p className="text-xs leading-6 text-muted">پرسش، شرایط شما و پیام‌های اخیر ارسال می‌شوند. از دادهٔ پرتفولیو، آدرس، کلید و شناسهٔ تراکنش ارسال نمی‌شود. موجودی دستی و سناریوها جدا هستند؛ هیچ معامله‌ای اجرا نمی‌شود. گفت‌وگو با بستن صفحه پاک می‌شود.</p></Disclosure></Surface></Section>
  </Page>;
}
