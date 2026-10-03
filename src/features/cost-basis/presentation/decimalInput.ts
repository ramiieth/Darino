import Decimal from 'decimal.js';
import { toEnDigits } from '@/shared/utils/formatters';

/** Text input keeps incomplete decimals editable; canonicalization happens on save. */
export function normalizeDecimalInput(value:string):string {
 const text=toEnDigits(value).replace(/[\s\u200e\u200f\u061c٬]/g,'').replace(/[٫/]/g,'.');
 return /^\d{1,3}(?:,\d{3})+\.\d*$/.test(text)?text.replace(/,/g,''):text.replace(/,/g,'.');
}
export function purchaseDecimal(value:string,allowZero=false):string|null {
 const text=normalizeDecimalInput(value);
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return null;
 const n=new Decimal(text);return n.isFinite()&&(allowZero?n.gte(0):n.gt(0))?n.toString():null;
}
