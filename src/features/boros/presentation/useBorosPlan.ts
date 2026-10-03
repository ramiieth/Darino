import {create} from 'zustand';
/** Session-only form state. No keys, wallet permissions or persisted account data. */
type Plan={selected:string;mode:'real'|'hypothetical';capital:string;capitalUnit:'usd'|'asset';days:string;allocation:string;risk:string;gas:string;entrance:string};
export const useBorosPlan=create<Plan&{update:(patch:Partial<Plan>)=>void}>(set=>({selected:'',mode:'real',capital:'',capitalUnit:'usd',days:'30',allocation:'50',risk:'10',gas:'',entrance:'',update:patch=>set(s=>Object.entries(patch).every(([k,v])=>s[k as keyof Plan]===v)?s:{...s,...patch})}));
