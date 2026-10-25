/**
 * تب «امنیت توکن» — آدرس قرارداد را بچسبانید: هانی‌پات، مالیات، مینت، فریز، تمرکز هولدرها، نقدینگی
 * بررسی‌های اخیر روی همین دستگاه می‌ماند.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { Surface } from '@/shared/components/ui/GlassCard';
import { CHAIN_FA, isTokenAddress, type Chain } from '../domain/tokenSafety';
import { useTokenSafety } from '../data/intelApi';
import { TokenSafetyView } from './TokenSafetyView';

const CHAINS: Chain[] = ['solana', 'ethereum', 'base', 'bsc', 'arbitrum'];
const RECENT_KEY = 'darino:intel:recent-tokens';
interface Recent { chain: Chain; address: string; symbol: string | null; at: number }

function readRecent(): Recent[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Recent[];
    return Array.isArray(r) ? r.filter((x) => CHAINS.includes(x.chain) && isTokenAddress(x.chain, x.address)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function SafetyTab() {
  const [chain, setChain] = useState<Chain>('solana');
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<{ chain: Chain; address: string } | null>(null);
  const [recent, setRecent] = useState<Recent[]>(readRecent);
  const q = useTokenSafety(target?.chain ?? 'solana', target?.address ?? null);
  const valid = isTokenAddress(chain, input.trim());

  const check = (c: Chain, address: string) => {
    setChain(c);
    setInput(address);
    setTarget({ chain: c, address });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) check(chain, input.trim());
  };
  useEffect(() => {
    if (!q.data || !target) return;
    setRecent((prev) => {
      if (prev.some((r) => r.address === target.address && r.chain === target.chain)) return prev;
      const next = [{ ...target, symbol: q.data.symbol, at: Date.now() }, ...prev].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* خاموش */ }
      return next;
    });
  }, [q.data, target]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
      <div className="space-y-4">
        <form onSubmit={submit} className="space-y-3">
          <ChipGroup<Chain> label="شبکه" value={chain} onChange={setChain} options={CHAINS.map((c) => ({ value: c, label: CHAIN_FA[c] }))} />
          <Field label="آدرس قرارداد توکن" error={input.trim() && !valid ? `آدرس معتبر ${CHAIN_FA[chain]} نیست` : undefined}>
            <Input dir="ltr" className="font-latin" autoComplete="off" spellCheck={false} placeholder={chain === 'solana' ? 'آدرس mint سولانا' : '0x…'} value={input} onChange={(e) => setInput(e.target.value)} />
          </Field>
          <Button type="submit" icon={<ShieldCheck />} disabled={!valid} className="w-full">بررسی امنیت</Button>
        </form>
        <Surface variant="subtle" className="p-4 text-xs leading-6 text-muted">
          <p className="mb-1 font-semibold text-ink">چه چیزی بررسی می‌شود؟</p>
          هانی‌پات و امکان فروش، مالیات خرید و فروش، مینت و فریز، مالک پنهان و قرارداد قابل ارتقا، تمرکز ۱۰ هولدر برتر، قفل نقدینگی، عمر و عمق بازار — از GoPlus، RugCheck و DexScreener.
        </Surface>
        {recent.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">بررسی‌های اخیر</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button key={r.chain + r.address} type="button" onClick={() => check(r.chain, r.address)} className="rounded-field border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2">
                  <bdi dir="ltr">{r.symbol ?? `${r.address.slice(0, 4)}…${r.address.slice(-4)}`}</bdi> <span className="text-subtle">· {CHAIN_FA[r.chain]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        {!target ? (
          <Surface variant="subtle" className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted">
            <ShieldCheck className="h-8 w-8 text-subtle" aria-hidden />
            آدرس توکن را وارد کنید تا کارنامهٔ امنیتش اینجا نمایش داده شود.
          </Surface>
        ) : q.isLoading ? (
          <ListSkeleton rows={5} />
        ) : q.isError || !q.data ? (
          <ErrorState message="بررسی امنیت انجام نشد" onRetry={() => void q.refetch()} />
        ) : (
          <TokenSafetyView t={q.data} />
        )}
      </div>
    </div>
  );
}
