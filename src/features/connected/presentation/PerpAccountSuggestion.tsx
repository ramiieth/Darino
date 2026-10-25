import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { useCustody } from '@/features/custody/data/useCustody';
import { saveHolding, savePref, getPref, getCustodySnapshot } from '@/features/custody/data/repository';
import { hlLikeAccountQuery } from '@/features/perps/data/usePerpVenues';

const VENUES = {
  hyperliquid: { platform: 'hyperliquid', name: 'هایپرلیکوئید' },
  txflow: { platform: 'txflow', name: 'تی‌اکس‌فلو' }
} as const;
export type SuggestVenue = keyof typeof VENUES;
/** آدرس‌هایی که کاربر پیشنهاد افزودن هر پلتفرم را برایشان رد کرده (حروف کوچک) */
export const perpDismissedPref = (venue: SuggestVenue) => `connected.${venue}Dismissed`;

/**
 * کیف پول EVM متصل که روی هایپرلیکوئید یا تی‌اکس‌فلو حساب فعال دارد (ارزش یا پوزیشن باز) ولی هنوز ثبت نشده
 * → پیشنهاد افزودن؛ بعد از افزودن در داشبورد پرپچوال و «پوزیشن‌های واقعی» دیده می‌شود. فقط آدرس عمومی.
 */
export function PerpAccountSuggestion({ address, label, venue }: { address: string; label: string; venue: SuggestVenue }) {
  const v = VENUES[venue];
  const custody = useCustody();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = address.toLowerCase();
  const linked = custody.holdings.some((h) => h.kind === 'platform' && h.platformId === v.platform && !h.archivedAt && h.address?.toLowerCase() === key);
  const dismissed = getPref<string[]>(perpDismissedPref(venue))?.value ?? [];
  const enabled = custody.loaded && /^0x[0-9a-fA-F]{40}$/.test(address) && !linked && !dismissed.includes(key);
  // همان کلید کش داشبورد؛ فقط وجود حساب مهم است
  const q = useQuery({ ...hlLikeAccountQuery(venue, address), enabled, refetchInterval: false, staleTime: 5 * 60_000 });
  if (!enabled || !q.data?.state) return null;
  const equity = Number(q.data.state.marginSummary?.accountValue ?? 0);
  const positions = (q.data.state.assetPositions ?? []).filter((p) => Number(p.position?.szi)).length;
  if (!(equity > 0) && !positions) return null;

  async function add() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const existing = getCustodySnapshot().holdings.find((h) => h.kind === 'platform' && h.platformId === v.platform && h.address?.toLowerCase() === key);
      const now = Date.now();
      await saveHolding({ id: existing?.id ?? crypto.randomUUID(), kind: 'platform', platformId: v.platform, address, label: existing?.label || `${label} · ${v.name}`, createdAt: existing?.createdAt ?? now, updatedAt: now, archivedAt: null });
    } catch {
      setError('ذخیره انجام نشد؛ دوباره تلاش کنید');
    } finally {
      setBusy(false);
    }
  }
  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      await savePref(perpDismissedPref(venue), [...new Set([...dismissed, key])]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Notice className="m-5 mt-0" title={`حساب ${v.name} پیدا شد`}>
      <p>
        این کیف پول روی {v.name} حساب فعال{positions ? ` با ${toFaDigits(positions)} پوزیشن باز` : ''} دارد. با افزودن آن، ارزش حساب، پوزیشن‌ها و سود/زیان در داشبورد پرپچوال دیده می‌شوند. فقط آدرس عمومی ذخیره می‌شود.
      </p>
      {error && <p className="mt-1 text-warn">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={busy} onClick={() => void add()}>افزودن حساب</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void dismiss()}>نه، ممنون</Button>
      </div>
    </Notice>
  );
}
