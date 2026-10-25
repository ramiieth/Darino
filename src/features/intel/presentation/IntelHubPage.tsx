/**
 * هاب اطلاعات — یک جا برای تصمیم‌های معاملاتی، بدون شلوغی:
 *   تریدرهای برتر (کارنامه، دنبال کردن) · پوزیشن برترها · بازار مشتقات · میم‌کوین · امنیت توکن
 * همهٔ حالت‌ها در URL (?tab= ، ?a= ، ?coin= ، ?token=) تا لینک و دکمهٔ برگشت PWA درست کار کند.
 * فقط‌خواندنی: هیچ معامله، کلید خصوصی یا امضایی در کار نیست.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Flame, Layers, ShieldCheck, Trophy } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { useAuth } from '@/features/auth/authClient';
import { isHlAddress } from '@/features/traders/domain/candidates';
import { useSavedTraders } from '@/features/traders/data/savedTraders';
import { useTradersList } from '@/features/traders/data/useTraders';
import { TradersTab } from '@/features/traders/presentation/TradersTab';
import { TraderReportSheet } from '@/features/traders/presentation/TraderReportSheet';
import { PositionsTab } from './PositionsTab';
import { DerivativesTab } from './DerivativesTab';
import { MemesTab } from './MemesTab';
import { SafetyTab } from './SafetyTab';
import { CoinSheet } from './CoinSheet';
import { TokenSheet } from './TokenSheet';

type Tab = 'traders' | 'positions' | 'derivs' | 'memes' | 'safety';
const TABS: Tab[] = ['traders', 'positions', 'derivs', 'memes', 'safety'];

const INTRO: Record<Tab, string> = {
  traders: 'کارنامهٔ برترین تریدرهای هایپرلیکوئید: سود، ثبات ماهانه، افت و نرخ برد. هر کدام را دنبال کنید تا باز و بسته کردن پوزیشن‌هایش را اعلان بگیرید.',
  positions: 'برترین‌های هایپرلیکوئید همین الان روی هر دارایی چه پوزیشنی دارند، با میانگین ورود و قیمت‌های لیکوئید.',
  derivs: 'فاندینگ، OI و حجم بازارهای پرپ هایپرلیکوئید و این‌که فاندینگ امروز نسبت به ماه گذشته داغ است یا نه.',
  memes: 'داغ‌ترین و تازه‌ترین میم‌کوین‌های سولانا با حکم امنیت برای هر کدام.',
  safety: 'قبل از خرید هر توکن: هانی‌پات، مالیات، مینت، فریز، تمرکز هولدرها و نقدینگی.'
};

export default function IntelHubPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'traders';
  const trader = params.get('a');
  const coin = params.get('coin');
  const token = params.get('token');
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
        onChange={(v) => update({ tab: v === 'traders' ? null : v, view: null })}
        options={[
          { value: 'traders', label: 'تریدرهای برتر', icon: <Trophy /> },
          { value: 'positions', label: 'پوزیشن برترها', icon: <Layers /> },
          { value: 'derivs', label: 'بازار مشتقات', icon: <Activity /> },
          { value: 'memes', label: 'میم‌کوین', icon: <Flame /> },
          { value: 'safety', label: 'امنیت توکن', icon: <ShieldCheck /> }
        ]}
      />
      <div role="tabpanel">
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
