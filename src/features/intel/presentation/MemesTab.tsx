/**
 * تب «میم‌کوین» — داغ‌ترین و تازه‌ترین استخرهای سولانا (فعالیت واقعی از GeckoTerminal، نه تبلیغ پولی)
 * هر توکن حکم سریع امنیت دارد؛ کارنامهٔ کامل امنیت با باز کردن.
 */
import { useState } from 'react';
import { Users } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { useMemes, type MemeRow } from '../data/intelApi';
import { SplitBar, Stat, VerdictBadge, fmtAge } from './parts';

type List = 'trending' | 'new';

export function MemesTab({ onToken }: { onToken: (address: string) => void }) {
  const [list, setList] = useState<List>('trending');
  const q = useMemes(list);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<List> label="فهرست" value={list} onChange={setList} options={[{ value: 'trending', label: 'داغ‌ترین‌ها' }, { value: 'new', label: 'تازه‌ها' }]} />
        {q.data && <p className="text-xs text-muted">سولانا · به‌روز {fmtRelativeAge(q.data.fetchedAt)}</p>}
      </div>
      <Notice tone="warn" className="mb-5">
        میم‌کوین‌ها بسیار پرریسک‌اند و بیشترشان به صفر می‌رسند. قبل از هر خرید کارنامهٔ امنیت را باز کنید. حکم سبز یعنی «خطر شناخته‌شده‌ای پیدا نشد»، نه «امن».
      </Notice>
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.isError || !q.data ? (
        <ErrorState message="فهرست میم‌کوین‌ها دریافت نشد" onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {q.data.tokens.map((t) => (
            <MemeCard key={t.address} t={t} onOpen={() => onToken(t.address)} />
          ))}
        </div>
      )}
      <Surface variant="subtle" className="mt-6 p-4 text-xs leading-6 text-muted">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink"><Users className="h-4 w-4" aria-hidden /> ردیابی خرید و فروش KOLها</p>
        fomo، Kolscan و GMGN API عمومی ندارند و قوانینشان جمع‌آوری خودکار داده را ممنوع کرده. این بخش با یک منبع دادهٔ مجاز (Solana Tracker یا Helius) فعال می‌شود؛ کافی است کلید API آن را بدهید.
      </Surface>
    </>
  );
}

function MemeCard({ t, onOpen }: { t: MemeRow; onOpen: () => void }) {
  const buyers = t.buyers24h ?? 0, sellers = t.sellers24h ?? 0;
  return (
    <Surface as="article" className="h-full p-4 transition-shadow hover:shadow-card">
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <div className="mb-3 flex items-center gap-3">
          {t.image ? (
            <img src={t.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full bg-surface-2 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted" aria-hidden>{t.symbol.slice(0, 3)}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold text-ink"><bdi dir="ltr">{t.symbol}</bdi></p>
            <p className="truncate text-xs text-muted"><bdi dir="ltr">{t.name}</bdi> · {fmtAge(t.createdAt)}</p>
          </div>
          <VerdictBadge verdict={t.safety.verdict} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="ارزش بازار"><MoneyValue value={t.marketCap} compact /></Stat>
          <Stat label="نقدینگی"><MoneyValue value={t.liquidityUsd} compact /></Stat>
          <Stat label="حجم ۲۴ ساعت"><MoneyValue value={t.volume24h} compact /></Stat>
          <Stat label="۱ ساعت"><PercentValue value={t.change1h} digits={1} /></Stat>
          <Stat label="۲۴ ساعت"><PercentValue value={t.change24h} digits={1} /></Stat>
          <Stat label="ریسک‌ها">{t.safety.verdict === 'unknown' ? '—' : `${toFaDigits(t.safety.dangers)} خطر · ${toFaDigits(t.safety.warns)} هشدار`}</Stat>
        </div>
        {buyers + sellers > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-2xs font-semibold text-muted">خریداران {toFaDigits(buyers.toLocaleString('en-US'))} · فروشندگان {toFaDigits(sellers.toLocaleString('en-US'))} (۲۴ ساعت)</p>
            <SplitBar long={buyers} short={sellers} labels={false} />
          </div>
        )}
      </button>
    </Surface>
  );
}
