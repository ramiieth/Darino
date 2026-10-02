import { describe, expect, it } from 'vitest';
import { ASSETS, NETWORKS } from './catalog';
import { formatAmount, normalizeNumericInput, parsePositiveAmount } from './decimal';
import { checkTrackingUrl, explorerAddressUrl, explorerTxUrl } from './links';

const arb = NETWORKS.find((n) => n.id === 'arbitrum')!;
const rh = NETWORKS.find((n) => n.id === 'robinhood')!;

describe('کاتالوگ', () => {
  it('Robinhood Chain mainnet با chainId 4663 و explorer رسمی', () => {
    expect(rh.chainId).toBe(4663);
    expect(rh.isTestnet).toBe(false);
    expect(rh.explorerUrl).toBe('https://robinhoodchain.blockscout.com');
  });
});

describe('لینک explorer', () => {
  const hash = '0x' + 'cd'.repeat(32);
  it('فقط هش/آدرس معتبر لینک می‌شود', () => {
    expect(explorerTxUrl(arb, hash)).toBe(`https://arbiscan.io/tx/${hash}`);
    expect(explorerTxUrl(arb, 'javascript:alert(1)')).toBeNull();
    expect(explorerTxUrl(arb, '0x1234')).toBeNull();
    expect(explorerAddressUrl(rh, '0x' + '1'.repeat(40))).toBe(`https://robinhoodchain.blockscout.com/address/0x${'1'.repeat(40)}`);
  });

  it('شبکهٔ کاربر با explorer غیر https لینک نمی‌سازد', () => {
    expect(explorerTxUrl({ ...arb, explorerUrl: 'http://evil.example' }, hash)).toBeNull();
  });
});

describe('لینک رهگیری', () => {
  it('صفحهٔ عمومی relay.link/transaction شناسهٔ تراکنش نیست', () => {
    expect(checkTrackingUrl('https://relay.link/transaction', NETWORKS).ok).toBe(false);
    expect(checkTrackingUrl('https://relay.link/transaction/', NETWORKS).ok).toBe(false);
  });

  it('میزبان غیرمجاز، http و اطلاعات ورود رد می‌شوند', () => {
    expect(checkTrackingUrl('https://relay.link.evil.example/x', NETWORKS).ok).toBe(false);
    expect(checkTrackingUrl('http://relay.link/x/1', NETWORKS).ok).toBe(false);
    expect(checkTrackingUrl('https://user:pw@arbiscan.io/tx/1', NETWORKS).ok).toBe(false);
    expect(checkTrackingUrl('javascript:alert(1)', NETWORKS).ok).toBe(false);
  });

  it('لینک explorer مجاز پذیرفته می‌شود', () => {
    expect(checkTrackingUrl('https://arbiscan.io/tx/0xabc', NETWORKS).ok).toBe(true);
  });
});

describe('ورودی عددی', () => {
  it('ارقام فارسی و جداکننده نرمال می‌شوند', () => {
    expect(normalizeNumericInput('۱٬۲۳۴٫۵')).toBe('1234.5');
    expect(parsePositiveAmount('۰٫۰۰۰۱', 6)).toEqual({ ok: true, value: '0.0001' });
  });

  it('صفر، منفی و نمادگذاری علمی رد می‌شوند', () => {
    expect(parsePositiveAmount('0', 6).ok).toBe(false);
    expect(parsePositiveAmount('-1', 6).ok).toBe(false);
    expect(parsePositiveAmount('1e3', 6).ok).toBe(false);
  });

  it('نمایش بدون گرد کردن مخرب', () => {
    expect(formatAmount('1234567.123456789123', 6)).toBe('۱,۲۳۴,۵۶۷.۱۲۳۴۵۶…');
    expect(formatAmount('0.5')).toBe('۰.۵');
    expect(formatAmount(null)).toBe('—');
  });
});

describe('کاتالوگ شبکه‌ها (تأییدشده با eth_chainId و مستندات رسمی)', () => {
  const byId = (id: string) => NETWORKS.find((n) => n.id === id)!;
  it('شناسهٔ شبکه‌ها', () => {
    expect(byId('ethereum').chainId).toBe(1);
    expect(byId('base').chainId).toBe(8453);
    expect(byId('optimism').chainId).toBe(10);
    expect(byId('polygon').chainId).toBe(137);
    expect(byId('hyperevm').chainId).toBe(999);
    expect(byId('arc').chainId).toBe(5042);
  });

  it('همهٔ نام شبکه‌ها فارسی است', () => {
    for (const n of NETWORKS) expect(n.name).toMatch(/^[؀-ۿ‌ ]+$/);
  });

  it('هایپر ای‌وی‌ام explorer رسمی ندارد → لینکی ساخته نمی‌شود', () => {
    expect(byId('hyperevm').explorerUrl).toBeNull();
    expect(explorerTxUrl(byId('hyperevm'), '0x' + 'ab'.repeat(32))).toBeNull();
  });
});

describe('دارایی‌های کاتالوگ', () => {
  it('آرک: USDC فقط یک دارایی (native) — رابط ERC-20 در 0x3600… جدا ثبت نشده تا دوبار شمرده نشود', () => {
    const arcUsdc = ASSETS.filter((a) => a.networkId === 'arc' && a.symbol === 'USDC');
    expect(arcUsdc).toHaveLength(1);
    expect(arcUsdc[0].isNative).toBe(true);
    expect(ASSETS.some((a) => a.contract === '0x3600000000000000000000000000000000000000')).toBe(false);
  });

  it('USDC هم‌نام در شبکه‌های مختلف هویت جدا دارد', () => {
    const usdc = ASSETS.filter((a) => a.symbol === 'USDC');
    expect(new Set(usdc.map((a) => a.id)).size).toBe(usdc.length);
    expect(new Set(usdc.map((a) => a.networkId)).size).toBe(usdc.length);
  });

  it('هر دارایی شبکه، لوگوی محلی دارد و هر شبکه لوگوی محلی', () => {
    for (const a of ASSETS) expect(a.logo).toMatch(/^\/logos\/[a-z0-9-]+\.png$/);
    for (const n of NETWORKS) expect(n.logo).toMatch(/^\/logos\/chain-\d+\.png$/);
  });
});
