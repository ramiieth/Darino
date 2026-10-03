const SAFE_LOCAL = /^\/logos\/[a-z0-9-]+\.png$/;
const REVIEWED_LOCAL=new Set(['platform-zerion','token-eth','token-usdt','token-usdt0','token-usdc','token-eurc','chain-1','chain-8453','chain-4663','chain-5042','chain-56','chain-solana','chain-avalanche'].map(n=>'/logos/'+n+'.svg').concat(['/logos/token-hype.jpg','/logos/chain-monad.jpg','/logos/chain-plasma.jpg','/logos/chain-137.jpg']));
const SAFE_ZERION = /^https:\/\/(?:token-icons\.s3\.amazonaws\.com|chain-icons\.s3\.amazonaws\.com|protocol-icons\.s3\.amazonaws\.com|cdn\.zerion\.io|assets\.zerion\.io)\/[a-zA-Z0-9%._/+-]{1,300}\.(?:png|jpg|jpeg|webp|svg)$/;
const SAFE_LLAMA_MODERN = /^https:\/\/icons\.llamao\.fi\/icons\/(?:protocols|chains)\/[a-z0-9._-]{1,100}(?:\?(?:v|w|h)=[0-9]{1,12}(?:&(?:v|w|h)=[0-9]{1,12})*)?$/;
const SAFE_LLAMA = /^https:\/\/icons\.llama\.fi\/[a-z0-9%._-]{1,80}\.jpg$/;

const REPLACEMENTS:Record<string,string>={
 ...Object.fromEntries(['platform-zerion','token-eth','token-usdt','token-usdt0','token-usdc','token-eurc','chain-1','chain-8453','chain-4663','chain-5042','chain-56','chain-solana','chain-avalanche'].map(n=>['/logos/'+n+'.png','/logos/'+n+'.svg'])),
 '/logos/chain-137.png':'/logos/chain-137.jpg',
 '/logos/token-hype.png':'/logos/token-hype.jpg'
};
export function safeLogoSrc(src:string|null|undefined):string|null {
 src=src?REPLACEMENTS[src]??src:src;
 return src&&(REVIEWED_LOCAL.has(src)||SAFE_LOCAL.test(src)||SAFE_LLAMA.test(src)||SAFE_LLAMA_MODERN.test(src)||SAFE_ZERION.test(src))&&!src.includes('..')?src:null;
}
