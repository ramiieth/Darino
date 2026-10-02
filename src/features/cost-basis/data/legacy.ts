import { entryLoadAll,lotLoadAll,accountingReset } from '@/features/accounting/data/db';
import { readBaseline,buildBaseline } from '@/features/accounting/data/lotBaseline';
import { replayLedger } from '@/features/accounting/domain/lotReplay';
import { pullAccountingFromRemote } from '@/repositories/accountingRepository';
import { getCustodySnapshot,savePref,retireManualOperations } from '@/features/custody/data/repository';
import { syncCustodyNow,useCustodySync } from '@/features/custody/data/sync';
import { fetchJson } from '@/repositories/remoteClient';
import type { Asset } from '@/features/custody/domain/types';
import Decimal from 'decimal.js';
import { COST_PREF,type CostBook } from '../domain/book';
export async function previewLegacy(assets:Map<string,Asset>) {
 const remote=await fetchJson<{configured:boolean;retired?:boolean}>('/api/accounting');
 if(remote.retired) throw Error('خریدها قبلاً منتقل شده‌اند؛ انتقال را از اطلاعات محفوظ تکمیل کنید');
 if(remote.configured && !(await pullAccountingFromRemote())) throw Error('سوابق سرور کامل دریافت نشد؛ هیچ داده‌ای حذف نشد');
 const [entries,lots]=await Promise.all([entryLoadAll(),lotLoadAll()]);
 const remaining=replayLedger({baseline:readBaseline()??buildBaseline(lots,entries,'migration'),entries,ops:getCustodySnapshot().operations,assets}).lots.filter(l=>!l.closedAt&&l.qty>0&&!['USDT','USDC','DAI','USDG','USDT0','USD₮0'].includes(l.asset.toUpperCase()));
 return remaining.map(l=>{
  const matches=entries.filter(e=>e.trade?.kind==='buy'&&e.trade.symbol.toUpperCase()===l.asset.toUpperCase()&&e.date===l.openedAt&&e.trade.unitPrice===l.unitCost);
  const entry=matches.length===1?matches[0]:null;
  const fee=entry?entry.lines.filter(line=>line.account==='expense:fee').reduce((sum,line)=>sum+line.debit,0):null;
  return {...l,legacyFee:entry?.trade&&fee!==null?new Decimal(fee).times(l.qty).div(entry.trade.qty).toString():null};
 });
}
export async function retireLegacy(book:CostBook) {
 if(!book.migrationConfirmed) throw Error('ابتدا اطلاعات خرید را تأیید کنید');
 await savePref(COST_PREF,book);
 const synced=await syncCustodyNow();
 const localOnly=useCustodySync.getState().state==='server_unconfigured';
 if(!synced&&!localOnly) throw Error('اطلاعات خرید محفوظ است؛ برای تکمیل انتقال، اتصال سرور را بررسی کنید');
 const response=await fetchJson<{ok?:boolean;configured?:boolean}>('/api/accounting?op=retire',{method:'POST',body:{}});
 if(!response.ok && response.configured!==false) throw Error('پاک‌سازی دفتر قدیمی کامل نشد؛ دوباره تلاش کنید');
 await accountingReset();
 await retireManualOperations();
 await savePref(COST_PREF,{...book,legacyRetired:true});
}
