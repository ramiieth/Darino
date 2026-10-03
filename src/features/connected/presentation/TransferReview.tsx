import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field,Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { savePref } from '@/features/custody/data/repository';
import { ACTIVITY_LINKS,type useActivity } from '../data/useActivity';
import { validateLink,type ActivityLink } from '../domain/activity';
import { visibleTransaction } from '../domain/visibility';
import { chainIdentity } from './identity';
import { dateTime,providerError } from './ConnectedPage';
export function TransferReview({activity,chains}:{activity:ReturnType<typeof useActivity>;chains:import('../domain/model').ChainInfo[]}){
 const [kind,setKind]=useState<ActivityLink['kind']>('bridge'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const shownActivity=activity.rows.filter(r=>!r.tx||visibleTransaction(r.tx));
 async function link(){setBusy(true);setError(null);try{const problem=validateLink(activity.rows.find(r=>r.key===from),activity.rows.find(r=>r.key===to),kind);if(problem)throw Error(problem);if(activity.links.some(l=>[l.from,l.to].includes(from)||[l.from,l.to].includes(to)))throw Error('این رویداد قبلاً به یک انتقال مرتبط شده است');await savePref(ACTIVITY_LINKS,[...activity.links.filter(l=>!l.proof),{id:crypto.randomUUID(),from,to,kind,at:Date.now()}]);setFrom('');setTo('');}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 return <Surface className="p-4"><details><summary className="cursor-pointer text-sm font-semibold text-accent">تطبیق انتقال‌های نیازمند بررسی</summary><div className="mt-4 space-y-4"><p className="text-xs leading-6 text-muted">دو سمت بریج، یا برداشت/واریز آرکوس و کیف پول را مرتبط کنید. این تأیید موجودی را تغییر نمی‌دهد.</p>{error&&<Notice tone="warn">{error}</Notice>}<div className="grid gap-4 sm:grid-cols-3"><Field label="نوع ارتباط"><Select value={kind} onChange={e=>setKind(e.target.value as ActivityLink['kind'])}><option value="bridge">بریج کیف پول</option><option value="bridge_swap">بریج همراه تبدیل دارایی</option><option value="arcus_withdrawal">برداشت آرکوس به کیف پول</option><option value="arcus_deposit">واریز کیف پول به آرکوس</option></Select></Field>{([['from','رویداد مبدأ'],['to','رویداد مقصد']] as const).map(([side,label])=><Field key={side} label={label}><Select value={side==='from'?from:to} onChange={e=>side==='from'?setFrom(e.target.value):setTo(e.target.value)}><option value="">انتخاب رویداد</option>{shownActivity.filter(r=>['confirmed','APPLIED'].includes(r.status)).map(r=><option key={r.key} value={r.key}>{r.label} · {r.tx?chainIdentity(r.tx.chain,chains).name:r.kind==='WITHDRAWAL'?'برداشت آرکوس':'واریز آرکوس'} · {dateTime(r.at)} · {(r.tx?.hash??r.key).slice(-8)}</option>)}</Select></Field>)}</div><Button loading={busy} disabled={!from||!to} icon={<Link2/>} onClick={()=>void link()}>تأیید ارتباط</Button>{activity.links.filter(l=>!l.proof).map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{l.kind==='bridge'||l.kind==='bridge_swap'?'بریج':l.kind==='arcus_withdrawal'?'برداشت آرکوس':'واریز آرکوس'} · {dateTime(l.at)}</span><Button size="sm" variant="ghost" onClick={()=>void savePref(ACTIVITY_LINKS,activity.links.filter(x=>!x.proof&&x.id!==l.id)).catch(e=>setError(providerError(e)))}>حذف ارتباط</Button></div>)}</div></details></Surface>;
}
