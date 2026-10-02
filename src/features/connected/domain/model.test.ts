import { describe, expect, it } from 'vitest';
import { addressKey, validAddress, normalizePosition, normalizeTransaction, deduplicatePositions } from './model';

describe('هویت و دادهٔ فقط‌خواندنی زریون', () => {
  it('EVM بدون حساسیت به حروف؛ سولانا با طول بایت درست و حساس به حروف', () => {
    expect(validAddress('0x' + 'aB'.repeat(20))).toBe(true);
    expect(addressKey('0x' + 'aB'.repeat(20))).toBe('0x' + 'ab'.repeat(20));
    expect(validAddress('11111111111111111111111111111111')).toBe(true);
    expect(validAddress('111111111111111111111111111111111')).toBe(false);
    expect(validAddress('0x123')).toBe(false);
    expect(addressKey('So11111111111111111111111111111111111111112')).toContain('So');
  });
  it('دقت مقدار و قرارداد همان شبکه حفظ می‌شود؛ نماد جایگزین هویت نیست', () => {
    const p = normalizePosition({ id:'p', attributes:{ quantity:{int:'123456789012345678901',decimals:18}, fungible_info:{id:'opaque',symbol:'ETH',implementations:[{chain_id:'base',address:'base-contract'},{chain_id:'ethereum',address:'eth-contract'}]}, value:null }, relationships:{chain:{data:{id:'base'}}} });
    expect(p.quantity).toBe('123.456789012345678901');
    expect(p.contract).toBe('base-contract');
    expect(p.value).toBeNull();
  });
  it('رسید پروتکل، ردیف تکراری و اسپم دوباره نمایش داده نمی‌شوند', () => {
    const wallet = normalizePosition({id:'wallet',attributes:{position_type:'wallet',fungible_info:{id:'receipt'}},relationships:{chain:{data:{id:'base'}}}});
    const deposit = {...wallet,id:'deposit',type:'deposit',tokenId:'underlying',receipt:'receipt'};
    expect(deduplicatePositions([wallet,deposit,deposit,{...wallet,id:'spam',spam:true}])).toEqual([deposit]);
    expect(deduplicatePositions([{...wallet,chain:'ethereum'},deposit])).toHaveLength(2);
  });
  it('طرف انتقال از جهت انتقال تعیین می‌شود؛ دریافت به خود کیف پول انتقال داخلی شمرده نمی‌شود', () => {
    const tx = normalizeTransaction({id:'tx',attributes:{transfers:[{direction:'in',sender:'other',recipient:'self'},{direction:'out',sender:'self',recipient:'other'}]}});
    expect(tx.transfers.map(t => t.address)).toEqual(['other','other']);
  });
});
