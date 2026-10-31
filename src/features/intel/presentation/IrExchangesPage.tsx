/**
 * صفحهٔ «صرافی‌های ایران» — یک ارز کجا ارزان‌تر خریده و کجا گران‌تر فروخته می‌شود:
 *   ۱) کارت خلاصه: ارزان‌ترین خرید، بهترین فروش، فاصلهٔ صرافی‌ها و آربیتراژ ناخالص
 *   ۲) فهرست صرافی‌ها: خرید، فروش و اسپرد هر کدام (ارزان‌ترین خرید اول)
 * دادهٔ /api/intel?op=irx؛ ارز انتخابی در ?coin= می‌ماند.
 */
import { ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { COIN_FA, EXCHANGE_FA, IRX_COINS, irxSummary, type IrxCoin, type IrxPayload, type IrxSummary } from '../domain/irExchanges';
import { useIrExchanges } from '../data/intelApi';

const pct = (v: number, digits = 2) => `${toFaDigits((v * 100).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }))}٪`;
/** تتر و ارزهای ارزان با تومان کامل، بیت‌کوین و اتریوم به میلیون */
const toman = (v: number) =>
  v >= 1e8
    ? `${toFaDigits((v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }))} میلیون`
    : toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 }));

export default function IrExchangesPage() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get('coin') ?? 'USDT').toUpperCase();
  const coin: IrxCoin = (IRX_COINS as readonly string[]).includes(raw) ? (raw as IrxCoin) : 'USDT';
  const q = useIrExchanges(coin);
  return (
    <Page>
      <PageHeader
        eyebrow="نوبیتکس · والکس · بیت‌پین · رمزینکس · تبدیل · اکسیر · بیت۲۴ · آبان تتر · …"
        title="صرافی‌های ایران"
        meta={<p className="max-w-3xl text-sm leading-7 text-muted">هر ارز را کجا ارزان‌تر بخرید و کجا گران‌تر بفروشید: بهترین قیمت خرید و فروش و اسپرد در ۱۱ صرافی ایرانی، هر ۳۰ ثانیه.</p>}
      />
      <div className="space-y-6">
        <ChipGroup
          label="ارز"
          bleed
          options={IRX_COINS.map((c) => ({ value: c, label: COIN_FA[c] }))}
          value={coin}
          onChange={(c) => setParams((p) => { p.set('coin', c); return p; }, { replace: true })}
        />
        {q.isLoading ? (
          <ListSkeleton rows={6} />
        ) : q.isError || !q.data ? (
          <ErrorState message="قیمت صرافی‌ها دریافت نشد" onRetry={() => void q.refetch()} />
        ) : (
          <Content d={q.data} />
        )}
      </div>
    </Page>
  );
}

function Content({ d }: { d: IrxPayload }) {
  const s = irxSummary(d.rows);
  return (
    <>
      {s && <SummaryCard d={d} s={s} />}
      <Exchanges d={d} s={s} />
      <Notice tone="neutral">
        کارمزد معامله (معمولاً ۰.۱ تا ۰.۳۵٪) و کارمزد برداشت در قیمت‌ها نیست. قیمت‌ها بهترین سفارش دفتر است؛ خرید بزرگ پله‌های بعدی را هم می‌خورد و گران‌تر تمام می‌شود.
      </Notice>
      <Disclosure summary="روش محاسبه و منبع">
        <ul className="list-disc space-y-1.5 ps-5 text-xs leading-6 text-muted">
          <li>«خرید» قیمتی است که شما می‌خرید (ارزان‌ترین پیشنهاد فروش) و «فروش» قیمتی که می‌فروشید (گران‌ترین پیشنهاد خرید). اسپرد = فاصلهٔ این دو ÷ میانه‌شان.</li>
          <li>آبان تتر، اوکی اکسچنج و تترلند دفتر سفارش ندارند و خودشان قیمت می‌دهند. تترلند یک قیمت برای خرید و فروش دارد و هزینه‌اش در کارمزد است.</li>
          <li>صرافی‌ای که قیمتش بیش از ۲۰٪ با میانهٔ بقیه فرق کند کنار می‌رود (واحد اشتباه یا بازار بی‌معامله).</li>
          <li>آربیتراژ ناخالص است: کارمزد دو معامله، کارمزد و زمان انتقال بین صرافی‌ها و عمق دفتر در آن حساب نشده است.</li>
          <li>نشانی‌ها از پروژهٔ متن‌باز iran-crypto-mcp سپهر رادمرد (github.com/sepehr071). توصیهٔ مالی نیست.</li>
        </ul>
      </Disclosure>
    </>
  );
}

function SummaryCard({ d, s }: { d: IrxPayload; s: IrxSummary }) {
  const name = (r: { exchange: keyof typeof EXCHANGE_FA }) => EXCHANGE_FA[r.exchange].name;
  return (
    <Surface variant="focal" className="border-2 border-gain/50 p-5">
      <h3 className="text-lg font-extrabold text-ink">
        {COIN_FA[d.coin]} را ارزان‌تر از {name(s.cheapest)} بخرید
      </h3>
      <p className="mt-1.5 text-sm leading-7 text-muted">
        فروش با بهترین قیمت در {name(s.bestSell)}. ارزان‌ترین و گران‌ترین خرید {pct(s.gap)} با هم فاصله دارند.
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-divider pt-4 sm:gap-4">
        <div>
          <dt className="text-2xs font-semibold text-muted">ارزان‌ترین خرید</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{toman(s.cheapest.ask)}</dd>
          <dd className="text-2xs text-subtle">تومان · {name(s.cheapest)}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">بهترین فروش</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{toman(s.bestSell.bid)}</dd>
          <dd className="text-2xs text-subtle">تومان · {name(s.bestSell)}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold text-muted">اسپرد {name(s.cheapest)}</dt>
          <dd className="mt-1 text-lg font-extrabold text-ink sm:text-xl">{pct(s.cheapest.spread)}</dd>
          <dd className="text-2xs text-subtle">فاصلهٔ خرید و فروش</dd>
        </div>
      </dl>
      {s.arbitrage && (
        <p className="mt-4 border-t border-divider pt-3 text-xs leading-6 text-muted">
          خرید از {name(s.arbitrage.buy)} و فروش در {name(s.arbitrage.sell)}: <span className="font-bold text-positive">{pct(s.arbitrage.gross)}</span> ناخالص، پیش از کارمزد دو معامله و انتقال.
        </p>
      )}
      <p className="mt-3 text-2xs text-subtle">به‌روز {fmtRelativeAge(d.fetchedAt)}</p>
    </Surface>
  );
}

function Exchanges({ d, s }: { d: IrxPayload; s: IrxSummary | null }) {
  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">{COIN_FA[d.coin]} به تومان، ارزان‌ترین خرید اول</h3>
      <ul className="mt-2 divide-y divide-divider">
        {d.rows.map((r) => {
          const ex = EXCHANGE_FA[r.exchange];
          return (
            <li key={r.exchange} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-bold text-ink">
                  {ex.name}
                  {s?.cheapest.exchange === r.exchange && <Badge tone="gain">ارزان‌ترین خرید</Badge>}
                  {s?.bestSell.exchange === r.exchange && d.rows.length > 1 && <Badge tone="info">بهترین فروش</Badge>}
                  {ex.kind === 'broker' && <Badge tone="neutral">قیمت‌گذار</Badge>}
                </p>
                <p className="text-2xs text-muted">
                  خرید {toman(r.ask)} · فروش {toman(r.bid)}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold text-ink">{r.ask === r.bid ? '—' : pct(r.spread)}</p>
                <p className="text-2xs text-subtle">اسپرد</p>
              </div>
              <a href={ex.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-subtle hover:text-brand" aria-label={`باز کردن ${ex.name}`}>
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
      {d.missing.length > 0 && (
        <p className="mt-2 text-2xs text-subtle">جواب نداد یا {COIN_FA[d.coin]} ندارد: {d.missing.map((e) => EXCHANGE_FA[e].name).join('، ')}</p>
      )}
    </Surface>
  );
}
