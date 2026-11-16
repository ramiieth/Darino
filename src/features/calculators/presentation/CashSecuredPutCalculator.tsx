/**
 * ماشین‌حساب و تحلیلگر فروش اختیار فروش با وثیقه نقدی (Cash-Secured Put — CSP)
 *
 * هدف: کمک به کاربر برای بررسی اینکه آیا با فروش اختیار فروش روی یک رمزارز و قفل‌کردن
 * وثیقه استیبل‌کوینی، دریافت پریمیوم و قیمت تمام‌شده خرید احتمالی برایش به‌صرفه است یا خیر.
 *
 * تمام محاسبات در `domain/cashSecuredPut.ts` انجام می‌شود و هیچ نرخ سود یا APR ثابتی
 * در کد ذخیره نشده است.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { useMarkets } from '@/features/markets/pipeline/useMarkets';
import { jsonGet, jsonSet } from '@/shared/lib/storage';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import {
  CSP_ASSET_PRESETS,
  CSP_NETWORK_PRESETS,
  buildDefaultScenarioPrices,
  buildRyskEarnUrl,
  calculateCsp,
  estimateRyskFeeUsd,
  evaluateCspScenario,
  type Moneyness
} from '@/features/calculators/domain';
import { parseNum } from './parse';

const STORE_KEY = 'calc:csp:v1';
const STALE_MS = 10 * 60_000;

interface SavedCsp {
  asset: string;
  networkId: string;
  customChainId: string;
  collateralToken: string;
  spotPrice: string;
  spotManual: boolean;
  strikePrice: string;
  expiryDate: string; // YYYY-MM-DD (ساعت تسویه Rysk: 08:00 UTC)
  expiryHourUtc: string;
  sizeMode: 'collateral' | 'quantity';
  collateralUsd: string;
  quantity: string;
  premiumMode: 'usd' | 'pct';
  premiumUsd: string;
  premiumPct: string;
  feeUsd: string;
  customScenarioPrice: string;
}

function defaultExpiryDate(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const DEFAULTS: SavedCsp = {
  asset: 'WHYPE',
  networkId: 'hyperevm',
  customChainId: '999',
  collateralToken: 'USDT0',
  spotPrice: '',
  spotManual: false,
  strikePrice: '',
  expiryDate: defaultExpiryDate(),
  expiryHourUtc: '08:00',
  sizeMode: 'collateral',
  collateralUsd: '',
  quantity: '',
  premiumMode: 'pct',
  premiumUsd: '',
  premiumPct: '',
  feeUsd: '0',
  customScenarioPrice: ''
};

const MONEYNESS_FA: Record<Moneyness, { label: string; tone: 'gain' | 'warn' | 'info' }> = {
  OTM: { label: 'خارج از سود (OTM)', tone: 'gain' },
  ATM: { label: 'روی قیمت اعمال (ATM)', tone: 'info' },
  ITM: { label: 'در سود / احتمال اعمال (ITM)', tone: 'warn' }
};

function parseExpiryUtcMs(dateStr: string, hourStr: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return NaN;
  const m = /^(\d{2}):(\d{2})$/.exec(hourStr.trim());
  const hh = m ? Math.min(23, Number(m[1])) : 8;
  const mm = m ? Math.min(59, Number(m[2])) : 0;
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
}

function fmtUsdSimple(v: number, digits = 2): string {
  return toFaDigits(v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
}

function fmtDurationFa(days: number, hours: number): string {
  if (days >= 1) {
    const wholeDays = Math.floor(days);
    const remHours = Math.round((days - wholeDays) * 24);
    return remHours > 0
      ? `${toFaDigits(wholeDays)} روز و ${toFaDigits(remHours)} ساعت`
      : `${toFaDigits(wholeDays)} روز`;
  }
  return `${toFaDigits(Math.max(1, Math.round(hours)))} ساعت`;
}

export function CashSecuredPutCalculator() {
  const [s, setS] = useState<SavedCsp>(() => ({ ...DEFAULTS, ...jsonGet<Partial<SavedCsp>>(STORE_KEY, {}) }));
  useEffect(() => jsonSet(STORE_KEY, s), [s]);

  const set = <K extends keyof SavedCsp>(k: K, v: SavedCsp[K]) => setS((p) => ({ ...p, [k]: v }));

  // دریافت قیمت زنده دارایی‌های پایه از کش بازارهای دارینو
  const liveMarkets = useMarkets('crypto_top_200');
  const assetUpper = s.asset.trim().toUpperCase() || 'ETH';
  const lookupSymbol = assetUpper === 'WHYPE' ? 'HYPE' : assetUpper;
  const liveAsset = useMemo(
    () => liveMarkets.assets.find((a) => a.symbol.toUpperCase() === lookupSymbol) ?? null,
    [liveMarkets.assets, lookupSymbol]
  );
  const livePrice = liveAsset?.price ?? null;
  const liveSyncedAt = liveMarkets.lastSyncAt ?? null;
  const liveStale = liveSyncedAt ? Date.now() - liveSyncedAt > STALE_MS : false;

  // همگام‌سازی خودکار قیمت زنده اگر کاربر به‌صورت دستی قفل نکرده باشد
  useEffect(() => {
    if (!s.spotManual && livePrice && livePrice > 0) {
      const formatted = livePrice >= 100 ? String(Math.round(livePrice * 100) / 100) : String(Number(livePrice.toFixed(4)));
      if (s.spotPrice !== formatted) {
        setS((p) => ({ ...p, spotPrice: formatted }));
      }
    }
  }, [livePrice, s.spotManual, lookupSymbol]);

  const netPreset = CSP_NETWORK_PRESETS.find((n) => n.id === s.networkId) ?? null;
  const chainId = netPreset ? netPreset.chainId : Math.max(1, Math.round(parseNum(s.customChainId) || 999));
  const networkLabel = netPreset ? netPreset.labelFa : `شبکه سفارشی (${chainId})`;

  const spotNum = parseNum(s.spotPrice);
  const strikeNum = parseNum(s.strikePrice);
  const expiryMs = parseExpiryUtcMs(s.expiryDate, s.expiryHourUtc);

  // محاسبه همگام تعداد واحد و وثیقه
  const quantityNum =
    s.sizeMode === 'quantity'
      ? parseNum(s.quantity)
      : strikeNum > 0
        ? parseNum(s.collateralUsd) / strikeNum
        : 0;
  const collateralNum =
    s.sizeMode === 'collateral'
      ? parseNum(s.collateralUsd)
      : strikeNum > 0
        ? parseNum(s.quantity) * strikeNum
        : 0;

  // محاسبه همگام پریمیوم دلاری و درصدی
  const premiumUsdNum =
    s.premiumMode === 'usd'
      ? parseNum(s.premiumUsd)
      : collateralNum > 0
        ? (collateralNum * parseNum(s.premiumPct)) / 100
        : 0;
  const feeNum = Math.max(0, parseNum(s.feeUsd) || 0);

  const calc = useMemo(
    () =>
      calculateCsp({
        asset: assetUpper,
        networkLabel,
        chainId,
        collateralToken: s.collateralToken.trim().toUpperCase() || 'USDT0',
        spotPrice: spotNum,
        strikePrice: strikeNum,
        quantity: quantityNum,
        premiumUsd: premiumUsdNum,
        feeUsd: feeNum,
        expiryTimestampMs: expiryMs
      }),
    [assetUpper, networkLabel, chainId, s.collateralToken, spotNum, strikeNum, quantityNum, premiumUsdNum, feeNum, expiryMs]
  );

  const [extraPrices, setExtraPrices] = useState<number[]>([]);
  const scenarioRows = useMemo(() => {
    if (!calc.valid) return [];
    const basePrices = buildDefaultScenarioPrices(strikeNum, calc.breakEvenPrice);
    const allPrices = [...new Set([...basePrices, ...extraPrices.filter((p) => p >= 0)])].sort((a, b) => b - a);
    return allPrices.map((p) => evaluateCspScenario({ strikePrice: strikeNum, quantity: quantityNum }, calc, p));
  }, [calc, strikeNum, quantityNum, extraPrices]);

  const ryskUrl = useMemo(
    () =>
      buildRyskEarnUrl({
        chainId,
        asset: assetUpper,
        collateralToken: s.collateralToken,
        expiryTimestampMs: expiryMs
      }),
    [chainId, assetUpper, s.collateralToken, expiryMs]
  );

  const addScenarioPrice = () => {
    const v = parseNum(s.customScenarioPrice);
    if (!(v >= 0) || s.customScenarioPrice.trim() === '') return;
    setExtraPrices((prev) => (prev.includes(v) ? prev : [...prev, v]));
    set('customScenarioPrice', '');
  };

  /** بارگذاری نمونه تاریخی اعلام‌شده برای آشنایی سریع کاربر (بدون قفل‌کردن ورودی‌ها) */
  const loadHistoricalSample = () => {
    const sampleExpiry = new Date(1795161600 * 1000).toISOString().slice(0, 10);
    setS((p) => ({
      ...p,
      asset: 'WHYPE',
      networkId: 'hyperevm',
      collateralToken: 'USDT0',
      spotManual: true,
      spotPrice: livePrice && lookupSymbol === 'HYPE' ? String(Number(livePrice.toFixed(2))) : '70',
      strikePrice: '66.50',
      expiryDate: sampleExpiry,
      expiryHourUtc: '08:00',
      sizeMode: 'collateral',
      collateralUsd: '3325',
      quantity: '50',
      premiumMode: 'pct',
      premiumPct: '1.8',
      premiumUsd: '59.85',
      feeUsd: '0'
    }));
  };

  const applyEstimatedRyskFee = () => {
    if (!(spotNum > 0) || !(quantityNum > 0)) return;
    const perUnit = quantityNum > 0 ? premiumUsdNum / quantityNum : 0;
    const est = estimateRyskFeeUsd(spotNum, perUnit, quantityNum);
    set('feeUsd', String(Math.round(est * 100) / 100));
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {/* معرفی کوتاه و ساده */}
      <Surface className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-base font-extrabold text-ink">فروش اختیار فروش با وثیقه نقدی (Cash-Secured Put)</h2>
            <p className="text-xs leading-6 text-muted">
              با فروش اختیار فروش، در ازای دریافت پریمیوم متعهد می‌شوید در صورت رسیدن شرایط اعمال در سررسید، دارایی موردنظر را با قیمت توافق‌شده خریداری کنید.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadHistoricalSample}>
              بارگذاری نمونهٔ WHYPE
            </Button>
            <a
              href={ryskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-control border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent/15"
            >
              مشاهده در Rysk Finance
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
        <p className="text-2xs leading-5 text-subtle">
          ⚠️ این ابزار صرفاً برای تحلیل اقتصادی و مدیریت ریسک است؛ هیچ سفارشی ثبت نمی‌شود و این استراتژی به‌هیچ‌وجه سپرده‌گذاری یا سود تضمینی نیست.
        </p>
      </Surface>

      {/* بخش ۱: تنظیمات دارایی، شبکه و قرارداد */}
      <Surface className="space-y-5 p-4 md:p-5">
        <div className="space-y-3">
          <p className="text-xs font-bold text-ink">۱. دارایی پایه، شبکه و وثیقه</p>
          <div className="flex flex-wrap gap-2">
            {CSP_ASSET_PRESETS.map((a) => {
              const active = assetUpper === a.symbol;
              return (
                <button
                  key={a.symbol}
                  type="button"
                  onClick={() =>
                    setS((p) => ({
                      ...p,
                      asset: a.symbol,
                      networkId: a.defaultNetworkId,
                      collateralToken: a.defaultNetworkId === 'hyperevm' ? 'USDT0' : 'USDC',
                      spotManual: false
                    }))
                  }
                  className={cn(
                    'inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors',
                    active ? 'border-accent bg-accent-soft text-accent' : 'border-divider bg-card text-muted hover:text-ink'
                  )}
                >
                  <AssetLogo symbol={a.symbol === 'WHYPE' ? 'HYPE' : a.symbol} kind="crypto" size={18} />
                  <bdi dir="ltr" className="font-latin font-bold">
                    {a.symbol}
                  </bdi>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="نماد دارایی پایه" hint="مثلاً WHYPE، ETH، BTC">
              <Input
                dir="ltr"
                value={s.asset}
                onChange={(e) => setS((p) => ({ ...p, asset: e.target.value.toUpperCase(), spotManual: false }))}
                placeholder="WHYPE"
              />
            </Field>
            <Field label="شبکه بلاکچین">
              <select
                value={s.networkId}
                onChange={(e) => {
                  const id = e.target.value;
                  const preset = CSP_NETWORK_PRESETS.find((n) => n.id === id);
                  setS((p) => ({
                    ...p,
                    networkId: id,
                    collateralToken: preset?.collaterals[0] ?? p.collateralToken
                  }));
                }}
                className="h-10 w-full rounded-control border border-divider bg-card px-3 text-xs font-semibold text-ink focus:border-accent focus:outline-none"
              >
                {CSP_NETWORK_PRESETS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.labelFa}
                  </option>
                ))}
                <option value="custom">شبکه دیگر (سفارشی)</option>
              </select>
            </Field>
            <Field label="توکن وثیقه (استیبل‌کوین)" hint="USDT0، USDC یا USDT">
              <Input
                dir="ltr"
                value={s.collateralToken}
                onChange={(e) => set('collateralToken', e.target.value.toUpperCase())}
                placeholder="USDT0"
              />
            </Field>
          </div>

          {s.networkId === 'custom' && (
            <Field label="شناسه شبکه (Chain ID)" className="max-w-xs">
              <Input dir="ltr" inputMode="numeric" value={s.customChainId} onChange={(e) => set('customChainId', e.target.value)} />
            </Field>
          )}
        </div>

        <div className="border-t border-divider pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-ink">۲. قیمت فعلی، قیمت اعمال (Strike) و سررسید</p>
            {livePrice ? (
              <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
                قیمت بازار دارینو ({lookupSymbol}):{' '}
                <b className="text-ink">
                  <MoneyValue value={livePrice} digits={2} />
                </b>
                {liveSyncedAt && (
                  <span className={cn(liveStale && 'text-warn font-semibold')}>
                    · بروزرسانی: {new Date(liveSyncedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                    {liveStale ? ' (قدیمی)' : ''}
                  </span>
                )}
                {s.spotManual && (
                  <button
                    type="button"
                    onClick={() => setS((p) => ({ ...p, spotManual: false }))}
                    className="inline-flex items-center gap-1 text-accent underline"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    همگام‌سازی
                  </button>
                )}
              </span>
            ) : (
              <span className="text-2xs text-warn">قیمت زنده برای {assetUpper} یافت نشد؛ لطفاً قیمت فعلی را دستی وارد کنید.</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="قیمت فعلی دارایی (دلار)" hint={s.spotManual ? 'ورود دستی' : 'از بازارهای دارینو'}>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.spotPrice}
                onChange={(e) => setS((p) => ({ ...p, spotManual: true, spotPrice: e.target.value }))}
                suffix="دلار"
                placeholder="0"
              />
            </Field>
            <Field label="قیمت اعمال (Strike)" hint="قیمتی که متعهد به خرید می‌شوید">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.strikePrice}
                onChange={(e) => set('strikePrice', e.target.value)}
                suffix="دلار"
                placeholder="0"
              />
            </Field>
            <Field label="تاریخ سررسید (میلادی)">
              <Input
                dir="ltr"
                type="date"
                value={s.expiryDate}
                onChange={(e) => set('expiryDate', e.target.value)}
              />
            </Field>
            <Field label="ساعت تسویه (UTC)" hint="در Rysk معمولاً 08:00 UTC">
              <Input
                dir="ltr"
                type="time"
                value={s.expiryHourUtc}
                onChange={(e) => set('expiryHourUtc', e.target.value)}
              />
            </Field>
          </div>
          {Number.isFinite(expiryMs) && (
            <p className="text-2xs text-subtle">
              زمان دقیق تسویه به وقت محلی شما:{' '}
              <b className="text-ink">
                {new Date(expiryMs).toLocaleString('fa-IR', {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </b>
            </p>
          )}
        </div>

        <div className="border-t border-divider pt-4 space-y-3">
          <p className="text-xs font-bold text-ink">۳. حجم وثیقه، مقدار تعهد و پریمیوم پیشنهادی پروتکل</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field
              label={`مقدار وثیقه (${s.collateralToken || 'USD'})`}
              hint={s.sizeMode === 'quantity' && strikeNum > 0 ? 'محاسبه‌شده از تعداد' : 'مبلغ استیبل‌کوین قفل‌شده'}
            >
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.sizeMode === 'collateral' ? s.collateralUsd : collateralNum > 0 ? String(Math.round(collateralNum * 100) / 100) : ''}
                onChange={(e) => setS((p) => ({ ...p, sizeMode: 'collateral', collateralUsd: e.target.value }))}
                suffix="دلار"
                placeholder="0"
              />
            </Field>
            <Field
              label={`تعداد واحد (${assetUpper})`}
              hint={s.sizeMode === 'collateral' && strikeNum > 0 ? 'محاسبه‌شده از وثیقه' : 'تعداد دارایی مورد تعهد'}
            >
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.sizeMode === 'quantity' ? s.quantity : quantityNum > 0 ? String(Number(quantityNum.toFixed(4))) : ''}
                onChange={(e) => setS((p) => ({ ...p, sizeMode: 'quantity', quantity: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field
              label="مبلغ پریمیوم (دلار)"
              hint={s.premiumMode === 'pct' && collateralNum > 0 ? 'محاسبه‌شده از درصد' : 'دریافتی در شروع'}
            >
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.premiumMode === 'usd' ? s.premiumUsd : premiumUsdNum > 0 ? String(Math.round(premiumUsdNum * 100) / 100) : ''}
                onChange={(e) => setS((p) => ({ ...p, premiumMode: 'usd', premiumUsd: e.target.value }))}
                suffix="دلار"
                placeholder="0"
              />
            </Field>
            <Field
              label="درصد پریمیوم دوره"
              hint={s.premiumMode === 'usd' && collateralNum > 0 ? 'نسبت به وثیقه' : 'مثلاً 1.8'}
            >
              <Input
                dir="ltr"
                inputMode="decimal"
                value={
                  s.premiumMode === 'pct'
                    ? s.premiumPct
                    : collateralNum > 0 && premiumUsdNum > 0
                      ? String(Number(((premiumUsdNum / collateralNum) * 100).toFixed(2)))
                      : ''
                }
                onChange={(e) => setS((p) => ({ ...p, premiumMode: 'pct', premiumPct: e.target.value }))}
                suffix="٪"
                placeholder="0"
              />
            </Field>
            <Field
              label="کارمزد معامله (اختیاری)"
              hint={
                <button type="button" onClick={applyEstimatedRyskFee} className="text-accent underline">
                  برآورد کارمزد Rysk
                </button>
              }
            >
              <Input
                dir="ltr"
                inputMode="decimal"
                value={s.feeUsd}
                onChange={(e) => set('feeUsd', e.target.value)}
                suffix="دلار"
                placeholder="0"
              />
            </Field>
          </div>
          <p className="text-2xs leading-5 text-subtle">
            توجه: Rysk Finance نرخ‌های خود را از طریق حراج زندهٔ RFQ (وب‌سوکت اختصاصی) قیمت‌گذاری می‌کند و API عمومی بدون کیف‌پول ندارد؛ بنابراین عدد پریمیوم را مستقیماً از صفحهٔ فرصت Rysk وارد کنید و با دکمهٔ «مشاهده در Rysk Finance» در بالا به صفحهٔ معامله بروید.
          </p>
        </div>
      </Surface>

      {/* نمایش خطاهای ورودی یا نتیجه محاسبات */}
      {!calc.valid ? (
        <Notice tone="info" title="برای محاسبه، اطلاعات قرارداد را وارد کنید">
          <ul className="list-disc space-y-1 ps-4 text-xs">
            {calc.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <>
          {/* کارت‌های کلیدی خلوت و رنگی مطابق Design System */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Surface className="border-divider p-3.5">
              <p className="text-2xs font-semibold text-muted">وثیقه موردنیاز (قفل‌شده)</p>
              <p className="mt-1 text-lg font-extrabold text-ink">
                <MoneyValue value={calc.requiredCollateralUsd} digits={2} />
              </p>
              <p className="mt-0.5 text-2xs text-subtle">
                برای {toFaDigits(Number(quantityNum.toFixed(4)))} واحد {assetUpper}
              </p>
            </Surface>

            <Surface className="border-gain/30 bg-gain/5 p-3.5">
              <p className="text-2xs font-semibold text-positive">پریمیوم خالص دریافتی</p>
              <p className="mt-1 text-lg font-extrabold text-positive">
                <MoneyValue value={calc.netPremiumUsd} signed digits={2} tone="gain" />
              </p>
              <p className="mt-0.5 text-2xs text-muted">
                بازده واقعی دوره: <PercentValue value={calc.netYieldPct} signed={false} tone="gain" digits={2} />
                {calc.feeUsd > 0 && ` (پس از ${fmtUsdSimple(calc.feeUsd)} دلار کارمزد)`}
              </p>
            </Surface>

            <Surface className="border-accent/30 bg-accent-soft/30 p-3.5">
              <p className="text-2xs font-semibold text-accent">قیمت تمام‌شده خالص / سربه‌سر</p>
              <p className="mt-1 text-lg font-extrabold text-ink">
                <MoneyValue value={calc.breakEvenPrice} digits={2} />
              </p>
              <p className="mt-0.5 text-2xs text-muted">
                پریمیوم هر واحد: <MoneyValue value={calc.netPremiumPerUnit} digits={2} />
                {calc.discountFromSpotPct > 0 && ` (${toFaDigits(calc.discountFromSpotPct.toFixed(1))}٪ پایین‌تر از اسپات)`}
              </p>
            </Surface>

            <Surface className="border-divider p-3.5">
              <p className="text-2xs font-semibold text-muted">APR سالانه‌شده (نشانگر مرجع)</p>
              <p className="mt-1 text-lg font-extrabold text-ink">
                {calc.aprPct === null ? '—' : <PercentValue value={calc.aprPct} signed={false} tone="none" digits={1} />}
              </p>
              <p className="mt-0.5 text-2xs text-subtle">
                قفل‌شدن سرمایه: {fmtDurationFa(calc.remainingDays, calc.remainingHours)} · غیرتضمینی
              </p>
            </Surface>
          </div>

          {/* نوار وضعیت فعلی معامله */}
          <Surface className="p-4">
            <KeyValueList
              dense
              rows={[
                {
                  label: 'وضعیت فعلی نسبت به قیمت اعمال (Moneyness)',
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Badge tone={MONEYNESS_FA[calc.currentMoneyness].tone}>{MONEYNESS_FA[calc.currentMoneyness].label}</Badge>
                      <span className="text-xs text-muted">
                        ({calc.strikeVsSpotPct >= 0 ? '+' : ''}
                        {toFaDigits(calc.strikeVsSpotPct.toFixed(1))}٪ نسبت به قیمت فعلی)
                      </span>
                    </span>
                  )
                },
                {
                  label: 'حداکثر سود ممکن (اگر قیمت در سررسید بالای Strike بماند)',
                  value: <MoneyValue value={calc.maxProfitUsd} signed digits={2} tone="gain" />
                },
                {
                  label: 'حداکثر زیان احتمالی (در سناریوی سقوط دارایی به صفر)',
                  value: <MoneyValue value={-calc.maxLossUsd} signed digits={2} tone="loss" />
                }
              ]}
            />
          </Surface>

          {/* بخش تحلیل سناریوها در سررسید */}
          <Surface className="space-y-3 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink">تحلیل سناریوهای قیمت در سررسید</h3>
                <p className="text-2xs leading-5 text-muted">
                  تفاوت بین «پریمیوم دریافتی»، «ارزش دارایی دریافتی» و «سود و زیان اقتصادی کل معامله» در هر قیمت فرضی:
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={s.customScenarioPrice}
                  onChange={(e) => set('customScenarioPrice', e.target.value)}
                  placeholder="قیمت فرضی"
                  className="w-28"
                />
                <Button size="sm" variant="ghost" icon={<Plus />} onClick={addScenarioPrice}>
                  افزودن
                </Button>
              </div>
            </div>

            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[600px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-2xs text-subtle">
                    <th className="pb-2 text-start font-semibold">قیمت در سررسید</th>
                    <th className="pb-2 text-start font-semibold">وضعیت اختیار</th>
                    <th className="pb-2 text-start font-semibold">تعهد خرید؟</th>
                    <th className="pb-2 text-end font-semibold">ارزش دارایی دریافتی</th>
                    <th className="pb-2 text-end font-semibold">سود/زیان خالص دلاری</th>
                    <th className="pb-2 text-end font-semibold">جبران افت با پریمیوم</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioRows.map((row) => (
                    <tr key={row.expiryPrice} className={cn(Math.abs(row.expiryPrice - calc.breakEvenPrice) < 0.05 && 'bg-accent-soft/25')}>
                      <td className="border-t border-divider py-2.5 font-bold text-ink">
                        <MoneyValue value={row.expiryPrice} digits={2} />
                        {Math.abs(row.expiryPrice - strikeNum) < 0.001 && (
                          <span className="ms-1.5 text-2xs font-normal text-accent">(Strike)</span>
                        )}
                      </td>
                      <td className="border-t border-divider py-2.5">
                        <Badge tone={MONEYNESS_FA[row.moneyness].tone}>{row.moneyness}</Badge>
                      </td>
                      <td className="border-t border-divider py-2.5 text-muted">
                        {row.assigned ? (
                          <span className="font-semibold text-warn">بله ({toFaDigits(Number(row.assetReceivedQty.toFixed(4)))} {assetUpper})</span>
                        ) : (
                          'خیر (وثیقه آزاد می‌شود)'
                        )}
                      </td>
                      <td className="border-t border-divider py-2.5 text-end text-ink">
                        {row.assigned ? <MoneyValue value={row.assetReceivedValueUsd} digits={2} /> : '—'}
                      </td>
                      <td className="border-t border-divider py-2.5 text-end font-bold">
                        <MoneyValue value={row.economicPnlUsd} signed digits={2} tone="auto" />
                        <span className="block text-2xs font-normal text-subtle">
                          ({row.economicReturnPct > 0 ? '+' : ''}
                          {toFaDigits(row.economicReturnPct.toFixed(2))}٪)
                        </span>
                      </td>
                      <td className="border-t border-divider py-2.5 text-end text-muted">
                        {row.premiumBufferPctOfDrop !== null ? (
                          <span>
                            {toFaDigits(row.premiumBufferPctOfDrop.toFixed(0))}٪ از افت ({fmtUsdSimple(row.premiumBufferUsd)} دلار)
                          </span>
                        ) : (
                          'بدون افت زیر Strike'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          {/* بخش اجباری مدیریت ریسک */}
          <Surface className="border-warn/40 bg-warn/5 p-4 space-y-2.5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
              <ShieldAlert className="h-4 w-4 text-warn" aria-hidden />
              مدیریت ریسک و محدودیت‌های معامله (پیش از اقدام حتماً بخوانید)
            </h3>
            <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
              <li>
                <b className="text-ink">قفل‌شدن وثیقه و عدم امکان خروج زودهنگام:</b> سرمایهٔ شما (<MoneyValue value={calc.requiredCollateralUsd} digits={2} />) تا زمان سررسید ({fmtDurationFa(calc.remainingDays, calc.remainingHours)}) در قرارداد هوشمند قفل می‌ماند. در پروتکل <b>Rysk V12</b> امکان بستن موقعیت پیش از سررسید وجود ندارد و تسویه به‌صورت خودکار پس از ساعت ۰۸:۰۰ UTC انجام می‌شود.
              </li>
              <li>
                <b className="text-ink">ریسک سقوط شدید قیمت دارایی:</b> اگر قیمت {assetUpper} در سررسید شدیداً پایین‌تر از <MoneyValue value={calc.breakEvenPrice} digits={2} /> برود، شما مجبور به خرید آن به قیمت توافقی <MoneyValue value={strikeNum} digits={2} /> هستید و زیان اقتصادی شما می‌تواند تا حداکثر <MoneyValue value={calc.maxLossUsd} digits={2} /> (کل وثیقه منهای پریمیوم) برسد.
              </li>
              <li>
                <b className="text-ink">ریسک قرارداد هوشمند و اوراکل:</b> قیمت تسویه بر پایه اوراکل پروتکل تعیین می‌شود؛ باگ قرارداد هوشمند یا اختلال اوراکل می‌تواند بر تسویه اثر بگذارد.
              </li>
              <li>
                <b className="text-ink">ریسک استیبل‌کوین وثیقه ({s.collateralToken}):</b> در صورت از دست رفتن برابری دلاری (De-peg) استیبل‌کوین وثیقه، ارزش واقعی سرمایه تحت تأثیر قرار می‌گیرد.
              </li>
            </ul>
          </Surface>
        </>
      )}

      {/* راهنمای اصطلاحات به زبان ساده (بسته در حالت عادی برای خلوت ماندن صفحه) */}
      <Disclosure summary="آموزش مفاهیم اختیار فروش (ITM، OTM، قیمت اعمال، سربه‌سر و APR) به زبان ساده">
        <dl className="space-y-2 text-xs leading-6 text-muted">
          <div>
            <dt className="inline font-bold text-ink">قیمت اعمال (Strike Price): </dt>
            <dd className="inline">قیمتی که شما توافق می‌کنید اگر قیمت بازار در سررسید از آن پایین‌تر آمد، دارایی را با آن نرخ بخرید.</dd>
          </div>
          <div>
            <dt className="inline font-bold text-ink">وثیقه (Collateral): </dt>
            <dd className="inline">مبلغ استیبل‌کوین (Strike × تعداد واحد) که برای تضمین توان خرید شما در قرارداد قفل می‌شود.</dd>
          </div>
          <div>
            <dt className="inline font-bold text-ink">پریمیوم (Premium): </dt>
            <dd className="inline">پولی که همان ابتدای معامله در ازای پذیرفتن تعهد خرید دریافت می‌کنید و در هر صورت برای شما می‌ماند.</dd>
          </div>
          <div>
            <dt className="inline font-bold text-ink">تفاوت OTM و ITM در اختیار فروش: </dt>
            <dd className="inline">
              اگر قیمت بازار بالاتر از Strike باشد، اختیار <b>OTM (خارج از سود)</b> است؛ یعنی خریدار اختیار را اعمال نمی‌کند و وثیقه + پریمیوم دست شما می‌ماند. اگر قیمت بازار پایین‌تر از Strike بیاید، اختیار <b>ITM (در سود برای خریدار)</b> می‌شود و تعهد خرید دارایی برای شما فعال می‌شود.
            </dd>
          </div>
          <div>
            <dt className="inline font-bold text-ink">نقطه سربه‌سر (Break-even): </dt>
            <dd className="inline">قیمتی برابر با (Strike منهای پریمیوم خالص هر واحد). تا وقتی قیمت سررسید بالاتر از این نقطه بماند، معامله در مجموع سودده است.</dd>
          </div>
          <div>
            <dt className="inline font-bold text-ink">APR سالانه‌شده: </dt>
            <dd className="inline">
              نشان می‌دهد اگر همین درصد پریمیوم در طول یک سال تکرار شود بازده سالانه چقدر است؛ این عدد فقط معیار مقایسه است و <b>به‌معنی سود قطعی یا بدون ریسک نیست</b>.
            </dd>
          </div>
        </dl>
      </Disclosure>
    </div>
  );
}
