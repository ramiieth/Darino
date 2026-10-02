/**
 * موجودی‌ها — به تفکیک محل نگهداری / شبکه / توکن
 *  • هر محل فقط یک منبع: snapshot همگام‌شدهٔ Arcus یا دفتر محاسبه‌شده (هرگز جمع هر دو).
 *  • قیمت ناموجود = «نامشخص» و از مجموع کنار گذاشته می‌شود.
 *  • این مجموع جدا از دفتر حسابداری دلاری اپ است و با آن جمع نمی‌شود.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { Badge } from '@/shared/components/ui/Badge';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { fmtRelativeAge } from '@/shared/utils/formatters';
import { formatAmount } from '../domain/decimal';
import { isNegative } from '../domain/ledger';
import { valuePortfolio, type ArcusSnapshotSummary, type ValuedRow } from '../domain/valuation';
import type { CustodyData } from '../data/useCustody';
import { useAssetPrices } from '../data/useCustody';
import { AssetLogoFor, assetSubtitle, HoldingIcon, HOLDING_KIND_LABEL, UsdDec } from './parts';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { accountKey, getArcusState, isStale, refreshSummary, useArcusStoreVersion } from '@/features/arcus/data/useArcusAccount';

type GroupBy = 'holding' | 'network' | 'asset';

export function BalancesPanel({ d }: { d: CustodyData }) {
  const [group, setGroup] = useState<GroupBy>('holding');
  useArcusStoreVersion();

  const arcusHoldings = d.holdings.filter((h) => h.kind === 'arcus' && h.arcus && !h.archivedAt);
  const arcusKeys = arcusHoldings.map((h) => accountKey(h.arcus!)).join(',');

  // یک‌بار خواندن خلاصهٔ حساب‌های Arcus (بدون polling در این صفحه)
  useEffect(() => {
    for (const h of arcusHoldings) void refreshSummary(h.arcus!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcusKeys]);

  const snapshots: ArcusSnapshotSummary[] = [];
  for (const h of arcusHoldings) {
    const s = getArcusState(accountKey(h.arcus!));
    const acc = s?.account;
    if (acc?.data && acc.fetchedAt) snapshots.push({ holdingId: h.id, equity: acc.data.equity, fetchedAt: acc.fetchedAt, stale: isStale(acc) });
  }

  // فقط قیمت دارایی‌هایی که واقعاً موجودی یا مقدار در حال انتقال دارند
  const cgIds = [...d.ledger.balances, ...d.ledger.inTransit]
    .map((b) => d.assetById.get(b.assetId)?.coingeckoId)
    .filter((x): x is string => !!x);
  const { prices, loading: pricesLoading } = useAssetPrices(cgIds);

  const v = useMemo(
    () => valuePortfolio(d.ledger.balances, d.ledger.inTransit, d.assetById, d.holdingById, prices, snapshots),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, prices, JSON.stringify(snapshots)]
  );

  if (d.holdings.length === 0) {
    return (
      <EmptyState
        message="هنوز محل نگهداری‌ای ثبت نشده"
        hint="از تب «محل‌ها» کیف پول، حساب دستی یا زیرحساب آرکوس را اضافه کنید؛ سپس موجودی اولیه را با «ثبت/تعدیل موجودی» وارد کنید."
      />
    );
  }

  const groups = new Map<string, { title: React.ReactNode; rows: ValuedRow[] }>();
  for (const r of v.rows) {
    const asset = d.assetById.get(r.assetId);
    let key: string;
    let title: React.ReactNode;
    if (group === 'holding') {
      const h = d.holdingById.get(r.holdingId);
      key = r.holdingId;
      title = (
        <span className="inline-flex items-center gap-2">
          <HoldingIcon holding={h} size={22} />
          {h?.label ?? 'محل حذف‌شده'}
          {h && <span className="text-xs font-normal text-muted">{HOLDING_KIND_LABEL[h.kind]}</span>}
        </span>
      );
    } else if (group === 'network') {
      key = asset?.networkId ?? (asset?.platformId ? `platform:${asset.platformId}` : 'unknown');
      const net = asset?.networkId ? d.networkById.get(asset.networkId) : undefined;
      title = net ? (
        <span className="inline-flex items-center gap-2">
          <LogoImage src={net.logo} label={net.name} size={22} square />
          {net.name}
        </span>
      ) : asset?.platformId ? (
        'داخل پلتفرم'
      ) : (
        'نامشخص'
      );
    } else {
      key = r.assetId;
      title = asset ? (
        <span className="inline-flex items-center gap-2">
          <AssetLogoFor asset={asset} network={asset.networkId ? d.networkById.get(asset.networkId) : undefined} size={22} />
          {asset.name}
        </span>
      ) : (
        r.assetId
      );
    }
    const g = groups.get(key) ?? { title, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  return (
    <div className="space-y-6">
      <Surface className="p-4 md:p-6">
        <MetricGrid cols={3}>
          <Metric
            size="lg"
            label="ارزش معلوم (دلار)"
            value={pricesLoading && prices.size === 0 ? '…' : <UsdDec v={v.knownTotalUsd} />}
            sub={v.unpricedCount > 0 ? `${v.unpricedCount} ردیف بدون قیمت (در مجموع نیست)` : 'همهٔ ردیف‌ها قیمت دارند'}
          />
          <Metric
            size="md"
            label="در حال انتقال"
            value={d.ledger.inTransit.length ? <UsdDec v={v.inTransitUsd} /> : '—'}
            sub={d.ledger.inTransit.length ? `${d.ledger.inTransit.length} عملیات در جریان — یک‌بار شمرده شده` : 'عملیات در جریانی نیست'}
          />
          <Metric size="md" label="حساب‌های آرکوس همگام" value={snapshots.length ? `${snapshots.length}` : '—'} sub={snapshots.some((s) => s.stale) ? 'برخی داده‌ها قدیمی است' : 'ارزش حساب طبق تعریف آرکوس'} />
        </MetricGrid>
        <p className="mt-4 text-xs leading-5 text-muted">
          این مجموع مستقل از «حسابداری» دلاری دارینو است و با آن جمع نمی‌شود. هیچ استیبل‌کوینی بی‌قید ۱ دلار فرض نشده؛ قیمت‌ها از کوین‌گکو با زمان دریافت نمایش داده می‌شوند.
        </p>
      </Surface>

      {d.ledger.balances.some((b) => d.assetById.get(b.assetId)?.platformId === 'arcus') && (
        <Notice tone="info">
          «USDG» در کیف پول زنجیرهٔ رابین‌هود یک توکن روی زنجیره است؛ «وثیقهٔ آرکوس» موجودی داخل حساب قراردادهای دائمی است. این دو دارایی جدا نگه داشته می‌شوند و با هم ادغام نمی‌شوند.
        </Notice>
      )}

      <SegmentedControl
        label="گروه‌بندی"
        options={[
          { value: 'holding', label: 'محل نگهداری' },
          { value: 'network', label: 'شبکه' },
          { value: 'asset', label: 'توکن' }
        ]}
        value={group}
        onChange={setGroup}
      />

      {arcusHoldings.map((h) => {
        const snap = snapshots.find((s) => s.holdingId === h.id);
        const st = getArcusState(accountKey(h.arcus!));
        return (
          <Surface key={h.id} className="flex flex-wrap items-center gap-3 p-4">
            <HoldingIcon holding={h} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{h.label}</p>
              <p className="text-xs text-muted">
                آرکوس {h.arcus!.env === 'mainnet' ? 'شبکهٔ اصلی' : 'شبکهٔ آزمایشی'} · زیرحساب {h.arcus!.accountIndex}
                {snap ? ` · به‌روزرسانی ${fmtRelativeAge(snap.fetchedAt)}` : ''}
              </p>
            </div>
            <div className="text-end">
              <p className="text-xs text-muted">ارزش حساب (همگام)</p>
              <p className="font-bold text-ink">
                {snap ? <UsdDec v={snap.equity} /> : st?.account.data === null && st.account.fetchedAt ? 'بدون فعالیت' : st?.account.error ? 'در دسترس نیست' : '…'}
              </p>
              {snap?.stale && <Badge tone="warn">قدیمی</Badge>}
            </div>
            <Link to="/arcus" className="text-sm text-accent hover:underline">
              جزئیات
            </Link>
          </Surface>
        );
      })}

      {v.rows.length === 0 ? (
        <EmptyState message="هنوز موجودی‌ای ثبت نشده است" hint="موجودی اولیه را با عملیات «ثبت/تعدیل موجودی» وارد کنید." />
      ) : (
        [...groups.entries()].map(([key, g]) => (
          <Surface key={key} className="p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">{g.title}</h3>
            <ul className="divide-y divide-divider">
              {g.rows.map((r) => {
                const asset = d.assetById.get(r.assetId);
                const net = asset?.networkId ? d.networkById.get(asset.networkId) : undefined;
                const h = d.holdingById.get(r.holdingId);
                return (
                  <li key={`${r.holdingId}|${r.assetId}`} className="flex items-center gap-3 py-2.5">
                    <AssetLogoFor asset={asset} network={net} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        <span title={assetSubtitle(asset, d)}>{asset?.name ?? 'دارایی نامشخص'}</span>
                      </p>
                      {group !== 'holding' && <p className="truncate text-xs text-muted">{h?.label}</p>}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {r.incomplete && <Badge tone="warn">مقدار برخی عملیات نامعلوم</Badge>}
                        {isNegative(r.quantity) && <Badge tone="loss">منفی — موجودی اولیه ثبت نشده؟</Badge>}
                        {r.supersededBySync && <Badge tone="info">فقط برای تطبیق — ارزش همگام‌شده جایگزین است</Badge>}
                        {asset?.origin === 'user' && <Badge tone="warn">واردشده توسط کاربر</Badge>}
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-bold tabular-nums text-ink" title={r.quantity}>
                        <bdi dir="ltr">{formatAmount(r.quantity, 8)}</bdi>
                      </p>
                      <p className="text-xs text-muted" title={r.price ? `${r.price.source} · ${new Date(r.price.fetchedAt).toISOString()}` : undefined}>
                        {r.usdValue !== null ? (
                          <>
                            <UsdDec v={r.usdValue} /> · {fmtRelativeAge(r.price!.fetchedAt)}
                          </>
                        ) : (
                          'ارزش نامشخص'
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Surface>
        ))
      )}
    </div>
  );
}
