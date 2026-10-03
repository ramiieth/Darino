const SAFE_LOCAL = /^\/logos\/[a-z0-9-]+\.png$/;
const SAFE_ZERION = /^https:\/\/(?:token-icons\.s3\.amazonaws\.com|chain-icons\.s3\.amazonaws\.com|protocol-icons\.s3\.amazonaws\.com|cdn\.zerion\.io|assets\.zerion\.io)\/[a-zA-Z0-9%._/+-]{1,300}\.(?:png|jpg|jpeg|webp|svg)$/;
const SAFE_LLAMA_MODERN = /^https:\/\/icons\.llamao\.fi\/icons\/(?:protocols|chains)\/[a-z0-9._-]{1,100}(?:\?(?:v|w|h)=[0-9]{1,12}(?:&(?:v|w|h)=[0-9]{1,12})*)?$/;
const SAFE_LLAMA = /^https:\/\/icons\.llama\.fi\/[a-z0-9%._-]{1,80}\.jpg$/;

export function safeLogoSrc(src: string | null | undefined): string | null {
  return src && (SAFE_LOCAL.test(src) || SAFE_LLAMA.test(src) || SAFE_LLAMA_MODERN.test(src) || SAFE_ZERION.test(src)) && !src.includes('..') ? src : null;
}

