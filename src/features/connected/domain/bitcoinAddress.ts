/** Bitcoin mainnet addresses: BIP-173/350 and Base58Check. No wallet access. */
const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
export function decodeBase58(value:string):Uint8Array|null {
 if(!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)||value.length>90)return null;
 let n=0n;for(const ch of value)n=n*58n+BigInt(BASE58.indexOf(ch));
 const bytes:number[]=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}
 return new Uint8Array([...Array(value.match(/^1*/)?.[0].length??0).fill(0),...bytes]);
}
export function isBitcoinAddress(value:string):boolean {
 if(/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)){const b=decodeBase58(value);return b?.length===25&&(b[0]===0||b[0]===5);}
 if(value!==value.toLowerCase()&&value!==value.toUpperCase())return false;
 const v=value.toLowerCase();if(!/^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{7,87}$/.test(v)||v.length>90)return false;
 const data=[...v.slice(3)].map(c=>BECH32.indexOf(c));let chk=1;
 for(const n of [3,3,0,2,3,...data]){const top=chk>>>25;chk=((chk&0x1ffffff)<<5)^n;[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].forEach((g,i)=>{if((top>>>i)&1)chk^=g;});}
 const version=data[0];if(version>16||(version===0?chk!==1:chk!==0x2bc830a3))return false;
 let acc=0,bits=0;const program:number[]=[];
 for(const n of data.slice(1,-6)){acc=((acc<<5)|n)&0xfff;bits+=5;while(bits>=8){bits-=8;program.push((acc>>>bits)&255);}}
 if(bits>=5||((acc<<(8-bits))&255)!==0)return false;
 return program.length>=2&&program.length<=40&&(version!==0||program.length===20||program.length===32);
}
export async function validBitcoinAddress(value:string):Promise<boolean>{
 if(!isBitcoinAddress(value))return false;if(/^bc1/i.test(value))return true;
 const b=decodeBase58(value)!;
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',await crypto.subtle.digest('SHA-256',b.slice(0,21))));
 return b.slice(21).every((n,i)=>n===hash[i]);
}
