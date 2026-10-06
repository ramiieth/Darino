import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TokenLogo } from './EntityLogo';
import { yieldTokenIdentity } from './YieldTokenMark';

describe('receipt token marks and purchased network badges', () => {
  it('identifies each receipt underlying and distinguishes maturities without guessing other tokens', () => {
    expect(yieldTokenIdentity('YT-sUSDe-30DEC2026')?.underlying).toBe('sUSDe');
    expect(yieldTokenIdentity('PT-USDe-2026-12-30')?.underlying).toBe('USDe');
    expect(yieldTokenIdentity('YT-USDe-30DEC2026')?.rotation).not.toBe(yieldTokenIdentity('YT-USDe-30JUN2027')?.rotation);
    expect(yieldTokenIdentity('YT')).toMatchObject({ kind: 'YT', underlying: 'YT' });
    expect(yieldTokenIdentity('PYTH')).toBeNull();
  });
  it('shows a dedicated YT or PT mark together with the actual position network', () => {
    for (const symbol of ['YT-sUSDe-30DEC2026', 'PT-USDe-30DEC2026']) {
      for (const [networkName, networkLogo] of [['اتریوم', '/logos/chain-1.svg'], ['آربیتروم', '/logos/chain-arbitrum.svg']]) {
        const html = renderToStaticMarkup(<TokenLogo logo={null} symbol={symbol} networkName={networkName} networkLogo={networkLogo} />);
        expect(html).toContain(`data-yield-symbol="${symbol}"`);
        expect(html).toContain(`src="${networkLogo}"`);
        expect(html).toContain(`${symbol} روی ${networkName}`);
      }
    }
  });
  it('retains ordinary token logos and does not invent a network for grouped receipts', () => {
    expect(renderToStaticMarkup(<TokenLogo logo="/logos/token-eth.svg" symbol="ETH" />)).toContain('src="/logos/token-eth.svg"');
    const html = renderToStaticMarkup(<TokenLogo logo={null} symbol="YT-USDe-30DEC2026" />);
    expect(html).not.toContain('token-network-badge');
    expect(html).toContain('data-yield-token="YT"');
  });
});
