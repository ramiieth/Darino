import { expect,it } from 'vitest';
import { normalizeDecimalInput,purchaseDecimal } from './decimalInput';
it('accepts Persian, Arabic and Latin decimal keyboard input without rounding',()=>{
 for(const input of ['۰.۶۵','۰٫۶۵','٠٫٦٥','0.65','0,65','۰/۶۵','.65'])expect(purchaseDecimal(input)).toBe('0.65');
 expect(purchaseDecimal('۰.۳۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۱')).toBe('0.300000000000000000001');
 expect(purchaseDecimal('۱٬۲۳۴٫۵۶')).toBe('1234.56');expect(purchaseDecimal('1,234.56')).toBe('1234.56');
});
it('preserves the decimal point while typing and rejects invalid purchase amounts',()=>{
 expect(normalizeDecimalInput('۰٫')).toBe('0.');expect(normalizeDecimalInput('۰,')).toBe('0.');
 for(const value of ['','0','-0.65','1.2.3','1.2,3','NaN','1e3'])expect(purchaseDecimal(value)).toBeNull();
 expect(purchaseDecimal('۰',true)).toBe('0');expect(purchaseDecimal('٫۶۵',true)).toBe('0.65');
});
