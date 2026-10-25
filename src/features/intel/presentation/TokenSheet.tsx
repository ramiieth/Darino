/** کارنامهٔ امنیت یک میم‌کوین سولانا در Sheet (از تب میم‌کوین) */
import { Sheet } from '@/shared/components/ui/Sheet';
import { ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { useTokenSafety } from '../data/intelApi';
import { TokenSafetyView } from './TokenSafetyView';

export function TokenSheet({ address, onClose }: { address: string | null; onClose: () => void }) {
  const q = useTokenSafety('solana', address);
  if (!address) return null;
  return (
    <Sheet open onClose={onClose} title="کارنامهٔ امنیت توکن" size="lg" description={<bdi dir="ltr" className="break-all font-latin text-xs">{address}</bdi>}>
      {q.isLoading ? <ListSkeleton rows={5} /> : q.isError || !q.data ? <ErrorState message="بررسی امنیت انجام نشد" onRetry={() => void q.refetch()} /> : <TokenSafetyView t={q.data} />}
    </Sheet>
  );
}
