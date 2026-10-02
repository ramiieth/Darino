import { addressKey, type WalletTransaction } from './model';
export interface Activity { key:string; provider:'zerion'|'arcus'; label:string; at:number; status:string; kind:string; tx?:WalletTransaction; amount?:string; account?:string }
export interface ActivityLink { id:string; from:string; to:string; kind:'bridge'|'bridge_swap'|'arcus_withdrawal'|'arcus_deposit'; at:number;proof?:'lifi'|'relay' }
export const transactionKey = (tx:WalletTransaction) => `chain:${tx.chain}:${tx.hash || tx.id}`;
export function walletActivities(wallets:{label:string;address:string;history:WalletTransaction[]}[]):Activity[] {
  const rows = new Map<string,Activity>();
  for(const wallet of wallets) for(const tx of wallet.history) {
    const key=transactionKey(tx);const prev=rows.get(key);
    if(prev?.tx) {
      const transfers = new Map([...prev.tx.transfers,...tx.transfers].map(t => [`${t.tokenId ?? t.symbol}:${t.sender ?? ''}:${t.recipient ?? ''}:${t.quantity}:${t.actId ?? ''}`,t]));
      rows.set(key,{...prev,label:[...new Set([...prev.label.split(' · '),wallet.label])].join(' · '),tx:{...prev.tx,transfers:[...transfers.values()]}});
    } else rows.set(key,{key,provider:'zerion',label:wallet.label,at:Date.parse(tx.minedAt),status:tx.status,kind:tx.type,tx});
  }
  return [...rows.values()].sort((a,b)=>b.at-a.at);
}
export function isInternal(tx:WalletTransaction, addresses:string[]):boolean {
  const owned=new Set(addresses.map(addressKey));
  return tx.type!=='trade' && !!tx.transfers.length && tx.transfers.every(t=>!!t.sender && !!t.recipient && owned.has(addressKey(t.sender)) && owned.has(addressKey(t.recipient)));
}
export function validateLink(from:Activity|undefined,to:Activity|undefined,kind:ActivityLink['kind']):string|null {
  if(!from || !to || from.key===to.key) return 'دو رویداد متفاوت را انتخاب کنید';
  if(!['confirmed','APPLIED'].includes(from.status)||!['confirmed','APPLIED'].includes(to.status)) return 'هر دو رویداد باید تأییدشده باشند';
  if(to.at < from.at || to.at-from.at > 7*86400000) return 'ترتیب یا فاصلهٔ زمانی رویدادها معتبر نیست';
  if((kind==='bridge'||kind==='bridge_swap') && (from.provider!=='zerion'||to.provider!=='zerion'||from.tx?.chain===to.tx?.chain||!from.tx?.transfers.some(t=>t.direction==='out')||!to.tx?.transfers.some(t=>t.direction==='in'))) return 'بریج به خروجی مبدأ و ورودی شبکهٔ مقصد نیاز دارد';
  if(kind==='arcus_withdrawal' && (from.provider!=='arcus'||from.kind!=='WITHDRAWAL'||to.provider!=='zerion'||!to.tx?.transfers.some(t=>t.direction==='in'))) return 'برداشت آرکوس و دریافت کیف پول را انتخاب کنید';
  if(kind==='arcus_deposit' && (from.provider!=='zerion'||!from.tx?.transfers.some(t=>t.direction==='out')||to.provider!=='arcus'||to.kind!=='DEPOSIT')) return 'ارسال کیف پول و واریز آرکوس را انتخاب کنید';
  return null;
}
