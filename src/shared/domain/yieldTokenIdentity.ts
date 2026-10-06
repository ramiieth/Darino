/** Presentation identity for arbitrary receipt markets. Never changes provider symbols. */
export type YieldKind = 'YT' | 'PT' | 'LP';
const KIND_FA: Record<YieldKind,string> = {YT:'وای‌تی',PT:'پی‌تی',LP:'ال‌پی'};
const LETTER_FA: Record<string,string> = {A:'ای',B:'بی',C:'سی',D:'دی',E:'ای',F:'اف',G:'جی',H:'اچ',I:'آی',J:'جی',K:'کی',L:'ال',M:'ام',N:'ان',O:'او',P:'پی',Q:'کیو',R:'آر',S:'اس',T:'تی',U:'یو',V:'وی',W:'دبلیو',X:'اکس',Y:'وای',Z:'زد'};
export function persianTicker(symbol:string):string {
 return symbol.replace(/[A-Za-z]+/g,part=>[...part.toUpperCase()].map(c=>LETTER_FA[c]).join('‌')).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const TAIL=/[-\s]+(\d{1,2}\s*[A-Za-z]{3}\s*\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{8})$/;
function maturityDate(text:string):{timestamp:number|null;underlying:string} {
 const match=TAIL.exec(text);if(!match)return {timestamp:null,underlying:text};
 const value=match[1];let year=0,month=0,day=0;
 const named=/^(\d{1,2})\s*([A-Za-z]{3})\s*(\d{2}|\d{4})$/.exec(value);
 const iso=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
 if(named){day=Number(named[1]);month=MONTHS.indexOf(named[2].toUpperCase())+1;year=Number(named[3]);if(named[3].length===2)year+=2000;}
 else if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
 else if(/^\d{8}$/.test(value)){year=Number(value.slice(0,4));month=Number(value.slice(4,6));day=Number(value.slice(6,8));}
 const timestamp=Date.UTC(year,month-1,day),d=new Date(timestamp);
 if(year<2000||month<1||month>12||day<1||d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return {timestamp:null,underlying:text};
 return {timestamp,underlying:text.slice(0,match.index).trim()};
}
export function yieldTokenIdentity(symbol:string, name?:string) {
 const match=/^(YT|PT|LP)(?:$|[-\s]+(.+))/i.exec(symbol.trim()) ?? /^PENDLE[-\s]+(LP)(?:T)?(?:$|[-\s]+(.+))/i.exec(symbol.trim());if(!match)return null;
 const kind=match[1].toUpperCase() as YieldKind;
 const parsed=maturityDate(match[2]??'');
 const maturity=parsed.timestamp??(name?maturityDate(name).timestamp:null);
 const underlying=parsed.underlying||kind;
 const underlyingFa=underlying===kind?'':persianTicker(underlying);
 const kindFa=KIND_FA[kind];
 const maturityFa=maturity===null?null:new Intl.DateTimeFormat('fa-IR-u-ca-persian',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(maturity);
 return {kind,kindFa,underlying,underlyingFa,nameFa:[kindFa,underlyingFa].filter(Boolean).join(' '),maturity,maturityFa};
}
