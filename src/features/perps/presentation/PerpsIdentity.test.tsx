// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PerpsIdentity } from './PerpsIdentity';
afterEach(cleanup);
it('shows Persian Lighter identity with the Robinhood badge',()=>{const {container}=render(<PerpsIdentity provider="lighter"/>);expect(screen.getByText('لایتر رابین‌هود')).toBeTruthy();expect(screen.getByText('Lighter')).toBeTruthy();expect(container.querySelector('img[src="/logos/platform-lighter.png"]')).toBeTruthy();expect(container.querySelector('.token-network-badge img')?.getAttribute('src')).toBe('/logos/chain-4663.svg');});
it('shows Ondo official logo and documented funding networks without a false Robinhood badge',()=>{const {container}=render(<PerpsIdentity provider="ondo"/>);expect(screen.getByText('اوندو پرپس')).toBeTruthy();expect(screen.getByText('Ondo Perps')).toBeTruthy();expect(container.querySelector('img[src="/logos/platform-ondo.png"]')).toBeTruthy();expect(screen.getByText('اتریوم')).toBeTruthy();expect(screen.getByText('آربیتروم')).toBeTruthy();expect(container.querySelector('.token-network-badge')).toBeNull();});
