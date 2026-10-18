/**
 * ⑦ ماشین‌حساب پوشش ریسک (هج) — اسپات + Short خطی (USDT-M) روی همان دارایی در فیوچرز
 * INPUT (اتصال به حساب · بازار · پرتفوی · سناریو · هزینه‌ها)
 * → پوزیشن واقعی → ۱ خلاصهٔ مالی → ۲ ساختار پرتفوی → ۳ سناریوها → ۴ مقایسه با بدون هج (سرمایهٔ یکسان) → ۵ جزئیات محاسبات
 * محاسبات در domain (calcHedge). اتصال فقط‌خواندنی به حساب لایتر/آرکوس (hedgeAccounts) نقطهٔ شروع را واقعی می‌کند:
 * ارزش اسمی Short، ارزش خالص حساب، کارمزد تیکر، فاندینگ لحظه‌ای، اسپات لایتر و قیمت لیکویید صرافی. هیچ سفارشی ثبت نمی‌شود.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Lightbulb, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { usePublishInsight } from '@/shared/assistant/insights';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { calcHedge, hedgePayoff, type Coin, type HedgeInput, type HedgeResult, type HedgeScenario } from '@/features/calculators/domain';
import { HEDGE_COINS, DEFAULT_HEDGE_COIN } from '@/features/calculators/data/hedgeCoins';
import {
  HEDGE_VENUE_LABELS,
  hedgeFill,
  useHedgeAccount,
  useLinkedHedgeAccounts,
  type HedgeAccountData,
  type HedgeShort,
  type HedgeSnapshot,
  type LinkedHedgeAccount
} from '@/features/calculators/data/hedgeAccounts';
import { parseNum } from '../parse';
import { CoinLogo, CoinPicker } from './CoinPicker';
import { PayoffChart } from './PayoffChart';

type Sizing = 'usd' | 'pct';
type Source = 'input' | 'live' | 'derived' | 'estimate' | 'unknown';
/** فیلدهایی که از حساب متصل پر می‌شوند */
type LiveField = 'spot' | 'short' | 'collateral' | 'fee' | 'funding';

const SOURCE: Record<Source, { label: string; tone: Tone }> = {
  input: { label: 'ورودی شما', tone: 'neutral' },
  live: { label: 'زنده از حساب', tone: 'brand' },
  derived: { label: 'محاسبه‌شده', tone: 'info' },
  estimate: { label: 'تخمینی', tone: 'warn' },
  unknown: { label: 'نامشخص', tone: 'warn' }
};

const QUICK_RATIOS = [25, 50, 75, 100];
const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const fmtPct = (v: number) => `${toFaDigits(pctFmt.format(v))}٪`;
/** مقدار عددی برای پرکردن فیلد (بدون نماد علمی) */
const fieldValue = (v: number) => String(Math.round(v * 100) / 100);

function Tag({ kind }: { kind: Source }) {
  return (
    <Badge tone={SOURCE[kind].tone} className="text-2xs">
      {SOURCE[kind].label}
    </Badge>
  );
}

function Unknown() {
  return <span className="text-sm font-semibold text-warn">نامشخص</span>;
}

/** گروه ورودی‌ها با عنوان کوچک */
function InputGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="space-y-4 border-t border-divider pt-4 first:border-t-0 first:pt-0">
      <p aria-hidden className="text-2xs font-bold text-subtle">
        {title}
      </p>
      {children}
    </div>
  );
}

export function HedgeCalculator() {
  const [coin, setCoin] = useState<Coin>(DEFAULT_HEDGE_COIN);
  const [spot, setSpot] = useState('1000');
  const [sizing, setSizing] = useState<Sizing>('usd');
  const [shortUsd, setShortUsd] = useState('300');
  const [ratio, setRatio] = useState('30');
  const [collateral, setCollateral] = useState('300');
  const [cash, setCash] = useState('');
  const [drop, setDrop] = useState('25');
  const [rise, setRise] = useState('18');
  const [fee, setFee] = useState('0');
  const [slippage, setSlippage] = useState('0');
  const [funding, setFunding] = useState('0');
  const [days, setDays] = useState('30');
  const [other, setOther] = useState('0');

  // اتصال به حساب
  const accounts = useLinkedHedgeAccounts();
  const [accountId, setAccountId] = useState('');
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const accountData = useHedgeAccount(account);
  const [picked, setPicked] = useState<{ accountId: string; sub: number; market: string } | null>(null);
  const [live, setLive] = useState<ReadonlySet<LiveField>>(new Set());
  const [liqRise, setLiqRise] = useState<number | null>(null);
  /** ویرایش دستی، برچسب «زنده» همان فیلد را برمی‌دارد */
  const track = (f: LiveField, set: (s: string) => void) => (s: string) => {
    setLive((prev) => {
      if (!prev.has(f)) return prev;
      const next = new Set(prev);
      next.delete(f);
      return next;
    });
    set(s);
  };
  const pickedSnap = picked && picked.accountId === accountId ? accountData.snapshots.find((s) => s.subAccount === picked.sub) ?? null : null;
  const pickedShort = pickedSnap?.shorts.find((s) => s.market === picked!.market) ?? null;

  const applyFill = (snap: HedgeSnapshot, short: HedgeShort) => {
    const f = hedgeFill(snap, short, accountData.markets.find((m) => m.base.toUpperCase() === short.base));
    const filled = new Set<LiveField>();
    const match = HEDGE_COINS.find((c) => c.symbol.toUpperCase() === short.base);
    if (match) setCoin(match);
    setSizing('usd');
    if (f.shortNotional !== null) {
      setShortUsd(fieldValue(f.shortNotional));
      filled.add('short');
    }
    if (f.collateral !== null) {
      setCollateral(fieldValue(f.collateral));
      filled.add('collateral');
    }
    if (f.feePct !== null) {
      setFee(String(Number(Math.max(0, f.feePct).toFixed(4))));
      filled.add('fee');
    }
    if (f.fundingPct8h !== null) {
      setFunding(String(Number(f.fundingPct8h.toFixed(6))));
      filled.add('funding');
    }
    if (f.spotUsd !== null) {
      setSpot(fieldValue(f.spotUsd));
      filled.add('spot');
    }
    setLive(filled);
    setLiqRise(f.liquidationRisePct);
    setPicked({ accountId, sub: snap.subAccount, market: short.market });
  };
  const disconnect = (id: string) => {
    setAccountId(id);
    setPicked(null);
    setLive(new Set());
    setLiqRise(null);
  };

  /** خالی = مقدار پیش‌فرض صریح (۰)، نامعتبر = NaN */
  const opt = (s: string) => (s.trim() === '' ? 0 : parseNum(s));
  const v = {
    spot: parseNum(spot),
    shortUsd: parseNum(shortUsd),
    ratio: parseNum(ratio),
    collateral: collateral.trim() === '' ? null : parseNum(collateral),
    cash: opt(cash),
    drop: parseNum(drop),
    rise: parseNum(rise),
    fee: opt(fee),
    slippage: opt(slippage),
    funding: opt(funding),
    days: opt(days),
    other: opt(other)
  };
  const shortNotional = sizing === 'usd' ? v.shortUsd : (v.spot * v.ratio) / 100;
  const errors = {
    spot: !(v.spot > 0) ? 'ارزش اسپات باید بیشتر از صفر باشد.' : null,
    short:
      sizing === 'usd'
        ? !(v.shortUsd >= 0) ? 'ارزش اسمی Short نمی‌تواند منفی یا خالی باشد.' : null
        : !(v.ratio >= 0) ? 'نسبت هج نمی‌تواند منفی یا خالی باشد.' : null,
    collateral:
      v.collateral === null
        ? null
        : !(v.collateral >= 0)
          ? 'عدد مثبت وارد کنید یا خالی بگذارید.'
          : v.collateral === 0 && shortNotional > 0
            ? 'برای باز کردن Short وثیقه لازم است.'
            : null,
    cash: !(v.cash >= 0) ? 'وجه نقد نمی‌تواند منفی باشد.' : null,
    drop: !(v.drop >= 0 && v.drop <= 100) ? 'ریزش بین ۰ تا ۱۰۰٪.' : null,
    rise: !(v.rise >= 0) ? 'رشد نمی‌تواند منفی یا خالی باشد.' : null,
    fee: !(v.fee >= 0) ? 'کارمزد نمی‌تواند منفی باشد.' : null,
    slippage: !(v.slippage >= 0) ? 'اسلیپیج نمی‌تواند منفی باشد.' : null,
    funding: !Number.isFinite(v.funding) ? 'عدد معتبر وارد کنید.' : null,
    days: !(v.days >= 0) ? 'مدت نمی‌تواند منفی باشد.' : null,
    other: !(v.other >= 0) ? 'هزینه نمی‌تواند منفی باشد.' : null
  };
  const valid = Object.values(errors).every((e) => e === null);
  // قیمت لیکویید صرافی فقط وقتی معتبر است که اندازه و وثیقه همان مقادیر حساب باشند
  const exchangeLiq = live.has('short') && live.has('collateral') && sizing === 'usd' ? liqRise : null;

  const input = useMemo<HedgeInput | null>(
    () =>
      valid
        ? {
            spot: v.spot,
            shortNotional,
            futuresCollateral: v.collateral,
            cash: v.cash,
            dropPct: v.drop,
            risePct: v.rise,
            feePct: v.fee,
            slippagePct: v.slippage,
            fundingPct8h: v.funding,
            holdDays: v.days,
            otherCosts: v.other,
            liquidationRisePct: exchangeLiq
          }
        : null,
    [valid, v.spot, shortNotional, v.collateral, v.cash, v.drop, v.rise, v.fee, v.slippage, v.funding, v.days, v.other, exchangeLiq]
  );
  const result = useMemo(() => (input ? calcHedge(input) : null), [input]);

  usePublishInsight(
    'calculatorHedge',
    `پوشش ریسک ${coin.name}`,
    result
      ? {
          hedgeRatioPct: result.ratioPct,
          dropTotal: result.drop.totalEnd,
          dropDiff: result.drop.hedgeEffectNet,
          riseTotal: result.rise.totalEnd,
          riseDiff: result.rise.hedgeEffectNet
        }
      : null
  );

  /** دکمهٔ نسبت سریع: اندازهٔ Short = اسپات × p٪ (برچسب «زنده» اندازه برداشته می‌شود) */
  const applyRatio = (p: number) => {
    if (sizing === 'pct') setRatio(String(p));
    else if (v.spot > 0) track('short', setShortUsd)(fieldValue((v.spot * p) / 100));
  };

  const switchSizing = (next: Sizing) => {
    if (next === sizing) return;
    // مقدار معادل را منتقل کن تا با تغییر روش، اندازهٔ Short عوض نشود
    if (next === 'pct' && v.spot > 0 && v.shortUsd >= 0) setRatio(fieldValue((v.shortUsd / v.spot) * 100));
    if (next === 'usd' && v.spot > 0 && v.ratio >= 0) setShortUsd(fieldValue((v.spot * v.ratio) / 100));
    setSizing(next);
  };

  const num = (value: string, set: (s: string) => void, suffix: string, placeholder?: string) => ({
    dir: 'ltr' as const,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    value,
    suffix,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value)
  });

  const fundingApr = Number.isFinite(v.funding) ? v.funding * 3 * 365 : null;

  const inputs = (
    <>
      <InputGroup title="اتصال به حساب (فقط‌خواندنی)">
        <AccountLink
          accounts={accounts}
          accountId={accountId}
          onAccount={disconnect}
          data={accountData}
          picked={pickedShort && pickedSnap ? { sub: pickedSnap.subAccount, market: pickedShort.market } : null}
          onPick={applyFill}
        />
      </InputGroup>

      <InputGroup title="بازار">
        <Disclosure
          summary={
            <span className="inline-flex items-center gap-2">
              <CoinLogo coin={coin} size={20} />
              {coin.name} (<bdi dir="ltr">{coin.symbol}</bdi>) — تغییر ارز
            </span>
          }
        >
          <CoinPicker coins={HEDGE_COINS} value={coin} onChange={setCoin} />
        </Disclosure>
      </InputGroup>

      <InputGroup title="پرتفوی">
        <div className="flex items-center gap-3">
          <span className="rounded-full p-0.5" style={{ boxShadow: `0 0 0 2px ${coin.color}40` }}>
            <CoinLogo coin={coin} size={36} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{coin.name}</p>
            <p className="text-xs text-muted">
              اسپات و Short روی{' '}
              <bdi dir="ltr" className="font-latin font-semibold text-ink">
                {coin.symbol}/USDT
              </bdi>
            </p>
          </div>
        </div>
        <Field label="ارزش دارایی اسپات" error={errors.spot}>
          <Input {...num(spot, track('spot', setSpot), 'دلار')} />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">اندازهٔ Short بر اساس</p>
          <SegmentedControl<Sizing>
            label="اندازهٔ Short بر اساس"
            fill
            value={sizing}
            onChange={switchSizing}
            options={[
              { value: 'usd', label: 'ارزش اسمی (دلار)' },
              { value: 'pct', label: 'نسبت هج (٪)' }
            ]}
          />
        </div>
        {sizing === 'usd' ? (
          <Field
            label="ارزش اسمی پوزیشن Short"
            error={errors.short}
            labelAside={result?.ratioPct != null ? <Badge tone="neutral">نسبت هج {fmtPct(result.ratioPct)}</Badge> : undefined}
          >
            <Input {...num(shortUsd, track('short', setShortUsd), 'دلار')} />
          </Field>
        ) : (
          <Field
            label="نسبت هج (ارزش Short ÷ ارزش اسپات)"
            error={errors.short}
            labelAside={result ? <Badge tone="neutral">Short {toFaDigits(pctFmt.format(result.shortNotional))} دلار</Badge> : undefined}
          >
            <Input {...num(ratio, setRatio, '٪')} />
          </Field>
        )}
        <div className="-mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="نسبت هج سریع">
          <span className="text-2xs text-subtle">نسبت سریع:</span>
          {QUICK_RATIOS.map((p) => {
            const active = result?.ratioPct != null && Math.abs(result.ratioPct - p) < 0.05;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => applyRatio(p)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors duration-fast',
                  active ? 'border-accent bg-accent-soft text-accent' : 'border-divider text-muted hover:border-divider-strong hover:text-ink'
                )}
              >
                {toFaDigits(p)}٪
              </button>
            );
          })}
        </div>
        <Field label="وثیقهٔ واقعی حساب فیوچرز" error={errors.collateral}>
          <Input {...num(collateral, track('collateral', setCollateral), 'دلار', 'نامشخص')} />
        </Field>
        <p className="-mt-3 text-2xs leading-5 text-subtle">
          مبلغی که واقعاً به حساب فیوچرز واریز کرده‌اید، نه ارزش اسمی Short. با اهرم ۱ برابر ارزش اسمی است؛ با اهرم ۳ یک‌سوم آن. خالی = نامشخص (سرمایهٔ کل حساب
          نمی‌شود).
        </p>
        <Field label="وجه نقد مستقل (اختیاری)" error={errors.cash}>
          <Input {...num(cash, setCash, 'دلار', '0')} />
        </Field>
      </InputGroup>

      <InputGroup title="سناریوی بازار">
        <div className="grid grid-cols-2 gap-4">
          <Field label="ریزش بازار" error={errors.drop}>
            <Input {...num(drop, setDrop, '٪')} />
          </Field>
          <Field label="رشد بازار" error={errors.rise}>
            <Input {...num(rise, setRise, '٪')} />
          </Field>
        </div>
      </InputGroup>

      <InputGroup title="هزینه‌ها و فاندینگ">
        <div className="grid grid-cols-2 gap-4">
          <Field label="کارمزد هر معامله" error={errors.fee}>
            <Input {...num(fee, track('fee', setFee), '٪')} />
          </Field>
          <Field label="اسلیپیج هر معامله" error={errors.slippage}>
            <Input {...num(slippage, setSlippage, '٪')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="نرخ فاندینگ هر ۸ ساعت" error={errors.funding}>
            <Input {...num(funding, track('funding', setFunding), '٪')} />
          </Field>
          <Field label="مدت نگهداری" error={errors.days}>
            <Input {...num(days, setDays, 'روز')} />
          </Field>
        </div>
        <p className="-mt-3 text-2xs leading-5 text-subtle">
          فاندینگ مثبت = Short دریافت می‌کند، منفی = می‌پردازد
          {fundingApr !== null && fundingApr !== 0 && <> (حدود {fmtPct(fundingApr)} سالانه)</>}. کارمزد روی ورود و خروج Short؛ کارمزد صرافی خود را وارد کنید.
        </p>
        <Field label="سایر هزینه‌ها (واریز، برداشت، گس)" error={errors.other}>
          <Input {...num(other, setOther, 'دلار')} />
        </Field>
      </InputGroup>
    </>
  );

  return (
    <HedgeShell inputs={inputs}>
      {!result ? (
        <div className="flex min-h-[12rem] items-center justify-center rounded-card border border-dashed border-divider-strong px-6 py-10 text-center text-sm text-muted">
          ورودی‌های قرمزشده را اصلاح کنید تا نتیجه محاسبه شود.
        </div>
      ) : (
        <>
          {account && pickedSnap && pickedShort && (
            <LivePosition
              account={account}
              snap={pickedSnap}
              short={pickedShort}
              data={accountData}
              onRefill={() => applyFill(pickedSnap, pickedShort)}
              liqUsed={exchangeLiq !== null}
            />
          )}
          <Outcome r={result} coin={coin} live={live.size > 0} />
          {result.futuresCollateral === null && (
            <Notice tone="warn" title="وثیقهٔ حساب فیوچرز نامشخص است">
              سرمایهٔ اولیهٔ کل، موجودی فیوچرز، سرمایهٔ نهایی و بازده بدون آن حساب نمی‌شوند و از روی ارزش اسمی Short حدس زده نمی‌شوند. اثر مالی هج و ارزش اسپات همچنان
              معلوم است.
            </Notice>
          )}
          {result.rise.liquidated && (
            <Notice tone="error" title={`با رشد ${fmtPct(result.rise.movePct)} پوزیشن Short لیکویید می‌شود`}>
              {exchangeLiq !== null ? 'قیمت لیکویید گزارش‌شدهٔ صرافی رد می‌شود' : 'موجودی حساب فیوچرز به صفر می‌رسد'} و کل وثیقه از دست رفته فرض می‌شود. وثیقهٔ بیشتر
              (اهرم کمتر) یا Short کوچک‌تر این حد را دورتر می‌کند.
            </Notice>
          )}
          {result.ratioPct !== null && result.ratioPct > 100 && (
            <Notice tone="warn" title="Short بزرگ‌تر از اسپات است">
              مواجههٔ خالص پرتفوی منفی (خالص Short) است؛ این دیگر فقط پوشش ریسک نیست و در رشد بازار زیان می‌دهد.
            </Notice>
          )}
          <Payoff input={input!} r={result} />
          <Composition r={result} sizing={sizing} live={live} exchangeLiq={exchangeLiq !== null} />
          <DetailTable r={result} />
          <Details />
        </>
      )}
    </HedgeShell>
  );
}

/**
 * چیدمان CalcShell، ولی پنل ورودی‌ها در دسکتاپ اسکرول خودش را دارد —
 * ورودی‌های این بخش بلندتر از صفحه‌اند و sticky بدون سقف ارتفاع، فیلدهای پایین را پنهان می‌کند.
 */
function HedgeShell({ inputs, children }: { inputs: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <section aria-label="ورودی‌ها" className="min-w-0 lg:col-span-5">
        <Surface className="space-y-5 p-4 md:p-5 lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:overscroll-contain">
          <h2 className="text-sm font-bold text-ink">ورودی‌ها</h2>
          {inputs}
        </Surface>
      </section>
      <section aria-label="نتیجه" aria-live="polite" className="min-w-0 space-y-5 lg:col-span-7">
        {children}
      </section>
    </div>
  );
}

/* ---------------- اتصال به حساب ---------------- */

const fmtTime = (ms: number) => toFaDigits(new Date(ms).toLocaleTimeString('fa-IR-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

function AccountLink({
  accounts,
  accountId,
  onAccount,
  data,
  picked,
  onPick
}: {
  accounts: LinkedHedgeAccount[];
  accountId: string;
  onAccount: (id: string) => void;
  data: HedgeAccountData;
  picked: { sub: number; market: string } | null;
  onPick: (snap: HedgeSnapshot, short: HedgeShort) => void;
}) {
  if (!accounts.length) {
    return (
      <p className="text-xs leading-6 text-muted">
        هنوز حسابی ثبت نشده است. آدرس عمومی حساب را در بخش «لایتر»، «لایتر رابین‌هود» یا «آرکوس» اضافه کنید تا پوزیشن واقعی این‌جا خوانده شود. تا آن زمان اعداد را دستی
        وارد کنید.
      </p>
    );
  }
  const multi = data.snapshots.length > 1;
  return (
    <div className="space-y-3">
      <Field label="حساب">
        <Select value={accountId} onChange={(e) => onAccount(e.target.value)}>
          <option value="">بدون اتصال (ورود دستی)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {HEDGE_VENUE_LABELS[a.venue]} · {a.label}
            </option>
          ))}
        </Select>
      </Field>
      {accountId !== '' &&
        (data.status === 'loading' ? (
          <p className="text-xs text-muted">در حال خواندن حساب…</p>
        ) : data.status === 'error' ? (
          <p className="text-xs text-warn">حساب خوانده نشد؛ کمی بعد دوباره امتحان کنید. اعداد فعلی دستی هستند.</p>
        ) : data.snapshots.every((s) => !s.shorts.length) ? (
          <p className="text-xs leading-6 text-muted">پوزیشن Short بازی در این حساب نیست. می‌توانید Short فرضی را دستی وارد کنید.</p>
        ) : (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">پوزیشن‌های Short این حساب</p>
            <ul className="divide-y divide-divider rounded-field border border-divider">
              {data.snapshots.flatMap((snap) =>
                snap.shorts.map((s) => {
                  const active = picked?.sub === snap.subAccount && picked.market === s.market;
                  return (
                    <li key={`${snap.subAccount}:${s.market}`}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onPick(snap, s)}
                        className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm transition-colors duration-fast', active ? 'bg-accent-soft' : 'hover:bg-surface-2/60')}
                      >
                        <span className="min-w-0 flex-1">
                          <bdi dir="ltr" className={cn('font-latin font-bold', active ? 'text-accent' : 'text-ink')}>
                            {s.market}
                          </bdi>
                          {multi && <span className="ms-1.5 text-2xs text-subtle">زیرحساب {toFaDigits(snap.subAccount)}</span>}
                          <span className="block text-2xs text-muted">
                            ورود {s.entry === null ? '—' : <MoneyValue value={s.entry} />}
                          </span>
                        </span>
                        <span className="shrink-0 text-end">
                          <MoneyValue value={s.notional} digits={2} className="font-semibold" />
                          <span className="block text-2xs text-accent">{active ? 'استفاده شد' : 'استفاده'}</span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {data.fetchedAt && <p className="mt-1 text-2xs text-subtle">به‌روزرسانی {fmtTime(data.fetchedAt)} · هر ۳۰ ثانیه</p>}
          </div>
        ))}
    </div>
  );
}

function LivePosition({
  account,
  snap,
  short,
  data,
  onRefill,
  liqUsed
}: {
  account: LinkedHedgeAccount;
  snap: HedgeSnapshot;
  short: HedgeShort;
  data: HedgeAccountData;
  onRefill: () => void;
  liqUsed: boolean;
}) {
  const market = data.markets.find((m) => m.base.toUpperCase() === short.base);
  const funding8h = market?.fundingHourly == null ? null : market.fundingHourly * 8 * 100;
  const others = snap.positionCount - 1;
  return (
    <Surface as="section" aria-labelledby="hedge-live" className="space-y-3 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="hedge-live" className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
            پوزیشن واقعی Short <Tag kind="live" />
          </h3>
          <p className="mt-0.5 text-2xs text-subtle">
            {HEDGE_VENUE_LABELS[account.venue]} · {account.label} · <bdi dir="ltr">{short.market}</bdi>
            {data.fetchedAt && <> · {fmtTime(data.fetchedAt)}</>}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-accent" icon={<RefreshCw />} onClick={onRefill}>
          پر کردن دوباره از حساب
        </Button>
      </div>
      <KeyValueList
        dense
        rows={[
          { label: 'ارزش اسمی فعلی', value: <MoneyValue value={short.notional} digits={2} /> },
          { label: 'قیمت ورود', value: <MoneyValue value={short.entry} /> },
          { label: 'قیمت مارک فعلی', value: <MoneyValue value={short.mark} /> },
          {
            label: 'سود/زیان باز (تحقق‌نیافته)',
            value: <MoneyValue value={short.unrealizedPnl} signed tone="auto" digits={2} />,
            hint: 'عدد صرافی؛ در ارزش خالص حساب هست و دوباره اضافه نمی‌شود'
          },
          { label: 'ارزش خالص حساب (equity)', value: <MoneyValue value={snap.equity} digits={2} /> },
          {
            label: 'قیمت لیکویید صرافی',
            value: short.liquidation === null ? <span className="text-xs text-subtle">گزارش نمی‌شود</span> : <MoneyValue value={short.liquidation} />,
            hint: short.liquidation !== null && liqUsed ? 'در سناریوی رشد به کار رفته' : undefined
          },
          { label: 'فاندینگ لحظه‌ای هر ۸ ساعت', value: funding8h === null ? '—' : <PercentValue value={funding8h} digits={4} />, hint: 'مثبت = Short دریافت می‌کند؛ نرخ عوض می‌شود' },
          { label: 'کارمزد تیکر صرافی', value: market?.takerFeePct == null ? '—' : <PercentValue value={market.takerFeePct} digits={3} signed={false} tone="none" /> }
        ]}
      />
      {others > 0 && (
        <Notice tone="warn" title={`این حساب ${toFaDigits(others)} پوزیشن دیگر هم دارد`}>
          ارزش خالص حساب پشتوانهٔ همهٔ پوزیشن‌هاست و سناریو فقط همین Short را حرکت می‌دهد؛ موجودی نهایی حساب تقریبی است.
        </Notice>
      )}
      {short.marginMode === 'ISOLATED' && (
        <Notice tone="warn" title="مارجین ایزوله">
          وثیقهٔ واقعی این پوزیشن کمتر از ارزش خالص کل حساب است؛ عدد وثیقه را با مارجین همین پوزیشن اصلاح کنید.
        </Notice>
      )}
      {snap.longBases.includes(short.base) && (
        <Notice tone="warn" title="روی همین دارایی Long هم دارید">اثر آن در این ماشین‌حساب نیست.</Notice>
      )}
      {account.venue === 'arcus' && <p className="text-2xs leading-5 text-subtle">اسپات آرکوس روی کیف پول است و خوانده نمی‌شود؛ ارزش اسپات را دستی وارد کنید.</p>}
    </Surface>
  );
}

/* ---------------- قاب مراحل ---------------- */

/** قاب یکسان همهٔ بخش‌های نتیجه: شمارهٔ مرحله + تیتر به شکل سؤال + یک جملهٔ توضیح */
function Step({ n, id, title, sub, aside, focal, children }: { n: number; id: string; title: string; sub?: ReactNode; aside?: ReactNode; focal?: boolean; children: ReactNode }) {
  return (
    <Surface as="section" variant={focal ? 'focal' : undefined} aria-labelledby={id} className={cn('space-y-4', focal ? 'p-5 md:p-6' : 'p-4 md:p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {toFaDigits(n)}
          </span>
          <div className="min-w-0">
            <h3 id={id} className="text-sm font-bold text-ink md:text-base">
              {title}
            </h3>
            {sub && <p className="mt-0.5 text-xs leading-6 text-muted">{sub}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </Surface>
  );
}

function ScenarioTitle({ s }: { s: HedgeScenario }) {
  const down = s.movePct < 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      {down ? <TrendingDown aria-hidden className="h-4 w-4 text-negative" /> : <TrendingUp aria-hidden className="h-4 w-4 text-positive" />}
      {down ? 'ریزش' : 'رشد'} {fmtPct(Math.abs(s.movePct))}
    </span>
  );
}

/** نوار مقدار تک‌رنگ روی شیار — هویت با متن کنارش است، نه رنگ */
function MagnitudeBar({ value, max, tone = 'accent', textured = false }: { value: number; max: number; tone?: 'accent' | 'gold'; textured?: boolean }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div
        className={cn('h-full rounded-full', tone === 'accent' ? 'bg-chart-1 text-chart-1' : 'bg-gold/80 text-gold')}
        style={{
          width: `${w}%`,
          ...(textured ? { backgroundColor: 'transparent', backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 3px, transparent 3px 6px)' } : {})
        }}
      />
    </div>
  );
}

/* ---------------- ۱. هج با پرتفوی شما چه می‌کند؟ ---------------- */

function Outcome({ r, coin, live }: { r: HedgeResult; coin: Coin; live: boolean }) {
  const ends = [r.drop.totalEnd, r.drop.unhedgedEnd, r.rise.totalEnd, r.rise.unhedgedEnd].filter((v): v is number => v !== null);
  const max = Math.max(...ends, 0);
  return (
    <Step
      n={1}
      id="hedge-outcome"
      focal
      title="هج با پرتفوی شما چه می‌کند؟"
      sub={
        <>
          سرمایهٔ اولیهٔ کل{' '}
          {r.totalStart === null ? <span className="font-semibold text-warn">نامشخص</span> : <MoneyValue value={r.totalStart} digits={2} className="font-semibold text-ink" />} ·
          اسپات + وثیقهٔ حساب فیوچرز + وجه نقد
        </>
      }
      aside={
        <span className="flex shrink-0 items-center gap-2">
          <CoinLogo coin={coin} size={32} />
          <bdi dir="ltr" className="font-latin text-sm font-bold text-ink">
            {coin.symbol}
          </bdi>
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <OutcomeTile s={r.drop} max={max} />
        <OutcomeTile s={r.rise} max={max} />
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-2xs leading-5 text-subtle">
        <Tag kind="estimate" />
        {live
          ? 'نقطهٔ شروع از حساب واقعی شما؛ نتیجه پیش‌بینی همان سناریوی قیمت است، پس از بستن فرضی Short — نه سود تحقق‌یافته.'
          : 'نتیجهٔ سناریو با ورودی‌های شما، پس از بستن فرضی Short — نه سود تحقق‌یافته.'}
      </p>
    </Step>
  );
}

/** یک جملهٔ ساده برای اثر هج در این سناریو */
function verdict(s: HedgeScenario): { text: string; tone: 'gain' | 'loss' | 'neutral' } {
  const e = s.hedgeEffectNet;
  if (Math.abs(e) < 0.005) return { text: 'هج اثری ندارد', tone: 'neutral' };
  if (s.movePct < 0) return e > 0 ? { text: 'زیان کمتر با هج', tone: 'gain' } : { text: 'هزینهٔ هج بیشتر از پوشش', tone: 'loss' };
  return e < 0 ? { text: 'سود کمتر با هج', tone: 'loss' } : { text: 'فاندینگ بیشتر از سود ازدست‌رفته', tone: 'gain' };
}

function OutcomeTile({ s, max }: { s: HedgeScenario; max: number }) {
  const v = verdict(s);
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-card border border-divider bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">
          <ScenarioTitle s={s} />
        </h4>
        <Badge tone={v.tone}>{v.text}</Badge>
      </div>
      <div>
        <div className="text-2xl font-extrabold tracking-tight">
          <MoneyValue value={s.hedgeEffectNet} signed tone="auto" digits={2} />
        </div>
        <p className="text-2xs text-subtle">اثر خالص هج، پس از همهٔ هزینه‌ها، نسبت به بدون هج با همان سرمایه</p>
      </div>
      {s.totalEnd === null || s.unhedgedEnd === null ? (
        <p className="text-xs text-warn">سرمایهٔ نهایی نامشخص است؛ وثیقهٔ حساب فیوچرز را وارد کنید.</p>
      ) : (
        <dl className="space-y-2.5">
          {(
            [
              ['با هج', s.totalEnd, s.roiPct, 'accent'],
              ['بدون هج', s.unhedgedEnd, s.unhedgedRoiPct, 'gold']
            ] as const
          ).map(([label, value, roi, tone]) => (
            <div key={label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <dt className="text-muted">{label}</dt>
                <dd className="flex items-baseline gap-1.5 font-semibold text-ink">
                  <MoneyValue value={value} digits={2} />
                  <PercentValue value={roi} digits={2} className="text-2xs" />
                </dd>
              </div>
              <MagnitudeBar value={value} max={max} tone={tone} />
            </div>
          ))}
        </dl>
      )}
      {s.liquidated && <p className="text-2xs font-semibold text-negative">در این سناریو Short لیکویید می‌شود.</p>}
    </article>
  );
}

/* ---------------- ۲. منحنی ارزش پرتفوی ---------------- */

const PAYOFF_GRID = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

function Payoff({ input, r }: { input: HedgeInput; r: HedgeResult }) {
  const marks = [r.drop.movePct, r.rise.movePct];
  const points = useMemo(() => hedgePayoff(input, [...PAYOFF_GRID, ...marks]), [input, marks[0], marks[1]]);
  return (
    <Step n={2} id="hedge-payoff" title="در هر تغییر قیمت، پرتفوی چقدر می‌ارزد؟" sub="هر دو خط با همان سرمایهٔ اولیه شروع می‌کنند؛ فاصلهٔ آن‌ها همان اثر هج است.">
      {r.futuresCollateral === null ? (
        <p className="text-xs leading-6 text-warn">بدون وثیقهٔ حساب فیوچرز، ارزش کل پرتفوی معلوم نیست و منحنی رسم نمی‌شود.</p>
      ) : (
        <PayoffChart points={points} marks={marks} />
      )}
    </Step>
  );
}

/* ---------------- ۳. پرتفوی از چه ساخته شده؟ ---------------- */

function Composition({ r, sizing, live, exchangeLiq }: { r: HedgeResult; sizing: Sizing; live: ReadonlySet<LiveField>; exchangeLiq: boolean }) {
  const tagOf = (f: LiveField) => (live.has(f) ? <Tag kind="live" /> : null);
  const capital = r.totalStart;
  const covered = Math.min(r.shortNotional, r.spot);
  const uncovered = Math.max(0, r.spot - r.shortNotional);
  const share = (v: number, of: number | null) => (of && of > 0 ? (v / of) * 100 : null);
  const BarRow = ({ label, value, of, tag, textured }: { label: string; value: number; of: number; tag?: ReactNode; textured?: boolean }) => (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="inline-flex flex-wrap items-center gap-1.5 text-muted">
          {label}
          {tag}
        </span>
        <span className="flex items-baseline gap-1.5 font-semibold text-ink">
          <MoneyValue value={value} digits={2} />
          <span className="text-2xs font-normal text-subtle">{share(value, of) === null ? '' : fmtPct(share(value, of)!)}</span>
        </span>
      </div>
      <MagnitudeBar value={value} max={of} textured={textured} />
    </div>
  );
  return (
    <Step n={3} id="hedge-structure" title="پرتفوی از چه ساخته شده؟" sub="سرمایه یعنی پولی که کنار گذاشته‌اید؛ مواجهه یعنی چه مقدارش با قیمت بالا و پایین می‌رود. این دو یکی نیستند.">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-ink">سرمایه</h4>
          {capital === null ? (
            <p className="text-xs text-warn">وثیقهٔ حساب فیوچرز نامشخص است؛ سرمایهٔ کل حساب نمی‌شود.</p>
          ) : (
            <>
              <BarRow label="دارایی اسپات" value={r.spot} of={capital} tag={tagOf('spot')} />
              <BarRow label={live.has('collateral') ? 'ارزش خالص حساب فیوچرز' : 'وثیقهٔ حساب فیوچرز'} value={r.futuresCollateral ?? 0} of={capital} tag={tagOf('collateral')} />
              <BarRow label="وجه نقد مستقل" value={r.cash} of={capital} />
            </>
          )}
        </div>
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-ink">مواجهه با قیمت (از ارزش اسپات)</h4>
          <BarRow label="پوشش‌داده با Short" value={covered} of={r.spot} tag={sizing === 'usd' ? tagOf('short') : null} textured />
          <BarRow label="بی‌پوشش (مواجههٔ خالص)" value={uncovered} of={r.spot} />
          {r.shortNotional > r.spot && (
            <p className="text-2xs text-warn">
              Short به اندازهٔ <MoneyValue value={r.shortNotional - r.spot} digits={2} /> بزرگ‌تر از اسپات است؛ پرتفوی خالص Short است.
            </p>
          )}
        </div>
      </div>
      <KeyValueList
        dense
        rows={[
          { label: 'نسبت هج', hint: 'ارزش Short تقسیم بر ارزش اسپات', value: r.ratioPct === null ? '—' : fmtPct(r.ratioPct) },
          {
            label: (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                ارزش اسمی Short {sizing === 'usd' && tagOf('short')}
              </span>
            ),
            hint: 'اندازهٔ پوزیشن در بازار — پول پرداختی نیست',
            value: <MoneyValue value={r.shortNotional} digits={2} />
          },
          { label: 'اهرم مؤثر', hint: 'ارزش اسمی Short تقسیم بر وثیقه', value: r.effectiveLeverage === null ? <Unknown /> : `${toFaDigits(pctFmt.format(r.effectiveLeverage))}×` },
          { label: 'مواجههٔ ناخالص', hint: 'اسپات + Short — اندازهٔ کل در بازار، نه سرمایه', value: <MoneyValue value={r.grossExposure} digits={2} /> },
          {
            label: (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                هزینهٔ تخمینی استراتژی <Tag kind="estimate" />
              </span>
            ),
            hint: 'کارمزد + اسلیپیج + سایر − فاندینگ، بدون تغییر قیمت',
            value: <MoneyValue value={-r.baseCosts.total} signed tone="auto" digits={2} />
          },
          {
            label: (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {exchangeLiq ? 'حد لیکویید صرافی' : 'حد تقریبی صفر شدن وثیقه'} {exchangeLiq ? <Tag kind="live" /> : r.collateralWipeoutPct === null ? <Tag kind="unknown" /> : null}
              </span>
            ),
            hint: exchangeLiq ? 'از قیمت لیکویید گزارش‌شده، نسبت به مارک فعلی' : 'بدون هزینه و مارجین نگهداری؛ لیکویید واقعی زودتر است',
            value: r.collateralWipeoutPct === null ? <Unknown /> : <span className="whitespace-nowrap">رشد {fmtPct(r.collateralWipeoutPct)}</span>
          }
        ]}
      />
      <p className="text-2xs text-subtle">اعداد بدون برچسب، ورودی شما یا محاسبه از آن‌ها هستند.</p>
    </Step>
  );
}

/* ---------------- ۴. جزئیات هر سناریو ---------------- */

interface Row {
  label: ReactNode;
  hint?: string;
  cells: [ReactNode, ReactNode];
  emphasis?: boolean;
}

const money = (v: number | null) => (v === null ? <Unknown /> : <MoneyValue value={v} digits={2} />);
const pnl = (v: number | null) => (v === null ? <Unknown /> : <MoneyValue value={v} signed tone="auto" digits={2} />);
const cost = (v: number) => <MoneyValue value={v === 0 ? 0 : -v} tone={v > 0 ? 'loss' : 'none'} digits={2} />;
const pct = (v: number | null) => (v === null ? <Unknown /> : <PercentValue value={v} digits={2} />);
const both = (r: HedgeResult, f: (s: HedgeScenario) => ReactNode): [ReactNode, ReactNode] => [f(r.drop), f(r.rise)];

function DetailTable({ r }: { r: HedgeResult }) {
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'دارایی‌ها',
      rows: [
        { label: 'تغییر قیمت', cells: both(r, (s) => <PercentValue value={s.movePct} digits={1} />) },
        { label: 'ارزش نهایی اسپات', cells: both(r, (s) => money(s.spotEnd)) },
        { label: 'سود/زیان ناخالص Short', hint: '−ارزش اسمی × تغییر قیمت', cells: both(r, (s) => pnl(s.shortGross)) }
      ]
    },
    {
      title: 'هزینه‌ها و فاندینگ',
      rows: [
        { label: 'کارمزد ورود و خروج', cells: both(r, (s) => cost(s.fees)) },
        { label: 'فاندینگ', hint: 'مثبت = دریافتی', cells: both(r, (s) => pnl(s.funding)) },
        { label: 'اسلیپیج', cells: both(r, (s) => cost(s.slippage)) },
        { label: 'سایر هزینه‌ها', cells: both(r, (s) => cost(s.otherCosts)) }
      ]
    },
    {
      title: 'پس از بستن Short',
      rows: [
        {
          label: 'موجودی نهایی حساب فیوچرز',
          hint: 'وثیقه + سود/زیان Short + فاندینگ − هزینه‌ها',
          cells: both(r, (s) => (
            <>
              {money(s.futuresEnd)}
              {s.liquidated && <span className="block text-2xs font-semibold text-negative">لیکویید</span>}
            </>
          ))
        },
        { label: 'وجه نقد مستقل', cells: both(r, (s) => money(s.cashEnd)) },
        { label: 'سرمایهٔ نهایی کل', cells: both(r, (s) => money(s.totalEnd)), emphasis: true },
        { label: 'سود/زیان خالص کل', hint: 'سرمایهٔ نهایی − سرمایهٔ اولیه', cells: both(r, (s) => pnl(s.net)), emphasis: true },
        { label: 'بازده کل سرمایه', hint: 'نسبت به سرمایهٔ اولیهٔ کل', cells: both(r, (s) => pct(s.roiPct)) },
        { label: 'بازده پوزیشن Short', hint: 'نسبت به وثیقهٔ فیوچرز', cells: both(r, (s) => pct(s.shortRoePct)) }
      ]
    },
    {
      title: 'مقایسه با بدون هج (همان سرمایه)',
      rows: [
        { label: 'ارزش نهایی بدون هج', hint: 'اسپات + وثیقه به‌صورت نقد آزاد + وجه نقد', cells: both(r, (s) => money(s.unhedgedEnd)) },
        { label: 'اختلاف دلاری (اثر خالص هج)', hint: 'پس از همهٔ هزینه‌ها', cells: both(r, (s) => pnl(s.hedgeEffectNet)), emphasis: true },
        { label: 'اختلاف بازده', hint: 'واحد درصد؛ مبنای هر دو سرمایهٔ اولیهٔ کل', cells: both(r, (s) => pct(s.roiDiffPp)) },
        { label: 'اثر هج پیش از هزینه', hint: 'همان سود/زیان ناخالص Short', cells: both(r, (s) => pnl(s.hedgeEffectGross)) }
      ]
    }
  ];
  return (
    <Step n={4} id="hedge-scenarios" title="جزئیات هر سناریو" sub="هر عدد فقط یک بار حساب شده؛ ردیف‌های پررنگ نتیجهٔ نهایی‌اند.">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full table-fixed border-separate border-spacing-0 text-xs sm:text-sm">
          <caption className="sr-only">جزئیات سناریوهای رشد و ریزش</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[44%] pb-2 text-start text-2xs font-semibold text-subtle" />
              {[r.drop, r.rise].map((s) => (
                <th key={s.movePct} scope="col" className="pb-2 text-end text-xs font-bold text-ink">
                  <ScenarioTitle s={s} />
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th scope="colgroup" colSpan={3} className="pb-1 pt-4 text-start text-2xs font-bold text-subtle">
                  {g.title}
                </th>
              </tr>
              {g.rows.map((row, i) => (
                <tr key={i} className={row.emphasis ? 'bg-surface-2/60' : undefined}>
                  <th scope="row" className={cn('border-t border-divider py-2 pe-2 ps-1 text-start align-top font-normal', row.emphasis ? 'font-bold text-ink' : 'text-muted')}>
                    {row.label}
                    {row.hint && <span className="block text-2xs font-normal leading-5 text-subtle">{row.hint}</span>}
                  </th>
                  {row.cells.map((c, ci) => (
                    <td key={ci} className={cn('border-t border-divider py-2 pe-1 text-end align-top [overflow-wrap:anywhere]', row.emphasis ? 'font-bold text-ink' : 'font-semibold text-ink')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Step>
  );
}

/* ---------------- ۵. جزئیات محاسبات ---------------- */

function Details() {
  return (
    <Step n={5} id="hedge-details" title="فرمول‌ها، اصطلاحات و یک مثال">
      <Disclosure summary="فرمول‌ها و فرض‌ها">
        <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
          <li>ارزش نهایی اسپات = ارزش اسپات × (۱ + تغییر قیمت).</li>
          <li>سود/زیان ناخالص Short = −ارزش اسمی × تغییر قیمت (قرارداد خطی USDT-M، ارزش اسمی ثابت در ورود، قیمت مبنای یکسان).</li>
          <li>کارمزد: ورود روی ارزش اسمی، خروج روی ارزش اسمی × (۱ + تغییر قیمت). اسلیپیج روی همان دو معامله.</li>
          <li>فاندینگ = ارزش اسمی × نرخ ۸ ساعته × ۳ × روز؛ نرخ ثابت فرض شده و در واقعیت هر دوره عوض می‌شود.</li>
          <li>موجودی نهایی فیوچرز = وثیقه + سود/زیان Short + فاندینگ − کارمزد − اسلیپیج. اگر به صفر برسد، لیکویید و کل وثیقه از دست رفته فرض می‌شود.</li>
          <li>سرمایهٔ نهایی = اسپات نهایی + موجودی فیوچرز + وجه نقد − سایر هزینه‌ها؛ هر قلم فقط یک بار.</li>
          <li>مارجین نگهداری صرافی، کارمزد لیکویید و تغییر نرخ فاندینگ مدل نشده‌اند؛ کارمزد خرید اسپات هم نیست چون اسپات از قبل در اختیار شماست.</li>
        </ul>
      </Disclosure>
      <Disclosure summary="اصطلاحات">
        <ul className="list-disc space-y-1.5 ps-4 text-xs leading-6 text-muted">
          <li>
            <b className="text-ink">ارزش اسمی (Notional):</b> اندازهٔ پوزیشن Short در بازار؛ با اهرم می‌تواند بزرگ‌تر از وثیقه باشد.
          </li>
          <li>
            <b className="text-ink">وثیقه / مارجین:</b> پولی که در حساب فیوچرز پشتوانهٔ پوزیشن است؛ هزینه نیست و پس از بستن (با سود/زیان) برمی‌گردد.
          </li>
          <li>
            <b className="text-ink">مواجههٔ خالص:</b> اسپات منهای Short — بخشی از دارایی که هنوز با بازار بالا و پایین می‌رود.
          </li>
          <li>
            <b className="text-ink">فاندینگ (Funding):</b> پرداخت دوره‌ای بین Long و Short در قرارداد دائمی؛ نرخ مثبت یعنی Short دریافت می‌کند.
          </li>
          <li>
            <b className="text-ink">اسلیپیج (Slippage):</b> فاصلهٔ قیمت اجرای واقعی از قیمت مورد انتظار.
          </li>
        </ul>
      </Disclosure>
      <Disclosure summary="مثال: هج ۳۰٪ با اهرم ۱">
        <div className="space-y-2 text-xs leading-6 text-muted">
          <p>
            ۱۰۰۰ دلار اسپات دارید و ۳۰۰ دلار به حساب فیوچرز می‌برید و Short به ارزش ۳۰۰ دلار باز می‌کنید. سرمایهٔ اولیهٔ کل ۱۳۰۰ دلار است.
          </p>
          <p>
            ریزش ۲۵٪: اسپات ۷۵۰ و حساب فیوچرز ۳۷۵ دلار (۷۵ سود Short) — جمعاً ۱۱۲۵. بدون هج همان ۱۳۰۰ دلار می‌شد ۷۵۰ + ۳۰۰ = ۱۰۵۰؛ هج ۷۵ دلار کمتر زیان داده است.
          </p>
          <p>
            رشد ۱۸٪: اسپات ۱۱۸۰ و حساب فیوچرز ۲۴۶ — جمعاً ۱۴۲۶. بدون هج ۱۱۸۰ + ۳۰۰ = ۱۴۸۰؛ هج ۵۴ دلار از سود کم کرده است.
          </p>
          <div className="flex items-start gap-2 rounded-field border border-gold/30 bg-gold/10 p-3">
            <Lightbulb aria-hidden className="mt-1 h-4 w-4 shrink-0 text-gold-text" />
            <p className="font-semibold text-ink">هج نوسان را کم می‌کند، نه اینکه سود بسازد: در ریزش زیان کمتر، در رشد سود کمتر، به‌علاوهٔ هزینه‌ها.</p>
          </div>
        </div>
      </Disclosure>
    </Step>
  );
}
