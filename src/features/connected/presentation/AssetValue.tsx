import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { useUsdRate } from '@/shared/store/usdtStore';
import { fmtToman,fmtTomanAmount } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
export function AssetValue({value,className,primaryClassName,inline=false,stale=false}:{value:number|null|undefined;className?:string;primaryClassName?:string;inline?:boolean;stale?:boolean}) {
 const rate=useUsdRate();const valid=value!=null&&Number.isFinite(value)&&rate.rate!==null&&Number.isFinite(value*rate.rate);
 const title=valid?`${fmtTomanAmount(value*rate.rate!)} · نرخ تتر ${rate.kind==='live'?'زنده':'قدیمی'}`:'نرخ تتر در دسترس نیست';
 return <span className={cn('asset-value min-w-0 max-w-full',inline?'inline-flex flex-wrap items-baseline gap-x-3 gap-y-1':'inline-flex flex-col gap-1',className)}><MoneyValue value={value} state={stale?'stale':'ready'} className={cn('max-w-full break-words',primaryClassName)}/><span className={cn('max-w-full break-words text-[11px] font-normal leading-5',rate.kind==='stale'?'text-warn':'text-muted')} title={title}>{valid?(value!<0?fmtToman(Math.abs(value!),rate.rate).replace('≈ ','≈ -'):fmtToman(value,rate.rate)):'— تومان'}{valid&&rate.kind==='stale'&&<span className="ms-1 text-[10px]">· قدیمی</span>}</span></span>;
}
