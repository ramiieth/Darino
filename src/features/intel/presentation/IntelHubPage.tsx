/**
 * هاب اطلاعات — یک جا برای تصمیم‌های معاملاتی، بدون شلوغی:
 *   چک قبل از ورود (حکم اهرم) · تریدرهای برتر (امتیاز ثبات، دنبال کردن) · پوزیشن برترها (اجماع) · بازار مشتقات (ازدحام فاندینگ) · میم‌کوین · امنیت توکن
 * همهٔ حالت‌ها در URL (?tab= ، ?a= ، ?coin= ، ?token=) تا لینک و دکمهٔ برگشت PWA درست کار کند.
 * فقط‌خواندنی: هیچ معامله، کلید خصوصی یا امضایی در کار نیست.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Compass, Flame, Gauge, Layers, ShieldCheck, Trophy } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { useAuth } from '@/features/auth/authClient';
import { isHlAddress } from '@/features/traders/domain/candidates';
import { useSavedTraders } from '@/features/traders/data/savedTraders';
import { useTradersList } from '@/features/traders/data/useTraders';
import { TradersTab } from '@/features/traders/presentation/TradersTab';
import { TraderReportSheet } from '@/features/traders/presentation/TraderReportSheet';
import { CheckTab } from './CheckTab';
import { SwingTab } from './SwingTab';
import { PositionsTab } from './PositionsTab';
import { DerivativesTab } from './DerivativesTab';
import { MemesTab } from './MemesTab';
import { SafetyTab } from './SafetyTab';
import { CoinSheet } from './CoinSheet';
import { TokenSheet } from './TokenSheet';

type Tab = 'check' | 'swing' | 'traders' | 'positions' | 'derivs' | 'memes' | 'safety';
const TABS: Tab[] = ['check', 'swing', 'traders', 'positions', 'derivs', 'memes', 'safety'];

const INTRO: Record<Tab, string> = {
  check: 'بازار، جهت و اهرم را بدهید تا بدانید در شرایط عادی و در یک آبشار مثل بدترین روز همین بازار چه می‌شود، و چه اهرمی معقول است. جهت قیمت را پیش‌بینی نمی‌کند.',
  swing: 'برای معاملهٔ چندروزه تا یک‌ماهه: بازار الان صعودی است یا نه، و با سرمایه و ریسک شما هر پوزیشن چقدر باید باشد. از آزمون سه سال پرپ‌های هایپرلیکوئید و ۱۶ سال سهام و کامودیتی؛ سیگنال خرید نمی‌دهد.',
  traders: 'تریدرهای هایپرلیکوئید که در ماه‌های متوالی سود کرده‌اند و افتشان کنترل‌شده است، همراه با پوزیشن‌هایی که الان دارند. هر کدام را دنبال کنید تا باز و بسته شدن پوزیشن‌هایش را اعلان بگیرید.',
  positions: 'برترها روی کدام بازار هم‌نظرند، ثابت‌قدم‌ها هم همین را می‌گویند یا نه، و طرف غالب الان در سود است یا زیان.',
  derivs: 'کجا لانگ‌ها یا شورت‌ها شلوغ‌اند و برای پوزیشن جهت‌دار یا درآمد دلتا نوترال شما چه معنایی دارد.',
  memes: 'میم‌کوین‌های سولانا با فیلترهای آزموده روی یک سال داده: رژیم بازار، بقا، روند، ضد نقدینگی خروج و امنیت، به‌اضافهٔ فهرست انتظار با اعلان. یا حالت «بلیت بخت‌آزمایی» با سقف بودجه.',
  safety: 'قبل از خرید هر توکن: هانی‌پات، مالیات، مینت، فریز، تمرکز هولدرها و نقدینگی.'
};

export default function IntelHubPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'check';
  const trader = params.get('a');
  const coin = params.get('coin');
  const token = params.get('token');
  const market = params.get('m') ?? 'BTC';
  const side = params.get('side') === 'short' ? 'short' : 'long';
  const lev = Number(params.get('lev')) || 10;
  const authStatus = useAuth((s) => s.status);
  const hydrate = useSavedTraders((s) => s.hydrate);
  const saved = useSavedTraders((s) => s.saved);
  const list = useTradersList();

  // همگام‌سازی «آدرس‌های من» با حساب: هنگام ورود و هر بار که اپ دوباره دیده می‌شود (گوشی ↔ کامپیوتر)
  useEffect(() => {
    if (authStatus === 'unknown') return;
    const run = () => void hydrate(authStatus === 'authenticated');
    run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [authStatus, hydrate]);

  const update = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
      return next;
    });
  const traderName = trader ? list.data?.candidates.find((c) => c.address === trader)?.displayName ?? saved.find((s) => s.address === trader)?.label ?? null : null;

  return (
    <Page>
      <PageHeader eyebrow="هایپرلیکوئید · سولانا" title="هاب اطلاعات" meta={<p className="max-w-3xl text-sm leading-7 text-muted">{INTRO[tab]}</p>} />
      <Tabs<Tab>
        className="mb-6"
        label="بخش‌های هاب"
        value={tab}
        onChange={(v) => update({ tab: v === 'check' ? null : v, view: null })}
        options={[
          { value: 'check', label: 'چک قبل از ورود', icon: <Gauge /> },
          { value: 'swing', label: 'سوینگ', icon: <Compass /> },
          { value: 'traders', label: 'تریدرهای برتر', icon: <Trophy /> },
          { value: 'positions', label: 'پوزیشن برترها', icon: <Layers /> },
          { value: 'derivs', label: 'بازار مشتقات', icon: <Activity /> },
          { value: 'memes', label: 'میم‌کوین', icon: <Flame /> },
          { value: 'safety', label: 'امنیت توکن', icon: <ShieldCheck /> }
        ]}
      />
      <div role="tabpanel">
        {tab === 'check' && (
          <CheckTab
            market={market}
            side={side}
            leverage={lev}
            onChange={(p) => update({ ...(p.m ? { m: p.m } : {}), ...(p.side ? { side: p.side } : {}), ...(p.lev ? { lev: String(p.lev) } : {}) })}
            onCoin={(c) => update({ coin: c })}
          />
        )}
        {tab === 'swing' && <SwingTab onCheck={(c) => update({ tab: null, view: null, m: c })} />}
        {tab === 'traders' && (
          <TradersTab view={params.get('view') === 'mine' ? 'mine' : 'top'} onView={(v) => update({ view: v === 'top' ? null : v })} onOpen={(a) => update({ a })} />
        )}
        {tab === 'positions' && <PositionsTab onCoin={(c) => update({ coin: c })} />}
        {tab === 'derivs' && <DerivativesTab onCoin={(c) => update({ coin: c })} />}
        {tab === 'memes' && <MemesTab onToken={(t) => update({ token: t })} />}
        {tab === 'safety' && <SafetyTab />}
      </div>

      <TraderReportSheet address={trader && isHlAddress(trader) ? trader : null} name={traderName} onClose={() => update({ a: null })} />
      <CoinSheet coin={coin && /^[A-Za-z0-9:_-]{1,30}$/.test(coin) ? coin : null} onClose={() => update({ coin: null })} onTrader={(a) => update({ coin: null, a })} />
      <TokenSheet address={token && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token) ? token : null} onClose={() => update({ token: null })} />
    </Page>
  );
}
