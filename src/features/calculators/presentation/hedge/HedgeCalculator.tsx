/**
 * ⑦ Hedge — اسپات + Short مخالف در فیوچرز (Hedge Mode، بدون اهرم)
 * MARKET → INPUTS → TWO SCENARIOS (ریزش · رشد) → INSIGHT → EDUCATION
 * تک‌ستونه (حداکثر ۵۲۰px، وسط‌چین). همهٔ محاسبات در domain (calcHedge)؛ بدون درخواست شبکه.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { usePublishInsight } from '@/shared/assistant/insights';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { calcHedge, toNumber, type Coin, type ScenarioResult } from '@/features/calculators/domain';
import { HEDGE_COINS, DEFAULT_HEDGE_COIN } from '@/features/calculators/data/hedgeCoins';
import { CoinLogo, CoinPicker } from './CoinPicker';

const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const fmtRatio = (v: number) => `${toFaDigits(pctFmt.format(v))}٪`;

export function HedgeCalculator() {
  const [coin, setCoin] = useState<Coin>(DEFAULT_HEDGE_COIN);
  const [spot, setSpot] = useState('1000');
  const [short, setShort] = useState('300');
  const [drop, setDrop] = useState('25');
  const [rise, setRise] = useState('18');
  const [fee, setFee] = useState('0');

  const result = useMemo(
    () =>
      calcHedge({
        spot: toNumber(spot),
        short: toNumber(short),
        dropPct: toNumber(drop),
        risePct: toNumber(rise),
        fee: toNumber(fee)
      }),
    [spot, short, drop, rise, fee]
  );

  usePublishInsight('calculatorHedge', `هج ${coin.name}`, {
    hedgeRatioPct: result.ratioPct,
    dropTotal: result.drop.total,
    dropDiff: result.drop.diff,
    riseTotal: result.rise.total,
    riseDiff: result.rise.diff
  });

  const ratio = fmtRatio(result.ratioPct);
  const num = (value: string, set: (v: string) => void, suffix: string) => ({
    dir: 'ltr' as const,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    className: 'text-left',
    value,
    suffix,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value)
  });

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-5 pb-[env(safe-area-inset-bottom,0px)]">
      <h2 className="text-base font-bold text-ink md:text-lg">هج با پوزیشن مخالف در فیوچرز (Hedge Mode)</h2>

      {/* ۱. انتخاب بازار */}
      <Surface as="section" aria-labelledby="hedge-market" className="space-y-3 p-4 md:p-5">
        <h3 id="hedge-market" className="text-sm font-bold text-ink">
          انتخاب بازار
        </h3>
        <CoinPicker coins={HEDGE_COINS} value={coin} onChange={setCoin} />
      </Surface>

      {/* ۲. ورودی‌ها */}
      <Surface as="section" aria-label="ورودی‌ها" className="space-y-5 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <span className="rounded-full p-0.5" style={{ boxShadow: `0 0 0 2px ${coin.color}40` }}>
            <CoinLogo coin={coin} size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-ink">{coin.name}</p>
            <p className="text-xs text-muted">
              جفت‌ارز{' '}
              <bdi dir="ltr" className="font-latin font-semibold text-ink">
                {coin.symbol}/USDT
              </bdi>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="ارزش دارایی در اسپات (دلار)">
            <Input {...num(spot, setSpot, 'دلار')} />
          </Field>
          <Field
            label="ارزش پوزیشن Short در فیوچرز (دلار)"
            labelAside={
              <Badge tone="neutral">
                نسبت هج <span className="font-bold text-ink">{ratio}</span>
              </Badge>
            }
          >
            <Input {...num(short, setShort, 'دلار')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ریزش بازار (٪)">
              <Input {...num(drop, setDrop, '٪')} />
            </Field>
            <Field label="رشد بازار (٪)">
              <Input {...num(rise, setRise, '٪')} />
            </Field>
          </div>
          <Field label="کارمزد و فاندینگ‌ریت تخمینی (دلار، اختیاری)">
            <Input {...num(fee, setFee, 'دلار')} placeholder="0" />
          </Field>
        </div>
      </Surface>

      {/* ۳. نتایج */}
      <section aria-label="نتیجه" aria-live="polite" className="space-y-4">
        <ScenarioCard
          title={`ریزش ${fmtRatio(toNumber(drop))}`}
          icon={<TrendingDown aria-hidden className="h-4 w-4 text-negative" />}
          r={result.drop}
        />
        <ScenarioCard
          title={`رشد ${fmtRatio(toNumber(rise))}`}
          icon={<TrendingUp aria-hidden className="h-4 w-4 text-positive" />}
          r={result.rise}
        />
        <p className="px-1 text-sm leading-7 text-muted">
          با هج {ratio}، در صعود سودت کمی کمتر می‌شه ولی در اصلاح، ریسکت کم‌تر و قدرت خریدت بیشتره. هج برای کاهش
          ریسکه، نه سود تضمینی.
        </p>
      </section>

      {/* ۴. متن آموزشی */}
      <Surface as="article" aria-labelledby="hedge-guide" className="space-y-4 p-4 text-sm leading-7 text-ink md:p-5">
        <h3 id="hedge-guide" className="font-bold">
          یک روش ساده و کاربردی هج در کریپتو: هج با پوزیشن مخالف در فیوچرز (Hedge Mode)
        </h3>
        <p>در اسپات، ۱۰۰۰ دلار بیت‌کوین داری. در فیوچرز، یک پوزیشن Short به ارزش ۳۰۰ دلار باز می‌کنی.</p>
        <p>اگر بازار ۲۵٪ ریزش کنه، ۷۵۰ دلار بیت‌کوین داری و ۳۷۵ دلار پوزیشن شورت که مجموعاً ۱۱۲۵ دلار دارایی داری.</p>
        <p>
          اگر بازار ۱۸٪ رشد کنه، ۱۱۸۰ دلار بیت‌کوین داری و ۲۴۶ دلار پوزیشن شورت داری که مجموعاً ۱۴۲۶ دلار دارایی داری.
        </p>
        <p>
          در واقع تو سود خودت در جهت صعود رو یکم کمتر می‌کنی ولی ریسک خودت رو هم کم می‌کنی که وقتی اصلاح می‌کنه اونوقت
          قدرت خریدت نسبت به دیگران ۱۵ الی ۲۰ درصد افزایش پیدا می‌کنه.
        </p>
        <div>
          <p className="font-bold">نکات مهم:</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 marker:text-subtle">
            <li>با هج ۳۰٪، فقط بخشی از ریسک رو پوشش میدی.</li>
            <li>اهرم پایین یا بدون اهرم استفاده کن تا ریسک لیکوییدشدن کمتر بشه.</li>
            <li>کارمزد، فاندینگ‌ریت و اندازه واقعی پوزیشن رو در نظر بگیر.</li>
          </ul>
        </div>
        <div className="flex items-start gap-2.5 rounded-card border border-gold/30 bg-gold/10 p-4">
          <Lightbulb aria-hidden className="mt-1 h-4 w-4 shrink-0 text-gold-text" />
          <p className="font-semibold">
            <span className="text-gold-text">نکته طلایی:</span> هج برای کاهش ریسکه، نه سود تضمینی.
          </p>
        </div>
      </Surface>
    </div>
  );
}

function ScenarioCard({ title, icon, r }: { title: string; icon: ReactNode; r: ScenarioResult }) {
  const tone = r.diff > 0 ? 'text-positive' : r.diff < 0 ? 'text-negative' : 'text-ink';
  return (
    <Surface variant="focal" as="article" className="p-4 md:p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
        {icon}
        {title}
      </h3>
      <KeyValueList
        rows={[
          { label: 'ارزش ارز در اسپات', value: <MoneyValue value={r.spotValue} /> },
          { label: 'پوزیشن Short', value: <MoneyValue value={r.shortValue} /> },
          ...(r.fee > 0
            ? [{ label: 'کارمزد و فاندینگ', value: <MoneyValue value={-r.fee} className="text-negative" /> }]
            : []),
          { label: 'مجموع دارایی', value: <MoneyValue value={r.total} />, emphasis: true },
          { label: 'بدون هج', value: <MoneyValue value={r.unhedged} className="text-muted" /> },
          {
            label: 'تفاوت نسبت به بدون هج',
            value: (
              <span className={cn('inline-flex flex-wrap items-baseline justify-end gap-x-2', tone)}>
                <MoneyValue value={r.diff} signed tone="auto" />
                <PercentValue value={r.diffPct} tone="auto" className="text-xs" />
              </span>
            )
          }
        ]}
      />
    </Surface>
  );
}
