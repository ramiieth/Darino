/**
 * میز معامله — سوینگ هوشمند (متصل به بازار)، کمیته ایجنت‌ها، ستاپ پایان ماه، تریدرها و مشتقات
 * فقط‌خواندنی: هیچ معامله، کلید خصوصی یا امضایی در کار نیست.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Bot, Calendar, Compass, Flame, ShieldCheck, Trophy } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { useAuth } from '@/features/auth/authClient';
import { isHlAddress } from '@/features/traders/domain/candidates';
import { useSavedTraders } from '@/features/traders/data/savedTraders';
import { useTradersList } from '@/features/traders/data/useTraders';
import { TradersTab } from '@/features/traders/presentation/TradersTab';
import { TraderReportSheet } from '@/features/traders/presentation/TraderReportSheet';
import { SwingTab } from './SwingTab';
import { PositionsTab } from './PositionsTab';
import { DerivativesTab } from './DerivativesTab';
import { MemesTab } from './MemesTab';
import { SafetyTab } from './SafetyTab';
import { TradingAgentsTab } from './TradingAgentsTab';
import { EomSetupTab } from './EomSetupTab';
import { CoinSheet } from './CoinSheet';
import { TokenSheet } from './TokenSheet';

type Tab = 'swing' | 'agents' | 'eom' | 'traders' | 'derivs' | 'memes';
const TABS: Tab[] = ['swing', 'agents', 'eom', 'traders', 'derivs', 'memes'];

export default function IntelHubPage() {
  const [params, setParams] = useSearchParams();
  // تب‌های قدیمی: «چک قبل از ورود» ← سوینگ، «پوزیشن برترها» ← تریدرها، «امنیت توکن» ← میم‌کوین
  const rawTab = params.get('tab');
  const mapped =
    rawTab === 'positions'
      ? 'traders'
      : rawTab === 'safety'
        ? 'memes'
        : rawTab === 'check'
          ? 'swing'
          : rawTab;
  const tab: Tab = mapped && (TABS as string[]).includes(mapped) ? (mapped as Tab) : 'swing';
  const traderView = rawTab === 'positions' || params.get('view') === 'consensus' ? 'consensus' : params.get('view') === 'mine' ? 'mine' : 'top';
  const memeView = rawTab === 'safety' || params.get('view') === 'safety' ? 'safety' : 'screen';
  const trader = params.get('a');
  const coin = params.get('coin');
  const token = params.get('token');
  const market = params.get('m') ?? 'BTC';
  const authStatus = useAuth((s) => s.status);
  const hydrate = useSavedTraders((s) => s.hydrate);
  const saved = useSavedTraders((s) => s.saved);
  const list = useTradersList();

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
      <PageHeader title="میز معامله" subtitle="پیشنهاد ورود سوینگ، کمیته ایجنت‌ها، ستاپ پایان ماه و رصد بازار" />
      <Tabs<Tab>
        className="mb-5"
        label="بخش‌های میز معامله"
        value={tab}
        onChange={(v) => update({ tab: v === 'swing' ? null : v, view: null })}
        options={[
          { value: 'swing', label: 'سوینگ', icon: <Compass /> },
          { value: 'agents', label: 'کمیته ایجنت‌ها', icon: <Bot /> },
          { value: 'eom', label: 'ستاپ پایان ماه', icon: <Calendar /> },
          { value: 'traders', label: 'تریدرها', icon: <Trophy /> },
          { value: 'derivs', label: 'مشتقات', icon: <Activity /> },
          { value: 'memes', label: 'میم‌کوین و امنیت', icon: <Flame /> }
        ]}
      />
      <div role="tabpanel">
        {tab === 'swing' && (
          <SwingTab
            onAnalyzeWithAgents={(c) => update({ tab: 'agents', view: null, m: c })}
            onOpenEom={() => update({ tab: 'eom', view: null })}
          />
        )}
        {tab === 'agents' && (
          <TradingAgentsTab
            market={market}
            onChangeMarket={(m) => update({ m })}
            onSelectCoin={(c) => update({ coin: c })}
          />
        )}
        {tab === 'eom' && <EomSetupTab />}
        {tab === 'traders' && (
          <TradersTab
            view={traderView}
            onView={(v) => update({ tab: 'traders', view: v === 'top' ? null : v })}
            onOpen={(a) => update({ a })}
            consensus={<PositionsTab onCoin={(c) => update({ coin: c })} />}
          />
        )}
        {tab === 'derivs' && <DerivativesTab onCoin={(c) => update({ coin: c })} />}
        {tab === 'memes' && (
          <div className="space-y-4">
            <SegmentedControl<'screen' | 'safety'>
              label="میم‌کوین یا امنیت توکن"
              value={memeView}
              onChange={(v) => update({ tab: 'memes', view: v === 'screen' ? null : v })}
              options={[
                { value: 'screen', label: 'غربال میم‌کوین', icon: <Flame /> },
                { value: 'safety', label: 'امنیت یک توکن', icon: <ShieldCheck /> }
              ]}
            />
            {memeView === 'safety' ? <SafetyTab /> : <MemesTab onToken={(t) => update({ token: t })} />}
          </div>
        )}
      </div>

      <TraderReportSheet address={trader && isHlAddress(trader) ? trader : null} name={traderName} onClose={() => update({ a: null })} />
      <CoinSheet coin={coin && /^[A-Za-z0-9:_-]{1,30}$/.test(coin) ? coin : null} onClose={() => update({ coin: null })} onTrader={(a) => update({ coin: null, a })} />
      <TokenSheet address={token && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token) ? token : null} onClose={() => update({ token: null })} />
    </Page>
  );
}
