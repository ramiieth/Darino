/** Adapt freshness to the remaining organization budget, without hiding old timestamps. */
export function zerionBudget(headers:Headers,now=Date.now()){
 const n=(name:string)=>{const v=headers.get(name);return v!==null&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;};
 const dayRemaining=n('RateLimit-Org-Day-Remaining'),monthRemaining=n('RateLimit-Org-Month-Remaining');
 const ratio=Math.min(...['Day','Month'].map(p=>{const limit=n('RateLimit-Org-'+p+'-Limit'),remaining=n('RateLimit-Org-'+p+'-Remaining');return limit&&remaining!==null?remaining/limit:1;}));
 const level=ratio<=.05?'low':ratio<=.2?'limited':'normal';
 return {at:now,dayRemaining,monthRemaining,dayResetSeconds:n('RateLimit-Org-Day-Reset'),monthResetSeconds:n('RateLimit-Org-Month-Reset'),level,walletMs:level==='low'?14400000:level==='limited'?3600000:1800000,historyMs:level==='low'?14400000:3600000,chartMs:level==='low'?14400000:3600000};
}
export type ZerionBudget=ReturnType<typeof zerionBudget>;
