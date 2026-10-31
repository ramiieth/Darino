/**
 * قدرت خرید — «اگر به‌جای نگه‌داشتن دلار بازده‌دار، همان روز دارایی می‌خریدم؟»
 * تغییر قیمت: CoinGecko market_chart/range (کش ۲۴h) · بازده نقد: Net APY بازار انتخابی یا دستی
 */
import { useEffect, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { MoneyValue, PercentValue, Metric, MetricGrid } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { fetchCryptoHistory } from '@/features/calculators/data/historical';
import { buyingPower, periodReturnPct } from '@/features/defi-loop/domain/carry';

type Asset = 'solana' | 'bitcoin' | 'ethereum';
type Period = '7' | '30' | '90' | '365';

const ASSET_SYMBOL: Record<Asset, string> = { solana: 'SOL', bitcoin: 'BTC', ethereum: 'ETH' };

const parseNum = (s: string): number | null => {
  const t = toEnDigits(s).replace(/[,٬\s%٪]/g, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export function BuyingPowerCard({
  defaultCapital,
  marketApy,
  marketLabel
}: {
  defaultCapital: number;
  /** Net APY بازار انتخاب‌شده (٪) — null = انتخاب نشده/نامعلوم */
  marketApy: number | null;
  marketLabel: string | null;
}) {
  const [asset, setAsset] = useState<Asset>('solana');
  const [period, setPeriod] = useState<Period>('30');
  const [apyText, setApyText] = useState('5');
  const [change, setChange] = useState<{ pct: number | null; error: boolean; loading: boolean }>({ pct: null, error: false, loading: true });

  const days = Number(period);
  const useMarket = marketApy !== null;
  const apy = useMarket ? marketApy : parseNum(apyText);

  useEffect(() => {
    let cancelled = false;
    setChange((c) => ({ ...c, loading: true, error: false }));
    const to = Date.now();
    fetchCryptoHistory(asset, to - days * 86_400_000, to)
      .then((pts) => {
        if (cancelled) return;
        const first = pts?.[0]?.price;
        const last = pts?.[pts.length - 1]?.price;
        const ok = typeof first === 'number' && typeof last === 'number' && first > 0;
        setChange({ pct: ok ? (last / first - 1) * 100 : null, error: !ok, loading: false });
      })
      .catch(() => { if (!cancelled) setChange({ pct: null, error: true, loading: false }); });
    return () => { cancelled = true; };
  }, [asset, days]);

  const cashReturn = apy === null ? null : periodReturnPct(apy, days);
  const result = cashReturn !== null && change.pct !== null && defaultCapital > 0 ? buyingPower(defaultCapital, cashReturn, change.pct) : null;
  const sym = ASSET_SYMBOL[asset];
  const state = change.loading ? 'loading' : 'ready';

  return (
    <Surface className="space-y-5 p-4 md:p-5">
      <div>
        <h3 className="text-lg font-bold text-ink">قدرت خرید</h3>
        <p className="text-sm text-muted">
          اگر {toFaDigits(days)} روز پیش به‌جای دلار بازده‌دار، {sym} می‌خریدید، الان کدام بیشتر می‌ارزید؟
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <ChipGroup<Asset>
          label="دارایی مقایسه"
          value={asset}
          onChange={setAsset}
          options={[
            { value: 'solana', label: 'SOL' },
            { value: 'bitcoin', label: 'BTC' },
            { value: 'ethereum', label: 'ETH' }
          ]}
        />
        <ChipGroup<Period>
          label="دوره"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7', label: '۷ روز' },
            { value: '30', label: '۳۰ روز' },
            { value: '90', label: '۹۰ روز' },
            { value: '365', label: '۱ سال' }
          ]}
        />
      </div>

      {useMarket ? (
        <p className="text-sm text-muted">
          بازده نقد از بازار انتخاب‌شده: <bdi dir="ltr" className="font-semibold text-ink">{marketLabel}</bdi> با Net APY{' '}
          <PercentValue value={marketApy} />
        </p>
      ) : (
        <Field label="بازده سالانهٔ دلار شما (یک بازار را از جدول انتخاب کنید یا دستی وارد کنید)">
          <Input dir="ltr" inputMode="decimal" value={apyText} onChange={(e) => setApyText(e.target.value)} suffix="٪" />
        </Field>
      )}

      {change.error ? (
        <Notice tone="stale">قیمت تاریخی {sym} از کوین‌گکو دریافت نشد.</Notice>
      ) : (
        <MetricGrid cols={4}>
          <Metric label={`تغییر قیمت ${sym}`} value={<PercentValue value={change.pct} state={state} />} />
          <Metric label="بازده دلار در دوره" value={<PercentValue value={cashReturn} />} />
          <Metric
            label="اختلاف ارزش"
            value={<MoneyValue value={result?.differenceUsd ?? null} signed tone="auto" state={state} />}
            sub={result ? <>نقد <MoneyValue value={result.cashEnd} compact /> · {sym} <MoneyValue value={result.assetEnd} compact /></> : null}
          />
          <Metric
            label={`${sym} بیشتر که الان می‌شود خرید`}
            value={<PercentValue value={result?.extraUnitsPct ?? null} state={state} />}
          />
        </MetricGrid>
      )}
      <p className="text-xs text-subtle">
        بازده دوره به‌صورت مرکب از APY فعلی حساب شده؛ بازده واقعی گذشته ممکن است فرق داشته باشد. سرمایه همان عدد بالای صفحه است.
      </p>
    </Surface>
  );
}
