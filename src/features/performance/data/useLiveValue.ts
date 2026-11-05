/**
 * ارزش لحظه‌ای دارایی‌های متصل — فقط «پیشنهاد» برای ثبت Snapshot
 *
 *  کیف پول‌ها (توکن عادی) · دیفای (موقعیت‌های پروتکلی؛ وام منفی) · بیت‌کوین ·
 *  پرپچوال (آرکوس + لایتر، هایپرلیکوئید، تی‌اکس‌فلو، اوندو)
 *  اگر یک پلتفرم پرپ در کیف پول هم به‌عنوان موقعیت دیفای دیده شود، دوباره شمرده نمی‌شود.
 *  هرگز خودکار در سوابق ثبت نمی‌شود؛ فقط با تأیید کاربر.
 */
import { useMemo } from 'react';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { usePlatformPerpVenues } from '@/features/perps/data/usePerpVenues';
import { visiblePositions, visibleWalletValue } from '@/features/connected/domain/visibility';
import type { ValueBreakdown } from '../domain/types';

export interface LiveValue {
  total: number | null;
  breakdown: ValueBreakdown | null;
  loading: boolean;
  /** هیچ کیف پول یا حسابی متصل نیست */
  empty: boolean;
  sources: { label: string; value: number | null; kind: 'wallets' | 'defi' | 'perps' | 'bitcoin' }[];
  refresh: () => Promise<void>;
}

const VENUE_FA: Record<string, string> = {
  'lighter-robinhood': 'لایتر رابین‌هود',
  'lighter-mainnet': 'لایتر',
  hyperliquid: 'هایپرلیکوئید',
  txflow: 'تی‌اکس‌فلو',
  ondo: 'اوندو پرپس'
};
const VENUE_RE: Record<string, RegExp> = { hyperliquid: /hyperliquid/i, 'lighter-mainnet': /lighter/i, 'lighter-robinhood': /lighter/i, txflow: /txflow/i, ondo: /ondo/i };

export function useLiveValue(): LiveValue {
  const p = useConnectedPortfolio();
  const venues = usePlatformPerpVenues();
  return useMemo(() => {
    let wallets = 0;
    let defi = 0;
    let bitcoin = 0;
    let partial = p.partial;
    const protocols: string[] = [];
    let walletKnown = false;
    for (const w of p.wallets) {
      if (!w.state?.data) continue;
      const total = visibleWalletValue(w.state.data);
      if (total === null) {
        partial = true;
        continue;
      }
      walletKnown = true;
      let d = 0;
      let b = 0;
      for (const pos of visiblePositions(w.state.data.positions)) {
        const v = pos.value ?? 0;
        if (pos.chain === 'bitcoin') b += v;
        else if (pos.protocol) {
          d += pos.type === 'loan' ? -Math.abs(v) : v;
          protocols.push(pos.protocol);
        }
      }
      defi += d;
      bitcoin += b;
      wallets += total - d - b;
    }
    const sources: LiveValue['sources'] = [];
    let perps = 0;
    let perpKnown = false;
    for (const a of p.arcus) {
      if (a.holding.arcus?.env !== 'mainnet') continue;
      if (a.value === null) partial = true;
      else {
        perps += a.value;
        perpKnown = true;
        sources.push({ label: `آرکوس — ${a.holding.label}`, value: a.value, kind: 'perps' });
      }
    }
    for (const v of venues) {
      // در کیف پول به‌عنوان موقعیت دیفای همین پلتفرم دیده شده → دوباره شمرده نمی‌شود
      if (VENUE_RE[v.venue] && protocols.some((x) => VENUE_RE[v.venue].test(x))) continue;
      if (v.status === 'loading') continue;
      if (v.equity === null) {
        if (v.status === 'error') partial = true;
        continue;
      }
      if (v.equity <= 0) continue;
      perps += v.equity;
      perpKnown = true;
      sources.push({ label: `${VENUE_FA[v.venue] ?? v.venue} — ${v.label}`, value: v.equity, kind: 'perps' });
    }
    const empty = !p.wallets.length && !p.arcus.length && !venues.length;
    const any = walletKnown || perpKnown;
    const total = any ? wallets + defi + bitcoin + perps : null;
    if (walletKnown) {
      sources.unshift({ label: 'توکن‌های کیف پول‌ها', value: wallets, kind: 'wallets' });
      if (defi) sources.splice(1, 0, { label: 'موقعیت‌های دیفای (استیک، وام‌دهی، LP، پندل…)', value: defi, kind: 'defi' });
      if (bitcoin) sources.push({ label: 'کیف پول بیت‌کوین', value: bitcoin, kind: 'bitcoin' });
    }
    return {
      total,
      breakdown: any ? { wallets: walletKnown ? wallets : null, defi: walletKnown ? defi : null, perps: perpKnown ? perps : null, bitcoin: walletKnown ? bitcoin : null, partial, capturedAt: Date.now() } : null,
      loading: p.loading,
      empty,
      sources,
      refresh: p.refresh
    };
  }, [p, venues]);
}
