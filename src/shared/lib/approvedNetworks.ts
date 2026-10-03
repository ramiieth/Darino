/** Network choices requested by the owner. Historical identities remain available. */
export const APPROVED_NETWORKS = [
 {id:'ethereum',name:'اتریوم',llama:'Ethereum',logo:'/logos/chain-1.svg'},
 {id:'base',name:'بیس',llama:'Base',logo:'/logos/chain-8453.svg'},
 {id:'arbitrum',name:'آربیتروم',llama:'Arbitrum',logo:'/logos/chain-42161.png'},
 {id:'polygon',name:'پالیگان',llama:'Polygon',logo:'/logos/chain-137.jpg'},
 {id:'binance-smart-chain',name:'بی‌ان‌بی چین',llama:'BSC',logo:'/logos/chain-56.svg'},
 {id:'optimism',name:'اپتیمیزم',llama:'OP Mainnet',logo:'/logos/chain-10.png'},
 {id:'hyperevm',name:'هایپر ای‌وی‌ام',llama:'Hyperliquid',logo:'/logos/chain-999.png'},
 {id:'robinhood',name:'رابین‌هود',llama:'Robinhood Chain',logo:'/logos/chain-4663.svg'},
 {id:'arc',name:'آرک',llama:'Arc',logo:'/logos/chain-5042.svg'},
 {id:'monad',name:'موناد',llama:'Monad',logo:'/logos/chain-monad.jpg'},
 {id:'plasma',name:'پلاسما',llama:'Plasma',logo:'/logos/chain-plasma.jpg'},
 {id:'hyperliquid',name:'هایپرلیکوئید',llama:'Hyperliquid L1',logo:'/logos/chain-999.png'}
] as const;
export function approvedNetwork(value:string){const direct=APPROVED_NETWORKS.find(n=>n.id===value);if(direct)return direct;const key=value.toLowerCase();return APPROVED_NETWORKS.find(n=>n.id===key||n.llama.toLowerCase()===key||(n.id==='optimism'&&key==='optimism'));}
