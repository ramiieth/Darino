/**
 * در حال اجرا — پوزیشن‌های واقعی دلتا نوترال در حساب‌های ثبت‌شدهٔ لایتر و آرکوس (فقط‌خواندنی)
 * هر دارایی که هم Long و هم Short دارد یک جفت است: مواجههٔ کل، عدم توازن (قاعدهٔ ۱٪ Tread.fi)، سود/زیان باز و فاندینگ خام آرکوس.
 */
import type { ReactNode } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { TREAD_UNBALANCED_PCT } from '@/features/calculators/domain';
import { DELTA_ACCOUNT_LABELS, useLinkedDeltaLegs, type AccountLeg, type LivePair } from '@/features/calculators/data/deltaPositions';
import { SourceTag } from '../CapitalFlow';

const fmtTime = (ms: number) => toFaDigits(new Date(ms).toLocaleTimeString('fa-IR-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

export function LiveMonitor() {
  const data = useLinkedDeltaLegs();

  if (!data.accounts.length) {
    return (
      <Guide title="هنوز حساب لایتر یا آرکوسی ثبت نشده است">
        آدرس عمومی حساب را در بخش «لایتر»، «لایتر رابین‌هود» یا «آرکوس» اضافه کنید. بعد از آن، هر Long و Short روی یک دارایی (مثلاً پوزیشن‌هایی که ربات Tread.fi باز کرده) این‌جا با
        اعداد واقعی نمایش داده می‌شود. هیچ کلید یا مجوز معامله‌ای لازم نیست.
      </Guide>
    );
  }

  const loading = data.accounts.some((a) => a.status === 'loading') && !data.legs.length;
  const failed = data.accounts.filter((a) => a.status === 'error');

  return (
    <div className="space-y-5">
      <Surface className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">حساب‌های خوانده‌شده</h2>
          {data.fetchedAt && <span className="text-2xs text-subtle">به‌روزرسانی {fmtTime(data.fetchedAt)} · هر ۳۰ ثانیه</span>}
        </div>
        <ul className="flex flex-wrap gap-2">
          {data.accounts.map(({ account, status }) => (
            <li key={account.id}>
              <Badge tone={status === 'ready' ? 'gain' : status === 'error' ? 'loss' : 'neutral'}>
                {DELTA_ACCOUNT_LABELS[account.venue]} · {account.label}
                {status === 'loading' ? ' · در حال خواندن' : status === 'error' ? ' · خوانده نشد' : ''}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="text-2xs leading-5 text-subtle">فقط‌خواندنی؛ هیچ سفارشی ثبت نمی‌شود. حساب اوندو در Darino خواندنی نیست و طرفِ اوندو این‌جا دیده نمی‌شود.</p>
      </Surface>

      {failed.length > 0 && (
        <Notice tone="warn" title={`${toFaDigits(failed.length)} حساب خوانده نشد`}>
          اعداد پایین فقط از حساب‌های خوانده‌شده‌اند و ممکن است یک طرف جفت را نداشته باشند.
        </Notice>
      )}

      {loading ? (
        <Surface className="space-y-3 p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </Surface>
      ) : !data.pairs.length ? (
        <Guide title="جفت دلتا نوترالی پیدا نشد">
          در حساب‌های خوانده‌شده، هیچ دارایی‌ای هم‌زمان Long و Short ندارد.
          {data.legs.length > 0 && ` (${toFaDigits(data.legs.length)} پوزیشن تک‌طرفه پیدا شد.)`} اگر یک طرف روی اوندو است، آن طرف این‌جا دیده نمی‌شود.
        </Guide>
      ) : (
        data.pairs.map((p) => <PairCard key={p.base} p={p} />)
      )}
    </div>
  );
}

function Guide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface className="space-y-1.5 p-5">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <p className="text-xs leading-6 text-muted">{children}</p>
    </Surface>
  );
}

function PairCard({ p }: { p: LivePair }) {
  const e = p.exposure;
  const arcusFunding = p.legs.filter((l) => l.rawFundingSinceOpen !== null);
  return (
    <Surface as="article" aria-labelledby={`pair-${p.base}`} className="space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AssetLogo symbol={p.base} kind="crypto" size={32} />
          <div>
            <h3 id={`pair-${p.base}`} className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <bdi dir="ltr" className="font-latin">
                {p.base}
              </bdi>
              <SourceTag kind="live" />
            </h3>
            <p className="text-2xs text-subtle">{toFaDigits(p.legs.length)} پوزیشن در حساب‌های شما</p>
          </div>
        </div>
        {e.netPct === null ? null : e.unbalanced ? (
          <Badge tone="warn">Unbalanced · {toFaDigits(Math.abs(e.netPct).toFixed(2))}٪</Badge>
        ) : (
          <Badge tone="gain">متوازن · {toFaDigits(Math.abs(e.netPct).toFixed(2))}٪</Badge>
        )}
      </div>

      <MetricGrid cols={3}>
        <Metric size="sm" label="مواجههٔ کل" value={<MoneyValue value={e.totalUsd} digits={2} />} sub="Long + Short، ارزش فعلی" />
        <Metric
          size="sm"
          label="عدم توازن"
          value={<MoneyValue value={e.netUsd} signed digits={2} />}
          sub={e.netUsd === 0 ? 'برابر' : e.netUsd > 0 ? 'Long بیشتر است' : 'Short بیشتر است'}
        />
        <Metric size="sm" label="سود/زیان باز (تحقق‌نیافته)" value={<MoneyValue value={e.unrealizedPnl} signed tone="auto" digits={2} />} sub="عدد صرافی‌ها" />
      </MetricGrid>

      <ul className="divide-y divide-divider rounded-field border border-divider">
        {p.legs.map((l, i) => (
          <LegRow key={`${l.accountId}:${l.sub}:${l.market}:${i}`} l={l} />
        ))}
      </ul>

      {e.partial && <p className="text-2xs text-warn">ارزش یکی از پوزیشن‌ها معلوم نبود؛ مواجهه و عدم توازن ناقص‌اند.</p>}
      {e.unbalanced && (
        <p className="text-xs leading-6 text-muted">
          عدم توازن بیش از {toFaDigits(TREAD_UNBALANCED_PCT)}٪ است: بخش بی‌پوشش (<MoneyValue value={Math.abs(e.netUsd)} digits={2} />) با حرکت قیمت سود یا زیان می‌سازد.
        </p>
      )}
      {arcusFunding.length > 0 && (
        <p className="text-2xs leading-5 text-subtle">
          فاندینگ تجمعی گزارش‌شدهٔ آرکوس از زمان باز شدن:{' '}
          {arcusFunding.map((l, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {l.side === 'long' ? 'Long' : 'Short'} <MoneyValue value={l.rawFundingSinceOpen} digits={4} />
            </span>
          ))}{' '}
          — عدد خام API؛ علامت (دریافتی یا پرداختی) در مستندات آرکوس روشن نیست، پس جمع زده نشده.
        </p>
      )}
    </Surface>
  );
}

function LegRow({ l }: { l: AccountLeg }) {
  const long = l.side === 'long';
  const liqPct = l.liquidation !== null && l.mark !== null && l.mark > 0 ? Math.abs(l.liquidation / l.mark - 1) * 100 : null;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <span className={cn('mt-0.5 w-12 shrink-0 text-xs font-bold', long ? 'text-positive' : 'text-negative')}>{long ? 'Long' : 'Short'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-ink">
          {DELTA_ACCOUNT_LABELS[l.venue]} · {l.accountLabel}
          {l.venue !== 'arcus' && <span className="text-subtle"> · زیرحساب {toFaDigits(l.sub)}</span>}
        </span>
        <span className="block text-2xs text-muted">
          ورود {l.entry === null ? '—' : <MoneyValue value={l.entry} />} · مارک {l.mark === null ? '—' : <MoneyValue value={l.mark} />}
          {liqPct !== null && (
            <>
              {' '}
              · لیکویید با {long ? 'ریزش' : 'رشد'} <PercentValue value={liqPct} digits={1} signed={false} tone="none" />
            </>
          )}
        </span>
      </span>
      <span className="shrink-0 text-end">
        <MoneyValue value={l.notional} digits={2} className="text-sm font-semibold" />
        <span className="block text-2xs">
          <MoneyValue value={l.unrealizedPnl} signed tone="auto" digits={2} />
        </span>
      </span>
    </li>
  );
}
