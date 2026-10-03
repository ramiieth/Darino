import { useEffect,useState } from 'react';
import { fetchJson } from '@/repositories/remoteClient';
type Budget={at:number;dayLimit?:number|null;monthLimit?:number|null;dayRemaining:number|null;monthRemaining:number|null;dayResetSeconds:number|null;monthResetSeconds:number|null};
/** Reads our persisted response headers, without spending a Zerion request. */
export function ZerionQuotaStatus({refreshKey}:{refreshKey:boolean}) {
 const [quota,setQuota]=useState<Budget|null>(null);
 useEffect(()=>{let active=true;void fetchJson<{quota:Budget|null}>('/api/integrations?op=status').then(r=>{if(active)setQuota(r.quota);}).catch(()=>{if(active)setQuota(null);});return()=>{active=false;};},[refreshKey]);
 if(!quota||Date.now()-quota.at>86400000)return <p className="text-muted">سهمیهٔ باقی‌مانده هنوز از پاسخ زریون دریافت نشده است.</p>;
 const n=(v:number)=>new Intl.NumberFormat('fa-IR').format(v);
 return <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">{(['day','month'] as const).map(period=>{const left=period==='day'?quota.dayRemaining:quota.monthRemaining,limit=period==='day'?quota.dayLimit:quota.monthLimit,reset=period==='day'?quota.dayResetSeconds:quota.monthResetSeconds;if(left===null)return null;const resetAt=reset!==null?quota.at+reset*1000:0;return <span key={period}>{period==='day'?'روزانه':'ماهانه'}: {resetAt&&resetAt<=Date.now()?'در انتظار آمار جدید':<>{n(left)} درخواست باقی‌مانده{limit!=null&&` از ${n(limit)}`}{left===0?' · تمام شده':limit&&left/limit<=.2?' · نزدیک سقف':''}</>}{resetAt>Date.now()&&<span className="block text-[10px]">بازنشانی: {new Date(resetAt).toLocaleString('fa-IR')}</span>}</span>;})}<span className="w-full text-[10px]">آخرین بررسی سهمیه: {new Date(quota.at).toLocaleString('fa-IR')}</span></div>;
}
