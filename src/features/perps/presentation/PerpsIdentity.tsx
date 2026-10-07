import { LogoImage, TokenLogo } from '@/shared/components/ui/EntityLogo';
export const PERPS_IDENTITIES = {
 lighter: {name:'لایتر رابین‌هود',symbol:'لایتر',logo:'/logos/platform-lighter.png',networks:[{name:'رابین‌هود',logo:'/logos/chain-4663.svg'}]},
 'lighter-mainnet':{name:'لایتر',symbol:'لایتر',logo:'/logos/platform-lighter.png',networks:[{name:'اتریوم (شبکهٔ واریز)',logo:'/logos/chain-1.svg'}]},
 ondo: {name:'اوندو پرپس',symbol:'اوندو پرپس',logo:'/logos/platform-ondo.png',networks:[{name:'اتریوم',logo:'/logos/chain-1.svg'},{name:'آربیتروم',logo:'/logos/chain-arbitrum.svg'}]}
} as const;
/** Platform identity is separate from its funding networks and from token tickers. */
export function PerpsIdentity({provider}:{provider:keyof typeof PERPS_IDENTITIES}){
 const identity=PERPS_IDENTITIES[provider];
 return <div className="flex min-w-0 items-center gap-3"><TokenLogo logo={identity.logo} symbol={identity.symbol} name={identity.name} size={44} networkLogo={provider==='lighter'?'/logos/chain-4663.svg':undefined} networkName={provider==='lighter'?'رابین‌هود':undefined}/><div className="min-w-0"><p className="font-bold">{identity.name}</p><div className="mt-2 flex flex-wrap gap-3"><span className="text-xs text-muted">{provider==='lighter'?'شبکه:':'شبکه‌های واریز:'}</span>{identity.networks.map(n=><span key={n.name} className="inline-flex items-center gap-1.5 text-xs text-muted"><LogoImage src={n.logo} label={n.name} size={18}/>{n.name}</span>)}</div></div></div>;
}
